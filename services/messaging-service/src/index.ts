/**
 * TextMesh Messaging Service
 *
 * Handles direct messaging between users including:
 * - Conversation management
 * - Message sending/receiving
 * - Read receipts
 * - Message reactions
 * - Media attachments in DMs
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createLogger } from '@textmesh/logger';
import { connectKafka, disconnectKafka } from '@textmesh/event-bus';
import { prisma, redis } from '@textmesh/db-client';

import conversationRoutes from './routes/conversation.routes';
import messageRoutes from './routes/message.routes';
import { errorHandler } from './middleware/error-handler';
import { requestLogger } from './middleware/request-logger';

const logger = createLogger('messaging-service');
const PORT = process.env.PORT || 3013;

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(requestLogger);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'messaging-service' });
});

// Routes
app.use('/conversations', conversationRoutes);
app.use('/messages', messageRoutes);

// Error handler
app.use(errorHandler);

// Graceful shutdown
async function shutdown() {
  logger.info('Shutting down messaging service...');
  await disconnectKafka();
  await prisma.$disconnect();
  await redis.quit();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
async function start() {
  try {
    // Connect to database
    await prisma.$connect();
    logger.info('Connected to database');

    // Connect to Kafka
    await connectKafka();
    logger.info('Connected to Kafka');

    // Start HTTP server
    app.listen(PORT, () => {
      logger.info(`Messaging service running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start messaging service', { error });
    process.exit(1);
  }
}

start();

export { app };
