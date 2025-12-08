// =================================
// TEXTMESH MODERATION SERVICE
// =================================

import express, { Request, Response } from 'express';
import { createLogger } from '@textmesh/logger';
import { getPrismaClient, disconnectPrisma, getRedisClient, disconnectRedis } from '@textmesh/db-client';
import { createEventBus, EventType } from '@textmesh/event-bus';
import { ErrorCode, ReportReason, ReportTargetType, ReportStatus } from '@textmesh/shared-types';
import { z } from 'zod';

const PORT = parseInt(process.env['MODERATION_SERVICE_PORT'] || '3007', 10);
const logger = createLogger({ service: 'moderation-service', level: 'info' });

const createReportSchema = z.object({
  targetType: z.enum(['USER', 'POST', 'GROUP']),
  targetId: z.string().uuid(),
  reason: z.enum(['SPAM', 'HARASSMENT', 'HATE_SPEECH', 'VIOLENCE', 'MISINFORMATION', 'NUDITY', 'SELF_HARM', 'IMPERSONATION', 'COPYRIGHT', 'OTHER']),
  description: z.string().max(1000).optional(),
});

const resolveReportSchema = z.object({
  status: z.enum(['RESOLVED', 'DISMISSED']),
  resolutionNote: z.string().max(1000).optional(),
  action: z.object({
    type: z.enum(['warn', 'delete_content', 'suspend_user', 'ban_user', 'delete_group']),
    duration: z.number().optional(),
    reason: z.string(),
  }).optional(),
});

