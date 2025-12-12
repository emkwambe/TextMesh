import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import {
  Achievement,
  AchievementCategory,
  AchievementRarity,
  AchievementCriteria,
  UserAchievement,
  EngagementStats,
} from './types';

const DEFAULT_ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first_post',
    name: 'First Words',
    description: 'Create your first post',
    category: 'content',
    icon: '✍️',
    rarity: 'common',
    xpReward: 50,
    criteria: { type: 'count', metric: 'postsCreated', threshold: 1 },
    isSecret: false,
    createdAt: new Date(),
  },
  {
    id: 'prolific_poster',
    name: 'Prolific Poster',
    description: 'Create 100 posts',
    category: 'content',
    icon: '📝',
    rarity: 'rare',
    xpReward: 500,
    criteria: { type: 'count', metric: 'postsCreated', threshold: 100 },
    isSecret: false,
    createdAt: new Date(),
  },
  {
    id: 'content_machine',
    name: 'Content Machine',
    description: 'Create 1000 posts',
    category: 'content',
    icon: '🏭',
    rarity: 'legendary',
    xpReward: 2000,
    criteria: { type: 'count', metric: 'postsCreated', threshold: 1000 },
    isSecret: false,
    createdAt: new Date(),
  },
  {
    id: 'first_follower',
    name: 'Making Friends',
    description: 'Gain your first follower',
    category: 'social',
    icon: '👋',
    rarity: 'common',
    xpReward: 25,
    criteria: { type: 'count', metric: 'followersGained', threshold: 1 },
    isSecret: false,
    createdAt: new Date(),
  },
  {
    id: 'popular',
    name: 'Popular',
    description: 'Reach 100 followers',
    category: 'social',
    icon: '🌟',
    rarity: 'uncommon',
    xpReward: 200,
    criteria: { type: 'count', metric: 'followersGained', threshold: 100 },
    isSecret: false,
    createdAt: new Date(),
  },
  {
    id: 'influencer',
    name: 'Influencer',
    description: 'Reach 10,000 followers',
    category: 'social',
    icon: '👑',
    rarity: 'epic',
    xpReward: 1000,
    criteria: { type: 'count', metric: 'followersGained', threshold: 10000 },
    isSecret: false,
    createdAt: new Date(),
  },
  {
    id: 'celebrity',
    name: 'Celebrity Status',
    description: 'Reach 100,000 followers',
    category: 'social',
    icon: '🎭',
    rarity: 'legendary',
    xpReward: 5000,
    criteria: { type: 'count', metric: 'followersGained', threshold: 100000 },
    isSecret: false,
    createdAt: new Date(),
  },
  {
    id: 'week_streak',
    name: 'Week Warrior',
    description: 'Maintain a 7-day activity streak',
    category: 'engagement',
    icon: '🔥',
    rarity: 'uncommon',
    xpReward: 100,
    criteria: { type: 'streak', metric: 'dailyStreak', threshold: 7 },
    isSecret: false,
    createdAt: new Date(),
  },
  {
    id: 'month_streak',
    name: 'Monthly Master',
    description: 'Maintain a 30-day activity streak',
    category: 'engagement',
    icon: '💪',
    rarity: 'rare',
    xpReward: 500,
    criteria: { type: 'streak', metric: 'dailyStreak', threshold: 30 },
    isSecret: false,
    createdAt: new Date(),
  },
  {
    id: 'year_streak',
    name: 'Year of Dedication',
    description: 'Maintain a 365-day activity streak',
    category: 'engagement',
    icon: '🏆',
    rarity: 'legendary',
    xpReward: 5000,
    criteria: { type: 'streak', metric: 'dailyStreak', threshold: 365 },
    isSecret: false,
    createdAt: new Date(),
  },
  {
    id: 'conversation_starter',
    name: 'Conversation Starter',
    description: 'Write 50 comments',
    category: 'engagement',
    icon: '💬',
    rarity: 'uncommon',
    xpReward: 150,
    criteria: { type: 'count', metric: 'commentsWritten', threshold: 50 },
    isSecret: false,
    createdAt: new Date(),
  },
  {
    id: 'viral_post',
    name: 'Gone Viral',
    description: 'Get 1000 likes on a single post',
    category: 'milestone',
    icon: '🚀',
    rarity: 'epic',
    xpReward: 1000,
    criteria: { type: 'milestone', metric: 'maxPostLikes', threshold: 1000 },
    isSecret: false,
    createdAt: new Date(),
  },
  {
    id: 'night_owl',
    name: 'Night Owl',
    description: 'Post between 2-4 AM 10 times',
    category: 'special',
    icon: '🦉',
    rarity: 'rare',
    xpReward: 200,
    criteria: { type: 'count', metric: 'nightPosts', threshold: 10 },
    isSecret: true,
    createdAt: new Date(),
  },
  {
    id: 'early_adopter',
    name: 'Early Adopter',
    description: 'Join in the first month of launch',
    category: 'special',
    icon: '🌱',
    rarity: 'rare',
    xpReward: 500,
    criteria: { type: 'milestone', metric: 'earlyAdopter', threshold: 1 },
    isSecret: false,
    createdAt: new Date(),
  },
];

