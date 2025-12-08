// =================================
// TEXTMESH PLATFORM METRICS
// Core Platform Analytics
// =================================

import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';

// ============ METRICS TYPES ============

export interface PlatformOverview {
  period: string;
  timestamp: Date;
  users: UserMetrics;
  content: ContentMetrics;
  engagement: EngagementMetrics;
  growth: GrowthMetrics;
  health: PlatformHealth;
}

export interface UserMetrics {
  totalUsers: number;
  activeUsers: number;
  newUsers: number;
  dau: number;
  wau: number;
  mau: number;
  dauMauRatio: number;
}

export interface ContentMetrics {
  totalPosts: number;
  newPosts: number;
  postsPerUser: number;
  averagePostLength: number;
  mediaPercentage: number;
}

export interface EngagementMetrics {
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  engagementRate: number;
  averageSessionDuration: number;
  sessionsPerUser: number;
}

export interface GrowthMetrics {
  userGrowthRate: number;
  contentGrowthRate: number;
  engagementGrowthRate: number;
  churnRate: number;
  retentionRate: number;
}

export interface PlatformHealth {
  status: 'healthy' | 'degraded' | 'critical';
  uptime: number;
  errorRate: number;
  latency: LatencyMetrics;
  serviceStatus: Record<string, ServiceStatus>;
}

export interface LatencyMetrics {
  p50: number;
  p95: number;
  p99: number;
  average: number;
}

export interface ServiceStatus {
  name: string;
  status: 'up' | 'down' | 'degraded';
  lastCheck: Date;
  responseTime: number;
}

// ============ TIME PERIODS ============

const PERIODS = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
} as const;

// ============ PLATFORM METRICS CLASS ============

export class PlatformMetrics {
  private redis: Redis;
  private prisma: PrismaClient;

  constructor(redis: Redis, prisma: PrismaClient) {
    this.redis = redis;
    this.prisma = prisma;
  }

  /**
   * Get platform overview
   */
  async getOverview(period: string = '24h'): Promise<PlatformOverview> {
    const periodMs = PERIODS[period as keyof typeof PERIODS] || PERIODS['24h'];
    const startDate = new Date(Date.now() - periodMs);

    const [users, content, engagement, growth, health] = await Promise.all([
      this.getUserMetrics(startDate),
      this.getContentMetrics(startDate),
      this.getEngagementMetrics(startDate),
      this.getGrowthMetrics(startDate),
      this.getPlatformHealth(),
    ]);

    return {
      period,
      timestamp: new Date(),
      users,
      content,
      engagement,
      growth,
      health,
    };
  }

  /**
   * Get user metrics
   */
  async getUserMetrics(since: Date): Promise<UserMetrics> {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    try {
      const [total, newUsers, dau, wau, mau] = await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.count({
          where: { createdAt: { gte: since } },
        }),
        this.getActiveUsers(dayAgo),
        this.getActiveUsers(weekAgo),
        this.getActiveUsers(monthAgo),
      ]);

      const dauMauRatio = mau > 0 ? (dau / mau) * 100 : 0;

