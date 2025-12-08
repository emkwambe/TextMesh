/**
 * Notification Handler
 *
 * Handles real-time notification delivery
 */

import { Server } from 'socket.io';
import { createLogger } from '@textmesh/logger';
import { emitToUser } from '../socket/server';

const logger = createLogger('notification-handler');

export interface NotificationEvent {
  id: string;
  userId: string;
  type: string;
  title?: string;
  message: string;
  data?: Record<string, any>;
  createdAt: string;
}

export interface FollowEvent {
  followerId: string;
  followingId: string;
  followerUsername: string;
  followerDisplayName?: string;
  followerAvatarUrl?: string;
}

export class NotificationHandler {
  private io: Server;

  constructor(io: Server) {
    this.io = io;
  }

  /**
   * Handle general notification
   */
  handleNotification(event: NotificationEvent): void {
    const { userId, id, type, title, message, data, createdAt } = event;

    logger.debug('Delivering notification', { userId, type, id });

    emitToUser(userId, 'notification:new', {
      id,
      type,
      title,
      message,
      data,
      createdAt,
      read: false,
    });
  }

  /**
   * Handle follow notification
   */
  handleFollowNotification(event: FollowEvent): void {
    const { followerId, followingId, followerUsername, followerDisplayName, followerAvatarUrl } = event;

    logger.debug('Delivering follow notification', { followerId, followingId });

    emitToUser(followingId, 'notification:new', {
      type: 'follow',
      message: `${followerDisplayName || followerUsername} started following you`,
      data: {
        userId: followerId,
        username: followerUsername,
        displayName: followerDisplayName,
        avatarUrl: followerAvatarUrl,
      },
      createdAt: new Date().toISOString(),
      read: false,
    });
  }

  /**
   * Handle mention notification
   */
  handleMentionNotification(event: {
    mentionedUserId: string;
    mentionerUsername: string;
    postId?: string;
    commentId?: string;
    content: string;
  }): void {
    const { mentionedUserId, mentionerUsername, postId, commentId, content } = event;

    emitToUser(mentionedUserId, 'notification:new', {
      type: 'mention',
      message: `${mentionerUsername} mentioned you`,
      data: {
        postId,
        commentId,
        preview: content.substring(0, 100),
      },
      createdAt: new Date().toISOString(),
      read: false,
    });
  }

  /**
   * Handle reply notification
   */
  handleReplyNotification(event: {
    originalAuthorId: string;
    replierUsername: string;
    postId: string;
    replyId: string;
    content: string;
  }): void {
    const { originalAuthorId, replierUsername, postId, replyId, content } = event;

    emitToUser(originalAuthorId, 'notification:new', {
      type: 'reply',
      message: `${replierUsername} replied to your post`,
      data: {
        postId,
        replyId,
        preview: content.substring(0, 100),
      },
      createdAt: new Date().toISOString(),
      read: false,
    });
  }

  /**
   * Handle quote notification
   */
  handleQuoteNotification(event: {
    originalAuthorId: string;
    quoterUsername: string;
    originalPostId: string;
    quotePostId: string;
    content: string;
  }): void {
    const { originalAuthorId, quoterUsername, originalPostId, quotePostId, content } = event;

    emitToUser(originalAuthorId, 'notification:new', {
      type: 'quote',
      message: `${quoterUsername} quoted your post`,
      data: {
        originalPostId,
        quotePostId,
        preview: content.substring(0, 100),
      },
      createdAt: new Date().toISOString(),
      read: false,
    });
  }

  /**
   * Send system notification to user
   */
  sendSystemNotification(userId: string, message: string, data?: Record<string, any>): void {
    emitToUser(userId, 'notification:system', {
      type: 'system',
      message,
      data,
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * Broadcast system notification to all connected users
   */
  broadcastSystemNotification(message: string, data?: Record<string, any>): void {
    this.io.emit('notification:system', {
      type: 'system',
      message,
      data,
      createdAt: new Date().toISOString(),
    });
  }
}
