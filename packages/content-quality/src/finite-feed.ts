import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import {
  FiniteFeedConfig,
  FeedSession,
  FeedItem,
  DailyDigest,
  DigestItem,
} from './types';

const DEFAULT_CONFIG: FiniteFeedConfig = {
  enabled: true,
  dailyContentLimit: 100, // Max 100 items per day
  sessionLimit: 25, // Max 25 items per session
  digestEnabled: true,
  digestTime: '08:00', // 8 AM
  catchUpThreshold: 5, // "Caught up" when 5 or fewer items remain
};

export class FiniteFeed {
  private redis: Redis;
  private config: FiniteFeedConfig;
  private readonly sessionPrefix = 'quality:feed_session:';
  private readonly dailyPrefix = 'quality:daily_feed:';
  private readonly digestPrefix = 'quality:digest:';
  private readonly queuePrefix = 'quality:feed_queue:';

  constructor(redis: Redis, config?: Partial<FiniteFeedConfig>) {
    this.redis = redis;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async startSession(userId: string): Promise<FeedSession> {
    const sessionId = uuidv4();
    const dailyKey = `${this.dailyPrefix}${userId}:${this.getTodayKey()}`;

    // Get daily consumption
    const dailyViewed = await this.redis.get(dailyKey);
    const viewedToday = dailyViewed ? parseInt(dailyViewed) : 0;

    // Calculate remaining
    const dailyRemaining = Math.max(0, this.config.dailyContentLimit - viewedToday);
    const sessionRemaining = Math.min(this.config.sessionLimit, dailyRemaining);

    const session: FeedSession = {
      userId,
      sessionId,
      startTime: new Date(),
      itemsViewed: 0,
      itemsRemaining: sessionRemaining,
      isCaughtUp: sessionRemaining <= this.config.catchUpThreshold,
      nextRefreshAt: this.getNextRefreshTime(),
    };

    await this.redis.set(
      `${this.sessionPrefix}${sessionId}`,
      JSON.stringify(session),
      'EX',
      3600 // 1 hour session TTL
    );

    return session;
  }

  async getNextItems(
    sessionId: string,
    count: number = 10
  ): Promise<{ items: FeedItem[]; session: FeedSession }> {
    const sessionData = await this.redis.get(`${this.sessionPrefix}${sessionId}`);
    if (!sessionData) {
      throw new Error('Session not found or expired');
    }

    const session: FeedSession = JSON.parse(sessionData);
    session.startTime = new Date(session.startTime);
    session.nextRefreshAt = new Date(session.nextRefreshAt);

    // Check if caught up
    if (session.isCaughtUp || session.itemsRemaining === 0) {
      return { items: [], session };
    }

    // Get items from queue
    const actualCount = Math.min(count, session.itemsRemaining);
    const queueKey = `${this.queuePrefix}${session.userId}`;

    const rawItems = await this.redis.zrevrange(queueKey, 0, actualCount - 1);
    const items: FeedItem[] = rawItems.map(raw => {
      const item = JSON.parse(raw);
      item.createdAt = new Date(item.createdAt);
      if (item.expiresAt) item.expiresAt = new Date(item.expiresAt);
      return item;
    });

    // Remove fetched items from queue
    if (rawItems.length > 0) {
      await this.redis.zrem(queueKey, ...rawItems);
    }

    return { items, session };
  }

  async markViewed(sessionId: string, itemIds: string[]): Promise<FeedSession> {
    const sessionData = await this.redis.get(`${this.sessionPrefix}${sessionId}`);
    if (!sessionData) {
      throw new Error('Session not found');
    }

    const session: FeedSession = JSON.parse(sessionData);
    const viewedCount = itemIds.length;

    // Update session
    session.itemsViewed += viewedCount;
    session.itemsRemaining = Math.max(0, session.itemsRemaining - viewedCount);
    session.isCaughtUp = session.itemsRemaining <= this.config.catchUpThreshold;

    // Update daily count
    const dailyKey = `${this.dailyPrefix}${session.userId}:${this.getTodayKey()}`;
    await this.redis.incrby(dailyKey, viewedCount);
    await this.redis.expire(dailyKey, 86400); // 24 hour TTL

    // Save session
    await this.redis.set(
      `${this.sessionPrefix}${sessionId}`,
      JSON.stringify(session),
      'EX',
      3600
    );

    return session;
  }

  async addToFeed(userId: string, item: Omit<FeedItem, 'id'>): Promise<void> {
    const feedItem: FeedItem = {
      id: uuidv4(),
      ...item,
    };

    const queueKey = `${this.queuePrefix}${userId}`;
    const score = item.priority * 1000 + item.thoughtfulnessScore;

    await this.redis.zadd(queueKey, score, JSON.stringify(feedItem));

    // Trim queue to reasonable size
    await this.redis.zremrangebyrank(queueKey, 0, -501); // Keep top 500
  }

  async getQueueSize(userId: string): Promise<number> {
    const queueKey = `${this.queuePrefix}${userId}`;
    return this.redis.zcard(queueKey);
  }

  async getDailyStats(userId: string): Promise<{
    viewedToday: number;
    remainingToday: number;
    isCaughtUp: boolean;
    nextRefreshAt: Date;
  }> {
    const dailyKey = `${this.dailyPrefix}${userId}:${this.getTodayKey()}`;
    const viewed = await this.redis.get(dailyKey);
    const viewedToday = viewed ? parseInt(viewed) : 0;
    const remainingToday = Math.max(0, this.config.dailyContentLimit - viewedToday);
    const queueSize = await this.getQueueSize(userId);

    return {
      viewedToday,
      remainingToday,
      isCaughtUp: queueSize <= this.config.catchUpThreshold,
      nextRefreshAt: this.getNextRefreshTime(),
    };
  }

  // Daily Digest Generation
  async generateDigest(
    userId: string,
    items: DigestItem[]
  ): Promise<DailyDigest> {
    const date = this.getTodayKey();

    // Sort by combined score
    const sortedItems = items
      .sort((a, b) =>
        (b.thoughtfulnessScore + b.engagementScore) -
        (a.thoughtfulnessScore + a.engagementScore)
      )
      .slice(0, 20); // Top 20 items

    // Extract themes
    const themes = this.extractThemes(sortedItems);

    const digest: DailyDigest = {
      userId,
      date,
      generatedAt: new Date(),
      items: sortedItems,
      stats: {
        totalContent: items.length,
        includedContent: sortedItems.length,
        topThemes: themes,
      },
    };

    await this.redis.set(
      `${this.digestPrefix}${userId}:${date}`,
      JSON.stringify(digest),
      'EX',
      86400 * 7 // 7 days
    );

    return digest;
  }

  async getDigest(userId: string, date?: string): Promise<DailyDigest | null> {
    const targetDate = date || this.getTodayKey();
    const data = await this.redis.get(`${this.digestPrefix}${userId}:${targetDate}`);

    if (!data) return null;

    const digest = JSON.parse(data);
    digest.generatedAt = new Date(digest.generatedAt);
    return digest;
  }

  async getDigestHistory(
    userId: string,
    days: number = 7
  ): Promise<DailyDigest[]> {
    const digests: DailyDigest[] = [];
    const today = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];

      const digest = await this.getDigest(userId, dateKey);
      if (digest) {
        digests.push(digest);
      }
    }

    return digests;
  }

  private getTodayKey(): string {
    return new Date().toISOString().split('T')[0];
  }

  private getNextRefreshTime(): Date {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow;
  }

  private extractThemes(items: DigestItem[]): string[] {
    const categories = items.map(i => i.category);
    const counts: Record<string, number> = {};

    for (const cat of categories) {
      counts[cat] = (counts[cat] || 0) + 1;
    }

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([theme]) => theme);
  }
}
