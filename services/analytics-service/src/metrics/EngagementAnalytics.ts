// =================================
// TEXTMESH ENGAGEMENT ANALYTICS
// User Engagement Pattern Analysis
// =================================

import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';

// ============ ENGAGEMENT TYPES ============

export interface EngagementAnalyticsResult {
  period: string;
  timestamp: Date;
  overview: EngagementOverview;
  actions: ActionMetrics;
  sessions: SessionMetrics;
  interactions: InteractionPatterns;
  notifications: NotificationMetrics;
}

export interface EngagementOverview {
  totalEngagements: number;
  engagementRate: number;
  activeRate: number;
  avgEngagementsPerUser: number;
  avgEngagementsPerPost: number;
  peakHour: number;
  peakDay: string;
}

export interface ActionMetrics {
  likes: ActionDetail;
  comments: ActionDetail;
  shares: ActionDetail;
  bookmarks: ActionDetail;
  follows: ActionDetail;
  views: ActionDetail;
  clicks: ActionDetail;
}

export interface ActionDetail {
  total: number;
  unique: number;
  perUser: number;
  growthRate: number;
  distribution: HourlyDistribution;
}

export interface HourlyDistribution {
  byHour: Record<number, number>;
  byDay: Record<string, number>;
  heatmap: number[][];
}

export interface SessionMetrics {
  totalSessions: number;
  avgDuration: number;
  avgPageViews: number;
  bounceRate: number;
  returnRate: number;
  sessionsByDevice: Record<string, number>;
  sessionsByPlatform: Record<string, number>;
  entryPoints: Record<string, number>;
  exitPoints: Record<string, number>;
}

export interface InteractionPatterns {
  feedScrollDepth: DepthMetrics;
  contentInteraction: ContentInteractionMetrics;
  socialGraph: SocialGraphMetrics;
  searchBehavior: SearchMetrics;
}

export interface DepthMetrics {
  avgScrollDepth: number;
  distribution: Record<string, number>;
  timeAtDepth: Record<string, number>;
}

export interface ContentInteractionMetrics {
  avgTimeOnPost: number;
  readCompletion: number;
  interactionRate: number;
  shareability: number;
}

export interface SocialGraphMetrics {
  avgFollowsPerUser: number;
  avgFollowersPerUser: number;
  mutualFollowRate: number;
  networkDensity: number;
  clusterCoefficient: number;
}

export interface SearchMetrics {
  searchRate: number;
  avgSearchesPerSession: number;
  searchToActionRate: number;
  topSearchTerms: Array<{ term: string; count: number }>;
}

export interface NotificationMetrics {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
  byType: Record<string, NotificationTypeMetrics>;
}

export interface NotificationTypeMetrics {
  sent: number;
  opened: number;
  clicked: number;
  openRate: number;
  clickRate: number;
}

export interface EngagementPatterns {
  timeOfDay: TimePattern[];
  dayOfWeek: DayPattern[];
  seasonality: SeasonalPattern[];
  userJourney: JourneyStage[];
  correlations: EngagementCorrelation[];
}

export interface TimePattern {
  hour: number;
  engagement: number;
  avgUsers: number;
  peakActivity: string;
}

export interface DayPattern {
  day: string;
  engagement: number;
  avgUsers: number;
  topContent: string;
}

export interface SeasonalPattern {
  period: string;
  trend: 'up' | 'down' | 'stable';
  changePercent: number;
}

export interface JourneyStage {
  stage: string;
  users: number;
  avgTime: number;
  conversionRate: number;
  dropoffRate: number;
}

export interface EngagementCorrelation {
  factor1: string;
  factor2: string;
  correlation: number;
  significance: number;
}

// ============ TIME PERIODS ============

const PERIODS: Record<string, number> = {
  '1d': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
};

// ============ ENGAGEMENT ANALYTICS CLASS ============

export class EngagementAnalytics {
  private redis: Redis;
  private prisma: PrismaClient;

