// =================================
// TEXTMESH GROWTH ANALYTICS
// Growth & Retention Analysis
// =================================

import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';

// ============ GROWTH TYPES ============

export interface GrowthAnalyticsResult {
  period: string;
  timestamp: Date;
  overview: GrowthOverview;
  acquisition: AcquisitionGrowth;
  activation: ActivationGrowth;
  retention: RetentionGrowth;
  revenue: RevenueGrowth;
  referral: ReferralGrowth;
}

export interface GrowthOverview {
  totalGrowthRate: number;
  userGrowthRate: number;
  engagementGrowthRate: number;
  contentGrowthRate: number;
  weekOverWeek: number;
  monthOverMonth: number;
  yearOverYear: number;
  projectedGrowth: number;
}

export interface AcquisitionGrowth {
  newUsers: number;
  growthRate: number;
  byChannel: ChannelMetrics[];
  conversionRates: ConversionMetrics;
  costMetrics: CostMetrics;
}

export interface ChannelMetrics {
  channel: string;
  users: number;
  percentage: number;
  conversionRate: number;
  costPerAcquisition: number;
  trend: 'up' | 'down' | 'stable';
}

export interface ConversionMetrics {
  visitToSignup: number;
  signupToActivation: number;
  activationToRetention: number;
  overallFunnel: number;
}

export interface CostMetrics {
  totalSpend: number;
  cpa: number;
  cac: number;
  ltv: number;
  ltvCacRatio: number;
}

export interface ActivationGrowth {
  activatedUsers: number;
  activationRate: number;
  timeToActivation: number;
  activationByFeature: Record<string, number>;
  ahamoments: AhaMoment[];
}

export interface AhaMoment {
  event: string;
  impactOnRetention: number;
  usersReached: number;
  avgTimeToReach: number;
}

export interface RetentionGrowth {
  retentionRate: number;
  churnRate: number;
  cohortRetention: CohortRetention[];
  retentionCurve: RetentionPoint[];
  churnPrediction: ChurnPrediction;
}

export interface CohortRetention {
  cohort: string;
  size: number;
  week1: number;
  week2: number;
  week4: number;
  week8: number;
  week12: number;
}

export interface RetentionPoint {
  day: number;
  retention: number;
  benchmark: number;
}

export interface ChurnPrediction {
  atRiskUsers: number;
  predictedChurn: number;
  topChurnReasons: ChurnReason[];
}

export interface ChurnReason {
  reason: string;
  count: number;
  percentage: number;
}

export interface RevenueGrowth {
  mrr: number;
  arr: number;
  arpu: number;
  arppu: number;
  growthRate: number;
  revenueByPlan: Record<string, number>;
  upgrades: number;
  downgrades: number;
  netRevenue: number;
}

export interface ReferralGrowth {
  referrals: number;
  referralRate: number;
  viralCoefficient: number;
  avgReferralsPerUser: number;
  topReferrers: ReferrerMetrics[];
  referralFunnel: ReferralFunnel;
}

export interface ReferrerMetrics {
  userId: string;
  referrals: number;
  successRate: number;
  tier: string;
}

export interface ReferralFunnel {
  invitesSent: number;
  invitesOpened: number;
  signups: number;
  activations: number;
  conversionRate: number;
}

export interface FunnelAnalysis {
  funnelId: string;
  name: string;
  steps: FunnelStep[];
  overallConversion: number;
  dropoffAnalysis: DropoffAnalysis[];
}

export interface FunnelStep {
  name: string;
  users: number;
  conversionRate: number;
  dropoffRate: number;
  avgTimeInStep: number;
}

export interface DropoffAnalysis {
  fromStep: string;
  toStep: string;
  dropoffRate: number;
  topReasons: string[];
}

export interface RetentionAnalysis {
  period: string;
  overall: number;
  bySegment: SegmentRetention[];
  byActivity: ActivityRetention[];
  trends: RetentionTrend[];
}

export interface SegmentRetention {
  segment: string;
  retention: number;
  size: number;
  trend: 'up' | 'down' | 'stable';
}

export interface ActivityRetention {
  activity: string;
  retentionImpact: number;
  usersWithActivity: number;
  retentionWithActivity: number;
  retentionWithout: number;
}

export interface RetentionTrend {
  period: string;
  retention: number;
  change: number;
}

