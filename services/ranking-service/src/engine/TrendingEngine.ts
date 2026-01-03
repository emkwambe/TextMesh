// =================================
// TEXTMESH TRENDING ENGINE
// Trending Content Detection & Scoring
// =================================

import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';

// ============ TRENDING TYPES ============

export interface TrendingPost {
  postId: string;
  userId: string;
  content: string;
  score: number;
  velocity: number;
  metrics: TrendingMetrics;
  trendingRank: number;
}

export interface TrendingHashtag {
  hashtag: string;
  score: number;
  postCount: number;
  velocity: number;
  trendingRank: number;
}

export interface TrendingTopic {
  topic: string;
  score: number;
  postCount: number;
  engagementRate: number;
  trendingRank: number;
}

interface TrendingMetrics {
  likes: number;
  replies: number;
  reposts: number;
  views: number;
  velocityScore: number;
}

type TimeWindow = '1h' | '6h' | '24h' | '7d';

// ============ TRENDING CONSTANTS ============

const TIME_WINDOWS: Record<TimeWindow, number> = {
  '1h': 3600,
  '6h': 21600,
  '24h': 86400,
  '7d': 604800,
};

const VELOCITY_DECAY_FACTOR = 0.95;
const MIN_ENGAGEMENT_THRESHOLD = 10;

// ============ TRENDING ENGINE CLASS ============

export class TrendingEngine {
  private redis: Redis;
  private prisma: PrismaClient;

  constructor(redis: Redis, prisma: PrismaClient) {
    this.redis = redis;
    this.prisma = prisma;
  }

  /**
   * Get trending content
   */
  async getTrending(
    type: 'posts' | 'hashtags' | 'topics',
    timeWindow: TimeWindow = '24h',
    limit: number = 50
  ): Promise<TrendingPost[] | TrendingHashtag[] | TrendingTopic[]> {
    switch (type) {
      case 'posts':
        return this.getTrendingPosts(timeWindow, limit);
      case 'hashtags':
        return this.getTrendingHashtags(timeWindow, limit);
      case 'topics':
        return this.getTrendingTopics(timeWindow, limit);
      default:
        return [];
    }
  }

  /**
   * Get trending posts
   *
   * Trending Score Formula:
   * score = (engagement_velocity * recency_weight) / (age_hours + 2)^gravity
   *
   * where:
   * - engagement_velocity = rate of engagement over time window
   * - recency_weight = exponential decay based on post age
   * - gravity = dampening factor (typically 1.8)
   */
  async getTrendingPosts(
    timeWindow: TimeWindow,
    limit: number
  ): Promise<TrendingPost[]> {
    const cacheKey = `trending:posts:${timeWindow}`;

    // Check cache
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as TrendingPost[];
    }

    // Calculate trending posts
    const windowSeconds = TIME_WINDOWS[timeWindow];
    const cutoffTime = new Date(Date.now() - windowSeconds * 1000);