  constructor(redis: Redis, prisma: PrismaClient) {
    this.redis = redis;
    this.prisma = prisma;
  }

  /**
   * Get engagement metrics
   */
  async getMetrics(period: string = '30d'): Promise<EngagementAnalyticsResult> {
    const periodMs = PERIODS[period] || PERIODS['30d'];
    const since = new Date(Date.now() - periodMs);

    const [overview, actions, sessions, interactions, notifications] = await Promise.all([
      this.getOverview(since),
      this.getActionMetrics(since),
      this.getSessionMetrics(since),
      this.getInteractionPatterns(since),
      this.getNotificationMetrics(since),
    ]);

    return {
      period,
      timestamp: new Date(),
      overview,
      actions,
      sessions,
      interactions,
      notifications,
    };
  }

  /**
   * Get engagement overview
   */
  private async getOverview(since: Date): Promise<EngagementOverview> {
    try {
      const [likes, comments, shares] = await Promise.all([
        this.prisma.postLike.count({ where: { createdAt: { gte: since } } }),
        this.prisma.post.count({ where: { createdAt: { gte: since }, parentId: { not: null } } }), // Comments are replies
        this.prisma.post.count({ where: { createdAt: { gte: since }, repostId: { not: null } } }), // Reposts
      ]);

      const totalEngagements = likes + comments + shares;

      const [totalUsers, totalPosts, activeUsers] = await Promise.all([
        this.prisma.user.count(),
        this.prisma.post.count({ where: { createdAt: { gte: since } } }),
        this.redis.scard('active:users:realtime'),
      ]);

      const engagementRate = totalPosts > 0 ? (totalEngagements / totalPosts) * 100 : 0;
      const activeRate = totalUsers > 0 ? (activeUsers / totalUsers) * 100 : 0;
      const avgPerUser = totalUsers > 0 ? totalEngagements / totalUsers : 0;
      const avgPerPost = totalPosts > 0 ? totalEngagements / totalPosts : 0;

      // Get peak times
      const peakHour = await this.getPeakHour();
      const peakDay = await this.getPeakDay();

      return {
        totalEngagements,
        engagementRate: Math.round(engagementRate * 100) / 100,
        activeRate: Math.round(activeRate * 100) / 100,
        avgEngagementsPerUser: Math.round(avgPerUser * 100) / 100,
        avgEngagementsPerPost: Math.round(avgPerPost * 100) / 100,
        peakHour,
        peakDay,
      };
    } catch {
      return {
        totalEngagements: 0,
        engagementRate: 0,
        activeRate: 0,
        avgEngagementsPerUser: 0,
        avgEngagementsPerPost: 0,
        peakHour: 0,
        peakDay: 'Monday',
      };
    }
  }

  /**
   * Get action metrics
   */
  private async getActionMetrics(since: Date): Promise<ActionMetrics> {
    const actions: ActionMetrics = {
      likes: await this.getActionDetail('like', since),
      comments: await this.getActionDetail('comment', since),
      shares: await this.getActionDetail('share', since),
      bookmarks: await this.getActionDetail('bookmark', since),
      follows: await this.getActionDetail('follow', since),
      views: await this.getActionDetail('view', since),
      clicks: await this.getActionDetail('click', since),
    };

    return actions;
  }

