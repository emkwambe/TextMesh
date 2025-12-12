import { Redis } from 'ioredis';
import {
  LeaderboardEntry,
  Leaderboard,
  LeaderboardType,
  LeaderboardTimeframe,
} from './types';

export class LeaderboardManager {
  private redis: Redis;
  private readonly leaderboardPrefix = 'engagement:leaderboard:';
  private readonly snapshotPrefix = 'engagement:leaderboard_snapshot:';

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async updateScore(
    leaderboardId: string,
    userId: string,
    score: number,
    metadata?: {
      username?: string;
      displayName?: string;
      avatarUrl?: string;
      level?: number;
      badges?: string[];
    }
  ): Promise<{ rank: number; change: number }> {
    const key = `${this.leaderboardPrefix}${leaderboardId}`;

    const previousRank = await this.getRank(leaderboardId, userId);

    await this.redis.zadd(key, score, userId);

    if (metadata) {
      await this.redis.hset(
        `${key}:metadata`,
        userId,
        JSON.stringify(metadata)
      );
    }

    const newRank = await this.getRank(leaderboardId, userId);

    const change = previousRank > 0 ? previousRank - newRank : 0;

    return { rank: newRank, change };
  }

  async incrementScore(
    leaderboardId: string,
    userId: string,
    increment: number
  ): Promise<number> {
    const key = `${this.leaderboardPrefix}${leaderboardId}`;
    const newScore = await this.redis.zincrby(key, increment, userId);
    return parseFloat(newScore);
  }

  async getScore(leaderboardId: string, userId: string): Promise<number | null> {
    const key = `${this.leaderboardPrefix}${leaderboardId}`;
    const score = await this.redis.zscore(key, userId);
    return score !== null ? parseFloat(score) : null;
  }

  async getRank(leaderboardId: string, userId: string): Promise<number> {
    const key = `${this.leaderboardPrefix}${leaderboardId}`;
    const rank = await this.redis.zrevrank(key, userId);
    return rank !== null ? rank + 1 : 0;
  }

  async getLeaderboard(
    leaderboardId: string,
    options: {
      offset?: number;
      limit?: number;
      withMetadata?: boolean;
    } = {}
  ): Promise<LeaderboardEntry[]> {
    const { offset = 0, limit = 100, withMetadata = true } = options;
    const key = `${this.leaderboardPrefix}${leaderboardId}`;

    const results = await this.redis.zrevrange(
      key,
      offset,
      offset + limit - 1,
      'WITHSCORES'
    );

    const entries: LeaderboardEntry[] = [];
    const userIds: string[] = [];

    for (let i = 0; i < results.length; i += 2) {
      userIds.push(results[i]);
    }

    let metadataMap: Record<string, Record<string, unknown>> = {};
    if (withMetadata && userIds.length > 0) {
      const metadataResults = await this.redis.hmget(
        `${key}:metadata`,
        ...userIds
      );

      userIds.forEach((userId, index) => {
        const metadata = metadataResults[index];
        if (metadata) {
          metadataMap[userId] = JSON.parse(metadata);
        }
      });
    }

    for (let i = 0; i < results.length; i += 2) {
      const userId = results[i];
      const score = parseFloat(results[i + 1]);
      const rank = offset + Math.floor(i / 2) + 1;
      const metadata = metadataMap[userId] || {};

      entries.push({
        userId,
        username: (metadata.username as string) || userId,
        displayName: metadata.displayName as string,
        avatarUrl: metadata.avatarUrl as string,
        score,
        rank,
        level: (metadata.level as number) || 1,
        badges: (metadata.badges as string[]) || [],
        change: 0,
      });
    }

    return entries;
  }

  async getAroundUser(
    leaderboardId: string,
    userId: string,
    range: number = 5
  ): Promise<LeaderboardEntry[]> {
    const userRank = await this.getRank(leaderboardId, userId);
    if (userRank === 0) return [];

    const offset = Math.max(0, userRank - range - 1);
    return this.getLeaderboard(leaderboardId, {
      offset,
      limit: range * 2 + 1,
    });
  }

