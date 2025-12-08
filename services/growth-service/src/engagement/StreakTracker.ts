// =================================
// TEXTMESH STREAK TRACKER
// Daily Engagement Streaks
// =================================

import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';

// ============ STREAK TYPES ============

export interface StreakData {
  userId: string;
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string;
  todayActivity: boolean;
  streakProtection: boolean;
  freezesRemaining: number;
  weeklyProgress: boolean[];
  milestones: StreakMilestone[];
  nextMilestone: StreakMilestone | null;
  rewards: StreakReward[];
}

export interface StreakMilestone {
  days: number;
  name: string;
  icon: string;
  achieved: boolean;
  achievedAt?: Date;
}

export interface StreakReward {
  type: 'points' | 'badge' | 'multiplier' | 'freeze';
  value: number | string;
  description: string;
}

export interface ActivityRecord {
  userId: string;
  activityType: string;
  timestamp: Date;
  points: number;
}

// ============ STREAK CONFIGURATION ============

const STREAK_MILESTONES: Omit<StreakMilestone, 'achieved' | 'achievedAt'>[] = [
  { days: 3, name: 'Getting Started', icon: '🌱' },
  { days: 7, name: 'Week Warrior', icon: '🔥' },
  { days: 14, name: 'Two Week Champion', icon: '⭐' },
  { days: 30, name: 'Monthly Master', icon: '🌟' },
  { days: 60, name: 'Double Month Hero', icon: '💫' },
  { days: 90, name: 'Quarter King', icon: '👑' },
  { days: 100, name: 'Centurion', icon: '💯' },
  { days: 180, name: 'Half Year Legend', icon: '🏆' },
  { days: 365, name: 'Year of Dedication', icon: '💎' },
];

const STREAK_REWARDS: Array<{ days: number; rewards: StreakReward[] }> = [
  {
    days: 3,
    rewards: [
      { type: 'points', value: 25, description: '3-day streak bonus' },
    ],
  },
  {
    days: 7,
    rewards: [
      { type: 'points', value: 50, description: 'Weekly streak bonus' },
      { type: 'freeze', value: 1, description: 'Streak freeze earned' },
    ],
  },
  {
    days: 14,
    rewards: [
      { type: 'points', value: 100, description: '2-week streak bonus' },
    ],
  },
  {
    days: 30,
    rewards: [
      { type: 'points', value: 200, description: 'Monthly streak bonus' },
      { type: 'badge', value: 'streak_30', description: '30-day streak badge' },
      { type: 'freeze', value: 2, description: 'Streak freezes earned' },
    ],
  },
  {
    days: 100,
    rewards: [
      { type: 'points', value: 500, description: 'Centurion bonus' },
      { type: 'badge', value: 'centurion', description: 'Centurion badge' },
      { type: 'multiplier', value: 1.1, description: '10% point bonus' },
    ],
  },
  {
    days: 365,
    rewards: [
      { type: 'points', value: 2000, description: 'Yearly dedication bonus' },
      { type: 'badge', value: 'legendary_streak', description: 'Legendary Streak badge' },
      { type: 'multiplier', value: 1.25, description: '25% permanent point bonus' },
    ],
  },
];

const QUALIFYING_ACTIVITIES = [
  'post',
  'like',
  'comment',
  'share',
  'repost',
  'login',
  'profile_view',
  'message',
];

// ============ STREAK TRACKER CLASS ============

export class StreakTracker {
  private redis: Redis;
  private prisma: PrismaClient;

  constructor(redis: Redis, prisma: PrismaClient) {
    this.redis = redis;
    this.prisma = prisma;
  }

  /**
   * Get user streak data
   */
  async getStreak(userId: string): Promise<StreakData> {
    const key = `streak:${userId}`;
    const data = await this.redis.hgetall(key);

    const currentStreak = parseInt(data['current'] || '0', 10);
    const longestStreak = parseInt(data['longest'] || '0', 10);
    const lastActivityDate = data['last_activity'] || '';
    const freezesRemaining = parseInt(data['freezes'] || '0', 10);
    const streakProtection = data['protection'] === 'true';

    // Check if today's activity counts
    const today = this.getDateString(new Date());
    const todayActivity = lastActivityDate === today;

    // Get weekly progress
    const weeklyProgress = await this.getWeeklyProgress(userId);

    // Calculate milestones
    const milestones = await this.getMilestones(userId, currentStreak);
    const nextMilestone = this.getNextMilestone(currentStreak);

    // Get pending rewards
    const rewards = await this.getPendingRewards(userId);

    return {
      userId,
      currentStreak,
      longestStreak,
      lastActivityDate,
      todayActivity,
      streakProtection,
      freezesRemaining,
      weeklyProgress,
      milestones,
      nextMilestone,
      rewards,
    };
  }

