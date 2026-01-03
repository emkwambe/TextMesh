// =================================
// TEXTMESH TRUST & SAFETY SERVICE
// Comprehensive Content Moderation System
// =================================

import express, { Request, Response, Application } from 'express';
import { createLogger } from '@textmesh/logger';
import { getRedisClient, getPrismaClient } from '@textmesh/db-client';

const app: Application = express();
const logger = createLogger({ service: 'trust-safety-service' });
const PORT = process.env['PORT'] || 3010;

app.use(express.json());

// ============ IMPORTS ============

import { ContentModerator } from './moderation/ContentModerator';
import { ToxicityDetector } from './detection/ToxicityDetector';
import { SpamDetector } from './detection/SpamDetector';
import { BehaviorAnalyzer } from './detection/BehaviorAnalyzer';
import { RiskScorer } from './scoring/RiskScorer';
import { ShadowBanManager } from './enforcement/ShadowBanManager';
import { AppealManager } from './enforcement/AppealManager';
import { AuditLogger } from './audit/AuditLogger';

// ============ SERVICE INSTANCES ============

let contentModerator: ContentModerator;
let toxicityDetector: ToxicityDetector;
let spamDetector: SpamDetector;
let behaviorAnalyzer: BehaviorAnalyzer;
let riskScorer: RiskScorer;
let shadowBanManager: ShadowBanManager;
let appealManager: AppealManager;
let auditLogger: AuditLogger;

// ============ CONTENT MODERATION ENDPOINTS ============

// Analyze content before publishing
app.post('/api/trust-safety/analyze', async (req: Request, res: Response) => {
  try {
    const { content, contentType, userId, metadata } = req.body as ContentAnalysisRequest;

    const analysis = await contentModerator.analyzeContent({
      content,
      contentType,
      userId,
      metadata,
    });

    res.json({
      success: true,
      data: analysis,
    });
  } catch (error) {
    logger.error('Content analysis failed', error);
    res.status(500).json({ success: false, error: 'Analysis failed' });
  }
});

// Report content
app.post('/api/trust-safety/report', async (req: Request, res: Response) => {
  try {
    const { reporterId, contentId, contentType, reason, details } = req.body as ReportRequest;

    const report = await contentModerator.createReport({
      reporterId,
      contentId,
      contentType,
      reason,
      details,
    });

    await auditLogger.logAction({
      action: 'REPORT_CREATED',
      actorId: reporterId,
      targetId: contentId,
      targetType: contentType,
      details: { reason },
    });

    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    logger.error('Failed to create report', error);
    res.status(500).json({ success: false, error: 'Failed to create report' });
  }
});

// Get moderation queue (admin)
app.get('/api/trust-safety/queue', async (req: Request, res: Response) => {
  try {
    const { status, priority, limit = 50, offset = 0 } = req.query as QueueQuery;

    const queue = await contentModerator.getQueue({
      status: status as ModerationStatus,
      priority: priority as Priority,
      limit: Number(limit),
      offset: Number(offset),
    });

    res.json({
      success: true,
      data: queue,
    });
  } catch (error) {
    logger.error('Failed to get moderation queue', error);
    res.status(500).json({ success: false, error: 'Failed to get queue' });
  }
});

// Take moderation action (admin)
app.post('/api/trust-safety/action', async (req: Request, res: Response) => {
  try {
    const { moderatorId, reportId, action, reason, duration } = req.body as ModerationActionRequest;

    const result = await contentModerator.takeAction({
      moderatorId,
      reportId,
      action,
      reason,
      duration,
    });

    await auditLogger.logAction({
      action: `MODERATION_${action.toUpperCase()}`,
      actorId: moderatorId,
      targetId: reportId,
      targetType: 'report',
      details: { reason, duration },
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Moderation action failed', error);
    res.status(500).json({ success: false, error: 'Action failed' });
  }
});

// ============ USER RISK ENDPOINTS ============

// TODO: Re-enable when RiskScorer is available
app.get('/api/trust-safety/risk/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const riskProfile = await riskScorer.getUserRiskProfile(userId);

    res.json({
      success: true,
      data: riskProfile,
    });
  } catch (error) {
    logger.error('Failed to get risk score', error);
    res.status(500).json({ success: false, error: 'Failed to get risk score' });
  }
});

app.post('/api/trust-safety/risk/update', async (req: Request, res: Response) => {
  try {
    const { userId, factor, value } = req.body as RiskUpdateRequest;

    await riskScorer.updateRiskFactor(userId, factor, value);

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to update risk factor', error);
    res.status(500).json({ success: false, error: 'Failed to update' });
  }
});

// ============ SHADOW BAN ENDPOINTS ============

app.get('/api/trust-safety/shadowban/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const status = await shadowBanManager.getStatus(userId);

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    logger.error('Failed to get shadow ban status', error);
    res.status(500).json({ success: false, error: 'Failed to get status' });
  }
});

app.post('/api/trust-safety/shadowban', async (req: Request, res: Response) => {
  try {
    const { userId, moderatorId, reason, level, duration } = req.body as ShadowBanRequest;

    await shadowBanManager.applyShadowBan({
      userId,
      moderatorId,
      reason,
      level,
      duration,
    });

    await auditLogger.logAction({
      action: 'SHADOW_BAN_APPLIED',
      actorId: moderatorId,
      targetId: userId,
      targetType: 'user',
      details: { reason, level, duration },
    });

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to apply shadow ban', error);
    res.status(500).json({ success: false, error: 'Failed to apply shadow ban' });
  }
});

