import { Redis } from 'ioredis';
import {
  UserStreaks,
  StreakInfo,
  WeeklyStreak,
} from './types';

export class StreakTracker {
  private redis: Redis;
  private readonly streakPrefix = 'engagement:streak:';
  private readonly activityPrefix = 'engagement:activity:';

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async recordActivity(userId: string, timezone: string = 'UTC'): Promise<{
    streaks: UserStreaks;
    streakBroken: boolean;
    streakExtended: boolean;
    milestoneReached?: number;
  }> {
    const today = this.getDateInTimezone(new Date(), timezone);
    const todayStr = this.formatDate(today);

    const alreadyActive = await this.redis.sismember(
      `${this.activityPrefix}${userId}:days`,
      todayStr
    );

    if (alreadyActive) {
      const streaks = await this.getStreaks(userId);
      return {
        streaks,
        streakBroken: false,
        streakExtended: false,
      };
    }

    await this.redis.sadd(`${this.activityPrefix}${userId}:days`, todayStr);

    const previousStreaks = await this.getStreaks(userId);
    const lastActivityDate = previousStreaks.current.lastActivityDate;

    const daysSinceLastActivity = this.getDaysDifference(lastActivityDate, today);

    let streakBroken = false;
    let streakExtended = false;
    let milestoneReached: number | undefined;

    let newStreakCount: number;
    let newStreakStart: Date;

    if (daysSinceLastActivity === 1) {
      newStreakCount = previousStreaks.current.count + 1;
      newStreakStart = previousStreaks.current.startDate;
      streakExtended = true;

      const milestones = [3, 7, 14, 30, 60, 90, 180, 365];
      if (milestones.includes(newStreakCount)) {
        milestoneReached = newStreakCount;
      }
    } else if (daysSinceLastActivity === 0) {
      newStreakCount = previousStreaks.current.count;
      newStreakStart = previousStreaks.current.startDate;
    } else {
      if (previousStreaks.current.count > 0) {
        streakBroken = true;
      }
      newStreakCount = 1;
      newStreakStart = today;
    }

    const newCurrentStreak: StreakInfo = {
      count: newStreakCount,
      startDate: newStreakStart,
      lastActivityDate: today,
    };

    const newLongestStreak: StreakInfo =
      newStreakCount > previousStreaks.longest.count
        ? { ...newCurrentStreak }
        : previousStreaks.longest;

    const weekStart = this.getWeekStart(today);
    const dayOfWeek = today.getDay();

    let weeklyStreak = previousStreaks.weekly;
    if (this.formatDate(weeklyStreak.weekStart) !== this.formatDate(weekStart)) {
      weeklyStreak = {
        daysActive: [],
        weekStart,
      };
    }

    if (!weeklyStreak.daysActive.includes(dayOfWeek)) {
      weeklyStreak.daysActive.push(dayOfWeek);
      weeklyStreak.daysActive.sort();
    }

    const newStreaks: UserStreaks = {
      current: newCurrentStreak,
      longest: newLongestStreak,
      weekly: weeklyStreak,
    };

    await this.saveStreaks(userId, newStreaks);

    return {
      streaks: newStreaks,
      streakBroken,
      streakExtended,
      milestoneReached,
    };
  }

  async getStreaks(userId: string): Promise<UserStreaks> {
    const data = await this.redis.get(`${this.streakPrefix}${userId}`);

    if (!data) {
      return this.getDefaultStreaks();
    }

    const streaks = JSON.parse(data);
    streaks.current.startDate = new Date(streaks.current.startDate);
    streaks.current.lastActivityDate = new Date(streaks.current.lastActivityDate);
    streaks.longest.startDate = new Date(streaks.longest.startDate);
    streaks.longest.lastActivityDate = new Date(streaks.longest.lastActivityDate);
    streaks.weekly.weekStart = new Date(streaks.weekly.weekStart);

    return streaks;
  }

