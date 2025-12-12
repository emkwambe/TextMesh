/**
 * Analytics Service
 *
 * Main analytics API that combines all analytics functionality
 */

import { createLogger } from '@textmesh/logger';
import {
  AnalyticsEvent,
  AnalyticsConfig,
  EventCategory,
  EventAction,
  EventMetadata,
  DashboardMetrics,
  UserAnalytics,
  ContentAnalytics,
  TimeSeriesData,
  Funnel,
  Cohort,
} from './types';
import { EventCollector } from './event-collector';
import { MetricsAggregator } from './metrics-aggregator';
import { RealtimeAnalytics } from './realtime';
import { DashboardService } from './dashboard';

const logger = createLogger({ service: 'analytics-service', level: 'info' });

const DEFAULT_CONFIG: AnalyticsConfig = {
  kafka: {
    brokers: ['localhost:9092'],
    topic: 'analytics-events',
    groupId: 'analytics-consumer',
  },
  redis: {
    host: 'localhost',
    port: 6379,
  },
  retention: {
    rawEvents: 30, // days
    aggregatedMetrics: 365, // days
  },
  sampling: {
    enabled: false,
    rate: 1,
  },
};

export class AnalyticsService {
  private config: AnalyticsConfig;
  private collector: EventCollector;
  private aggregator: MetricsAggregator;
  private realtime: RealtimeAnalytics;
  private dashboard: DashboardService;
  private eventCount: number = 0;

  constructor(config: Partial<AnalyticsConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.aggregator = new MetricsAggregator();
    this.realtime = new RealtimeAnalytics();
    this.dashboard = new DashboardService(this.aggregator, this.realtime);

    this.collector = new EventCollector(
      {
        onFlush: async (events) => this.processEvents(events),
      },
      this.config.sampling.enabled ? this.config.sampling.rate : 1
    );

    logger.info('Analytics service initialized');
  }

  /**
   * Track an event
   */
  track(
    category: EventCategory,
    action: EventAction,
    properties: Record<string, unknown> = {},
    context: {
      userId?: string;
      sessionId?: string;
      deviceId?: string;
      metadata?: Partial<EventMetadata>;
    } = {}
  ): string | null {
    return this.collector.track(category, action, properties, context);
  }

  /**
   * Track user event
   */
  trackUser(
    action: 'signup' | 'login' | 'logout' | 'profile_update' | 'settings_change',
    userId: string,
    properties: Record<string, unknown> = {},
    metadata?: Partial<EventMetadata>
  ): string | null {
    return this.collector.trackUser(action, userId, properties, metadata);
  }

  /**
   * Track content event
   */
  trackContent(
    action: 'post_create' | 'post_edit' | 'post_delete' | 'post_view' | 'comment_create' | 'media_upload',
    contentId: string,
    userId?: string,
    properties: Record<string, unknown> = {},
    metadata?: Partial<EventMetadata>
  ): string | null {
    return this.collector.trackContent(action, contentId, userId, properties, metadata);
  }

  /**
   * Track engagement event
   */
  trackEngagement(
    action: 'like' | 'unlike' | 'share' | 'bookmark' | 'follow' | 'unfollow' | 'mention' | 'reply',
    targetId: string,
    userId?: string,
    properties: Record<string, unknown> = {},
    metadata?: Partial<EventMetadata>
  ): string | null {
    return this.collector.trackEngagement(action, targetId, userId, properties, metadata);
  }

  /**
   * Track page view
   */
  trackPageView(
    path: string,
    properties: Record<string, unknown> = {},
    context: {
      userId?: string;
      sessionId?: string;
      metadata?: Partial<EventMetadata>;
    } = {}
  ): string | null {
    return this.collector.trackNavigation('page_view', { path, ...properties }, context);
  }

  /**
   * Track search
   */
  trackSearch(
    query: string,
    resultCount: number,
    properties: Record<string, unknown> = {},
    context: {
      userId?: string;
      sessionId?: string;
      metadata?: Partial<EventMetadata>;
    } = {}
  ): string | null {
    return this.collector.trackNavigation(
      'search',
      { query, resultCount, ...properties },
      context
    );
  }

