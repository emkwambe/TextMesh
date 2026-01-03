// =================================
// TEXTMESH SEARCH SERVICE
// =================================

import express, { Request, Response } from 'express';
import { Client } from '@elastic/elasticsearch';
import { createLogger } from '@textmesh/logger';
import { getPrismaClient, disconnectPrisma, getRedisClient, disconnectRedis, CacheManager } from '@textmesh/db-client';
import { createEventBus, EventType, EVENT_TOPICS } from '@textmesh/event-bus';

const PORT = parseInt(process.env['SEARCH_SERVICE_PORT'] || '3008', 10);
const logger = createLogger({ service: 'search-service', level: 'info' });

const ELASTICSEARCH_URL = process.env['ELASTICSEARCH_URL'] || 'http://localhost:9200';

async function main() {
  const prisma = getPrismaClient();
  await prisma.$connect();
  const redis = getRedisClient();
  await redis.ping();
  const cache = new CacheManager(redis, 60);

  // Initialize Elasticsearch client
  const esClient = new Client({ node: ELASTICSEARCH_URL });

  // Check ES connection
  try {
    await esClient.ping();
    logger.info('Connected to Elasticsearch');
  } catch (error) {
    logger.warn('Elasticsearch not available, using database fallback');
  }

  const eventBus = createEventBus(
    { brokers: (process.env['KAFKA_BROKERS'] || 'localhost:9092').split(','), clientId: 'search-service', groupId: 'search-service-group' },
    'search-service'
  );
  await eventBus.connectProducer();

  // Subscribe to events for indexing
  await eventBus.connectConsumer([EVENT_TOPICS.USERS, EVENT_TOPICS.POSTS, EVENT_TOPICS.GROUPS]);

  // Index new posts
  eventBus.on(EventType.POST_CREATED, async (event) => {
    const payload = event.payload as { postId: string; userId: string; content: string; visibility: string };
    if (payload.visibility !== 'PUBLIC') return;

    try {
      await esClient.index({
        index: 'posts',
        id: payload.postId,
        document: { id: payload.postId, content: payload.content, userId: payload.userId, createdAt: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to index post', error);
    }
  });

  // Index new users
  eventBus.on(EventType.USER_CREATED, async (event) => {
    const payload = event.payload as { userId: string; username: string };
    try {
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, username: true, displayName: true, bio: true },
      });
      if (user) {
        await esClient.index({
          index: 'users',
          id: user.id,
          document: { id: user.id, username: user.username, displayName: user.displayName, bio: user.bio },
        });
      }
    } catch (error) {
      logger.error('Failed to index user', error);
    }
  });

  await eventBus.startConsuming();

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.requestId = req.headers['x-request-id'] as string || crypto.randomUUID();
    req.userId = req.headers['x-user-id'] as string;
    next();
  });

  app.get('/health', (_req, res) => res.json({ status: 'healthy', service: 'search-service' }));

  // Global search
  app.get('/', async (req: Request, res: Response) => {
    const { q, type, cursor, limit } = req.query as { q: string; type?: string; cursor?: string; limit?: string };

    if (!q || q.length < 2) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Query must be at least 2 characters' } });
    }

    const limitNum = Math.min(parseInt(limit || '20', 10), 100);

    try {
      // Try Elasticsearch first
      const useES = await esClient.ping().then(() => true).catch(() => false);

      if (useES && (!type || type === 'all' || type === 'posts')) {
        const postsResult = await esClient.search({
          index: 'posts',
          query: { match: { content: q } },
          size: limitNum,
        });

        if (type === 'posts') {
          return res.json({
            success: true,
            data: {
              posts: { items: postsResult.hits.hits.map((h: any) => h._source), hasMore: false, nextCursor: null },
            },
          });
        }
      }

      // Fallback to database search
      const [users, posts, groups, hashtags] = await Promise.all([
        (!type || type === 'all' || type === 'users') ? prisma.user.findMany({
          where: {
            status: 'ACTIVE',
            OR: [
              { username: { contains: q, mode: 'insensitive' } },
              { displayName: { contains: q, mode: 'insensitive' } },
            ],
          },
          select: { id: true, username: true, displayName: true, avatarUrl: true, bio: true, isVerified: true, followerCount: true },
          orderBy: { followerCount: 'desc' },
          take: limitNum,
        }) : [],
        (!type || type === 'all' || type === 'posts') ? prisma.post.findMany({
          where: {
            isDeleted: false,
            visibility: 'PUBLIC',
            content: { contains: q, mode: 'insensitive' },
          },
          include: {
            user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: limitNum,
        }) : [],
        (!type || type === 'all' || type === 'groups') ? prisma.group.findMany({
          where: {
            privacy: { not: 'SECRET' },
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { description: { contains: q, mode: 'insensitive' } },
            ],
          },
          select: { id: true, name: true, slug: true, description: true, privacy: true, memberCount: true, avatarUrl: true },
          orderBy: { memberCount: 'desc' },
          take: limitNum,
        }) : [],
        (!type || type === 'all' || type === 'hashtags') ? prisma.hashtag.findMany({
          where: { tag: { contains: q.toLowerCase() } },
          orderBy: { postCount: 'desc' },
          take: 10,
        }) : [],
      ]);

      res.json({
        success: true,
        data: {
          users: { items: users, hasMore: users.length >= limitNum, nextCursor: null },
          posts: { items: posts, hasMore: posts.length >= limitNum, nextCursor: null },
          groups: { items: groups, hasMore: groups.length >= limitNum, nextCursor: null },
          hashtags: hashtags.map((h) => h.tag),
        },
      });
    } catch (error: any) {
      logger.error('Search error', error);
      res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error.message } });
    }
  });

  // Search users
  app.get('/users', async (req: Request, res: Response) => {
    const { q, cursor, limit } = req.query as { q: string; cursor?: string; limit?: string };
    const limitNum = Math.min(parseInt(limit || '20', 10), 100);

    const users = await prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        OR: [
          { username: { contains: q, mode: 'insensitive' } },
          { displayName: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, username: true, displayName: true, avatarUrl: true, bio: true, isVerified: true, followerCount: true },
      orderBy: { followerCount: 'desc' },
      take: limitNum + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });

    const hasMore = users.length > limitNum;
    const items = hasMore ? users.slice(0, -1) : users;

    res.json({ success: true, data: { items, nextCursor: hasMore && items.length > 0 ? items[items.length - 1]!.id : null, hasMore } });
  });

  // Search posts
  app.get('/posts', async (req: Request, res: Response) => {
    const { q, cursor, limit } = req.query as { q: string; cursor?: string; limit?: string };
    const limitNum = Math.min(parseInt(limit || '20', 10), 100);

    const posts = await prisma.post.findMany({
      where: {
        isDeleted: false,
        visibility: 'PUBLIC',
        content: { contains: q, mode: 'insensitive' },
      },
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limitNum + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });

    const hasMore = posts.length > limitNum;
    const items = hasMore ? posts.slice(0, -1) : posts;

    res.json({ success: true, data: { items, nextCursor: hasMore && items.length > 0 ? items[items.length - 1]!.id : null, hasMore } });
  });

  // Search groups
  app.get('/groups', async (req: Request, res: Response) => {
    const { q, cursor, limit } = req.query as { q: string; cursor?: string; limit?: string };
    const limitNum = Math.min(parseInt(limit || '20', 10), 100);

    const groups = await prisma.group.findMany({
      where: {
        privacy: { not: 'SECRET' },
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
        ],
      },
      orderBy: { memberCount: 'desc' },
      take: limitNum + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });

    const hasMore = groups.length > limitNum;
    const items = hasMore ? groups.slice(0, -1) : groups;

    res.json({ success: true, data: { items, nextCursor: hasMore && items.length > 0 ? items[items.length - 1]!.id : null, hasMore } });
  });

  // Trending hashtags
  app.get('/trending/hashtags', async (_req: Request, res: Response) => {
    const hashtags = await prisma.hashtag.findMany({
      orderBy: { postCount: 'desc' },
      take: 20,
    });

    res.json({ success: true, data: { hashtags: hashtags.map((h) => ({ tag: h.tag, postCount: h.postCount })) } });
  });

  const server = app.listen(PORT, '0.0.0.0', () => logger.info(`Search service running on port ${PORT}`));
  const shutdown = async () => { server.close(async () => { await eventBus.shutdown(); await disconnectPrisma(); await disconnectRedis(); process.exit(0); }); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

declare global { namespace Express { interface Request { requestId: string; userId?: string; } } }
main();
