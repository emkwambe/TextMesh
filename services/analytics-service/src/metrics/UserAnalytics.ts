// =================================
// TEXTMESH USER ANALYTICS
// User Behavior & Engagement Analysis
// =================================

import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';

// ============ USER ANALYTICS TYPES ============

export interface UserAnalyticsResult {
  period: string;
  timestamp: Date;
  overview: UserOverview;
  acquisition: AcquisitionMetrics;
  activation: ActivationMetrics;
  engagement: UserEngagementMetrics;
  retention: RetentionMetrics;
  segments: UserSegment[];
}

export interface UserOverview {
  totalUsers: number;
  activeUsers: number;
  newUsers: number;
  returningUsers: number;
  churnedUsers: number;
  avgSessionsPerUser: number;
  avgTimeSpent: number;
}

export interface AcquisitionMetrics {
  signups: number;
  signupsBySource: Record<string, number>;
  conversionRate: number;
  costPerAcquisition: number;
  organicVsPaid: { organic: number; paid: number };
}

export interface ActivationMetrics {
  activatedUsers: number;
  activationRate: number;
  timeToActivation: number;
  activationFunnel: FunnelStep[];
  dropoffPoints: DropoffPoint[];
}

export interface UserEngagementMetrics {
  dailyActiveUsers: number;
  weeklyActiveUsers: number;
  monthlyActiveUsers: number;
  dauWauRatio: number;
  dauMauRatio: number;
  avgActionsPerUser: number;
  engagementDistribution: EngagementBucket[];
}

export interface RetentionMetrics {
  day1: number;
  day7: number;
  day30: number;
  day90: number;
  cohortRetention: CohortData[];
  churnRate: number;
  churnReasons: Record<string, number>;
}

export interface UserSegment {
  name: string;
  count: number;
  percentage: number;
  characteristics: Record<string, unknown>;
  metrics: SegmentMetrics;
}

export interface SegmentMetrics {
  avgEngagement: number;
  avgRetention: number;
  avgRevenue: number;
  growthRate: number;
}

export interface FunnelStep {
  name: string;
  users: number;
  percentage: number;
  dropoff: number;
}

export interface DropoffPoint {
  step: string;
  reason: string;
  count: number;
  percentage: number;
}

export interface EngagementBucket {
  level: string;
  min: number;
  max: number;
  count: number;
  percentage: number;
}

export interface CohortData {
  cohort: string;
  size: number;
  retention: number[];
}

export interface CohortAnalysisParams {
  startDate: string;
  endDate: string;
  granularity: 'day' | 'week' | 'month';
}

export interface Demographics {
  age: Record<string, number>;
  gender: Record<string, number>;
  location: Record<string, number>;
  language: Record<string, number>;
  device: Record<string, number>;
  platform: Record<string, number>;
}

// ============ TIME PERIODS ============

const PERIODS: Record<string, number> = {
  '1d': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
  '1y': 365 * 24 * 60 * 60 * 1000,
};

// ============ USER SEGMENTS ============

const USER_SEGMENTS = [
  { name: 'power_users', minActions: 100, minDays: 20 },
  { name: 'regular_users', minActions: 30, minDays: 10 },
  { name: 'casual_users', minActions: 10, minDays: 3 },
  { name: 'dormant_users', minActions: 1, minDays: 0 },
  { name: 'inactive_users', minActions: 0, minDays: 0 },
];

// ============ ENGAGEMENT LEVELS ============

const ENGAGEMENT_LEVELS = [
  { level: 'highly_engaged', min: 50, max: Infinity },
  { level: 'engaged', min: 20, max: 49 },
  { level: 'moderate', min: 10, max: 19 },
  { level: 'low', min: 1, max: 9 },
  { level: 'inactive', min: 0, max: 0 },
];

// ============ USER ANALYTICS CLASS ============

export class UserAnalytics {
  private redis: Redis;
  private prisma: PrismaClient;

  constructor(redis: Redis, prisma: PrismaClient) {
    this.redis = redis;
    this.prisma = prisma;
  }

