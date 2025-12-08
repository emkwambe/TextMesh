// =================================
// TEXTMESH RISK SCORER
// Unified Risk Assessment System
// =================================

import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';

// ============ RISK SCORE TYPES ============

export interface RiskScore {
  userId: string;
  overallScore: number; // 0-100 (higher = more risky)
  components: RiskComponents;
  riskLevel: RiskLevel;
  factors: RiskFactor[];
  history: RiskHistoryEntry[];
  updatedAt: Date;
}

export interface RiskComponents {
  accountRisk: number; // Based on account characteristics
  behaviorRisk: number; // Based on recent behavior
  contentRisk: number; // Based on content quality
  networkRisk: number; // Based on connections
  reputationRisk: number; // Based on reports and violations
}

export type RiskLevel = 'minimal' | 'low' | 'moderate' | 'high' | 'severe';

export interface RiskFactor {
  category: RiskCategory;
  name: string;
  impact: number; // -10 to +10
  description: string;
  timestamp: Date;
}

export type RiskCategory =
  | 'account'
  | 'behavior'
  | 'content'
  | 'network'
  | 'reputation';

export interface RiskHistoryEntry {
  score: number;
  level: RiskLevel;
  timestamp: Date;
  reason?: string;
}

// ============ RISK WEIGHTS ============

const RISK_WEIGHTS: Record<keyof RiskComponents, number> = {
  accountRisk: 0.15,
  behaviorRisk: 0.30,
  contentRisk: 0.25,
  networkRisk: 0.10,
  reputationRisk: 0.20,
};

// ============ RISK THRESHOLDS ============

const RISK_THRESHOLDS = {
  minimal: 15,
  low: 35,
  moderate: 55,
  high: 75,
  // Above 75 = severe
};

// ============ RISK SCORER CLASS ============

export class RiskScorer {
  private redis: Redis;
  private prisma: PrismaClient;

  constructor(redis: Redis, prisma: PrismaClient) {
    this.redis = redis;
    this.prisma = prisma;
  }

  /**
   * Calculate comprehensive risk score for a user
   */
  async calculateRiskScore(userId: string): Promise<RiskScore> {
    const factors: RiskFactor[] = [];

    // Calculate all risk components in parallel
    const [accountRisk, behaviorRisk, contentRisk, networkRisk, reputationRisk] =
      await Promise.all([
        this.calculateAccountRisk(userId, factors),
        this.calculateBehaviorRisk(userId, factors),
        this.calculateContentRisk(userId, factors),
        this.calculateNetworkRisk(userId, factors),
        this.calculateReputationRisk(userId, factors),
      ]);

    const components: RiskComponents = {
      accountRisk,
      behaviorRisk,
      contentRisk,
      networkRisk,
      reputationRisk,
    };

    // Calculate weighted overall score
    const overallScore = this.calculateOverallScore(components);
    const riskLevel = this.determineRiskLevel(overallScore);

    // Get risk history
    const history = await this.getRiskHistory(userId);

    // Store current score
    await this.storeRiskScore(userId, overallScore, riskLevel);

    return {
      userId,
      overallScore,
      components,
      riskLevel,
      factors,
      history,
      updatedAt: new Date(),
    };
  }