    try {
      // Get recent posts with engagement
      const posts = await this.prisma.post.findMany({
        where: {
          createdAt: { gte: cutoffTime },
          isDeleted: false,
        },
        include: {
          _count: {
            select: {
              likes: true,
              replies: true,
              reposts: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 1000, // Get top 1000 recent posts
      });

      // Score each post
      const scoredPosts = posts.map((post) => {
        const metrics: TrendingMetrics = {
          likes: post._count.likes,
          replies: post._count.replies,
          reposts: post._count.reposts,
          views: 0, // Would come from analytics
          velocityScore: 0,
        };

        const score = this.calculateTrendingScore(
          metrics,
          post.createdAt,
          windowSeconds
        );

        metrics.velocityScore = this.calculateVelocity(
          metrics,
          post.createdAt,
          windowSeconds
        );

        return {
          postId: post.id,
          userId: post.userId,
          content: post.content,
          score,
          velocity: metrics.velocityScore,
          metrics,
          trendingRank: 0,
        };
      });

      // Filter and sort
      const trending = scoredPosts
        .filter((p) => this.meetsEngagementThreshold(p.metrics))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((post, index) => ({
          ...post,
          trendingRank: index + 1,
        }));

      // Cache for 5 minutes
      await this.redis.setex(cacheKey, 300, JSON.stringify(trending));

      return trending;
    } catch {
      return [];
    }
  }

  /**
   * Get trending hashtags
   *
   * Hashtag Trending Score:
   * score = (post_count * avg_engagement) * velocity_multiplier
   */
  async getTrendingHashtags(
    timeWindow: TimeWindow,
    limit: number
  ): Promise<TrendingHashtag[]> {
    const cacheKey = `trending:hashtags:${timeWindow}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as TrendingHashtag[];
    }

    // Get hashtag counts from time windows
    const currentCounts = await this.getHashtagCounts(timeWindow);
    const previousCounts = await this.getPreviousHashtagCounts(timeWindow);

    // Calculate trending scores
    const trending: TrendingHashtag[] = [];

    for (const [hashtag, count] of Object.entries(currentCounts)) {
      const previousCount = previousCounts[hashtag] || 0;
      const velocity = previousCount > 0
        ? (count - previousCount) / previousCount
        : count > MIN_ENGAGEMENT_THRESHOLD ? 1 : 0;

      const score = count * (1 + velocity);

      if (score > 0) {
        trending.push({
          hashtag,
          score,
          postCount: count,
          velocity,
          trendingRank: 0,
        });
      }
    }

    // Sort and rank
    trending.sort((a, b) => b.score - a.score);
    trending.forEach((item, index) => {
      item.trendingRank = index + 1;
    });

    const result = trending.slice(0, limit);
    await this.redis.setex(cacheKey, 300, JSON.stringify(result));

    return result;
  }

  /**
   * Get trending topics
   */
  async getTrendingTopics(
    timeWindow: TimeWindow,
    limit: number
  ): Promise<TrendingTopic[]> {
    const cacheKey = `trending:topics:${timeWindow}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as TrendingTopic[];
    }

    // Get topic counts and engagement
    const topicData = await this.getTopicData(timeWindow);

    // Calculate trending scores
    const trending: TrendingTopic[] = Object.entries(topicData)
      .map(([topic, data]) => ({
        topic,
        score: data.postCount * data.engagementRate,
        postCount: data.postCount,
        engagementRate: data.engagementRate,
        trendingRank: 0,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    trending.forEach((item, index) => {
      item.trendingRank = index + 1;
    });

    await this.redis.setex(cacheKey, 300, JSON.stringify(trending));

    return trending;
  }

  /**
   * Calculate trending score for a post
   *
   * Uses modified Hacker News algorithm:
   * score = (votes - 1)^0.8 / (hours + 2)^gravity
   */
  private calculateTrendingScore(
    metrics: TrendingMetrics,
    createdAt: Date,
    windowSeconds: number
  ): number {
    const ageHours = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
    const gravity = 1.8;

    // Weighted engagement
    const engagement =
      metrics.likes * 1.0 +
      metrics.replies * 3.0 +
      metrics.reposts * 2.0;

    if (engagement < 1) return 0;

    // Calculate score with time decay
    const score = Math.pow(engagement, 0.8) / Math.pow(ageHours + 2, gravity);

    // Apply velocity boost for rapidly growing content
    const velocityBoost = 1 + this.calculateVelocity(metrics, createdAt, windowSeconds);

    return score * velocityBoost;
  }

  /**
   * Calculate engagement velocity
   * (rate of engagement per hour)
   */
  private calculateVelocity(
    metrics: TrendingMetrics,
    createdAt: Date,
    windowSeconds: number
  ): number {
    const ageHours = Math.max(
      1,
      (Date.now() - createdAt.getTime()) / (1000 * 60 * 60)
    );

    const totalEngagement =
      metrics.likes + metrics.replies * 2 + metrics.reposts * 1.5;

    return totalEngagement / ageHours;
  }

  /**
   * Check if post meets minimum engagement threshold
   */
  private meetsEngagementThreshold(metrics: TrendingMetrics): boolean {
    const totalEngagement =
      metrics.likes + metrics.replies + metrics.reposts;
    return totalEngagement >= MIN_ENGAGEMENT_THRESHOLD;
  }

  /**
   * Get hashtag counts for time window
   */
  private async getHashtagCounts(
    timeWindow: TimeWindow
  ): Promise<Record<string, number>> {
    const key = `hashtag:counts:${timeWindow}`;
    const data = await this.redis.hgetall(key);

    const counts: Record<string, number> = {};
    for (const [hashtag, count] of Object.entries(data)) {
      counts[hashtag] = parseInt(count, 10);
    }

    return counts;
  }

  /**
   * Get previous period hashtag counts for velocity calculation
   */
  private async getPreviousHashtagCounts(
    timeWindow: TimeWindow
  ): Promise<Record<string, number>> {
    const key = `hashtag:counts:${timeWindow}:previous`;
    const data = await this.redis.hgetall(key);

    const counts: Record<string, number> = {};
    for (const [hashtag, count] of Object.entries(data)) {
      counts[hashtag] = parseInt(count, 10);
    }

    return counts;
  }

  /**
   * Get topic data for trending calculation
   */
  private async getTopicData(
    timeWindow: TimeWindow
  ): Promise<Record<string, { postCount: number; engagementRate: number }>> {
    // In production, this would aggregate from topic tracking
    return {};
  }

  /**
   * Record engagement for trending calculation
   * Called by other services when engagement happens
   */
  async recordEngagement(
    postId: string,
    type: 'like' | 'comment' | 'repost' | 'view',
    hashtags?: string[]
  ): Promise<void> {
    const timestamp = Date.now();

    // Update post engagement in sorted sets for each time window
    for (const [window, seconds] of Object.entries(TIME_WINDOWS)) {
      const key = `trending:engagement:${window}`;
      await this.redis.zincrby(key, this.getEngagementWeight(type), postId);
      await this.redis.expire(key, seconds);
    }

    // Update hashtag counts
    if (hashtags) {
      for (const hashtag of hashtags) {
        for (const [window, seconds] of Object.entries(TIME_WINDOWS)) {
          const key = `hashtag:counts:${window}`;
          await this.redis.hincrby(key, hashtag, 1);
          await this.redis.expire(key, seconds);
        }
      }
    }
  }

  /**
   * Get engagement weight for different action types
   */
  private getEngagementWeight(type: string): number {
    const weights: Record<string, number> = {
      view: 0.1,
      like: 1.0,
      comment: 3.0,
      repost: 2.0,
    };
    return weights[type] || 0;
  }

  /**
   * Refresh trending cache (called periodically)
   */
  async refreshTrendingCache(): Promise<void> {
    const timeWindows: TimeWindow[] = ['1h', '6h', '24h', '7d'];

    for (const window of timeWindows) {
      // Delete existing cache to force recalculation
      await this.redis.del(`trending:posts:${window}`);
      await this.redis.del(`trending:hashtags:${window}`);
      await this.redis.del(`trending:topics:${window}`);

      // Recalculate
      await this.getTrendingPosts(window, 100);
      await this.getTrendingHashtags(window, 100);
      await this.getTrendingTopics(window, 50);
    }
  }
}

export default TrendingEngine;