  /**
   * Get user metrics
   */
  async getMetrics(
    period: string = '30d',
    metric?: string
  ): Promise<UserAnalyticsResult | Partial<UserAnalyticsResult>> {
    const periodMs = PERIODS[period] || PERIODS['30d'];
    const since = new Date(Date.now() - periodMs);

    if (metric) {
      return this.getSpecificMetric(metric, since);
    }

    const [overview, acquisition, activation, engagement, retention, segments] =
      await Promise.all([
        this.getOverview(since),
        this.getAcquisitionMetrics(since),
        this.getActivationMetrics(since),
        this.getEngagementMetrics(since),
        this.getRetentionMetrics(since),
        this.getUserSegments(since),
      ]);

    return {
      period,
      timestamp: new Date(),
      overview,
      acquisition,
      activation,
      engagement,
      retention,
      segments,
    };
  }

  /**
   * Get specific metric
   */
  private async getSpecificMetric(
    metric: string,
    since: Date
  ): Promise<Partial<UserAnalyticsResult>> {
    switch (metric) {
      case 'overview':
        return { overview: await this.getOverview(since) };
      case 'acquisition':
        return { acquisition: await this.getAcquisitionMetrics(since) };
      case 'activation':
        return { activation: await this.getActivationMetrics(since) };
      case 'engagement':
        return { engagement: await this.getEngagementMetrics(since) };
      case 'retention':
        return { retention: await this.getRetentionMetrics(since) };
      case 'segments':
        return { segments: await this.getUserSegments(since) };
      default:
        return {};
    }
  }

  /**
   * Get user overview
   */
  private async getOverview(since: Date): Promise<UserOverview> {
    try {
      const now = new Date();
      const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const [total, newUsers, activeToday] = await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.count({ where: { createdAt: { gte: since } } }),
        this.redis.scard(`active:users:${dayAgo.toISOString().split('T')[0]}`),
      ]);

      // Get returning vs new users
      const returningUsers = await this.getReturningUsersCount(since);
      const churnedUsers = await this.getChurnedUsersCount(since);

      // Get session metrics from Redis
      const avgSessions = parseFloat(
        (await this.redis.get('metrics:avg_sessions_per_user')) || '2.5'
      );
      const avgTimeSpent = parseFloat(
        (await this.redis.get('metrics:avg_time_spent')) || '15'
      );

