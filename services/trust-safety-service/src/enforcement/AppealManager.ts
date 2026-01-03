// =================================
// TEXTMESH APPEAL MANAGER
// User Appeal Processing System
// =================================

import Redis from 'ioredis';
import { PrismaClient, AppealStatus, type Prisma } from '@prisma/client';

// ============ APPEAL TYPES ============

export interface Appeal {
  id: string;
  userId: string;
  type: AppealType;
  targetId: string; // ID of the content, ban, or action being appealed
  status: string; // Using string to match Prisma's enum
  reason: string;
  evidence?: string;
  attachments?: string[];
  submittedAt: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
  decision?: AppealDecision;
  decisionReason?: string;
  escalatedAt?: Date;
  escalatedTo?: string;
  metadata?: Record<string, unknown>;
}

export type AppealType =
  | 'content_removal'
  | 'account_suspension'
  | 'shadow_ban'
  | 'feature_restriction'
  | 'warning'
  | 'verification_rejection'
  | 'monetization_rejection';

export type AppealDecision =
  | 'upheld' // Original action stands
  | 'overturned' // Original action reversed
  | 'modified' // Action partially reversed/modified
  | 'dismissed'; // Appeal was invalid

export interface AppealReview {
  appealId: string;
  reviewerId: string;
  decision: AppealDecision;
  reason: string;
  timestamp: Date;
}

export interface AppealStats {
  totalAppeals: number;
  pendingAppeals: number;
  resolvedAppeals: number;
  overturnedAppeals: number;
  averageResolutionTime: number; // hours
  appealsByType: Record<AppealType, number>;
  overturnRateByType: Record<AppealType, number>;
}

// ============ APPEAL LIMITS ============

const APPEAL_LIMITS = {
  maxAppealsPerDay: 3,
  maxAppealsPerMonth: 10,
  minTimeBetweenAppeals: 24 * 60 * 60 * 1000, // 24 hours
  appealWindowDays: 30, // Can appeal within 30 days
  maxEvidenceLength: 2000,
  maxAttachments: 5,
};

// ============ APPEAL MANAGER CLASS ============

export class AppealManager {
  private redis: Redis;
  private prisma: PrismaClient;

  constructor(redis: Redis, prisma: PrismaClient) {
    this.redis = redis;
    this.prisma = prisma;
  }

  /**
   * Submit a new appeal (object signature for compatibility)
   */
  async submitAppeal(
    params: {
      userId: string;
      actionId?: string;
      targetId?: string;
      type?: AppealType;
      reason: string;
      evidence?: string[] | string;
    } | string,
    type?: AppealType,
    targetId?: string,
    reason?: string,
    options?: {
      evidence?: string;
      attachments?: string[];
      metadata?: Record<string, unknown>;
    }
  ): Promise<{ success: boolean; appeal?: Appeal; error?: string }> {
    // Handle object signature
    if (typeof params === 'object') {
      return this._submitAppeal(
        params.userId,
        params.type || 'content_removal',
        params.actionId || params.targetId || '',
        params.reason,
        {
          evidence: Array.isArray(params.evidence)
            ? params.evidence.join('\n')
            : params.evidence,
        }
      );
    }

    // Handle positional params
    return this._submitAppeal(params, type!, targetId!, reason!, options);
  }

  /**
   * Process appeal (alias for reviewAppeal with object signature)
   */
  async processAppeal(params: {
    appealId: string;
    moderatorId: string;
    decision: 'approved' | 'denied' | 'partial';
    reason: string;
  }): Promise<{ success: boolean; error?: string }> {
    const decisionMap: Record<string, AppealDecision> = {
      approved: 'overturned',
      denied: 'upheld',
      partial: 'modified',
    };
    return this.reviewAppeal(
      params.appealId,
      params.moderatorId,
      decisionMap[params.decision] || 'upheld',
      params.reason
    );
  }

