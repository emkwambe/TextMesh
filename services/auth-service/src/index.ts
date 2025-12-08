// =================================
// TEXTMESH AUTH SERVICE
// =================================

import express from 'express';
import { createLogger } from '@textmesh/logger';
import { getPrismaClient, disconnectPrisma, getRedisClient, disconnectRedis } from '@textmesh/db-client';
import { createEventBus } from '@textmesh/event-bus';
import { authRoutes } from './routes/auth.routes.js';
import { errorHandler } from './middleware/error-handler.js';
import { healthRoutes } from './routes/health.routes.js';

const PORT = parseInt(process.env['AUTH_SERVICE_PORT'] || '3001', 10);
const HOST = process.env['AUTH_SERVICE_HOST'] || '0.0.0.0';

const logger = createLogger({
  service: 'auth-service',
  level: (process.env['LOG_LEVEL'] as 'info' | 'debug' | 'error') || 'info',
});

async function main() {
  try {
    // Initialize database
    const prisma = getPrismaClient();
    await prisma.$connect();
    logger.info('Connected to PostgreSQL');

    // Initialize Redis
    const redis = getRedisClient();
    await redis.ping();
    logger.info('Connected to Redis');

    // Initialize Event Bus
    const eventBus = createEventBus(
      {
        brokers: (process.env['KAFKA_BROKERS'] || 'localhost:9092').split(','),
        clientId: 'auth-service',
        groupId: 'auth-service-group',
      },
      'auth-service'
    );
    await eventBus.connectProducer();
    logger.info('Connected to Kafka');

    // Create Express app
    const app = express();

    // Middleware
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Request ID middleware
    app.use((req, _res, next) => {
      req.requestId = req.headers['x-request-id'] as string || crypto.randomUUID();
      next();
    });

    // Routes
    app.use('/health', healthRoutes);
    app.use('/', authRoutes(prisma, redis, eventBus, logger));

    // Error handler
    app.use(errorHandler);

    // Start server
    const server = app.listen(PORT, HOST, () => {
      logger.info(`Auth service running on http://${HOST}:${PORT}`);
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down...`);

      server.close(async () => {
        await eventBus.shutdown();
        await disconnectPrisma();
        await disconnectRedis();
        logger.info('Connections closed');
        process.exit(0);
      });

      setTimeout(() => {
        logger.error('Forced shutdown');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start auth service', error);
    process.exit(1);
  }
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      requestId: string;
      userId?: string;
    }
  }
}

main();