  /**
   * Get action detail
   */
  private async getActionDetail(action: string, since: Date): Promise<ActionDetail> {
    try {
      let total = 0;

      switch (action) {
        case 'like':
          total = await this.prisma.postLike.count({ where: { createdAt: { gte: since } } });
          break;
        case 'comment':
          total = await this.prisma.post.count({ where: { createdAt: { gte: since }, parentId: { not: null } } });
          break;
        case 'share':
          total = await this.prisma.post.count({ where: { createdAt: { gte: since }, repostId: { not: null } } });
          break;
        case 'follow':
          total = await this.prisma.follow.count({ where: { createdAt: { gte: since } } });
          break;
        default:
          total = parseInt((await this.redis.get(`metrics:${action}_count`)) || '0', 10);
      }

      const unique = parseInt((await this.redis.get(`metrics:${action}_unique`)) || '0', 10);
      const users = await this.prisma.user.count();
      const perUser = users > 0 ? total / users : 0;

      // Get growth rate
      const previousTotal = parseInt((await this.redis.get(`metrics:${action}_previous`)) || '0', 10);
      const growthRate = previousTotal > 0 ? ((total - previousTotal) / previousTotal) * 100 : 0;

      // Get distribution
      const distribution = await this.getActionDistribution(action);

      return {
        total,
        unique,
        perUser: Math.round(perUser * 100) / 100,
        growthRate: Math.round(growthRate * 100) / 100,
        distribution,
      };
    } catch {
      return {
        total: 0,
        unique: 0,
        perUser: 0,
        growthRate: 0,
        distribution: { byHour: {}, byDay: {}, heatmap: [] },
      };
    }
  }

  /**
   * Get action distribution
   */
  private async getActionDistribution(action: string): Promise<HourlyDistribution> {
    const byHour: Record<number, number> = {};
    const byDay: Record<string, number> = {};
    const heatmap: number[][] = [];

    try {
      // Get hourly distribution
      for (let h = 0; h < 24; h++) {
        byHour[h] = parseInt(
          (await this.redis.hget(`action:dist:${action}:hour`, h.toString())) || '0',
          10
        );
      }

      // Get daily distribution
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      for (const day of days) {
        byDay[day] = parseInt(
          (await this.redis.hget(`action:dist:${action}:day`, day)) || '0',
          10
        );
      }

      // Build heatmap (7 days x 24 hours)
      for (let d = 0; d < 7; d++) {
        const dayRow: number[] = [];
        for (let h = 0; h < 24; h++) {
          const value = parseInt(
            (await this.redis.hget(`action:heatmap:${action}`, `${d}:${h}`)) || '0',
            10
          );
          dayRow.push(value);
        }
        heatmap.push(dayRow);
      }
    } catch {
      // Return empty distribution
    }

    return { byHour, byDay, heatmap };
  }

  /**
   * Get session metrics
   */
  private async getSessionMetrics(since: Date): Promise<SessionMetrics> {
    try {
      const totalSessions = parseInt((await this.redis.get('metrics:total_sessions')) || '0', 10);
      const avgDuration = parseFloat((await this.redis.get('metrics:avg_session_duration')) || '180');
      const avgPageViews = parseFloat((await this.redis.get('metrics:avg_page_views')) || '5');
      const bounceRate = parseFloat((await this.redis.get('metrics:bounce_rate')) || '30');
      const returnRate = parseFloat((await this.redis.get('metrics:return_rate')) || '40');

      // Get device distribution
      const deviceData = await this.redis.hgetall('sessions:by:device');
      const sessionsByDevice: Record<string, number> = {};
      for (const [device, count] of Object.entries(deviceData)) {
        sessionsByDevice[device] = parseInt(count, 10);
      }

      // Get platform distribution
      const platformData = await this.redis.hgetall('sessions:by:platform');
      const sessionsByPlatform: Record<string, number> = {};
      for (const [platform, count] of Object.entries(platformData)) {
        sessionsByPlatform[platform] = parseInt(count, 10);
      }

      // Get entry/exit points
      const entryData = await this.redis.hgetall('sessions:entry_points');
      const exitData = await this.redis.hgetall('sessions:exit_points');

      const entryPoints: Record<string, number> = {};
      const exitPoints: Record<string, number> = {};

      for (const [point, count] of Object.entries(entryData)) {
        entryPoints[point] = parseInt(count, 10);
      }
      for (const [point, count] of Object.entries(exitData)) {
        exitPoints[point] = parseInt(count, 10);
      }

      return {
        totalSessions,
        avgDuration,
        avgPageViews,
        bounceRate,
        returnRate,
        sessionsByDevice,
        sessionsByPlatform,
        entryPoints,
        exitPoints,
      };
    } catch {
      return {
        totalSessions: 0,
        avgDuration: 0,
        avgPageViews: 0,
        bounceRate: 0,
        returnRate: 0,
        sessionsByDevice: {},
        sessionsByPlatform: {},
        entryPoints: {},
        exitPoints: {},
      };
    }
  }

