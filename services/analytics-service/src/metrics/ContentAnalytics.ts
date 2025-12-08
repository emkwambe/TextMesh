// =================================
// TEXTMESH CONTENT ANALYTICS
// Content Performance Analysis
// =================================

import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';

// ============ CONTENT ANALYTICS TYPES ============

export interface ContentAnalyticsResult {
  period: string;
  timestamp: Date;
  overview: ContentOverview;
  performance: ContentPerformance;
  distribution: ContentDistribution;
  trending: TrendingContent;
  quality: ContentQuality;
}

export interface ContentOverview {
  totalPosts: number;
  newPosts: number;
  postsPerDay: number;
  avgPostLength: number;
  avgEngagementRate: number;
  mediaUsage: MediaUsage;
}

export interface MediaUsage {
  textOnly: number;
  withImages: number;
  withVideos: number;
  withLinks: number;
  withHashtags: number;
  withMentions: number;
}

export interface ContentPerformance {
  avgLikes: number;
  avgComments: number;
  avgShares: number;
  avgViews: number;
  viralRate: number;
  topPerformers: PostPerformance[];
  worstPerformers: PostPerformance[];
}

export interface PostPerformance {
  postId: string;
  userId: string;
  content: string;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  engagementRate: number;
  createdAt: Date;
}

export interface ContentDistribution {
  byHour: Record<number, number>;
  byDay: Record<string, number>;
  byLength: LengthBucket[];
  byType: Record<string, number>;
  byTopic: Record<string, number>;
}

export interface LengthBucket {
  range: string;
  min: number;
  max: number;
  count: number;
  percentage: number;
}

export interface TrendingContent {
  hashtags: TrendingItem[];
  topics: TrendingItem[];
  posts: TrendingPost[];
  mentions: TrendingItem[];
}

export interface TrendingItem {
  name: string;
  count: number;
  change: number;
  velocity: number;
}

export interface TrendingPost {
  postId: string;
  content: string;
  engagement: number;
  velocity: number;
  peakTime: Date;
}

export interface ContentQuality {
  avgReadability: number;
  avgSentiment: number;
  toxicityRate: number;
  spamRate: number;
  originalityScore: number;
  contentCategories: Record<string, number>;
}

export interface SingleContentPerformance {
  postId: string;
  metrics: PostMetrics;
  timeline: TimelinePoint[];
  audience: AudienceBreakdown;
  comparisons: ContentComparisons;
}

export interface PostMetrics {
  impressions: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  bookmarks: number;
  clicks: number;
  engagementRate: number;
  viralCoefficient: number;
}

export interface TimelinePoint {
  timestamp: Date;
  impressions: number;
  engagements: number;
  cumulativeLikes: number;
}

export interface AudienceBreakdown {
  followers: number;
  nonFollowers: number;
  fromSearch: number;
  fromFeed: number;
  fromProfile: number;
  fromShare: number;
}

export interface ContentComparisons {
  vsUserAvg: number;
  vsPlatformAvg: number;
  percentile: number;
}

// ============ TIME PERIODS ============

const PERIODS: Record<string, number> = {
  '1d': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
};

// ============ LENGTH BUCKETS ============

const LENGTH_BUCKETS = [
  { range: 'micro', min: 0, max: 50 },
  { range: 'short', min: 51, max: 140 },
  { range: 'medium', min: 141, max: 280 },
  { range: 'long', min: 281, max: 500 },
  { range: 'extended', min: 501, max: Infinity },
];

// ============ CONTENT ANALYTICS CLASS ============

export class ContentAnalytics {
  private redis: Redis;
  private prisma: PrismaClient;

  constructor(redis: Redis, prisma: PrismaClient) {
    this.redis = redis;
    this.prisma = prisma;
  }

  /**
   * Get content metrics
   */
  async getMetrics(period: string = '30d'): Promise<ContentAnalyticsResult> {
    const periodMs = PERIODS[period] || PERIODS['30d'];
    const since = new Date(Date.now() - periodMs);

    const [overview, performance, distribution, trending, quality] = await Promise.all([
      this.getOverview(since),
      this.getPerformance(since),
      this.getDistribution(since),
      this.getTrendingData(),
      this.getQuality(since),
    ]);

    return {
      period,
      timestamp: new Date(),
      overview,
      performance,
      distribution,
      trending,
      quality,
    };
  }

