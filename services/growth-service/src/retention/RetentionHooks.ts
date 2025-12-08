// =================================
// TEXTMESH RETENTION HOOKS
// User Retention & Lifecycle Management
// =================================

import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { StreakTracker } from '../engagement/StreakTracker';
import { AchievementSystem } from '../engagement/AchievementSystem';

// ============ RETENTION TYPES ============

export interface RetentionStatus {
  userId: string;
  lifecycle: UserLifecycle;
  riskLevel: ChurnRisk;
  engagementScore: number;
  lastActive: Date;
  daysSinceActive: number;
  activationComplete: boolean;
  retentionFactors: RetentionFactor[];
  recommendations: RetentionRecommendation[];
}

export type UserLifecycle =
  | 'new' // 0-7 days
  | 'activating' // 7-30 days, partially engaged
  | 'activated' // 30+ days, fully engaged
  | 'at_risk' // Declining engagement
  | 'churning' // No activity 7+ days
  | 'churned' // No activity 30+ days
  | 'resurrected'; // Returned after churn

export type ChurnRisk = 'low' | 'medium' | 'high' | 'critical';

export interface RetentionFactor {
  factor: string;
  score: number;
  impact: 'positive' | 'negative' | 'neutral';
  weight: number;
}

export interface RetentionRecommendation {
  action: string;
  priority: 'high' | 'medium' | 'low';
  reason: string;
  expectedImpact: number;
}

export interface ActivationCriteria {
  hasProfile: boolean;
  hasAvatar: boolean;
  hasBio: boolean;
  followsCount: number;
  postsCount: number;
  engagementsCount: number;
  daysActive: number;
}

// ============ ACTIVATION THRESHOLDS ============

const ACTIVATION_THRESHOLDS = {
  minFollows: 5,
  minPosts: 1,
  minEngagements: 10,
  minDaysActive: 3,
};

// ============ RETENTION WEIGHTS ============

const RETENTION_WEIGHTS = {
  recency: 0.25,
  frequency: 0.20,
  engagement: 0.20,
  social: 0.15,
  content: 0.10,
  completion: 0.10,
};

// ============ RETENTION HOOKS CLASS ============

export class RetentionHooks {
  private redis: Redis;
  private prisma: PrismaClient;
  private streakTracker: StreakTracker;
  private achievementSystem: AchievementSystem;

  constructor(
    redis: Redis,
    prisma: PrismaClient,
    streakTracker: StreakTracker,
    achievementSystem: AchievementSystem
  ) {
    this.redis = redis;
    this.prisma = prisma;
    this.streakTracker = streakTracker;
    this.achievementSystem = achievementSystem;
  }

  /**
   * Get user retention status
   */
  async getRetentionStatus(userId: string): Promise<RetentionStatus> {
    const [
      lifecycle,
      engagementScore,
      lastActive,
      activationStatus,
      retentionFactors,
    ] = await Promise.all([
      this.calculateLifecycle(userId),
      this.calculateEngagementScore(userId),
      this.getLastActiveDate(userId),
      this.getActivationStatus(userId),
      this.analyzeRetentionFactors(userId),
    ]);

    const daysSinceActive = this.daysSince(lastActive);
    const riskLevel = this.calculateChurnRisk(lifecycle, engagementScore, daysSinceActive);
    const recommendations = await this.generateRecommendations(userId, lifecycle, retentionFactors);

    return {
      userId,
      lifecycle,
      riskLevel,
      engagementScore,
      lastActive,
      daysSinceActive,
      activationComplete: activationStatus.isActivated,
      retentionFactors,
      recommendations,
    };
  }

  /**
   * Track user activity for retention
   */
  async trackActivity(
    userId: string,
    activityType: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // Update last active
    await this.redis.set(`user:last_active:${userId}`, now.toISOString());

    // Increment daily activity count
    await this.redis.hincrby(`user:activity:${userId}:${today}`, activityType, 1);
    await this.redis.expire(`user:activity:${userId}:${today}`, 86400 * 30);

    // Add to active users set
    await this.redis.sadd(`active:users:${today}`, userId);

    // Update streak
    await this.streakTracker.recordActivity(userId, activityType);

    // Check for achievements
    const achievementType = this.mapActivityToAchievementType(activityType);
    if (achievementType) {
      await this.achievementSystem.checkAchievements(userId, achievementType);
    }

    // Check for resurrection
    await this.checkResurrection(userId);
  }

