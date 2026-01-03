// =================================
// TEXTMESH ACHIEVEMENT SYSTEM
// Gamification & Badges
// =================================

import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';

// ============ ACHIEVEMENT TYPES ============

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: AchievementCategory;
  tier: AchievementTier;
  requirement: AchievementRequirement;
  reward: AchievementReward;
  secret?: boolean;
  order: number;
}

export interface AchievementRequirement {
  type: RequirementType;
  target: number;
  condition?: string;
}

export type RequirementType =
  | 'posts_count'
  | 'followers_count'
  | 'following_count'
  | 'likes_received'
  | 'likes_given'
  | 'comments_count'
  | 'reposts_count'
  | 'streak_days'
  | 'referrals_count'
  | 'profile_complete'
  | 'verified'
  | 'first_post'
  | 'first_like'
  | 'first_follow'
  | 'custom';

export type AchievementCategory =
  | 'social'
  | 'content'
  | 'engagement'
  | 'milestones'
  | 'special'
  | 'seasonal';

export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';

export interface AchievementReward {
  points: number;
  badge?: string;
  feature?: string;
}

export interface UserAchievement {
  achievement: Achievement;
  unlockedAt: Date;
  progress?: number;
}

export interface AchievementProgress {
  achievement: Achievement;
  current: number;
  target: number;
  percentage: number;
}

// ============ ACHIEVEMENT DEFINITIONS ============

