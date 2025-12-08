// =================================
// FOLLOW SERVICE
// =================================

import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { EventBus, EventType } from '@textmesh/event-bus';
import { Logger } from '@textmesh/logger';
import { ErrorCode, AppError, PaginatedResponse, UserProfile, FollowSuggestion } from '@textmesh/shared-types';

export class FollowService {
  constructor(
    private prisma: PrismaClient,
    private redis: Redis,
    private eventBus: EventBus,
    private logger: Logger
  ) {}

  async followUser(followerId: string, followeeId: string): Promise<{
    isFollowing: boolean;
    isPending: boolean;
    followedAt?: Date;
  }> {
    if (followerId === followeeId) {
      throw new AppError(ErrorCode.CANNOT_FOLLOW_SELF, 'Cannot follow yourself', 400);
    }

    // Check if blocked
    const isBlocked = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: followerId, blockedId: followeeId },
          { blockerId: followeeId, blockedId: followerId },
        ],
      },
    });

    if (isBlocked) {
      throw new AppError(ErrorCode.USER_BLOCKED, 'Cannot follow this user', 403);
    }

    // Check if already following
    const existingFollow = await this.prisma.follow.findUnique({
      where: {
        followerId_followeeId: { followerId, followeeId },
      },
    });

    if (existingFollow) {
      throw new AppError(ErrorCode.ALREADY_FOLLOWING, 'Already following this user', 409);
    }

    // Check if target has private account
    const targetUser = await this.prisma.user.findUnique({
      where: { id: followeeId },
      select: { isPrivate: true, status: true },
    });

    if (!targetUser) {
      throw new AppError(ErrorCode.USER_NOT_FOUND, 'User not found', 404);
    }

    if (targetUser.status !== 'ACTIVE') {
      throw new AppError(ErrorCode.USER_NOT_FOUND, 'User not found', 404);
    }

    // If private account, create follow request
    if (targetUser.isPrivate) {
      const existingRequest = await this.prisma.followRequest.findUnique({
        where: {
          followerId_followeeId: { followerId, followeeId },
        },
      });

      if (existingRequest) {
        if (existingRequest.status === 'PENDING') {
          throw new AppError(ErrorCode.FOLLOW_REQUEST_PENDING, 'Follow request already pending', 409);
        }
        // Update rejected request to pending
        await this.prisma.followRequest.update({
          where: { id: existingRequest.id },
          data: { status: 'PENDING', updatedAt: new Date() },
        });
      } else {
        await this.prisma.followRequest.create({
          data: { followerId, followeeId },
        });
      }

      // Publish event for notification
      await this.eventBus.publish(EventType.FOLLOW_REQUEST_CREATED, {
        followerId,
        followeeId,
      });

      return { isFollowing: false, isPending: true };
    }

    // Create follow directly for public accounts
    await this.prisma.$transaction([
      this.prisma.follow.create({
        data: { followerId, followeeId },
      }),
      this.prisma.user.update({
        where: { id: followerId },
        data: { followingCount: { increment: 1 } },
      }),
      this.prisma.user.update({
        where: { id: followeeId },
        data: { followerCount: { increment: 1 } },
      }),
    ]);

    // Publish event
    await this.eventBus.publish(EventType.USER_FOLLOWED, {
      followerId,
      followeeId,
    });

    this.logger.info('User followed', { followerId, followeeId });

    return { isFollowing: true, isPending: false, followedAt: new Date() };
  }

  async unfollowUser(followerId: string, followeeId: string): Promise<void> {
    const follow = await this.prisma.follow.findUnique({
      where: {
        followerId_followeeId: { followerId, followeeId },
      },
    });

    if (!follow) {
      // Also delete any pending follow request
      await this.prisma.followRequest.deleteMany({
        where: { followerId, followeeId },
      });
      return;
    }

    await this.prisma.$transaction([
      this.prisma.follow.delete({
        where: { followerId_followeeId: { followerId, followeeId } },
      }),
      this.prisma.user.update({
        where: { id: followerId },
        data: { followingCount: { decrement: 1 } },
      }),
      this.prisma.user.update({
        where: { id: followeeId },
        data: { followerCount: { decrement: 1 } },
      }),
    ]);

    await this.eventBus.publish(EventType.USER_UNFOLLOWED, {
      followerId,
      followeeId,
    });

    this.logger.info('User unfollowed', { followerId, followeeId });
  }

  async getFollowRequests(
    userId: string,
    cursor: string | undefined,
    limit: number
  ): Promise<PaginatedResponse<any>> {
    const requests = await this.prisma.followRequest.findMany({
      where: { followeeId: userId, status: 'PENDING' },
      include: {
        follower: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            bio: true,
            isVerified: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });

    const hasMore = requests.length > limit;
    const items = hasMore ? requests.slice(0, -1) : requests;

    return {
      items: items.map((r) => ({
        id: r.id,
        user: r.follower,
        createdAt: r.createdAt,
      })),
      nextCursor: hasMore && items.length > 0 ? items[items.length - 1]!.id : null,
      hasMore,
    };
  }

  async acceptFollowRequest(userId: string, requestId: string): Promise<void> {
    const request = await this.prisma.followRequest.findFirst({
      where: { id: requestId, followeeId: userId, status: 'PENDING' },
    });

    if (!request) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Follow request not found', 404);
    }

    await this.prisma.$transaction([
      this.prisma.followRequest.update({
        where: { id: requestId },
        data: { status: 'APPROVED' },
      }),
      this.prisma.follow.create({
        data: {
          followerId: request.followerId,
          followeeId: request.followeeId,
        },
      }),
      this.prisma.user.update({
        where: { id: request.followerId },
        data: { followingCount: { increment: 1 } },
      }),
      this.prisma.user.update({
        where: { id: request.followeeId },
        data: { followerCount: { increment: 1 } },
      }),
    ]);

    await this.eventBus.publish(EventType.FOLLOW_REQUEST_APPROVED, {
      followerId: request.followerId,
      followeeId: request.followeeId,
    });
  }

  async rejectFollowRequest(userId: string, requestId: string): Promise<void> {
    const request = await this.prisma.followRequest.findFirst({
      where: { id: requestId, followeeId: userId, status: 'PENDING' },
    });

    if (!request) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Follow request not found', 404);
    }

    await this.prisma.followRequest.update({
      where: { id: requestId },
      data: { status: 'REJECTED' },
    });

    await this.eventBus.publish(EventType.FOLLOW_REQUEST_REJECTED, {
      followerId: request.followerId,
      followeeId: request.followeeId,
    });
  }

  async getFollowStatus(
    viewerId: string,
    targetId: string
  ): Promise<{
    isFollowing: boolean;
    isFollowedBy: boolean;
    isPendingFollow: boolean;
    isPendingFollowedBy: boolean;
  }> {
    const [follow, followedBy, pendingFollow, pendingFollowedBy] = await Promise.all([
      this.prisma.follow.findUnique({
        where: { followerId_followeeId: { followerId: viewerId, followeeId: targetId } },
      }),
      this.prisma.follow.findUnique({
        where: { followerId_followeeId: { followerId: targetId, followeeId: viewerId } },
      }),
      this.prisma.followRequest.findFirst({
        where: { followerId: viewerId, followeeId: targetId, status: 'PENDING' },
      }),
      this.prisma.followRequest.findFirst({
        where: { followerId: targetId, followeeId: viewerId, status: 'PENDING' },
      }),
    ]);

    return {
      isFollowing: !!follow,
      isFollowedBy: !!followedBy,
      isPendingFollow: !!pendingFollow,
      isPendingFollowedBy: !!pendingFollowedBy,
    };
  }

  async getFollowSuggestions(userId: string, limit: number): Promise<FollowSuggestion[]> {
    // Get users that the user's friends follow but the user doesn't
    const suggestions = await this.prisma.$queryRaw<Array<{
      id: string;
      username: string;
      displayName: string;
      avatarUrl: string | null;
      bio: string | null;
      isVerified: boolean;
      followerCount: number;
      mutualCount: number;
    }>>`
      SELECT u.id, u.username, u."displayName", u."avatarUrl", u.bio, u."isVerified", u."followerCount",
             COUNT(DISTINCT mutual.follower_id) as "mutualCount"
      FROM "User" u
      JOIN "Follow" potential ON potential.followee_id = u.id
      JOIN "Follow" mutual ON mutual.followee_id = potential.follower_id
      WHERE mutual.follower_id = ${userId}
        AND u.id != ${userId}
        AND u.status = 'ACTIVE'
        AND NOT EXISTS (
          SELECT 1 FROM "Follow" f WHERE f.follower_id = ${userId} AND f.followee_id = u.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM "UserBlock" b WHERE
            (b.blocker_id = ${userId} AND b.blocked_id = u.id) OR
            (b.blocker_id = u.id AND b.blocked_id = ${userId})
        )
      GROUP BY u.id
      ORDER BY "mutualCount" DESC, u."followerCount" DESC
      LIMIT ${limit}
    `;

    return suggestions.map((s) => ({
      user: {
        id: s.id,
        username: s.username,
        displayName: s.displayName,
        avatarUrl: s.avatarUrl,
        bio: s.bio,
        isVerified: s.isVerified,
        followerCount: s.followerCount,
      } as any,
      reason: 'mutual_followers' as const,
      mutualFollowersCount: Number(s.mutualCount),
    }));
  }
}