  /**
   * Get activation status
   */
  async getActivationStatus(userId: string): Promise<{
    isActivated: boolean;
    criteria: ActivationCriteria;
    progress: number;
  }> {
    const criteria = await this.getActivationCriteria(userId);
    const progress = this.calculateActivationProgress(criteria);
    const isActivated = progress >= 100;

    if (isActivated) {
      await this.redis.set(`user:activated:${userId}`, 'true');
    }

    return {
      isActivated,
      criteria,
      progress,
    };
  }

  /**
   * Get cohort analysis
   */
  async getCohortAnalysis(
    cohortDate: string,
    days: number = 30
  ): Promise<{
    cohortSize: number;
    retention: number[];
    metrics: Record<string, number>;
  }> {
    const cohortUsers = await this.redis.smembers(`cohort:${cohortDate}`);
    const cohortSize = cohortUsers.length;
    const retention: number[] = [];

    for (let day = 0; day < days; day++) {
      const checkDate = new Date(cohortDate);
      checkDate.setDate(checkDate.getDate() + day);
      const dateStr = checkDate.toISOString().split('T')[0];

      const activeUsers = await this.redis.smembers(`active:users:${dateStr}`);
      const activeInCohort = cohortUsers.filter((u) => activeUsers.includes(u)).length;

      retention.push(cohortSize > 0 ? (activeInCohort / cohortSize) * 100 : 0);
    }

    return {
      cohortSize,
      retention,
      metrics: {
        d1: retention[1] || 0,
        d7: retention[7] || 0,
        d14: retention[14] || 0,
        d30: retention[30 - 1] || 0,
      },
    };
  }

  /**
   * Get at-risk users
   */
  async getAtRiskUsers(limit: number = 100): Promise<Array<{
    userId: string;
    riskLevel: ChurnRisk;
    daysSinceActive: number;
    engagementScore: number;
  }>> {
    // This would scan users in production
    // For now, return from a cached set
    const atRiskIds = await this.redis.zrevrange('users:at_risk', 0, limit - 1);
    const results: Array<{
      userId: string;
      riskLevel: ChurnRisk;
      daysSinceActive: number;
      engagementScore: number;
    }> = [];

    for (const odUserId of atRiskIds) {
      const status = await this.getRetentionStatus(odUserId);
      results.push({
        userId: odUserId,
        riskLevel: status.riskLevel,
        daysSinceActive: status.daysSinceActive,
        engagementScore: status.engagementScore,
      });
    }

    return results;
  }

  /**
   * Run daily retention job
   */
  async runDailyRetentionJob(): Promise<{
    processed: number;
    atRisk: number;
    churned: number;
  }> {
    const today = new Date().toISOString().split('T')[0];
    const processed = 0;
    let atRisk = 0;
    let churned = 0;

    // In production, this would iterate through all users
    // For now, process recently active users

    const recentlyActive = await this.redis.smembers(`active:users:${today}`);

    for (const userId of recentlyActive) {
      const status = await this.getRetentionStatus(userId);

      if (status.riskLevel === 'high' || status.riskLevel === 'critical') {
        await this.redis.zadd('users:at_risk', status.engagementScore, userId);
        atRisk++;
      }

      if (status.lifecycle === 'churned') {
        churned++;
      }
    }

    return { processed: recentlyActive.length, atRisk, churned };
  }

  // ============ HELPER METHODS ============