const ACHIEVEMENTS: Achievement[] = [
  // Social Achievements
  {
    id: 'first_follow',
    name: 'First Connection',
    description: 'Follow your first user',
    icon: 'ðŸ‘‹',
    category: 'social',
    tier: 'bronze',
    requirement: { type: 'following_count', target: 1 },
    reward: { points: 10 },
    order: 1,
  },
  {
    id: 'social_10',
    name: 'Making Friends',
    description: 'Follow 10 users',
    icon: 'ðŸ¤',
    category: 'social',
    tier: 'bronze',
    requirement: { type: 'following_count', target: 10 },
    reward: { points: 25 },
    order: 2,
  },
  {
    id: 'social_100',
    name: 'Networker',
    description: 'Follow 100 users',
    icon: 'ðŸŒ',
    category: 'social',
    tier: 'silver',
    requirement: { type: 'following_count', target: 100 },
    reward: { points: 100 },
    order: 3,
  },
  {
    id: 'followers_10',
    name: 'Getting Noticed',
    description: 'Reach 10 followers',
    icon: 'â­',
    category: 'social',
    tier: 'bronze',
    requirement: { type: 'followers_count', target: 10 },
    reward: { points: 50 },
    order: 4,
  },
  {
    id: 'followers_100',
    name: 'Rising Star',
    description: 'Reach 100 followers',
    icon: 'ðŸŒŸ',
    category: 'social',
    tier: 'silver',
    requirement: { type: 'followers_count', target: 100 },
    reward: { points: 200 },
    order: 5,
  },
  {
    id: 'followers_1000',
    name: 'Influencer',
    description: 'Reach 1,000 followers',
    icon: 'ðŸ’«',
    category: 'social',
    tier: 'gold',
    requirement: { type: 'followers_count', target: 1000 },
    reward: { points: 500, badge: 'influencer' },
    order: 6,
  },
  {
    id: 'followers_10000',
    name: 'Celebrity',
    description: 'Reach 10,000 followers',
    icon: 'ðŸ‘‘',
    category: 'social',
    tier: 'platinum',
    requirement: { type: 'followers_count', target: 10000 },
    reward: { points: 1000, badge: 'celebrity' },
    order: 7,
  },

  // Content Achievements
  {
    id: 'first_post',
    name: 'Hello World',
    description: 'Create your first post',
    icon: 'ðŸ“',
    category: 'content',
    tier: 'bronze',
    requirement: { type: 'first_post', target: 1 },
    reward: { points: 20 },
    order: 10,
  },
  {
    id: 'posts_10',
    name: 'Storyteller',
    description: 'Create 10 posts',
    icon: 'ðŸ“–',
    category: 'content',
    tier: 'bronze',
    requirement: { type: 'posts_count', target: 10 },
    reward: { points: 50 },
    order: 11,
  },
  {
    id: 'posts_100',
    name: 'Prolific Writer',
    description: 'Create 100 posts',
    icon: 'âœï¸',
    category: 'content',
    tier: 'silver',
    requirement: { type: 'posts_count', target: 100 },
    reward: { points: 200 },
    order: 12,
  },
  {
    id: 'posts_1000',
    name: 'Content Machine',
    description: 'Create 1,000 posts',
    icon: 'ðŸ­',
    category: 'content',
    tier: 'gold',
    requirement: { type: 'posts_count', target: 1000 },
    reward: { points: 500, badge: 'content_machine' },
    order: 13,
  },

  // Engagement Achievements
  {
    id: 'first_like',
    name: 'Appreciator',
    description: 'Like your first post',
    icon: 'â¤ï¸',
    category: 'engagement',
    tier: 'bronze',
    requirement: { type: 'first_like', target: 1 },
    reward: { points: 5 },
    order: 20,
  },
  {
    id: 'likes_given_100',
    name: 'Love Spreader',
    description: 'Like 100 posts',
    icon: 'ðŸ’•',
    category: 'engagement',
    tier: 'bronze',
    requirement: { type: 'likes_given', target: 100 },
    reward: { points: 50 },
    order: 21,
  },
  {
    id: 'likes_received_100',
    name: 'Crowd Favorite',
    description: 'Receive 100 likes',
    icon: 'ðŸ”¥',
    category: 'engagement',
    tier: 'silver',
    requirement: { type: 'likes_received', target: 100 },
    reward: { points: 100 },
    order: 22,
  },
  {
    id: 'likes_received_1000',
    name: 'Viral Sensation',
    description: 'Receive 1,000 likes',
    icon: 'ðŸ’¥',
    category: 'engagement',
    tier: 'gold',
    requirement: { type: 'likes_received', target: 1000 },
    reward: { points: 300, badge: 'viral' },
    order: 23,
  },
  {
    id: 'comments_50',
    name: 'Conversationalist',
    description: 'Leave 50 comments',
    icon: 'ðŸ’¬',
    category: 'engagement',
    tier: 'silver',
    requirement: { type: 'comments_count', target: 50 },
    reward: { points: 100 },
    order: 24,
  },

  // Milestone Achievements
  {
    id: 'profile_complete',
    name: 'Identity Established',
    description: 'Complete your profile',
    icon: 'ðŸŽ­',
    category: 'milestones',
    tier: 'bronze',
    requirement: { type: 'profile_complete', target: 100 },
    reward: { points: 30 },
    order: 30,
  },
  {
    id: 'verified',
    name: 'Verified',
    description: 'Get verified on TextMesh',
    icon: 'âœ…',
    category: 'milestones',
    tier: 'platinum',
    requirement: { type: 'verified', target: 1 },
    reward: { points: 500 },
    order: 31,
  },
  {
    id: 'streak_7',
    name: 'Week Warrior',
    description: 'Maintain a 7-day streak',
    icon: 'ðŸ”¥',
    category: 'milestones',
    tier: 'bronze',
    requirement: { type: 'streak_days', target: 7 },
    reward: { points: 50 },
    order: 32,
  },
  {
    id: 'streak_30',
    name: 'Monthly Master',
    description: 'Maintain a 30-day streak',
    icon: 'ðŸŒŸ',
    category: 'milestones',
    tier: 'silver',
    requirement: { type: 'streak_days', target: 30 },
    reward: { points: 200 },
    order: 33,
  },
  {
    id: 'streak_100',
    name: 'Centurion',
    description: 'Maintain a 100-day streak',
    icon: 'ðŸ’Ž',
    category: 'milestones',
    tier: 'gold',
    requirement: { type: 'streak_days', target: 100 },
    reward: { points: 500, badge: 'centurion' },
    order: 34,
  },
  {
    id: 'streak_365',
    name: 'Legendary Dedication',
    description: 'Maintain a 365-day streak',
    icon: 'ðŸ‘‘',
    category: 'milestones',
    tier: 'diamond',
    requirement: { type: 'streak_days', target: 365 },
    reward: { points: 2000, badge: 'legendary' },
    order: 35,
  },

  // Referral Achievements
  {
    id: 'referral_1',
    name: 'Ambassador',
    description: 'Refer your first friend',
    icon: 'ðŸŽ',
    category: 'special',
    tier: 'bronze',
    requirement: { type: 'referrals_count', target: 1 },
    reward: { points: 50 },
    order: 40,
  },
  {
    id: 'referral_10',
    name: 'Team Builder',
    description: 'Refer 10 friends',
    icon: 'ðŸ†',
    category: 'special',
    tier: 'gold',
    requirement: { type: 'referrals_count', target: 10 },
    reward: { points: 300, badge: 'team_builder' },
    order: 41,
  },

  // Secret Achievements
  {
    id: 'night_owl',
    name: 'Night Owl',
    description: 'Post between 2 AM and 4 AM',
    icon: 'ðŸ¦‰',
    category: 'special',
    tier: 'bronze',
    requirement: { type: 'custom', target: 1, condition: 'post_late_night' },
    reward: { points: 25 },
    secret: true,
    order: 50,
  },
  {
    id: 'early_bird',
    name: 'Early Bird',
    description: 'Post before 6 AM',
    icon: 'ðŸ¦',
    category: 'special',
    tier: 'bronze',
    requirement: { type: 'custom', target: 1, condition: 'post_early_morning' },
    reward: { points: 25 },
    secret: true,
    order: 51,
  },
];