  /**
   * Internal submit appeal implementation
   */
  private async _submitAppeal(
    userId: string,
    type: AppealType,
    targetId: string,
    reason: string,
    options?: {
      evidence?: string;
      attachments?: string[];
      metadata?: Record<string, unknown>;
    }
  ): Promise<{ success: boolean; appeal?: Appeal; error?: string }> {
    // Validate appeal limits
    const limitCheck = await this.checkAppealLimits(userId);
    if (!limitCheck.allowed) {
      return { success: false, error: limitCheck.reason };
    }

    // Check if already appealed
    const existingAppeal = await this.findExistingAppeal(userId, type, targetId);
    if (existingAppeal) {
      return { success: false, error: 'An appeal for this action already exists' };
    }

    // Check if within appeal window
    const withinWindow = await this.isWithinAppealWindow(type, targetId);
    if (!withinWindow) {
      return { success: false, error: 'Appeal window has expired' };
    }

    // Validate evidence length
    if (options?.evidence && options.evidence.length > APPEAL_LIMITS.maxEvidenceLength) {
      return { success: false, error: 'Evidence exceeds maximum length' };
    }

    // Validate attachments
    if (options?.attachments && options.attachments.length > APPEAL_LIMITS.maxAttachments) {
      return { success: false, error: 'Too many attachments' };
    }

    // Create appeal
    const appeal: Appeal = {
      id: this.generateAppealId(),
      userId,
      type,
      targetId,
      status: AppealStatus.PENDING,
      reason,
      evidence: options?.evidence,
      attachments: options?.attachments,
      submittedAt: new Date(),
      metadata: options?.metadata,
    };

    // Store appeal
    await this.storeAppeal(appeal);

    // Update user appeal count
    await this.incrementAppealCount(userId);

    // Queue for review
    await this.queueForReview(appeal);

    return { success: true, appeal };
  }

  /**
   * Get appeal by ID
   */
  async getAppeal(appealId: string): Promise<Appeal | null> {
    try {
      const appeal = await this.prisma.appeal.findUnique({
        where: { id: appealId },
      });

      if (!appeal) return null;

      return this.mapPrismaAppeal(appeal);
    } catch {
      return null;
    }
  }

  /**
   * Get user's appeals
   */
  async getUserAppeals(
    userId: string,
    options?: { status?: AppealStatus; limit?: number }
  ): Promise<Appeal[]> {
    try {
      const appeals = await this.prisma.appeal.findMany({
        where: {
          userId,
          ...(options?.status && { status: options.status }),
        },
        orderBy: { submittedAt: 'desc' },
        take: options?.limit || 50,
      });

      return appeals.map(this.mapPrismaAppeal);
    } catch {
      return [];
    }
  }

  /**
   * Review an appeal (moderator action)
   */
  async reviewAppeal(
    appealId: string,
    reviewerId: string,
    decision: AppealDecision,
    reason: string
  ): Promise<{ success: boolean; error?: string }> {
    const appeal = await this.getAppeal(appealId);
    if (!appeal) {
      return { success: false, error: 'Appeal not found' };
    }

    if (appeal.status === AppealStatus.RESOLVED) {
      return { success: false, error: 'Appeal already resolved' };
    }

    // Update appeal
    try {
      await this.prisma.appeal.update({
        where: { id: appealId },
        data: {
          status: AppealStatus.RESOLVED,
          reviewedAt: new Date(),
          reviewedBy: reviewerId,
          decision,
          decisionReason: reason,
        },
      });

      // Process decision
      await this.processDecision(appeal, decision, reviewerId);

      // Notify user
      await this.notifyUser(appeal.userId, appeal, decision, reason);

      // Log review
      await this.logReview({
        appealId,
        reviewerId,
        decision,
        reason,
        timestamp: new Date(),
      });

      return { success: true };
    } catch (error) {
      return { success: false, error: 'Failed to update appeal' };
    }
  }

