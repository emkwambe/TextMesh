/**
 * Dashboard Metrics
 *
 * Provides aggregated metrics for dashboards
 */

import { createLogger } from '@textmesh/logger';
import {
  DashboardMetrics,
  UserAnalytics,
  ContentAnalytics,
  Funnel,
  FunnelStep,
  Cohort,
  AnalyticsEvent,
  EventAction,
} from './types';
import { MetricsAggregator } from './metrics-aggregator';
import { RealtimeAnalytics } from './realtime';

const logger = createLogger({ service: 'dashboard', level: 'info' });

export class DashboardService {
  private aggregator: MetricsAggregator;
  private realtime: RealtimeAnalytics;

  // In-memory storage for user/content analytics
  private userAnalytics: Map<string, UserAnalytics> = new Map();
  private contentAnalytics: Map<string, ContentAnalytics> = new Map();
  private dailyActiveUsers: Map<string, Set<string>> = new Map(); // date -> userIds
  private weeklyActiveUsers: Map<string, Set<string>> = new Map(); // week -> userIds
  private monthlyActiveUsers: Map<string, Set<string>> = new Map(); // month -> userIds

  constructor(aggregator: MetricsAggregator, realtime: RealtimeAnalytics) {
    this.aggregator = aggregator;
    this.realtime = realtime;
  }

  /**
   * Process event for dashboard metrics
   */
  processEvent(event: AnalyticsEvent): void {
    // Track active users
    if (event.userId) {
      this.trackActiveUser(event.userId, event.timestamp);
      this.updateUserAnalytics(event);
    }

    // Track content analytics
    if (event.category === 'content' || event.category === 'engagement') {
      this.updateContentAnalytics(event);
    }
  }

  /**
   * Track active user
   */
  private trackActiveUser(userId: string, timestamp: Date): void {
    const dateKey = timestamp.toISOString().split('T')[0];
    const weekKey = this.getWeekKey(timestamp);
    const monthKey = `${timestamp.getFullYear()}-${String(timestamp.getMonth() + 1).padStart(2, '0')}`;

    // Daily
    let daily = this.dailyActiveUsers.get(dateKey);
    if (!daily) {
      daily = new Set();
      this.dailyActiveUsers.set(dateKey, daily);
    }
    daily.add(userId);

    // Weekly
    let weekly = this.weeklyActiveUsers.get(weekKey);
    if (!weekly) {
      weekly = new Set();
      this.weeklyActiveUsers.set(weekKey, weekly);
    }
    weekly.add(userId);

    // Monthly
    let monthly = this.monthlyActiveUsers.get(monthKey);
    if (!monthly) {
      monthly = new Set();
      this.monthlyActiveUsers.set(monthKey, monthly);
    }
    monthly.add(userId);
  }

  /**
   * Get week key
   */
  private getWeekKey(date: Date): string {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    return d.toISOString().split('T')[0];
  }

  /**
   * Update user analytics
   */
  private updateUserAnalytics(event: AnalyticsEvent): void {
    if (!event.userId) return;

    let analytics = this.userAnalytics.get(event.userId);
    if (!analytics) {
      analytics = {
        userId: event.userId,
        firstSeen: event.timestamp,
        lastSeen: event.timestamp,
        totalSessions: 0,
        totalPageViews: 0,
        totalEvents: 0,
        engagementScore: 0,
        retentionDays: [],
        topActions: [],
      };
      this.userAnalytics.set(event.userId, analytics);
    }

    analytics.lastSeen = event.timestamp;
    analytics.totalEvents++;

    if (event.action === 'page_view') {
      analytics.totalPageViews++;
    }

    if (event.action === 'login') {
      analytics.totalSessions++;
    }

    // Update engagement score
    analytics.engagementScore = this.calculateEngagementScore(analytics);
  }

