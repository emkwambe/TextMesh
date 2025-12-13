/**
 * Conversation Service
 *
 * Manages direct message conversations between users.
 */

import { prisma, redis, CacheKeys } from '@textmesh/db-client';
import { publishEvent, EventType } from '@textmesh/event-bus';
import { createLogger } from '@textmesh/logger';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger({ service: 'conversation-service' });

// Cache TTLs
const CONVERSATION_CACHE_TTL = 300; // 5 minutes
const CONVERSATION_LIST_TTL = 60; // 1 minute

export interface CreateConversationInput {
  participantIds: string[];
  initialMessage?: string;
}

export interface ConversationWithDetails {
  id: string;
  type: 'direct' | 'group';
  participants: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    isOnline?: boolean;
  }[];
  lastMessage: {
    id: string;
    content: string;
    senderId: string;
    createdAt: Date;
    isRead: boolean;
  } | null;
  unreadCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export class ConversationService {
  /**
   * Get or create a direct conversation between two users
   */
  async getOrCreateDirectConversation(
    userId: string,
    otherUserId: string
  ): Promise<ConversationWithDetails> {
    // Check if conversation exists
    const existingConversation = await this.findDirectConversation(userId, otherUserId);

    if (existingConversation) {
      return this.enrichConversation(existingConversation, userId);
    }

    // Verify users can message each other
    await this.validateCanMessage(userId, otherUserId);

    // Create new conversation
    const conversation = await prisma.conversation.create({
      data: {
        id: uuidv4(),
        type: 'DIRECT',
        participants: {
          create: [
            { userId, joinedAt: new Date() },
            { userId: otherUserId, joinedAt: new Date() },
          ],
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    // Publish event
    await publishEvent(EventType.CONVERSATION_CREATED, {
      conversationId: conversation.id,
      participantIds: [userId, otherUserId],
      type: 'direct',
    });

    // Invalidate cache
    await this.invalidateUserConversationsCache(userId);
    await this.invalidateUserConversationsCache(otherUserId);

    return this.enrichConversation(conversation, userId);
  }

  /**
   * Create a group conversation
   */
  async createGroupConversation(
    creatorId: string,
    participantIds: string[],
    name?: string
  ): Promise<ConversationWithDetails> {
    // Validate all participants
    const allParticipants = [...new Set([creatorId, ...participantIds])];

    for (const participantId of allParticipants) {
      if (participantId !== creatorId) {
        await this.validateCanMessage(creatorId, participantId);
      }
    }

    // Create conversation
    const conversation = await prisma.conversation.create({
      data: {
        id: uuidv4(),
        type: 'GROUP',
        name,
        creatorId,
        participants: {
          create: allParticipants.map((userId) => ({
            userId,
            role: userId === creatorId ? 'ADMIN' : 'MEMBER',
            joinedAt: new Date(),
          })),
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    // Publish event
    await publishEvent(EventType.CONVERSATION_CREATED, {
      conversationId: conversation.id,
      participantIds: allParticipants,
      type: 'group',
      name,
    });

    // Invalidate cache for all participants
    for (const participantId of allParticipants) {
      await this.invalidateUserConversationsCache(participantId);
    }

    return this.enrichConversation(conversation, creatorId);
  }

  /**
   * Get user's conversations with pagination
   */
  async getUserConversations(
    userId: string,
    options: { limit?: number; cursor?: string } = {}
  ): Promise<{
    conversations: ConversationWithDetails[];
    cursor: string | null;
    hasMore: boolean;
  }> {
    const { limit = 20, cursor } = options;

    // Try cache first
    const cacheKey = `conversations:${userId}:${cursor || 'start'}:${limit}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    // Build query
    const where: any = {
      participants: {
        some: { userId, leftAt: null },
      },
    };

    if (cursor) {
      where.updatedAt = { lt: new Date(cursor) };
    }

    const conversations = await prisma.conversation.findMany({
      where,
      take: limit + 1,
      orderBy: { updatedAt: 'desc' },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true,
              },
            },
          },
        },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            content: true,
            senderId: true,
            createdAt: true,
            readBy: true,
          },
        },
      },
    });

    const hasMore = conversations.length > limit;
    const items = hasMore ? conversations.slice(0, limit) : conversations;

    const enrichedConversations = await Promise.all(
      items.map((conv) => this.enrichConversation(conv, userId))
    );

    const result = {
      conversations: enrichedConversations,
      cursor: hasMore ? items[items.length - 1].updatedAt.toISOString() : null,
      hasMore,
    };

    // Cache result
    await redis.setex(cacheKey, CONVERSATION_LIST_TTL, JSON.stringify(result));

    return result;
  }

  /**
   * Get a single conversation by ID
   */
  async getConversation(
    conversationId: string,
    userId: string
  ): Promise<ConversationWithDetails | null> {
    // Verify user is a participant
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId, userId },
      },
    });

    if (!participant || participant.leftAt) {
      return null;
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: {
          where: { leftAt: null },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true,
              },
            },
          },
        },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            content: true,
            senderId: true,
            createdAt: true,
            readBy: true,
          },
        },
      },
    });

    if (!conversation) {
      return null;
    }

    return this.enrichConversation(conversation, userId);
  }

  /**
   * Leave a conversation (for group chats)
   */
  async leaveConversation(conversationId: string, userId: string): Promise<void> {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { participants: true },
    });

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    if (conversation.type === 'DIRECT') {
      throw new Error('Cannot leave a direct conversation');
    }

    await prisma.conversationParticipant.update({
      where: {
        conversationId_userId: { conversationId, userId },
      },
      data: { leftAt: new Date() },
    });

    // Publish event
    await publishEvent(EventType.CONVERSATION_LEFT, {
      conversationId,
      userId,
    });

    await this.invalidateUserConversationsCache(userId);
  }

  /**
   * Delete a conversation (marks as deleted for user)
   */
  async deleteConversation(conversationId: string, userId: string): Promise<void> {
    await prisma.conversationParticipant.update({
      where: {
        conversationId_userId: { conversationId, userId },
      },
      data: { deletedAt: new Date() },
    });

    await this.invalidateUserConversationsCache(userId);
  }

  /**
   * Get unread conversation count for a user
   */
  async getUnreadCount(userId: string): Promise<number> {
    const cacheKey = `conversations:unread:${userId}`;
    const cached = await redis.get(cacheKey);

    if (cached !== null) {
      return parseInt(cached, 10);
    }

    // Count conversations with unread messages
    const conversations = await prisma.conversation.findMany({
      where: {
        participants: {
          some: { userId, leftAt: null },
        },
      },
      include: {
        messages: {
          where: {
            senderId: { not: userId },
            readBy: { none: { userId } },
          },
          take: 1,
        },
      },
    });

    const count = conversations.filter((c) => c.messages.length > 0).length;

    await redis.setex(cacheKey, 60, count.toString());

    return count;
  }

  // ==================== Private Methods ====================

  private async findDirectConversation(userId1: string, userId2: string) {
    return prisma.conversation.findFirst({
      where: {
        type: 'DIRECT',
        AND: [
          { participants: { some: { userId: userId1, leftAt: null } } },
          { participants: { some: { userId: userId2, leftAt: null } } },
        ],
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true,
              },
            },
          },
        },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            content: true,
            senderId: true,
            createdAt: true,
            readBy: true,
          },
        },
      },
    });
  }

  private async validateCanMessage(senderId: string, recipientId: string): Promise<void> {
    // Check if blocked
    const block = await prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: senderId, blockedId: recipientId },
          { blockerId: recipientId, blockedId: senderId },
        ],
      },
    });

    if (block) {
      throw new Error('Cannot message this user');
    }

    // Check recipient's DM settings
    const recipientSettings = await prisma.userSettings.findUnique({
      where: { userId: recipientId },
    });

    if (recipientSettings?.allowDirectMessages === 'NONE') {
      throw new Error('User has disabled direct messages');
    }

    if (recipientSettings?.allowDirectMessages === 'FOLLOWERS') {
      // Check if sender follows recipient
      const follow = await prisma.follow.findUnique({
        where: {
          followerId_followeeId: {
            followerId: senderId,
            followeeId: recipientId,
          },
        },
      });

      if (!follow) {
        throw new Error('You must follow this user to send them a message');
      }
    }
  }

  private async enrichConversation(
    conversation: any,
    userId: string
  ): Promise<ConversationWithDetails> {
    // Get online status for participants
    const participantIds = conversation.participants.map((p: any) => p.user.id);
    const onlineStatuses = await this.getOnlineStatuses(participantIds);

    // Count unread messages
    const unreadCount = await prisma.message.count({
      where: {
        conversationId: conversation.id,
        senderId: { not: userId },
        readBy: { none: { userId } },
      },
    });

    const lastMessage = conversation.messages?.[0];

    return {
      id: conversation.id,
      type: conversation.type.toLowerCase() as 'direct' | 'group',
      participants: conversation.participants
        .filter((p: any) => p.user.id !== userId)
        .map((p: any) => ({
          id: p.user.id,
          username: p.user.username,
          displayName: p.user.displayName,
          avatarUrl: p.user.avatarUrl,
          isOnline: onlineStatuses[p.user.id] || false,
        })),
      lastMessage: lastMessage
        ? {
            id: lastMessage.id,
            content: lastMessage.content,
            senderId: lastMessage.senderId,
            createdAt: lastMessage.createdAt,
            isRead: lastMessage.readBy?.some((r: any) => r.userId === userId) || false,
          }
        : null,
      unreadCount,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  }

  private async getOnlineStatuses(
    userIds: string[]
  ): Promise<Record<string, boolean>> {
    const statuses: Record<string, boolean> = {};

    for (const userId of userIds) {
      const lastSeen = await redis.get(`presence:${userId}`);
      statuses[userId] = lastSeen !== null;
    }

    return statuses;
  }

  private async invalidateUserConversationsCache(userId: string): Promise<void> {
    const pattern = `conversations:${userId}:*`;
    const keys = await redis.keys(pattern);

    if (keys.length > 0) {
      await redis.del(...keys);
    }

    await redis.del(`conversations:unread:${userId}`);
  }
}

export const conversationService = new ConversationService();