      return {
        totalUsers: total,
        activeUsers: dau,
        newUsers,
        dau,
        wau,
        mau,
        dauMauRatio: Math.round(dauMauRatio * 100) / 100,
      };
    } catch {
      return {
        totalUsers: 0,
        activeUsers: 0,
        newUsers: 0,
        dau: 0,
        wau: 0,
        mau: 0,
        dauMauRatio: 0,
      };
    }
  }

  /**
   * Get content metrics
   */
  async getContentMetrics(since: Date): Promise<ContentMetrics> {
    try {
      const [total, newPosts, userCount] = await Promise.all([
        this.prisma.post.count(),
        this.prisma.post.count({
          where: { createdAt: { gte: since } },
        }),
        this.prisma.user.count(),
      ]);

      // Get average post length from Redis cache
      const avgLength = await this.redis.get('metrics:avg_post_length');
      const mediaPercentage = await this.redis.get('metrics:media_percentage');

      return {
        totalPosts: total,
        newPosts,
        postsPerUser: userCount > 0 ? Math.round((total / userCount) * 100) / 100 : 0,
        averagePostLength: parseInt(avgLength || '150', 10),
        mediaPercentage: parseFloat(mediaPercentage || '25'),
      };
    } catch {
      return {
        totalPosts: 0,
        newPosts: 0,
        postsPerUser: 0,
        averagePostLength: 0,
        mediaPercentage: 0,
      };
    }
  }

  /**
   * Get engagement metrics
   */
  async getEngagementMetrics(since: Date): Promise<EngagementMetrics> {
    try {
      const [likes, comments, shares] = await Promise.all([
        this.prisma.like.count({ where: { createdAt: { gte: since } } }),
        this.prisma.comment.count({ where: { createdAt: { gte: since } } }),
        this.prisma.repost.count({ where: { createdAt: { gte: since } } }),
      ]);

      // Get session metrics from Redis
      const avgSession = await this.redis.get('metrics:avg_session_duration');
      const sessionsPerUser = await this.redis.get('metrics:sessions_per_user');

      // Calculate engagement rate
      const posts = await this.prisma.post.count({ where: { createdAt: { gte: since } } });
      const engagementRate = posts > 0 ? ((likes + comments + shares) / posts) * 100 : 0;

      return {
        totalLikes: likes,
        totalComments: comments,
        totalShares: shares,
        engagementRate: Math.round(engagementRate * 100) / 100,
        averageSessionDuration: parseInt(avgSession || '180', 10),
        sessionsPerUser: parseFloat(sessionsPerUser || '2.5'),
      };
    } catch {
      return {
        totalLikes: 0,
        totalComments: 0,
        totalShares: 0,
        engagementRate: 0,
        averageSessionDuration: 0,
        sessionsPerUser: 0,
      };
    }
  }

  /**
   * Get growth metrics
   */
  async getGrowthMetrics(since: Date): Promise<GrowthMetrics> {
    const periodMs = Date.now() - since.getTime();
    const previousPeriodStart = new Date(since.getTime() - periodMs);

    try {
      // Current period counts
      const [currentUsers, currentPosts, currentEngagement] = await Promise.all([
        this.prisma.user.count({ where: { createdAt: { gte: since } } }),
        this.prisma.post.count({ where: { createdAt: { gte: since } } }),
        this.getTotalEngagement(since),
      ]);

      // Previous period counts
      const [previousUsers, previousPosts, previousEngagement] = await Promise.all([
        this.prisma.user.count({
          where: { createdAt: { gte: previousPeriodStart, lt: since } },
        }),
        this.prisma.post.count({
          where: { createdAt: { gte: previousPeriodStart, lt: since } },
        }),
        this.getTotalEngagement(previousPeriodStart, since),
      ]);

      // Calculate growth rates
      const userGrowthRate = previousUsers > 0
        ? ((currentUsers - previousUsers) / previousUsers) * 100
        : 0;

      const contentGrowthRate = previousPosts > 0
        ? ((currentPosts - previousPosts) / previousPosts) * 100
        : 0;

      const engagementGrowthRate = previousEngagement > 0
        ? ((currentEngagement - previousEngagement) / previousEngagement) * 100
        : 0;

      // Get churn and retention from Redis
      const churnRate = parseFloat((await this.redis.get('metrics:churn_rate')) || '5');
      const retentionRate = 100 - churnRate;

      return {
        userGrowthRate: Math.round(userGrowthRate * 100) / 100,
        contentGrowthRate: Math.round(contentGrowthRate * 100) / 100,
        engagementGrowthRate: Math.round(engagementGrowthRate * 100) / 100,
        churnRate,
        retentionRate,
      };
    } catch {
      return {
        userGrowthRate: 0,
        contentGrowthRate: 0,
        engagementGrowthRate: 0,
        churnRate: 0,
        retentionRate: 0,
      };
    }
  }

  /**
   * Get platform health
   */
  async getPlatformHealth(): Promise<PlatformHealth> {
    // Get service status from Redis
    const services = ['api', 'feed', 'media', 'notification', 'moderation'];
    const serviceStatus: Record<string, ServiceStatus> = {};

    for (const service of services) {
      const status = await this.redis.hgetall(`service:status:${service}`);
      serviceStatus[service] = {
        name: service,
        status: (status['status'] as 'up' | 'down' | 'degraded') || 'up',
        lastCheck: new Date(status['lastCheck'] || Date.now()),
        responseTime: parseInt(status['responseTime'] || '50', 10),
      };
    }

    // Get latency metrics
    const latency = await this.getLatencyMetrics();

    // Get error rate
    const errorRate = parseFloat((await this.redis.get('metrics:error_rate')) || '0.1');

    // Determine overall status
    const downServices = Object.values(serviceStatus).filter((s) => s.status === 'down').length;
    const degradedServices = Object.values(serviceStatus).filter((s) => s.status === 'degraded').length;

    let status: 'healthy' | 'degraded' | 'critical' = 'healthy';
    if (downServices > 0 || errorRate > 5) {
      status = 'critical';
    } else if (degradedServices > 0 || errorRate > 1) {
      status = 'degraded';
    }

    // Get uptime
    const uptimeMs = Date.now() - parseInt((await this.redis.get('metrics:start_time')) || Date.now().toString(), 10);
    const uptime = Math.round((uptimeMs / (1000 * 60 * 60)) * 100) / 100; // hours

    return {
      status,
      uptime,
      errorRate,
      latency,
      serviceStatus,
    };
  }

  /**
   * Get time series data
   */
  async getTimeSeries(
    metric: string,
    period: string,
    granularity: 'hour' | 'day' | 'week'
  ): Promise<Array<{ timestamp: Date; value: number }>> {
    const periodMs = PERIODS[period as keyof typeof PERIODS] || PERIODS['24h'];
    const startDate = new Date(Date.now() - periodMs);

    const key = `timeseries:${metric}:${granularity}`;
    const data = await this.redis.zrangebyscore(
      key,
      startDate.getTime(),
      Date.now(),
      'WITHSCORES'
    );

    const results: Array<{ timestamp: Date; value: number }> = [];
    for (let i = 0; i < data.length; i += 2) {
      results.push({
        value: parseFloat(data[i] || '0'),
        timestamp: new Date(parseInt(data[i + 1] || '0', 10)),
      });
    }

    return results;
  }

  /**
   * Record metric
   */
  async recordMetric(
    metric: string,
    value: number,
    timestamp: Date = new Date()
  ): Promise<void> {
    // Store in time series
    await this.redis.zadd(
      `timeseries:${metric}:hour`,
      timestamp.getTime(),
      value.toString()
    );

    // Update aggregates
    await this.redis.set(`metrics:${metric}:latest`, value.toString());
    await this.redis.incr(`metrics:${metric}:count`);
  }

  // ============ HELPER METHODS ============

  private async getActiveUsers(since: Date): Promise<number> {
    // Count unique active users since the given date
    const dateStr = since.toISOString().split('T')[0];
    const activeSet = await this.redis.scard(`active:users:${dateStr}`);

    // For longer periods, aggregate multiple days
    const now = new Date();
    let total = activeSet;
    let currentDate = new Date(since);

    while (currentDate < now) {
      currentDate.setDate(currentDate.getDate() + 1);
      const dayStr = currentDate.toISOString().split('T')[0];
      const dayActive = await this.redis.scard(`active:users:${dayStr}`);
      total = Math.max(total, dayActive);
    }

    return total;
  }

  private async getTotalEngagement(since: Date, until?: Date): Promise<number> {
    try {
      const [likes, comments, shares] = await Promise.all([
        this.prisma.like.count({
          where: {
            createdAt: {
              gte: since,
              ...(until && { lt: until }),
            },
          },
        }),
        this.prisma.comment.count({
          where: {
            createdAt: {
              gte: since,
              ...(until && { lt: until }),
            },
          },
        }),
        this.prisma.repost.count({
          where: {
            createdAt: {
              gte: since,
              ...(until && { lt: until }),
            },
          },
        }),
      ]);

      return likes + comments + shares;
    } catch {
      return 0;
    }
  }

  private async getLatencyMetrics(): Promise<LatencyMetrics> {
    const p50 = await this.redis.get('metrics:latency:p50');
    const p95 = await this.redis.get('metrics:latency:p95');
    const p99 = await this.redis.get('metrics:latency:p99');
    const avg = await this.redis.get('metrics:latency:avg');

    return {
      p50: parseInt(p50 || '50', 10),
      p95: parseInt(p95 || '150', 10),
      p99: parseInt(p99 || '300', 10),
      average: parseInt(avg || '75', 10),
    };
  }
}

export default PlatformMetrics;
