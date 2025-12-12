import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import {
  XPEvent,
  XPAction,
  XPConfig,
  UserRank,
} from './types';

const DEFAULT_XP_CONFIG: XPConfig = {
  baseXP: {
    post_created: 50,
    post_liked: 5,
    post_shared: 20,
    comment_created: 20,
    comment_liked: 3,
    follower_gained: 30,
    following_added: 5,
    profile_completed: 100,
    daily_login: 10,
    streak_bonus: 25,
    achievement_unlocked: 0,
    badge_earned: 0,
    referral_signup: 200,
    content_featured: 500,
    challenge_completed: 100,
  },
  levelThresholds: [
    0,      // Level 1
    100,    // Level 2
    300,    // Level 3
    600,    // Level 4
    1000,   // Level 5
    1500,   // Level 6
    2200,   // Level 7
    3000,   // Level 8
    4000,   // Level 9
    5200,   // Level 10
    6600,   // Level 11
    8200,   // Level 12
    10000,  // Level 13
    12000,  // Level 14
    14500,  // Level 15
    17500,  // Level 16
    21000,  // Level 17
    25000,  // Level 18
    30000,  // Level 19
    36000,  // Level 20
    43000,  // Level 21
    51000,  // Level 22
    60000,  // Level 23
    70000,  // Level 24
    82000,  // Level 25
    95000,  // Level 26
    110000, // Level 27
    127000, // Level 28
    146000, // Level 29
    167000, // Level 30
  ],
  streakMultipliers: {
    3: 1.1,
    7: 1.25,
    14: 1.5,
    30: 2.0,
    60: 2.5,
    90: 3.0,
  },
  rarityMultipliers: {
    common: 1,
    uncommon: 1.5,
    rare: 2,
    epic: 3,
    legendary: 5,
  },
};

export class XPSystem {
  private redis: Redis;
  private config: XPConfig;
  private readonly xpPrefix = 'engagement:xp:';
  private readonly levelPrefix = 'engagement:level:';
  private readonly historyPrefix = 'engagement:xp_history:';

  constructor(redis: Redis, config?: Partial<XPConfig>) {
    this.redis = redis;
    this.config = { ...DEFAULT_XP_CONFIG, ...config };
  }

  async awardXP(
    userId: string,
    action: XPAction,
    options: {
      source?: string;
      metadata?: Record<string, unknown>;
      multiplier?: number;
      streakDays?: number;
    } = {}
  ): Promise<{
    xpAwarded: number;
    totalXp: number;
    level: number;
    leveledUp: boolean;
    newLevel?: number;
  }> {
    const baseXP = this.config.baseXP[action];
    let multiplier = options.multiplier || 1;

    if (options.streakDays) {
      const streakMultiplier = this.getStreakMultiplier(options.streakDays);
      multiplier *= streakMultiplier;
    }

    const xpAwarded = Math.round(baseXP * multiplier);

    const [totalXpStr, currentLevelStr] = await Promise.all([
      this.redis.get(`${this.xpPrefix}${userId}:total`),
      this.redis.get(`${this.levelPrefix}${userId}`),
    ]);

    const previousTotalXp = parseInt(totalXpStr || '0');
    const previousLevel = parseInt(currentLevelStr || '1');

    const newTotalXp = previousTotalXp + xpAwarded;
    const newLevel = this.calculateLevel(newTotalXp);

    const pipeline = this.redis.pipeline();
    pipeline.set(`${this.xpPrefix}${userId}:total`, newTotalXp);
    pipeline.set(`${this.levelPrefix}${userId}`, newLevel);
    pipeline.incrby(`${this.xpPrefix}${userId}:current`, xpAwarded);

    const xpEvent: XPEvent = {
      id: uuidv4(),
      userId,
      action,
      amount: xpAwarded,
      multiplier,
      source: options.source,
      metadata: options.metadata,
      createdAt: new Date(),
    };

    pipeline.lpush(`${this.historyPrefix}${userId}`, JSON.stringify(xpEvent));
    pipeline.ltrim(`${this.historyPrefix}${userId}`, 0, 999);

    const date = new Date().toISOString().split('T')[0];
    pipeline.hincrby(`engagement:stats:daily:${date}`, 'xp_awarded', xpAwarded);
    pipeline.hincrby(`engagement:stats:daily:${date}`, `action:${action}`, 1);

    await pipeline.exec();

    const leveledUp = newLevel > previousLevel;

    if (leveledUp) {
      await this.redis.lpush(
        `engagement:level_ups:${userId}`,
        JSON.stringify({
          fromLevel: previousLevel,
          toLevel: newLevel,
          timestamp: new Date(),
        })
      );
    }

    return {
      xpAwarded,
      totalXp: newTotalXp,
      level: newLevel,
      leveledUp,
      newLevel: leveledUp ? newLevel : undefined,
    };
  }

