// =================================
// TEXTMESH BEHAVIOR ANALYZER
// User Behavior Pattern Detection
// =================================

import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';

// ============ BEHAVIOR TYPES ============

export interface BehaviorAnalysis {
  userId: string;
  riskLevel: RiskLevel;
  patterns: BehaviorPattern[];
  anomalies: Anomaly[];
  trustScore: number;
  flags: BehaviorFlag[];
  recommendations: string[];
}

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface BehaviorPattern {
  type: PatternType;
  frequency: number;
  lastOccurrence: Date;
  severity: number;
  description: string;
}

export type PatternType =
  | 'mass_following'
  | 'mass_unfollowing'
  | 'spam_liking'
  | 'rapid_posting'
  | 'coordinated_activity'
  | 'account_farming'
  | 'engagement_manipulation'
  | 'bot_behavior'
  | 'harassment_pattern'
  | 'ban_evasion';

export interface Anomaly {
  type: string;
  expectedValue: number;
  actualValue: number;
  deviation: number;
  timestamp: Date;
}

export interface BehaviorFlag {
  type: string;
  severity: 'warning' | 'serious' | 'critical';
  reason: string;
  evidence: string[];
  timestamp: Date;
}

// ============ BEHAVIOR THRESHOLDS ============

const BEHAVIOR_THRESHOLDS = {
  // Follow/unfollow limits
  maxFollowsPerHour: 60,
  maxFollowsPerDay: 400,
  maxUnfollowsPerHour: 50,
  massFollowUnfollowRatio: 0.8, // If unfollow rate > 80% of follow rate

  // Engagement limits
  maxLikesPerMinute: 30,
  maxLikesPerHour: 200,
  maxCommentsPerHour: 100,

  // Posting limits
  maxPostsPerHour: 20,
  maxMentionsPerPost: 10,

  // Velocity thresholds
  actionVelocityThreshold: 2.0, // 2x normal rate triggers warning
  burstThreshold: 5.0, // 5x normal rate triggers investigation

  // Session anomalies
  minSessionGap: 5000, // 5 seconds minimum between sessions
  maxConcurrentSessions: 3,
};

// ============ BEHAVIOR ANALYZER CLASS ============

export class BehaviorAnalyzer {
  private redis: Redis;
  private prisma: PrismaClient;

  constructor(redis: Redis, prisma: PrismaClient) {
    this.redis = redis;
    this.prisma = prisma;
  }

  /**
   * Analyze user behavior patterns
   */
  async analyze(userId: string): Promise<BehaviorAnalysis> {
    const patterns: BehaviorPattern[] = [];
    const anomalies: Anomaly[] = [];
    const flags: BehaviorFlag[] = [];

    // Run all behavior checks in parallel
    await Promise.all([
      this.checkFollowBehavior(userId, patterns, flags),
      this.checkEngagementBehavior(userId, patterns, flags),
      this.checkPostingBehavior(userId, patterns, flags),
      this.checkSessionAnomalies(userId, anomalies, flags),
      this.checkCoordinatedActivity(userId, patterns, flags),
      this.checkBotIndicators(userId, patterns, flags),
    ]);

    // Calculate risk level and trust score
    const riskLevel = this.calculateRiskLevel(patterns, flags);
    const trustScore = this.calculateTrustScore(userId, patterns, flags);

    // Generate recommendations
    const recommendations = this.generateRecommendations(patterns, flags, riskLevel);

    return {
      userId,
      riskLevel,
      patterns,
      anomalies,
      trustScore,
      flags,
      recommendations,
    };
  }

