// =================================
// FEED SERVICE
// =================================

import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { Logger } from '@textmesh/logger';
import { PaginatedResponse, PostWithDetails, ErrorCode, AppError } from '@textmesh/shared-types';
import { CacheManager, CacheKeys } from '@textmesh/db-client';

export class FeedService {
  private cache: CacheManager;

  constructor(
    private prisma: PrismaClient,
    private redis: Redis,
    private logger: Logger
  ) {
    this.cache = new CacheManager(redis, 60);
  }

  async getHomeFeed(userId: string, cursor: string | undefined, limit: number): Promise<PaginatedResponse<PostWithDetails>> {
    // Get users the current user follows
    const following = await this.prisma.follow.findMany({
      where: { followerId: userId },
      select: { followeeId: true },
    });

    const followingIds = following.map((f) => f.followeeId);
    followingIds.push(userId); // Include own posts

    // Get posts from followed users
    const posts = await this.prisma.post.findMany({
      where: {
        userId: { in: followingIds },
        isDeleted: false,
        visibility: { in: ['PUBLIC', 'FOLLOWERS'] },
        parentId: null, // Only top-level posts
      },
      include: {
        user: {
          select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true },
        },
        repost: {
          include: {
            user: {
              select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });

    const hasMore = posts.length > limit;
    const items = hasMore ? posts.slice(0, -1) : posts;

    // Add engagement status for viewer
    const enrichedItems = await Promise.all(
      items.map(async (post) => {
        const [isLiked, isBookmarked] = await Promise.all([
          this.prisma.postLike.findUnique({ where: { userId_postId: { userId, postId: post.id } } }),
          this.prisma.postBookmark.findUnique({ where: { userId_postId: { userId, postId: post.id } } }),
        ]);
        return { ...this.toPostWithDetails(post), isLiked: !!isLiked, isBookmarked: !!isBookmarked };
      })
    );

    return {
      items: enrichedItems,
      nextCursor: hasMore && items.length > 0 ? items[items.length - 1]!.id : null,
      hasMore,
    };
  }

  async getGroupFeed(groupId: string, userId: string, cursor: string | undefined, limit: number): Promise<PaginatedResponse<PostWithDetails>> {
    // Check membership
    const membership = await this.prisma.groupMembership.findUnique({
      where: { userId_groupId: { userId, groupId } },
    });

    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: { privacy: true },
    });

    if (!group) throw new AppError(ErrorCode.GROUP_NOT_FOUND, 'Group not found', 404);

    if ((group.privacy === 'PRIVATE' || group.privacy === 'SECRET') && !membership) {
      throw new AppError(ErrorCode.NOT_GROUP_MEMBER, 'You are not a member of this group', 403);
    }

    const posts = await this.prisma.post.findMany({
      where: { groupId, isDeleted: false },
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });

    const hasMore = posts.length > limit;
    const items = hasMore ? posts.slice(0, -1) : posts;

    return {
      items: items.map((p) => this.toPostWithDetails(p)),
      nextCursor: hasMore && items.length > 0 ? items[items.length - 1]!.id : null,
      hasMore,
    };
  }

  async getUserTimeline(targetUserId: string, viewerId: string | undefined, cursor: string | undefined, limit: number): Promise<PaginatedResponse<PostWithDetails>> {
    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { isPrivate: true, status: true },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new AppError(ErrorCode.USER_NOT_FOUND, 'User not found', 404);
    }

    // Check privacy
    if (user.isPrivate && viewerId !== targetUserId) {
      const isFollowing = await this.prisma.follow.findUnique({
        where: { followerId_followeeId: { followerId: viewerId || '', followeeId: targetUserId } },
      });
      if (!isFollowing) {
        throw new AppError(ErrorCode.PRIVATE_ACCOUNT, 'This account is private', 403);
      }
    }

    const posts = await this.prisma.post.findMany({
      where: {
        userId: targetUserId,
        isDeleted: false,
        parentId: null,
        OR: [
          { visibility: 'PUBLIC' },
          ...(viewerId === targetUserId ? [{ visibility: 'FOLLOWERS' as const }, { visibility: 'GROUP' as const }] : []),
        ],
      },
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } },
        repost: {
          include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });

    const hasMore = posts.length > limit;
    const items = hasMore ? posts.slice(0, -1) : posts;

    return {
      items: items.map((p) => this.toPostWithDetails(p)),
      nextCursor: hasMore && items.length > 0 ? items[items.length - 1]!.id : null,
      hasMore,
    };
  }

  async getDiscoverFeed(viewerId: string | undefined, cursor: string | undefined, limit: number): Promise<PaginatedResponse<PostWithDetails>> {
    // Get trending/popular public posts
    const posts = await this.prisma.post.findMany({
      where: {
        isDeleted: false,
        visibility: 'PUBLIC',
        parentId: null,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24 hours
      },
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } },
      },
      orderBy: [{ likeCount: 'desc' }, { replyCount: 'desc' }, { createdAt: 'desc' }],
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });

    const hasMore = posts.length > limit;
    const items = hasMore ? posts.slice(0, -1) : posts;

    return {
      items: items.map((p) => this.toPostWithDetails(p)),
      nextCursor: hasMore && items.length > 0 ? items[items.length - 1]!.id : null,
      hasMore,
    };
  }

  async fanOutPost(payload: { postId: string; userId: string; visibility: string; groupId?: string }): Promise<void> {
    this.logger.info('Fan-out post to feeds', { postId: payload.postId });

    // For a production system, this would add the post to followers' Redis-based feed caches
    // Simplified implementation - just invalidate caches
    if (payload.groupId) {
      await this.cache.delete(CacheKeys.feedGroup('*', payload.groupId));
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
      repost: post.repost ? this.toPostWithDetails(post.repost) : undefined,
    };
  }
}
