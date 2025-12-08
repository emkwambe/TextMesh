// =================================
// USER SERVICE
// =================================

import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { EventBus, EventType } from '@textmesh/event-bus';
import { Logger } from '@textmesh/logger';
import { ErrorCode, AppError, UserProfile, PaginatedResponse } from '@textmesh/shared-types';
import { CacheKeys, CacheManager } from '@textmesh/db-client';

export class UserService {
  private cache: CacheManager;

  constructor(
    private prisma: PrismaClient,
    private redis: Redis,
    private eventBus: EventBus,
    private logger: Logger
  ) {
    this.cache = new CacheManager(redis, 300);
  }

  async getUserById(id: string, viewerId?: string): Promise<UserProfile> {
    // Try cache first
    const cached = await this.cache.get<UserProfile>(CacheKeys.userProfile(id));
    if (cached) {
      return this.addViewerContext(cached, viewerId);
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new AppError(ErrorCode.USER_NOT_FOUND, 'User not found', 404);
    }

    if (user.status === 'DELETED') {
      throw new AppError(ErrorCode.ACCOUNT_DELETED, 'Account has been deleted', 410);
    }

    const profile = this.toUserProfile(user);
    await this.cache.set(CacheKeys.userProfile(id), profile);

    return this.addViewerContext(profile, viewerId);
  }

  async getUserByUsername(username: string, viewerId?: string): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({
      where: { username: username.toLowerCase() },
    });

    if (!user) {
      throw new AppError(ErrorCode.USER_NOT_FOUND, 'User not found', 404);
    }

