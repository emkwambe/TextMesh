// =================================
// TEXTMESH AUDIT LOGGER
// Comprehensive Audit Trail System
// =================================

import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';

// ============ AUDIT TYPES ============

export interface AuditEntry {
  id: string;
  timestamp: Date;
  category: AuditCategory;
  action: string;
  actorId: string;
  actorType: ActorType;
  targetId?: string;
  targetType?: string;
  details: Record<string, unknown>;
  outcome: AuditOutcome;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

export type AuditCategory =
  | 'moderation'
  | 'authentication'
  | 'authorization'
  | 'content'
  | 'user'
  | 'system'
  | 'security'
  | 'appeal'
  | 'enforcement'
  | 'configuration';

export type ActorType = 'user' | 'moderator' | 'admin' | 'system' | 'automation';

export type AuditOutcome = 'success' | 'failure' | 'partial' | 'blocked';

export interface AuditQuery {
  category?: AuditCategory;
  actorId?: string;
  targetId?: string;
  action?: string;
  outcome?: AuditOutcome;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface AuditStats {
  totalEntries: number;
  entriesByCategory: Record<AuditCategory, number>;
  entriesByOutcome: Record<AuditOutcome, number>;
  topActors: { actorId: string; count: number }[];
  recentActivity: number; // Last 24 hours
}

// ============ AUDIT ACTIONS ============

export const AUDIT_ACTIONS = {
  // Moderation actions
  CONTENT_FLAGGED: 'content_flagged',
  CONTENT_REMOVED: 'content_removed',
  CONTENT_APPROVED: 'content_approved',
  CONTENT_RESTORED: 'content_restored',

  // User actions
  USER_WARNED: 'user_warned',
  USER_SUSPENDED: 'user_suspended',
  USER_BANNED: 'user_banned',
  USER_UNBANNED: 'user_unbanned',
  USER_SHADOW_BANNED: 'user_shadow_banned',
  USER_VERIFIED: 'user_verified',

  // Security actions
  LOGIN_SUCCESS: 'login_success',
  LOGIN_FAILURE: 'login_failure',
  PASSWORD_CHANGED: 'password_changed',
  MFA_ENABLED: 'mfa_enabled',
  MFA_DISABLED: 'mfa_disabled',
  SUSPICIOUS_ACTIVITY: 'suspicious_activity',

  // Appeal actions
  APPEAL_SUBMITTED: 'appeal_submitted',
  APPEAL_REVIEWED: 'appeal_reviewed',
  APPEAL_ESCALATED: 'appeal_escalated',
  APPEAL_OVERTURNED: 'appeal_overturned',

  // System actions
  CONFIG_CHANGED: 'config_changed',
  POLICY_UPDATED: 'policy_updated',
  THRESHOLD_ADJUSTED: 'threshold_adjusted',
  AUTOMATION_TRIGGERED: 'automation_triggered',
} as const;

// ============ AUDIT LOGGER CLASS ============

export class AuditLogger {
  private redis: Redis;
  private prisma: PrismaClient;
  private buffer: AuditEntry[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private readonly BUFFER_SIZE = 100;
  private readonly FLUSH_INTERVAL_MS = 5000;

  constructor(prismaOrRedis: PrismaClient | Redis, prisma?: PrismaClient) {
    // Support both (prisma) and (redis, prisma) constructor signatures
    if (prisma) {
      this.redis = prismaOrRedis as Redis;
      this.prisma = prisma;
    } else {
      // Prisma-only constructor - use a mock Redis
      this.prisma = prismaOrRedis as PrismaClient;
      this.redis = null as any;
    }
    if (this.redis) {
      this.startFlushInterval();
    }
  }

  /**
   * Convenience method - log an action (wrapper for log)
   */
  async logAction(params: {
    action: string;
    actorId: string;
    targetId?: string;
    targetType?: string;
    details?: Record<string, unknown>;
  }): Promise<string> {
    return this.log({
      category: 'moderation',
      action: params.action,
      actorId: params.actorId,
      actorType: 'moderator',
      targetId: params.targetId,
      targetType: params.targetType,
      details: params.details || {},
      outcome: 'success',
    });
  }

  /**
   * Convenience method - get logs (wrapper for query)
   */
  async getLogs(params: {
    actorId?: string;
    targetId?: string;
    action?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<AuditEntry[]> {
    return this.query(params);
  }

  /**
   * Log an audit entry
   */
  async log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<string> {
    const auditEntry: AuditEntry = {
      ...entry,
      id: this.generateAuditId(),
      timestamp: new Date(),
    };

    // Add to buffer
    this.buffer.push(auditEntry);

    // Add to Redis for real-time queries
    await this.logToRedis(auditEntry);

    // Flush if buffer is full
    if (this.buffer.length >= this.BUFFER_SIZE) {
      await this.flush();
    }

    return auditEntry.id;
  }

  /**
   * Log moderation action
   */
  async logModeration(
    action: string,
    actorId: string,
    targetId: string,
    details: Record<string, unknown>,
    outcome: AuditOutcome = 'success',
    context?: { ipAddress?: string; userAgent?: string; requestId?: string }
  ): Promise<string> {
    return this.log({
      category: 'moderation',
      action,
      actorId,
      actorType: 'moderator',
      targetId,
      targetType: 'content',
      details,
      outcome,
      ...context,
    });
  }

  /**
   * Log security event
   */
  async logSecurity(
    action: string,
    actorId: string,
    details: Record<string, unknown>,
    outcome: AuditOutcome = 'success',
    context?: { ipAddress?: string; userAgent?: string; sessionId?: string }
  ): Promise<string> {
    return this.log({
      category: 'security',
      action,
      actorId,
      actorType: 'user',
      details,
      outcome,
      ...context,
    });
  }

  /**
   * Log enforcement action
   */
  async logEnforcement(
    action: string,
    targetId: string,
    details: Record<string, unknown>,
    actorId: string = 'system',
    actorType: ActorType = 'system'
  ): Promise<string> {
    return this.log({
      category: 'enforcement',
      action,
      actorId,
      actorType,
      targetId,
      targetType: 'user',
      details,
      outcome: 'success',
    });
  }

  /**
   * Log system event
   */
  async logSystem(
    action: string,
    details: Record<string, unknown>,
    outcome: AuditOutcome = 'success'
  ): Promise<string> {
    return this.log({
      category: 'system',
      action,
      actorId: 'system',
      actorType: 'system',
      details,
      outcome,
    });
  }

  /**
   * Query audit logs
   */
  async query(query: AuditQuery): Promise<AuditEntry[]> {
    const {
      category,
      actorId,
      targetId,
      action,
      outcome,
      startDate,
      endDate,
      limit = 100,
      offset = 0,
    } = query;

    try {
      const entries = await this.prisma.auditLog.findMany({
        where: {
          ...(category && { category }),
          ...(actorId && { actorId }),
          ...(targetId && { targetId }),
          ...(action && { action }),
          ...(outcome && { outcome }),
          ...(startDate && { timestamp: { gte: startDate } }),
          ...(endDate && { timestamp: { lte: endDate } }),
        },
        orderBy: { timestamp: 'desc' },
        skip: offset,
        take: limit,
      });

      return entries.map(this.mapPrismaEntry);
    } catch {
      return this.queryFromRedis(query);
    }
  }

  /**
   * Get audit entry by ID
   */
  async getEntry(id: string): Promise<AuditEntry | null> {
    try {
      const entry = await this.prisma.auditLog.findUnique({
        where: { id },
      });

      return entry ? this.mapPrismaEntry(entry) : null;
    } catch {
      return null;
    }
  }

  /**
   * Get audit entries for a user
   */
  async getUserAuditTrail(
    userId: string,
    options?: { limit?: number; offset?: number; category?: AuditCategory }
  ): Promise<AuditEntry[]> {
    return this.query({
      actorId: userId,
      category: options?.category,
      limit: options?.limit,
      offset: options?.offset,
    });
  }

  /**
   * Get audit entries targeting a user
   */
  async getTargetAuditTrail(
    targetId: string,
    options?: { limit?: number; offset?: number; category?: AuditCategory }
  ): Promise<AuditEntry[]> {
    return this.query({
      targetId,
      category: options?.category,
      limit: options?.limit,
      offset: options?.offset,
    });
  }

  /**
   * Get audit statistics
   */
  async getStats(timeframe?: { start: Date; end: Date }): Promise<AuditStats> {
    const dateFilter = timeframe
      ? { timestamp: { gte: timeframe.start, lte: timeframe.end } }
      : {};

    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    try {
      const [total, byCategory, byOutcome, topActorsData, recentCount] = await Promise.all([
        this.prisma.auditLog.count({ where: dateFilter }),
        this.prisma.auditLog.groupBy({
          by: ['category'],
          where: dateFilter,
          _count: { id: true },
        }),
        this.prisma.auditLog.groupBy({
          by: ['outcome'],
          where: dateFilter,
          _count: { id: true },
        }),
        this.prisma.auditLog.groupBy({
          by: ['actorId'],
          where: dateFilter,
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
          take: 10,
        }),
        this.prisma.auditLog.count({
          where: { timestamp: { gte: dayAgo } },
        }),
      ]);

      const entriesByCategory: Record<string, number> = {};
      for (const item of byCategory) {
        entriesByCategory[item.category] = item._count.id;
      }

      const entriesByOutcome: Record<string, number> = {};
      for (const item of byOutcome) {
        entriesByOutcome[item.outcome] = item._count.id;
      }

      const topActors = topActorsData.map((item) => ({
        actorId: item.actorId,
        count: item._count.id,
      }));

      return {
        totalEntries: total,
        entriesByCategory: entriesByCategory as Record<AuditCategory, number>,
        entriesByOutcome: entriesByOutcome as Record<AuditOutcome, number>,
        topActors,
        recentActivity: recentCount,
      };
    } catch {
      return {
        totalEntries: 0,
        entriesByCategory: {} as Record<AuditCategory, number>,
        entriesByOutcome: {} as Record<AuditOutcome, number>,
        topActors: [],
        recentActivity: 0,
      };
    }
  }

  /**
   * Export audit logs
   */
  async export(
    query: AuditQuery,
    format: 'json' | 'csv' = 'json'
  ): Promise<string> {
    const entries = await this.query({ ...query, limit: 10000 });

    if (format === 'csv') {
      return this.toCsv(entries);
    }

    return JSON.stringify(entries, null, 2);
  }

  /**
   * Clean up old audit logs
   */
  async cleanup(retentionDays: number = 365): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    try {
      const result = await this.prisma.auditLog.deleteMany({
        where: { timestamp: { lt: cutoff } },
      });

      return result.count;
    } catch {
      return 0;
    }
  }

  // ============ HELPER METHODS ============

  private generateAuditId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `audit_${timestamp}_${random}`;
  }

  private async logToRedis(entry: AuditEntry): Promise<void> {
    const key = 'audit:recent';
    await this.redis.lpush(key, JSON.stringify(entry));
    await this.redis.ltrim(key, 0, 9999);
    await this.redis.expire(key, 86400 * 7); // 7 days

    // Index by category
    const categoryKey = `audit:category:${entry.category}`;
    await this.redis.lpush(categoryKey, entry.id);
    await this.redis.ltrim(categoryKey, 0, 999);

    // Index by actor
    if (entry.actorId !== 'system') {
      const actorKey = `audit:actor:${entry.actorId}`;
      await this.redis.lpush(actorKey, entry.id);
      await this.redis.ltrim(actorKey, 0, 99);
    }

    // Index by target
    if (entry.targetId) {
      const targetKey = `audit:target:${entry.targetId}`;
      await this.redis.lpush(targetKey, entry.id);
      await this.redis.ltrim(targetKey, 0, 99);
    }
  }

  private async queryFromRedis(query: AuditQuery): Promise<AuditEntry[]> {
    const entries = await this.redis.lrange('audit:recent', 0, (query.limit || 100) - 1);

    let results = entries.map((e) => JSON.parse(e) as AuditEntry);

    // Apply filters
    if (query.category) {
      results = results.filter((e) => e.category === query.category);
    }
    if (query.actorId) {
      results = results.filter((e) => e.actorId === query.actorId);
    }
    if (query.targetId) {
      results = results.filter((e) => e.targetId === query.targetId);
    }
    if (query.action) {
      results = results.filter((e) => e.action === query.action);
    }
    if (query.outcome) {
      results = results.filter((e) => e.outcome === query.outcome);
    }
    if (query.startDate) {
      results = results.filter((e) => new Date(e.timestamp) >= query.startDate!);
    }
    if (query.endDate) {
      results = results.filter((e) => new Date(e.timestamp) <= query.endDate!);
    }

    return results.slice(query.offset || 0, (query.offset || 0) + (query.limit || 100));
  }

  private startFlushInterval(): void {
    this.flushInterval = setInterval(() => {
      if (this.buffer.length > 0) {
        this.flush().catch(console.error);
      }
    }, this.FLUSH_INTERVAL_MS);
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const toFlush = [...this.buffer];
    this.buffer = [];

    try {
      await this.prisma.auditLog.createMany({
        data: toFlush.map((entry) => ({
          id: entry.id,
          timestamp: entry.timestamp,
          category: entry.category,
          action: entry.action,
          actorId: entry.actorId,
          actorType: entry.actorType,
          targetId: entry.targetId,
          targetType: entry.targetType,
          details: entry.details,
          outcome: entry.outcome,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
          sessionId: entry.sessionId,
          requestId: entry.requestId,
          metadata: entry.metadata,
        })),
      });
    } catch (error) {
      // Re-add to buffer on failure
      this.buffer.unshift(...toFlush);
      console.error('Failed to flush audit logs:', error);
    }
  }

  private mapPrismaEntry(entry: {
    id: string;
    timestamp: Date;
    category: string;
    action: string;
    actorId: string;
    actorType: string;
    targetId: string | null;
    targetType: string | null;
    details: unknown;
    outcome: string;
    ipAddress: string | null;
    userAgent: string | null;
    sessionId: string | null;
    requestId: string | null;
    metadata: unknown;
  }): AuditEntry {
    return {
      id: entry.id,
      timestamp: entry.timestamp,
      category: entry.category as AuditCategory,
      action: entry.action,
      actorId: entry.actorId,
      actorType: entry.actorType as ActorType,
      targetId: entry.targetId || undefined,
      targetType: entry.targetType || undefined,
      details: entry.details as Record<string, unknown>,
      outcome: entry.outcome as AuditOutcome,
      ipAddress: entry.ipAddress || undefined,
      userAgent: entry.userAgent || undefined,
      sessionId: entry.sessionId || undefined,
      requestId: entry.requestId || undefined,
      metadata: entry.metadata as Record<string, unknown> | undefined,
    };
  }

  private toCsv(entries: AuditEntry[]): string {
    const headers = [
      'id',
      'timestamp',
      'category',
      'action',
      'actorId',
      'actorType',
      'targetId',
      'targetType',
      'outcome',
      'ipAddress',
      'details',
    ];

    const rows = entries.map((entry) => [
      entry.id,
      entry.timestamp.toISOString(),
      entry.category,
      entry.action,
      entry.actorId,
      entry.actorType,
      entry.targetId || '',
      entry.targetType || '',
      entry.outcome,
      entry.ipAddress || '',
      JSON.stringify(entry.details),
    ]);

    return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
  }

  /**
   * Shutdown - flush remaining logs
   */
  async shutdown(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    await this.flush();
  }
}

export default AuditLogger;
