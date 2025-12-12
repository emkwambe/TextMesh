import { Redis } from 'ioredis';
import {
  CoolingPeriod,
  HotTopic,
  UserShieldSettings,
  ShieldedContent,
  ToxicityScore,
  UserTrust,
  TrustPermission,
  TrustSignalType,
  RateLimitResult,
  PrivateResolution,
} from './types';
import { CoolingPeriodService } from './cooling-periods';
import { ToxicityShield } from './toxicity-shield';
import { GraduatedTrust } from './graduated-trust';
import { v4 as uuidv4 } from 'uuid';

export interface SafetyServiceConfig {
  coolingPeriods?: {
    enabled?: boolean;
    defaultDelay?: number;
    hotTopicMultiplier?: number;
  };
  toxicity?: {
    enabled?: boolean;
    autoHideThreshold?: number;
  };
  trust?: {
    enabled?: boolean;
    newUserRestrictionDays?: number;
  };
}

export class SafetyService {
  private redis: Redis;
  private cooling: CoolingPeriodService;
  private toxicity: ToxicityShield;
  private trust: GraduatedTrust;
  private readonly resolutionPrefix = 'safety:resolution:';

  constructor(redis: Redis, config?: SafetyServiceConfig) {
    this.redis = redis;
    this.cooling = new CoolingPeriodService(redis, config?.coolingPeriods);
    this.toxicity = new ToxicityShield(redis, config?.toxicity);
    this.trust = new GraduatedTrust(redis, config?.trust);
  }

  // ============ COOLING PERIODS ============

  async checkCooldown(
    userId: string,
    contentId: string,
    action: 'reply' | 'repost' | 'quote'
  ): Promise<{
    allowed: boolean;
    cooldown?: CoolingPeriod;
    message?: string;
  }> {
    const userTrust = await this.trust.getUserTrust(userId);
    return this.cooling.checkCooldown(userId, contentId, action, userTrust.score);
  }

  async trackContentInteraction(
    contentId: string,
    interactionType: 'reply' | 'like' | 'repost'
  ): Promise<void> {
    await this.cooling.trackInteraction(contentId, interactionType);
  }

  async getHotTopics(limit?: number): Promise<HotTopic[]> {
    return this.cooling.getActiveHotTopics(limit);
  }

  async getThreadHeat(contentId: string): Promise<number> {
    return this.cooling.getThreadHeat(contentId);
  }

  // ============ TOXICITY SHIELDS ============

  async getShieldSettings(userId: string): Promise<UserShieldSettings> {
    return this.toxicity.getUserSettings(userId);
  }

  async updateShieldSettings(
    userId: string,
    settings: Partial<UserShieldSettings>
  ): Promise<UserShieldSettings> {
    return this.toxicity.updateUserSettings(userId, settings);
  }

  async enableVulnerableMode(
    userId: string,
    hours?: number
  ): Promise<UserShieldSettings> {
    return this.toxicity.enableVulnerableMode(userId, hours);
  }

  async disableVulnerableMode(userId: string): Promise<UserShieldSettings> {
    return this.toxicity.disableVulnerableMode(userId);
  }

  async analyzeContentToxicity(
    contentId: string,
    text: string,
    authorId: string
  ): Promise<ToxicityScore> {
    return this.toxicity.analyzeContent(contentId, text, authorId);
  }

  async shouldShieldContent(
    viewerId: string,
    contentId: string,
    authorId: string,
    options?: {
      isFollowing?: boolean;
      isAuthorVerified?: boolean;
    }
  ): Promise<ShieldedContent> {
    let toxicityScore = await this.toxicity.getContentToxicityScore(contentId);

    if (!toxicityScore) {
      // Content not yet analyzed, return passed
      toxicityScore = {
        overall: 0,
        categories: {},
        flagged: false,
        hidden: false,
        reviewRequired: false,
      };
    }

    return this.toxicity.shouldShieldContent(
      viewerId,
      contentId,
      authorId,
      toxicityScore,
      options
    );
  }

