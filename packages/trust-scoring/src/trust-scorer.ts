/**
 * Trust Scorer
 *
 * Main trust scoring engine that combines all factors
 */

import { createLogger } from '@textmesh/logger';
import {
  TrustScore,
  TrustTier,
  TrustFactors,
  TrustConfig,
  TrustHistoryEntry,
  UserActivityMetrics,
  ContentQualityMetrics,
  ModerationMetrics,
  VerificationStatus,
  SocialMetrics,
  TrustUpdateEvent,
} from './types';
import {
  calculateAccountAgeFactor,
  calculateVerificationFactor,
  calculateActivityFactor,
  calculateContentQualityFactor,
  calculateSocialFactor,
  calculateModerationFactor,
  calculateEngagementFactor,
} from './factors';

const logger = createLogger({ service: 'trust-scorer', level: 'info' });

// Default configuration
const DEFAULT_CONFIG: TrustConfig = {
  weights: {
    accountAge: 0.15,
    verification: 0.20,
    activity: 0.15,
    contentQuality: 0.15,
    socialConnections: 0.10,
    moderation: 0.15,
    engagement: 0.10,
  },
  thresholds: {
    new: 0,
    low: 20,
    medium: 40,
    high: 60,
    verified: 75,
    trusted: 90,
  },
  penalties: {
    warning: 5,
    contentRemoved: 10,
    temporaryBan: 25,
    spamConfirmed: 15,
    fraudSignal: 20,
  },
  bonuses: {
    emailVerified: 20,
    phoneVerified: 20,
    identityVerified: 30,
    twoFactorEnabled: 10,
  },
};

export interface TrustScoreInput {
  userId: string;
  accountCreatedAt: Date;
  verification: VerificationStatus;
  activity: UserActivityMetrics;
  contentQuality: ContentQualityMetrics;
  social: SocialMetrics;
  moderation: ModerationMetrics;
  engagement: {
    receivedLikes: number;
    receivedComments: number;
    receivedShares: number;
    givenLikes: number;
    givenComments: number;
  };
}

export class TrustScorer {
  private config: TrustConfig;
  private scores: Map<string, TrustScore> = new Map();

  constructor(config: Partial<TrustConfig> = {}) {
    this.config = this.mergeConfig(DEFAULT_CONFIG, config);
  }

  /**
   * Calculate complete trust score
   */
  calculate(input: TrustScoreInput): TrustScore {
    const factors = this.calculateFactors(input);
    const score = this.calculateWeightedScore(factors);
    const tier = this.getTier(score);

    const existingScore = this.scores.get(input.userId);
    const history = existingScore?.history || [];

    // Add history entry if score changed significantly
    if (!existingScore || Math.abs(existingScore.score - score) >= 1) {
      const delta = existingScore ? score - existingScore.score : 0;
      history.push({
        timestamp: new Date(),
        score,
        tier,
        reason: existingScore ? 'Score recalculated' : 'Initial calculation',
        delta,
      });

      // Keep last 100 history entries
      if (history.length > 100) {
        history.shift();
      }
    }

    const trustScore: TrustScore = {
      userId: input.userId,
      score: Math.round(score * 10) / 10,
      tier,
      factors,
      history,
      updatedAt: new Date(),
      createdAt: existingScore?.createdAt || new Date(),
    };

    this.scores.set(input.userId, trustScore);

    logger.debug('Trust score calculated', {
      userId: input.userId,
      score: trustScore.score,
      tier,
    });

    return trustScore;
  }

  /**
   * Calculate all trust factors
   */
  private calculateFactors(input: TrustScoreInput): TrustFactors {
    return {
      accountAge: calculateAccountAgeFactor(input.accountCreatedAt, this.config),
      verification: calculateVerificationFactor(input.verification, this.config),
      activity: calculateActivityFactor(input.activity, this.config),
      contentQuality: calculateContentQualityFactor(input.contentQuality, this.config),
      socialConnections: calculateSocialFactor(input.social, this.config),
      moderation: calculateModerationFactor(input.moderation, this.config),
      engagement: calculateEngagementFactor(
        input.engagement.receivedLikes,
        input.engagement.receivedComments,
        input.engagement.receivedShares,
        input.engagement.givenLikes,
        input.engagement.givenComments,
        this.config
      ),
    };
  }

  /**
   * Calculate weighted score from factors
   */
  private calculateWeightedScore(factors: TrustFactors): number {
    let score = 0;
    let totalWeight = 0;

    for (const [key, factor] of Object.entries(factors)) {
      score += factor.value * factor.weight;
      totalWeight += factor.weight;
    }

    // Normalize to 0-100
    return totalWeight > 0 ? (score / totalWeight) : 0;
  }

  /**
   * Get trust tier from score
   */
  private getTier(score: number): TrustTier {
    if (score >= this.config.thresholds.trusted) return 'trusted';
    if (score >= this.config.thresholds.verified) return 'verified';
    if (score >= this.config.thresholds.high) return 'high';
    if (score >= this.config.thresholds.medium) return 'medium';
    if (score >= this.config.thresholds.low) return 'low';
    return 'new';
  }

  /**
   * Get cached score
   */
  getScore(userId: string): TrustScore | null {
    return this.scores.get(userId) || null;
  }