    return this.getUserById(user.id, viewerId);
  }

  async updateProfile(userId: string, data: Partial<{
    displayName: string;
    bio: string;
    location: string;
    website: string;
    isPrivate: boolean;
  }>): Promise<UserProfile> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });

    // Invalidate cache
    await this.cache.delete(CacheKeys.userProfile(userId));

    // Publish event
    await this.eventBus.publish(EventType.USER_UPDATED, {
      userId,
      changes: data,
    });

    return this.toUserProfile(user);
  }

  async getUserPosts(
    userId: string,
    viewerId: string | undefined,
    cursor: string | undefined,
    limit: number
  ): Promise<PaginatedResponse<any>> {
    // Check if user exists and viewer has access
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isPrivate: true },
    });

    if (!user) {
      throw new AppError(ErrorCode.USER_NOT_FOUND, 'User not found', 404);
    }

    // Check privacy
    if (user.isPrivate && viewerId !== userId) {
      const isFollowing = await this.prisma.follow.findUnique({
        where: {
          followerId_followeeId: { followerId: viewerId || '', followeeId: userId },
        },
      });

      if (!isFollowing) {
        throw new AppError(ErrorCode.PRIVATE_ACCOUNT, 'This account is private', 403);
      }
    }

    const posts = await this.prisma.post.findMany({
      where: {
        userId,
        isDeleted: false,
        OR: [
          { visibility: 'PUBLIC' },
          { visibility: 'FOLLOWERS', userId },
          ...(viewerId === userId ? [{ visibility: 'GROUP' as const }] : []),
        ],
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
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1,
      }),
    });

    const hasMore = posts.length > limit;
    const items = hasMore ? posts.slice(0, -1) : posts;

    return {
      items,
      nextCursor: hasMore && items.length > 0 ? items[items.length - 1]!.id : null,
      hasMore,
    };
  }

  async getFollowers(
    userId: string,
    cursor: string | undefined,
    limit: number
  ): Promise<PaginatedResponse<UserProfile>> {
    const follows = await this.prisma.follow.findMany({
      where: { followeeId: userId },
      include: {
        follower: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor && {
        cursor: { followerId_followeeId: { followerId: cursor, followeeId: userId } },
        skip: 1,
      }),
    });

    const hasMore = follows.length > limit;
    const items = hasMore ? follows.slice(0, -1) : follows;

    return {
      items: items.map((f) => this.toUserProfile(f.follower)),
      nextCursor: hasMore && items.length > 0 ? items[items.length - 1]!.followerId : null,
      hasMore,
    };
  }

  async getFollowing(
    userId: string,
    cursor: string | undefined,
    limit: number
  ): Promise<PaginatedResponse<UserProfile>> {
    const follows = await this.prisma.follow.findMany({
      where: { followerId: userId },
      include: {
        followee: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor && {
        cursor: { followerId_followeeId: { followerId: userId, followeeId: cursor } },
        skip: 1,
      }),
    });

    const hasMore = follows.length > limit;
    const items = hasMore ? follows.slice(0, -1) : follows;

    return {
      items: items.map((f) => this.toUserProfile(f.followee)),
      nextCursor: hasMore && items.length > 0 ? items[items.length - 1]!.followeeId : null,
      hasMore,
    };
  }

  async blockUser(blockerId: string, blockedId: string): Promise<void> {
    if (blockerId === blockedId) {
      throw new AppError(ErrorCode.BAD_REQUEST, 'Cannot block yourself', 400);
    }

    await this.prisma.$transaction([
      // Create block
      this.prisma.userBlock.upsert({
        where: { blockerId_blockedId: { blockerId, blockedId } },
        create: { blockerId, blockedId },
        update: {},
      }),
      // Remove any existing follow relationships
      this.prisma.follow.deleteMany({
        where: {
          OR: [
            { followerId: blockerId, followeeId: blockedId },
            { followerId: blockedId, followeeId: blockerId },
          ],
        },
      }),
    ]);

    this.logger.info('User blocked', { blockerId, blockedId });
  }

  async unblockUser(blockerId: string, blockedId: string): Promise<void> {
    await this.prisma.userBlock.delete({
      where: { blockerId_blockedId: { blockerId, blockedId } },
    }).catch(() => {});

    this.logger.info('User unblocked', { blockerId, blockedId });
  }

  async muteUser(muterId: string, mutedId: string): Promise<void> {
    if (muterId === mutedId) {
      throw new AppError(ErrorCode.BAD_REQUEST, 'Cannot mute yourself', 400);
    }

    await this.prisma.userMute.upsert({
      where: { muterId_mutedId: { muterId, mutedId } },
      create: { muterId, mutedId },
      update: {},
    });
  }

  async unmuteUser(muterId: string, mutedId: string): Promise<void> {
    await this.prisma.userMute.delete({
      where: { muterId_mutedId: { muterId, mutedId } },
    }).catch(() => {});
  }

  async searchUsers(
    query: string,
    cursor: string | undefined,
    limit: number
  ): Promise<PaginatedResponse<UserProfile>> {
    const users = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        OR: [
          { username: { contains: query, mode: 'insensitive' } },
          { displayName: { contains: query, mode: 'insensitive' } },
        ],
      },
      orderBy: { followerCount: 'desc' },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });

    const hasMore = users.length > limit;
    const items = hasMore ? users.slice(0, -1) : users;

    return {
      items: items.map((u) => this.toUserProfile(u)),
      nextCursor: hasMore && items.length > 0 ? items[items.length - 1]!.id : null,
      hasMore,
    };
  }

  private async addViewerContext(profile: UserProfile, viewerId?: string): Promise<UserProfile> {
    if (!viewerId || viewerId === profile.id) {
      return profile;
    }

    const [isFollowing, isFollowedBy, isBlocked, isMuted] = await Promise.all([
      this.prisma.follow.findUnique({
        where: { followerId_followeeId: { followerId: viewerId, followeeId: profile.id } },
      }),
      this.prisma.follow.findUnique({
        where: { followerId_followeeId: { followerId: profile.id, followeeId: viewerId } },
      }),
      this.prisma.userBlock.findUnique({
        where: { blockerId_blockedId: { blockerId: viewerId, blockedId: profile.id } },
      }),
      this.prisma.userMute.findUnique({
        where: { muterId_mutedId: { muterId: viewerId, mutedId: profile.id } },
      }),
    ]);

    return {
      ...profile,
      isFollowing: !!isFollowing,
      isFollowedBy: !!isFollowedBy,
      isBlocked: !!isBlocked,
      isMuted: !!isMuted,
    };
  }

  private toUserProfile(user: any): UserProfile {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      bio: user.bio,
      avatarUrl: user.avatarUrl,
      coverImageUrl: user.coverImageUrl,
      followerCount: user.followerCount,
      followingCount: user.followingCount,
      postCount: user.postCount,
      isVerified: user.isVerified,
      isPrivate: user.isPrivate,
      location: user.location,
      website: user.website,
      createdAt: user.createdAt,
    };
  }
}