  async addMutedWords(userId: string, words: string[]): Promise<void> {
    await this.toxicity.addMutedWords(userId, words);
  }

  async muteUser(userId: string, targetUserId: string): Promise<void> {
    await this.toxicity.muteUser(userId, targetUserId);
  }

  async unmuteUser(userId: string, targetUserId: string): Promise<void> {
    await this.toxicity.unmuteUser(userId, targetUserId);
  }

  // ============ GRADUATED TRUST ============

  async getUserTrust(userId: string): Promise<UserTrust> {
    return this.trust.getUserTrust(userId);
  }

  async addTrustSignal(
    userId: string,
    signal: TrustSignalType,
    source?: string
  ): Promise<UserTrust> {
    return this.trust.addSignal(userId, signal, source);
  }

  async hasPermission(userId: string, permission: TrustPermission): Promise<boolean> {
    return this.trust.hasPermission(userId, permission);
  }

  async checkRateLimit(
    userId: string,
    action: 'post' | 'reply' | 'dm' | 'mention'
  ): Promise<RateLimitResult> {
    return this.trust.checkRateLimit(userId, action);
  }

  async getRateLimitStatus(
    userId: string
  ): Promise<Record<string, { used: number; limit: number; remaining: number }>> {
    return this.trust.getRateLimitStatus(userId);
  }

  async setUserVerified(userId: string, verified: boolean): Promise<UserTrust> {
    return this.trust.setVerified(userId, verified);
  }

  // ============ PRIVATE RESOLUTION ============

  async initiatePrivateResolution(
    initiatorId: string,
    respondentId: string,
    publicThreadId: string,
    reason: string
  ): Promise<PrivateResolution> {
    const resolution: PrivateResolution = {
      id: uuidv4(),
      initiatorId,
      respondentId,
      publicThreadId,
      privateThreadId: uuidv4(), // Create new private thread
      status: 'pending',
      reason,
      createdAt: new Date(),
    };

    await this.redis.set(
      `${this.resolutionPrefix}${resolution.id}`,
      JSON.stringify(resolution),
      'EX',
      86400 * 7 // 7 days
    );

    // Index by users
    await this.redis.sadd(
      `${this.resolutionPrefix}user:${initiatorId}`,
      resolution.id
    );
    await this.redis.sadd(
      `${this.resolutionPrefix}user:${respondentId}`,
      resolution.id
    );

    return resolution;
  }

  async respondToResolution(
    resolutionId: string,
    accept: boolean
  ): Promise<PrivateResolution> {
    const resolution = await this.getResolution(resolutionId);
    if (!resolution) {
      throw new Error('Resolution not found');
    }

    resolution.status = accept ? 'accepted' : 'declined';

    await this.redis.set(
      `${this.resolutionPrefix}${resolution.id}`,
      JSON.stringify(resolution),
      'EX',
      86400 * 7
    );

    return resolution;
  }

  async resolveResolution(
    resolutionId: string,
    outcome: PrivateResolution['outcome']
  ): Promise<PrivateResolution> {
    const resolution = await this.getResolution(resolutionId);
    if (!resolution) {
      throw new Error('Resolution not found');
    }

    resolution.status = 'resolved';
    resolution.outcome = outcome;
    resolution.resolvedAt = new Date();

    // Give trust boost if resolved positively
    if (outcome === 'resolved_positively') {
      await this.trust.addSignal(resolution.initiatorId, 'helpful_replies', 'resolution');
      await this.trust.addSignal(resolution.respondentId, 'helpful_replies', 'resolution');
    }

    await this.redis.set(
      `${this.resolutionPrefix}${resolution.id}`,
      JSON.stringify(resolution),
      'EX',
      86400 * 30 // Keep for 30 days
    );

    return resolution;
  }

  async getResolution(resolutionId: string): Promise<PrivateResolution | null> {
    const data = await this.redis.get(`${this.resolutionPrefix}${resolutionId}`);
    if (!data) return null;

    const resolution = JSON.parse(data);
    resolution.createdAt = new Date(resolution.createdAt);
    if (resolution.resolvedAt) {
      resolution.resolvedAt = new Date(resolution.resolvedAt);
    }
    return resolution;
  }

