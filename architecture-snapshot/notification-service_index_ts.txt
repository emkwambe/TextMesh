// =================================
// TEXTMESH NOTIFICATION SERVICE
// =================================

import express, { Request, Response } from 'express';
import { createLogger } from '@textmesh/logger';
import { getPrismaClient, disconnectPrisma, getRedisClient, disconnectRedis, CacheManager, CacheKeys } from '@textmesh/db-client';
import { createEventBus, EventType, EVENT_TOPICS } from '@textmesh/event-bus';
import { NotificationType } from '@textmesh/shared-types';

const PORT = parseInt(process.env['NOTIFICATION_SERVICE_PORT'] || '3006', 10);
const logger = createLogger({ service: 'notification-service', level: 'info' });

async function main() {
  const prisma = getPrismaClient();
  await prisma.$connect();
  const redis = getRedisClient();
  await redis.ping();
  const cache = new CacheManager(redis, 60);

  const eventBus = createEventBus(
    { brokers: (process.env['KAFKA_BROKERS'] || 'localhost:9092').split(','), clientId: 'notification-service', groupId: 'notification-service-group' },
    'notification-service'
  );
  await eventBus.connectProducer();

  // Subscribe to relevant events
  await eventBus.connectConsumer([EVENT_TOPICS.USERS, EVENT_TOPICS.POSTS, EVENT_TOPICS.GROUPS]);

  // Handle follow events
  eventBus.on(EventType.USER_FOLLOWED, async (event) => {
    const payload = event.payload as { followerId: string; followeeId: string };
    const follower = await prisma.user.findUnique({ where: { id: payload.followerId }, select: { username: true, displayName: true, avatarUrl: true } });
    if (!follower) return;

    await createNotification(prisma, payload.followeeId, 'NEW_FOLLOWER', {
      type: 'new_follower',
      followerId: payload.followerId,
      followerUsername: follower.username,
      followerDisplayName: follower.displayName,
      followerAvatarUrl: follower.avatarUrl,
    });
    await cache.delete(CacheKeys.notificationCount(payload.followeeId));
  });

  // Handle post like events
  eventBus.on(EventType.POST_LIKED, async (event) => {
    const payload = event.payload as { postId: string; userId: string; postAuthorId: string };
    if (payload.userId === payload.postAuthorId) return; // Don't notify self

    const [liker, post] = await Promise.all([
      prisma.user.findUnique({ where: { id: payload.userId }, select: { username: true, displayName: true, avatarUrl: true } }),
      prisma.post.findUnique({ where: { id: payload.postId }, select: { content: true } }),
    ]);
    if (!liker || !post) return;

    await createNotification(prisma, payload.postAuthorId, 'POST_LIKE', {
      type: 'post_like',
      postId: payload.postId,
      postContent: post.content.substring(0, 100),
      likerId: payload.userId,
      likerUsername: liker.username,
      likerDisplayName: liker.displayName,
      likerAvatarUrl: liker.avatarUrl,
    });
    await cache.delete(CacheKeys.notificationCount(payload.postAuthorId));
  });

  // Handle reply events
  eventBus.on(EventType.POST_REPLIED, async (event) => {
    const payload = event.payload as { postId: string; replyId: string; userId: string; postAuthorId: string; content: string };
    if (payload.userId === payload.postAuthorId) return;

    const [replier, post] = await Promise.all([
      prisma.user.findUnique({ where: { id: payload.userId }, select: { username: true, displayName: true, avatarUrl: true } }),
      prisma.post.findUnique({ where: { id: payload.postId }, select: { content: true } }),
    ]);
    if (!replier || !post) return;

    await createNotification(prisma, payload.postAuthorId, 'POST_REPLY', {
      type: 'post_reply',
      postId: payload.postId,
      postContent: post.content.substring(0, 100),
      replyId: payload.replyId,
      replyContent: payload.content.substring(0, 100),
      replierId: payload.userId,
      replierUsername: replier.username,
      replierDisplayName: replier.displayName,
      replierAvatarUrl: replier.avatarUrl,
    });
    await cache.delete(CacheKeys.notificationCount(payload.postAuthorId));
  });

  // Handle group invite events
  eventBus.on(EventType.GROUP_INVITE_SENT, async (event) => {
    const payload = event.payload as { groupId: string; groupName: string; inviterId: string; inviteeId: string };
    const inviter = await prisma.user.findUnique({ where: { id: payload.inviterId }, select: { username: true, displayName: true } });
    const group = await prisma.group.findUnique({ where: { id: payload.groupId }, select: { slug: true } });
    if (!inviter || !group) return;

    await createNotification(prisma, payload.inviteeId, 'GROUP_INVITE', {
      type: 'group_invite',
      groupId: payload.groupId,
      groupName: payload.groupName,
      groupSlug: group.slug,
      inviterId: payload.inviterId,
      inviterUsername: inviter.username,
      inviterDisplayName: inviter.displayName,
    });
    await cache.delete(CacheKeys.notificationCount(payload.inviteeId));
  });

  await eventBus.startConsuming();
  logger.info('Notification service consuming events');

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.requestId = req.headers['x-request-id'] as string || crypto.randomUUID();
    req.userId = req.headers['x-user-id'] as string;
    next();
  });

  app.get('/health', (_req, res) => res.json({ status: 'healthy', service: 'notification-service' }));

  // Get notifications
  app.get('/', async (req: Request, res: Response) => {
    if (!req.userId) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });

    const { cursor, limit } = req.query as { cursor?: string; limit?: string };
    const notifications = await prisma.notification.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit || '20', 10) + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });

    const unreadCount = await prisma.notification.count({ where: { userId: req.userId, read: false } });

    const hasMore = notifications.length > parseInt(limit || '20', 10);
    const items = hasMore ? notifications.slice(0, -1) : notifications;

    res.json({
      success: true,
      data: { items, unreadCount, nextCursor: hasMore && items.length > 0 ? items[items.length - 1]!.id : null, hasMore },
    });
  });

  // Get unread count
  app.get('/count', async (req: Request, res: Response) => {
    if (!req.userId) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });

    const cached = await cache.get<number>(CacheKeys.notificationCount(req.userId));
    if (cached !== null) return res.json({ success: true, data: { count: cached } });

    const count = await prisma.notification.count({ where: { userId: req.userId, read: false } });
    await cache.set(CacheKeys.notificationCount(req.userId), count, 60);

    res.json({ success: true, data: { count } });
  });

  // Mark notification as read
  app.patch('/:id/read', async (req: Request, res: Response) => {
    if (!req.userId) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });

    await prisma.notification.updateMany({
      where: { id: req.params['id'], userId: req.userId },
      data: { read: true, readAt: new Date() },
    });

    await cache.delete(CacheKeys.notificationCount(req.userId));
    res.json({ success: true, data: { message: 'Marked as read' } });
  });

  // Mark all as read
  app.post('/read-all', async (req: Request, res: Response) => {
    if (!req.userId) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });

    const result = await prisma.notification.updateMany({
      where: { userId: req.userId, read: false },
      data: { read: true, readAt: new Date() },
    });

    await cache.delete(CacheKeys.notificationCount(req.userId));
    res.json({ success: true, data: { readCount: result.count } });
  });

  // Register push token
  app.post('/push-token', async (req: Request, res: Response) => {
    if (!req.userId) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });

    const { token, platform, deviceId } = req.body;
    await prisma.pushToken.upsert({
      where: { userId_deviceId: { userId: req.userId, deviceId } },
      create: { userId: req.userId, token, platform, deviceId },
      update: { token, platform, updatedAt: new Date() },
    });

    res.json({ success: true, data: { message: 'Push token registered' } });
  });

  const server = app.listen(PORT, '0.0.0.0', () => logger.info(`Notification service running on port ${PORT}`));
  const shutdown = async () => { server.close(async () => { await eventBus.shutdown(); await disconnectPrisma(); await disconnectRedis(); process.exit(0); }); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

async function createNotification(prisma: any, userId: string, type: string, payload: any) {
  await prisma.notification.create({ data: { userId, type, payload } });
  // TODO: Send push notification via APNs/FCM
}

declare global { namespace Express { interface Request { requestId: string; userId?: string; } } }
main();