  /**
   * Escalate appeal
   */
  async escalateAppeal(
    appealId: string,
    escalatedBy: string,
    reason: string
  ): Promise<{ success: boolean; error?: string }> {
    const appeal = await this.getAppeal(appealId);
    if (!appeal) {
      return { success: false, error: 'Appeal not found' };
    }

    if (appeal.status === AppealStatus.RESOLVED || appeal.status === AppealStatus.ESCALATED) {
      return { success: false, error: 'Appeal cannot be escalated' };
    }

    try {
      await this.prisma.appeal.update({
        where: { id: appealId },
        data: {
          status: AppealStatus.ESCALATED,
          escalatedAt: new Date(),
          escalatedTo: 'senior_moderator',
        },
      });

      // Add to escalation queue
      await this.redis.lpush('appeals:escalated', appealId);

      return { success: true };
    } catch {
      return { success: false, error: 'Failed to escalate appeal' };
    }
  }

  /**
   * Withdraw appeal
   */
  async withdrawAppeal(
    appealId: string,
    userId: string
  ): Promise<{ success: boolean; error?: string }> {
    const appeal = await this.getAppeal(appealId);
    if (!appeal) {
      return { success: false, error: 'Appeal not found' };
    }

    if (appeal.userId !== userId) {
      return { success: false, error: 'Unauthorized' };
    }

    if (appeal.status === AppealStatus.RESOLVED) {
      return { success: false, error: 'Cannot withdraw resolved appeal' };
    }

    try {
      await this.prisma.appeal.update({
        where: { id: appealId },
        data: { status: AppealStatus.WITHDRAWN },
      });

      return { success: true };
    } catch {
      return { success: false, error: 'Failed to withdraw appeal' };
    }
  }

  /**
   * Get pending appeals for review
   */
  async getPendingAppeals(
    options?: { type?: AppealType; limit?: number; offset?: number }
  ): Promise<Appeal[]> {
    try {
      const appeals = await this.prisma.appeal.findMany({
        where: {
          status: { in: [AppealStatus.PENDING, AppealStatus.UNDER_REVIEW] },
          ...(options?.type && { type: options.type }),
        },
        orderBy: { submittedAt: 'asc' },
        skip: options?.offset || 0,
        take: options?.limit || 50,
      });

      return appeals.map(this.mapPrismaAppeal);
    } catch {
      return [];
    }
  }

  /**
   * Get appeal statistics
   */
  async getAppealStats(timeframe?: { start: Date; end: Date }): Promise<AppealStats> {
    const dateFilter = timeframe
      ? { submittedAt: { gte: timeframe.start, lte: timeframe.end } }
      : {};

    try {
      const [total, pending, resolved, overturned, byType] = await Promise.all([
        this.prisma.appeal.count({ where: dateFilter }),
        this.prisma.appeal.count({ where: { ...dateFilter, status: AppealStatus.PENDING } }),
        this.prisma.appeal.count({ where: { ...dateFilter, status: AppealStatus.RESOLVED } }),
        this.prisma.appeal.count({
          where: { ...dateFilter, decision: 'overturned' },
        }),
        this.prisma.appeal.groupBy({
          by: ['type'],
          where: dateFilter,
          _count: { id: true },
        }),
      ]);

      // Calculate average resolution time
      const resolvedAppeals = await this.prisma.appeal.findMany({
        where: { ...dateFilter, status: AppealStatus.RESOLVED },
        select: { submittedAt: true, reviewedAt: true },
      });

      let totalTime = 0;
      let count = 0;
      for (const appeal of resolvedAppeals) {
        if (appeal.reviewedAt) {
          totalTime += appeal.reviewedAt.getTime() - appeal.submittedAt.getTime();
          count++;
        }
      }
      const avgResolutionTime = count > 0 ? totalTime / count / (1000 * 60 * 60) : 0;

      // Build stats by type
      const appealsByType: Record<string, number> = {};
      for (const item of byType) {
        appealsByType[item.type] = item._count.id;
      }

      // Calculate overturn rate by type
      const overturnRateByType: Record<string, number> = {};
      for (const type of Object.keys(appealsByType)) {
        const typeOverturned = await this.prisma.appeal.count({
          where: { ...dateFilter, type, decision: 'overturned' },
        });
        const typeTotal = appealsByType[type] || 1;
        overturnRateByType[type] = typeOverturned / typeTotal;
      }

      return {
        totalAppeals: total,
        pendingAppeals: pending,
        resolvedAppeals: resolved,
        overturnedAppeals: overturned,
        averageResolutionTime: avgResolutionTime,
        appealsByType: appealsByType as Record<AppealType, number>,
        overturnRateByType: overturnRateByType as Record<AppealType, number>,
      };
    } catch {
      return {
        totalAppeals: 0,
        pendingAppeals: 0,
        resolvedAppeals: 0,
        overturnedAppeals: 0,
        averageResolutionTime: 0,
        appealsByType: {} as Record<AppealType, number>,
        overturnRateByType: {} as Record<AppealType, number>,
      };
    }
  }