  /**
   * Calculate account-based risk
   */
  private async calculateAccountRisk(
    userId: string,
    factors: RiskFactor[]
  ): Promise<number> {
    let risk = 0;

    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          createdAt: true,
          isVerified: true,
          email: true,
          phone: true,
          avatar: true,
          bio: true,
          followerCount: true,
          followingCount: true,
        },
      });

      if (!user) return 50; // Unknown user = moderate risk

      // Account age
      const ageInDays = (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      if (ageInDays < 1) {
        risk += 20;
        factors.push({
          category: 'account',
          name: 'new_account',
          impact: 20,
          description: 'Account less than 24 hours old',
          timestamp: new Date(),
        });
      } else if (ageInDays < 7) {
        risk += 10;
        factors.push({
          category: 'account',
          name: 'young_account',
          impact: 10,
          description: 'Account less than 7 days old',
          timestamp: new Date(),
        });
      } else if (ageInDays > 180) {
        risk -= 5;
        factors.push({
          category: 'account',
          name: 'established_account',
          impact: -5,
          description: 'Account more than 6 months old',
          timestamp: new Date(),
        });
      }

      // Verification status
      if (user.isVerified) {
        risk -= 15;
        factors.push({
          category: 'account',
          name: 'verified',
          impact: -15,
          description: 'Account is verified',
          timestamp: new Date(),
        });
      }

      // Contact verification
      if (!user.email && !user.phone) {
        risk += 15;
        factors.push({
          category: 'account',
          name: 'no_contact',
          impact: 15,
          description: 'No verified contact information',
          timestamp: new Date(),
        });
      }

      // Profile completeness
      const hasProfile = user.avatar && user.bio;
      if (!hasProfile) {
        risk += 10;
        factors.push({
          category: 'account',
          name: 'incomplete_profile',
          impact: 10,
          description: 'Profile is incomplete',
          timestamp: new Date(),
        });
      }

      // Follower ratio
      if (user.followingCount > 0) {
        const ratio = user.followerCount / user.followingCount;
        if (ratio < 0.1 && user.followingCount > 100) {
          risk += 10;
          factors.push({
            category: 'account',
            name: 'suspicious_ratio',
            impact: 10,
            description: 'Very low follower to following ratio',
            timestamp: new Date(),
          });
        }
      }
    } catch {
      return 25; // Default moderate risk on error
    }

    return Math.max(0, Math.min(100, risk));
  }

  /**
   * Calculate behavior-based risk
   */
  private async calculateBehaviorRisk(
    userId: string,
    factors: RiskFactor[]
  ): Promise<number> {
    let risk = 0;

    const now = Date.now();
    const hourAgo = now - 3600 * 1000;
    const dayAgo = now - 86400 * 1000;

    // Check recent activity velocity
    const [postsHour, likesHour, followsHour] = await Promise.all([
      this.redis.zcount(`user:posts:${userId}`, hourAgo, now),
      this.redis.zcount(`user:likes:${userId}`, hourAgo, now),
      this.redis.zcount(`user:follows:${userId}`, hourAgo, now),
    ]);

    // High posting frequency
    if (postsHour > 20) {
      risk += 20;
      factors.push({
        category: 'behavior',
        name: 'high_post_frequency',
        impact: 20,
        description: `${postsHour} posts in the last hour`,
        timestamp: new Date(),
      });
    }

    // High engagement velocity
    if (likesHour > 200) {
      risk += 15;
      factors.push({
        category: 'behavior',
        name: 'high_engagement_velocity',
        impact: 15,
        description: `${likesHour} likes in the last hour`,
        timestamp: new Date(),
      });
    }

    // Mass following
    if (followsHour > 50) {
      risk += 20;
      factors.push({
        category: 'behavior',
        name: 'mass_following',
        impact: 20,
        description: `${followsHour} follows in the last hour`,
        timestamp: new Date(),
      });
    }

    // Check for rate limit violations
    const violations = await this.redis.get(`user:violations:${userId}`);
    if (violations) {
      const count = parseInt(violations, 10);
      if (count > 0) {
        const impact = Math.min(30, count * 5);
        risk += impact;
        factors.push({
          category: 'behavior',
          name: 'rate_violations',
          impact,
          description: `${count} recent rate limit violations`,
          timestamp: new Date(),
        });
      }
    }

    // Check for blocked actions
    const blockedCount = await this.redis.get(`user:blocked_actions:${userId}`);
    if (blockedCount) {
      const count = parseInt(blockedCount, 10);
      if (count > 5) {
        risk += 15;
        factors.push({
          category: 'behavior',
          name: 'blocked_actions',
          impact: 15,
          description: `${count} recently blocked actions`,
          timestamp: new Date(),
        });
      }
    }

    return Math.max(0, Math.min(100, risk));
  }

  /**
   * Calculate content-based risk
   */
  private async calculateContentRisk(
    userId: string,
    factors: RiskFactor[]
  ): Promise<number> {
    let risk = 0;

    // Get content quality scores
    const toxicityScore = await this.redis.get(`user:avg_toxicity:${userId}`);
    if (toxicityScore) {
      const score = parseFloat(toxicityScore);
      if (score > 0.5) {
        const impact = Math.round(score * 40);
        risk += impact;
        factors.push({
          category: 'content',
          name: 'high_toxicity',
          impact,
          description: `Average toxicity score: ${(score * 100).toFixed(1)}%`,
          timestamp: new Date(),
        });
      }
    }

    // Get spam score
    const spamScore = await this.redis.get(`user:spam_score:${userId}`);
    if (spamScore) {
      const score = parseFloat(spamScore);
      if (score > 0.3) {
        const impact = Math.round(score * 30);
        risk += impact;
        factors.push({
          category: 'content',
          name: 'spam_content',
          impact,
          description: `Spam score: ${(score * 100).toFixed(1)}%`,
          timestamp: new Date(),
        });
      }
    }

    // Check for removed content
    const removedCount = await this.redis.get(`user:removed_content:${userId}`);
    if (removedCount) {
      const count = parseInt(removedCount, 10);
      if (count > 0) {
        const impact = Math.min(25, count * 5);
        risk += impact;
        factors.push({
          category: 'content',
          name: 'removed_content',
          impact,
          description: `${count} pieces of content removed`,
          timestamp: new Date(),
        });
      }
    }

    return Math.max(0, Math.min(100, risk));
  }

  /**
   * Calculate network-based risk
   */
  private async calculateNetworkRisk(
    userId: string,
    factors: RiskFactor[]
  ): Promise<number> {
    let risk = 0;

    // Check if user is connected to known bad actors
    const badConnectionsCount = await this.redis.sintercard(
      2,
      `user:following:${userId}`,
      'bad_actors:ids'
    );

    if (badConnectionsCount > 0) {
      const impact = Math.min(30, badConnectionsCount * 10);
      risk += impact;
      factors.push({
        category: 'network',
        name: 'bad_connections',
        impact,
        description: `Connected to ${badConnectionsCount} flagged accounts`,
        timestamp: new Date(),
      });
    }

    // Check for coordinated network membership
    const isCoordinated = await this.redis.sismember('coordinated:users', userId);
    if (isCoordinated === 1) {
      risk += 40;
      factors.push({
        category: 'network',
        name: 'coordinated_network',
        impact: 40,
        description: 'Part of coordinated inauthentic behavior network',
        timestamp: new Date(),
      });
    }

    // Check registration IP reputation
    const registrationIP = await this.redis.get(`user:registration_ip:${userId}`);
    if (registrationIP) {
      const ipRisk = await this.redis.get(`ip:risk:${registrationIP}`);
      if (ipRisk) {
        const ipRiskScore = parseInt(ipRisk, 10);
        if (ipRiskScore > 50) {
          risk += 15;
          factors.push({
            category: 'network',
            name: 'risky_ip',
            impact: 15,
            description: 'Registered from high-risk IP',
            timestamp: new Date(),
          });
        }
      }
    }

    return Math.max(0, Math.min(100, risk));
  }

  /**
   * Calculate reputation-based risk
   */
  private async calculateReputationRisk(
    userId: string,
    factors: RiskFactor[]
  ): Promise<number> {
    let risk = 0;

    try {
      // Check for reports against user
      const reportCount = await this.prisma.report.count({
        where: {
          targetUserId: userId,
          status: { in: ['pending', 'confirmed'] },
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      });

      if (reportCount > 0) {
        const impact = Math.min(30, reportCount * 5);
        risk += impact;
        factors.push({
          category: 'reputation',
          name: 'recent_reports',
          impact,
          description: `${reportCount} reports in the last 30 days`,
          timestamp: new Date(),
        });
      }

      // Check for past violations
      const violationCount = await this.prisma.violation.count({
        where: { userId },
      });

      if (violationCount > 0) {
        const impact = Math.min(40, violationCount * 10);
        risk += impact;
        factors.push({
          category: 'reputation',
          name: 'past_violations',
          impact,
          description: `${violationCount} past policy violations`,
          timestamp: new Date(),
        });
      }

      // Check for warnings
      const warningCount = await this.prisma.warning.count({
        where: {
          userId,
          acknowledged: false,
        },
      });

      if (warningCount > 0) {
        const impact = Math.min(15, warningCount * 5);
        risk += impact;
        factors.push({
          category: 'reputation',
          name: 'unacknowledged_warnings',
          impact,
          description: `${warningCount} unacknowledged warnings`,
          timestamp: new Date(),
        });
      }

      // Positive reputation factors
      const positiveFeedback = await this.redis.get(`user:positive_feedback:${userId}`);
      if (positiveFeedback) {
        const count = parseInt(positiveFeedback, 10);
        if (count > 100) {
          risk -= 10;
          factors.push({
            category: 'reputation',
            name: 'positive_reputation',
            impact: -10,
            description: 'High positive feedback from community',
            timestamp: new Date(),
          });
        }
      }
    } catch {
      // Default moderate risk on error
      return 25;
    }

    return Math.max(0, Math.min(100, risk));
  }

  /**
   * Calculate weighted overall score
   */
  private calculateOverallScore(components: RiskComponents): number {
    let score = 0;

    for (const [key, weight] of Object.entries(RISK_WEIGHTS)) {
      const componentKey = key as keyof RiskComponents;
      score += components[componentKey] * weight;
    }

    return Math.round(score);
  }

  /**
   * Determine risk level from score
   */
  private determineRiskLevel(score: number): RiskLevel {
    if (score <= RISK_THRESHOLDS.minimal) return 'minimal';
    if (score <= RISK_THRESHOLDS.low) return 'low';
    if (score <= RISK_THRESHOLDS.moderate) return 'moderate';
    if (score <= RISK_THRESHOLDS.high) return 'high';
    return 'severe';
  }

  /**
   * Get risk score history
   */
  private async getRiskHistory(userId: string): Promise<RiskHistoryEntry[]> {
    const historyKey = `user:risk_history:${userId}`;
    const entries = await this.redis.lrange(historyKey, 0, 29);

    return entries.map((entry) => JSON.parse(entry) as RiskHistoryEntry);
  }

  /**
   * Store current risk score
   */
  private async storeRiskScore(
    userId: string,
    score: number,
    level: RiskLevel
  ): Promise<void> {
    // Store current score
    await this.redis.set(`user:risk_score:${userId}`, score.toString());
    await this.redis.set(`user:risk_level:${userId}`, level);

    // Add to history
    const entry: RiskHistoryEntry = {
      score,
      level,
      timestamp: new Date(),
    };

    const historyKey = `user:risk_history:${userId}`;
    await this.redis.lpush(historyKey, JSON.stringify(entry));
    await this.redis.ltrim(historyKey, 0, 99);
    await this.redis.expire(historyKey, 90 * 24 * 60 * 60); // 90 days
  }

  /**
   * Quick risk check (cached)
   */
  async quickRiskCheck(userId: string): Promise<{ level: RiskLevel; score: number }> {
    const [scoreStr, level] = await Promise.all([
      this.redis.get(`user:risk_score:${userId}`),
      this.redis.get(`user:risk_level:${userId}`),
    ]);

    if (scoreStr && level) {
      return {
        level: level as RiskLevel,
        score: parseInt(scoreStr, 10),
      };
    }

    // Calculate if not cached
    const fullScore = await this.calculateRiskScore(userId);
    return {
      level: fullScore.riskLevel,
      score: fullScore.overallScore,
    };
  }

  /**
   * Update risk score with new factor
   */
  async addRiskFactor(
    userId: string,
    factor: Omit<RiskFactor, 'timestamp'>
  ): Promise<void> {
    // Add factor to user's risk factors
    const factorWithTimestamp: RiskFactor = {
      ...factor,
      timestamp: new Date(),
    };

    const key = `user:risk_factors:${userId}`;
    await this.redis.lpush(key, JSON.stringify(factorWithTimestamp));
    await this.redis.ltrim(key, 0, 99);
    await this.redis.expire(key, 30 * 24 * 60 * 60);

    // Recalculate risk score
    await this.calculateRiskScore(userId);
  }

  /**
   * Get users by risk level
   */
  async getUsersByRiskLevel(
    level: RiskLevel,
    limit: number = 100
  ): Promise<string[]> {
    // In production, this would use a sorted set or database query
    // For now, return from a cached set
    const key = `risk_level:${level}:users`;
    return this.redis.smembers(key).then((members) => members.slice(0, limit));
  }
}

export default RiskScorer;
