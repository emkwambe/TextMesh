/**
 * Socket.IO Server Configuration
 *
 * Handles WebSocket connections with:
 * - JWT authentication
 * - Redis adapter for scaling
 * - Connection management
 * - Event routing
 */

import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import { redis } from '@textmesh/db-client';
import { createLogger } from '@textmesh/logger';
import Redis from 'ioredis';

import { PresenceManager } from '../services/presence.service';
import { RoomManager } from '../services/room.service';
import { registerSocketHandlers } from './handlers';

const logger = createLogger({ service: 'socket-server' });

let io: Server | null = null;

interface AuthPayload {
  userId: string;
  email: string;
  username: string;
}

interface AuthenticatedSocket extends Socket {
  userId: string;
  user: AuthPayload;
}

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export function initializeSocketServer(httpServer: HTTPServer): Server {
  // Create Socket.IO server
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'],
  });

  // Setup Redis adapter for horizontal scaling
  if (process.env.REDIS_URL) {
    const pubClient = new Redis(process.env.REDIS_URL);
    const subClient = pubClient.duplicate();

    io.adapter(createAdapter(pubClient, subClient));
    logger.info('Redis adapter configured');
  }

  // Authentication middleware
  io.use(async (socket: Socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;

      if (!token) {
        return next(new Error('Authentication required'));
      }

      // Verify JWT
      const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;

      // Attach user data to socket
      (socket as AuthenticatedSocket).userId = payload.userId;
      (socket as AuthenticatedSocket).user = payload;

      next();
    } catch (error) {
      logger.warn('Socket authentication failed', { error: (error as Error).message });
      next(new Error('Invalid token'));
    }
  });

  // Connection handler
  io.on('connection', async (socket: Socket) => {
    const authSocket = socket as AuthenticatedSocket;
    const { userId, user } = authSocket;

    logger.info('Client connected', { userId, socketId: socket.id });

    // Initialize managers
    const presenceManager = new PresenceManager();
    const roomManager = new RoomManager();

    // Mark user as online
    await presenceManager.setOnline(userId, {
      socketId: socket.id,
      connectedAt: new Date().toISOString(),
    });

    // Join user's personal room
    socket.join(`user:${userId}`);

    // Join user's conversation rooms
    const conversationIds = await roomManager.getUserConversations(userId);
    for (const convId of conversationIds) {
      socket.join(`conversation:${convId}`);
    }

    // Notify friends of online status
    const friendIds = await presenceManager.getUserFriends(userId);
    for (const friendId of friendIds) {
      io?.to(`user:${friendId}`).emit('presence:online', {
        userId,
        timestamp: new Date().toISOString(),
      });
    }

    // Register event handlers
    registerSocketHandlers(io!, authSocket, presenceManager, roomManager);

    // Disconnection handler
    socket.on('disconnect', async (reason) => {
      logger.info('Client disconnected', { userId, socketId: socket.id, reason });

      // Mark user as offline
      await presenceManager.setOffline(userId);

      // Notify friends of offline status
      for (const friendId of friendIds) {
        io?.to(`user:${friendId}`).emit('presence:offline', {
          userId,
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Error handler
    socket.on('error', (error) => {
      logger.error('Socket error', { userId, socketId: socket.id, error });
    });
  });

  return io;
}

export function getIO(): Server | null {
  return io;
}

export function emitToUser(userId: string, event: string, data: any): void {
  io?.to(`user:${userId}`).emit(event, data);
}

export function emitToConversation(conversationId: string, event: string, data: any): void {
  io?.to(`conversation:${conversationId}`).emit(event, data);
}

export function emitToRoom(roomId: string, event: string, data: any): void {
  io?.to(roomId).emit(event, data);
}

export function broadcast(event: string, data: any): void {
  io?.emit(event, data);
}

export { AuthenticatedSocket };
