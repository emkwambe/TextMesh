import { Redis } from 'ioredis';
import { XPSystem } from './xp-system';
import { AchievementSystem } from './achievements';
import { BadgeSystem } from './badges';
import { StreakTracker } from './streaks';
import { LeaderboardManager } from './leaderboards';
import { ChallengeManager } from './challenges';
import {
  UserEngagement,
  XPAction,
  Achievement,
  Badge,
  UserBadge,
  EngagementStats,
  EngagementNotification,
} from './types';

export class EngagementService {
  private redis: Redis;
  private xpSystem: XPSystem;
  private achievementSystem: AchievementSystem;
  private badgeSystem: BadgeSystem;
  private streakTracker: StreakTracker;
  private leaderboardManager: LeaderboardManager;
  private challengeManager: ChallengeManager;
  private readonly userPrefix = 'engagement:user:';
  private readonly notificationPrefix = 'engagement:notification:';

  constructor(redis: Redis) {
    this.redis = redis;
    this.xpSystem = new XPSystem(redis);
    this.achievementSystem = new AchievementSystem(redis);
    this.badgeSystem = new BadgeSystem(redis);
    this.streakTracker = new StreakTracker(redis);
    this.leaderboardManager = new LeaderboardManager(redis);
    this.challengeManager = new ChallengeManager(redis);
  }

  async recordAction(
    userId: string,
    action: XPAction,
    options: {
      source?: string;
      metadata?: Record<string, unknown>;
      timezone?: string;
    } = {}
  ): Promise<{
    xp: { awarded: number; total: number; level: number; leveledUp: boolean };
    streak: { count: number; extended: boolean; milestone?: number };
    achievements: Achievement[];
    challenges: Array<{ name: string; completed: boolean }>;
    notifications: EngagementNotification[];
  }> {
    const notifications: EngagementNotification[] = [];

    const streakResult = await this.streakTracker.recordActivity(
      userId,
      options.timezone || 'UTC'
    );

    const xpResult = await this.xpSystem.awardXP(userId, action, {
      source: options.source,
      metadata: options.metadata,
      streakDays: streakResult.streaks.current.count,
    });

    if (xpResult.leveledUp) {
      notifications.push({
        type: 'level_up',
        title: 'Level Up!',
        message: `Congratulations! You've reached level ${xpResult.newLevel}!`,
        data: { level: xpResult.newLevel },
        createdAt: new Date(),
      });
    }

    if (streakResult.milestoneReached) {
      notifications.push({
        type: 'streak',
        title: 'Streak Milestone!',
        message: `Amazing! You've maintained a ${streakResult.milestoneReached}-day streak!`,
        data: { days: streakResult.milestoneReached },
        createdAt: new Date(),
      });
    }

    const stats = await this.updateStats(userId, action);

    const unlockedAchievements = await this.achievementSystem.checkAndUnlock(
      userId,
      stats,
      {
        dailyStreak: streakResult.streaks.current.count,
        level: xpResult.level,
      }
    );

    for (const achievement of unlockedAchievements) {
      notifications.push({
        type: 'achievement',
        title: 'Achievement Unlocked!',
        message: `You've earned "${achievement.name}"!`,
        data: { achievement },
        createdAt: new Date(),
      });

      if (achievement.xpReward > 0) {
        await this.xpSystem.awardXP(userId, 'achievement_unlocked', {
          source: `achievement:${achievement.id}`,
          multiplier: achievement.xpReward / this.xpSystem.getConfig().baseXP.achievement_unlocked,
        });
      }
    }

    const challengeResults = await this.challengeManager.updateProgress(
      userId,
      action
    );

    const challengeUpdates = challengeResults.map((result) => ({
      name: result.challenge.name,
      completed: result.completed,
    }));

    for (const result of challengeResults) {
      if (result.completed) {
        notifications.push({
          type: 'challenge',
          title: 'Challenge Completed!',
          message: `You've completed "${result.challenge.name}"!`,
          data: { challenge: result.challenge },
          createdAt: new Date(),
        });
      }
    }

    await this.updateLeaderboards(userId, xpResult.totalXp, xpResult.level);

    for (const notification of notifications) {
      await this.saveNotification(userId, notification);
    }

    return {
      xp: {
        awarded: xpResult.xpAwarded,
        total: xpResult.totalXp,
        level: xpResult.level,
        leveledUp: xpResult.leveledUp,
      },
      streak: {
        count: streakResult.streaks.current.count,
        extended: streakResult.streakExtended,
        milestone: streakResult.milestoneReached,
      },
      achievements: unlockedAchievements,
      challenges: challengeUpdates,
      notifications,
    };
  }