export class AchievementSystem {
  private redis: Redis;
  private achievements: Map<string, Achievement> = new Map();
  private readonly achievementPrefix = 'engagement:achievement:';
  private readonly userAchievementPrefix = 'engagement:user_achievement:';
  private readonly progressPrefix = 'engagement:progress:';

  constructor(redis: Redis) {
    this.redis = redis;
    this.loadDefaultAchievements();
  }

  private loadDefaultAchievements(): void {
    DEFAULT_ACHIEVEMENTS.forEach((achievement) => {
      this.achievements.set(achievement.id, achievement);
    });
  }

  registerAchievement(achievement: Achievement): void {
    this.achievements.set(achievement.id, achievement);
  }

  getAchievement(achievementId: string): Achievement | undefined {
    return this.achievements.get(achievementId);
  }

  getAllAchievements(includeSecret: boolean = false): Achievement[] {
    const achievements = Array.from(this.achievements.values());
    if (includeSecret) return achievements;
    return achievements.filter((a) => !a.isSecret);
  }

  getAchievementsByCategory(category: AchievementCategory): Achievement[] {
    return Array.from(this.achievements.values()).filter(
      (a) => a.category === category && !a.isSecret
    );
  }

  async checkAndUnlock(
    userId: string,
    stats: EngagementStats,
    additionalMetrics: Record<string, number> = {}
  ): Promise<Achievement[]> {
    const unlockedAchievements: Achievement[] = [];
    const userAchievements = await this.getUserAchievements(userId);
    const unlockedIds = new Set(userAchievements.map((ua) => ua.achievementId));

    const metrics: Record<string, number> = {
      postsCreated: stats.postsCreated,
      commentsWritten: stats.commentsWritten,
      likesGiven: stats.likesGiven,
      likesReceived: stats.likesReceived,
      followersGained: stats.followersGained,
      followingCount: stats.followingCount,
      sharesCreated: stats.sharesCreated,
      mentionsReceived: stats.mentionsReceived,
      profileViews: stats.profileViews,
      contentViews: stats.contentViews,
      ...additionalMetrics,
    };

    for (const achievement of this.achievements.values()) {
      if (unlockedIds.has(achievement.id)) continue;

      const { unlocked, progress } = this.evaluateCriteria(
        achievement.criteria,
        metrics
      );

      await this.updateProgress(userId, achievement.id, progress);

      if (unlocked) {
        await this.unlockAchievement(userId, achievement.id);
        unlockedAchievements.push(achievement);
      }
    }

    return unlockedAchievements;
  }

  async unlockAchievement(
    userId: string,
    achievementId: string
  ): Promise<UserAchievement | null> {
    const achievement = this.achievements.get(achievementId);
    if (!achievement) return null;

    const existing = await this.redis.hget(
      `${this.userAchievementPrefix}${userId}`,
      achievementId
    );
    if (existing) return JSON.parse(existing);

    const userAchievement: UserAchievement = {
      achievementId,
      unlockedAt: new Date(),
      notified: false,
    };

    await this.redis.hset(
      `${this.userAchievementPrefix}${userId}`,
      achievementId,
      JSON.stringify(userAchievement)
    );

    await this.redis.lpush(
      `engagement:achievement_log`,
      JSON.stringify({
        id: uuidv4(),
        userId,
        achievementId,
        timestamp: new Date(),
      })
    );

    const date = new Date().toISOString().split('T')[0];
    await this.redis.hincrby(
      `engagement:stats:daily:${date}`,
      'achievements_unlocked',
      1
    );

    return userAchievement;
  }