app.delete('/api/trust-safety/shadowban/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { moderatorId, reason } = req.body as { moderatorId: string; reason: string };

    await shadowBanManager.removeShadowBan(userId, moderatorId, reason);

    await auditLogger.logAction({
      action: 'SHADOW_BAN_REMOVED',
      actorId: moderatorId,
      targetId: userId,
      targetType: 'user',
      details: { reason },
    });

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to remove shadow ban', error);
    res.status(500).json({ success: false, error: 'Failed to remove shadow ban' });
  }
});

// ============ APPEAL ENDPOINTS ============

app.post('/api/trust-safety/appeal', async (req: Request, res: Response) => {
  try {
    const { userId, actionId, reason, evidence } = req.body as AppealRequest;

    const appeal = await appealManager.submitAppeal({
      userId,
      actionId,
      reason,
      evidence,
    });

    res.json({
      success: true,
      data: appeal,
    });
  } catch (error) {
    logger.error('Failed to submit appeal', error);
    res.status(500).json({ success: false, error: 'Failed to submit appeal' });
  }
});

app.get('/api/trust-safety/appeal/:appealId', async (req: Request, res: Response) => {
  try {
    const { appealId } = req.params;
    const appeal = await appealManager.getAppeal(appealId);

    res.json({
      success: true,
      data: appeal,
    });
  } catch (error) {
    logger.error('Failed to get appeal', error);
    res.status(500).json({ success: false, error: 'Failed to get appeal' });
  }
});

app.post('/api/trust-safety/appeal/:appealId/process', async (req: Request, res: Response) => {
  try {
    const { appealId } = req.params;
    const { moderatorId, decision, reason } = req.body as AppealDecisionRequest;

    const result = await appealManager.processAppeal({
      appealId,
      moderatorId,
      decision,
      reason,
    });

    await auditLogger.logAction({
      action: `APPEAL_${decision.toUpperCase()}`,
      actorId: moderatorId,
      targetId: appealId,
      targetType: 'appeal',
      details: { reason },
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Failed to process appeal', error);
    res.status(500).json({ success: false, error: 'Failed to process appeal' });
  }
});

// ============ AUDIT ENDPOINTS ============

app.get('/api/trust-safety/audit', async (req: Request, res: Response) => {
  try {
    const { actorId, targetId, action, startDate, endDate, limit = 100 } = req.query;

    const logs = await auditLogger.getLogs({
      actorId: actorId as string,
      targetId: targetId as string,
      action: action as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      limit: Number(limit),
    });

    res.json({
      success: true,
      data: logs,
    });
  } catch (error) {
    logger.error('Failed to get audit logs', error);
    res.status(500).json({ success: false, error: 'Failed to get logs' });
  }
});

// ============ ANALYTICS ENDPOINTS ============

// Get moderation stats
app.get('/api/trust-safety/stats', async (req: Request, res: Response) => {
  try {
    const { period = '24h' } = req.query;

    const stats = await contentModerator.getStats(period as string);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Failed to get stats', error);
    res.status(500).json({ success: false, error: 'Failed to get stats' });
  }
});

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'healthy', service: 'trust-safety-service' });
});

// ============ TYPES ============

interface ContentAnalysisRequest {
  content: string;
  contentType: 'post' | 'comment' | 'message' | 'bio' | 'username';
  userId: string;
  metadata?: Record<string, unknown>;
}

interface ReportRequest {
  reporterId: string;
  contentId: string;
  contentType: 'post' | 'comment' | 'user' | 'message' | 'group';
  reason: ReportReason;
  details?: string;
}

type ReportReason =
  | 'spam'
  | 'harassment'
  | 'hate_speech'
  | 'violence'
  | 'nudity'
  | 'misinformation'
  | 'impersonation'
  | 'copyright'
  | 'other';

interface QueueQuery {
  status?: string;
  priority?: string;
  limit?: string;
  offset?: string;
}

type ModerationStatus = 'pending' | 'in_review' | 'resolved' | 'escalated';
type Priority = 'low' | 'medium' | 'high' | 'critical';

interface ModerationActionRequest {
  moderatorId: string;
  reportId: string;
  action: ModerationAction;
  reason: string;
  duration?: number;
}

type ModerationAction =
  | 'approve'
  | 'remove'
  | 'warn'
  | 'mute'
  | 'suspend'
  | 'ban'
  | 'escalate'
  | 'dismiss';

interface RiskUpdateRequest {
  userId: string;
  factor: string;
  value: number;
}

interface ShadowBanRequest {
  userId: string;
  moderatorId: string;
  reason: string;
  level: ShadowBanLevel;
  duration?: number;
}

type ShadowBanLevel = 'light' | 'medium' | 'heavy' | 'full';

interface AppealRequest {
  userId: string;
  actionId: string;
  reason: string;
  evidence?: string[];
}

interface AppealDecisionRequest {
  moderatorId: string;
  decision: 'approved' | 'denied' | 'partial';
  reason: string;
}

// ============ STARTUP ============

async function main() {
  try {
    const redis = getRedisClient();
    const prisma = getPrismaClient();

    // Initialize services
    toxicityDetector = new ToxicityDetector();
    spamDetector = new SpamDetector(redis);
    behaviorAnalyzer = new BehaviorAnalyzer(redis, prisma);
    riskScorer = new RiskScorer(redis, prisma);
    shadowBanManager = new ShadowBanManager(redis, prisma);
    appealManager = new AppealManager(redis, prisma);
    auditLogger = new AuditLogger(prisma);
    contentModerator = new ContentModerator(
      redis,
      prisma,
      toxicityDetector,
      spamDetector,
      behaviorAnalyzer,
      riskScorer
    );

    app.listen(PORT, () => {
      logger.info(`Trust & Safety service running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start trust & safety service', error);
    process.exit(1);
  }
}

main();

export { app };