  private async calculateLifecycle(userId: string): Promise<UserLifecycle> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true },
    });

    if (!user) return 'new';

    const daysSinceCreation = this.daysSince(user.createdAt);
    const lastActive = await this.getLastActiveDate(userId);
    const daysSinceActive = this.daysSince(lastActive);
    const isActivated = await this.redis.get(`user:activated:${userId}`);
    const wasChurned = await this.redis.get(`user:churned:${userId}`);

    // Check for resurrection
    if (wasChurned && daysSinceActive < 7) {
      return 'resurrected';
    }

    // Check for churn
    if (daysSinceActive >= 30) {
      await this.redis.set(`user:churned:${userId}`, 'true');
      return 'churned';
    }

    if (daysSinceActive >= 7) {
      return 'churning';
    }

    // Check engagement level
    const engagementScore = await this.calculateEngagementScore(userId);
    const isAtRisk = engagementScore < 30;

    if (isAtRisk && daysSinceCreation > 7) {
      return 'at_risk';
    }

    if (isActivated && daysSinceCreation >= 30) {
      return 'activated';
    }

    if (daysSinceCreation <= 7) {
      return 'new';
    }

    return 'activating';
  }

  private async calculateEngagementScore(userId: string): Promise<number> {
    const now = new Date();
    let totalScore = 0;

    // Recency (last active)
    const lastActive = await this.getLastActiveDate(userId);
    const daysSinceActive = this.daysSince(lastActive);
    const recencyScore = Math.max(0, 100 - daysSinceActive * 10);
    totalScore += recencyScore * RETENTION_WEIGHTS.recency;

    // Frequency (days active in last 30 days)
    let daysActive = 0;
    for (let i = 0; i < 30; i++) {
      const date = new Date(now.getTime() - i * 86400 * 1000);
      const dateStr = date.toISOString().split('T')[0];
      const wasActive = await this.redis.sismember(`active:users:${dateStr}`, userId);
      if (wasActive) daysActive++;
    }
    const frequencyScore = (daysActive / 30) * 100;
    totalScore += frequencyScore * RETENTION_WEIGHTS.frequency;

    // Engagement actions (likes, comments, shares)
    const engagementCount = await this.getEngagementCount(userId, 30);
    const engagementScore = Math.min(100, engagementCount * 2);
    totalScore += engagementScore * RETENTION_WEIGHTS.engagement;

    // Social (followers, following)
    const [followers, following] = await Promise.all([
      this.redis.get(`user:followers:count:${userId}`),
      this.redis.get(`user:following:count:${userId}`),
    ]);
    const socialScore = Math.min(100, (parseInt(followers || '0', 10) + parseInt(following || '0', 10)) / 2);
    totalScore += socialScore * RETENTION_WEIGHTS.social;

    // Content (posts)
    const postsCount = await this.redis.get(`user:posts:count:${userId}`);
    const contentScore = Math.min(100, parseInt(postsCount || '0', 10) * 5);
    totalScore += contentScore * RETENTION_WEIGHTS.content;

    // Profile completion
    const profileCompletion = await this.redis.get(`user:profile_completion:${userId}`);
    const completionScore = parseInt(profileCompletion || '0', 10);
    totalScore += completionScore * RETENTION_WEIGHTS.completion;

    return Math.round(totalScore);
  }

  private async getLastActiveDate(userId: string): Promise<Date> {
    const lastActive = await this.redis.get(`user:last_active:${userId}`);
    return lastActive ? new Date(lastActive) : new Date(0);
  }

  private async getActivationCriteria(userId: string): Promise<ActivationCriteria> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        avatar: true,
        bio: true,
        displayName: true,
        followerCount: true,
        followingCount: true,
        createdAt: true,
      },
    });

    const postsCount = await this.redis.get(`user:posts:count:${userId}`);
    const engagementsCount = await this.getEngagementCount(userId, 30);
    const daysActive = user ? this.daysSince(user.createdAt) : 0;

    return {
      hasProfile: !!user?.displayName,
      hasAvatar: !!user?.avatar,
      hasBio: !!user?.bio,
      followsCount: user?.followingCount || 0,
      postsCount: parseInt(postsCount || '0', 10),
      engagementsCount,
      daysActive,
    };
  }

  private calculateActivationProgress(criteria: ActivationCriteria): number {
    let progress = 0;
    const weights = {
      profile: 10,
      avatar: 10,
      bio: 10,
      follows: 30,
      posts: 20,
      engagements: 15,
      daysActive: 5,
    };

    if (criteria.hasProfile) progress += weights.profile;
    if (criteria.hasAvatar) progress += weights.avatar;
    if (criteria.hasBio) progress += weights.bio;

    progress += Math.min(weights.follows, (criteria.followsCount / ACTIVATION_THRESHOLDS.minFollows) * weights.follows);
    progress += Math.min(weights.posts, (criteria.postsCount / ACTIVATION_THRESHOLDS.minPosts) * weights.posts);
    progress += Math.min(weights.engagements, (criteria.engagementsCount / ACTIVATION_THRESHOLDS.minEngagements) * weights.engagements);
    progress += Math.min(weights.daysActive, (criteria.daysActive / ACTIVATION_THRESHOLDS.minDaysActive) * weights.daysActive);

    return Math.round(progress);
  }

  private calculateChurnRisk(
    lifecycle: UserLifecycle,
    engagementScore: number,
    daysSinceActive: number
  ): ChurnRisk {
    if (lifecycle === 'churned') return 'critical';
    if (lifecycle === 'churning') return 'high';

    if (daysSinceActive >= 5) return 'high';
    if (daysSinceActive >= 3) return 'medium';

    if (engagementScore < 20) return 'high';
    if (engagementScore < 40) return 'medium';

    return 'low';
  }

  private async analyzeRetentionFactors(userId: string): Promise<RetentionFactor[]> {
    const factors: RetentionFactor[] = [];

    // Streak factor
    const streak = await this.streakTracker.getStreak(userId);
    factors.push({
      factor: 'streak',
      score: Math.min(100, streak.currentStreak * 5),
      impact: streak.currentStreak > 0 ? 'positive' : 'neutral',
      weight: 0.2,
    });

    // Social connections
    const followingCount = await this.redis.get(`user:following:count:${userId}`);
    const socialScore = Math.min(100, parseInt(followingCount || '0', 10) * 2);
    factors.push({
      factor: 'social_connections',
      score: socialScore,
      impact: socialScore > 50 ? 'positive' : socialScore > 20 ? 'neutral' : 'negative',
      weight: 0.25,
    });

    // Content creation
    const postsCount = await this.redis.get(`user:posts:count:${userId}`);
    const contentScore = Math.min(100, parseInt(postsCount || '0', 10) * 5);
    factors.push({
      factor: 'content_creation',
      score: contentScore,
      impact: contentScore > 50 ? 'positive' : contentScore > 20 ? 'neutral' : 'negative',
      weight: 0.2,
    });

    // Achievement progress
    const achievements = await this.achievementSystem.getUserAchievements(userId);
    const achievementScore = Math.min(100, achievements.unlocked.length * 10);
    factors.push({
      factor: 'achievements',
      score: achievementScore,
      impact: achievementScore > 30 ? 'positive' : 'neutral',
      weight: 0.15,
    });

    return factors;
  }

  private async generateRecommendations(
    userId: string,
    lifecycle: UserLifecycle,
    factors: RetentionFactor[]
  ): Promise<RetentionRecommendation[]> {
    const recommendations: RetentionRecommendation[] = [];

    // Analyze factors for recommendations
    for (const factor of factors) {
      if (factor.impact === 'negative') {
        switch (factor.factor) {
          case 'social_connections':
            recommendations.push({
              action: 'Show follow suggestions',
              priority: 'high',
              reason: 'Low social connections reduce engagement',
              expectedImpact: 0.3,
            });
            break;
          case 'content_creation':
            recommendations.push({
              action: 'Send compose prompt notification',
              priority: 'medium',
              reason: 'Encourage content creation',
              expectedImpact: 0.2,
            });
            break;
          case 'streak':
            recommendations.push({
              action: 'Send streak reminder',
              priority: 'high',
              reason: 'Streak at risk',
              expectedImpact: 0.25,
            });
            break;
        }
      }
    }

    // Lifecycle-specific recommendations
    if (lifecycle === 'churning') {
      recommendations.push({
        action: 'Send win-back email',
        priority: 'high',
        reason: 'User is at risk of churning',
        expectedImpact: 0.4,
      });
    }

    if (lifecycle === 'new' || lifecycle === 'activating') {
      recommendations.push({
        action: 'Send onboarding tips',
        priority: 'medium',
        reason: 'Help user discover features',
        expectedImpact: 0.3,
      });
    }

    return recommendations.sort((a, b) => b.expectedImpact - a.expectedImpact);
  }

  private async checkResurrection(userId: string): Promise<void> {
    const wasChurned = await this.redis.get(`user:churned:${userId}`);
    if (wasChurned) {
      await this.redis.del(`user:churned:${userId}`);
      await this.redis.sadd('users:resurrected', userId);

      // Grant resurrection bonus
      await this.redis.incrby(`user:points:${userId}`, 50);
    }
  }

  private async getEngagementCount(userId: string, days: number): Promise<number> {
    let total = 0;
    const now = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date(now.getTime() - i * 86400 * 1000);
      const dateStr = date.toISOString().split('T')[0];
      const activity = await this.redis.hgetall(`user:activity:${userId}:${dateStr}`);

      for (const count of Object.values(activity)) {
        total += parseInt(count, 10);
      }
    }

    return total;
  }

  private daysSince(date: Date): number {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  private mapActivityToAchievementType(activityType: string): string | null {
    const mapping: Record<string, string> = {
      post: 'posts_count',
      like: 'likes_given',
      comment: 'comments_count',
      follow: 'following_count',
      repost: 'reposts_count',
    };

    return mapping[activityType] || null;
  }
}

export default RetentionHooks;
