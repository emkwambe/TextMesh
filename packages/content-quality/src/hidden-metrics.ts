import { Redis } from 'ioredis';
import {
  MetricVisibility,
  PrivateMetrics,
} from './types';

const DEFAULT_VISIBILITY: MetricVisibility = {
  showLikeCounts: false,
  showFollowerCounts: false,
  showShareCounts: false,
  showViewCounts: false,
  showToAuthorOnly: true,
  delayPublicMetrics: 24, // 24 hours before showing any public metrics
};

export class HiddenMetrics {
  private redis: Redis;
  private defaultVisibility: MetricVisibility;
  private readonly metricsPrefix = 'quality:metrics:';
  private readonly visibilityPrefix = 'quality:visibility:';
  private readonly userSettingsPrefix = 'quality:user_visibility:';

  constructor(redis: Redis, defaultVisibility?: Partial<MetricVisibility>) {
    this.redis = redis;
    this.defaultVisibility = { ...DEFAULT_VISIBILITY, ...defaultVisibility };
  }

  async recordMetric(
    contentId: string,
    authorId: string,
    metric: 'like' | 'share' | 'bookmark' | 'reply' | 'view',
    increment: number = 1
  ): Promise<void> {
    const metricsKey = `${this.metricsPrefix}${contentId}`;

    const fieldMap = {
      like: 'likes',
      share: 'shares',
      bookmark: 'bookmarks',
      reply: 'replies',
      view: 'reach',
    };

    await this.redis.hincrby(metricsKey, fieldMap[metric], increment);

    // Set visibility timestamp if first interaction
    const visibilityKey = `${this.visibilityPrefix}${contentId}`;
    const exists = await this.redis.exists(visibilityKey);
    if (!exists) {
      const visibleAt = new Date(
        Date.now() + this.defaultVisibility.delayPublicMetrics * 3600 * 1000
      );
      await this.redis.hset(visibilityKey, {
        authorId,
        createdAt: Date.now(),
        visibleAt: visibleAt.getTime(),
      });
    }
  }

  async recordReadTime(
    contentId: string,
    userId: string,
    seconds: number
  ): Promise<void> {
    const metricsKey = `${this.metricsPrefix}${contentId}`;
    await this.redis.hincrby(metricsKey, 'readTime', seconds);

    // Track unique readers
    const readersKey = `quality:readers:${contentId}`;
    await this.redis.sadd(readersKey, userId);
    await this.redis.expire(readersKey, 86400 * 30); // 30 days
  }

  async getMetrics(
    contentId: string,
    requesterId: string
  ): Promise<PrivateMetrics | { hidden: true; reason: string }> {
    const metricsKey = `${this.metricsPrefix}${contentId}`;
    const visibilityKey = `${this.visibilityPrefix}${contentId}`;

    const [metricsData, visibilityData] = await Promise.all([
      this.redis.hgetall(metricsKey),
      this.redis.hgetall(visibilityKey),
    ]);

    if (!metricsData || Object.keys(metricsData).length === 0) {
      return {
        userId: requesterId,
        contentId,
        likes: 0,
        shares: 0,
        bookmarks: 0,
        replies: 0,
        readTime: 0,
        reach: 0,
      };
    }

    const authorId = visibilityData.authorId;
    const visibleAt = visibilityData.visibleAt
      ? new Date(parseInt(visibilityData.visibleAt))
      : null;

    // Check visibility rules
    const visibility = await this.getUserVisibilitySettings(authorId);
    const isAuthor = requesterId === authorId;
    const isPastDelay = visibleAt && new Date() >= visibleAt;

    // Author always sees their own metrics
    if (isAuthor && visibility.showToAuthorOnly) {
      return this.buildMetrics(contentId, requesterId, metricsData, visibleAt);
    }

    // Check if delay has passed
    if (!isPastDelay) {
      return {
        hidden: true,
        reason: 'Metrics will be visible after initial engagement period',
      };
    }

    // Apply visibility settings
    return this.buildFilteredMetrics(
      contentId,
      requesterId,
      metricsData,
      visibility,
      visibleAt
    );
  }