async function main() {
  const prisma = getPrismaClient();
  await prisma.$connect();
  const redis = getRedisClient();
  await redis.ping();

  const eventBus = createEventBus(
    { brokers: (process.env['KAFKA_BROKERS'] || 'localhost:9092').split(','), clientId: 'moderation-service', groupId: 'moderation-service-group' },
    'moderation-service'
  );
  await eventBus.connectProducer();

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.requestId = req.headers['x-request-id'] as string || crypto.randomUUID();
    req.userId = req.headers['x-user-id'] as string;
    req.userRole = req.headers['x-user-role'] as string;
    next();
  });

  app.get('/health', (_req, res) => res.json({ status: 'healthy', service: 'moderation-service' }));

  // Create report
  app.post('/reports', async (req: Request, res: Response) => {
    try {
      if (!req.userId) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });

      const data = createReportSchema.parse(req.body);

      // Check if user already reported this content
      const existing = await prisma.report.findFirst({
        where: { reporterId: req.userId, targetType: data.targetType, targetId: data.targetId },
      });

      if (existing) {
        return res.status(409).json({ success: false, error: { code: ErrorCode.ALREADY_REPORTED, message: 'You have already reported this content' } });
      }

      // Validate target exists
      let targetExists = false;
      if (data.targetType === 'USER') targetExists = !!(await prisma.user.findUnique({ where: { id: data.targetId } }));
      else if (data.targetType === 'POST') targetExists = !!(await prisma.post.findUnique({ where: { id: data.targetId } }));
      else if (data.targetType === 'GROUP') targetExists = !!(await prisma.group.findUnique({ where: { id: data.targetId } }));

      if (!targetExists) {
        return res.status(404).json({ success: false, error: { code: ErrorCode.NOT_FOUND, message: 'Target not found' } });
      }

      // Don't allow reporting self
      if (data.targetType === 'USER' && data.targetId === req.userId) {
        return res.status(400).json({ success: false, error: { code: ErrorCode.CANNOT_REPORT_SELF, message: 'Cannot report yourself' } });
      }

      const report = await prisma.report.create({
        data: { reporterId: req.userId, ...data },
      });

      await eventBus.publish(EventType.REPORT_CREATED, {
        reportId: report.id,
        reporterId: req.userId,
        targetType: data.targetType,
        targetId: data.targetId,
        reason: data.reason,
      });

      logger.info('Report created', { reportId: report.id, targetType: data.targetType, targetId: data.targetId });
      res.status(201).json({ success: true, data: { report } });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ success: false, error: { code: ErrorCode.VALIDATION_ERROR, details: error.errors } });
      }
      res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error.message } });
    }
  });

  // Get reports (moderators/admins only)
  app.get('/reports', async (req: Request, res: Response) => {
    if (!req.userRole || !['ADMIN', 'MODERATOR'].includes(req.userRole)) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Moderator access required' } });
    }

    const { status, cursor, limit } = req.query as { status?: string; cursor?: string; limit?: string };
    const reports = await prisma.report.findMany({
      where: status ? { status: status as any } : undefined,
      include: {
        reporter: { select: { id: true, username: true, displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit || '20', 10) + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });

    const hasMore = reports.length > parseInt(limit || '20', 10);
    const items = hasMore ? reports.slice(0, -1) : reports;

    res.json({ success: true, data: { items, nextCursor: hasMore && items.length > 0 ? items[items.length - 1]!.id : null, hasMore } });
  });

  // Get report by ID
  app.get('/reports/:id', async (req: Request, res: Response) => {
    if (!req.userRole || !['ADMIN', 'MODERATOR'].includes(req.userRole)) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN' } });
    }

    const report = await prisma.report.findUnique({
      where: { id: req.params['id'] },
      include: {
        reporter: { select: { id: true, username: true, displayName: true } },
        resolver: { select: { id: true, username: true, displayName: true } },
      },
    });

    if (!report) return res.status(404).json({ success: false, error: { code: ErrorCode.REPORT_NOT_FOUND } });
    res.json({ success: true, data: { report } });
  });

  // Resolve report
  app.post('/reports/:id/resolve', async (req: Request, res: Response) => {
    try {
      if (!req.userId || !req.userRole || !['ADMIN', 'MODERATOR'].includes(req.userRole)) {
        return res.status(403).json({ success: false, error: { code: 'FORBIDDEN' } });
      }

      const data = resolveReportSchema.parse(req.body);

      const report = await prisma.report.findUnique({ where: { id: req.params['id'] } });
      if (!report) return res.status(404).json({ success: false, error: { code: ErrorCode.REPORT_NOT_FOUND } });

      if (report.status !== 'OPEN' && report.status !== 'IN_REVIEW') {
        return res.status(400).json({ success: false, error: { code: ErrorCode.REPORT_ALREADY_RESOLVED } });
      }

      // Apply moderation action if specified
      if (data.action) {
        await applyModerationAction(prisma, report.targetType, report.targetId, data.action, req.userId);
      }

      const updated = await prisma.report.update({
        where: { id: req.params['id'] },
        data: {
          status: data.status,
          resolvedBy: req.userId,
          resolvedAt: new Date(),
          resolutionNote: data.resolutionNote,
        },
      });

      // Log moderation action
      await prisma.moderationLog.create({
        data: {
          moderatorId: req.userId,
          action: `REPORT_${data.status}`,
          targetType: report.targetType,
          targetId: report.targetId,
          reason: data.resolutionNote || 'No reason provided',
          metadata: data.action ? { action: data.action } : undefined,
        },
      });

      await eventBus.publish(EventType.REPORT_RESOLVED, { reportId: report.id, status: data.status, resolvedBy: req.userId });

      logger.info('Report resolved', { reportId: report.id, status: data.status, resolvedBy: req.userId });
      res.json({ success: true, data: { report: updated } });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ success: false, error: { code: error.code || 'INTERNAL_ERROR', message: error.message } });
    }
  });

  // Get moderation logs (admins only)
  app.get('/logs', async (req: Request, res: Response) => {
    if (req.userRole !== 'ADMIN') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
    }

    const { cursor, limit } = req.query as { cursor?: string; limit?: string };
    const logs = await prisma.moderationLog.findMany({
      include: { moderator: { select: { id: true, username: true, displayName: true } } },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit || '50', 10) + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });

    const hasMore = logs.length > parseInt(limit || '50', 10);
    const items = hasMore ? logs.slice(0, -1) : logs;

    res.json({ success: true, data: { items, nextCursor: hasMore && items.length > 0 ? items[items.length - 1]!.id : null, hasMore } });
  });

  const server = app.listen(PORT, '0.0.0.0', () => logger.info(`Moderation service running on port ${PORT}`));
  const shutdown = async () => { server.close(async () => { await eventBus.shutdown(); await disconnectPrisma(); await disconnectRedis(); process.exit(0); }); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

async function applyModerationAction(prisma: any, targetType: string, targetId: string, action: any, moderatorId: string) {
  switch (action.type) {
    case 'delete_content':
      if (targetType === 'POST') {
        await prisma.post.update({ where: { id: targetId }, data: { isDeleted: true, deletedAt: new Date() } });
      }
      break;
    case 'suspend_user':
      if (targetType === 'USER') {
        await prisma.user.update({ where: { id: targetId }, data: { status: 'SUSPENDED' } });
      }
      break;
    case 'ban_user':
      if (targetType === 'USER') {
        await prisma.user.update({ where: { id: targetId }, data: { status: 'SUSPENDED' } });
      }
      break;
    case 'delete_group':
      if (targetType === 'GROUP') {
        await prisma.group.update({ where: { id: targetId }, data: { isArchived: true } });
      }
      break;
  }
}

declare global { namespace Express { interface Request { requestId: string; userId?: string; userRole?: string; } } }
main();