  async getUserEngagement(userId: string): Promise<UserEngagement> {
    const [xpData, streaks, achievements, badges, stats] = await Promise.all([
      this.xpSystem.getUserXP(userId),
      this.streakTracker.getStreaks(userId),
      this.achievementSystem.getUserAchievements(userId),
      this.badgeSystem.getUserBadges(userId),
      this.getStats(userId),
    ]);

    return {
      userId,
      level: xpData.level,
      xp: xpData.currentLevelXp,
      xpToNextLevel: xpData.xpToNextLevel,
      totalXp: xpData.totalXp,
      rank: xpData.rank,
      badges: badges.map((b) => b.badgeId),
      achievements: achievements.map((a) => a.achievementId),
      streaks,
      stats,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async getStats(userId: string): Promise<EngagementStats> {
    const data = await this.redis.hgetall(`${this.userPrefix}${userId}:stats`);

    return {
      postsCreated: parseInt(data.postsCreated || '0'),
      commentsWritten: parseInt(data.commentsWritten || '0'),
      likesGiven: parseInt(data.likesGiven || '0'),
      likesReceived: parseInt(data.likesReceived || '0'),
      followersGained: parseInt(data.followersGained || '0'),
      followingCount: parseInt(data.followingCount || '0'),
      sharesCreated: parseInt(data.sharesCreated || '0'),
      mentionsReceived: parseInt(data.mentionsReceived || '0'),
      profileViews: parseInt(data.profileViews || '0'),
      contentViews: parseInt(data.contentViews || '0'),
      engagementRate: parseFloat(data.engagementRate || '0'),
      lastActiveAt: data.lastActiveAt ? new Date(data.lastActiveAt) : new Date(),
    };
  }

  private async updateStats(userId: string, action: XPAction): Promise<EngagementStats> {
    const statMapping: Partial<Record<XPAction, string>> = {
      post_created: 'postsCreated',
      comment_created: 'commentsWritten',
      post_liked: 'likesGiven',
      post_shared: 'sharesCreated',
      follower_gained: 'followersGained',
      following_added: 'followingCount',
    };

    const statKey = statMapping[action];
    if (statKey) {
      await this.redis.hincrby(`${this.userPrefix}${userId}:stats`, statKey, 1);
    }

    await this.redis.hset(
      `${this.userPrefix}${userId}:stats`,
      'lastActiveAt',
      new Date().toISOString()
    );

    return this.getStats(userId);
  }

  private async updateLeaderboards(
    userId: string,
    totalXp: number,
    level: number
  ): Promise<void> {
    await this.leaderboardManager.updateScore('global:xp', userId, totalXp, {
      level,
    });

    const dailyLeaderboard = this.leaderboardManager.createTimeframeLeaderboard(
      'xp',
      'daily'
    );
    await this.leaderboardManager.updateScore(dailyLeaderboard, userId, totalXp);

    const weeklyLeaderboard = this.leaderboardManager.createTimeframeLeaderboard(
      'xp',
      'weekly'
    );
    await this.leaderboardManager.updateScore(weeklyLeaderboard, userId, totalXp);
  }

  private async saveNotification(
    userId: string,
    notification: EngagementNotification
  ): Promise<void> {
    await this.redis.lpush(
      `${this.notificationPrefix}${userId}`,
      JSON.stringify(notification)
    );
    await this.redis.ltrim(`${this.notificationPrefix}${userId}`, 0, 99);
  }

  async getNotifications(
    userId: string,
    limit: number = 50
  ): Promise<EngagementNotification[]> {
    const notifications = await this.redis.lrange(
      `${this.notificationPrefix}${userId}`,
      0,
      limit - 1
    );

    return notifications.map((n) => {
      const notification = JSON.parse(n);
      notification.createdAt = new Date(notification.createdAt);
      return notification;
    });
  }

  async awardBadge(
    userId: string,
    badgeId: string,
    options?: { awardedBy?: string; reason?: string }
  ): Promise<UserBadge | null> {
    const badge = await this.badgeSystem.awardBadge(userId, badgeId, options);

    if (badge) {
      const badgeDetails = this.badgeSystem.getBadge(badgeId);
      if (badgeDetails) {
        await this.saveNotification(userId, {
          type: 'badge',
          title: 'New Badge!',
          message: `You've earned the "${badgeDetails.name}" badge!`,
          data: { badge: badgeDetails },
          createdAt: new Date(),
        });
      }
    }

    return badge;
  }

  getXPSystem(): XPSystem {
    return this.xpSystem;
  }

  getAchievementSystem(): AchievementSystem {
    return this.achievementSystem;
  }

  getBadgeSystem(): BadgeSystem {
    return this.badgeSystem;
  }

  getStreakTracker(): StreakTracker {
    return this.streakTracker;
  }

  getLeaderboardManager(): LeaderboardManager {
    return this.leaderboardManager;
  }

  getChallengeManager(): ChallengeManager {
    return this.challengeManager;
  }
}
