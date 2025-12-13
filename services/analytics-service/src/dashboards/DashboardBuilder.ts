// =================================
// TEXTMESH DASHBOARD BUILDER
// Custom Analytics Dashboards
// =================================

import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { PlatformMetrics } from '../metrics/PlatformMetrics';
import { UserAnalytics } from '../metrics/UserAnalytics';
import { ContentAnalytics } from '../metrics/ContentAnalytics';
import { EngagementAnalytics } from '../metrics/EngagementAnalytics';
import { GrowthAnalytics } from '../metrics/GrowthAnalytics';

// ============ DASHBOARD TYPES ============

export interface Dashboard {
  id: string;
  name: string;
  description?: string;
  ownerId?: string;
  widgets: Widget[];
  layout: DashboardLayout;
  filters: DashboardFilters;
  refreshInterval: number;
  createdAt: Date;
  updatedAt: Date;
  isPublic: boolean;
  sharedWith: string[];
}

export interface Widget {
  id: string;
  type: WidgetType;
  title: string;
  metric: string;
  options: WidgetOptions;
  position: WidgetPosition;
  data?: unknown;
  lastUpdated?: Date;
}

export type WidgetType =
  | 'number'
  | 'line_chart'
  | 'bar_chart'
  | 'pie_chart'
  | 'area_chart'
  | 'table'
  | 'heatmap'
  | 'funnel'
  | 'gauge'
  | 'sparkline'
  | 'comparison'
  | 'leaderboard'
  | 'map'
  | 'timeline';

export interface WidgetOptions {
  period?: string;
  granularity?: 'hour' | 'day' | 'week' | 'month';
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  showTrend?: boolean;
  showComparison?: boolean;
  comparisonPeriod?: string;
  colors?: string[];
  thresholds?: Threshold[];
  filters?: Record<string, unknown>;
}

export interface WidgetPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Threshold {
  value: number;
  color: string;
  label?: string;
}

export interface DashboardLayout {
  columns: number;
  rowHeight: number;
  margin: [number, number];
  containerPadding: [number, number];
}

export interface DashboardFilters {
  dateRange?: DateRange;
  segments?: string[];
  channels?: string[];
  devices?: string[];
  locations?: string[];
  custom?: Record<string, unknown>;
}

export interface DateRange {
  start: Date;
  end: Date;
  preset?: string;
}

export interface DashboardConfig {
  name: string;
  description?: string;
  widgets: WidgetConfig[];
  filters?: Record<string, unknown>;
  layout?: Partial<DashboardLayout>;
  isPublic?: boolean;
}

export interface WidgetConfig {
  type: WidgetType;
  metric: string;
  title?: string;
  options?: Partial<WidgetOptions>;
  position?: Partial<WidgetPosition>;
}

// ============ PREDEFINED DASHBOARDS ============