  /**
   * Get content overview
   */
  private async getOverview(since: Date): Promise<ContentOverview> {
    try {
      const days = Math.ceil((Date.now() - since.getTime()) / (24 * 60 * 60 * 1000));

      const [total, newPosts] = await Promise.all([
        this.prisma.post.count(),
        this.prisma.post.count({ where: { createdAt: { gte: since } } }),
      ]);

      const postsPerDay = days > 0 ? Math.round(newPosts / days) : 0;

      // Get average metrics from Redis
      const avgLength = parseFloat((await this.redis.get('metrics:avg_post_length')) || '150');
      const avgEngagement = parseFloat((await this.redis.get('metrics:avg_engagement_rate')) || '5');

      // Get media usage
      const mediaUsage = await this.getMediaUsage(since);

      return {
        totalPosts: total,
        newPosts,
        postsPerDay,
        avgPostLength: avgLength,
        avgEngagementRate: avgEngagement,
        mediaUsage,
      };
    } catch {
      return {
        totalPosts: 0,
        newPosts: 0,
        postsPerDay: 0,
        avgPostLength: 0,
        avgEngagementRate: 0,
        mediaUsage: {
          textOnly: 0,
          withImages: 0,
          withVideos: 0,
          withLinks: 0,
          withHashtags: 0,
          withMentions: 0,
        },
      };
    }
  }

  /**
   * Get media usage breakdown
   */
  private async getMediaUsage(since: Date): Promise<MediaUsage> {
    const data = await this.redis.hgetall('metrics:media_usage');

    return {
      textOnly: parseInt(data['textOnly'] || '0', 10),
      withImages: parseInt(data['withImages'] || '0', 10),
      withVideos: parseInt(data['withVideos'] || '0', 10),
      withLinks: parseInt(data['withLinks'] || '0', 10),
      withHashtags: parseInt(data['withHashtags'] || '0', 10),
      withMentions: parseInt(data['withMentions'] || '0', 10),
    };
  }

  /**
   * Get content performance
   */
  private async getPerformance(since: Date): Promise<ContentPerformance> {
    try {
      // Get average metrics
      const avgLikes = parseFloat((await this.redis.get('metrics:avg_likes_per_post')) || '10');
      const avgComments = parseFloat((await this.redis.get('metrics:avg_comments_per_post')) || '2');
      const avgShares = parseFloat((await this.redis.get('metrics:avg_shares_per_post')) || '1');
      const avgViews = parseFloat((await this.redis.get('metrics:avg_views_per_post')) || '100');

      // Calculate viral rate
      const viralThreshold = 1000;
      const viralPosts = parseInt((await this.redis.get('metrics:viral_posts')) || '0', 10);
      const totalPosts = await this.prisma.post.count({ where: { createdAt: { gte: since } } });
      const viralRate = totalPosts > 0 ? (viralPosts / totalPosts) * 100 : 0;

      // Get top performers
      const topPerformers = await this.getTopPerformers(10);
      const worstPerformers = await this.getWorstPerformers(10);

      return {
        avgLikes,
        avgComments,
        avgShares,
        avgViews,
        viralRate: Math.round(viralRate * 100) / 100,
        topPerformers,
        worstPerformers,
      };
    } catch {
      return {
        avgLikes: 0,
        avgComments: 0,
        avgShares: 0,
        avgViews: 0,
        viralRate: 0,
        topPerformers: [],
        worstPerformers: [],
      };
    }
  }

  /**
   * Get top performing posts
   */
  private async getTopPerformers(limit: number): Promise<PostPerformance[]> {
    const postIds = await this.redis.zrevrange('posts:trending', 0, limit - 1, 'WITHSCORES');
    const posts: PostPerformance[] = [];

    for (let i = 0; i < postIds.length; i += 2) {
      const postId = postIds[i];
      const engagement = parseFloat(postIds[i + 1] || '0');

      if (postId) {
        const data = await this.redis.hgetall(`post:metrics:${postId}`);
        posts.push({
          postId,
          userId: data['userId'] || '',
          content: data['content']?.slice(0, 100) || '',
          likes: parseInt(data['likes'] || '0', 10),
          comments: parseInt(data['comments'] || '0', 10),
          shares: parseInt(data['shares'] || '0', 10),
          views: parseInt(data['views'] || '0', 10),
          engagementRate: engagement,
          createdAt: new Date(data['createdAt'] || Date.now()),
        });
      }
    }

    return posts;
  }