  /**
   * Apply incremental update to score
   */
  applyUpdate(userId: string, event: TrustUpdateEvent): TrustScore | null {
    const existingScore = this.scores.get(userId);
    if (!existingScore) return null;

    let delta = 0;

    switch (event.type) {
      case 'verification_complete':
        delta = event.value;
        break;
      case 'content_removed':
        delta = -this.config.penalties.contentRemoved;
        break;
      case 'warning_received':
        delta = -this.config.penalties.warning;
        break;
      case 'spam_confirmed':
        delta = -this.config.penalties.spamConfirmed;
        break;
      case 'fraud_signal':
        delta = -this.config.penalties.fraudSignal;
        break;
      case 'positive_engagement':
        delta = Math.min(5, event.value * 0.5);
        break;
      case 'trust_boost':
        delta = event.value;
        break;
      case 'trust_penalty':
        delta = -event.value;
        break;
      default:
        delta = event.value || 0;
    }

    const newScore = Math.max(0, Math.min(100, existingScore.score + delta));
    const newTier = this.getTier(newScore);

    existingScore.score = Math.round(newScore * 10) / 10;
    existingScore.tier = newTier;
    existingScore.updatedAt = new Date();
    existingScore.history.push({
      timestamp: new Date(),
      score: newScore,
      tier: newTier,
      reason: event.type,
      delta,
    });

    if (existingScore.history.length > 100) {
      existingScore.history.shift();
    }

    logger.info('Trust score updated', {
      userId,
      event: event.type,
      delta,
      newScore,
      newTier,
    });

    return existingScore;
  }

  /**
   * Batch calculate scores
   */
  batchCalculate(inputs: TrustScoreInput[]): TrustScore[] {
    return inputs.map((input) => this.calculate(input));
  }

  /**
   * Get score breakdown
   */
  getBreakdown(userId: string): {
    score: number;
    tier: TrustTier;
    factors: Array<{ name: string; value: number; weight: number; contribution: number }>;
  } | null {
    const trustScore = this.scores.get(userId);
    if (!trustScore) return null;

    const factors = Object.entries(trustScore.factors).map(([name, factor]) => ({
      name,
      value: factor.value,
      weight: factor.weight,
      contribution: factor.value * factor.weight,
    }));

    return {
      score: trustScore.score,
      tier: trustScore.tier,
      factors,
    };
  }

  /**
   * Get score history
   */
  getHistory(userId: string, limit: number = 30): TrustHistoryEntry[] {
    const trustScore = this.scores.get(userId);
    if (!trustScore) return [];

    return trustScore.history.slice(-limit);
  }

  /**
   * Compare scores
   */
  compare(userIdA: string, userIdB: string): {
    userA: TrustScore | null;
    userB: TrustScore | null;
    difference: number;
    comparison: 'higher' | 'lower' | 'equal';
  } {
    const userA = this.scores.get(userIdA) || null;
    const userB = this.scores.get(userIdB) || null;

    const scoreA = userA?.score || 0;
    const scoreB = userB?.score || 0;
    const difference = scoreA - scoreB;

    return {
      userA,
      userB,
      difference,
      comparison: difference > 0 ? 'higher' : difference < 0 ? 'lower' : 'equal',
    };
  }

  /**
   * Get users by tier
   */
  getUsersByTier(tier: TrustTier): string[] {
    const users: string[] = [];

    for (const [userId, score] of this.scores) {
      if (score.tier === tier) {
        users.push(userId);
      }
    }

    return users;
  }

  /**
   * Get top trusted users
   */
  getTopUsers(limit: number = 10): TrustScore[] {
    return Array.from(this.scores.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalUsers: number;
    averageScore: number;
    tierDistribution: Record<TrustTier, number>;
    scoreDistribution: {
      '0-20': number;
      '20-40': number;
      '40-60': number;
      '60-80': number;
      '80-100': number;
    };
  } {
    const scores = Array.from(this.scores.values());

    const tierDistribution: Record<TrustTier, number> = {
      new: 0,
      low: 0,
      medium: 0,
      high: 0,
      verified: 0,
      trusted: 0,
    };

    const scoreDistribution = {
      '0-20': 0,
      '20-40': 0,
      '40-60': 0,
      '60-80': 0,
      '80-100': 0,
    };

    let totalScore = 0;

    for (const score of scores) {
      totalScore += score.score;
      tierDistribution[score.tier]++;

      if (score.score < 20) scoreDistribution['0-20']++;
      else if (score.score < 40) scoreDistribution['20-40']++;
      else if (score.score < 60) scoreDistribution['40-60']++;
      else if (score.score < 80) scoreDistribution['60-80']++;
      else scoreDistribution['80-100']++;
    }

    return {
      totalUsers: scores.length,
      averageScore: scores.length > 0 ? totalScore / scores.length : 0,
      tierDistribution,
      scoreDistribution,
    };
  }

  /**
   * Clear user score
   */
  clearScore(userId: string): void {
    this.scores.delete(userId);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<TrustConfig>): void {
    this.config = this.mergeConfig(this.config, config);
  }

  /**
   * Get configuration
   */
  getConfig(): TrustConfig {
    return { ...this.config };
  }

  /**
   * Merge configuration
   */
  private mergeConfig(base: TrustConfig, override: Partial<TrustConfig>): TrustConfig {
    return {
      weights: { ...base.weights, ...override.weights },
      thresholds: { ...base.thresholds, ...override.thresholds },
      penalties: { ...base.penalties, ...override.penalties },
      bonuses: { ...base.bonuses, ...override.bonuses },
    };
  }
}

// Export singleton
export const trustScorer = new TrustScorer();