// ============ TIME PERIODS ============

const PERIODS: Record<string, number> = {
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
  '1y': 365 * 24 * 60 * 60 * 1000,
};

// ============ FUNNEL DEFINITIONS ============

const FUNNELS: Record<string, string[]> = {
  signup: ['landing', 'signup_start', 'email_entered', 'password_set', 'profile_created', 'activated'],
  engagement: ['view_feed', 'interact_post', 'create_post', 'follow_user', 'daily_return'],
  conversion: ['free_user', 'view_pricing', 'start_trial', 'enter_payment', 'subscribe'],
};

// ============ GROWTH ANALYTICS CLASS ============

export class GrowthAnalytics {
  private redis: Redis;
  private prisma: PrismaClient;

  constructor(redis: Redis, prisma: PrismaClient) {
    this.redis = redis;
    this.prisma = prisma;
  }

  /**
   * Get growth metrics
   */
  async getMetrics(period: string = '30d'): Promise<GrowthAnalyticsResult> {
    const periodMs = PERIODS[period] || PERIODS['30d'];
    const since = new Date(Date.now() - periodMs);

    const [overview, acquisition, activation, retention, revenue, referral] = await Promise.all([
      this.getOverview(since, period),
      this.getAcquisitionGrowth(since),
      this.getActivationGrowth(since),
      this.getRetentionGrowth(since),
      this.getRevenueGrowth(since),
      this.getReferralGrowth(since),
    ]);

    return {
      period,
      timestamp: new Date(),
      overview,
      acquisition,
      activation,
      retention,
      revenue,
      referral,
    };
  }

  /**
   * Get growth overview
   */
  private async getOverview(since: Date, period: string): Promise<GrowthOverview> {
    try {
      const periodMs = PERIODS[period] || PERIODS['30d'];
      const previousStart = new Date(since.getTime() - periodMs);

      // Current period
      const [currentUsers, currentPosts, currentEngagements] = await Promise.all([
        this.prisma.user.count({ where: { createdAt: { gte: since } } }),
        this.prisma.post.count({ where: { createdAt: { gte: since } } }),
        this.getTotalEngagements(since),
      ]);

      // Previous period
      const [previousUsers, previousPosts, previousEngagements] = await Promise.all([
        this.prisma.user.count({
          where: { createdAt: { gte: previousStart, lt: since } },
        }),
        this.prisma.post.count({
          where: { createdAt: { gte: previousStart, lt: since } },
        }),
        this.getTotalEngagements(previousStart, since),
      ]);

      const userGrowthRate = previousUsers > 0 ? ((currentUsers - previousUsers) / previousUsers) * 100 : 0;
      const engagementGrowthRate =
        previousEngagements > 0 ? ((currentEngagements - previousEngagements) / previousEngagements) * 100 : 0;
      const contentGrowthRate = previousPosts > 0 ? ((currentPosts - previousPosts) / previousPosts) * 100 : 0;
      const totalGrowthRate = (userGrowthRate + engagementGrowthRate + contentGrowthRate) / 3;

      // Get period comparisons
      const wow = parseFloat((await this.redis.get('growth:wow')) || '0');
      const mom = parseFloat((await this.redis.get('growth:mom')) || '0');
      const yoy = parseFloat((await this.redis.get('growth:yoy')) || '0');
      const projected = parseFloat((await this.redis.get('growth:projected')) || '0');

      return {
        totalGrowthRate: Math.round(totalGrowthRate * 100) / 100,
        userGrowthRate: Math.round(userGrowthRate * 100) / 100,
        engagementGrowthRate: Math.round(engagementGrowthRate * 100) / 100,
        contentGrowthRate: Math.round(contentGrowthRate * 100) / 100,
        weekOverWeek: wow,
        monthOverMonth: mom,
        yearOverYear: yoy,
        projectedGrowth: projected,
      };
    } catch {
      return {
        totalGrowthRate: 0,
        userGrowthRate: 0,
        engagementGrowthRate: 0,
        contentGrowthRate: 0,
        weekOverWeek: 0,
        monthOverMonth: 0,
        yearOverYear: 0,
        projectedGrowth: 0,
      };
    }
  }