  /**
   * Record activity and update streak
   */
  async recordActivity(
    userId: string,
    activityType: string
  ): Promise<{
    streak: StreakData;
    streakIncremented: boolean;
    newMilestone?: StreakMilestone;
    rewards?: StreakReward[];
  }> {
    // Check if activity type qualifies
    if (!QUALIFYING_ACTIVITIES.includes(activityType)) {
      const streak = await this.getStreak(userId);
      return { streak, streakIncremented: false };
    }

    const key = `streak:${userId}`;
    const today = this.getDateString(new Date());
    const yesterday = this.getDateString(new Date(Date.now() - 86400 * 1000));

    // Get current streak data
    const data = await this.redis.hgetall(key);
    const lastActivity = data['last_activity'] || '';
    let currentStreak = parseInt(data['current'] || '0', 10);
    let longestStreak = parseInt(data['longest'] || '0', 10);
    let freezesRemaining = parseInt(data['freezes'] || '0', 10);

    let streakIncremented = false;
    let newMilestone: StreakMilestone | undefined;
    let rewards: StreakReward[] | undefined;

    if (lastActivity === today) {
      // Already recorded today
      streakIncremented = false;
    } else if (lastActivity === yesterday) {
      // Continuing streak
      currentStreak += 1;
      streakIncremented = true;

      if (currentStreak > longestStreak) {
        longestStreak = currentStreak;
      }
    } else if (lastActivity) {
      // Streak broken (unless freeze is used)
      const daysSinceActivity = this.daysBetween(lastActivity, today);

      if (daysSinceActivity === 2 && freezesRemaining > 0) {
        // Use a freeze
        freezesRemaining -= 1;
        currentStreak += 1;
        streakIncremented = true;

        await this.redis.lpush(
          `streak:freezes_used:${userId}`,
          JSON.stringify({ date: yesterday, usedAt: new Date().toISOString() })
        );
      } else {
        // Streak broken
        currentStreak = 1;
        streakIncremented = true;
      }
    } else {
      // First activity
      currentStreak = 1;
      streakIncremented = true;
    }

    // Update streak data
    await this.redis.hset(key, {
      current: currentStreak.toString(),
      longest: longestStreak.toString(),
      last_activity: today,
      freezes: freezesRemaining.toString(),
    });

    // Record in daily set
    await this.redis.sadd(`streak:daily:${today}`, userId);

    // Check for milestones and rewards
    if (streakIncremented) {
      newMilestone = await this.checkMilestone(userId, currentStreak);
      rewards = await this.checkRewards(userId, currentStreak);
    }

    const streak = await this.getStreak(userId);

    return {
      streak,
      streakIncremented,
      newMilestone,
      rewards,
    };
  }

  /**
   * Use a streak freeze
   */
  async useFreeze(userId: string): Promise<boolean> {
    const key = `streak:${userId}`;
    const freezes = await this.redis.hget(key, 'freezes');
    const remaining = parseInt(freezes || '0', 10);

    if (remaining <= 0) {
      return false;
    }

    await this.redis.hincrby(key, 'freezes', -1);
    await this.redis.hset(key, 'protection', 'true');

    return true;
  }

  /**
   * Purchase streak freeze
   */
  async purchaseFreeze(userId: string, cost: number = 100): Promise<boolean> {
    const points = await this.redis.get(`user:points:${userId}`);
    const currentPoints = parseInt(points || '0', 10);

    if (currentPoints < cost) {
      return false;
    }

    await this.redis.decrby(`user:points:${userId}`, cost);
    await this.redis.hincrby(`streak:${userId}`, 'freezes', 1);

    return true;
  }

  /**
   * Get streak statistics
   */
  async getStreakStats(): Promise<{
    activeStreaks: number;
    longestActive: number;
    averageStreak: number;
    streakDistribution: Record<string, number>;
  }> {
    // This would scan all streaks in production
    // For now, return placeholder data
    return {
      activeStreaks: 0,
      longestActive: 0,
      averageStreak: 0,
      streakDistribution: {
        '1-7': 0,
        '8-30': 0,
        '31-100': 0,
        '100+': 0,
      },
    };
  }

