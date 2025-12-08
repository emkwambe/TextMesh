// =================================
// TEXTMESH CONTENT MODERATOR
// Main Moderation Pipeline
// =================================

import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { ToxicityDetector } from '../detection/ToxicityDetector';
import { SpamDetector } from '../detection/SpamDetector';
import { BehaviorAnalyzer } from '../detection/BehaviorAnalyzer';
import { RiskScorer } from '../scoring/RiskScorer';

// ============ TYPES ============

export interface ContentAnalysisRequest {
  content: string;
  contentType: 'post' | 'comment' | 'message' | 'bio' | 'username';
  userId: string;
  metadata?: Record<string, unknown>;
}

export interface ContentAnalysisResult {
  id: string;
  isAllowed: boolean;
  requiresReview: boolean;
  flags: ContentFlag[];
  scores: ContentScores;
  action: RecommendedAction;
  confidence: number;
}

export interface ContentFlag {
  type: FlagType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  details?: string;
}

type FlagType =
  | 'toxicity'
  | 'spam'
  | 'harassment'
  | 'hate_speech'
  | 'violence'
  | 'sexual_content'
  | 'self_harm'
  | 'misinformation'
  | 'prohibited_content';

export interface ContentScores {
  toxicity: number;
  spam: number;
  harassment: number;
  hateSpeech: number;
  violence: number;
  sexualContent: number;
  overallRisk: number;
}

type RecommendedAction = 'allow' | 'review' | 'block' | 'shadowban';

export interface ReportRequest {
  reporterId: string;
  contentId: string;
  contentType: 'post' | 'comment' | 'user' | 'message' | 'group';
  reason: string;
  details?: string;
}

export interface Report {
  id: string;
  reporterId: string;
  contentId: string;
  contentType: string;
  reason: string;
  details?: string;
  status: 'pending' | 'in_review' | 'resolved' | 'escalated';
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignedTo?: string;
  resolution?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ModerationQueueItem {
  report: Report;
  content: ContentData;
  user: UserData;
  history: ModerationHistory[];
}

interface ContentData {
  id: string;
  type: string;
  content: string;
  authorId: string;
  createdAt: Date;
}

interface UserData {
  id: string;
  username: string;
  riskScore: number;
  previousViolations: number;
}

interface ModerationHistory {
  action: string;
  moderatorId: string;
  reason: string;
  timestamp: Date;
}

// ============ THRESHOLDS ============

const TOXICITY_THRESHOLD = 0.7;
const SPAM_THRESHOLD = 0.8;
const AUTO_BLOCK_THRESHOLD = 0.95;
const REVIEW_THRESHOLD = 0.5;

// ============ CONTENT MODERATOR CLASS ============

export class ContentModerator {
  private redis: Redis;
  private prisma: PrismaClient;
  private toxicityDetector: ToxicityDetector;
  private spamDetector: SpamDetector;
  private behaviorAnalyzer: BehaviorAnalyzer;
  private riskScorer: RiskScorer;

  constructor(
    redis: Redis,
    prisma: PrismaClient,
    toxicityDetector: ToxicityDetector,
    spamDetector: SpamDetector,
    behaviorAnalyzer: BehaviorAnalyzer,
    riskScorer: RiskScorer
  ) {
    this.redis = redis;
    this.prisma = prisma;
    this.toxicityDetector = toxicityDetector;
    this.spamDetector = spamDetector;
    this.behaviorAnalyzer = behaviorAnalyzer;
    this.riskScorer = riskScorer;
  }

