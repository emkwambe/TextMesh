// =================================
// TEXTMESH POST SERVICE
// =================================

import express from 'express';
import { createLogger } from '@textmesh/logger';
import { getPrismaClient, disconnectPrisma, getRedisClient, disconnectRedis } from '@textmesh/db-client';
import { createEventBus } from '@textmesh/event-bus';
import { postRoutes } from './routes/post.routes.js';
import { errorHandler } from './middleware/error-handler.js';

const PORT = parseInt(process.env['POST_SERVICE_PORT'] || '3003', 10);
const HOST = process.env['POST_SERVICE_HOST'] || '0.0.0.0';

const logger = createLogger({
  service: 'post-service',
  level: (process.env['LOG_LEVEL'] as 'info' | 'debug' | 'error') || 'info',
});

async function main() {
  try {
    const prisma = getPrismaClient();
    await prisma.$connect();
    logger.info('Connected to PostgreSQL');

    const redis = getRedisClient();
    await redis.ping();
    logger.info('Connected to Redis');

    const eventBus = createEventBus(
      {
        brokers: (process.env['KAFKA_BROKERS'] || 'localhost:9092').split(','),
        clientId: 'post-service',
        groupId: 'post-service-group',
      },
      'post-service'
    );
    await eventBus.connectProducer();
    logger.info('Connected to Kafka');

    const app = express();
    app.use(express.json());

    app.use((req, _res, next) => {
      req.requestId = req.headers['x-request-id'] as string || crypto.randomUUID();
      req.userId = req.headers['x-user-id'] as string;
      next();
    });

    app.get('/health', (_req, res) => res.json({ status: 'healthy', service: 'post-service' }));
    app.use('/', postRoutes(prisma, redis, eventBus, logger));
    app.use(errorHandler);

    const server = app.listen(PORT, HOST, () => {
      logger.info(`Post service running on http://${HOST}:${PORT}`);
    });

    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down...`);
      server.close(async () => {
        await eventBus.shutdown();
        await disconnectPrisma();
        await disconnectRedis();
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 30000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error('Failed to start post service', error);
    process.exit(1);
  }
}

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      userId?: string;
    }
  }
}

main();
