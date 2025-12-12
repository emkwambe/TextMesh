import { Redis } from 'ioredis';
import {
  TrustConfig,
  TrustLevel,
  TrustPermission,
  UserTrust,
  TrustSignal,
  TrustSignalType,
  RateLimitResult,
} from './types';

const DEFAULT_TRUST_LEVELS: TrustLevel[] = [
  {
    level: 0,
    name: 'New User',
    minScore: 0,
    permissions: ['post', 'reply'],
    rateLimit: {
      postsPerDay: 5,
      repliesPerDay: 20,
      dmPerDay: 3,
      mentionsPerPost: 2,
    },
  },
  {
    level: 1,
    name: 'Basic',
    minScore: 20,
    permissions: ['post', 'reply', 'dm', 'mention', 'post_links'],
    rateLimit: {
      postsPerDay: 20,
      repliesPerDay: 100,
      dmPerDay: 20,
      mentionsPerPost: 5,
    },
  },
  {
    level: 2,
    name: 'Member',
    minScore: 40,
    permissions: ['post', 'reply', 'dm', 'mention', 'post_links', 'post_media', 'create_poll'],
    rateLimit: {
      postsPerDay: 50,
      repliesPerDay: 300,
      dmPerDay: 50,
      mentionsPerPost: 10,
    },
  },
  {
    level: 3,
    name: 'Regular',
    minScore: 60,
    permissions: ['post', 'reply', 'dm', 'mention', 'post_links', 'post_media', 'create_poll', 'create_group'],
    rateLimit: {
      postsPerDay: 100,
      repliesPerDay: 500,
      dmPerDay: 100,
      mentionsPerPost: 20,
    },
  },
  {
    level: 4,
    name: 'Trusted',
    minScore: 80,
    permissions: ['post', 'reply', 'dm', 'mention', 'post_links', 'post_media', 'create_poll', 'create_group', 'go_live'],
    rateLimit: {
      postsPerDay: 200,
      repliesPerDay: 1000,
      dmPerDay: 200,
      mentionsPerPost: 50,
    },
  },
  {
    level: 5,
    name: 'Leader',
    minScore: 95,
    permissions: ['post', 'reply', 'dm', 'mention', 'post_links', 'post_media', 'create_poll', 'create_group', 'go_live', 'unlimited_reach'],
    rateLimit: {
      postsPerDay: 500,
      repliesPerDay: 2000,
      dmPerDay: 500,
      mentionsPerPost: 100,
    },
  },
];

const DEFAULT_CONFIG: TrustConfig = {
  enabled: true,
  newUserRestrictionDays: 7,
  trustLevels: DEFAULT_TRUST_LEVELS,
  decayRate: 0.5, // Lose 0.5 points per day of inactivity
};

const SIGNAL_VALUES: Record<TrustSignalType, number> = {
  // Positive signals
  email_verified: 10,
  phone_verified: 15,
  id_verified: 25,
  consistent_posting: 5,
  quality_content: 3,
  helpful_replies: 2,
  trusted_followers: 1,
  community_vouches: 5,
  no_violations: 10,
  // Negative signals
  spam_detected: -15,
  harassment_report: -20,
  misinformation_flag: -10,
  rate_limit_hit: -5,
  appeal_denied: -25,
  temp_suspension: -40,
  content_removed: -10,
};

export class GraduatedTrust {
  private redis: Redis;
  private config: TrustConfig;
  private readonly trustPrefix = 'safety:trust:';
  private readonly rateLimitPrefix = 'safety:ratelimit:';