  async getUserAchievements(userId: string): Promise<UserAchievement[]> {
    const data = await this.redis.hgetall(`${this.userAchievementPrefix}${userId}`);

    return Object.values(data).map((d) => {
      const ua = JSON.parse(d);
      ua.unlockedAt = new Date(ua.unlockedAt);
      return ua;
    });
  }

  async getUserAchievementsWithDetails(
    userId: string
  ): Promise<Array<Achievement & { unlocked: boolean; unlockedAt?: Date; progress: number }>> {
    const userAchievements = await this.getUserAchievements(userId);
    const unlockedMap = new Map(
      userAchievements.map((ua) => [ua.achievementId, ua])
    );

    const progress = await this.getAllProgress(userId);

    return Array.from(this.achievements.values())
      .filter((a) => !a.isSecret || unlockedMap.has(a.id))
      .map((achievement) => {
        const ua = unlockedMap.get(achievement.id);
        return {
          ...achievement,
          unlocked: !!ua,
          unlockedAt: ua?.unlockedAt,
          progress: ua ? 1 : (progress[achievement.id] || 0),
        };
      });
  }

  async getProgress(userId: string, achievementId: string): Promise<number> {
    const progress = await this.redis.hget(
      `${this.progressPrefix}${userId}`,
      achievementId
    );
    return parseFloat(progress || '0');
  }

  async getAllProgress(userId: string): Promise<Record<string, number>> {
    const data = await this.redis.hgetall(`${this.progressPrefix}${userId}`);
    const progress: Record<string, number> = {};

    for (const [key, value] of Object.entries(data)) {
      progress[key] = parseFloat(value);
    }

    return progress;
  }

  async markNotified(userId: string, achievementId: string): Promise<void> {
    const data = await this.redis.hget(
      `${this.userAchievementPrefix}${userId}`,
      achievementId
    );

    if (data) {
      const ua: UserAchievement = JSON.parse(data);
      ua.notified = true;
      await this.redis.hset(
        `${this.userAchievementPrefix}${userId}`,
        achievementId,
        JSON.stringify(ua)
      );
    }
  }

  async getUnnotifiedAchievements(userId: string): Promise<Achievement[]> {
    const userAchievements = await this.getUserAchievements(userId);
    const unnotified = userAchievements.filter((ua) => !ua.notified);

    return unnotified
      .map((ua) => this.achievements.get(ua.achievementId))
      .filter((a): a is Achievement => a !== undefined);
  }

  async getRecentlyUnlocked(limit: number = 50): Promise<
    Array<{
      userId: string;
      achievementId: string;
      achievement: Achievement;
      timestamp: Date;
    }>
  > {
    const logs = await this.redis.lrange('engagement:achievement_log', 0, limit - 1);

    return logs
      .map((log) => {
        const data = JSON.parse(log);
        const achievement = this.achievements.get(data.achievementId);
        if (!achievement) return null;

        return {
          userId: data.userId,
          achievementId: data.achievementId,
          achievement,
          timestamp: new Date(data.timestamp),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }

  private async updateProgress(
    userId: string,
    achievementId: string,
    progress: number
  ): Promise<void> {
    await this.redis.hset(
      `${this.progressPrefix}${userId}`,
      achievementId,
      Math.min(1, Math.max(0, progress)).toString()
    );
  }

  private evaluateCriteria(
    criteria: AchievementCriteria,
    metrics: Record<string, number>
  ): { unlocked: boolean; progress: number } {
    const value = metrics[criteria.metric] || 0;
    const progress = Math.min(1, value / criteria.threshold);

    let unlocked = false;

    switch (criteria.type) {
      case 'count':
      case 'streak':
      case 'milestone':
        unlocked = value >= criteria.threshold;
        break;

      case 'rate':
        unlocked = value >= criteria.threshold;
        break;

      case 'compound':
        if (criteria.conditions) {
          unlocked = criteria.conditions.every((condition) => {
            const condValue = metrics[condition.metric] || 0;
            switch (condition.operator) {
              case 'eq':
                return condValue === condition.value;
              case 'gt':
                return condValue > condition.value;
              case 'gte':
                return condValue >= condition.value;
              case 'lt':
                return condValue < condition.value;
              case 'lte':
                return condValue <= condition.value;
              default:
                return false;
            }
          });
        }
        break;
    }

    return { unlocked, progress };
  }
}