  /**
   * Get interaction patterns
   */
  private async getInteractionPatterns(since: Date): Promise<InteractionPatterns> {
    try {
      return {
        feedScrollDepth: await this.getFeedScrollDepth(),
        contentInteraction: await this.getContentInteraction(),
        socialGraph: await this.getSocialGraphMetrics(),
        searchBehavior: await this.getSearchBehavior(),
      };
    } catch {
      return {
        feedScrollDepth: { avgScrollDepth: 0, distribution: {}, timeAtDepth: {} },
        contentInteraction: { avgTimeOnPost: 0, readCompletion: 0, interactionRate: 0, shareability: 0 },
        socialGraph: {
          avgFollowsPerUser: 0,
          avgFollowersPerUser: 0,
          mutualFollowRate: 0,
          networkDensity: 0,
          clusterCoefficient: 0,
        },
        searchBehavior: { searchRate: 0, avgSearchesPerSession: 0, searchToActionRate: 0, topSearchTerms: [] },
      };
    }
  }

  /**
   * Get feed scroll depth metrics
   */
  private async getFeedScrollDepth(): Promise<DepthMetrics> {
    const avgScrollDepth = parseFloat((await this.redis.get('metrics:avg_scroll_depth')) || '50');

    const distData = await this.redis.hgetall('metrics:scroll_distribution');
    const distribution: Record<string, number> = {};
    for (const [depth, count] of Object.entries(distData)) {
      distribution[depth] = parseInt(count, 10);
    }

    const timeData = await this.redis.hgetall('metrics:time_at_depth');
    const timeAtDepth: Record<string, number> = {};
    for (const [depth, time] of Object.entries(timeData)) {
      timeAtDepth[depth] = parseFloat(time);
    }

    return { avgScrollDepth, distribution, timeAtDepth };
  }

  /**
   * Get content interaction metrics
   */
  private async getContentInteraction(): Promise<ContentInteractionMetrics> {
    return {
      avgTimeOnPost: parseFloat((await this.redis.get('metrics:avg_time_on_post')) || '15'),
      readCompletion: parseFloat((await this.redis.get('metrics:read_completion')) || '70'),
      interactionRate: parseFloat((await this.redis.get('metrics:interaction_rate')) || '5'),
      shareability: parseFloat((await this.redis.get('metrics:shareability')) || '2'),
    };
  }

  /**
   * Get social graph metrics
   */
  private async getSocialGraphMetrics(): Promise<SocialGraphMetrics> {
    try {
      const totalUsers = await this.prisma.user.count();
      const totalFollows = await this.prisma.follow.count();

      const avgFollowsPerUser = totalUsers > 0 ? totalFollows / totalUsers : 0;
      const avgFollowersPerUser = avgFollowsPerUser; // Symmetric in this case

      const mutualFollowRate = parseFloat((await this.redis.get('metrics:mutual_follow_rate')) || '30');
      const networkDensity = parseFloat((await this.redis.get('metrics:network_density')) || '0.01');
      const clusterCoefficient = parseFloat((await this.redis.get('metrics:cluster_coefficient')) || '0.1');

      return {
        avgFollowsPerUser: Math.round(avgFollowsPerUser * 100) / 100,
        avgFollowersPerUser: Math.round(avgFollowersPerUser * 100) / 100,
        mutualFollowRate,
        networkDensity,
        clusterCoefficient,
      };
    } catch {
      return {
        avgFollowsPerUser: 0,
        avgFollowersPerUser: 0,
        mutualFollowRate: 0,
        networkDensity: 0,
        clusterCoefficient: 0,
      };
    }
  }