  /**
   * Process end-of-day streak updates
   */
  async processEndOfDay(): Promise<{ broken: number; continued: number }> {
    const yesterday = this.getDateString(new Date(Date.now() - 86400 * 1000));
    const dayBefore = this.getDateString(new Date(Date.now() - 2 * 86400 * 1000));

    // Get users who were active day before but not yesterday
    const activeDayBefore = await this.redis.smembers(`streak:daily:${dayBefore}`);
    const activeYesterday = await this.redis.smembers(`streak:daily:${yesterday}`);

    const activeSet = new Set(activeYesterday);
    let broken = 0;
    let continued = activeYesterday.length;

    for (const odUserId of activeDayBefore) {
      if (!activeSet.has(odUserId)) {
        // Check if they have a freeze
        const key = `streak:${odUserId}`;
        const freezes = await this.redis.hget(key, 'freezes');
        const protection = await this.redis.hget(key, 'protection');

        if (parseInt(freezes || '0', 10) > 0 || protection === 'true') {
          // Use freeze automatically
          await this.redis.hincrby(key, 'freezes', -1);
          await this.redis.hset(key, 'protection', 'false');
        } else {
          // Streak broken
          await this.redis.hset(key, 'current', '0');
          broken++;
        }
      }
    }

    return { broken, continued };
  }

  // ============ HELPER METHODS ============

  private getDateString(date: Date): string {
    return date.toISOString().split('T')[0]!;
  }

  private daysBetween(date1: string, date2: string): number {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    const diff = Math.abs(d2.getTime() - d1.getTime());
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  private async getWeeklyProgress(userId: string): Promise<boolean[]> {
    const progress: boolean[] = [];
    const today = new Date();

    for (let i = 6; i >= 0; i--) {
      const date = new Date(today.getTime() - i * 86400 * 1000);
      const dateStr = this.getDateString(date);
      const active = await this.redis.sismember(`streak:daily:${dateStr}`, userId);
      progress.push(active === 1);
    }

    return progress;
  }

  private async getMilestones(
    userId: string,
    currentStreak: number
  ): Promise<StreakMilestone[]> {
    const achievedMilestones = await this.redis.smembers(`streak:milestones:${userId}`);
    const achievedData = await this.redis.hgetall(`streak:milestones:data:${userId}`);

    return STREAK_MILESTONES.map((m) => ({
      ...m,
      achieved: achievedMilestones.includes(m.days.toString()) || currentStreak >= m.days,
      achievedAt: achievedData[m.days.toString()]
        ? new Date(achievedData[m.days.toString()]!)
        : undefined,
    }));
  }

  private getNextMilestone(currentStreak: number): StreakMilestone | null {
    const next = STREAK_MILESTONES.find((m) => m.days > currentStreak);
    if (!next) return null;

    return {
      ...next,
      achieved: false,
    };
  }

  private async checkMilestone(
    userId: string,
    currentStreak: number
  ): Promise<StreakMilestone | undefined> {
    const milestone = STREAK_MILESTONES.find((m) => m.days === currentStreak);

    if (milestone) {
      await this.redis.sadd(`streak:milestones:${userId}`, currentStreak.toString());
      await this.redis.hset(
        `streak:milestones:data:${userId}`,
        currentStreak.toString(),
        new Date().toISOString()
      );

      return {
        ...milestone,
        achieved: true,
        achievedAt: new Date(),
      };
    }

    return undefined;
  }

  private async checkRewards(
    userId: string,
    currentStreak: number
  ): Promise<StreakReward[] | undefined> {
    const rewardConfig = STREAK_REWARDS.find((r) => r.days === currentStreak);

    if (rewardConfig) {
      // Grant rewards
      for (const reward of rewardConfig.rewards) {
        if (reward.type === 'points') {
          await this.redis.incrby(`user:points:${userId}`, reward.value as number);
        } else if (reward.type === 'badge') {
          await this.redis.sadd(`user:badges:${userId}`, reward.value as string);
        } else if (reward.type === 'freeze') {
          await this.redis.hincrby(`streak:${userId}`, 'freezes', reward.value as number);
        }
      }

      return rewardConfig.rewards;
    }

    return undefined;
  }

  private async getPendingRewards(_userId: string): Promise<StreakReward[]> {
    // Check for any pending rewards to claim
    return [];
  }
}

export default StreakTracker;