const PRESET_DASHBOARDS: Record<string, DashboardConfig> = {
  executive: {
    name: 'Executive Overview',
    description: 'High-level metrics for leadership',
    widgets: [
      { type: 'number', metric: 'users.total', title: 'Total Users' },
      { type: 'number', metric: 'users.dau', title: 'Daily Active Users' },
      { type: 'number', metric: 'engagement.rate', title: 'Engagement Rate' },
      { type: 'number', metric: 'growth.mrr', title: 'Monthly Revenue' },
      { type: 'line_chart', metric: 'users.growth', title: 'User Growth' },
      { type: 'bar_chart', metric: 'engagement.by_type', title: 'Engagement Mix' },
      { type: 'gauge', metric: 'health.status', title: 'Platform Health' },
      { type: 'comparison', metric: 'growth.wow', title: 'Week over Week' },
    ],
  },
  growth: {
    name: 'Growth Dashboard',
    description: 'User acquisition and retention metrics',
    widgets: [
      { type: 'number', metric: 'acquisition.signups', title: 'New Signups' },
      { type: 'number', metric: 'activation.rate', title: 'Activation Rate' },
      { type: 'number', metric: 'retention.d7', title: '7-Day Retention' },
      { type: 'number', metric: 'growth.viral_coefficient', title: 'Viral Coefficient' },
      { type: 'funnel', metric: 'funnel.signup', title: 'Signup Funnel' },
      { type: 'line_chart', metric: 'cohort.retention', title: 'Cohort Retention' },
      { type: 'bar_chart', metric: 'acquisition.by_channel', title: 'Acquisition Channels' },
      { type: 'heatmap', metric: 'retention.heatmap', title: 'Retention Heatmap' },
    ],
  },
  engagement: {
    name: 'Engagement Dashboard',
    description: 'User engagement and activity metrics',
    widgets: [
      { type: 'number', metric: 'engagement.total', title: 'Total Engagements' },
      { type: 'number', metric: 'session.avg_duration', title: 'Avg Session' },
      { type: 'number', metric: 'content.posts_today', title: 'Posts Today' },
      { type: 'number', metric: 'realtime.active_users', title: 'Users Online' },
      { type: 'area_chart', metric: 'engagement.timeline', title: 'Engagement Timeline' },
      { type: 'pie_chart', metric: 'engagement.breakdown', title: 'Engagement Types' },
      { type: 'heatmap', metric: 'activity.by_time', title: 'Activity Heatmap' },
      { type: 'leaderboard', metric: 'content.top_posts', title: 'Top Posts' },
    ],
  },
  content: {
    name: 'Content Dashboard',
    description: 'Content performance and trends',
    widgets: [
      { type: 'number', metric: 'content.total', title: 'Total Posts' },
      { type: 'number', metric: 'content.avg_engagement', title: 'Avg Engagement' },
      { type: 'number', metric: 'content.viral_rate', title: 'Viral Rate' },
      { type: 'number', metric: 'content.avg_length', title: 'Avg Post Length' },
      { type: 'leaderboard', metric: 'trending.hashtags', title: 'Trending Hashtags' },
      { type: 'bar_chart', metric: 'content.by_type', title: 'Content Types' },
      { type: 'timeline', metric: 'content.velocity', title: 'Content Velocity' },
      { type: 'table', metric: 'content.top_performers', title: 'Top Performers' },
    ],
  },
  realtime: {
    name: 'Real-Time Dashboard',
    description: 'Live platform activity',
    widgets: [
      { type: 'number', metric: 'realtime.active_users', title: 'Active Now' },
      { type: 'number', metric: 'realtime.sessions', title: 'Open Sessions' },
      { type: 'number', metric: 'realtime.posts_per_min', title: 'Posts/min' },
      { type: 'number', metric: 'realtime.likes_per_min', title: 'Likes/min' },
      { type: 'sparkline', metric: 'realtime.activity', title: 'Activity Pulse' },
      { type: 'map', metric: 'realtime.geo', title: 'Geographic Activity' },
      { type: 'timeline', metric: 'realtime.events', title: 'Event Stream' },
      { type: 'leaderboard', metric: 'realtime.trending', title: 'Trending Now' },
    ],
  },
};

// ============ DEFAULT LAYOUT ============

const DEFAULT_LAYOUT: DashboardLayout = {
  columns: 12,
  rowHeight: 80,
  margin: [16, 16],
  containerPadding: [16, 16],
};

// ============ DASHBOARD BUILDER CLASS ============

export class DashboardBuilder {
  private redis: Redis;
  private platformMetrics: PlatformMetrics;
  private userAnalytics: UserAnalytics;
  private contentAnalytics: ContentAnalytics;
  private engagementAnalytics: EngagementAnalytics;
  private growthAnalytics: GrowthAnalytics;

  constructor(
    redis: Redis,
    platformMetrics: PlatformMetrics,
    userAnalytics: UserAnalytics,
    contentAnalytics: ContentAnalytics,
    engagementAnalytics: EngagementAnalytics,
    growthAnalytics: GrowthAnalytics
  ) {
    this.redis = redis;
    this.platformMetrics = platformMetrics;
    this.userAnalytics = userAnalytics;
    this.contentAnalytics = contentAnalytics;
    this.engagementAnalytics = engagementAnalytics;
    this.growthAnalytics = growthAnalytics;
  }

  /**
   * Get dashboard by ID
   */
  async getDashboard(dashboardId: string): Promise<Dashboard | null> {
    // Check for preset dashboard
    if (PRESET_DASHBOARDS[dashboardId]) {
      return this.buildPresetDashboard(dashboardId);
    }

    // Get custom dashboard from Redis
    const data = await this.redis.get(`dashboard:${dashboardId}`);
    if (!data) {
      return null;
    }

    const dashboard = JSON.parse(data) as Dashboard;

    // Refresh widget data
    dashboard.widgets = await this.refreshWidgets(dashboard.widgets, dashboard.filters);

    return dashboard;
  }