  /**
   * Get search behavior metrics
   */
  private async getSearchBehavior(): Promise<SearchMetrics> {
    const searchRate = parseFloat((await this.redis.get('metrics:search_rate')) || '15');
    const avgSearches = parseFloat((await this.redis.get('metrics:avg_searches_per_session')) || '1.5');
    const searchToAction = parseFloat((await this.redis.get('metrics:search_to_action_rate')) || '25');

    // Get top search terms
    const termData = await this.redis.zrevrange('searches:trending', 0, 19, 'WITHSCORES');
    const topSearchTerms: Array<{ term: string; count: number }> = [];

    for (let i = 0; i < termData.length; i += 2) {
      const term = termData[i];
      const count = parseFloat(termData[i + 1] || '0');
      if (term) {
        topSearchTerms.push({ term, count });
      }
    }

    return {
      searchRate,
      avgSearchesPerSession: avgSearches,
      searchToActionRate: searchToAction,
      topSearchTerms,
    };
  }

  /**
   * Get notification metrics
   */
  private async getNotificationMetrics(since: Date): Promise<NotificationMetrics> {
    try {
      const sent = parseInt((await this.redis.get('notifications:sent')) || '0', 10);
      const delivered = parseInt((await this.redis.get('notifications:delivered')) || '0', 10);
      const opened = parseInt((await this.redis.get('notifications:opened')) || '0', 10);
      const clicked = parseInt((await this.redis.get('notifications:clicked')) || '0', 10);

      const deliveryRate = sent > 0 ? (delivered / sent) * 100 : 0;
      const openRate = delivered > 0 ? (opened / delivered) * 100 : 0;
      const clickRate = opened > 0 ? (clicked / opened) * 100 : 0;

      // Get by type
      const types = ['like', 'comment', 'follow', 'mention', 'repost', 'system'];
      const byType: Record<string, NotificationTypeMetrics> = {};

      for (const type of types) {
        const typeSent = parseInt((await this.redis.get(`notifications:${type}:sent`)) || '0', 10);
        const typeOpened = parseInt((await this.redis.get(`notifications:${type}:opened`)) || '0', 10);
        const typeClicked = parseInt((await this.redis.get(`notifications:${type}:clicked`)) || '0', 10);

        byType[type] = {
          sent: typeSent,
          opened: typeOpened,
          clicked: typeClicked,
          openRate: typeSent > 0 ? Math.round((typeOpened / typeSent) * 100 * 100) / 100 : 0,
          clickRate: typeOpened > 0 ? Math.round((typeClicked / typeOpened) * 100 * 100) / 100 : 0,
        };
      }

      return {
        sent,
        delivered,
        opened,
        clicked,
        deliveryRate: Math.round(deliveryRate * 100) / 100,
        openRate: Math.round(openRate * 100) / 100,
        clickRate: Math.round(clickRate * 100) / 100,
        byType,
      };
    } catch {
      return {
        sent: 0,
        delivered: 0,
        opened: 0,
        clicked: 0,
        deliveryRate: 0,
        openRate: 0,
        clickRate: 0,
        byType: {},
      };
    }
  }

  /**
   * Get engagement patterns
   */
  async getPatterns(): Promise<EngagementPatterns> {
    try {
      const [timeOfDay, dayOfWeek, seasonality, userJourney, correlations] = await Promise.all([
        this.getTimeOfDayPatterns(),
        this.getDayOfWeekPatterns(),
        this.getSeasonalPatterns(),
        this.getUserJourneyStages(),
        this.getEngagementCorrelations(),
      ]);

      return {
        timeOfDay,
        dayOfWeek,
        seasonality,
        userJourney,
        correlations,
      };
    } catch {
      return {
        timeOfDay: [],
        dayOfWeek: [],
        seasonality: [],
        userJourney: [],
        correlations: [],
      };
    }
  }

