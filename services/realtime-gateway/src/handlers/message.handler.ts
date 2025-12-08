/**
 * Message Handler
 *
 * Handles real-time message delivery
 */

import { Server } from 'socket.io';
import { createLogger } from '@textmesh/logger';
import { emitToConversation, emitToUser } from '../socket/server';

const logger = createLogger('message-handler');

export interface MessageEvent {
  id: string;
  conversationId: string;
  senderId: string;
  senderUsername?: string;
  senderDisplayName?: string;
  senderAvatarUrl?: string;
  content: string;
  type: 'text' | 'image' | 'video' | 'file' | 'system';
  replyToId?: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface MessageUpdateEvent {
  id: string;
  conversationId: string;
  content?: string;
  editedAt: string;
}

export interface MessageDeleteEvent {
  id: string;
  conversationId: string;
  deletedAt: string;
}

export class MessageHandler {
  private io: Server;

  constructor(io: Server) {
    this.io = io;
  }

  /**
   * Handle new message
   */
  handleNewMessage(event: MessageEvent): void {
    const {
      id,
      conversationId,
      senderId,
      senderUsername,
      senderDisplayName,
      senderAvatarUrl,
      content,
      type,
      replyToId,
      metadata,
      createdAt,
    } = event;

    logger.debug('Delivering message', { messageId: id, conversationId, senderId });

    // Emit to conversation room
    emitToConversation(conversationId, 'message:new', {
      id,
      conversationId,
      sender: {
        id: senderId,
        username: senderUsername,
        displayName: senderDisplayName,
        avatarUrl: senderAvatarUrl,
      },
      content,
      type,
      replyToId,
      metadata,
      createdAt,
    });
  }

  /**
   * Handle message update (edit)
   */
  handleMessageUpdate(event: MessageUpdateEvent): void {
    const { id, conversationId, content, editedAt } = event;

    logger.debug('Delivering message update', { messageId: id, conversationId });

    emitToConversation(conversationId, 'message:updated', {
      id,
      conversationId,
      content,
      editedAt,
    });
  }

  /**
   * Handle message deletion
   */
  handleMessageDelete(event: MessageDeleteEvent): void {
    const { id, conversationId, deletedAt } = event;

    logger.debug('Delivering message deletion', { messageId: id, conversationId });

    emitToConversation(conversationId, 'message:deleted', {
      id,
      conversationId,
      deletedAt,
    });
  }

  /**
   * Handle reaction to message
   */
  handleMessageReaction(event: {
    messageId: string;
    conversationId: string;
    userId: string;
    username?: string;
    emoji: string;
    action: 'add' | 'remove';
  }): void {
    const { messageId, conversationId, userId, username, emoji, action } = event;

    emitToConversation(conversationId, 'message:reaction', {
      messageId,
      userId,
      username,
      emoji,
      action,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Notify user of new message (for notifications)
   */
  notifyNewMessage(recipientId: string, message: MessageEvent): void {
    emitToUser(recipientId, 'notification:message', {
      type: 'message',
      conversationId: message.conversationId,
      sender: {
        id: message.senderId,
        username: message.senderUsername,
        displayName: message.senderDisplayName,
        avatarUrl: message.senderAvatarUrl,
      },
      preview: message.content.substring(0, 100),
      createdAt: message.createdAt,
    });
  }

  /**
   * Send delivery receipt
   */
  sendDeliveryReceipt(conversationId: string, messageId: string, userId: string): void {
    emitToConversation(conversationId, 'message:delivered', {
      messageId,
      userId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Send read receipt
   */
  sendReadReceipt(conversationId: string, userId: string, upToMessageId?: string): void {
    emitToConversation(conversationId, 'message:read-receipt', {
      userId,
      upToMessageId,
      timestamp: new Date().toISOString(),
    });
  }
}