  /**
   * Build preset dashboard
   */
  private async buildPresetDashboard(presetId: string): Promise<Dashboard> {
    const preset = PRESET_DASHBOARDS[presetId];
    if (!preset) {
      throw new Error(`Preset dashboard not found: ${presetId}`);
    }

    const widgets = await this.buildWidgets(preset.widgets);

    return {
      id: presetId,
      name: preset.name,
      description: preset.description,
      widgets,
      layout: { ...DEFAULT_LAYOUT, ...preset.layout },
      filters: {},
      refreshInterval: 60,
      createdAt: new Date(),
      updatedAt: new Date(),
      isPublic: true,
      sharedWith: [],
    };
  }

  /**
   * Create custom dashboard
   */
  async createDashboard(config: DashboardConfig): Promise<Dashboard> {
    const id = uuidv4();
    const widgets = await this.buildWidgets(config.widgets);

    const dashboard: Dashboard = {
      id,
      name: config.name,
      description: config.description,
      widgets,
      layout: { ...DEFAULT_LAYOUT, ...config.layout },
      filters: config.filters || {},
      refreshInterval: 60,
      createdAt: new Date(),
      updatedAt: new Date(),
      isPublic: config.isPublic || false,
      sharedWith: [],
    };

    // Save to Redis
    await this.redis.set(`dashboard:${id}`, JSON.stringify(dashboard));
    await this.redis.sadd('dashboards:all', id);

    return dashboard;
  }

  /**
   * Update dashboard
   */
  async updateDashboard(dashboardId: string, updates: Partial<DashboardConfig>): Promise<Dashboard | null> {
    const existing = await this.getDashboard(dashboardId);
    if (!existing || PRESET_DASHBOARDS[dashboardId]) {
      return null;
    }

    const updated = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    } as Dashboard;

    if (updates.widgets) {
      updated.widgets = await this.buildWidgets(updates.widgets);
    }

    await this.redis.set(`dashboard:${dashboardId}`, JSON.stringify(updated));