  async getUserXP(userId: string): Promise<{
    totalXp: number;
    currentLevelXp: number;
    xpToNextLevel: number;
    level: number;
    rank: UserRank;
    progress: number;
  }> {
    const [totalXpStr, levelStr] = await Promise.all([
      this.redis.get(`${this.xpPrefix}${userId}:total`),
      this.redis.get(`${this.levelPrefix}${userId}`),
    ]);

    const totalXp = parseInt(totalXpStr || '0');
    const level = parseInt(levelStr || '1');

    const currentLevelThreshold = this.config.levelThresholds[level - 1] || 0;
    const nextLevelThreshold =
      this.config.levelThresholds[level] ||
      this.config.levelThresholds[this.config.levelThresholds.length - 1] * 1.5;

    const currentLevelXp = totalXp - currentLevelThreshold;
    const xpToNextLevel = nextLevelThreshold - totalXp;
    const levelRange = nextLevelThreshold - currentLevelThreshold;
    const progress = levelRange > 0 ? currentLevelXp / levelRange : 1;

    return {
      totalXp,
      currentLevelXp,
      xpToNextLevel: Math.max(0, xpToNextLevel),
      level,
      rank: this.getRankForLevel(level),
      progress: Math.min(1, Math.max(0, progress)),
    };
  }

  async getXPHistory(
    userId: string,
    limit: number = 50
  ): Promise<XPEvent[]> {
    const events = await this.redis.lrange(
      `${this.historyPrefix}${userId}`,
      0,
      limit - 1
    );

    return events.map((e) => {
      const event = JSON.parse(e);
      event.createdAt = new Date(event.createdAt);
      return event;
    });
  }

  async getXPLeaderboard(
    limit: number = 100
  ): Promise<Array<{ userId: string; totalXp: number; level: number; rank: number }>> {
    const keys: string[] = [];
    let cursor = '0';

    do {
      const [newCursor, foundKeys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${this.xpPrefix}*:total`,
        'COUNT',
        100
      );
      cursor = newCursor;
      keys.push(...foundKeys);
    } while (cursor !== '0');

    const entries: Array<{ userId: string; totalXp: number; level: number }> = [];

    for (const key of keys) {
      const userId = key.replace(this.xpPrefix, '').replace(':total', '');
      const [totalXpStr, levelStr] = await Promise.all([
        this.redis.get(key),
        this.redis.get(`${this.levelPrefix}${userId}`),
      ]);

      entries.push({
        userId,
        totalXp: parseInt(totalXpStr || '0'),
        level: parseInt(levelStr || '1'),
      });
    }

    entries.sort((a, b) => b.totalXp - a.totalXp);

    return entries.slice(0, limit).map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));
  }

  async deductXP(
    userId: string,
    amount: number,
    reason: string
  ): Promise<{ newTotalXp: number; newLevel: number }> {
    const totalXpStr = await this.redis.get(`${this.xpPrefix}${userId}:total`);
    const currentTotalXp = parseInt(totalXpStr || '0');
    const newTotalXp = Math.max(0, currentTotalXp - amount);
    const newLevel = this.calculateLevel(newTotalXp);

    await Promise.all([
      this.redis.set(`${this.xpPrefix}${userId}:total`, newTotalXp),
      this.redis.set(`${this.levelPrefix}${userId}`, newLevel),
      this.redis.lpush(
        `${this.historyPrefix}${userId}`,
        JSON.stringify({
          id: uuidv4(),
          userId,
          action: 'deduction' as XPAction,
          amount: -amount,
          multiplier: 1,
          source: reason,
          createdAt: new Date(),
        })
      ),
    ]);

    return { newTotalXp, newLevel };
  }

  private calculateLevel(totalXp: number): number {
    for (let i = this.config.levelThresholds.length - 1; i >= 0; i--) {
      if (totalXp >= this.config.levelThresholds[i]) {
        return i + 1;
      }
    }
    return 1;
  }

  private getStreakMultiplier(streakDays: number): number {
    const thresholds = Object.keys(this.config.streakMultipliers)
      .map(Number)
      .sort((a, b) => b - a);

    for (const threshold of thresholds) {
      if (streakDays >= threshold) {
        return this.config.streakMultipliers[threshold];
      }
    }

    return 1;
  }

  private getRankForLevel(level: number): UserRank {
    if (level >= 25) return 'legend';
    if (level >= 20) return 'expert';
    if (level >= 15) return 'influencer';
    if (level >= 10) return 'contributor';
    if (level >= 5) return 'regular';
    return 'newcomer';
  }

  getConfig(): XPConfig {
    return this.config;
  }
}