  /**
   * Get acquisition growth
   */
  private async getAcquisitionGrowth(since: Date): Promise<AcquisitionGrowth> {
    try {
      const newUsers = await this.prisma.user.count({ where: { createdAt: { gte: since } } });
      const previousCount = parseInt((await this.redis.get('metrics:previous_new_users')) || '0', 10);
      const growthRate = previousCount > 0 ? ((newUsers - previousCount) / previousCount) * 100 : 0;

      // Get channel metrics
      const channels = ['organic', 'paid_search', 'social', 'referral', 'direct', 'email'];
      const byChannel: ChannelMetrics[] = [];

      for (const channel of channels) {
        const data = await this.redis.hgetall(`acquisition:channel:${channel}`);
        byChannel.push({
          channel,
          users: parseInt(data['users'] || '0', 10),
          percentage: parseFloat(data['percentage'] || '0'),
          conversionRate: parseFloat(data['conversionRate'] || '0'),
          costPerAcquisition: parseFloat(data['cpa'] || '0'),
          trend: (data['trend'] as 'up' | 'down' | 'stable') || 'stable',
        });
      }

      // Get conversion rates
      const conversionRates: ConversionMetrics = {
        visitToSignup: parseFloat((await this.redis.get('conversion:visit_to_signup')) || '5'),
        signupToActivation: parseFloat((await this.redis.get('conversion:signup_to_activation')) || '40'),
        activationToRetention: parseFloat((await this.redis.get('conversion:activation_to_retention')) || '60'),
        overallFunnel: parseFloat((await this.redis.get('conversion:overall')) || '1.2'),
      };

      // Get cost metrics
      const costMetrics: CostMetrics = {
        totalSpend: parseFloat((await this.redis.get('cost:total_spend')) || '0'),
        cpa: parseFloat((await this.redis.get('cost:cpa')) || '0'),
        cac: parseFloat((await this.redis.get('cost:cac')) || '0'),
        ltv: parseFloat((await this.redis.get('cost:ltv')) || '0'),
        ltvCacRatio: parseFloat((await this.redis.get('cost:ltv_cac_ratio')) || '0'),
      };

      return {
        newUsers,
        growthRate: Math.round(growthRate * 100) / 100,
        byChannel,
        conversionRates,
        costMetrics,
      };
    } catch {
      return {
        newUsers: 0,
        growthRate: 0,
        byChannel: [],
        conversionRates: {
          visitToSignup: 0,
          signupToActivation: 0,
          activationToRetention: 0,
          overallFunnel: 0,
        },
        costMetrics: {
          totalSpend: 0,
          cpa: 0,
          cac: 0,
          ltv: 0,
          ltvCacRatio: 0,
        },
      };
    }
  }

  /**
   * Get activation growth
   */
  private async getActivationGrowth(since: Date): Promise<ActivationGrowth> {
    try {
      const activatedUsers = parseInt((await this.redis.get('metrics:activated_users')) || '0', 10);
      const totalNew = await this.prisma.user.count({ where: { createdAt: { gte: since } } });
      const activationRate = totalNew > 0 ? (activatedUsers / totalNew) * 100 : 0;
      const timeToActivation = parseFloat((await this.redis.get('metrics:time_to_activation')) || '24');

      // Get activation by feature
      const featureData = await this.redis.hgetall('activation:by_feature');
      const activationByFeature: Record<string, number> = {};
      for (const [feature, count] of Object.entries(featureData)) {
        activationByFeature[feature] = parseInt(count, 10);
      }

      // Get aha moments
      const ahaMoments: AhaMoment[] = [
        {
          event: 'first_follow',
          impactOnRetention: 25,
          usersReached: parseInt((await this.redis.get('aha:first_follow')) || '0', 10),
          avgTimeToReach: 2,
        },
        {
          event: 'first_post',
          impactOnRetention: 40,
          usersReached: parseInt((await this.redis.get('aha:first_post')) || '0', 10),
          avgTimeToReach: 5,
        },
        {
          event: 'first_like_received',
          impactOnRetention: 35,
          usersReached: parseInt((await this.redis.get('aha:first_like_received')) || '0', 10),
          avgTimeToReach: 8,
        },
        {
          event: 'five_followers',
          impactOnRetention: 50,
          usersReached: parseInt((await this.redis.get('aha:five_followers')) || '0', 10),
          avgTimeToReach: 14,
        },
      ];

      return {
        activatedUsers,
        activationRate: Math.round(activationRate * 100) / 100,
        timeToActivation,
        activationByFeature,
        ahamoments: ahaMoments,
      };
    } catch {
      return {
        activatedUsers: 0,
        activationRate: 0,
        timeToActivation: 0,
        activationByFeature: {},
        ahamoments: [],
      };
    }
  }