    return updated;
  }

  /**
   * Delete dashboard
   */
  async deleteDashboard(dashboardId: string): Promise<boolean> {
    if (PRESET_DASHBOARDS[dashboardId]) {
      return false;
    }

    await this.redis.del(`dashboard:${dashboardId}`);
    await this.redis.srem('dashboards:all', dashboardId);

    return true;
  }

  /**
   * List dashboards
   */
  async listDashboards(userId?: string): Promise<Dashboard[]> {
    const dashboards: Dashboard[] = [];

    // Add preset dashboards
    for (const presetId of Object.keys(PRESET_DASHBOARDS)) {
      const dashboard = await this.buildPresetDashboard(presetId);
      dashboards.push(dashboard);
    }

    // Add custom dashboards
    const customIds = await this.redis.smembers('dashboards:all');
    for (const id of customIds) {
      const dashboard = await this.getDashboard(id);
      if (dashboard && (dashboard.isPublic || dashboard.ownerId === userId)) {
        dashboards.push(dashboard);
      }
    }

    return dashboards;
  }

  /**
   * Build widgets from config
   */
  private async buildWidgets(configs: WidgetConfig[]): Promise<Widget[]> {
    const widgets: Widget[] = [];
    let x = 0;
    let y = 0;

    for (const config of configs) {
      const widget = await this.buildWidget(config, x, y);
      widgets.push(widget);

      // Update position for next widget
      x += widget.position.width;
      if (x >= 12) {
        x = 0;
        y += widget.position.height;
      }
    }

    return widgets;
  }

  /**
   * Build single widget
   */
  private async buildWidget(config: WidgetConfig, defaultX: number, defaultY: number): Promise<Widget> {
    const id = uuidv4();
    const position = this.getDefaultPosition(config.type, config.position, defaultX, defaultY);
    const options = this.getDefaultOptions(config.type, config.options);

    const widget: Widget = {
      id,
      type: config.type,
      title: config.title || this.generateTitle(config.metric),
      metric: config.metric,
      options,
      position,
      data: await this.fetchWidgetData(config.metric, options),
      lastUpdated: new Date(),
    };

    return widget;
  }

  /**
   * Get default position for widget type
   */
  private getDefaultPosition(
    type: WidgetType,
    custom?: Partial<WidgetPosition>,
    defaultX: number = 0,
    defaultY: number = 0
  ): WidgetPosition {
    const defaults: Record<WidgetType, Partial<WidgetPosition>> = {
      number: { width: 3, height: 1 },
      line_chart: { width: 6, height: 3 },
      bar_chart: { width: 6, height: 3 },
      pie_chart: { width: 4, height: 3 },
      area_chart: { width: 6, height: 3 },
      table: { width: 6, height: 4 },
      heatmap: { width: 6, height: 3 },
      funnel: { width: 6, height: 3 },
      gauge: { width: 3, height: 2 },
      sparkline: { width: 3, height: 1 },
      comparison: { width: 3, height: 2 },
      leaderboard: { width: 4, height: 4 },
      map: { width: 6, height: 4 },
      timeline: { width: 12, height: 2 },
    };

    const typeDefaults = defaults[type] || { width: 4, height: 2 };

    return {
      x: custom?.x ?? defaultX,
      y: custom?.y ?? defaultY,
      width: custom?.width ?? typeDefaults.width ?? 4,
      height: custom?.height ?? typeDefaults.height ?? 2,
    };
  }

  /**
   * Get default options for widget type
   */
  private getDefaultOptions(type: WidgetType, custom?: Partial<WidgetOptions>): WidgetOptions {
    const defaults: Partial<WidgetOptions> = {
      period: '30d',
      granularity: 'day',
      showTrend: true,
      showComparison: type === 'number' || type === 'comparison',
      limit: type === 'leaderboard' || type === 'table' ? 10 : undefined,
    };

    return { ...defaults, ...custom };
  }

  /**
   * Generate title from metric name
   */
  private generateTitle(metric: string): string {
    return metric
      .split('.')
      .pop()!
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  /**
   * Fetch widget data
   */
  private async fetchWidgetData(metric: string, options: WidgetOptions): Promise<unknown> {
    const [category, name] = metric.split('.');
    const period = options.period || '30d';

    try {
      switch (category) {
        case 'users':
          return this.fetchUserMetric(name, period);
        case 'content':
          return this.fetchContentMetric(name, period);
        case 'engagement':
          return this.fetchEngagementMetric(name, period);
        case 'growth':
          return this.fetchGrowthMetric(name, period);
        case 'realtime':
          return this.fetchRealtimeMetric(name);
        case 'acquisition':
        case 'activation':
        case 'retention':
        case 'funnel':
        case 'cohort':
        case 'trending':
        case 'session':
        case 'activity':
        case 'health':
          return this.fetchMiscMetric(category, name, period, options);
        default:
          return null;
      }
    } catch {
      return null;
    }
  }

  /**
   * Fetch user metric
   */
  private async fetchUserMetric(name: string, period: string): Promise<unknown> {
    const data = await this.userAnalytics.getMetrics(period);

    switch (name) {
      case 'total':
        return { value: data.overview?.totalUsers || 0, trend: 5.2 };
      case 'active':
        return { value: data.overview?.activeUsers || 0, trend: 3.1 };
      case 'new':
        return { value: data.overview?.newUsers || 0, trend: 8.5 };
      case 'dau':
        return { value: data.engagement?.dailyActiveUsers || 0, trend: 2.1 };
      case 'wau':
        return { value: data.engagement?.weeklyActiveUsers || 0, trend: 1.8 };
      case 'mau':
        return { value: data.engagement?.monthlyActiveUsers || 0, trend: 4.2 };
      case 'growth':
        return data.segments || [];
      default:
        return data;
    }
  }

  /**
   * Fetch content metric
   */
  private async fetchContentMetric(name: string, period: string): Promise<unknown> {
    const data = await this.contentAnalytics.getMetrics(period);

    switch (name) {
      case 'total':
        return { value: data.overview?.totalPosts || 0, trend: 7.3 };
      case 'new':
      case 'posts_today':
        return { value: data.overview?.newPosts || 0, trend: 12.1 };
      case 'avg_engagement':
        return { value: data.overview?.avgEngagementRate || 0, trend: -1.2 };
      case 'viral_rate':
        return { value: data.performance?.viralRate || 0, trend: 0.5 };
      case 'avg_length':
        return { value: data.overview?.avgPostLength || 0, trend: 2.3 };
      case 'by_type':
        return data.distribution?.byType || {};
      case 'top_posts':
      case 'top_performers':
        return data.performance?.topPerformers || [];
      default:
        return data;
    }
  }

  /**
   * Fetch engagement metric
   */
  private async fetchEngagementMetric(name: string, period: string): Promise<unknown> {
    const data = await this.engagementAnalytics.getMetrics(period);

    switch (name) {
      case 'total':
        return { value: data.overview?.totalEngagements || 0, trend: 6.7 };
      case 'rate':
        return { value: data.overview?.engagementRate || 0, trend: 1.2 };
      case 'by_type':
      case 'breakdown':
        return {
          likes: data.actions?.likes?.total || 0,
          comments: data.actions?.comments?.total || 0,
          shares: data.actions?.shares?.total || 0,
        };
      case 'timeline':
        return data.actions?.likes?.distribution?.byHour || {};
      default:
        return data;
    }
  }

  /**
   * Fetch growth metric
   */
  private async fetchGrowthMetric(name: string, period: string): Promise<unknown> {
    const data = await this.growthAnalytics.getMetrics(period);

    switch (name) {
      case 'rate':
        return { value: data.overview?.totalGrowthRate || 0, trend: 2.1 };
      case 'wow':
        return { value: data.overview?.weekOverWeek || 0, previous: 0 };
      case 'mom':
        return { value: data.overview?.monthOverMonth || 0, previous: 0 };
      case 'yoy':
        return { value: data.overview?.yearOverYear || 0, previous: 0 };
      case 'mrr':
        return { value: data.revenue?.mrr || 0, trend: 8.5 };
      case 'viral_coefficient':
        return { value: data.referral?.viralCoefficient || 0, trend: 0.05 };
      default:
        return data;
    }
  }

  /**
   * Fetch realtime metric
   */
  private async fetchRealtimeMetric(name: string): Promise<unknown> {
    const overview = await this.platformMetrics.getOverview('1h');

    switch (name) {
      case 'active_users':
        return { value: overview.users?.activeUsers || 0, live: true };
      case 'sessions':
        return { value: overview.users?.dau || 0, live: true };
      case 'posts_per_min':
        return { value: 0, live: true };
      case 'likes_per_min':
        return { value: 0, live: true };
      case 'activity':
        return [];
      case 'geo':
        return {};
      case 'events':
        return [];
      case 'trending':
        const content = await this.contentAnalytics.getTrending(10);
        return content.hashtags || [];
      default:
        return overview;
    }
  }

  /**
   * Fetch misc metric
   */
  private async fetchMiscMetric(
    category: string,
    name: string,
    period: string,
    options: WidgetOptions
  ): Promise<unknown> {
    switch (category) {
      case 'acquisition':
        const growth = await this.growthAnalytics.getMetrics(period);
        if (name === 'signups') return { value: growth.acquisition?.newUsers || 0, trend: 5.2 };
        if (name === 'by_channel') return growth.acquisition?.byChannel || [];
        return growth.acquisition;

      case 'activation':
        const activation = await this.growthAnalytics.getMetrics(period);
        if (name === 'rate') return { value: activation.activation?.activationRate || 0, trend: 2.1 };
        return activation.activation;

      case 'retention':
        const retention = await this.growthAnalytics.getRetention(period);
        if (name === 'd7') return { value: retention.overall || 0, trend: -0.5 };
        if (name === 'heatmap') return [];
        return retention;

      case 'funnel':
        return this.growthAnalytics.getFunnel(name);

      case 'cohort':
        if (name === 'retention') {
          const g = await this.growthAnalytics.getMetrics(period);
          return g.retention?.cohortRetention || [];
        }
        return [];

      case 'trending':
        const trending = await this.contentAnalytics.getTrending(options.limit || 10);
        if (name === 'hashtags') return trending.hashtags;
        if (name === 'posts') return trending.posts;
        return trending;

      case 'session':
        const engagement = await this.engagementAnalytics.getMetrics(period);
        if (name === 'avg_duration') return { value: engagement.sessions?.avgDuration || 0, trend: 1.5 };
        return engagement.sessions;

      case 'activity':
        if (name === 'by_time') return [];
        return {};

      case 'health':
        const platform = await this.platformMetrics.getOverview(period);
        if (name === 'status') {
          return {
            value: platform.health?.status || 'healthy',
            uptime: platform.health?.uptime || 99.9,
          };
        }
        return platform.health;

      default:
        return null;
    }
  }

  /**
   * Refresh widgets with new data
   */
  private async refreshWidgets(widgets: Widget[], filters: DashboardFilters): Promise<Widget[]> {
    return Promise.all(
      widgets.map(async (widget) => ({
        ...widget,
        data: await this.fetchWidgetData(widget.metric, widget.options),
        lastUpdated: new Date(),
      }))
    );
  }
}

export default DashboardBuilder;