// ============ ACHIEVEMENT SYSTEM CLASS ============

export class AchievementSystem {
  private redis: Redis;
  private prisma: PrismaClient;

  constructor(redis: Redis, prisma: PrismaClient) {
    this.redis = redis;
    this.prisma = prisma;
  }

  /**
   * Get all available achievements
   */
  getAllAchievements(): Achievement[] {
    return ACHIEVEMENTS.filter((a) => !a.secret).sort((a, b) => a.order - b.order);
  }

  /**
   * Get achievements by category
   */
  getAchievementsByCategory(category: AchievementCategory): Achievement[] {
    return ACHIEVEMENTS.filter((a) => a.category === category && !a.secret);
  }

  /**
   * Get user's unlocked achievements
   */
  async getUserAchievements(userId: string): Promise<{
    unlocked: UserAchievement[];
    progress: AchievementProgress[];
    totalPoints: number;
    level: number;
  }> {
    const unlocked: UserAchievement[] = [];
    const progress: AchievementProgress[] = [];

    // Get unlocked achievements
    const unlockedIds = await this.redis.smembers(`user:achievements:${userId}`);
    const unlockedData = await this.redis.hgetall(`user:achievements:data:${userId}`);

    for (const id of unlockedIds) {
      const achievement = ACHIEVEMENTS.find((a) => a.id === id);
      if (achievement) {
        unlocked.push({
          achievement,
          unlockedAt: new Date(unlockedData[id] || Date.now()),
        });
      }
    }

    // Get progress for locked achievements
    const userStats = await this.getUserStats(userId);

    for (const achievement of ACHIEVEMENTS) {
      if (unlockedIds.includes(achievement.id)) continue;
      if (achievement.secret) continue;

      const current = this.getStatValue(userStats, achievement.requirement.type);
      const target = achievement.requirement.target;

      if (current > 0) {
        progress.push({
          achievement,
          current,
          target,
          percentage: Math.min(100, Math.round((current / target) * 100)),
        });
      }
    }

    // Get total points
    const points = await this.redis.get(`user:achievement_points:${userId}`);
    const totalPoints = parseInt(points || '0', 10);
    const level = this.calculateLevel(totalPoints);

    return {
      unlocked: unlocked.sort((a, b) => b.unlockedAt.getTime() - a.unlockedAt.getTime()),
      progress: progress.sort((a, b) => b.percentage - a.percentage),
      totalPoints,
      level,
    };
  }

  /**
   * Check and unlock achievements for user
   */
  async checkAchievements(
    userId: string,
    eventType?: RequirementType
  ): Promise<UserAchievement[]> {
    const newAchievements: UserAchievement[] = [];
    const unlockedIds = await this.redis.smembers(`user:achievements:${userId}`);
    const userStats = await this.getUserStats(userId);

    // Check relevant achievements
    const toCheck = eventType
      ? ACHIEVEMENTS.filter((a) => a.requirement.type === eventType)
      : ACHIEVEMENTS;

    for (const achievement of toCheck) {
      if (unlockedIds.includes(achievement.id)) continue;

      const current = this.getStatValue(userStats, achievement.requirement.type);

      if (current >= achievement.requirement.target) {
        // Achievement unlocked!
        await this.unlockAchievement(userId, achievement);
        newAchievements.push({
          achievement,
          unlockedAt: new Date(),
        });
      }
    }

    return newAchievements;
  }

  /**
   * Unlock a specific achievement
   */
  async unlockAchievement(userId: string, achievement: Achievement): Promise<void> {
    // Mark as unlocked
    await this.redis.sadd(`user:achievements:${userId}`, achievement.id);
    await this.redis.hset(
      `user:achievements:data:${userId}`,
      achievement.id,
      new Date().toISOString()
    );

    // Grant rewards
    await this.redis.incrby(`user:achievement_points:${userId}`, achievement.reward.points);

    if (achievement.reward.badge) {
      await this.redis.sadd(`user:badges:${userId}`, achievement.reward.badge);
    }

    // Send notification
    await this.notifyAchievement(userId, achievement);
  }