  // ============ HELPER METHODS ============

  private async checkAppealLimits(
    userId: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    const now = Date.now();

    // Check daily limit
    const dailyKey = `appeals:daily:${userId}`;
    const dailyCount = await this.redis.get(dailyKey);
    if (dailyCount && parseInt(dailyCount, 10) >= APPEAL_LIMITS.maxAppealsPerDay) {
      return { allowed: false, reason: 'Daily appeal limit reached' };
    }

    // Check monthly limit
    const monthlyKey = `appeals:monthly:${userId}`;
    const monthlyCount = await this.redis.get(monthlyKey);
    if (monthlyCount && parseInt(monthlyCount, 10) >= APPEAL_LIMITS.maxAppealsPerMonth) {
      return { allowed: false, reason: 'Monthly appeal limit reached' };
    }

    // Check time since last appeal
    const lastAppealKey = `appeals:last:${userId}`;
    const lastAppeal = await this.redis.get(lastAppealKey);
    if (lastAppeal) {
      const lastTime = parseInt(lastAppeal, 10);
      if (now - lastTime < APPEAL_LIMITS.minTimeBetweenAppeals) {
        const hoursRemaining = Math.ceil(
          (APPEAL_LIMITS.minTimeBetweenAppeals - (now - lastTime)) / (1000 * 60 * 60)
        );
        return {
          allowed: false,
          reason: `Please wait ${hoursRemaining} hours before submitting another appeal`,
        };
      }
    }

    return { allowed: true };
  }

  private async findExistingAppeal(
    userId: string,
    type: AppealType,
    targetId: string
  ): Promise<Appeal | null> {
    try {
      const existing = await this.prisma.appeal.findFirst({
        where: {
          userId,
          type,
          targetId,
          status: { notIn: [AppealStatus.RESOLVED, AppealStatus.WITHDRAWN] },
        },
      });

      return existing ? this.mapPrismaAppeal(existing) : null;
    } catch {
      return null;
    }
  }

  private async isWithinAppealWindow(
    _type: AppealType,
    _targetId: string
  ): Promise<boolean> {
    // In production, check the original action date
    // For now, return true
    return true;
  }