  /**
   * Get worst performing posts
   */
  private async getWorstPerformers(limit: number): Promise<PostPerformance[]> {
    const postIds = await this.redis.zrange('posts:trending', 0, limit - 1, 'WITHSCORES');
    const posts: PostPerformance[] = [];

    for (let i = 0; i < postIds.length; i += 2) {
      const postId = postIds[i];
      const engagement = parseFloat(postIds[i + 1] || '0');

      if (postId) {
        const data = await this.redis.hgetall(`post:metrics:${postId}`);
        posts.push({
          postId,
          userId: data['userId'] || '',
          content: data['content']?.slice(0, 100) || '',
          likes: parseInt(data['likes'] || '0', 10),
          comments: parseInt(data['comments'] || '0', 10),
          shares: parseInt(data['shares'] || '0', 10),
          views: parseInt(data['views'] || '0', 10),
          engagementRate: engagement,
          createdAt: new Date(data['createdAt'] || Date.now()),
        });
      }
    }

    return posts;
  }

  /**
   * Get content distribution
   */
  private async getDistribution(since: Date): Promise<ContentDistribution> {
    try {
      // Get hourly distribution
      const byHour: Record<number, number> = {};
      for (let h = 0; h < 24; h++) {
        byHour[h] = parseInt((await this.redis.hget('content:dist:hour', h.toString())) || '0', 10);
      }

      // Get daily distribution
      const byDay: Record<string, number> = {};
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      for (const day of days) {
        byDay[day] = parseInt((await this.redis.hget('content:dist:day', day)) || '0', 10);
      }

      // Get length distribution
      const byLength = await this.getLengthDistribution();

      // Get type distribution
      const typeData = await this.redis.hgetall('content:dist:type');
      const byType: Record<string, number> = {};
      for (const [type, count] of Object.entries(typeData)) {
        byType[type] = parseInt(count, 10);
      }

      // Get topic distribution
      const topicData = await this.redis.hgetall('content:dist:topic');
      const byTopic: Record<string, number> = {};
      for (const [topic, count] of Object.entries(topicData)) {
        byTopic[topic] = parseInt(count, 10);
      }

      return {
        byHour,
        byDay,
        byLength,
        byType,
        byTopic,
      };
    } catch {
      return {
        byHour: {},
        byDay: {},
        byLength: [],
        byType: {},
        byTopic: {},
      };
    }
  }

  /**
   * Get length distribution
   */
  private async getLengthDistribution(): Promise<LengthBucket[]> {
    const buckets: LengthBucket[] = [];
    const total = await this.prisma.post.count();

    for (const bucket of LENGTH_BUCKETS) {
      const count = parseInt(
        (await this.redis.hget('content:dist:length', bucket.range)) || '0',
        10
      );

      buckets.push({
        range: bucket.range,
        min: bucket.min,
        max: bucket.max === Infinity ? -1 : bucket.max,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100 * 100) / 100 : 0,
      });
    }

