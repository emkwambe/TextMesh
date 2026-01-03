// =================================
// TEXTMESH GROUP SERVICE
// =================================

import express, { Request, Response } from 'express';
import { createLogger } from '@textmesh/logger';
import { getPrismaClient, disconnectPrisma, getRedisClient, disconnectRedis, CacheManager } from '@textmesh/db-client';
import { createEventBus, EventType } from '@textmesh/event-bus';
import { ErrorCode, AppError, GroupPrivacy, GroupRole } from '@textmesh/shared-types';
import { z } from 'zod';

const PORT = parseInt(process.env['GROUP_SERVICE_PORT'] || '3005', 10);
const logger = createLogger({ service: 'group-service', level: 'info' });

const createGroupSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(3).max(100).regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).optional(),
  privacy: z.enum(['PUBLIC', 'PRIVATE', 'SECRET']),
  rules: z.string().max(5000).optional(),
});

async function main() {
  const prisma = getPrismaClient();
  await prisma.$connect();
  const redis = getRedisClient();
  await redis.ping();
  const cache = new CacheManager(redis, 300);

  const eventBus = createEventBus(
    { brokers: (process.env['KAFKA_BROKERS'] || 'localhost:9092').split(','), clientId: 'group-service', groupId: 'group-service-group' },
    'group-service'
  );
  await eventBus.connectProducer();

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.requestId = req.headers['x-request-id'] as string || crypto.randomUUID();
    req.userId = req.headers['x-user-id'] as string;
    next();
  });

  app.get('/health', (_req, res) => res.json({ status: 'healthy', service: 'group-service' }));

  // Create group
  app.post('/', async (req: Request, res: Response) => {
    try {
      if (!req.userId) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      const data = createGroupSchema.parse(req.body);

      const existing = await prisma.group.findUnique({ where: { slug: data.slug } });
      if (existing) return res.status(409).json({ success: false, error: { code: ErrorCode.GROUP_SLUG_TAKEN, message: 'Slug is taken' } });

      const group = await prisma.group.create({
        data: { name: data.name, slug: data.slug, description: data.description, privacy: data.privacy, rules: data.rules, ownerId: req.userId, memberCount: 1 },
      });

      await prisma.groupMembership.create({
        data: { userId: req.userId, groupId: group.id, role: 'OWNER', status: 'ACTIVE' },
      });

      await eventBus.publish(EventType.GROUP_CREATED, { groupId: group.id, name: group.name, slug: group.slug, privacy: group.privacy, ownerId: req.userId });
      res.status(201).json({ success: true, data: { group } });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ success: false, error: { code: error.code || 'INTERNAL_ERROR', message: error.message } });
    }
  });

  // Get group by ID
  app.get('/:id', async (req: Request, res: Response) => {
    try {
      const group = await prisma.group.findUnique({
        where: { id: req.params['id'] },
        include: { owner: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
      });
      if (!group) return res.status(404).json({ success: false, error: { code: ErrorCode.GROUP_NOT_FOUND } });

      // Check visibility for secret groups
      if (group.privacy === 'SECRET' && req.userId) {
        const membership = await prisma.groupMembership.findUnique({
          where: { userId_groupId: { userId: req.userId, groupId: group.id } },
        });
        if (!membership) return res.status(404).json({ success: false, error: { code: ErrorCode.GROUP_NOT_FOUND } });
      }

      let membership = null;
      if (req.userId) {
        membership = await prisma.groupMembership.findUnique({
          where: { userId_groupId: { userId: req.userId, groupId: group.id } },
        });
      }

      res.json({ success: true, data: { group: { ...group, membership, isMember: !!membership && membership.status === 'ACTIVE' } } });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error.message } });
    }
  });

  // Get group by slug
  app.get('/slug/:slug', async (req: Request, res: Response) => {
    const group = await prisma.group.findUnique({ where: { slug: req.params['slug'] } });
    if (!group) return res.status(404).json({ success: false, error: { code: ErrorCode.GROUP_NOT_FOUND } });
    res.redirect(`/groups/${group.id}`);
  });

  // Join group
  app.post('/:id/join', async (req: Request, res: Response) => {
    try {
      if (!req.userId) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });

      const group = await prisma.group.findUnique({ where: { id: req.params['id'] } });
      if (!group) return res.status(404).json({ success: false, error: { code: ErrorCode.GROUP_NOT_FOUND } });

      const existing = await prisma.groupMembership.findUnique({
        where: { userId_groupId: { userId: req.userId, groupId: group.id } },
      });

      if (existing?.status === 'ACTIVE') return res.status(409).json({ success: false, error: { code: ErrorCode.ALREADY_GROUP_MEMBER } });
      if (existing?.status === 'BANNED') return res.status(403).json({ success: false, error: { code: ErrorCode.MEMBERSHIP_BANNED } });
      if (existing?.status === 'PENDING') return res.status(409).json({ success: false, error: { code: ErrorCode.MEMBERSHIP_PENDING } });

      if (group.privacy === 'SECRET') {
        return res.status(403).json({ success: false, error: { code: ErrorCode.GROUP_IS_SECRET, message: 'Cannot join secret group without invite' } });
      }

      const status = group.privacy === 'PRIVATE' ? 'PENDING' : 'ACTIVE';
      await prisma.groupMembership.create({ data: { userId: req.userId, groupId: group.id, role: 'MEMBER', status } });

      if (status === 'ACTIVE') {
        await prisma.group.update({ where: { id: group.id }, data: { memberCount: { increment: 1 } } });
        await eventBus.publish(EventType.GROUP_MEMBER_JOINED, { groupId: group.id, userId: req.userId, role: 'MEMBER' });
      } else {
        await eventBus.publish(EventType.GROUP_JOIN_REQUEST_CREATED, { groupId: group.id, userId: req.userId });
      }

      res.json({ success: true, data: { status: status === 'ACTIVE' ? 'joined' : 'pending' } });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error.message } });
    }
  });

  // Leave group
  app.post('/:id/leave', async (req: Request, res: Response) => {
    try {
      if (!req.userId) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });

      const membership = await prisma.groupMembership.findUnique({
        where: { userId_groupId: { userId: req.userId, groupId: req.params['id']! } },
      });

      if (!membership || membership.status !== 'ACTIVE') {
        return res.status(400).json({ success: false, error: { code: ErrorCode.NOT_GROUP_MEMBER } });
      }

      if (membership.role === 'OWNER') {
        return res.status(400).json({ success: false, error: { code: ErrorCode.CANNOT_LEAVE_AS_OWNER, message: 'Transfer ownership first' } });
      }

      await prisma.groupMembership.delete({ where: { userId_groupId: { userId: req.userId, groupId: req.params['id']! } } });
      await prisma.group.update({ where: { id: req.params['id'] }, data: { memberCount: { decrement: 1 } } });

      res.json({ success: true, data: { message: 'Left group' } });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error.message } });
    }
  });

  // Get group members
  app.get('/:id/members', async (req: Request, res: Response) => {
    const { cursor, limit } = req.query as { cursor?: string; limit?: string };
    const members = await prisma.groupMembership.findMany({
      where: { groupId: req.params['id'], status: 'ACTIVE' },
      include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } } },
      orderBy: { joinedAt: 'desc' },
      take: parseInt(limit || '20', 10) + 1,
      ...(cursor && { cursor: { userId_groupId: { userId: cursor, groupId: req.params['id']! } }, skip: 1 }),
    });

    const hasMore = members.length > parseInt(limit || '20', 10);
    const items = hasMore ? members.slice(0, -1) : members;

    res.json({
      success: true,
      data: {
        items: items.map((m) => ({ ...m.user, role: m.role, joinedAt: m.joinedAt })),
        nextCursor: hasMore && items.length > 0 ? items[items.length - 1]!.userId : null,
        hasMore,
      },
    });
  });

  // Search groups
  app.get('/search', async (req: Request, res: Response) => {
    const { q, cursor, limit } = req.query as { q: string; cursor?: string; limit?: string };
    const groups = await prisma.group.findMany({
      where: {
        privacy: { not: 'SECRET' },
        OR: [{ name: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }],
      },
      orderBy: { memberCount: 'desc' },
      take: parseInt(limit || '20', 10) + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });

    const hasMore = groups.length > parseInt(limit || '20', 10);
    const items = hasMore ? groups.slice(0, -1) : groups;

    res.json({ success: true, data: { items, nextCursor: hasMore && items.length > 0 ? items[items.length - 1]!.id : null, hasMore } });
  });

  // User's groups
  app.get('/user/me', async (req: Request, res: Response) => {
    if (!req.userId) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });

    const memberships = await prisma.groupMembership.findMany({
      where: { userId: req.userId, status: 'ACTIVE' },
      include: { group: true },
      orderBy: { joinedAt: 'desc' },
    });

    res.json({ success: true, data: { groups: memberships.map((m) => ({ ...m.group, role: m.role, joinedAt: m.joinedAt })) } });
  });

  const server = app.listen(PORT, '0.0.0.0', () => logger.info(`Group service running on port ${PORT}`));
  const shutdown = async () => { server.close(async () => { await eventBus.shutdown(); await disconnectPrisma(); await disconnectRedis(); process.exit(0); }); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

declare global { namespace Express { interface Request { requestId: string; userId?: string; } } }
main();