  private generateAppealId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `appeal_${timestamp}_${random}`;
  }

  private async storeAppeal(appeal: Appeal): Promise<void> {
    try {
      const data: Prisma.AppealCreateInput = {
        id: appeal.id,
        userId: appeal.userId,
        type: appeal.type,
        targetId: appeal.targetId,
        actionId: appeal.id, // Using appeal id as actionId for now
        actionType: appeal.type,
        status: appeal.status as AppealStatus,
        reason: appeal.reason,
        evidence: appeal.evidence,
        attachments: appeal.attachments ? (appeal.attachments as unknown as Prisma.InputJsonValue) : undefined,
        submittedAt: appeal.submittedAt,
        metadata: appeal.metadata ? (appeal.metadata as unknown as Prisma.InputJsonValue) : undefined,
      };
      await this.prisma.appeal.create({ data });
    } catch (error) {
      console.error('Failed to store appeal:', error);
      throw error;
    }
  }

  private async incrementAppealCount(userId: string): Promise<void> {
    const now = Date.now();

    // Increment daily count
    const dailyKey = `appeals:daily:${userId}`;
    await this.redis.incr(dailyKey);
    await this.redis.expire(dailyKey, 86400);

    // Increment monthly count
    const monthlyKey = `appeals:monthly:${userId}`;
    await this.redis.incr(monthlyKey);
    await this.redis.expire(monthlyKey, 30 * 86400);

    // Update last appeal time
    const lastKey = `appeals:last:${userId}`;
    await this.redis.set(lastKey, now.toString());
  }

  private async queueForReview(appeal: Appeal): Promise<void> {
    // Add to review queue with priority based on type
    const priority = this.getAppealPriority(appeal.type);
    await this.redis.zadd('appeals:queue', priority, appeal.id);
  }

  private getAppealPriority(type: AppealType): number {
    const priorities: Record<AppealType, number> = {
      account_suspension: 1, // Highest priority
      shadow_ban: 2,
      content_removal: 3,
      feature_restriction: 4,
      warning: 5,
      verification_rejection: 6,
      monetization_rejection: 7, // Lowest priority
    };
    return priorities[type] || 5;
  }

  private async processDecision(
    appeal: Appeal,
    decision: AppealDecision,
    _reviewerId: string
  ): Promise<void> {
    if (decision === 'overturned' || decision === 'modified') {
      // Reverse the original action
      await this.reverseAction(appeal);
    }
  }

  private async reverseAction(appeal: Appeal): Promise<void> {
    switch (appeal.type) {
      case 'shadow_ban':
        await this.redis.del(`shadowban:${appeal.userId}:*`);
        await this.redis.del(`shadowban:active:${appeal.userId}`);
        break;

      case 'content_removal':
        // Restore content
        await this.prisma.post.update({
          where: { id: appeal.targetId },
          data: { isHidden: false, moderationStatus: 'approved' },
        });
        break;

      case 'account_suspension':
        await this.prisma.user.update({
          where: { id: appeal.userId },
          data: { isBanned: false, banReason: null },
        });
        break;

      case 'feature_restriction':
        await this.redis.del(`restriction:${appeal.userId}:${appeal.targetId}`);
        break;

      default:
        // Log that no action was needed
        break;
    }
  }

  private async notifyUser(
    userId: string,
    appeal: Appeal,
    decision: AppealDecision,
    reason: string
  ): Promise<void> {
    // Create notification
    const notification = {
      type: 'appeal_decision',
      userId,
      title: `Appeal ${decision}`,
      body: reason,
      appealId: appeal.id,
      decision,
      timestamp: new Date().toISOString(),
    };

    await this.redis.lpush(`notifications:${userId}`, JSON.stringify(notification));
  }

  private async logReview(review: AppealReview): Promise<void> {
    const logEntry = {
      ...review,
      timestamp: review.timestamp.toISOString(),
    };

    await this.redis.lpush('appeals:review_log', JSON.stringify(logEntry));
    await this.redis.ltrim('appeals:review_log', 0, 9999);
  }

  private mapPrismaAppeal(prismaAppeal: {
    id: string;
    userId: string;
    type: string;
    targetId: string;
    status: AppealStatus;
    reason: string;
    evidence?: string | null;
    attachments?: Prisma.JsonValue;
    submittedAt: Date;
    reviewedAt?: Date | null;
    reviewedBy?: string | null;
    decision?: string | null;
    decisionReason?: string | null;
    escalatedAt?: Date | null;
    escalatedTo?: string | null;
    metadata?: Prisma.JsonValue;
  }): Appeal {
    return {
      id: prismaAppeal.id,
      userId: prismaAppeal.userId,
      type: prismaAppeal.type as AppealType,
      targetId: prismaAppeal.targetId,
      status: prismaAppeal.status,
      reason: prismaAppeal.reason,
      evidence: prismaAppeal.evidence || undefined,
      attachments: Array.isArray(prismaAppeal.attachments) ? prismaAppeal.attachments as string[] : undefined,
      submittedAt: prismaAppeal.submittedAt,
      reviewedAt: prismaAppeal.reviewedAt || undefined,
      reviewedBy: prismaAppeal.reviewedBy || undefined,
      decision: prismaAppeal.decision as AppealDecision | undefined,
      decisionReason: prismaAppeal.decisionReason || undefined,
      escalatedAt: prismaAppeal.escalatedAt || undefined,
      escalatedTo: prismaAppeal.escalatedTo || undefined,
      metadata: prismaAppeal.metadata as Record<string, unknown> | undefined,
    };
  }
}

export default AppealManager;