  // ============ HELPER METHODS ============

  private async getPeakHour(): Promise<number> {
    let maxHour = 0;
    let maxCount = 0;

    for (let h = 0; h < 24; h++) {
      const count = parseInt((await this.redis.hget('engagement:by_hour', h.toString())) || '0', 10);
      if (count > maxCount) {
        maxCount = count;
        maxHour = h;
      }
    }

    return maxHour;
  }

  private async getPeakDay(): Promise<string> {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    let maxDay = 'Monday';
    let maxCount = 0;

    for (const day of days) {
      const count = parseInt((await this.redis.hget('engagement:by_day', day)) || '0', 10);
      if (count > maxCount) {
        maxCount = count;
        maxDay = day;
      }
    }

    return maxDay;
  }

  private async getTimeOfDayPatterns(): Promise<TimePattern[]> {
    const patterns: TimePattern[] = [];

    for (let h = 0; h < 24; h++) {
      const engagement = parseInt((await this.redis.hget('patterns:hour:engagement', h.toString())) || '0', 10);
      const avgUsers = parseInt((await this.redis.hget('patterns:hour:users', h.toString())) || '0', 10);

      let peakActivity = 'browsing';
      if (h >= 6 && h <= 9) peakActivity = 'catching_up';
      else if (h >= 12 && h <= 14) peakActivity = 'lunch_break';
      else if (h >= 18 && h <= 21) peakActivity = 'evening_engagement';
      else if (h >= 22 || h <= 5) peakActivity = 'late_night';

      patterns.push({ hour: h, engagement, avgUsers, peakActivity });
    }

    return patterns;
  }

  private async getDayOfWeekPatterns(): Promise<DayPattern[]> {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const patterns: DayPattern[] = [];

    for (const day of days) {
      const engagement = parseInt((await this.redis.hget('patterns:day:engagement', day)) || '0', 10);
      const avgUsers = parseInt((await this.redis.hget('patterns:day:users', day)) || '0', 10);
      const topContent = (await this.redis.hget('patterns:day:top_content', day)) || 'general';

      patterns.push({ day, engagement, avgUsers, topContent });
    }

    return patterns;
  }

  private async getSeasonalPatterns(): Promise<SeasonalPattern[]> {
    const periods = ['weekly', 'monthly', 'quarterly'];
    const patterns: SeasonalPattern[] = [];

    for (const period of periods) {
      const data = await this.redis.hgetall(`patterns:seasonal:${period}`);
      const trend = (data['trend'] as 'up' | 'down' | 'stable') || 'stable';
      const changePercent = parseFloat(data['changePercent'] || '0');

      patterns.push({ period, trend, changePercent });
    }

    return patterns;
  }

  private async getUserJourneyStages(): Promise<JourneyStage[]> {
    const stages = ['discovery', 'exploration', 'engagement', 'conversion', 'retention', 'advocacy'];
    const journeyStages: JourneyStage[] = [];

    for (const stage of stages) {
      const data = await this.redis.hgetall(`journey:stage:${stage}`);

      journeyStages.push({
        stage,
        users: parseInt(data['users'] || '0', 10),
        avgTime: parseFloat(data['avgTime'] || '0'),
        conversionRate: parseFloat(data['conversionRate'] || '0'),
        dropoffRate: parseFloat(data['dropoffRate'] || '0'),
      });
    }

    return journeyStages;
  }

  private async getEngagementCorrelations(): Promise<EngagementCorrelation[]> {
    const correlations: EngagementCorrelation[] = [];
    const data = await this.redis.lrange('patterns:correlations', 0, 19);

    for (const item of data) {
      try {
        const parsed = JSON.parse(item);
        correlations.push(parsed);
      } catch {
        // Skip invalid data
      }
    }

    return correlations;
  }
}

export default EngagementAnalytics;