  /**
   * Get retention growth
   */
  private async getRetentionGrowth(since: Date): Promise<RetentionGrowth> {
    try {
      const retentionRate = parseFloat((await this.redis.get('metrics:retention_rate')) || '40');
      const churnRate = 100 - retentionRate;

      // Get cohort retention
      const cohortRetention = await this.getCohortRetention();

      // Get retention curve
      const retentionCurve = await this.getRetentionCurve();

      // Get churn prediction
      const churnPrediction = await this.getChurnPrediction();

      return {
        retentionRate,
        churnRate,
        cohortRetention,
        retentionCurve,
        churnPrediction,
      };
    } catch {
      return {
        retentionRate: 0,
        churnRate: 0,
        cohortRetention: [],
        retentionCurve: [],
        churnPrediction: {
          atRiskUsers: 0,
          predictedChurn: 0,
          topChurnReasons: [],
        },
      };
    }
  }

  /**
   * Get cohort retention data
   */
  private async getCohortRetention(): Promise<CohortRetention[]> {
    const cohorts: CohortRetention[] = [];
    const weeks = 8;

    for (let i = 0; i < weeks; i++) {
      const weekStart = new Date(Date.now() - (i + 1) * 7 * 24 * 60 * 60 * 1000);
      const cohortKey = `cohort:${weekStart.toISOString().split('T')[0]}`;
      const data = await this.redis.hgetall(cohortKey);

      if (data['size']) {
        cohorts.push({
          cohort: weekStart.toISOString().split('T')[0],
          size: parseInt(data['size'], 10),
          week1: parseFloat(data['week1'] || '0'),
          week2: parseFloat(data['week2'] || '0'),
          week4: parseFloat(data['week4'] || '0'),
          week8: parseFloat(data['week8'] || '0'),
          week12: parseFloat(data['week12'] || '0'),
        });
      }
    }

    return cohorts;
  }

  /**
   * Get retention curve
   */
  private async getRetentionCurve(): Promise<RetentionPoint[]> {
    const curve: RetentionPoint[] = [];
    const days = [1, 3, 7, 14, 30, 60, 90];
    const benchmarks = [70, 55, 40, 30, 20, 15, 12];

    for (let i = 0; i < days.length; i++) {
      const day = days[i];
      const retention = parseFloat((await this.redis.get(`retention:day${day}`)) || '0');

      curve.push({
        day,
        retention,
        benchmark: benchmarks[i] || 10,
      });
    }

    return curve;
  }

  /**
   * Get churn prediction
   */
  private async getChurnPrediction(): Promise<ChurnPrediction> {
    const atRiskUsers = parseInt((await this.redis.get('churn:at_risk_users')) || '0', 10);
    const predictedChurn = parseFloat((await this.redis.get('churn:predicted')) || '5');

    const reasonData = await this.redis.hgetall('churn:reasons');
    const topChurnReasons: ChurnReason[] = [];
    const total = Object.values(reasonData).reduce((sum, val) => sum + parseInt(val, 10), 0);

    for (const [reason, count] of Object.entries(reasonData)) {
      const countNum = parseInt(count, 10);
      topChurnReasons.push({
        reason,
        count: countNum,
        percentage: total > 0 ? Math.round((countNum / total) * 100 * 100) / 100 : 0,
      });
    }

    return {
      atRiskUsers,
      predictedChurn,
      topChurnReasons: topChurnReasons.sort((a, b) => b.count - a.count).slice(0, 5),
    };
  }