  /**
   * Check follow/unfollow behavior patterns
   */
  private async checkFollowBehavior(
    userId: string,
    patterns: BehaviorPattern[],
    flags: BehaviorFlag[]
  ): Promise<void> {
    const now = Date.now();
    const hourAgo = now - 3600 * 1000;
    const dayAgo = now - 86400 * 1000;

    // Get follow counts
    const [followsHour, followsDay, unfollowsHour] = await Promise.all([
      this.redis.zcount(`user:follows:${userId}`, hourAgo, now),
      this.redis.zcount(`user:follows:${userId}`, dayAgo, now),
      this.redis.zcount(`user:unfollows:${userId}`, hourAgo, now),
    ]);

    // Check mass following
    if (followsHour > BEHAVIOR_THRESHOLDS.maxFollowsPerHour) {
      patterns.push({
        type: 'mass_following',
        frequency: followsHour,
        lastOccurrence: new Date(),
        severity: followsHour / BEHAVIOR_THRESHOLDS.maxFollowsPerHour,
        description: `${followsHour} follows in the last hour`,
      });

      flags.push({
        type: 'rate_limit_exceeded',
        severity: 'serious',
        reason: 'Excessive follow activity',
        evidence: [`${followsHour} follows in 1 hour (limit: ${BEHAVIOR_THRESHOLDS.maxFollowsPerHour})`],
        timestamp: new Date(),
      });
    }

    // Check mass following/unfollowing pattern (follow-unfollow manipulation)
    if (
      followsHour > 20 &&
      unfollowsHour > 0 &&
      unfollowsHour / followsHour >= BEHAVIOR_THRESHOLDS.massFollowUnfollowRatio
    ) {
      patterns.push({
        type: 'mass_unfollowing',
        frequency: unfollowsHour,
        lastOccurrence: new Date(),
        severity: 0.8,
        description: 'Follow-unfollow manipulation detected',
      });

      flags.push({
        type: 'engagement_manipulation',
        severity: 'serious',
        reason: 'Follow-unfollow pattern detected',
        evidence: [
          `${followsHour} follows, ${unfollowsHour} unfollows in 1 hour`,
          `Unfollow ratio: ${((unfollowsHour / followsHour) * 100).toFixed(1)}%`,
        ],
        timestamp: new Date(),
      });
    }
  }

  /**
   * Check engagement behavior patterns
   */
  private async checkEngagementBehavior(
    userId: string,
    patterns: BehaviorPattern[],
    flags: BehaviorFlag[]
  ): Promise<void> {
    const now = Date.now();
    const minuteAgo = now - 60 * 1000;
    const hourAgo = now - 3600 * 1000;

    const [likesMinute, likesHour, commentsHour] = await Promise.all([
      this.redis.zcount(`user:likes:${userId}`, minuteAgo, now),
      this.redis.zcount(`user:likes:${userId}`, hourAgo, now),
      this.redis.zcount(`user:comments:${userId}`, hourAgo, now),
    ]);

    // Check spam liking
    if (likesMinute > BEHAVIOR_THRESHOLDS.maxLikesPerMinute) {
      patterns.push({
        type: 'spam_liking',
        frequency: likesMinute,
        lastOccurrence: new Date(),
        severity: likesMinute / BEHAVIOR_THRESHOLDS.maxLikesPerMinute,
        description: `${likesMinute} likes in the last minute`,
      });

      flags.push({
        type: 'automated_activity',
        severity: 'warning',
        reason: 'Rapid like activity suggests automation',
        evidence: [`${likesMinute} likes in 1 minute`],
        timestamp: new Date(),
      });
    }

    // Check overall engagement velocity
    if (likesHour > BEHAVIOR_THRESHOLDS.maxLikesPerHour) {
      patterns.push({
        type: 'engagement_manipulation',
        frequency: likesHour,
        lastOccurrence: new Date(),
        severity: 0.6,
        description: 'High volume engagement activity',
      });
    }
  }