  async getTopN(
    leaderboardId: string,
    n: number = 10
  ): Promise<LeaderboardEntry[]> {
    return this.getLeaderboard(leaderboardId, { limit: n });
  }

  async removeFromLeaderboard(
    leaderboardId: string,
    userId: string
  ): Promise<boolean> {
    const key = `${this.leaderboardPrefix}${leaderboardId}`;
    const removed = await this.redis.zrem(key, userId);
    await this.redis.hdel(`${key}:metadata`, userId);
    return removed > 0;
  }

  async getLeaderboardSize(leaderboardId: string): Promise<number> {
    const key = `${this.leaderboardPrefix}${leaderboardId}`;
    return this.redis.zcard(key);
  }

  createTimeframeLeaderboard(
    baseId: string,
    timeframe: LeaderboardTimeframe
  ): string {
    const now = new Date();
    let suffix: string;

    switch (timeframe) {
      case 'daily':
        suffix = now.toISOString().split('T')[0];
        break;
      case 'weekly':
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        suffix = `week_${weekStart.toISOString().split('T')[0]}`;
        break;
      case 'monthly':
        suffix = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}`;
        break;
      case 'all_time':
        suffix = 'all_time';
        break;
    }

    return `${baseId}:${suffix}`;
  }

  async takeSnapshot(
    leaderboardId: string,
    snapshotId: string
  ): Promise<void> {
    const entries = await this.getLeaderboard(leaderboardId, { limit: 1000 });

    await this.redis.set(
      `${this.snapshotPrefix}${snapshotId}`,
      JSON.stringify({
        leaderboardId,
        entries,
        takenAt: new Date(),
      })
    );
  }

  async getSnapshot(
    snapshotId: string
  ): Promise<{ leaderboardId: string; entries: LeaderboardEntry[]; takenAt: Date } | null> {
    const data = await this.redis.get(`${this.snapshotPrefix}${snapshotId}`);
    if (!data) return null;

    const snapshot = JSON.parse(data);
    snapshot.takenAt = new Date(snapshot.takenAt);
    return snapshot;
  }

  async calculateRankChanges(
    currentLeaderboardId: string,
    previousSnapshotId: string
  ): Promise<LeaderboardEntry[]> {
    const [currentEntries, snapshot] = await Promise.all([
      this.getLeaderboard(currentLeaderboardId, { limit: 100 }),
      this.getSnapshot(previousSnapshotId),
    ]);

    if (!snapshot) return currentEntries;

    const previousRanks = new Map(
      snapshot.entries.map((e) => [e.userId, e.rank])
    );

    return currentEntries.map((entry) => {
      const previousRank = previousRanks.get(entry.userId) || 0;
      return {
        ...entry,
        change: previousRank > 0 ? previousRank - entry.rank : entry.rank,
      };
    });
  }

  async resetLeaderboard(leaderboardId: string): Promise<void> {
    const key = `${this.leaderboardPrefix}${leaderboardId}`;
    await this.redis.del(key);
    await this.redis.del(`${key}:metadata`);
  }

  async getMultipleLeaderboards(
    leaderboardIds: string[],
    limit: number = 10
  ): Promise<Record<string, LeaderboardEntry[]>> {
    const results: Record<string, LeaderboardEntry[]> = {};

    await Promise.all(
      leaderboardIds.map(async (id) => {
        results[id] = await this.getLeaderboard(id, { limit });
      })
    );

    return results;
  }

  async getUserRanks(
    userId: string,
    leaderboardIds: string[]
  ): Promise<Record<string, { rank: number; score: number }>> {
    const results: Record<string, { rank: number; score: number }> = {};

    await Promise.all(
      leaderboardIds.map(async (id) => {
        const [rank, score] = await Promise.all([
          this.getRank(id, userId),
          this.getScore(id, userId),
        ]);
        results[id] = { rank, score: score || 0 };
      })
    );

    return results;
  }
}