  /**
   * Track error
   */
  trackError(
    error: Error | string,
    properties: Record<string, unknown> = {},
    context: {
      userId?: string;
      sessionId?: string;
      metadata?: Partial<EventMetadata>;
    } = {}
  ): string | null {
    return this.collector.trackError(error, properties, context);
  }

  /**
   * Track performance
   */
  trackPerformance(
    action: 'page_load' | 'api_call' | 'render',
    durationMs: number,
    properties: Record<string, unknown> = {},
    context: {
      userId?: string;
      sessionId?: string;
      metadata?: Partial<EventMetadata>;
    } = {}
  ): string | null {
    return this.collector.trackPerformance(action, durationMs, properties, context);
  }

  /**
   * Process events batch
   */
  private async processEvents(events: AnalyticsEvent[]): Promise<void> {
    for (const event of events) {
      // Update aggregator
      this.aggregator.processEvent(event);

      // Update real-time
      this.realtime.processEvent(event);

      // Update dashboard
      this.dashboard.processEvent(event);

      this.eventCount++;
    }

    logger.debug('Processed events batch', { count: events.length });
  }

  /**
   * Get dashboard metrics
   */
  getDashboardMetrics(): DashboardMetrics {
    return this.dashboard.getDashboardMetrics();
  }

  /**
   * Get real-time metrics
   */
  getRealtimeMetrics() {
    return this.realtime.getMetrics();
  }

  /**
   * Get active user count
   */
  getActiveUserCount(): number {
    return this.realtime.getActiveUserCount();
  }

  /**
   * Get user analytics
   */
  getUserAnalytics(userId: string): UserAnalytics | null {
    return this.dashboard.getUserAnalytics(userId);
  }

  /**
   * Get content analytics
   */
  getContentAnalytics(contentId: string): ContentAnalytics | null {
    return this.dashboard.getContentAnalytics(contentId);
  }

  /**
   * Get time series data
   */
  getTimeSeries(
    metric: string,
    period: 'minute' | 'hour' | 'day',
    start: Date,
    end: Date,
    dimensions?: Record<string, string>
  ): TimeSeriesData[] {
    return this.aggregator.getTimeSeries(metric, period, start, end, dimensions);
  }

  /**
   * Get top content
   */
  getTopContent(limit: number = 10): ContentAnalytics[] {
    return this.dashboard.getTopContent(limit);
  }

  /**
   * Get top users
   */
  getTopUsers(limit: number = 10): UserAnalytics[] {
    return this.dashboard.getTopUsers(limit);
  }

  /**
   * Build funnel
   */
  buildFunnel(name: string, steps: EventAction[]): Funnel {
    return this.dashboard.buildFunnel(name, steps);
  }

  /**
   * Get cohort
   */
  getCohort(startDate: Date, name: string): Cohort {
    return this.dashboard.getCohort(startDate, name);
  }

  /**
   * Check if user is active
   */
  isUserActive(userId: string): boolean {
    return this.realtime.isUserActive(userId);
  }

  /**
   * Flush events
   */
  async flush(): Promise<void> {
    await this.collector.flush();
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalEvents: number;
    collector: ReturnType<EventCollector['getStats']>;
    aggregator: ReturnType<MetricsAggregator['getStats']>;
    realtime: ReturnType<RealtimeAnalytics['getStats']>;
    dashboard: ReturnType<DashboardService['getStats']>;
  } {
    return {
      totalEvents: this.eventCount,
      collector: this.collector.getStats(),
      aggregator: this.aggregator.getStats(),
      realtime: this.realtime.getStats(),
      dashboard: this.dashboard.getStats(),
    };
  }

  /**
   * Set sampling rate
   */
  setSamplingRate(rate: number): void {
    this.collector.setSamplingRate(rate);
  }

  /**
   * Shutdown
   */
  async shutdown(): Promise<void> {
    await this.collector.stop();
    this.aggregator.stop();
    this.realtime.stop();
    logger.info('Analytics service shutdown complete');
  }
}

// Export singleton factory
export function createAnalyticsService(config?: Partial<AnalyticsConfig>): AnalyticsService {
  return new AnalyticsService(config);
}