    return buckets;
  }

  /**
   * Get trending content
   */
  async getTrending(limit: number = 50): Promise<TrendingContent> {
    return this.getTrendingData(limit);
  }

  /**
   * Get trending data
   */
  private async getTrendingData(limit: number = 20): Promise<TrendingContent> {
    try {
      // Get trending hashtags
      const hashtagData = await this.redis.zrevrange('hashtags:trending', 0, limit - 1, 'WITHSCORES');
      const hashtags: TrendingItem[] = [];
      for (let i = 0; i < hashtagData.length; i += 2) {
        const name = hashtagData[i];
        const count = parseFloat(hashtagData[i + 1] || '0');
        if (name) {
          const change = parseFloat((await this.redis.hget('hashtags:change', name)) || '0');
          const velocity = parseFloat((await this.redis.hget('hashtags:velocity', name)) || '0');
          hashtags.push({ name, count, change, velocity });
        }
      }

      // Get trending topics
      const topicData = await this.redis.zrevrange('topics:trending', 0, limit - 1, 'WITHSCORES');
      const topics: TrendingItem[] = [];
      for (let i = 0; i < topicData.length; i += 2) {
        const name = topicData[i];
        const count = parseFloat(topicData[i + 1] || '0');
        if (name) {
          topics.push({ name, count, change: 0, velocity: 0 });
        }
      }

      // Get trending posts
      const postData = await this.redis.zrevrange('posts:trending', 0, limit - 1, 'WITHSCORES');
      const posts: TrendingPost[] = [];
      for (let i = 0; i < postData.length; i += 2) {
        const postId = postData[i];
        const engagement = parseFloat(postData[i + 1] || '0');
        if (postId) {
          const content = (await this.redis.hget(`post:metrics:${postId}`, 'content')) || '';
          posts.push({
            postId,
            content: content.slice(0, 100),
            engagement,
            velocity: 0,
            peakTime: new Date(),
          });
        }
      }

      // Get trending mentions
      const mentionData = await this.redis.zrevrange('mentions:trending', 0, limit - 1, 'WITHSCORES');
      const mentions: TrendingItem[] = [];
      for (let i = 0; i < mentionData.length; i += 2) {
        const name = mentionData[i];
        const count = parseFloat(mentionData[i + 1] || '0');
        if (name) {
          mentions.push({ name, count, change: 0, velocity: 0 });
        }
      }

      return { hashtags, topics, posts, mentions };
    } catch {
      return { hashtags: [], topics: [], posts: [], mentions: [] };
    }
  }

  /**
   * Get content quality metrics
   */
  private async getQuality(since: Date): Promise<ContentQuality> {
    try {
      const avgReadability = parseFloat((await this.redis.get('metrics:avg_readability')) || '60');
      const avgSentiment = parseFloat((await this.redis.get('metrics:avg_sentiment')) || '0.5');
      const toxicityRate = parseFloat((await this.redis.get('metrics:toxicity_rate')) || '1');
      const spamRate = parseFloat((await this.redis.get('metrics:spam_rate')) || '2');
      const originalityScore = parseFloat((await this.redis.get('metrics:originality_score')) || '85');

      const categoryData = await this.redis.hgetall('content:categories');
      const contentCategories: Record<string, number> = {};
      for (const [category, count] of Object.entries(categoryData)) {
        contentCategories[category] = parseInt(count, 10);
      }

      return {
        avgReadability,
        avgSentiment,
        toxicityRate,
        spamRate,
        originalityScore,
        contentCategories,
      };
    } catch {
      return {
        avgReadability: 0,
        avgSentiment: 0,
        toxicityRate: 0,
        spamRate: 0,
        originalityScore: 0,
        contentCategories: {},
      };
    }
  }

  /**
   * Get single content performance
   */
  async getContentPerformance(contentId: string): Promise<SingleContentPerformance> {
    try {
      const data = await this.redis.hgetall(`post:metrics:${contentId}`);

      const metrics: PostMetrics = {
        impressions: parseInt(data['impressions'] || '0', 10),
        views: parseInt(data['views'] || '0', 10),
        likes: parseInt(data['likes'] || '0', 10),
        comments: parseInt(data['comments'] || '0', 10),
        shares: parseInt(data['shares'] || '0', 10),
        bookmarks: parseInt(data['bookmarks'] || '0', 10),
        clicks: parseInt(data['clicks'] || '0', 10),
        engagementRate: parseFloat(data['engagementRate'] || '0'),
        viralCoefficient: parseFloat(data['viralCoefficient'] || '0'),
      };

      // Get timeline data
      const timelineData = await this.redis.lrange(`post:timeline:${contentId}`, 0, 47);
      const timeline: TimelinePoint[] = timelineData.map((t) => JSON.parse(t));

      // Get audience breakdown
      const audienceData = await this.redis.hgetall(`post:audience:${contentId}`);
      const audience: AudienceBreakdown = {
        followers: parseInt(audienceData['followers'] || '0', 10),
        nonFollowers: parseInt(audienceData['nonFollowers'] || '0', 10),
        fromSearch: parseInt(audienceData['fromSearch'] || '0', 10),
        fromFeed: parseInt(audienceData['fromFeed'] || '0', 10),
        fromProfile: parseInt(audienceData['fromProfile'] || '0', 10),
        fromShare: parseInt(audienceData['fromShare'] || '0', 10),
      };

      // Get comparisons
      const userAvg = parseFloat((await this.redis.get(`user:avg_engagement:${data['userId']}`)) || '0');
      const platformAvg = parseFloat((await this.redis.get('metrics:platform_avg_engagement')) || '0');
      const percentile = parseFloat(data['percentile'] || '50');

      const comparisons: ContentComparisons = {
        vsUserAvg: userAvg > 0 ? ((metrics.engagementRate - userAvg) / userAvg) * 100 : 0,
        vsPlatformAvg: platformAvg > 0 ? ((metrics.engagementRate - platformAvg) / platformAvg) * 100 : 0,
        percentile,
      };

      return {
        postId: contentId,
        metrics,
        timeline,
        audience,
        comparisons,
      };
    } catch {
      return {
        postId: contentId,
        metrics: {
          impressions: 0,
          views: 0,
          likes: 0,
          comments: 0,
          shares: 0,
          bookmarks: 0,
          clicks: 0,
          engagementRate: 0,
          viralCoefficient: 0,
        },
        timeline: [],
        audience: {
          followers: 0,
          nonFollowers: 0,
          fromSearch: 0,
          fromFeed: 0,
          fromProfile: 0,
          fromShare: 0,
        },
        comparisons: {
          vsUserAvg: 0,
          vsPlatformAvg: 0,
          percentile: 0,
        },
      };
    }
  }
}

export default ContentAnalytics;