  constructor(redis: Redis, config?: Partial<TrustConfig>) {
    this.redis = redis;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async getUserTrust(userId: string): Promise<UserTrust> {
    const data = await this.redis.get(`${this.trustPrefix}${userId}`);

    if (data) {
      const trust = JSON.parse(data);
      trust.lastActivity = new Date(trust.lastActivity);
      trust.createdAt = new Date(trust.createdAt);
      trust.updatedAt = new Date(trust.updatedAt);
      trust.positiveSignals = trust.positiveSignals.map((s: TrustSignal) => ({
        ...s,
        createdAt: new Date(s.createdAt),
        expiresAt: s.expiresAt ? new Date(s.expiresAt) : undefined,
      }));
      trust.negativeSignals = trust.negativeSignals.map((s: TrustSignal) => ({
        ...s,
        createdAt: new Date(s.createdAt),
        expiresAt: s.expiresAt ? new Date(s.expiresAt) : undefined,
      }));
      return trust;
    }

    // Create new trust record
    const newTrust: UserTrust = {
      userId,
      score: 10, // Starting score
      level: 0,
      positiveSignals: [],
      negativeSignals: [],
      restrictions: [],
      lastActivity: new Date(),
      accountAge: 0,
      isVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.saveTrust(newTrust);
    return newTrust;
  }

  async addSignal(
    userId: string,
    signalType: TrustSignalType,
    source?: string,
    expiresInDays?: number
  ): Promise<UserTrust> {
    const trust = await this.getUserTrust(userId);
    const value = SIGNAL_VALUES[signalType];

    const signal: TrustSignal = {
      type: signalType,
      value,
      source,
      createdAt: new Date(),
      expiresAt: expiresInDays
        ? new Date(Date.now() + expiresInDays * 86400 * 1000)
        : undefined,
    };

    if (value > 0) {
      trust.positiveSignals.push(signal);
    } else {
      trust.negativeSignals.push(signal);
    }

    // Recalculate score
    trust.score = this.calculateScore(trust);
    trust.level = this.determineLevel(trust.score);
    trust.lastActivity = new Date();
    trust.updatedAt = new Date();

    await this.saveTrust(trust);
    return trust;
  }

  async removeExpiredSignals(userId: string): Promise<UserTrust> {
    const trust = await this.getUserTrust(userId);
    const now = new Date();

    trust.positiveSignals = trust.positiveSignals.filter(
      s => !s.expiresAt || s.expiresAt > now
    );
    trust.negativeSignals = trust.negativeSignals.filter(
      s => !s.expiresAt || s.expiresAt > now
    );

    trust.score = this.calculateScore(trust);
    trust.level = this.determineLevel(trust.score);
    trust.updatedAt = new Date();

    await this.saveTrust(trust);
    return trust;
  }

  async applyDecay(userId: string): Promise<UserTrust> {
    const trust = await this.getUserTrust(userId);
    const daysSinceActivity = Math.floor(
      (Date.now() - trust.lastActivity.getTime()) / (86400 * 1000)
    );

    if (daysSinceActivity > 0) {
      const decay = daysSinceActivity * this.config.decayRate;
      trust.score = Math.max(0, trust.score - decay);
      trust.level = this.determineLevel(trust.score);
      trust.updatedAt = new Date();

      await this.saveTrust(trust);
    }

    return trust;
  }

  async hasPermission(userId: string, permission: TrustPermission): Promise<boolean> {
    const trust = await this.getUserTrust(userId);
    const level = this.config.trustLevels.find(l => l.level === trust.level);

    if (!level) return false;

    // Check if permission is in level's permissions
    if (!level.permissions.includes(permission)) {
      return false;
    }

    // Check for specific restrictions
    if (trust.restrictions.includes(permission)) {
      return false;
    }

    // Check new user restrictions
    if (
      trust.accountAge < this.config.newUserRestrictionDays &&
      ['post_links', 'post_media', 'dm', 'create_group'].includes(permission)
    ) {
      return false;
    }

    return true;
  }

  async checkRateLimit(
    userId: string,
    action: 'post' | 'reply' | 'dm' | 'mention'
  ): Promise<RateLimitResult> {
    const trust = await this.getUserTrust(userId);
    const level = this.config.trustLevels.find(l => l.level === trust.level);

    if (!level) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(Date.now() + 86400 * 1000),
      };
    }

    const limitKey = {
      post: 'postsPerDay',
      reply: 'repliesPerDay',
      dm: 'dmPerDay',
      mention: 'mentionsPerPost',
    }[action] as keyof TrustLevel['rateLimit'];

    const limit = level.rateLimit[limitKey];
    const windowKey = `${this.rateLimitPrefix}${userId}:${action}`;
    const now = Date.now();
    const dayStart = new Date().setHours(0, 0, 0, 0);

    // Count actions in current window
    const count = await this.redis.zcount(windowKey, dayStart, now);

    if (count >= limit) {
      // Add negative signal for rate limit hit
      if (count === limit) {
        await this.addSignal(userId, 'rate_limit_hit', action, 7);
      }

      const resetAt = new Date(dayStart + 86400 * 1000);
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        retryAfter: Math.ceil((resetAt.getTime() - now) / 1000),
      };
    }

