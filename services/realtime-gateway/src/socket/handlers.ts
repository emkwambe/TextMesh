/**
 * Socket Event Handlers
 *
 * Registers all socket event handlers for client interactions
 */

import { Server } from 'socket.io';
import { createLogger } from '@textmesh/logger';
import { publishEvent, EventType } from '@textmesh/event-bus';
import { AuthenticatedSocket } from './server';
import { PresenceManager } from '../services/presence.service';
import { RoomManager } from '../services/room.service';

const logger = createLogger({ service: 'socket-handlers' });

export function registerSocketHandlers(
  io: Server,
  socket: AuthenticatedSocket,
  presenceManager: PresenceManager,
  roomManager: RoomManager
): void {
  const { userId } = socket;

  // ==================
  // PRESENCE HANDLERS
  // ==================

  // Update status
  socket.on('presence:status', async (data: { status: 'online' | 'away' | 'dnd' }) => {
    await presenceManager.updateStatus(userId, data.status);

    // Notify friends
    const friendIds = await presenceManager.getUserFriends(userId);
    for (const friendId of friendIds) {
      io.to(`user:${friendId}`).emit('presence:status', {
        userId,
        status: data.status,
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Get online friends
  socket.on('presence:friends', async (callback: (data: any) => void) => {
    const onlineFriends = await presenceManager.getOnlineFriends(userId);
    callback({ friends: onlineFriends });
  });

  // Get user presence
  socket.on('presence:get', async (data: { userIds: string[] }, callback: (data: any) => void) => {
    const presences = await presenceManager.getPresences(data.userIds);
    callback({ presences });
  });

  // ==================
  // MESSAGING HANDLERS
  // ==================

  // Typing indicator start
  socket.on('typing:start', async (data: { conversationId: string }) => {
    socket.to(`conversation:${data.conversationId}`).emit('typing:start', {
      userId,
      conversationId: data.conversationId,
      timestamp: new Date().toISOString(),
    });

    // Set typing flag with TTL
    await presenceManager.setTyping(userId, data.conversationId, true);
  });

  // Typing indicator stop
  socket.on('typing:stop', async (data: { conversationId: string }) => {
    socket.to(`conversation:${data.conversationId}`).emit('typing:stop', {
      userId,
      conversationId: data.conversationId,
    });

    await presenceManager.setTyping(userId, data.conversationId, false);
  });

  // Join conversation room
  socket.on('conversation:join', async (data: { conversationId: string }) => {
    // Verify user has access
    const hasAccess = await roomManager.hasConversationAccess(userId, data.conversationId);

    if (!hasAccess) {
      socket.emit('error', { message: 'Access denied to conversation' });
      return;
    }

    socket.join(`conversation:${data.conversationId}`);

    logger.debug('User joined conversation', { userId, conversationId: data.conversationId });
  });

  // Leave conversation room
  socket.on('conversation:leave', (data: { conversationId: string }) => {
    socket.leave(`conversation:${data.conversationId}`);
  });

  // Mark messages as read
  socket.on('messages:read', async (data: { conversationId: string; messageId?: string }) => {
    // Publish event for message service to handle
    await publishEvent(EventType.MESSAGE_READ, {
      userId,
      conversationId: data.conversationId,
      upToMessageId: data.messageId,
      timestamp: new Date().toISOString(),
    });

    // Notify conversation participants
    socket.to(`conversation:${data.conversationId}`).emit('messages:read', {
      userId,
      conversationId: data.conversationId,
      messageId: data.messageId,
      timestamp: new Date().toISOString(),
    });
  });

  // ==================
  // NOTIFICATION HANDLERS
  // ==================

  // Mark notification as read
  socket.on('notification:read', async (data: { notificationId: string }) => {
    await publishEvent(EventType.NOTIFICATION_READ, {
      userId,
      notificationId: data.notificationId,
    });
  });

  // Mark all notifications as read
  socket.on('notifications:read-all', async () => {
    await publishEvent(EventType.NOTIFICATION_READ_ALL, { userId });
  });

  // ==================
  // FEED HANDLERS
  // ==================

  // Subscribe to feed updates
  socket.on('feed:subscribe', () => {
    socket.join(`feed:${userId}`);
    logger.debug('User subscribed to feed', { userId });
  });

  // Unsubscribe from feed updates
  socket.on('feed:unsubscribe', () => {
    socket.leave(`feed:${userId}`);
  });

  // Subscribe to post updates (for live engagement)
  socket.on('post:subscribe', (data: { postId: string }) => {
    socket.join(`post:${data.postId}`);
  });

  // Unsubscribe from post updates
  socket.on('post:unsubscribe', (data: { postId: string }) => {
    socket.leave(`post:${data.postId}`);
  });

  // ==================
  // LIVE ACTIVITY HANDLERS
  // ==================

  // React to post in real-time
  socket.on('post:reaction', async (data: { postId: string; reaction: string }) => {
    // Emit to post room for live updates
    io.to(`post:${data.postId}`).emit('post:reaction', {
      postId: data.postId,
      userId,
      reaction: data.reaction,
      timestamp: new Date().toISOString(),
    });
  });

  // ==================
  // ROOM HANDLERS
  // ==================

  // Join custom room
  socket.on('room:join', async (data: { roomId: string; roomType: string }) => {
    const hasAccess = await roomManager.hasRoomAccess(userId, data.roomId, data.roomType);

    if (!hasAccess) {
      socket.emit('error', { message: 'Access denied to room' });
      return;
    }

    socket.join(`${data.roomType}:${data.roomId}`);
    logger.debug('User joined room', { userId, roomId: data.roomId, roomType: data.roomType });
  });

  // Leave custom room
  socket.on('room:leave', (data: { roomId: string; roomType: string }) => {
    socket.leave(`${data.roomType}:${data.roomId}`);
  });

  // ==================
  // PING/HEARTBEAT
  // ==================

  socket.on('ping', (callback: (data: any) => void) => {
    callback({ pong: true, timestamp: Date.now() });
  });

  // Heartbeat to keep presence alive
  socket.on('heartbeat', async () => {
    await presenceManager.heartbeat(userId);
  });
}