  /**
   * Check posting behavior patterns
   */
  private async checkPostingBehavior(
    userId: string,
    patterns: BehaviorPattern[],
    flags: BehaviorFlag[]
  ): Promise<void> {
    const now = Date.now();
    const hourAgo = now - 3600 * 1000;

    const postsHour = await this.redis.zcount(`user:posts:${userId}`, hourAgo, now);

    if (postsHour > BEHAVIOR_THRESHOLDS.maxPostsPerHour) {
      patterns.push({
        type: 'rapid_posting',
        frequency: postsHour,
        lastOccurrence: new Date(),
        severity: postsHour / BEHAVIOR_THRESHOLDS.maxPostsPerHour,
        description: `${postsHour} posts in the last hour`,
      });

      flags.push({
        type: 'spam_behavior',
        severity: 'warning',
        reason: 'Excessive posting frequency',
        evidence: [`${postsHour} posts in 1 hour`],
        timestamp: new Date(),
      });
    }

    // Check for duplicate content
    const recentPosts = await this.redis.lrange(`user:content:${userId}`, 0, 9);
    const duplicates = this.findDuplicates(recentPosts);

    if (duplicates > 3) {
      patterns.push({
        type: 'spam_liking',
        frequency: duplicates,
        lastOccurrence: new Date(),
        severity: 0.7,
        description: 'Duplicate content posting',
      });
    }
  }

  /**
   * Check session anomalies
   */
  private async checkSessionAnomalies(
    userId: string,
    anomalies: Anomaly[],
    flags: BehaviorFlag[]
  ): Promise<void> {
    // Get recent session data
    const sessions = await this.redis.lrange(`user:sessions:${userId}`, 0, 19);
    const sessionData = sessions.map((s) => JSON.parse(s) as { timestamp: number; ip: string; device: string });

    if (sessionData.length < 2) return;

    // Check for impossibly fast session switches
    for (let i = 1; i < sessionData.length; i++) {
      const gap = (sessionData[i - 1]?.timestamp || 0) - (sessionData[i]?.timestamp || 0);
      if (gap < BEHAVIOR_THRESHOLDS.minSessionGap && gap > 0) {
        anomalies.push({
          type: 'rapid_session_switch',
          expectedValue: BEHAVIOR_THRESHOLDS.minSessionGap,
          actualValue: gap,
          deviation: BEHAVIOR_THRESHOLDS.minSessionGap / gap,
          timestamp: new Date(sessionData[i]?.timestamp || 0),
        });
      }
    }

    // Check for concurrent sessions from different locations
    const now = Date.now();
    const recentSessions = sessionData.filter(
      (s) => now - s.timestamp < 60000
    );
    const uniqueIPs = new Set(recentSessions.map((s) => s.ip));

    if (uniqueIPs.size > BEHAVIOR_THRESHOLDS.maxConcurrentSessions) {
      flags.push({
        type: 'account_sharing',
        severity: 'warning',
        reason: 'Multiple concurrent sessions from different IPs',
        evidence: [`${uniqueIPs.size} different IPs in last minute`],
        timestamp: new Date(),
      });
    }
  }

  /**
   * Check for coordinated activity
   */
  private async checkCoordinatedActivity(
    userId: string,
    patterns: BehaviorPattern[],
    flags: BehaviorFlag[]
  ): Promise<void> {
    // Check if user is part of known coordinated groups
    const isCoordinated = await this.redis.sismember('coordinated:users', userId);

    if (isCoordinated === 1) {
      patterns.push({
        type: 'coordinated_activity',
        frequency: 1,
        lastOccurrence: new Date(),
        severity: 0.9,
        description: 'User linked to coordinated network',
      });

      flags.push({
        type: 'coordinated_network',
        severity: 'critical',
        reason: 'Account linked to coordinated inauthentic behavior network',
        evidence: ['Flagged by coordination detection system'],
        timestamp: new Date(),
      });
    }

    // Check for coordinated engagement patterns
    const recentTargets = await this.redis.smembers(`user:engagement_targets:${userId}`);
    if (recentTargets.length > 0) {
      const coordinatedTargets = await this.checkCoordinatedTargets(recentTargets);
      if (coordinatedTargets > 5) {
        patterns.push({
          type: 'coordinated_activity',
          frequency: coordinatedTargets,
          lastOccurrence: new Date(),
          severity: 0.7,
          description: 'Engaging with same targets as known coordinated accounts',
        });
      }
    }
  }