  /**
   * Check custom achievement conditions
   */
  async checkCustomAchievement(
    userId: string,
    condition: string,
    data?: Record<string, unknown>
  ): Promise<UserAchievement | null> {
    const achievement = ACHIEVEMENTS.find(
      (a) => a.requirement.type === 'custom' && a.requirement.condition === condition
    );

    if (!achievement) return null;

    const unlockedIds = await this.redis.smembers(`user:achievements:${userId}`);
    if (unlockedIds.includes(achievement.id)) return null;

    // Achievement unlocked!
    await this.unlockAchievement(userId, achievement);

    return {
      achievement,
      unlockedAt: new Date(),
    };
  }

  /**
   * Get achievement leaderboard
   */
  async getLeaderboard(limit: number = 100): Promise<Array<{
    userId: string;
    username: string;
    avatar?: string;
    points: number;
    level: number;
    achievementCount: number;
  }>> {
    const leaderboard = await this.redis.zrevrange(
      'achievement:leaderboard',
      0,
      limit - 1,
      'WITHSCORES'
    );

    const results: Array<{
      userId: string;
      username: string;
      avatar?: string;
      points: number;
      level: number;
      achievementCount: number;
    }> = [];

    for (let i = 0; i < leaderboard.length; i += 2) {
      const odUserId = leaderboard[i];
      const points = parseInt(leaderboard[i + 1] || '0', 10);

      if (!odUserId) continue;

      const user = await this.prisma.user.findUnique({
        where: { id: odUserId },
        select: { username: true, avatarUrl: true },
      });

      const achievementCount = await this.redis.scard(`user:achievements:${odUserId}`);

      if (user) {
        results.push({
          userId: odUserId,
          username: user.username,
          avatar: user.avatarUrl || undefined,
          points,
          level: this.calculateLevel(points),
          achievementCount,
        });
      }
    }

    return results;
  }

  // ============ HELPER METHODS ============

  private async getUserStats(userId: string): Promise<Record<string, number>> {
    const pipeline = this.redis.pipeline();

    pipeline.get(`user:posts:count:${userId}`);
    pipeline.get(`user:followers:count:${userId}`);
    pipeline.get(`user:following:count:${userId}`);
    pipeline.get(`user:likes:received:${userId}`);
    pipeline.get(`user:likes:given:${userId}`);
    pipeline.get(`user:comments:count:${userId}`);
    pipeline.get(`user:reposts:count:${userId}`);
    pipeline.get(`user:streak:${userId}`);
    pipeline.hget(`referral:stats:${userId}`, 'successful');
    pipeline.get(`user:profile_completion:${userId}`);

    const results = await pipeline.exec();

    return {
      posts_count: parseInt((results?.[0]?.[1] as string) || '0', 10),
      followers_count: parseInt((results?.[1]?.[1] as string) || '0', 10),
      following_count: parseInt((results?.[2]?.[1] as string) || '0', 10),
      likes_received: parseInt((results?.[3]?.[1] as string) || '0', 10),
      likes_given: parseInt((results?.[4]?.[1] as string) || '0', 10),
      comments_count: parseInt((results?.[5]?.[1] as string) || '0', 10),
      reposts_count: parseInt((results?.[6]?.[1] as string) || '0', 10),
      streak_days: parseInt((results?.[7]?.[1] as string) || '0', 10),
      referrals_count: parseInt((results?.[8]?.[1] as string) || '0', 10),
      profile_complete: parseInt((results?.[9]?.[1] as string) || '0', 10),
    };
  }

  private getStatValue(stats: Record<string, number>, type: RequirementType): number {
    return stats[type] || 0;
  }

  private calculateLevel(points: number): number {
    // Level formula: level = floor(sqrt(points / 100)) + 1
    return Math.floor(Math.sqrt(points / 100)) + 1;
  }

  private async notifyAchievement(userId: string, achievement: Achievement): Promise<void> {
    const notification = {
      type: 'achievement_unlocked',
      achievement: {
        id: achievement.id,
        name: achievement.name,
        icon: achievement.icon,
        tier: achievement.tier,
        points: achievement.reward.points,
      },
      timestamp: new Date().toISOString(),
    };

    await this.redis.lpush(`notifications:${userId}`, JSON.stringify(notification));
    await this.redis.ltrim(`notifications:${userId}`, 0, 99);

    // Update leaderboard
    await this.redis.zincrby('achievement:leaderboard', achievement.reward.points, userId);
  }
}

export default AchievementSystem;


