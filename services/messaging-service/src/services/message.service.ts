/**
 * Message Service
 *
 * Handles sending, receiving, and managing direct messages.
 */

import { prisma, redis } from '@textmesh/db-client';
import { publishEvent, EventType } from '@textmesh/event-bus';
import { createLogger } from '@textmesh/logger';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger({ service: 'message-service' });

// Constants
const MESSAGE_MAX_LENGTH = 5000;
const MESSAGE_CACHE_TTL = 300;
const MESSAGES_PER_PAGE = 50;

export interface SendMessageInput {
  conversationId: string;
  content: string;
  replyToId?: string;
  attachments?: {
    type: 'image' | 'video' | 'file';
    url: string;
    thumbnailUrl?: string;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
  }[];
}

export interface MessageWithDetails {
  id: string;
  conversationId: string;
  sender: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
  content: string;
  attachments: any[];
  replyTo: {
    id: string;
    content: string;
    senderId: string;
  } | null;
  reactions: {
    emoji: string;
    count: number;
    userReacted: boolean;
  }[];
  readBy: {
    userId: string;
    readAt: Date;
  }[];
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class MessageService {
  /**
   * Send a message to a conversation
   */
  async sendMessage(
    senderId: string,
    input: SendMessageInput
  ): Promise<MessageWithDetails> {
    const { conversationId, content, replyToId, attachments } = input;

    // Validate content length
    if (content.length > MESSAGE_MAX_LENGTH) {
      throw new Error(`Message exceeds maximum length of ${MESSAGE_MAX_LENGTH} characters`);
    }

    if (content.trim().length === 0 && (!attachments || attachments.length === 0)) {
      throw new Error('Message cannot be empty');
    }

    // Verify sender is a participant
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId, userId: senderId },
      },
    });

    if (!participant || participant.leftAt) {
      throw new Error('You are not a participant in this conversation');
    }

    // Validate reply if provided
    if (replyToId) {
      const replyMessage = await prisma.message.findFirst({
        where: { id: replyToId, conversationId },
      });

      if (!replyMessage) {
        throw new Error('Reply message not found in this conversation');
      }
    }

    // Create message
    const message = await prisma.message.create({
      data: {
        id: uuidv4(),
        conversationId,
        senderId,
        content: content.trim(),
        replyToId,
        attachments: attachments || [],
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        replyTo: {
          select: {
            id: true,
            content: true,
            senderId: true,
          },
        },
      },
    });

    // Update conversation's last activity
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    // Get conversation participants for notifications
    const participants = await prisma.conversationParticipant.findMany({
      where: {
        conversationId,
        userId: { not: senderId },
        leftAt: null,
      },
      select: { userId: true },
    });

    // Publish message event
    await publishEvent(EventType.MESSAGE_SENT, {
      messageId: message.id,
      conversationId,
      senderId,
      recipientIds: participants.map((p) => p.userId),
      preview: content.substring(0, 100),
      hasAttachments: (attachments?.length || 0) > 0,
    });

    // Invalidate caches
    await this.invalidateConversationCaches(conversationId);

    // Update unread count for recipients
    for (const participant of participants) {
      await redis.del(`conversations:unread:${participant.userId}`);
    }

    return this.formatMessage(message, senderId);
  }

  /**
   * Get messages in a conversation with pagination
   */
  async getMessages(
    conversationId: string,
    userId: string,
    options: { limit?: number; before?: string; after?: string } = {}
  ): Promise<{
    messages: MessageWithDetails[];
    cursor: string | null;
    hasMore: boolean;
  }> {
    const { limit = MESSAGES_PER_PAGE, before, after } = options;

    // Verify user is a participant
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId, userId },
      },
    });

    if (!participant) {
      throw new Error('Not a participant in this conversation');
    }

    // Build query conditions
    const where: any = {
      conversationId,
      isDeleted: false,
    };

    // Handle deleted messages visibility
    if (participant.deletedAt) {
      where.createdAt = { gt: participant.deletedAt };
    }

    if (before) {
      where.createdAt = { ...where.createdAt, lt: new Date(before) };
    }

    if (after) {
      where.createdAt = { ...where.createdAt, gt: new Date(after) };
    }

    const messages = await prisma.message.findMany({
      where,
      take: limit + 1,
      orderBy: { createdAt: 'desc' },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        replyTo: {
          select: {
            id: true,
            content: true,
            senderId: true,
          },
        },
        reactions: {
          select: {
            emoji: true,
            userId: true,
          },
        },
        readBy: {
          select: {
            userId: true,
            readAt: true,
          },
        },
      },
    });

    const hasMore = messages.length > limit;
    const items = hasMore ? messages.slice(0, limit) : messages;

    return {
      messages: items.map((m) => this.formatMessage(m, userId)),
      cursor: hasMore ? items[items.length - 1].createdAt.toISOString() : null,
      hasMore,
    };
  }

  /**
   * Edit a message
   */
  async editMessage(
    messageId: string,
    userId: string,
    newContent: string
  ): Promise<MessageWithDetails> {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new Error('Message not found');
    }

    if (message.senderId !== userId) {
      throw new Error('You can only edit your own messages');
    }

    if (message.isDeleted) {
      throw new Error('Cannot edit a deleted message');
    }

    // Check edit window (15 minutes)
    const editWindowMs = 15 * 60 * 1000;
    if (Date.now() - message.createdAt.getTime() > editWindowMs) {
      throw new Error('Edit window has expired');
    }

    if (newContent.length > MESSAGE_MAX_LENGTH) {
      throw new Error(`Message exceeds maximum length of ${MESSAGE_MAX_LENGTH} characters`);
    }

    const updatedMessage = await prisma.message.update({
      where: { id: messageId },
      data: {
        content: newContent.trim(),
        isEdited: true,
        editedAt: new Date(),
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        replyTo: {
          select: {
            id: true,
            content: true,
            senderId: true,
          },
        },
        reactions: {
          select: {
            emoji: true,
            userId: true,
          },
        },
        readBy: {
          select: {
            userId: true,
            readAt: true,
          },
        },
      },
    });

    // Publish event
    await publishEvent(EventType.MESSAGE_EDITED, {
      messageId,
      conversationId: message.conversationId,
      senderId: userId,
    });

    return this.formatMessage(updatedMessage, userId);
  }

  /**
   * Delete a message (soft delete)
   */
  async deleteMessage(messageId: string, userId: string): Promise<void> {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new Error('Message not found');
    }

    if (message.senderId !== userId) {
      throw new Error('You can only delete your own messages');
    }

    await prisma.message.update({
      where: { id: messageId },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        content: '', // Clear content for deleted messages
      },
    });

    // Publish event
    await publishEvent(EventType.MESSAGE_DELETED, {
      messageId,
      conversationId: message.conversationId,
      senderId: userId,
    });

    await this.invalidateConversationCaches(message.conversationId);
  }

  /**
   * Mark messages as read
   */
  async markAsRead(
    conversationId: string,
    userId: string,
    upToMessageId?: string
  ): Promise<void> {
    const where: any = {
      conversationId,
      senderId: { not: userId },
      readBy: { none: { userId } },
    };

    if (upToMessageId) {
      const targetMessage = await prisma.message.findUnique({
        where: { id: upToMessageId },
      });

      if (targetMessage) {
        where.createdAt = { lte: targetMessage.createdAt };
      }
    }

    // Get unread messages
    const unreadMessages = await prisma.message.findMany({
      where,
      select: { id: true, senderId: true },
    });

    if (unreadMessages.length === 0) {
      return;
    }

    // Create read receipts
    await prisma.messageReadReceipt.createMany({
      data: unreadMessages.map((m) => ({
        messageId: m.id,
        userId,
        readAt: new Date(),
      })),
      skipDuplicates: true,
    });

    // Publish read event
    await publishEvent(EventType.MESSAGES_READ, {
      conversationId,
      userId,
      messageIds: unreadMessages.map((m) => m.id),
    });

    // Invalidate unread count cache
    await redis.del(`conversations:unread:${userId}`);

    // Notify senders about read receipt
    const senderIds = [...new Set(unreadMessages.map((m) => m.senderId))];
    for (const senderId of senderIds) {
      await publishEvent(EventType.READ_RECEIPT, {
        conversationId,
        readerId: userId,
        senderId,
      });
    }
  }

  /**
   * Add a reaction to a message
   */
  async addReaction(
    messageId: string,
    userId: string,
    emoji: string
  ): Promise<void> {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message || message.isDeleted) {
      throw new Error('Message not found');
    }

    // Verify user is in the conversation
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId: message.conversationId, userId },
      },
    });

    if (!participant || participant.leftAt) {
      throw new Error('Not a participant in this conversation');
    }

    // Validate emoji (basic validation)
    if (!this.isValidEmoji(emoji)) {
      throw new Error('Invalid emoji');
    }

    // Upsert reaction
    await prisma.messageReaction.upsert({
      where: {
        messageId_userId_emoji: { messageId, userId, emoji },
      },
      update: {},
      create: {
        messageId,
        userId,
        emoji,
      },
    });

    // Publish event
    await publishEvent(EventType.MESSAGE_REACTION_ADDED, {
      messageId,
      conversationId: message.conversationId,
      userId,
      emoji,
    });
  }

  /**
   * Remove a reaction from a message
   */
  async removeReaction(
    messageId: string,
    userId: string,
    emoji: string
  ): Promise<void> {
    await prisma.messageReaction.deleteMany({
      where: { messageId, userId, emoji },
    });

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { conversationId: true },
    });

    if (message) {
      await publishEvent(EventType.MESSAGE_REACTION_REMOVED, {
        messageId,
        conversationId: message.conversationId,
        userId,
        emoji,
      });
    }
  }

  /**
   * Search messages in a conversation
   */
  async searchMessages(
    conversationId: string,
    userId: string,
    query: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<{ messages: MessageWithDetails[]; total: number }> {
    const { limit = 20, offset = 0 } = options;

    // Verify user is in the conversation
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId, userId },
      },
    });

    if (!participant) {
      throw new Error('Not a participant in this conversation');
    }

    const where: any = {
      conversationId,
      isDeleted: false,
      content: { contains: query, mode: 'insensitive' },
    };

    if (participant.deletedAt) {
      where.createdAt = { gt: participant.deletedAt };
    }

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
          replyTo: {
            select: {
              id: true,
              content: true,
              senderId: true,
            },
          },
          reactions: {
            select: {
              emoji: true,
              userId: true,
            },
          },
          readBy: {
            select: {
              userId: true,
              readAt: true,
            },
          },
        },
      }),
      prisma.message.count({ where }),
    ]);

    return {
      messages: messages.map((m) => this.formatMessage(m, userId)),
      total,
    };
  }

  // ==================== Private Methods ====================

  private formatMessage(message: any, currentUserId: string): MessageWithDetails {
    // Aggregate reactions
    const reactionMap = new Map<string, { count: number; userReacted: boolean }>();

    for (const reaction of message.reactions || []) {
      const existing = reactionMap.get(reaction.emoji) || {
        count: 0,
        userReacted: false,
      };
      existing.count++;
      if (reaction.userId === currentUserId) {
        existing.userReacted = true;
      }
      reactionMap.set(reaction.emoji, existing);
    }

    return {
      id: message.id,
      conversationId: message.conversationId,
      sender: message.sender,
      content: message.isDeleted ? '' : message.content,
      attachments: message.isDeleted ? [] : message.attachments || [],
      replyTo: message.replyTo,
      reactions: Array.from(reactionMap.entries()).map(([emoji, data]) => ({
        emoji,
        count: data.count,
        userReacted: data.userReacted,
      })),
      readBy: message.readBy || [],
      isEdited: message.isEdited,
      isDeleted: message.isDeleted,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
    };
  }

  private isValidEmoji(emoji: string): boolean {
    // Basic emoji validation - allows common emojis
    const emojiRegex = /^[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]$/u;
    return emojiRegex.test(emoji) || emoji.length <= 2;
  }

  private async invalidateConversationCaches(conversationId: string): Promise<void> {
    const pattern = `messages:${conversationId}:*`;
    const keys = await redis.keys(pattern);

    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }
}

export const messageService = new MessageService();