  async checkStreakStatus(
    userId: string,
    timezone: string = 'UTC'
  ): Promise<{
    isActive: boolean;
    currentStreak: number;
    willExpireAt: Date;
    hoursRemaining: number;
  }> {
    const streaks = await this.getStreaks(userId);
    const today = this.getDateInTimezone(new Date(), timezone);
    const lastActivity = streaks.current.lastActivityDate;

    const daysSinceLastActivity = this.getDaysDifference(lastActivity, today);
    const isActive = daysSinceLastActivity <= 1;

    const willExpireAt = new Date(lastActivity);
    willExpireAt.setDate(willExpireAt.getDate() + 2);
    willExpireAt.setHours(0, 0, 0, 0);

    const hoursRemaining = Math.max(
      0,
      (willExpireAt.getTime() - Date.now()) / (1000 * 60 * 60)
    );

    return {
      isActive,
      currentStreak: isActive ? streaks.current.count : 0,
      willExpireAt,
      hoursRemaining,
    };
  }

  async getActivityCalendar(
    userId: string,
    year: number,
    month: number
  ): Promise<number[]> {
    const days = await this.redis.smembers(`${this.activityPrefix}${userId}:days`);

    const activeDays: number[] = [];
    const prefix = `${year}-${String(month).padStart(2, '0')}-`;

    days.forEach((day) => {
      if (day.startsWith(prefix)) {
        activeDays.push(parseInt(day.split('-')[2]));
      }
    });

    return activeDays.sort((a, b) => a - b);
  }

  async getStreakLeaderboard(
    limit: number = 100
  ): Promise<Array<{ userId: string; currentStreak: number; longestStreak: number; rank: number }>> {
    const entries: Array<{
      userId: string;
      currentStreak: number;
      longestStreak: number;
    }> = [];

    let cursor = '0';
    do {
      const [newCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${this.streakPrefix}*`,
        'COUNT',
        100
      );
      cursor = newCursor;

      for (const key of keys) {
        const userId = key.replace(this.streakPrefix, '');
        const streaks = await this.getStreaks(userId);
        entries.push({
          userId,
          currentStreak: streaks.current.count,
          longestStreak: streaks.longest.count,
        });
      }
    } while (cursor !== '0');

    entries.sort((a, b) => b.currentStreak - a.currentStreak);

    return entries.slice(0, limit).map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));
  }

  async recoverStreak(
    userId: string,
    recoverDays: number = 1
  ): Promise<UserStreaks | null> {
    const streaks = await this.getStreaks(userId);

    if (streaks.current.count > 0) {
      return null;
    }

    const today = new Date();
    const recoveredStart = new Date(streaks.longest.startDate);

    const newStreaks: UserStreaks = {
      current: {
        count: recoverDays,
        startDate: recoveredStart,
        lastActivityDate: today,
      },
      longest: streaks.longest,
      weekly: streaks.weekly,
    };

    await this.saveStreaks(userId, newStreaks);

    return newStreaks;
  }

  async freezeStreak(userId: string, days: number = 1): Promise<void> {
    const streaks = await this.getStreaks(userId);

    const frozenUntil = new Date();
    frozenUntil.setDate(frozenUntil.getDate() + days);

    await this.redis.set(
      `${this.streakPrefix}${userId}:frozen`,
      JSON.stringify({
        frozenAt: new Date(),
        frozenUntil,
        streakAtFreeze: streaks.current.count,
      })
    );
  }

  async isStreakFrozen(userId: string): Promise<boolean> {
    const data = await this.redis.get(`${this.streakPrefix}${userId}:frozen`);
    if (!data) return false;

    const frozen = JSON.parse(data);
    return new Date(frozen.frozenUntil) > new Date();
  }

  private async saveStreaks(userId: string, streaks: UserStreaks): Promise<void> {
    await this.redis.set(`${this.streakPrefix}${userId}`, JSON.stringify(streaks));
  }

  private getDefaultStreaks(): UserStreaks {
    const now = new Date();
    return {
      current: {
        count: 0,
        startDate: now,
        lastActivityDate: new Date(0),
      },
      longest: {
        count: 0,
        startDate: now,
        lastActivityDate: new Date(0),
      },
      weekly: {
        daysActive: [],
        weekStart: this.getWeekStart(now),
      },
    };
  }

  private getDateInTimezone(date: Date, timezone: string): Date {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    const parts = formatter.formatToParts(date);
    const values: Record<string, string> = {};
    parts.forEach((part) => {
      values[part.type] = part.value;
    });

    return new Date(`${values.year}-${values.month}-${values.day}T00:00:00`);
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  private getDaysDifference(date1: Date, date2: Date): number {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    d1.setHours(0, 0, 0, 0);
    d2.setHours(0, 0, 0, 0);

    return Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
  }

  private getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }
}