  /**
   * Analyze content before publishing
   */
  async analyzeContent(request: ContentAnalysisRequest): Promise<ContentAnalysisResult> {
    const { content, contentType, userId, metadata } = request;
    const analysisId = uuidv4();

    // Run all detectors in parallel
    const [toxicityResult, spamResult, userRisk] = await Promise.all([
      this.toxicityDetector.analyze(content),
      this.spamDetector.analyze(content, userId),
      this.riskScorer.getUserRiskScore(userId),
    ]);

    // Calculate content scores
    const scores: ContentScores = {
      toxicity: toxicityResult.toxicity,
      spam: spamResult.score,
      harassment: toxicityResult.harassment,
      hateSpeech: toxicityResult.hateSpeech,
      violence: toxicityResult.violence,
      sexualContent: toxicityResult.sexualContent,
      overallRisk: this.calculateOverallRisk(toxicityResult, spamResult, userRisk),
    };

    // Generate flags
    const flags = this.generateFlags(scores, toxicityResult, spamResult);

    // Determine action
    const { action, confidence, isAllowed, requiresReview } = this.determineAction(
      scores,
      flags,
      userRisk
    );

    // Cache result for quick lookup
    await this.cacheAnalysisResult(analysisId, {
      id: analysisId,
      isAllowed,
      requiresReview,
      flags,
      scores,
      action,
      confidence,
    });

    // Track for behavior analysis
    await this.behaviorAnalyzer.trackContentSubmission(userId, {
      contentType,
      scores,
      flags: flags.length,
      timestamp: new Date(),
    });

    return {
      id: analysisId,
      isAllowed,
      requiresReview,
      flags,
      scores,
      action,
      confidence,
    };
  }