  /**
   * Calculate engagement score
   */
  private calculateEngagementScore(analytics: UserAnalytics): number {
    const daysSinceFirst = Math.max(
      1,
      (Date.now() - analytics.firstSeen.getTime()) / (24 * 60 * 60 * 1000)
    );

    const eventsPerDay = analytics.totalEvents / daysSinceFirst;
    const sessionsPerDay = analytics.totalSessions / daysSinceFirst;
    const pageViewsPerDay = analytics.totalPageViews / daysSinceFirst;

    // Simple scoring formula
    const score =
      Math.min(eventsPerDay * 10, 30) +
      Math.min(sessionsPerDay * 20, 40) +
      Math.min(pageViewsPerDay * 5, 30);

    return Math.min(100, Math.round(score));
  }

  /**
   * Update content analytics
   */
  private updateContentAnalytics(event: AnalyticsEvent): void {
    const contentId = event.properties.contentId as string ||
      event.properties.targetId as string;

    if (!contentId) return;

    let analytics = this.contentAnalytics.get(contentId);
    if (!analytics) {
      analytics = {
        contentId,
        contentType: event.properties.contentType as string || 'post',
        views: 0,
        uniqueViewers: 0,
        likes: 0,
        shares: 0,
        comments: 0,
        avgViewDuration: 0,
        engagementRate: 0,
      };
      this.contentAnalytics.set(contentId, analytics);
    }

    switch (event.action) {
      case 'post_view':
        analytics.views++;
        break;
      case 'like':
        analytics.likes++;
        break;
      case 'share':
        analytics.shares++;
        break;
      case 'comment_create':
        analytics.comments++;
        break;
    }

    // Update engagement rate
    if (analytics.views > 0) {
      analytics.engagementRate =
        (analytics.likes + analytics.shares * 2 + analytics.comments * 3) /
        analytics.views;
    }
  }

  /**
   * Get dashboard metrics
   */
  getDashboardMetrics(): DashboardMetrics {
    const today = new Date().toISOString().split('T')[0];
    const thisWeek = this.getWeekKey(new Date());
    const thisMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

    const dau = this.dailyActiveUsers.get(today)?.size || 0;
    const wau = this.weeklyActiveUsers.get(thisWeek)?.size || 0;
    const mau = this.monthlyActiveUsers.get(thisMonth)?.size || 0;

    // Get metrics from aggregator
    const postsCreated = this.aggregator.getCurrentValue(
      'content.post_create',
      'day'
    )?.count || 0;

    const commentsCreated = this.aggregator.getCurrentValue(
      'content.comment_create',
      'day'
    )?.count || 0;

    const likes = this.aggregator.getCurrentValue(
      'engagement.like',
      'day'
    )?.count || 0;

    const shares = this.aggregator.getCurrentValue(
      'engagement.share',
      'day'
    )?.count || 0;

    const pageLoadTime = this.aggregator.getCurrentValue(
      'performance.page_load.duration',
      'hour'
    )?.avg || 0;

    const errors = this.aggregator.getCurrentValue('errors', 'day')?.count || 0;
    const totalEvents = this.aggregator.getCurrentValue(
      'events.navigation.page_view',
      'day'
    )?.count || 1;

    return {
      activeUsers: { dau, wau, mau },
      newUsers: this.aggregator.getCurrentValue('new_users', 'day')?.count || 0,
      churnRate: this.calculateChurnRate(),
      postsCreated,
      commentsCreated,
      mediaUploaded: this.aggregator.getCurrentValue(
        'content.media_upload',
        'day'
      )?.count || 0,
      likes,
      shares,
      avgEngagementRate: this.calculateAvgEngagementRate(),
      avgPageLoadTime: pageLoadTime,
      errorRate: totalEvents > 0 ? errors / totalEvents : 0,
      apiLatencyP99: this.aggregator.getCurrentValue(
        'performance.api_call.duration',
        'hour'
      )?.max || 0,
    };
  }

  /**
   * Calculate churn rate
   */
  private calculateChurnRate(): number {
    // Simple churn calculation: users active last week but not this week
    const thisWeek = this.getWeekKey(new Date());
    const lastWeek = this.getWeekKey(
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    );

    const thisWeekUsers = this.weeklyActiveUsers.get(thisWeek) || new Set();
    const lastWeekUsers = this.weeklyActiveUsers.get(lastWeek) || new Set();

    if (lastWeekUsers.size === 0) return 0;

    let churned = 0;
    for (const userId of lastWeekUsers) {
      if (!thisWeekUsers.has(userId)) {
        churned++;
      }
    }

    return churned / lastWeekUsers.size;
  }

