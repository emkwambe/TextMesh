/**
 * TextMesh Media Service
 *
 * Handles media upload, processing, and storage including:
 * - Image upload and optimization
 * - Video upload and transcoding
 * - Thumbnail generation
 * - CDN integration
 * - Content moderation hooks
 */

import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createLogger } from '@textmesh/logger';
import { connectKafka, disconnectKafka } from '@textmesh/event-bus';
import { prisma, redis } from '@textmesh/db-client';

import uploadRoutes from './routes/upload.routes';
import mediaRoutes from './routes/media.routes';
import { errorHandler } from './middleware/error-handler';
import { requestLogger } from './middleware/request-logger';

const logger = createLogger({ service: 'media-service' });
const PORT = process.env.PORT || 3014;

const app: Application = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(requestLogger);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'media-service' });
});

// Routes
app.use('/upload', uploadRoutes);
app.use('/media', mediaRoutes);

// Error handler
app.use(errorHandler);

// Graceful shutdown
async function shutdown() {
  logger.info('Shutting down media service...');
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
    await prisma.$connect();
    logger.info('Connected to database');

    await connectKafka();
    logger.info('Connected to Kafka');

    app.listen(PORT, () => {
      logger.info(`Media service running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start media service', { error });
    process.exit(1);
  }
}

start();

export { app };
