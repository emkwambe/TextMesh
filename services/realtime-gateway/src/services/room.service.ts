/**
 * Room Service
 *
 * Manages Socket.IO rooms for:
 * - Conversations
 * - Posts (live engagement)
 * - Custom rooms
 */

import { prisma, redis } from '@textmesh/db-client';
import { createLogger } from '@textmesh/logger';

const logger = createLogger({ service: 'room-service' });

export class RoomManager {
  /**
   * Get user's conversation IDs
   */
  async getUserConversations(userId: string): Promise<string[]> {
    // Check cache first
    const cacheKey = `user:conversations:${userId}`;
    const cached = await redis.smembers(cacheKey);

    if (cached.length > 0) {
      return cached;
    }

    // Query database
    const participants = await prisma.conversationParticipant.findMany({
      where: { userId },
      select: { conversationId: true },
    });

    const conversationIds = participants.map((p) => p.conversationId);

    // Cache for 5 minutes
    if (conversationIds.length > 0) {
      await redis.sadd(cacheKey, ...conversationIds);
      await redis.expire(cacheKey, 300);
    }

    return conversationIds;
  }

  /**
   * Check if user has access to conversation
   */
  async hasConversationAccess(userId: string, conversationId: string): Promise<boolean> {
    // Check cache first
    const cacheKey = `conversation:access:${conversationId}:${userId}`;
    const cached = await redis.get(cacheKey);

    if (cached !== null) {
      return cached === '1';
    }

    // Query database
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
    });

    const hasAccess = !!participant;

    // Cache for 5 minutes
    await redis.setex(cacheKey, 300, hasAccess ? '1' : '0');

    return hasAccess;
  }

  /**
   * Invalidate conversation access cache
   */
  async invalidateConversationAccess(conversationId: string, userId: string): Promise<void> {
    await redis.del(`conversation:access:${conversationId}:${userId}`);
    await redis.del(`user:conversations:${userId}`);
  }

  /**
   * Check if user has access to a room
   */
  async hasRoomAccess(userId: string, roomId: string, roomType: string): Promise<boolean> {
    switch (roomType) {
      case 'conversation':
        return this.hasConversationAccess(userId, roomId);

      case 'post':
        // Anyone can subscribe to post updates
        return true;

      case 'user':
        // Only the user can subscribe to their own room
        return userId === roomId;

      case 'feed':
        // Only the user can subscribe to their own feed
        return userId === roomId;

      case 'topic':
        // Public topics are open to all
        return true;

      default:
        logger.warn('Unknown room type', { roomType, roomId, userId });
        return false;
    }
  }

  /**
   * Add user to conversation (update cache)
   */
  async addUserToConversation(userId: string, conversationId: string): Promise<void> {
    const cacheKey = `user:conversations:${userId}`;
    await redis.sadd(cacheKey, conversationId);
    await redis.del(`conversation:access:${conversationId}:${userId}`);
  }

  /**
   * Remove user from conversation (update cache)
   */
  async removeUserFromConversation(userId: string, conversationId: string): Promise<void> {
    const cacheKey = `user:conversations:${userId}`;
    await redis.srem(cacheKey, conversationId);
    await redis.del(`conversation:access:${conversationId}:${userId}`);
  }

  /**
   * Get users in a conversation (for broadcasting)
   */
  async getConversationParticipants(conversationId: string): Promise<string[]> {
    const cacheKey = `conversation:participants:${conversationId}`;
    const cached = await redis.smembers(cacheKey);

    if (cached.length > 0) {
      return cached;
    }

    const participants = await prisma.conversationParticipant.findMany({
      where: { conversationId },
      select: { userId: true },
    });

    const userIds = participants.map((p) => p.userId);

    if (userIds.length > 0) {
      await redis.sadd(cacheKey, ...userIds);
      await redis.expire(cacheKey, 300);
    }

    return userIds;
  }
}

export const roomManager = new RoomManager();