  /**
   * Calculate average engagement rate
   */
  private calculateAvgEngagementRate(): number {
    if (this.contentAnalytics.size === 0) return 0;

    let total = 0;
    for (const analytics of this.contentAnalytics.values()) {
      total += analytics.engagementRate;
    }

    return total / this.contentAnalytics.size;
  }

  /**
   * Get user analytics
   */
  getUserAnalytics(userId: string): UserAnalytics | null {
    return this.userAnalytics.get(userId) || null;
  }

  /**
   * Get content analytics
   */
  getContentAnalytics(contentId: string): ContentAnalytics | null {
    return this.contentAnalytics.get(contentId) || null;
  }

  /**
   * Get top content by engagement
   */
  getTopContent(limit: number = 10): ContentAnalytics[] {
    return Array.from(this.contentAnalytics.values())
      .sort((a, b) => b.engagementRate - a.engagementRate)
      .slice(0, limit);
  }

  /**
   * Get top users by engagement
   */
  getTopUsers(limit: number = 10): UserAnalytics[] {
    return Array.from(this.userAnalytics.values())
      .sort((a, b) => b.engagementScore - a.engagementScore)
      .slice(0, limit);
  }

  /**
   * Build funnel
   */
  buildFunnel(name: string, steps: EventAction[]): Funnel {
    // Count events for each step
    const stepCounts: number[] = [];

    for (const step of steps) {
      const count = this.aggregator.getCurrentValue(
        `events.*.${step}`,
        'day'
      )?.count || 0;
      stepCounts.push(count);
    }

    // Build funnel steps
    const funnelSteps: FunnelStep[] = steps.map((step, i) => {
      const count = stepCounts[i];
      const prevCount = i > 0 ? stepCounts[i - 1] : count;
      const conversionRate = prevCount > 0 ? count / prevCount : 0;
      const dropoffRate = 1 - conversionRate;

      return {
        name: step,
        eventAction: step,
        count,
        conversionRate,
        dropoffRate,
      };
    });

    // Calculate overall conversion
    const firstStep = stepCounts[0] || 0;
    const lastStep = stepCounts[stepCounts.length - 1] || 0;
    const overallConversionRate = firstStep > 0 ? lastStep / firstStep : 0;

    return {
      name,
      steps: funnelSteps,
      overallConversionRate,
    };
  }

  /**
   * Get retention cohort
   */
  getCohort(startDate: Date, name: string): Cohort {
    const startKey = startDate.toISOString().split('T')[0];
    const cohortUsers = this.dailyActiveUsers.get(startKey) || new Set();

    const retentionByWeek: number[] = [];

    // Calculate retention for 8 weeks
    for (let week = 0; week < 8; week++) {
      const weekDate = new Date(startDate.getTime() + week * 7 * 24 * 60 * 60 * 1000);
      const weekKey = this.getWeekKey(weekDate);
      const weekUsers = this.weeklyActiveUsers.get(weekKey) || new Set();

      let retained = 0;
      for (const userId of cohortUsers) {
        if (weekUsers.has(userId)) {
          retained++;
        }
      }

      const retention = cohortUsers.size > 0 ? retained / cohortUsers.size : 0;
      retentionByWeek.push(retention);
    }

    return {
      name,
      startDate,
      userCount: cohortUsers.size,
      retentionByWeek,
    };
  }

  /**
   * Get statistics
   */
  getStats(): {
    trackedUsers: number;
    trackedContent: number;
    dailySnapshots: number;
    weeklySnapshots: number;
    monthlySnapshots: number;
  } {
    return {
      trackedUsers: this.userAnalytics.size,
      trackedContent: this.contentAnalytics.size,
      dailySnapshots: this.dailyActiveUsers.size,
      weeklySnapshots: this.weeklyActiveUsers.size,
      monthlySnapshots: this.monthlyActiveUsers.size,
    };
  }
}