  async getUserResolutions(userId: string): Promise<PrivateResolution[]> {
    const ids = await this.redis.smembers(`${this.resolutionPrefix}user:${userId}`);
    const resolutions: PrivateResolution[] = [];

    for (const id of ids) {
      const resolution = await this.getResolution(id);
      if (resolution) {
        resolutions.push(resolution);
      }
    }

    return resolutions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // ============ COMBINED SAFETY CHECK ============

  async performSafetyCheck(
    userId: string,
    action: 'post' | 'reply' | 'dm',
    options: {
      contentId?: string;
      text?: string;
      targetUserId?: string;
    } = {}
  ): Promise<{
    allowed: boolean;
    reasons: string[];
    cooldown?: CoolingPeriod;
    rateLimit?: RateLimitResult;
  }> {
    const reasons: string[] = [];
    let cooldown: CoolingPeriod | undefined;
    let rateLimit: RateLimitResult | undefined;

    // Check permissions
    const hasPermission = await this.hasPermission(userId, action);
    if (!hasPermission) {
      reasons.push(`You don't have permission to ${action}`);
    }

    // Check rate limit
    rateLimit = await this.checkRateLimit(userId, action);
    if (!rateLimit.allowed) {
      reasons.push(`Rate limit exceeded. Try again in ${rateLimit.retryAfter} seconds`);
    }

    // Check cooling period for replies
    if (action === 'reply' && options.contentId) {
      const cooldownResult = await this.checkCooldown(userId, options.contentId, 'reply');
      if (!cooldownResult.allowed) {
        reasons.push(cooldownResult.message || 'Cooling period active');
        cooldown = cooldownResult.cooldown;
      }
    }

    // Analyze toxicity if text provided
    if (options.text) {
      const toxicity = await this.analyzeContentToxicity(
        options.contentId || 'preview',
        options.text,
        userId
      );

      if (toxicity.hidden) {
        reasons.push('Content flagged as potentially harmful and cannot be posted');
      } else if (toxicity.reviewRequired) {
        // Allow but flag for review
      }
    }

    return {
      allowed: reasons.length === 0,
      reasons,
      cooldown,
      rateLimit,
    };
  }

  // ============ SAFETY DASHBOARD ============

  async getUserSafetyDashboard(userId: string): Promise<{
    trust: {
      score: number;
      level: number;
      levelName: string;
      permissions: TrustPermission[];
    };
    shield: {
      enabled: boolean;
      sensitivity: string;
      vulnerableMode: boolean;
      mutedUsers: number;
      mutedWords: number;
    };
    rateLimits: Record<string, { used: number; limit: number; remaining: number }>;
    activeResolutions: number;
  }> {
    const [userTrust, shieldSettings, rateLimits, resolutions] = await Promise.all([
      this.trust.getUserTrust(userId),
      this.toxicity.getUserSettings(userId),
      this.trust.getRateLimitStatus(userId),
      this.getUserResolutions(userId),
    ]);

    const trustLevel = this.trust.getTrustLevelInfo(userTrust.level);

    return {
      trust: {
        score: userTrust.score,
        level: userTrust.level,
        levelName: trustLevel?.name || 'Unknown',
        permissions: trustLevel?.permissions || [],
      },
      shield: {
        enabled: shieldSettings.enabled,
        sensitivity: shieldSettings.sensitivity,
        vulnerableMode: shieldSettings.vulnerableMode,
        mutedUsers: shieldSettings.mutedUsers.length,
        mutedWords: shieldSettings.mutedWords.length,
      },
      rateLimits,
      activeResolutions: resolutions.filter(r => r.status === 'pending' || r.status === 'accepted').length,
    };
  }

  // Service getters
  getCoolingPeriodService(): CoolingPeriodService {
    return this.cooling;
  }

  getToxicityShield(): ToxicityShield {
    return this.toxicity;
  }

  getGraduatedTrust(): GraduatedTrust {
    return this.trust;
  }
}
