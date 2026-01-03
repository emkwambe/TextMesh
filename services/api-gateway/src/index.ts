// =================================
// TEXTMESH API GATEWAY
// =================================

import { createApp } from './app.js';
import { createLogger } from '@textmesh/logger';
import { getRedisClient, disconnectRedis } from '@textmesh/db-client';

const PORT = parseInt(process.env['API_GATEWAY_PORT'] || '3000', 10);
const HOST = process.env['API_GATEWAY_HOST'] || '0.0.0.0';

const logger = createLogger({
  service: 'api-gateway',
  level: (process.env['LOG_LEVEL'] as 'info' | 'debug' | 'error') || 'info',
});

async function main() {
  try {
    // Initialize Redis connection
    const redis = getRedisClient();
    await redis.ping();
    logger.info('Connected to Redis');

    // Create and start the Express app
    const app = createApp(logger);

    const server = app.listen(PORT, HOST, () => {
      logger.info(`API Gateway running on http://${HOST}:${PORT}`);
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);

      server.close(async () => {
        logger.info('HTTP server closed');
        await disconnectRedis();
        logger.info('Redis connection closed');
        process.exit(0);
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start API Gateway', error);
    process.exit(1);
  }
}

main();