  /**
   * Get revenue growth
   */
  private async getRevenueGrowth(since: Date): Promise<RevenueGrowth> {
    try {
      const mrr = parseFloat((await this.redis.get('revenue:mrr')) || '0');
      const arr = mrr * 12;
      const payingUsers = parseInt((await this.redis.get('revenue:paying_users')) || '1', 10);
      const totalUsers = await this.prisma.user.count();

      const arpu = totalUsers > 0 ? mrr / totalUsers : 0;
      const arppu = payingUsers > 0 ? mrr / payingUsers : 0;

      const previousMrr = parseFloat((await this.redis.get('revenue:previous_mrr')) || '0');
      const growthRate = previousMrr > 0 ? ((mrr - previousMrr) / previousMrr) * 100 : 0;

      // Get revenue by plan
      const planData = await this.redis.hgetall('revenue:by_plan');
      const revenueByPlan: Record<string, number> = {};
      for (const [plan, revenue] of Object.entries(planData)) {
        revenueByPlan[plan] = parseFloat(revenue);
      }

      const upgrades = parseInt((await this.redis.get('revenue:upgrades')) || '0', 10);
      const downgrades = parseInt((await this.redis.get('revenue:downgrades')) || '0', 10);
      const netRevenue = parseFloat((await this.redis.get('revenue:net')) || '0');

      return {
        mrr,
        arr,
        arpu: Math.round(arpu * 100) / 100,
        arppu: Math.round(arppu * 100) / 100,
        growthRate: Math.round(growthRate * 100) / 100,
        revenueByPlan,
        upgrades,
        downgrades,
        netRevenue,
      };
    } catch {
      return {
        mrr: 0,
        arr: 0,
        arpu: 0,
        arppu: 0,
        growthRate: 0,
        revenueByPlan: {},
        upgrades: 0,
        downgrades: 0,
        netRevenue: 0,
      };
    }
  }

  /**
   * Get referral growth
   */
  private async getReferralGrowth(since: Date): Promise<ReferralGrowth> {
    try {
      const referrals = parseInt((await this.redis.get('referral:total')) || '0', 10);
      const totalUsers = await this.prisma.user.count();
      const referralRate = totalUsers > 0 ? (referrals / totalUsers) * 100 : 0;
      const viralCoefficient = parseFloat((await this.redis.get('referral:viral_coefficient')) || '0.5');
      const avgReferralsPerUser = parseFloat((await this.redis.get('referral:avg_per_user')) || '0.5');

      // Get top referrers
      const topReferrers = await this.getTopReferrers(10);

      // Get referral funnel
      const referralFunnel: ReferralFunnel = {
        invitesSent: parseInt((await this.redis.get('referral:invites_sent')) || '0', 10),
        invitesOpened: parseInt((await this.redis.get('referral:invites_opened')) || '0', 10),
        signups: parseInt((await this.redis.get('referral:signups')) || '0', 10),
        activations: parseInt((await this.redis.get('referral:activations')) || '0', 10),
        conversionRate: parseFloat((await this.redis.get('referral:conversion_rate')) || '0'),
      };

      return {
        referrals,
        referralRate: Math.round(referralRate * 100) / 100,
        viralCoefficient,
        avgReferralsPerUser,
        topReferrers,
        referralFunnel,
      };
    } catch {
      return {
        referrals: 0,
        referralRate: 0,
        viralCoefficient: 0,
        avgReferralsPerUser: 0,
        topReferrers: [],
        referralFunnel: {
          invitesSent: 0,
          invitesOpened: 0,
          signups: 0,
          activations: 0,
          conversionRate: 0,
        },
      };
    }
  }

  /**
   * Get top referrers
   */
  private async getTopReferrers(limit: number): Promise<ReferrerMetrics[]> {
    const referrers: ReferrerMetrics[] = [];
    const data = await this.redis.zrevrange('referrers:top', 0, limit - 1, 'WITHSCORES');

    for (let i = 0; i < data.length; i += 2) {
      const userId = data[i];
      const referrals = parseFloat(data[i + 1] || '0');

      if (userId) {
        const userData = await this.redis.hgetall(`referrer:${userId}`);
        referrers.push({
          userId,
          referrals,
          successRate: parseFloat(userData['successRate'] || '50'),
          tier: userData['tier'] || 'starter',
        });
      }
    }

    return referrers;
  }

