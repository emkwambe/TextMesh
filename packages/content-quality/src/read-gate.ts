import { Redis } from 'ioredis';
import {
  ReadGateConfig,
  ReadAttempt,
  ReadGateResult,
} from './types';

const DEFAULT_CONFIG: ReadGateConfig = {
  enabled: true,
  minReadTimePercent: 60, // Must spend 60% of estimated read time
  minScrollPercent: 80, // Must scroll 80% of content
  bypassForShortContent: true,
  shortContentThreshold: 50, // words
  cooldownAfterFail: 30, // 30 seconds
};

// Average reading speed: 200-250 words per minute
const WORDS_PER_MINUTE = 225;

export class ReadGate {
  private redis: Redis;
  private config: ReadGateConfig;
  private readonly attemptPrefix = 'quality:read_attempt:';
  private readonly passedPrefix = 'quality:read_passed:';
  private readonly cooldownPrefix = 'quality:read_cooldown:';

  constructor(redis: Redis, config?: Partial<ReadGateConfig>) {
    this.redis = redis;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async startReading(
    userId: string,
    contentId: string,
    wordCount: number
  ): Promise<{ attemptId: string; estimatedReadTime: number }> {
    const attemptId = `${userId}:${contentId}:${Date.now()}`;
    const estimatedReadTime = this.calculateReadTime(wordCount);

    const attempt: ReadAttempt = {
      userId,
      contentId,
      startTime: new Date(),
      scrollDepth: 0,
      timeSpent: 0,
      passed: false,
      attemptCount: await this.getAttemptCount(userId, contentId) + 1,
    };

    await this.redis.set(
      `${this.attemptPrefix}${attemptId}`,
      JSON.stringify(attempt),
      'EX',
      3600 // 1 hour TTL
    );

    return { attemptId, estimatedReadTime };
  }

  async updateProgress(
    attemptId: string,
    scrollDepth: number,
    timeSpent: number
  ): Promise<void> {
    const data = await this.redis.get(`${this.attemptPrefix}${attemptId}`);
    if (!data) return;

    const attempt: ReadAttempt = JSON.parse(data);
    attempt.scrollDepth = Math.max(attempt.scrollDepth, scrollDepth);
    attempt.timeSpent = timeSpent;

    await this.redis.set(
      `${this.attemptPrefix}${attemptId}`,
      JSON.stringify(attempt),
      'EX',
      3600
    );
  }

  async checkGate(
    userId: string,
    contentId: string,
    wordCount: number,
    scrollDepth: number,
    timeSpent: number
  ): Promise<ReadGateResult> {
    if (!this.config.enabled) {
      return { passed: true };
    }

    // Bypass for short content
    if (this.config.bypassForShortContent &&
        wordCount <= this.config.shortContentThreshold) {
      return { passed: true };
    }

    // Check cooldown
    const cooldownKey = `${this.cooldownPrefix}${userId}:${contentId}`;
    const cooldownRemaining = await this.redis.ttl(cooldownKey);
    if (cooldownRemaining > 0) {
      return {
        passed: false,
        reason: 'cooldown_active',
        cooldownRemaining,
      };
    }

    // Check if already passed
    const passedKey = `${this.passedPrefix}${userId}:${contentId}`;
    const alreadyPassed = await this.redis.exists(passedKey);
    if (alreadyPassed) {
      return { passed: true };
    }

    const estimatedReadTime = this.calculateReadTime(wordCount);
    const requiredTime = (estimatedReadTime * this.config.minReadTimePercent) / 100;
    const requiredScroll = this.config.minScrollPercent;

    // Check time requirement
    if (timeSpent < requiredTime) {
      await this.handleFailure(userId, contentId);
      return {
        passed: false,
        reason: 'insufficient_time',
        requiredTime: Math.round(requiredTime),
        actualTime: Math.round(timeSpent),
      };
    }

    // Check scroll requirement
    if (scrollDepth < requiredScroll) {
      await this.handleFailure(userId, contentId);
      return {
        passed: false,
        reason: 'insufficient_scroll',
        requiredScroll,
        actualScroll: scrollDepth,
      };
    }

    // Passed!
    await this.handleSuccess(userId, contentId);
    return { passed: true };
  }

  async canReply(
    userId: string,
    contentId: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    const passedKey = `${this.passedPrefix}${userId}:${contentId}`;
    const passed = await this.redis.exists(passedKey);

    if (!this.config.enabled || passed) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: 'Please read the full content before replying',
    };
  }

  async getReadStats(userId: string): Promise<{
    totalRead: number;
    passRate: number;
    averageReadTime: number;
  }> {
    const statsKey = `quality:read_stats:${userId}`;
    const data = await this.redis.get(statsKey);

    if (!data) {
      return { totalRead: 0, passRate: 0, averageReadTime: 0 };
    }

    return JSON.parse(data);
  }

  private async handleFailure(userId: string, contentId: string): Promise<void> {
    // Set cooldown
    const cooldownKey = `${this.cooldownPrefix}${userId}:${contentId}`;
    await this.redis.set(cooldownKey, '1', 'EX', this.config.cooldownAfterFail);

    // Increment attempt count
    const countKey = `quality:read_attempts:${userId}:${contentId}`;
    await this.redis.incr(countKey);
    await this.redis.expire(countKey, 86400); // 24 hour TTL
  }

  private async handleSuccess(userId: string, contentId: string): Promise<void> {
    // Mark as passed
    const passedKey = `${this.passedPrefix}${userId}:${contentId}`;
    await this.redis.set(passedKey, '1', 'EX', 86400 * 7); // 7 days

    // Update user stats
    await this.updateUserStats(userId, true);
  }

  private async updateUserStats(userId: string, passed: boolean): Promise<void> {
    const statsKey = `quality:read_stats:${userId}`;
    const data = await this.redis.get(statsKey);

    let stats = data ? JSON.parse(data) : {
      totalAttempts: 0,
      totalPassed: 0,
      totalReadTime: 0,
    };

    stats.totalAttempts++;
    if (passed) stats.totalPassed++;

    const passRate = (stats.totalPassed / stats.totalAttempts) * 100;

    await this.redis.set(statsKey, JSON.stringify({
      totalRead: stats.totalPassed,
      passRate: Math.round(passRate),
      averageReadTime: 0, // Calculate if needed
    }));
  }

  private async getAttemptCount(userId: string, contentId: string): Promise<number> {
    const countKey = `quality:read_attempts:${userId}:${contentId}`;
    const count = await this.redis.get(countKey);
    return count ? parseInt(count) : 0;
  }

  private calculateReadTime(wordCount: number): number {
    return (wordCount / WORDS_PER_MINUTE) * 60; // Return seconds
  }

  // For content authors to see engagement quality
  async getContentReadStats(contentId: string): Promise<{
    totalReaders: number;
    averageScrollDepth: number;
    averageTimeSpent: number;
    completionRate: number;
  }> {
    const statsKey = `quality:content_read_stats:${contentId}`;
    const data = await this.redis.get(statsKey);

    if (!data) {
      return {
        totalReaders: 0,
        averageScrollDepth: 0,
        averageTimeSpent: 0,
        completionRate: 0,
      };
    }

    return JSON.parse(data);
  }
}