  /**
   * Create a content report
   */
  async createReport(request: ReportRequest): Promise<Report> {
    const { reporterId, contentId, contentType, reason, details } = request;

    // Check for duplicate reports
    const existingReport = await this.findExistingReport(reporterId, contentId);
    if (existingReport) {
      return existingReport;
    }

    // Calculate priority based on reason and reporter history
    const priority = await this.calculateReportPriority(reason, reporterId, contentId);

    const report: Report = {
      id: uuidv4(),
      reporterId,
      contentId,
      contentType,
      reason,
      details,
      status: 'pending',
      priority,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Store in database
    await this.storeReport(report);

    // Add to moderation queue
    await this.addToQueue(report);

    // Check for report threshold
    await this.checkReportThreshold(contentId);

    return report;
  }

  /**
   * Get moderation queue
   */
  async getQueue(options: {
    status?: string;
    priority?: string;
    limit: number;
    offset: number;
  }): Promise<{ items: ModerationQueueItem[]; total: number }> {
    const { status, priority, limit, offset } = options;

    // Build query
    const where: Record<string, unknown> = {};
    if (status) where['status'] = status;
    if (priority) where['priority'] = priority;

    // In production, use proper database queries
    const reports = await this.getReportsFromQueue(where, limit, offset);
    const total = await this.getQueueCount(where);

    // Enrich with content and user data
    const items = await Promise.all(
      reports.map((report) => this.enrichReport(report))
    );

    return { items, total };
  }

  /**
   * Take moderation action
   */
  async takeAction(action: {
    moderatorId: string;
    reportId: string;
    action: string;
    reason: string;
    duration?: number;
  }): Promise<{ success: boolean; message: string }> {
    const { moderatorId, reportId, action: actionType, reason, duration } = action;

    // Get report
    const report = await this.getReport(reportId);
    if (!report) {
      throw new Error('Report not found');
    }

    // Execute action
    switch (actionType) {
      case 'approve':
        await this.approveContent(report);
        break;
      case 'remove':
        await this.removeContent(report);
        break;
      case 'warn':
        await this.warnUser(report, reason);
        break;
      case 'mute':
        await this.muteUser(report, duration || 24 * 60 * 60);
        break;
      case 'suspend':
        await this.suspendUser(report, duration || 7 * 24 * 60 * 60);
        break;
      case 'ban':
        await this.banUser(report, reason);
        break;
      case 'escalate':
        await this.escalateReport(report);
        break;
      case 'dismiss':
        await this.dismissReport(report, reason);
        break;
      default:
        throw new Error('Invalid action');
    }

    // Update report status
    await this.updateReportStatus(reportId, 'resolved', moderatorId, actionType, reason);

    // Update user risk score
    if (['remove', 'warn', 'mute', 'suspend', 'ban'].includes(actionType)) {
      await this.riskScorer.incrementViolation(report.contentId, actionType);
    }

    return {
      success: true,
      message: `Action ${actionType} completed successfully`,
    };
  }

  /**
   * Get moderation statistics
   */
  async getStats(period: string): Promise<ModerationStats> {
    const now = new Date();
    const periodMs = this.parsePeriod(period);
    const startDate = new Date(now.getTime() - periodMs);

    // Get stats from cache or calculate
    const cacheKey = `moderation:stats:${period}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached) as ModerationStats;
    }

    const stats: ModerationStats = {
      totalReports: await this.countReports(startDate),
      resolvedReports: await this.countResolvedReports(startDate),
      averageResolutionTime: await this.calculateAvgResolutionTime(startDate),
      actionBreakdown: await this.getActionBreakdown(startDate),
      reportReasonBreakdown: await this.getReasonBreakdown(startDate),
      autoModerated: await this.countAutoModerated(startDate),
      falsePositives: await this.countFalsePositives(startDate),
    };

    // Cache for 5 minutes
    await this.redis.setex(cacheKey, 300, JSON.stringify(stats));

    return stats;
  }

  // ============ PRIVATE METHODS ============

  private calculateOverallRisk(
    toxicity: ToxicityResult,
    spam: SpamResult,
    userRisk: number
  ): number {
    const toxicityWeight = 0.4;
    const spamWeight = 0.3;
    const userRiskWeight = 0.3;

    const toxicityScore = Math.max(
      toxicity.toxicity,
      toxicity.harassment,
      toxicity.hateSpeech,
      toxicity.violence
    );

    return (
      toxicityScore * toxicityWeight +
      spam.score * spamWeight +
      userRisk * userRiskWeight
    );
  }

  private generateFlags(
    scores: ContentScores,
    toxicity: ToxicityResult,
    spam: SpamResult
  ): ContentFlag[] {
    const flags: ContentFlag[] = [];

    if (scores.toxicity >= REVIEW_THRESHOLD) {
      flags.push({
        type: 'toxicity',
        severity: this.getSeverity(scores.toxicity),
        confidence: toxicity.confidence,
      });
    }

    if (scores.harassment >= REVIEW_THRESHOLD) {
      flags.push({
        type: 'harassment',
        severity: this.getSeverity(scores.harassment),
        confidence: toxicity.confidence,
      });
    }

    if (scores.hateSpeech >= REVIEW_THRESHOLD) {
      flags.push({
        type: 'hate_speech',
        severity: this.getSeverity(scores.hateSpeech),
        confidence: toxicity.confidence,
      });
    }

    if (scores.violence >= REVIEW_THRESHOLD) {
      flags.push({
        type: 'violence',
        severity: this.getSeverity(scores.violence),
        confidence: toxicity.confidence,
      });
    }

    if (scores.spam >= SPAM_THRESHOLD) {
      flags.push({
        type: 'spam',
        severity: this.getSeverity(scores.spam),
        confidence: spam.confidence,
        details: spam.reasons.join(', '),
      });
    }

    return flags;
  }

  private getSeverity(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score >= 0.9) return 'critical';
    if (score >= 0.7) return 'high';
    if (score >= 0.5) return 'medium';
    return 'low';
  }

  private determineAction(
    scores: ContentScores,
    flags: ContentFlag[],
    userRisk: number
  ): {
    action: RecommendedAction;
    confidence: number;
    isAllowed: boolean;
    requiresReview: boolean;
  } {
    // Auto-block for very high scores
    if (scores.overallRisk >= AUTO_BLOCK_THRESHOLD) {
      return {
        action: 'block',
        confidence: 0.95,
        isAllowed: false,
        requiresReview: false,
      };
    }

    // Check for critical flags
    const criticalFlags = flags.filter((f) => f.severity === 'critical');
    if (criticalFlags.length > 0) {
      return {
        action: 'block',
        confidence: Math.max(...criticalFlags.map((f) => f.confidence)),
        isAllowed: false,
        requiresReview: true,
      };
    }

    // High risk users get more scrutiny
    if (userRisk > 0.7 && scores.overallRisk >= REVIEW_THRESHOLD) {
      return {
        action: 'review',
        confidence: 0.8,
        isAllowed: false,
        requiresReview: true,
      };
    }

    // Moderate risk - needs review
    if (scores.overallRisk >= REVIEW_THRESHOLD) {
      return {
        action: 'review',
        confidence: 0.7,
        isAllowed: true,
        requiresReview: true,
      };
    }

    // Low risk - allow
    return {
      action: 'allow',
      confidence: 0.9,
      isAllowed: true,
      requiresReview: false,
    };
  }

  private async cacheAnalysisResult(id: string, result: ContentAnalysisResult): Promise<void> {
    await this.redis.setex(
      `analysis:${id}`,
      3600, // 1 hour
      JSON.stringify(result)
    );
  }

  private async findExistingReport(reporterId: string, contentId: string): Promise<Report | null> {
    // Check for recent duplicate report
    const key = `report:${reporterId}:${contentId}`;
    const existing = await this.redis.get(key);
    return existing ? JSON.parse(existing) : null;
  }

  private async calculateReportPriority(
    reason: string,
    reporterId: string,
    contentId: string
  ): Promise<'low' | 'medium' | 'high' | 'critical'> {
    // High priority reasons
    const criticalReasons = ['violence', 'self_harm', 'child_safety'];
    const highReasons = ['harassment', 'hate_speech', 'threats'];

    if (criticalReasons.includes(reason)) return 'critical';
    if (highReasons.includes(reason)) return 'high';

    // Check report count for this content
    const reportCount = await this.getReportCount(contentId);
    if (reportCount >= 10) return 'high';
    if (reportCount >= 5) return 'medium';

    return 'low';
  }

  private async storeReport(report: Report): Promise<void> {
    // Store in database - simplified
    await this.redis.setex(
      `report:${report.id}`,
      86400 * 30, // 30 days
      JSON.stringify(report)
    );

    // Add to reporter's report list
    await this.redis.zadd(
      `user:reports:${report.reporterId}`,
      Date.now(),
      report.id
    );

    // Add to content's report list
    await this.redis.zadd(
      `content:reports:${report.contentId}`,
      Date.now(),
      report.id
    );
  }

  private async addToQueue(report: Report): Promise<void> {
    const priorityScore = this.getPriorityScore(report.priority);
    await this.redis.zadd('moderation:queue', priorityScore, report.id);
  }

  private getPriorityScore(priority: string): number {
    const scores: Record<string, number> = {
      critical: 1000,
      high: 100,
      medium: 10,
      low: 1,
    };
    return Date.now() + (scores[priority] || 1) * 1000000;
  }

  private async checkReportThreshold(contentId: string): Promise<void> {
    const reportCount = await this.getReportCount(contentId);

    // Auto-remove content with many reports
    if (reportCount >= 10) {
      // Auto-remove and notify
      await this.autoRemoveContent(contentId);
    }
  }

  private async getReportCount(contentId: string): Promise<number> {
    return this.redis.zcard(`content:reports:${contentId}`);
  }

  private async autoRemoveContent(contentId: string): Promise<void> {
    // Mark content as removed
    await this.redis.set(`content:removed:${contentId}`, 'auto');
  }

  private async getReportsFromQueue(
    where: Record<string, unknown>,
    limit: number,
    offset: number
  ): Promise<Report[]> {
    const reportIds = await this.redis.zrevrange(
      'moderation:queue',
      offset,
      offset + limit - 1
    );

    const reports: Report[] = [];
    for (const id of reportIds) {
      const reportData = await this.redis.get(`report:${id}`);
      if (reportData) {
        reports.push(JSON.parse(reportData));
      }
    }

    return reports;
  }

  private async getQueueCount(where: Record<string, unknown>): Promise<number> {
    return this.redis.zcard('moderation:queue');
  }

  private async enrichReport(report: Report): Promise<ModerationQueueItem> {
    // Fetch content and user data
    return {
      report,
      content: {
        id: report.contentId,
        type: report.contentType,
        content: '',
        authorId: '',
        createdAt: new Date(),
      },
      user: {
        id: '',
        username: '',
        riskScore: 0,
        previousViolations: 0,
      },
      history: [],
    };
  }

  private async getReport(reportId: string): Promise<Report | null> {
    const data = await this.redis.get(`report:${reportId}`);
    return data ? JSON.parse(data) : null;
  }

  private async approveContent(report: Report): Promise<void> {
    // Mark content as approved
    await this.redis.set(`content:approved:${report.contentId}`, '1');
  }

  private async removeContent(report: Report): Promise<void> {
    await this.redis.set(`content:removed:${report.contentId}`, 'moderation');
  }

  private async warnUser(report: Report, reason: string): Promise<void> {
    // Issue warning
  }

  private async muteUser(report: Report, duration: number): Promise<void> {
    // Mute user
  }

  private async suspendUser(report: Report, duration: number): Promise<void> {
    // Suspend user
  }

  private async banUser(report: Report, reason: string): Promise<void> {
    // Ban user
  }

  private async escalateReport(report: Report): Promise<void> {
    // Escalate to senior moderator
    await this.updateReportStatus(report.id, 'escalated');
  }

  private async dismissReport(report: Report, reason: string): Promise<void> {
    // Dismiss report
  }

  private async updateReportStatus(
    reportId: string,
    status: string,
    moderatorId?: string,
    action?: string,
    reason?: string
  ): Promise<void> {
    const report = await this.getReport(reportId);
    if (report) {
      report.status = status as Report['status'];
      report.updatedAt = new Date();
      if (moderatorId) report.assignedTo = moderatorId;
      if (action) report.resolution = `${action}: ${reason}`;
      await this.redis.setex(`report:${reportId}`, 86400 * 30, JSON.stringify(report));
      await this.redis.zrem('moderation:queue', reportId);
    }
  }

  private parsePeriod(period: string): number {
    const units: Record<string, number> = {
      h: 3600000,
      d: 86400000,
      w: 604800000,
    };
    const match = period.match(/^(\d+)([hdw])$/);
    if (match) {
      return parseInt(match[1] || '1', 10) * (units[match[2] || 'h'] || 3600000);
    }
    return 86400000; // Default 24h
  }

  private async countReports(since: Date): Promise<number> {
    return 0;
  }

  private async countResolvedReports(since: Date): Promise<number> {
    return 0;
  }

  private async calculateAvgResolutionTime(since: Date): Promise<number> {
    return 0;
  }

  private async getActionBreakdown(since: Date): Promise<Record<string, number>> {
    return {};
  }

  private async getReasonBreakdown(since: Date): Promise<Record<string, number>> {
    return {};
  }

  private async countAutoModerated(since: Date): Promise<number> {
    return 0;
  }

  private async countFalsePositives(since: Date): Promise<number> {
    return 0;
  }
}

// ============ INTERFACES ============

interface ToxicityResult {
  toxicity: number;
  harassment: number;
  hateSpeech: number;
  violence: number;
  sexualContent: number;
  confidence: number;
}

interface SpamResult {
  score: number;
  confidence: number;
  reasons: string[];
}

interface ModerationStats {
  totalReports: number;
  resolvedReports: number;
  averageResolutionTime: number;
  actionBreakdown: Record<string, number>;
  reportReasonBreakdown: Record<string, number>;
  autoModerated: number;
  falsePositives: number;
}

export default ContentModerator;