  /**
   * Get retention analytics
   */
  async getRetention(period: string = '30d'): Promise<RetentionAnalysis> {
    try {
      const overall = parseFloat((await this.redis.get('metrics:retention_rate')) || '40');

      // Get by segment
      const segments = ['power_users', 'regular_users', 'casual_users', 'new_users'];
      const bySegment: SegmentRetention[] = [];

      for (const segment of segments) {
        const data = await this.redis.hgetall(`retention:segment:${segment}`);
        bySegment.push({
          segment,
          retention: parseFloat(data['retention'] || '0'),
          size: parseInt(data['size'] || '0', 10),
          trend: (data['trend'] as 'up' | 'down' | 'stable') || 'stable',
        });
      }

      // Get by activity
      const activities = ['posted', 'liked', 'commented', 'followed', 'shared'];
      const byActivity: ActivityRetention[] = [];

      for (const activity of activities) {
        const data = await this.redis.hgetall(`retention:activity:${activity}`);
        byActivity.push({
          activity,
          retentionImpact: parseFloat(data['impact'] || '0'),
          usersWithActivity: parseInt(data['withActivity'] || '0', 10),
          retentionWithActivity: parseFloat(data['retentionWith'] || '0'),
          retentionWithout: parseFloat(data['retentionWithout'] || '0'),
        });
      }

      // Get trends
      const trends: RetentionTrend[] = [];
      const periods = ['last_week', 'last_month', 'last_quarter'];

      for (const p of periods) {
        const data = await this.redis.hgetall(`retention:trend:${p}`);
        trends.push({
          period: p,
          retention: parseFloat(data['retention'] || '0'),
          change: parseFloat(data['change'] || '0'),
        });
      }

      return {
        period,
        overall,
        bySegment,
        byActivity,
        trends,
      };
    } catch {
      return {
        period,
        overall: 0,
        bySegment: [],
        byActivity: [],
        trends: [],
      };
    }
  }

  /**
   * Get funnel analysis
   */
  async getFunnel(funnelId: string = 'signup'): Promise<FunnelAnalysis> {
    const steps = FUNNELS[funnelId] || FUNNELS['signup'];
    const funnelSteps: FunnelStep[] = [];
    let previousUsers = 0;

    for (const step of steps) {
      const users = parseInt((await this.redis.get(`funnel:${funnelId}:${step}`)) || '0', 10);
      const conversionRate = previousUsers > 0 ? (users / previousUsers) * 100 : 100;
      const dropoffRate = previousUsers > 0 ? ((previousUsers - users) / previousUsers) * 100 : 0;
      const avgTime = parseFloat((await this.redis.get(`funnel:${funnelId}:${step}:time`)) || '0');

      funnelSteps.push({
        name: step,
        users,
        conversionRate: Math.round(conversionRate * 100) / 100,
        dropoffRate: Math.round(dropoffRate * 100) / 100,
        avgTimeInStep: avgTime,
      });

      previousUsers = users || previousUsers;
    }

    // Calculate overall conversion
    const firstStep = funnelSteps[0]?.users || 0;
    const lastStep = funnelSteps[funnelSteps.length - 1]?.users || 0;
    const overallConversion = firstStep > 0 ? (lastStep / firstStep) * 100 : 0;

    // Get dropoff analysis
    const dropoffAnalysis: DropoffAnalysis[] = [];
    for (let i = 0; i < funnelSteps.length - 1; i++) {
      const current = funnelSteps[i];
      const next = funnelSteps[i + 1];

      if (current && next && current.dropoffRate > 10) {
        const reasons = await this.redis.lrange(`funnel:${funnelId}:dropoff:${current.name}`, 0, 4);
        dropoffAnalysis.push({
          fromStep: current.name,
          toStep: next.name,
          dropoffRate: current.dropoffRate,
          topReasons: reasons,
        });
      }
    }

    return {
      funnelId,
      name: funnelId.charAt(0).toUpperCase() + funnelId.slice(1) + ' Funnel',
      steps: funnelSteps,
      overallConversion: Math.round(overallConversion * 100) / 100,
      dropoffAnalysis,
    };
  }

  // ============ HELPER METHODS ============

  private async getTotalEngagements(since: Date, until?: Date): Promise<number> {
    try {
      const [likes, comments, shares] = await Promise.all([
        this.prisma.postLike.count({
          where: {
            createdAt: { gte: since, ...(until && { lt: until }) },
          },
        }),
        this.prisma.post.count({
          where: {
            createdAt: { gte: since, ...(until && { lt: until }) },
            parentId: { not: null },
          },
        }),
        this.prisma.post.count({
          where: {
            createdAt: { gte: since, ...(until && { lt: until }) },
            repostId: { not: null },
          },
        }),
      ]);

      return likes + comments + shares;
    } catch {
      return 0;
    }
  }
}

export default GrowthAnalytics;