    // Record the action
    await this.redis.zadd(windowKey, now, `${now}`);
    await this.redis.expire(windowKey, 86400);

    return {
      allowed: true,
      remaining: limit - count - 1,
      resetAt: new Date(dayStart + 86400 * 1000),
    };
  }

  async getRateLimitStatus(
    userId: string
  ): Promise<Record<string, { used: number; limit: number; remaining: number }>> {
    const trust = await this.getUserTrust(userId);
    const level = this.config.trustLevels.find(l => l.level === trust.level);

    if (!level) {
      return {};
    }

    const actions = ['post', 'reply', 'dm', 'mention'] as const;
    const status: Record<string, { used: number; limit: number; remaining: number }> = {};
    const dayStart = new Date().setHours(0, 0, 0, 0);
    const now = Date.now();

    for (const action of actions) {
      const windowKey = `${this.rateLimitPrefix}${userId}:${action}`;
      const count = await this.redis.zcount(windowKey, dayStart, now);

      const limitKey = {
        post: 'postsPerDay',
        reply: 'repliesPerDay',
        dm: 'dmPerDay',
        mention: 'mentionsPerPost',
      }[action] as keyof TrustLevel['rateLimit'];

      const limit = level.rateLimit[limitKey];

      status[action] = {
        used: count,
        limit,
        remaining: Math.max(0, limit - count),
      };
    }

    return status;
  }

  async addRestriction(userId: string, restriction: string): Promise<UserTrust> {
    const trust = await this.getUserTrust(userId);

    if (!trust.restrictions.includes(restriction)) {
      trust.restrictions.push(restriction);
      trust.updatedAt = new Date();
      await this.saveTrust(trust);
    }

    return trust;
  }

  async removeRestriction(userId: string, restriction: string): Promise<UserTrust> {
    const trust = await this.getUserTrust(userId);
    trust.restrictions = trust.restrictions.filter(r => r !== restriction);
    trust.updatedAt = new Date();
    await this.saveTrust(trust);
    return trust;
  }

  async setVerified(userId: string, verified: boolean): Promise<UserTrust> {
    const trust = await this.getUserTrust(userId);
    trust.isVerified = verified;

    if (verified) {
      await this.addSignal(userId, 'id_verified');
    }

    trust.updatedAt = new Date();
    await this.saveTrust(trust);
    return trust;
  }

  async recordActivity(userId: string): Promise<void> {
    const trust = await this.getUserTrust(userId);
    trust.lastActivity = new Date();
    trust.updatedAt = new Date();
    await this.saveTrust(trust);
  }

  async updateAccountAge(userId: string, days: number): Promise<UserTrust> {
    const trust = await this.getUserTrust(userId);
    trust.accountAge = days;
    trust.updatedAt = new Date();
    await this.saveTrust(trust);
    return trust;
  }

  getTrustLevels(): TrustLevel[] {
    return this.config.trustLevels;
  }

  getTrustLevelInfo(level: number): TrustLevel | undefined {
    return this.config.trustLevels.find(l => l.level === level);
  }

  private calculateScore(trust: UserTrust): number {
    let score = 10; // Base score

    // Add positive signals
    for (const signal of trust.positiveSignals) {
      if (!signal.expiresAt || signal.expiresAt > new Date()) {
        score += signal.value;
      }
    }

    // Add negative signals
    for (const signal of trust.negativeSignals) {
      if (!signal.expiresAt || signal.expiresAt > new Date()) {
        score += signal.value; // value is already negative
      }
    }

    // Account age bonus (up to 10 points)
    const ageBonus = Math.min(10, trust.accountAge / 30);
    score += ageBonus;

    // Verified bonus
    if (trust.isVerified) {
      score += 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  private determineLevel(score: number): number {
    let level = 0;

    for (const trustLevel of this.config.trustLevels) {
      if (score >= trustLevel.minScore) {
        level = trustLevel.level;
      }
    }

    return level;
  }

  private async saveTrust(trust: UserTrust): Promise<void> {
    await this.redis.set(`${this.trustPrefix}${trust.userId}`, JSON.stringify(trust));
  }
}