  /**
   * Check for bot indicators
   */
  private async checkBotIndicators(
    userId: string,
    patterns: BehaviorPattern[],
    flags: BehaviorFlag[]
  ): Promise<void> {
    const indicators: string[] = [];

    // Check timing patterns
    const actionTimestamps = await this.redis.zrange(
      `user:actions:${userId}`,
      0,
      99,
      'WITHSCORES'
    );

    // Parse timestamps and check for regular intervals (bot-like)
    const timestamps: number[] = [];
    for (let i = 1; i < actionTimestamps.length; i += 2) {
      timestamps.push(parseInt(actionTimestamps[i] || '0', 10));
    }

    if (timestamps.length > 10) {
      const intervals: number[] = [];
      for (let i = 1; i < timestamps.length; i++) {
        intervals.push((timestamps[i - 1] || 0) - (timestamps[i] || 0));
      }

      // Check for suspiciously regular intervals
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const variance = intervals.reduce((sum, i) => sum + Math.pow(i - avgInterval, 2), 0) / intervals.length;
      const stdDev = Math.sqrt(variance);
      const coefficientOfVariation = stdDev / avgInterval;

      if (coefficientOfVariation < 0.1 && avgInterval < 60000) {
        indicators.push('Suspiciously regular action intervals');
        patterns.push({
          type: 'bot_behavior',
          frequency: timestamps.length,
          lastOccurrence: new Date(),
          severity: 0.8,
          description: 'Machine-like timing patterns detected',
        });
      }
    }

    // Check profile completeness (bots often have incomplete profiles)
    const profileScore = await this.getProfileCompleteness(userId);
    if (profileScore < 0.3) {
      indicators.push('Incomplete profile');
    }

    // Check account age vs activity
    const accountAge = await this.getAccountAge(userId);
    const totalActions = await this.getTotalActions(userId);

    if (accountAge < 7 && totalActions > 1000) {
      indicators.push('High activity for new account');
      patterns.push({
        type: 'account_farming',
        frequency: totalActions,
        lastOccurrence: new Date(),
        severity: 0.6,
        description: 'New account with unusually high activity',
      });
    }

    if (indicators.length >= 2) {
      flags.push({
        type: 'bot_suspected',
        severity: 'serious',
        reason: 'Multiple bot indicators detected',
        evidence: indicators,
        timestamp: new Date(),
      });
    }
  }