  async getAuthorDashboard(authorId: string): Promise<{
    totalContent: number;
    aggregateMetrics: {
      totalLikes: number;
      totalShares: number;
      totalBookmarks: number;
      totalReplies: number;
      totalReadTime: number;
      totalReach: number;
    };
    recentPerformance: Array<{
      contentId: string;
      metrics: PrivateMetrics;
    }>;
  }> {
    // Get all author's content metrics
    let cursor = '0';
    const contentMetrics: Array<{ contentId: string; metrics: PrivateMetrics }> = [];

    do {
      const [newCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${this.visibilityPrefix}*`,
        'COUNT',
        100
      );
      cursor = newCursor;

      for (const key of keys) {
        const visibility = await this.redis.hgetall(key);
        if (visibility.authorId === authorId) {
          const contentId = key.replace(this.visibilityPrefix, '');
          const metricsData = await this.redis.hgetall(
            `${this.metricsPrefix}${contentId}`
          );

          if (metricsData) {
            contentMetrics.push({
              contentId,
              metrics: this.buildMetrics(contentId, authorId, metricsData, null),
            });
          }
        }
      }
    } while (cursor !== '0');

    // Aggregate
    const aggregate = {
      totalLikes: 0,
      totalShares: 0,
      totalBookmarks: 0,
      totalReplies: 0,
      totalReadTime: 0,
      totalReach: 0,
    };

    for (const { metrics } of contentMetrics) {
      aggregate.totalLikes += metrics.likes;
      aggregate.totalShares += metrics.shares;
      aggregate.totalBookmarks += metrics.bookmarks;
      aggregate.totalReplies += metrics.replies;
      aggregate.totalReadTime += metrics.readTime;
      aggregate.totalReach += metrics.reach;
    }

    // Sort by engagement
    const sorted = contentMetrics.sort(
      (a, b) =>
        (b.metrics.likes + b.metrics.bookmarks) -
        (a.metrics.likes + a.metrics.bookmarks)
    );

    return {
      totalContent: contentMetrics.length,
      aggregateMetrics: aggregate,
      recentPerformance: sorted.slice(0, 20),
    };
  }

  async setUserVisibilitySettings(
    userId: string,
    settings: Partial<MetricVisibility>
  ): Promise<void> {
    await this.redis.set(
      `${this.userSettingsPrefix}${userId}`,
      JSON.stringify({ ...this.defaultVisibility, ...settings })
    );
  }

  async getUserVisibilitySettings(userId: string): Promise<MetricVisibility> {
    const data = await this.redis.get(`${this.userSettingsPrefix}${userId}`);
    if (!data) return this.defaultVisibility;
    return JSON.parse(data);
  }

  private buildMetrics(
    contentId: string,
    userId: string,
    data: Record<string, string>,
    visibleAt: Date | null
  ): PrivateMetrics {
    return {
      userId,
      contentId,
      likes: parseInt(data.likes || '0'),
      shares: parseInt(data.shares || '0'),
      bookmarks: parseInt(data.bookmarks || '0'),
      replies: parseInt(data.replies || '0'),
      readTime: parseInt(data.readTime || '0'),
      reach: parseInt(data.reach || '0'),
      visibleAt: visibleAt || undefined,
    };
  }

  private buildFilteredMetrics(
    contentId: string,
    userId: string,
    data: Record<string, string>,
    visibility: MetricVisibility,
    visibleAt: Date | null
  ): PrivateMetrics {
    return {
      userId,
      contentId,
      likes: visibility.showLikeCounts ? parseInt(data.likes || '0') : -1,
      shares: visibility.showShareCounts ? parseInt(data.shares || '0') : -1,
      bookmarks: parseInt(data.bookmarks || '0'), // Always show bookmarks (quality signal)
      replies: parseInt(data.replies || '0'), // Always show replies
      readTime: -1, // Never show to non-authors
      reach: visibility.showViewCounts ? parseInt(data.reach || '0') : -1,
      visibleAt: visibleAt || undefined,
    };
  }

  // Emphasize bookmarks over likes
  async getBookmarkLeaderboard(
    limit: number = 50
  ): Promise<Array<{ contentId: string; bookmarks: number }>> {
    const results: Array<{ contentId: string; bookmarks: number }> = [];
    let cursor = '0';

    do {
      const [newCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${this.metricsPrefix}*`,
        'COUNT',
        100
      );
      cursor = newCursor;

      for (const key of keys) {
        const bookmarks = await this.redis.hget(key, 'bookmarks');
        if (bookmarks && parseInt(bookmarks) > 0) {
          results.push({
            contentId: key.replace(this.metricsPrefix, ''),
            bookmarks: parseInt(bookmarks),
          });
        }
      }
    } while (cursor !== '0');

    return results
      .sort((a, b) => b.bookmarks - a.bookmarks)
      .slice(0, limit);
  }
}