      return {
        totalUsers: total,
        activeUsers: activeToday,
        newUsers,
        returningUsers,
        churnedUsers,
        avgSessionsPerUser: avgSessions,
        avgTimeSpent,
      };
    } catch {
      return {
        totalUsers: 0,
        activeUsers: 0,
        newUsers: 0,
        returningUsers: 0,
        churnedUsers: 0,
        avgSessionsPerUser: 0,
        avgTimeSpent: 0,
      };
    }
  }

  /**
   * Get acquisition metrics
   */
  private async getAcquisitionMetrics(since: Date): Promise<AcquisitionMetrics> {
    try {
      const signups = await this.prisma.user.count({
        where: { createdAt: { gte: since } },
      });

      // Get signup sources from Redis
      const sourceData = await this.redis.hgetall('metrics:signup_sources');
      const signupsBySource: Record<string, number> = {};
      let organic = 0;
      let paid = 0;

      for (const [source, count] of Object.entries(sourceData)) {
        signupsBySource[source] = parseInt(count, 10);
        if (source.includes('organic') || source === 'direct' || source === 'referral') {
          organic += parseInt(count, 10);
        } else {
          paid += parseInt(count, 10);
        }
      }

      // Get conversion rate
      const visitors = parseInt(
        (await this.redis.get('metrics:unique_visitors')) || '0',
        10
      );
      const conversionRate = visitors > 0 ? (signups / visitors) * 100 : 0;

      // Get CPA from Redis
      const cpa = parseFloat((await this.redis.get('metrics:cpa')) || '0');

      return {
        signups,
        signupsBySource,
        conversionRate: Math.round(conversionRate * 100) / 100,
        costPerAcquisition: cpa,
        organicVsPaid: { organic, paid },
      };
    } catch {
      return {
        signups: 0,
        signupsBySource: {},
        conversionRate: 0,
        costPerAcquisition: 0,
        organicVsPaid: { organic: 0, paid: 0 },
      };
    }
  }

  /**
   * Get activation metrics
   */
  private async getActivationMetrics(since: Date): Promise<ActivationMetrics> {
    try {
      // Get activation data from Redis
      const activated = parseInt(
        (await this.redis.get('metrics:activated_users')) || '0',
        10
      );
      const totalNew = await this.prisma.user.count({
        where: { createdAt: { gte: since } },
      });

      const activationRate = totalNew > 0 ? (activated / totalNew) * 100 : 0;
      const timeToActivation = parseFloat(
        (await this.redis.get('metrics:avg_time_to_activation')) || '24'
      );

      // Build activation funnel
      const funnel = await this.buildActivationFunnel(since);
      const dropoffs = await this.getDropoffPoints(since);

      return {
        activatedUsers: activated,
        activationRate: Math.round(activationRate * 100) / 100,
        timeToActivation,
        activationFunnel: funnel,
        dropoffPoints: dropoffs,
      };
    } catch {
      return {
        activatedUsers: 0,
        activationRate: 0,
        timeToActivation: 0,
        activationFunnel: [],
        dropoffPoints: [],
      };
    }
  }

  /**
   * Get engagement metrics
   */
  private async getEngagementMetrics(since: Date): Promise<UserEngagementMetrics> {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    try {
      const [dau, wau, mau] = await Promise.all([
        this.getActiveUsersCount(dayAgo),
        this.getActiveUsersCount(weekAgo),
        this.getActiveUsersCount(monthAgo),
      ]);

      const dauWauRatio = wau > 0 ? (dau / wau) * 100 : 0;
      const dauMauRatio = mau > 0 ? (dau / mau) * 100 : 0;

      // Get actions per user
      const avgActions = parseFloat(
        (await this.redis.get('metrics:avg_actions_per_user')) || '15'
      );

      // Get engagement distribution
      const distribution = await this.getEngagementDistribution();

      return {
        dailyActiveUsers: dau,
        weeklyActiveUsers: wau,
        monthlyActiveUsers: mau,
        dauWauRatio: Math.round(dauWauRatio * 100) / 100,
        dauMauRatio: Math.round(dauMauRatio * 100) / 100,
        avgActionsPerUser: avgActions,
        engagementDistribution: distribution,
      };
    } catch {
      return {
        dailyActiveUsers: 0,
        weeklyActiveUsers: 0,
        monthlyActiveUsers: 0,
        dauWauRatio: 0,
        dauMauRatio: 0,
        avgActionsPerUser: 0,
        engagementDistribution: [],
      };
    }
  }

  /**
   * Get retention metrics
   */
  private async getRetentionMetrics(since: Date): Promise<RetentionMetrics> {
    try {
      // Get retention rates from Redis
      const day1 = parseFloat((await this.redis.get('metrics:retention_d1')) || '40');
      const day7 = parseFloat((await this.redis.get('metrics:retention_d7')) || '25');
      const day30 = parseFloat((await this.redis.get('metrics:retention_d30')) || '15');
      const day90 = parseFloat((await this.redis.get('metrics:retention_d90')) || '10');

      // Get cohort retention data
      const cohortRetention = await this.getCohortRetentionData(since);

      // Get churn data
      const churnRate = parseFloat((await this.redis.get('metrics:churn_rate')) || '5');
      const churnReasons = await this.getChurnReasons();

      return {
        day1,
        day7,
        day30,
        day90,
        cohortRetention,
        churnRate,
        churnReasons,
      };
    } catch {
      return {
        day1: 0,
        day7: 0,
        day30: 0,
        day90: 0,
        cohortRetention: [],
        churnRate: 0,
        churnReasons: {},
      };
    }
  }

  /**
   * Get user segments
   */
  private async getUserSegments(since: Date): Promise<UserSegment[]> {
    const segments: UserSegment[] = [];
    const totalUsers = await this.prisma.user.count();

    for (const segment of USER_SEGMENTS) {
      const count = await this.getSegmentCount(segment, since);
      const percentage = totalUsers > 0 ? (count / totalUsers) * 100 : 0;

      segments.push({
        name: segment.name,
        count,
        percentage: Math.round(percentage * 100) / 100,
        characteristics: {
          minActions: segment.minActions,
          minDays: segment.minDays,
        },
        metrics: await this.getSegmentMetrics(segment.name),
      });
    }

    return segments;
  }

  /**
   * Get cohort analysis
   */
  async getCohortAnalysis(params: CohortAnalysisParams): Promise<CohortData[]> {
    const { startDate, endDate, granularity } = params;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const cohorts: CohortData[] = [];

    let current = new Date(start);
    while (current < end) {
      const cohortKey = this.getCohortKey(current, granularity);
      const cohortData = await this.redis.hgetall(`cohort:${cohortKey}`);

      if (cohortData['size']) {
        const retention: number[] = [];
        for (let i = 0; i < 12; i++) {
          const key = `week_${i}`;
          retention.push(parseFloat(cohortData[key] || '0'));
        }

        cohorts.push({
          cohort: cohortKey,
          size: parseInt(cohortData['size'], 10),
          retention,
        });
      }

      // Advance to next period
      switch (granularity) {
        case 'day':
          current.setDate(current.getDate() + 1);
          break;
        case 'week':
          current.setDate(current.getDate() + 7);
          break;
        case 'month':
          current.setMonth(current.getMonth() + 1);
          break;
      }
    }

    return cohorts;
  }

  /**
   * Get demographics
   */
  async getDemographics(): Promise<Demographics> {
    try {
      const [age, gender, location, language, device, platform] = await Promise.all([
        this.redis.hgetall('demographics:age'),
        this.redis.hgetall('demographics:gender'),
        this.redis.hgetall('demographics:location'),
        this.redis.hgetall('demographics:language'),
        this.redis.hgetall('demographics:device'),
        this.redis.hgetall('demographics:platform'),
      ]);

      return {
        age: this.parseHashToNumbers(age),
        gender: this.parseHashToNumbers(gender),
        location: this.parseHashToNumbers(location),
        language: this.parseHashToNumbers(language),
        device: this.parseHashToNumbers(device),
        platform: this.parseHashToNumbers(platform),
      };
    } catch {
      return {
        age: {},
        gender: {},
        location: {},
        language: {},
        device: {},
        platform: {},
      };
    }
  }

  // ============ HELPER METHODS ============

  private async getReturningUsersCount(since: Date): Promise<number> {
    const key = `metrics:returning_users:${since.toISOString().split('T')[0]}`;
    return parseInt((await this.redis.get(key)) || '0', 10);
  }

  private async getChurnedUsersCount(since: Date): Promise<number> {
    const key = `metrics:churned_users:${since.toISOString().split('T')[0]}`;
    return parseInt((await this.redis.get(key)) || '0', 10);
  }

  private async getActiveUsersCount(since: Date): Promise<number> {
    const dateStr = since.toISOString().split('T')[0];
    return this.redis.scard(`active:users:${dateStr}`);
  }

  private async buildActivationFunnel(since: Date): Promise<FunnelStep[]> {
    const steps = [
      'signup',
      'profile_complete',
      'first_follow',
      'first_post',
      'first_engagement',
      'activated',
    ];

    const funnel: FunnelStep[] = [];
    let previousCount = 0;

    for (const step of steps) {
      const count = parseInt(
        (await this.redis.get(`funnel:activation:${step}`)) || '0',
        10
      );
      const percentage = previousCount > 0 ? (count / previousCount) * 100 : 100;
      const dropoff = previousCount > 0 ? ((previousCount - count) / previousCount) * 100 : 0;

      funnel.push({
        name: step,
        users: count,
        percentage: Math.round(percentage * 100) / 100,
        dropoff: Math.round(dropoff * 100) / 100,
      });

      previousCount = count || previousCount;
    }

    return funnel;
  }

  private async getDropoffPoints(since: Date): Promise<DropoffPoint[]> {
    const data = await this.redis.hgetall('metrics:dropoff_points');
    const dropoffs: DropoffPoint[] = [];
    const total = parseInt((await this.redis.get('metrics:total_signups')) || '1', 10);

    for (const [key, count] of Object.entries(data)) {
      const [step, reason] = key.split(':');
      const countNum = parseInt(count, 10);

      dropoffs.push({
        step: step || 'unknown',
        reason: reason || 'unknown',
        count: countNum,
        percentage: Math.round((countNum / total) * 100 * 100) / 100,
      });
    }

    return dropoffs.sort((a, b) => b.count - a.count).slice(0, 10);
  }

  private async getEngagementDistribution(): Promise<EngagementBucket[]> {
    const distribution: EngagementBucket[] = [];
    const total = await this.prisma.user.count();

    for (const level of ENGAGEMENT_LEVELS) {
      const count = parseInt(
        (await this.redis.get(`engagement:level:${level.level}`)) || '0',
        10
      );

      distribution.push({
        level: level.level,
        min: level.min,
        max: level.max === Infinity ? -1 : level.max,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100 * 100) / 100 : 0,
      });
    }

    return distribution;
  }

  private async getCohortRetentionData(since: Date): Promise<CohortData[]> {
    const cohorts: CohortData[] = [];
    const weeks = 8;

    for (let i = 0; i < weeks; i++) {
      const weekStart = new Date(since.getTime() + i * 7 * 24 * 60 * 60 * 1000);
      const cohortKey = `week_${weekStart.toISOString().split('T')[0]}`;
      const data = await this.redis.hgetall(`cohort:retention:${cohortKey}`);

      if (data['size']) {
        const retention: number[] = [];
        for (let j = 0; j <= weeks - i; j++) {
          retention.push(parseFloat(data[`week_${j}`] || '0'));
        }

        cohorts.push({
          cohort: cohortKey,
          size: parseInt(data['size'], 10),
          retention,
        });
      }
    }

    return cohorts;
  }

  private async getChurnReasons(): Promise<Record<string, number>> {
    const data = await this.redis.hgetall('metrics:churn_reasons');
    const reasons: Record<string, number> = {};

    for (const [reason, count] of Object.entries(data)) {
      reasons[reason] = parseInt(count, 10);
    }

    return reasons;
  }

  private async getSegmentCount(
    segment: { name: string; minActions: number; minDays: number },
    since: Date
  ): Promise<number> {
    const key = `segment:count:${segment.name}`;
    return parseInt((await this.redis.get(key)) || '0', 10);
  }

  private async getSegmentMetrics(segmentName: string): Promise<SegmentMetrics> {
    const data = await this.redis.hgetall(`segment:metrics:${segmentName}`);

    return {
      avgEngagement: parseFloat(data['avgEngagement'] || '0'),
      avgRetention: parseFloat(data['avgRetention'] || '0'),
      avgRevenue: parseFloat(data['avgRevenue'] || '0'),
      growthRate: parseFloat(data['growthRate'] || '0'),
    };
  }

  private getCohortKey(date: Date, granularity: 'day' | 'week' | 'month'): string {
    const iso = date.toISOString();

    switch (granularity) {
      case 'day':
        return iso.split('T')[0];
      case 'week':
        const weekNum = Math.ceil(date.getDate() / 7);
        return `${iso.slice(0, 7)}-W${weekNum}`;
      case 'month':
        return iso.slice(0, 7);
      default:
        return iso.split('T')[0];
    }
  }

  private parseHashToNumbers(hash: Record<string, string>): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [key, value] of Object.entries(hash)) {
      result[key] = parseInt(value, 10);
    }
    return result;
  }
}

export default UserAnalytics;