  /**
   * Calculate overall risk level
   */
  private calculateRiskLevel(
    patterns: BehaviorPattern[],
    flags: BehaviorFlag[]
  ): RiskLevel {
    // Count flags by severity
    const criticalFlags = flags.filter((f) => f.severity === 'critical').length;
    const seriousFlags = flags.filter((f) => f.severity === 'serious').length;
    const warningFlags = flags.filter((f) => f.severity === 'warning').length;

    // Calculate max pattern severity
    const maxPatternSeverity = patterns.length > 0
      ? Math.max(...patterns.map((p) => p.severity))
      : 0;

    if (criticalFlags > 0 || maxPatternSeverity > 0.9) {
      return 'critical';
    }

    if (seriousFlags >= 2 || maxPatternSeverity > 0.7) {
      return 'high';
    }

    if (seriousFlags >= 1 || warningFlags >= 3 || maxPatternSeverity > 0.5) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Calculate trust score (0-100)
   */
  private calculateTrustScore(
    _userId: string,
    patterns: BehaviorPattern[],
    flags: BehaviorFlag[]
  ): number {
    let score = 100;

    // Deduct for patterns
    for (const pattern of patterns) {
      score -= pattern.severity * 15;
    }

    // Deduct for flags
    for (const flag of flags) {
      switch (flag.severity) {
        case 'critical':
          score -= 30;
          break;
        case 'serious':
          score -= 15;
          break;
        case 'warning':
          score -= 5;
          break;
      }
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Generate action recommendations
   */
  private generateRecommendations(
    patterns: BehaviorPattern[],
    flags: BehaviorFlag[],
    riskLevel: RiskLevel
  ): string[] {
    const recommendations: string[] = [];

    if (riskLevel === 'critical') {
      recommendations.push('Immediate account suspension recommended');
      recommendations.push('Flag for manual review');
    }

    if (riskLevel === 'high') {
      recommendations.push('Apply shadow ban');
      recommendations.push('Enable enhanced monitoring');
      recommendations.push('Require additional verification');
    }

    const hasCoordinated = patterns.some((p) => p.type === 'coordinated_activity');
    if (hasCoordinated) {
      recommendations.push('Investigate connected accounts');
      recommendations.push('Check for network of fake accounts');
    }

    const hasBot = patterns.some((p) => p.type === 'bot_behavior');
    if (hasBot) {
      recommendations.push('Send CAPTCHA challenge');
      recommendations.push('Require phone verification');
    }

    const hasSpam = patterns.some(
      (p) => p.type === 'spam_liking' || p.type === 'rapid_posting'
    );
    if (hasSpam) {
      recommendations.push('Apply temporary rate limits');
      recommendations.push('Enable spam filtering on content');
    }

    if (recommendations.length === 0) {
      recommendations.push('Continue normal monitoring');
    }

    return recommendations;
  }

  // ============ HELPER METHODS ============

  private findDuplicates(contents: string[]): number {
    const seen = new Set<string>();
    let duplicates = 0;

    for (const content of contents) {
      if (seen.has(content)) {
        duplicates++;
      } else {
        seen.add(content);
      }
    }

    return duplicates;
  }

  private async checkCoordinatedTargets(targets: string[]): Promise<number> {
    let coordinatedCount = 0;

    for (const target of targets.slice(0, 20)) {
      const isCoordinatedTarget = await this.redis.sismember(
        'coordinated:targets',
        target
      );
      if (isCoordinatedTarget === 1) {
        coordinatedCount++;
      }
    }

    return coordinatedCount;
  }

  private async getProfileCompleteness(userId: string): Promise<number> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          bio: true,
          avatar: true,
          displayName: true,
          website: true,
          location: true,
        },
      });

      if (!user) return 0;

      let score = 0;
      if (user.bio) score += 0.3;
      if (user.avatar) score += 0.3;
      if (user.displayName) score += 0.2;
      if (user.website) score += 0.1;
      if (user.location) score += 0.1;

      return score;
    } catch {
      return 0.5;
    }
  }

  private async getAccountAge(userId: string): Promise<number> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { createdAt: true },
      });

      if (!user) return 365;

      const ageMs = Date.now() - user.createdAt.getTime();
      return ageMs / (1000 * 60 * 60 * 24);
    } catch {
      return 365;
    }
  }

  private async getTotalActions(userId: string): Promise<number> {
    const [posts, likes, comments, follows] = await Promise.all([
      this.redis.zcard(`user:posts:${userId}`),
      this.redis.zcard(`user:likes:${userId}`),
      this.redis.zcard(`user:comments:${userId}`),
      this.redis.zcard(`user:follows:${userId}`),
    ]);

    return posts + likes + comments + follows;
  }

  /**
   * Record user action for analysis
   */
  async recordAction(
    userId: string,
    actionType: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const now = Date.now();
    const key = `user:actions:${userId}`;

    await this.redis.zadd(key, now, JSON.stringify({ type: actionType, ...metadata }));
    await this.redis.expire(key, 86400);

    // Also record to type-specific key
    const typeKey = `user:${actionType}:${userId}`;
    await this.redis.zadd(typeKey, now, `${now}`);
    await this.redis.expire(typeKey, 86400);
  }

  /**
   * Flag user for coordinated activity investigation
   */
  async flagForCoordination(userId: string): Promise<void> {
    await this.redis.sadd('coordinated:users', userId);
  }
}

export default BehaviorAnalyzer;
