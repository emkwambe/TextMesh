/**
 * Presence Service
 *
 * Manages user online/offline status and typing indicators
 */

import { redis, prisma } from '@textmesh/db-client';
import { createLogger } from '@textmesh/logger';

const logger = createLogger({ service: 'presence-service' });

const PRESENCE_TTL = 120; // 2 minutes
const TYPING_TTL = 5; // 5 seconds

export interface UserPresence {
  userId: string;
  status: 'online' | 'away' | 'dnd' | 'offline';
  lastSeen: string;
  socketId?: string;
}

export class PresenceManager {
  private prefix = 'presence';

  /**
   * Mark user as online
   */
  async setOnline(userId: string, metadata?: { socketId?: string; connectedAt?: string }): Promise<void> {
    const key = `${this.prefix}:${userId}`;
    const data = {
      status: 'online',
      lastSeen: new Date().toISOString(),
      ...metadata,
    };

    await redis.hset(key, data);
    await redis.expire(key, PRESENCE_TTL);

    // Add to online users set
    await redis.sadd(`${this.prefix}:online`, userId);

    logger.debug('User online', { userId });
  }

  /**
   * Mark user as offline
   */
  async setOffline(userId: string): Promise<void> {
    const key = `${this.prefix}:${userId}`;

    await redis.hset(key, {
      status: 'offline',
      lastSeen: new Date().toISOString(),
    });

    // Keep last seen for a while
    await redis.expire(key, 86400); // 24 hours

    // Remove from online users set
    await redis.srem(`${this.prefix}:online`, userId);

    logger.debug('User offline', { userId });
  }

  /**
   * Update user status
   */
  async updateStatus(userId: string, status: 'online' | 'away' | 'dnd'): Promise<void> {
    const key = `${this.prefix}:${userId}`;

    await redis.hset(key, { status, lastSeen: new Date().toISOString() });
    await redis.expire(key, PRESENCE_TTL);

    logger.debug('Status updated', { userId, status });
  }

  /**
   * Heartbeat to keep presence alive
   */
  async heartbeat(userId: string): Promise<void> {
    const key = `${this.prefix}:${userId}`;

    await redis.hset(key, { lastSeen: new Date().toISOString() });
    await redis.expire(key, PRESENCE_TTL);
  }

  /**
   * Get user presence
   */
  async getPresence(userId: string): Promise<UserPresence | null> {
    const key = `${this.prefix}:${userId}`;
    const data = await redis.hgetall(key);

    if (!data || Object.keys(data).length === 0) {
      return {
        userId,
        status: 'offline',
        lastSeen: new Date(0).toISOString(),
      };
    }

    return {
      userId,
      status: (data.status as UserPresence['status']) || 'offline',
      lastSeen: data.lastSeen || new Date(0).toISOString(),
      socketId: data.socketId,
    };
  }

  /**
   * Get presence for multiple users
   */
  async getPresences(userIds: string[]): Promise<UserPresence[]> {
    const pipeline = redis.pipeline();

    for (const userId of userIds) {
      pipeline.hgetall(`${this.prefix}:${userId}`);
    }

    const results = await pipeline.exec();

    return userIds.map((userId, index) => {
      const data = results?.[index]?.[1] as Record<string, string> | null;

      if (!data || Object.keys(data).length === 0) {
        return {
          userId,
          status: 'offline' as const,
          lastSeen: new Date(0).toISOString(),
        };
      }

      return {
        userId,
        status: (data.status as UserPresence['status']) || 'offline',
        lastSeen: data.lastSeen || new Date(0).toISOString(),
      };
    });
  }

  /**
   * Check if user is online
   */
  async isOnline(userId: string): Promise<boolean> {
    return (await redis.sismember(`${this.prefix}:online`, userId)) === 1;
  }

  /**
   * Get count of online users
   */
  async getOnlineCount(): Promise<number> {
    return redis.scard(`${this.prefix}:online`);
  }

  /**
   * Get user's friends (from database)
   */
  async getUserFriends(userId: string): Promise<string[]> {
    // Get users this user follows who also follow them back (mutual)
    const following = await prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    });

    const followingIds = following.map((f) => f.followingId);

    if (followingIds.length === 0) {
      return [];
    }

    const mutuals = await prisma.follow.findMany({
      where: {
        followerId: { in: followingIds },
        followingId: userId,
      },
      select: { followerId: true },
    });

    return mutuals.map((m) => m.followerId);
  }

  /**
   * Get online friends
   */
  async getOnlineFriends(userId: string): Promise<UserPresence[]> {
    const friendIds = await this.getUserFriends(userId);

    if (friendIds.length === 0) {
      return [];
    }

    const presences = await this.getPresences(friendIds);

    return presences.filter((p) => p.status !== 'offline');
  }

  /**
   * Set typing indicator
   */
  async setTyping(userId: string, conversationId: string, isTyping: boolean): Promise<void> {
    const key = `typing:${conversationId}:${userId}`;

    if (isTyping) {
      await redis.setex(key, TYPING_TTL, '1');
    } else {
      await redis.del(key);
    }
  }

  /**
   * Get users typing in a conversation
   */
  async getTypingUsers(conversationId: string): Promise<string[]> {
    const pattern = `typing:${conversationId}:*`;
    const keys = await redis.keys(pattern);

    return keys.map((key) => key.split(':')[2]);
  }
}

export const presenceManager = new PresenceManager();
