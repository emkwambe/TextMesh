// =================================
// TEXTMESH SHADOW BAN MANAGER
// Stealth Enforcement System
// =================================

import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';

// ============ SHADOW BAN TYPES ============

export interface ShadowBan {
  userId: string;
  type: ShadowBanType;
  scope: ShadowBanScope;
  startedAt: Date;
  expiresAt?: Date;
  reason: string;
  severity: number; // 0-1
  createdBy: string; // System or moderator ID
  metadata?: Record<string, unknown>;
}

export type ShadowBanType =
  | 'visibility' // Content not shown to others
  | 'engagement' // Likes/comments don't count
  | 'reach' // Reduced distribution
  | 'notification' // Others don't get notified
  | 'search' // Not appearing in search
  | 'recommendation' // Not recommended to others
  | 'full'; // All of the above

export type ShadowBanScope =
  | 'global' // Affects all activity
  | 'feed' // Only feed visibility
  | 'search' // Only search visibility
  | 'engagement' // Only engagement actions
  | 'hashtag'; // Only specific hashtags

export interface ShadowBanStatus {
  userId: string;
  isShadowBanned: boolean;
  activeBans: ShadowBan[];
  effectiveRestrictions: ShadowBanType[];
  totalBans: number;
  lastBanEnded?: Date;
}

export interface ShadowBanConfig {
  type: ShadowBanType;
  defaultDuration: number; // hours
  maxDuration: number; // hours
  stackable: boolean;
  autoEscalate: boolean;
}

// ============ BAN CONFIGURATIONS ============

const BAN_CONFIGS: Record<ShadowBanType, ShadowBanConfig> = {
  visibility: {
    type: 'visibility',
    defaultDuration: 24,
    maxDuration: 168,
    stackable: false,
    autoEscalate: true,
  },
  engagement: {
    type: 'engagement',
    defaultDuration: 12,
    maxDuration: 72,
    stackable: false,
    autoEscalate: false,
  },
  reach: {
    type: 'reach',
    defaultDuration: 48,
    maxDuration: 336,
    stackable: true,
    autoEscalate: true,
  },
  notification: {
    type: 'notification',
    defaultDuration: 24,
    maxDuration: 168,
    stackable: false,
    autoEscalate: false,
  },
  search: {
    type: 'search',
    defaultDuration: 72,
    maxDuration: 336,
    stackable: false,
    autoEscalate: true,
  },
  recommendation: {
    type: 'recommendation',
    defaultDuration: 168,
    maxDuration: 720,
    stackable: true,
    autoEscalate: true,
  },
  full: {
    type: 'full',
    defaultDuration: 72,
    maxDuration: 720,
    stackable: false,
    autoEscalate: true,
  },
};

// ============ SHADOW BAN MANAGER CLASS ============

export class ShadowBanManager {
  private redis: Redis;
  private prisma: PrismaClient;

  constructor(redis: Redis, prisma: PrismaClient) {
    this.redis = redis;
    this.prisma = prisma;
  }

  /**
   * Get shadow ban status (alias)
   */
  async getStatus(userId: string): Promise<ShadowBanStatus> {
    return this.getShadowBanStatus(userId);
  }

