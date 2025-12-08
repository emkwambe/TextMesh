// =================================
// TEXTMESH FEED SERVICE
// =================================

import express from 'express';
import { createLogger } from '@textmesh/logger';
import { getPrismaClient, disconnectPrisma, getRedisClient, disconnectRedis } from '@textmesh/db-client';
import { createEventBus, EventType } from '@textmesh/event-bus';
import { FeedService } from './services/feed.service.js';
import { fanoutService, initializeFanoutHandlers } from './services/fanout.service.js';
import { precomputeService, startPrecomputeJobs } from './services/precompute.service.js';

const PORT = parseInt(process.env['FEED_SERVICE_PORT'] || '3004', 10);
const logger = createLogger({ service: 'feed-service', level: 'info' });

async function main() {
  const prisma = getPrismaClient();
  await prisma.$connect();
  logger.info('Connected to PostgreSQL');

  const redis = getRedisClient();
  await redis.ping();
  logger.info('Connected to Redis');

  const eventBus = createEventBus(
    { brokers: (process.env['KAFKA_BROKERS'] || 'localhost:9092').split(','), clientId: 'feed-service', groupId: 'feed-service-group' },
    'feed-service'
  );
  await eventBus.connectProducer();

  const feedService = new FeedService(prisma, redis, logger);

  // Subscribe to events for feed fan-out
  await eventBus.connectConsumer(['textmesh.posts', 'textmesh.users']);
  eventBus.on(EventType.POST_CREATED, async (event) => {
    await feedService.fanOutPost(event.payload as any);
  });
  await eventBus.startConsuming();

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.requestId = req.headers['x-request-id'] as string || crypto.randomUUID();
    req.userId = req.headers['x-user-id'] as string;
    next();
  });

  app.get('/health', (_req, res) => res.json({ status: 'healthy', service: 'feed-service' }));

  // Home feed
  app.get('/home', async (req, res) => {
    if (!req.userId) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    const { cursor, limit } = req.query as { cursor?: string; limit?: string };
    const feed = await feedService.getHomeFeed(req.userId, cursor, parseInt(limit || '20', 10));
    res.json({ success: true, data: feed });
  });

  // Group feed
  app.get('/group/:groupId', async (req, res) => {
    if (!req.userId) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    const { cursor, limit } = req.query as { cursor?: string; limit?: string };
    const feed = await feedService.getGroupFeed(req.params['groupId']!, req.userId, cursor, parseInt(limit || '20', 10));
    res.json({ success: true, data: feed });
  });

  // User timeline
  app.get('/user/:userId', async (req, res) => {
    const { cursor, limit } = req.query as { cursor?: string; limit?: string };
    const feed = await feedService.getUserTimeline(req.params['userId']!, req.userId, cursor, parseInt(limit || '20', 10));
    res.json({ success: true, data: feed });
  });

  // Discover/Trending feed
  app.get('/discover', async (req, res) => {
    const { cursor, limit } = req.query as { cursor?: string; limit?: string };
    const feed = await feedService.getDiscoverFeed(req.userId, cursor, parseInt(limit || '20', 10));
    res.json({ success: true, data: feed });
  });

  // For You feed (personalized)
  app.get('/for-you', async (req, res) => {
    if (!req.userId) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    const { limit } = req.query as { limit?: string };

    // Compute on-demand if not cached
    await precomputeService.computeForYouFeed(req.userId);

    const feedKey = `feed:for_you:${req.userId}`;
    const entries = await redis.zrevrange(feedKey, 0, parseInt(limit || '20', 10) - 1);
    const posts = entries.map((e: string) => JSON.parse(e));

    res.json({ success: true, data: { posts } });
  });

  // Trending feed
  app.get('/trending', async (req, res) => {
    const { limit } = req.query as { limit?: string };
    const entries = await redis.zrevrange('feed:trending', 0, parseInt(limit || '20', 10) - 1);
    const posts = entries.map((e: string) => JSON.parse(e));
    res.json({ success: true, data: { posts } });
  });

  // Trending hashtags
  app.get('/trending/hashtags', async (req, res) => {
    const hashtags = await redis.zrevrange('trending:hashtags', 0, 19, 'WITHSCORES');
    const result = [];
    for (let i = 0; i < hashtags.length; i += 2) {
      result.push({ tag: hashtags[i], count: parseInt(hashtags[i + 1], 10) });
    }
    res.json({ success: true, data: { hashtags: result } });
  });

  // Rebuild user feed
  app.post('/rebuild', async (req, res) => {
    if (!req.userId) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    await fanoutService.rebuildFeed(req.userId);
    res.json({ success: true, message: 'Feed rebuilt' });
  });

  // Initialize fanout event handlers
  await initializeFanoutHandlers();
  logger.info('Fanout handlers initialized');

  // Start pre-compute jobs
  startPrecomputeJobs();
  logger.info('Pre-compute jobs started');

  const server = app.listen(PORT, '0.0.0.0', () => logger.info(`Feed service running on port ${PORT}`));

  const shutdown = async () => {
    server.close(async () => {
      await eventBus.shutdown();
      await disconnectPrisma();
      await disconnectRedis();
      process.exit(0);
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

declare global { namespace Express { interface Request { requestId: string; userId?: string; } } }
main();
