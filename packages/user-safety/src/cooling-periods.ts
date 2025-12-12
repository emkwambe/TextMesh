import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import {
  CoolingPeriodConfig,
  CoolingPeriod,
  HotTopic,
} from './types';

const DEFAULT_CONFIG: CoolingPeriodConfig = {
  enabled: true,
  defaultDelay: 30, // 30 seconds
  hotTopicMultiplier: 10, // 5 minutes for hot topics
  maxDelay: 1800, // 30 minutes max
  bypassForTrustedUsers: true,
  trustedUserMinScore: 80,
};

export class CoolingPeriodService {
  private redis: Redis;
  private config: CoolingPeriodConfig;
  private readonly cooldownPrefix = 'safety:cooldown:';
  private readonly hotTopicPrefix = 'safety:hot_topic:';
  private readonly threadHeatPrefix = 'safety:thread_heat:';

  constructor(redis: Redis, config?: Partial<CoolingPeriodConfig>) {
    this.redis = redis;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async checkCooldown(
    userId: string,
    contentId: string,
    action: CoolingPeriod['action'],
    userTrustScore?: number
  ): Promise<{
    allowed: boolean;
    cooldown?: CoolingPeriod;
    message?: string;
  }> {
    if (!this.config.enabled) {
      return { allowed: true };
    }

    // Check if user is trusted and can bypass
    if (
      this.config.bypassForTrustedUsers &&
      userTrustScore !== undefined &&
      userTrustScore >= this.config.trustedUserMinScore
    ) {
      return { allowed: true };
    }

    // Check existing cooldown
    const existingKey = `${this.cooldownPrefix}${userId}:${contentId}:${action}`;
    const existing = await this.redis.get(existingKey);

    if (existing) {
      const cooldown: CoolingPeriod = JSON.parse(existing);
      cooldown.expiresAt = new Date(cooldown.expiresAt);
      cooldown.createdAt = new Date(cooldown.createdAt);

      const now = new Date();
      if (now < cooldown.expiresAt) {
        const remainingSeconds = Math.ceil(
          (cooldown.expiresAt.getTime() - now.getTime()) / 1000
        );
        return {
          allowed: false,
          cooldown,
          message: `Please wait ${remainingSeconds} seconds before ${action}ing`,
        };
      }
    }

    // Check if this is a hot topic
    const hotTopic = await this.getHotTopic(contentId);
    const threadHeat = await this.getThreadHeat(contentId);

    let delay = this.config.defaultDelay;
    let reason: CoolingPeriod['reason'] = 'rate_limit';

    if (hotTopic && hotTopic.isActive) {
      delay = Math.min(
        delay * this.config.hotTopicMultiplier,
        this.config.maxDelay
      );
      reason = 'hot_topic';
    } else if (threadHeat > 50) {
      delay = Math.min(delay * (threadHeat / 25), this.config.maxDelay);
      reason = 'heated_thread';
    }

    // Apply cooldown
    const cooldown = await this.applyCooldown(userId, contentId, action, delay, reason);

    // For first interaction, allow it
    return { allowed: true, cooldown };
  }

  async applyCooldown(
    userId: string,
    contentId: string,
    action: CoolingPeriod['action'],
    delaySeconds: number,
    reason: CoolingPeriod['reason']
  ): Promise<CoolingPeriod> {
    const cooldown: CoolingPeriod = {
      id: uuidv4(),
      userId,
      contentId,
      action,
      reason,
      delaySeconds,
      expiresAt: new Date(Date.now() + delaySeconds * 1000),
      createdAt: new Date(),
    };

    const key = `${this.cooldownPrefix}${userId}:${contentId}:${action}`;
    await this.redis.set(key, JSON.stringify(cooldown), 'EX', delaySeconds);

    return cooldown;
  }

  async trackInteraction(
    contentId: string,
    interactionType: 'reply' | 'like' | 'repost'
  ): Promise<void> {
    const now = Date.now();
    const windowKey = `safety:interaction_window:${contentId}`;

    // Add interaction with timestamp
    await this.redis.zadd(windowKey, now, `${interactionType}:${now}`);

    // Remove old interactions (older than 5 minutes)
    await this.redis.zremrangebyscore(windowKey, 0, now - 300000);

    // Set expiry
    await this.redis.expire(windowKey, 3600);

    // Check if this makes it a hot topic
    await this.evaluateHotTopic(contentId);
  }

  async evaluateHotTopic(contentId: string): Promise<HotTopic | null> {
    const now = Date.now();
    const windowKey = `safety:interaction_window:${contentId}`;

    // Count recent interactions
    const recentCount = await this.redis.zcount(
      windowKey,
      now - 60000, // last minute
      now
    );

    // Calculate reply velocity
    const replies = await this.redis.zrangebyscore(
      windowKey,
      now - 60000,
      now
    );
    const replyCount = replies.filter(r => r.startsWith('reply:')).length;
    const replyVelocity = replyCount; // replies per minute

    // Calculate heat score
    const heatScore = Math.min(100, replyVelocity * 5 + recentCount);

    // Detect controversy (would need sentiment analysis in production)
    const controversyScore = this.estimateControversy(recentCount, replyCount);

    if (heatScore >= 50 || controversyScore >= 60) {
      const hotTopic: HotTopic = {
        contentId,
        heatScore,
        replyVelocity,
        controversyScore,
        isActive: true,
        detectedAt: new Date(),
        lastUpdated: new Date(),
      };

      await this.redis.set(
        `${this.hotTopicPrefix}${contentId}`,
        JSON.stringify(hotTopic),
        'EX',
        3600 // 1 hour
      );

      return hotTopic;
    }

    return null;
  }

  async getHotTopic(contentId: string): Promise<HotTopic | null> {
    const data = await this.redis.get(`${this.hotTopicPrefix}${contentId}`);
    if (!data) return null;

    const topic = JSON.parse(data);
    topic.detectedAt = new Date(topic.detectedAt);
    topic.lastUpdated = new Date(topic.lastUpdated);
    return topic;
  }

  async getActiveHotTopics(limit: number = 20): Promise<HotTopic[]> {
    const topics: HotTopic[] = [];
    let cursor = '0';

    do {
      const [newCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${this.hotTopicPrefix}*`,
        'COUNT',
        100
      );
      cursor = newCursor;

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const topic = JSON.parse(data);
          if (topic.isActive) {
            topic.detectedAt = new Date(topic.detectedAt);
            topic.lastUpdated = new Date(topic.lastUpdated);
            topics.push(topic);
          }
        }
      }
    } while (cursor !== '0' && topics.length < limit);

    return topics.sort((a, b) => b.heatScore - a.heatScore).slice(0, limit);
  }

  async setThreadHeat(contentId: string, heat: number): Promise<void> {
    await this.redis.set(
      `${this.threadHeatPrefix}${contentId}`,
      heat.toString(),
      'EX',
      3600
    );
  }

  async getThreadHeat(contentId: string): Promise<number> {
    const heat = await this.redis.get(`${this.threadHeatPrefix}${contentId}`);
    return heat ? parseFloat(heat) : 0;
  }

  async incrementThreadHeat(
    contentId: string,
    amount: number = 5
  ): Promise<number> {
    const key = `${this.threadHeatPrefix}${contentId}`;
    const newHeat = await this.redis.incrbyfloat(key, amount);
    await this.redis.expire(key, 3600);
    return parseFloat(newHeat);
  }

  async decayThreadHeat(contentId: string, decayRate: number = 0.9): Promise<number> {
    const currentHeat = await this.getThreadHeat(contentId);
    const newHeat = currentHeat * decayRate;

    if (newHeat < 1) {
      await this.redis.del(`${this.threadHeatPrefix}${contentId}`);
      return 0;
    }

    await this.setThreadHeat(contentId, newHeat);
    return newHeat;
  }

  private estimateControversy(totalInteractions: number, replies: number): number {
    // Simple heuristic: high reply ratio often indicates controversy
    if (totalInteractions === 0) return 0;
    const replyRatio = replies / totalInteractions;
    return Math.min(100, replyRatio * 100 + (replies > 10 ? 20 : 0));
  }
}
