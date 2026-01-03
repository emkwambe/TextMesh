/**
 * TextMesh Realtime Gateway
 *
 * WebSocket server for real-time features including:
 * - Online presence tracking
 * - Real-time messaging
 * - Typing indicators
 * - Notifications
 * - Live updates (posts, comments, likes)
 */

import express, { Application } from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import { createLogger } from '@textmesh/logger';
import { connectKafka, disconnectKafka, subscribeToEvent } from '@textmesh/event-bus';
import { redis } from '@textmesh/db-client';

import { initializeSocketServer, getIO } from './socket/server';
import { PresenceManager } from './services/presence.service';
import { RoomManager } from './services/room.service';
import { NotificationHandler } from './handlers/notification.handler';
import { MessageHandler } from './handlers/message.handler';
import { FeedHandler } from './handlers/feed.handler';

const logger = createLogger({ service: 'realtime-gateway' });
const PORT = process.env.PORT || 3020;

const app: Application = express();
const httpServer = createServer(app);

// Express middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  const io = getIO();
  res.json({
    status: 'healthy',
    service: 'realtime-gateway',
    connections: io?.engine?.clientsCount || 0,
  });
});

// Stats endpoint
app.get('/stats', async (req, res) => {
  const io = getIO();
  const presenceManager = new PresenceManager();

  const stats = {
    connections: io?.engine?.clientsCount || 0,
    rooms: io?.sockets?.adapter?.rooms?.size || 0,
    onlineUsers: await presenceManager.getOnlineCount(),
  };

  res.json(stats);
});

// Graceful shutdown
async function shutdown() {
  logger.info('Shutting down realtime gateway...');

  const io = getIO();
  if (io) {
    // Notify all clients
    io.emit('server:shutdown', { message: 'Server is restarting' });

    // Close all connections
    io.close();
  }

  await disconnectKafka();
  await redis.quit();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
async function start() {
  try {
    // Initialize Socket.IO
    const io = initializeSocketServer(httpServer);
    logger.info('Socket.IO initialized');

    // Connect to Kafka
    await connectKafka();
    logger.info('Connected to Kafka');

    // Initialize handlers
    const notificationHandler = new NotificationHandler(io);
    const messageHandler = new MessageHandler(io);
    const feedHandler = new FeedHandler(io);

    // Subscribe to Kafka events
    subscribeToEvent('notification.created', async (data: any) => {
      notificationHandler.handleNotification(data);
    });

    subscribeToEvent('message.sent', async (data: any) => {
      messageHandler.handleNewMessage(data);
    });

    subscribeToEvent('message.updated', async (data: any) => {
      messageHandler.handleMessageUpdate(data);
    });

    subscribeToEvent('message.deleted', async (data: any) => {
      messageHandler.handleMessageDelete(data);
    });

    subscribeToEvent('post.created', async (data: any) => {
      feedHandler.handleNewPost(data);
    });

    subscribeToEvent('post.liked', async (data: any) => {
      feedHandler.handlePostLike(data);
    });

    subscribeToEvent('post.commented', async (data: any) => {
      feedHandler.handlePostComment(data);
    });

    subscribeToEvent('user.followed', async (data: any) => {
      notificationHandler.handleFollowNotification(data);
    });

    logger.info('Event handlers registered');

    // Start HTTP server
    httpServer.listen(PORT, () => {
      logger.info(`Realtime gateway running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start realtime gateway', { error });
    process.exit(1);
  }
}

start();

export { app, httpServer };
