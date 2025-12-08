// =================================
// POST SERVICE
// =================================

import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { EventBus, EventType } from '@textmesh/event-bus';
import { Logger } from '@textmesh/logger';
import {
  ErrorCode,
  AppError,
  PostWithDetails,
  PaginatedResponse,
  POST_MAX_LENGTH,
  POST_EDIT_WINDOW_MINUTES,
  HashtagTrend,
} from '@textmesh/shared-types';
import { CacheKeys, CacheManager } from '@textmesh/db-client';

interface CreatePostInput {
  content: string;
  visibility?: 'PUBLIC' | 'FOLLOWERS' | 'GROUP';
  groupId?: string;
  parentId?: string;
  repostId?: string;
}

export class PostService {
  private cache: CacheManager;

  constructor(
    private prisma: PrismaClient,
    private redis: Redis,
    private eventBus: EventBus,
    private logger: Logger
  ) {
    this.cache = new CacheManager(redis, 60);
  }

  async createPost(userId: string, input: CreatePostInput): Promise<PostWithDetails> {
    // Validate content length
    if (input.content.length > POST_MAX_LENGTH) {
      throw new AppError(ErrorCode.POST_TOO_LONG, `Post cannot exceed ${POST_MAX_LENGTH} characters`, 400);
    }

    // Validate group post
    if (input.visibility === 'GROUP' && !input.groupId) {
      throw new AppError(ErrorCode.POST_VISIBILITY_ERROR, 'Group ID required for group posts', 400);
    }

    // Validate parent exists for replies
    if (input.parentId) {
      const parent = await this.prisma.post.findUnique({
        where: { id: input.parentId },
        select: { id: true, isDeleted: true },
      });
      if (!parent || parent.isDeleted) {
        throw new AppError(ErrorCode.PARENT_POST_NOT_FOUND, 'Parent post not found', 404);
      }
    }

    // Validate repost exists
    if (input.repostId) {
      const original = await this.prisma.post.findUnique({
        where: { id: input.repostId },
        select: { id: true, isDeleted: true, userId: true },
      });
      if (!original || original.isDeleted) {
        throw new AppError(ErrorCode.POST_NOT_FOUND, 'Original post not found', 404);
      }
    }

    // Extract hashtags and mentions
    const hashtags = this.extractHashtags(input.content);
    const mentions = this.extractMentions(input.content);

    // Create post
    const post = await this.prisma.post.create({
      data: {
        userId,
        content: input.content,
        visibility: input.visibility || 'PUBLIC',
        groupId: input.groupId,
        parentId: input.parentId,
        repostId: input.repostId,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            isVerified: true,
          },
        },
        group: input.groupId ? {
          select: { id: true, name: true, slug: true },
        } : false,
      },
    });

    // Create hashtag associations
    if (hashtags.length > 0) {
      await this.createHashtagAssociations(post.id, hashtags);
    }

    // Create mention associations
    if (mentions.length > 0) {
      await this.createMentionAssociations(post.id, mentions);
    }

    // Update counts
    await this.prisma.user.update({
      where: { id: userId },
      data: { postCount: { increment: 1 } },
    });

    if (input.parentId) {
      await this.prisma.post.update({
        where: { id: input.parentId },
        data: { replyCount: { increment: 1 } },
      });
    }

    if (input.repostId) {
      await this.prisma.post.update({
        where: { id: input.repostId },
        data: { repostCount: { increment: 1 } },
      });
    }

    if (input.groupId) {
      await this.prisma.group.update({
        where: { id: input.groupId },
        data: { postCount: { increment: 1 } },
      });
    }

    // Publish event
    await this.eventBus.publish(EventType.POST_CREATED, {
      postId: post.id,
      userId,
      content: post.content,
      visibility: post.visibility,
      groupId: post.groupId,
      parentId: post.parentId,
      mentions,
      hashtags,
    });

    this.logger.info('Post created', { postId: post.id, userId });

    return this.toPostWithDetails(post);
  }

  async getPostById(id: string, viewerId?: string): Promise<PostWithDetails> {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            isVerified: true,
            isPrivate: true,
          },
        },
        group: {
          select: { id: true, name: true, slug: true },
        },
        parent: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true,
                isVerified: true,
              },
            },
          },
        },
        repost: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true,
                isVerified: true,
              },
            },
          },
        },
      },
    });

    if (!post || post.isDeleted) {
      throw new AppError(ErrorCode.POST_NOT_FOUND, 'Post not found', 404);
    }

    // Check visibility
    if (post.visibility === 'FOLLOWERS' && viewerId !== post.userId) {
      const isFollowing = await this.prisma.follow.findUnique({
        where: {
          followerId_followeeId: { followerId: viewerId || '', followeeId: post.userId },
        },
      });
      if (!isFollowing) {
        throw new AppError(ErrorCode.POST_NOT_FOUND, 'Post not found', 404);
      }
    }

    const result = this.toPostWithDetails(post);

    // Add viewer context
    if (viewerId) {
      const [isLiked, isReposted, isBookmarked] = await Promise.all([
        this.prisma.postLike.findUnique({
          where: { userId_postId: { userId: viewerId, postId: id } },
        }),
        this.prisma.post.findFirst({
          where: { userId: viewerId, repostId: id },
        }),
        this.prisma.postBookmark.findUnique({
          where: { userId_postId: { userId: viewerId, postId: id } },
        }),
      ]);

      result.isLiked = !!isLiked;
      result.isReposted = !!isReposted;
      result.isBookmarked = !!isBookmarked;
    }

    return result;
  }

  async updatePost(id: string, userId: string, content: string): Promise<PostWithDetails> {
    const post = await this.prisma.post.findUnique({
      where: { id },
      select: { userId: true, repostId: true, createdAt: true, isDeleted: true },
    });

    if (!post || post.isDeleted) {
      throw new AppError(ErrorCode.POST_NOT_FOUND, 'Post not found', 404);
    }

    if (post.userId !== userId) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Not authorized to edit this post', 403);
    }

    if (post.repostId) {
      throw new AppError(ErrorCode.CANNOT_EDIT_REPOST, 'Reposts cannot be edited', 400);
    }

    // Check edit window
    const editWindowEnd = new Date(post.createdAt);
    editWindowEnd.setMinutes(editWindowEnd.getMinutes() + POST_EDIT_WINDOW_MINUTES);

    if (new Date() > editWindowEnd) {
      throw new AppError(ErrorCode.EDIT_WINDOW_EXPIRED, `Posts can only be edited within ${POST_EDIT_WINDOW_MINUTES} minutes`, 400);
    }

    if (content.length > POST_MAX_LENGTH) {
      throw new AppError(ErrorCode.POST_TOO_LONG, `Post cannot exceed ${POST_MAX_LENGTH} characters`, 400);
    }

    const updated = await this.prisma.post.update({
      where: { id },
      data: {
        content,
        isEdited: true,
        editedAt: new Date(),
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            isVerified: true,
          },
        },
      },
    });

    await this.eventBus.publish(EventType.POST_UPDATED, {
      postId: id,
      userId,
      content,
    });

    return this.toPostWithDetails(updated);
  }

  async deletePost(id: string, userId: string): Promise<void> {
    const post = await this.prisma.post.findUnique({
      where: { id },
      select: { userId: true, groupId: true, parentId: true, repostId: true, isDeleted: true },
    });

    if (!post) {
      throw new AppError(ErrorCode.POST_NOT_FOUND, 'Post not found', 404);
    }

    if (post.userId !== userId) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Not authorized to delete this post', 403);
    }

    // Soft delete
    await this.prisma.post.update({
      where: { id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });

    // Update counts
    await this.prisma.user.update({
      where: { id: userId },
      data: { postCount: { decrement: 1 } },
    });

    if (post.parentId) {
      await this.prisma.post.update({
        where: { id: post.parentId },
        data: { replyCount: { decrement: 1 } },
      });
    }

    if (post.repostId) {
      await this.prisma.post.update({
        where: { id: post.repostId },
        data: { repostCount: { decrement: 1 } },
      });
    }

    if (post.groupId) {
      await this.prisma.group.update({
        where: { id: post.groupId },
        data: { postCount: { decrement: 1 } },
      });
    }

    await this.eventBus.publish(EventType.POST_DELETED, { postId: id, userId });

    this.logger.info('Post deleted', { postId: id, userId });
  }

  async likePost(postId: string, userId: string): Promise<{ isLiked: boolean; likeCount: number }> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, userId: true, isDeleted: true, likeCount: true },
    });

    if (!post || post.isDeleted) {
      throw new AppError(ErrorCode.POST_NOT_FOUND, 'Post not found', 404);
    }

    const existingLike = await this.prisma.postLike.findUnique({
      where: { userId_postId: { userId, postId } },
    });

    if (existingLike) {
      return { isLiked: true, likeCount: post.likeCount };
    }

    await this.prisma.$transaction([
      this.prisma.postLike.create({
        data: { userId, postId },
      }),
      this.prisma.post.update({
        where: { id: postId },
        data: { likeCount: { increment: 1 } },
      }),
    ]);

    await this.eventBus.publish(EventType.POST_LIKED, {
      postId,
      userId,
      postAuthorId: post.userId,
    });

    return { isLiked: true, likeCount: post.likeCount + 1 };
  }

  async unlikePost(postId: string, userId: string): Promise<{ isLiked: boolean; likeCount: number }> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { likeCount: true },
    });

    if (!post) {
      throw new AppError(ErrorCode.POST_NOT_FOUND, 'Post not found', 404);
    }

    const existingLike = await this.prisma.postLike.findUnique({
      where: { userId_postId: { userId, postId } },
    });

    if (!existingLike) {
      return { isLiked: false, likeCount: post.likeCount };
    }

    await this.prisma.$transaction([
      this.prisma.postLike.delete({
        where: { userId_postId: { userId, postId } },
      }),
      this.prisma.post.update({
        where: { id: postId },
        data: { likeCount: { decrement: 1 } },
      }),
    ]);

    return { isLiked: false, likeCount: Math.max(0, post.likeCount - 1) };
  }

  async getPostLikes(postId: string, cursor: string | undefined, limit: number): Promise<PaginatedResponse<any>> {
    const likes = await this.prisma.postLike.findMany({
      where: { postId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            isVerified: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor && {
        cursor: { userId_postId: { userId: cursor, postId } },
        skip: 1,
      }),
    });

    const hasMore = likes.length > limit;
    const items = hasMore ? likes.slice(0, -1) : likes;

    return {
      items: items.map((l) => l.user),
      nextCursor: hasMore && items.length > 0 ? items[items.length - 1]!.userId : null,
      hasMore,
    };
  }

  async bookmarkPost(postId: string, userId: string): Promise<void> {
    await this.prisma.postBookmark.upsert({
      where: { userId_postId: { userId, postId } },
      create: { userId, postId },
      update: {},
    });
  }

  async removeBookmark(postId: string, userId: string): Promise<void> {
    await this.prisma.postBookmark.delete({
      where: { userId_postId: { userId, postId } },
    }).catch(() => {});
  }

  async getUserBookmarks(userId: string, cursor: string | undefined, limit: number): Promise<PaginatedResponse<PostWithDetails>> {
    const bookmarks = await this.prisma.postBookmark.findMany({
      where: { userId },
      include: {
        post: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true,
                isVerified: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor && {
        cursor: { userId_postId: { userId, postId: cursor } },
        skip: 1,
      }),
    });

    const hasMore = bookmarks.length > limit;
    const items = hasMore ? bookmarks.slice(0, -1) : bookmarks;

    return {
      items: items.filter((b) => !b.post.isDeleted).map((b) => this.toPostWithDetails(b.post)),
      nextCursor: hasMore && items.length > 0 ? items[items.length - 1]!.postId : null,
      hasMore,
    };
  }

  async getPostReplies(
    postId: string,
    viewerId: string | undefined,
    cursor: string | undefined,
    limit: number
  ): Promise<PaginatedResponse<PostWithDetails>> {
    const replies = await this.prisma.post.findMany({
      where: { parentId: postId, isDeleted: false },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            isVerified: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });

    const hasMore = replies.length > limit;
    const items = hasMore ? replies.slice(0, -1) : replies;

    return {
      items: items.map((r) => this.toPostWithDetails(r)),
      nextCursor: hasMore && items.length > 0 ? items[items.length - 1]!.id : null,
      hasMore,
    };
  }

  async getPostsByHashtag(
    tag: string,
    viewerId: string | undefined,
    cursor: string | undefined,
    limit: number
  ): Promise<PaginatedResponse<PostWithDetails>> {
    const hashtag = await this.prisma.hashtag.findUnique({
      where: { tag: tag.toLowerCase() },
    });

    if (!hashtag) {
      return { items: [], nextCursor: null, hasMore: false };
    }

    const postHashtags = await this.prisma.postHashtag.findMany({
      where: { hashtagId: hashtag.id },
      include: {
        post: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true,
                isVerified: true,
              },
            },
          },
        },
      },
      orderBy: { post: { createdAt: 'desc' } },
      take: limit + 1,
      ...(cursor && {
        cursor: { postId_hashtagId: { postId: cursor, hashtagId: hashtag.id } },
        skip: 1,
      }),
    });

    const hasMore = postHashtags.length > limit;
    const items = hasMore ? postHashtags.slice(0, -1) : postHashtags;

    return {
      items: items
        .filter((ph) => !ph.post.isDeleted && ph.post.visibility === 'PUBLIC')
        .map((ph) => this.toPostWithDetails(ph.post)),
      nextCursor: hasMore && items.length > 0 ? items[items.length - 1]!.postId : null,
      hasMore,
    };
  }

  async getTrendingHashtags(): Promise<HashtagTrend[]> {
    const cached = await this.cache.get<HashtagTrend[]>(CacheKeys.trending());
    if (cached) return cached;

    const hashtags = await this.prisma.hashtag.findMany({
      orderBy: { postCount: 'desc' },
      take: 20,
    });

    const trends: HashtagTrend[] = hashtags.map((h) => ({
      hashtag: h.tag,
      postCount: h.postCount,
      trend: 'stable' as const,
    }));

    await this.cache.set(CacheKeys.trending(), trends, 300);

    return trends;
  }

  private extractHashtags(content: string): string[] {
    const regex = /#(\w+)/g;
    const matches = content.match(regex) || [];
    return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))];
  }

  private extractMentions(content: string): string[] {
    const regex = /@(\w+)/g;
    const matches = content.match(regex) || [];
    return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))];
  }

  private async createHashtagAssociations(postId: string, hashtags: string[]): Promise<void> {
    for (const tag of hashtags) {
      const hashtag = await this.prisma.hashtag.upsert({
        where: { tag },
        create: { tag, postCount: 1 },
        update: { postCount: { increment: 1 } },
      });

      await this.prisma.postHashtag.create({
        data: { postId, hashtagId: hashtag.id },
      }).catch(() => {});
    }
  }

  private async createMentionAssociations(postId: string, mentions: string[]): Promise<void> {
    const users = await this.prisma.user.findMany({
      where: { username: { in: mentions } },
      select: { id: true },
    });

    for (const user of users) {
      await this.prisma.postMention.create({
        data: { postId, mentionedUserId: user.id },
      }).catch(() => {});
    }
  }

  private toPostWithDetails(post: any): PostWithDetails {
    return {
      id: post.id,
      userId: post.userId,
      content: post.content,
      visibility: post.visibility,
      groupId: post.groupId,
      parentId: post.parentId,
      repostId: post.repostId,
      likeCount: post.likeCount,
      replyCount: post.replyCount,
      repostCount: post.repostCount,
      viewCount: post.viewCount,
      isEdited: post.isEdited,
      editedAt: post.editedAt,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      user: post.user,
      group: post.group,
      parent: post.parent ? this.toPostWithDetails(post.parent) : undefined,
      repost: post.repost ? this.toPostWithDetails(post.repost) : undefined,
    };
  }
}