  /**
   * Apply shadow ban to user (object signature for compatibility)
   */
  async applyShadowBan(
    userIdOrParams: string | {
      userId: string;
      moderatorId?: string;
      reason: string;
      level?: string;
      duration?: number;
    },
    type?: ShadowBanType,
    reason?: string,
    options?: {
      duration?: number; // hours
      severity?: number;
      scope?: ShadowBanScope;
      createdBy?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<ShadowBan> {
    // Handle object signature
    if (typeof userIdOrParams === 'object') {
      const params = userIdOrParams;
      const banType = (params.level as ShadowBanType) || 'reach';
      return this._applyShadowBan(params.userId, banType, params.reason, {
        duration: params.duration,
        createdBy: params.moderatorId,
      });
    }

    // Handle positional params
    return this._applyShadowBan(userIdOrParams, type!, reason!, options);
  }

  /**
   * Internal apply shadow ban implementation
   */
  private async _applyShadowBan(
    userId: string,
    type: ShadowBanType,
    reason: string,
    options?: {
      duration?: number; // hours
      severity?: number;
      scope?: ShadowBanScope;
      createdBy?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<ShadowBan> {
    const config = BAN_CONFIGS[type];
    const duration = Math.min(
      options?.duration || config.defaultDuration,
      config.maxDuration
    );

    const shadowBan: ShadowBan = {
      userId,
      type,
      scope: options?.scope || 'global',
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + duration * 60 * 60 * 1000),
      reason,
      severity: options?.severity || 0.5,
      createdBy: options?.createdBy || 'system',
      metadata: options?.metadata,
    };

    // Store in Redis for fast lookup
    await this.storeShadowBan(shadowBan);

    // Store in database for audit trail
    await this.recordShadowBan(shadowBan);

    // Log the action
    await this.logBanAction('apply', { ...shadowBan } as unknown as Record<string, unknown>);

    return shadowBan;
  }

  /**
   * Remove shadow ban (supports multiple signatures)
   */
  async removeShadowBan(
    userId: string,
    typeOrModeratorId?: ShadowBanType | string,
    removedByOrReason?: string,
    reason?: string
  ): Promise<boolean> {
    // If only userId is provided, remove all bans
    if (!typeOrModeratorId) {
      const activeBans = await this.redis.smembers(`shadowban:active:${userId}`);
      for (const banType of activeBans) {
        await this.redis.del(`shadowban:${userId}:${banType}`);
      }
      await this.redis.del(`shadowban:active:${userId}`);
      return true;
    }

    // Check if second arg is a ban type or moderator ID
    const isBanType = ['visibility', 'engagement', 'reach', 'notification', 'search', 'recommendation', 'full'].includes(typeOrModeratorId);

    if (isBanType) {
      // Original signature: (userId, type, removedBy, reason?)
      return this._removeShadowBan(userId, typeOrModeratorId as ShadowBanType, removedByOrReason!, reason);
    } else {
      // New signature: (userId, moderatorId, reason)
      // Remove all active bans
      const activeBans = await this.redis.smembers(`shadowban:active:${userId}`);
      for (const banType of activeBans) {
        await this._removeShadowBan(userId, banType as ShadowBanType, typeOrModeratorId, removedByOrReason);
      }
      return activeBans.length > 0;
    }
  }

  private async _removeShadowBan(
    userId: string,
    type: ShadowBanType,
    removedBy: string,
    reason?: string
  ): Promise<boolean> {
    const banKey = `shadowban:${userId}:${type}`;
    const exists = await this.redis.exists(banKey);

    if (exists === 0) {
      return false;
    }

    // Remove from Redis
    await this.redis.del(banKey);

    // Update active bans set
    await this.redis.srem(`shadowban:active:${userId}`, type);

    // Log removal
    await this.logBanAction('remove', {
      userId,
      type,
      removedBy,
      reason: reason || 'Manual removal',
    });

    return true;
  }

  /**
   * Check if user is shadow banned
   */
  async isShadowBanned(
    userId: string,
    type?: ShadowBanType
  ): Promise<boolean> {
    if (type) {
      const banKey = `shadowban:${userId}:${type}`;
      const exists = await this.redis.exists(banKey);
      return exists === 1;
    }

    // Check for any active ban
    const activeBans = await this.redis.smembers(`shadowban:active:${userId}`);
    return activeBans.length > 0;
  }

  /**
   * Get full shadow ban status
   */
  async getShadowBanStatus(userId: string): Promise<ShadowBanStatus> {
    const activeBanTypes = await this.redis.smembers(`shadowban:active:${userId}`);
    const activeBans: ShadowBan[] = [];
    const effectiveRestrictions: ShadowBanType[] = [];

    for (const type of activeBanTypes) {
      const banKey = `shadowban:${userId}:${type}`;
      const banData = await this.redis.get(banKey);

      if (banData) {
        const ban = JSON.parse(banData) as ShadowBan;

        // Check if expired
        if (ban.expiresAt && new Date(ban.expiresAt) < new Date()) {
          await this.expireBan(userId, type as ShadowBanType);
          continue;
        }

        activeBans.push(ban);

        // Add effective restrictions based on ban type
        if (ban.type === 'full') {
          effectiveRestrictions.push(
            'visibility',
            'engagement',
            'reach',
            'notification',
            'search',
            'recommendation'
          );
        } else {
          effectiveRestrictions.push(ban.type);
        }
      }
    }

    // Get total ban history count
    const totalBans = await this.redis.get(`shadowban:count:${userId}`);

    // Get last ban end date
    const lastBanEndedStr = await this.redis.get(`shadowban:last_ended:${userId}`);

    return {
      userId,
      isShadowBanned: activeBans.length > 0,
      activeBans,
      effectiveRestrictions: [...new Set(effectiveRestrictions)],
      totalBans: totalBans ? parseInt(totalBans, 10) : 0,
      lastBanEnded: lastBanEndedStr ? new Date(lastBanEndedStr) : undefined,
    };
  }

  /**
   * Check if content should be hidden
   */
  async shouldHideContent(
    userId: string,
    viewerId: string
  ): Promise<{ hide: boolean; reason?: string }> {
    // Never hide from the author themselves
    if (userId === viewerId) {
      return { hide: false };
    }

    // Check visibility ban
    const visibilityBan = await this.redis.get(`shadowban:${userId}:visibility`);
    if (visibilityBan) {
      return { hide: true, reason: 'visibility_ban' };
    }

    // Check full ban
    const fullBan = await this.redis.get(`shadowban:${userId}:full`);
    if (fullBan) {
      return { hide: true, reason: 'full_ban' };
    }

    return { hide: false };
  }

  /**
   * Check if engagement should count
   */
  async shouldCountEngagement(userId: string): Promise<boolean> {
    const engagementBan = await this.redis.get(`shadowban:${userId}:engagement`);
    if (engagementBan) {
      return false;
    }

    const fullBan = await this.redis.get(`shadowban:${userId}:full`);
    return !fullBan;
  }

  /**
   * Get reach multiplier (for content distribution)
   */
  async getReachMultiplier(userId: string): Promise<number> {
    // Check for reach ban
    const reachBan = await this.redis.get(`shadowban:${userId}:reach`);
    if (reachBan) {
      const ban = JSON.parse(reachBan) as ShadowBan;
      // Reduce reach based on severity
      return Math.max(0.05, 1 - ban.severity);
    }

    const fullBan = await this.redis.get(`shadowban:${userId}:full`);
    if (fullBan) {
      return 0.01; // Almost no reach
    }

    // Check for recommendation ban (partial reach reduction)
    const recBan = await this.redis.get(`shadowban:${userId}:recommendation`);
    if (recBan) {
      return 0.3; // 30% reach
    }

    return 1.0; // Full reach
  }

  /**
   * Check if user should appear in search
   */
  async shouldAppearInSearch(userId: string): Promise<boolean> {
    const searchBan = await this.redis.get(`shadowban:${userId}:search`);
    if (searchBan) {
      return false;
    }

    const fullBan = await this.redis.get(`shadowban:${userId}:full`);
    return !fullBan;
  }

  /**
   * Check if user should be recommended
   */
  async shouldRecommend(userId: string): Promise<boolean> {
    const recBan = await this.redis.get(`shadowban:${userId}:recommendation`);
    if (recBan) {
      return false;
    }

    const fullBan = await this.redis.get(`shadowban:${userId}:full`);
    return !fullBan;
  }

  /**
   * Auto-escalate ban based on repeat offenses
   */
  async autoEscalate(userId: string, type: ShadowBanType): Promise<ShadowBan | null> {
    const config = BAN_CONFIGS[type];
    if (!config.autoEscalate) {
      return null;
    }

    // Get previous ban count for this type
    const banCountKey = `shadowban:count:${userId}:${type}`;
    const previousBans = await this.redis.get(banCountKey);
    const count = previousBans ? parseInt(previousBans, 10) : 0;

    // Escalation multiplier
    const escalationFactor = Math.min(4, 1 + count * 0.5);
    const escalatedDuration = Math.min(
      config.maxDuration,
      config.defaultDuration * escalationFactor
    );

    // Escalate severity
    const escalatedSeverity = Math.min(1, 0.5 + count * 0.1);

    // If many repeat offenses, consider escalating to full ban
    if (count >= 3 && type !== 'full') {
      return this.applyShadowBan(userId, 'full', 'Repeated violations - auto-escalated', {
        duration: escalatedDuration,
        severity: escalatedSeverity,
        createdBy: 'auto_escalate',
      });
    }

    return this.applyShadowBan(userId, type, 'Repeated violation - auto-escalated', {
      duration: escalatedDuration,
      severity: escalatedSeverity,
      createdBy: 'auto_escalate',
    });
  }

  // ============ HELPER METHODS ============

  private async storeShadowBan(ban: ShadowBan): Promise<void> {
    const banKey = `shadowban:${ban.userId}:${ban.type}`;
    const ttl = ban.expiresAt
      ? Math.ceil((ban.expiresAt.getTime() - Date.now()) / 1000)
      : 86400 * 30; // 30 days default

    await this.redis.setex(banKey, ttl, JSON.stringify(ban));

    // Add to active bans set
    await this.redis.sadd(`shadowban:active:${ban.userId}`, ban.type);

    // Increment ban count
    await this.redis.incr(`shadowban:count:${ban.userId}`);
    await this.redis.incr(`shadowban:count:${ban.userId}:${ban.type}`);
  }

  private async recordShadowBan(ban: ShadowBan): Promise<void> {
    try {
      await this.prisma.shadowBan.create({
        data: {
          userId: ban.userId,
          type: ban.type,
          scope: ban.scope,
          reason: ban.reason,
          severity: ban.severity,
          startedAt: ban.startedAt,
          expiresAt: ban.expiresAt,
          createdBy: ban.createdBy,
          metadata: ban.metadata as Record<string, unknown>,
        },
      });
    } catch {
      // Log error but don't fail
      console.error('Failed to record shadow ban in database');
    }
  }

  private async expireBan(userId: string, type: ShadowBanType): Promise<void> {
    const banKey = `shadowban:${userId}:${type}`;
    await this.redis.del(banKey);
    await this.redis.srem(`shadowban:active:${userId}`, type);
    await this.redis.set(`shadowban:last_ended:${userId}`, new Date().toISOString());

    await this.logBanAction('expire', { userId, type });
  }

  private async logBanAction(
    action: string,
    data: Record<string, unknown>
  ): Promise<void> {
    const logEntry = {
      action,
      ...data,
      timestamp: new Date().toISOString(),
    };

    const logKey = 'shadowban:audit_log';
    await this.redis.lpush(logKey, JSON.stringify(logEntry));
    await this.redis.ltrim(logKey, 0, 9999);
  }

  /**
   * Get shadow ban audit log
   */
  async getAuditLog(
    options?: { userId?: string; limit?: number }
  ): Promise<Record<string, unknown>[]> {
    const limit = options?.limit || 100;
    const logs = await this.redis.lrange('shadowban:audit_log', 0, limit - 1);

    let entries = logs.map((log) => JSON.parse(log) as Record<string, unknown>);

    if (options?.userId) {
      entries = entries.filter((entry) => entry['userId'] === options.userId);
    }

    return entries;
  }

  /**
   * Bulk check shadow ban status for multiple users
   */
  async bulkCheckShadowBans(
    userIds: string[]
  ): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    // Use pipeline for efficiency
    const pipeline = this.redis.pipeline();
    for (const userId of userIds) {
      pipeline.scard(`shadowban:active:${userId}`);
    }

    const pipelineResults = await pipeline.exec();

    if (pipelineResults) {
      userIds.forEach((userId, index) => {
        const result = pipelineResults[index];
        if (result) {
          const [, count] = result;
          results.set(userId, (count as number) > 0);
        }
      });
    }

    return results;
  }
}

export default ShadowBanManager;
