/**
 * Analytics Types
 */

export type EventCategory =
  | 'user'
  | 'content'
  | 'engagement'
  | 'navigation'
  | 'conversion'
  | 'error'
  | 'performance';

export type EventAction =
  // User events
  | 'signup'
  | 'login'
  | 'logout'
  | 'profile_update'
  | 'settings_change'
  // Content events
  | 'post_create'
  | 'post_edit'
  | 'post_delete'
  | 'post_view'
  | 'comment_create'
  | 'media_upload'
  // Engagement events
  | 'like'
  | 'unlike'
  | 'share'
  | 'bookmark'
  | 'follow'
  | 'unfollow'
  | 'mention'
  | 'reply'
  // Navigation events
  | 'page_view'
  | 'search'
  | 'click'
  | 'scroll'
  // Conversion events
  | 'subscription'
  | 'purchase'
  | 'referral'
  // Error events
  | 'error'
  | 'crash'
  // Performance events
  | 'page_load'
  | 'api_call'
  | 'render';

export interface AnalyticsEvent {
  id: string;
  timestamp: Date;
  category: EventCategory;
  action: EventAction;
  userId?: string;
  sessionId?: string;
  deviceId?: string;
  properties: Record<string, unknown>;
  metadata: EventMetadata;
}

export interface EventMetadata {
  ip?: string;
  userAgent?: string;
  platform?: 'web' | 'ios' | 'android' | 'api';
  appVersion?: string;
  country?: string;
  city?: string;
  referrer?: string;
  url?: string;
}

export interface MetricValue {
  count: number;
  sum: number;
  min: number;
  max: number;
  avg: number;
}

export interface TimeSeriesData {
  timestamp: Date;
  value: number;
  dimensions?: Record<string, string>;
}

export interface AggregatedMetric {
  name: string;
  period: 'minute' | 'hour' | 'day' | 'week' | 'month';
  timestamp: Date;
  value: MetricValue;
  dimensions: Record<string, string>;
}

export interface DashboardMetrics {
  // User metrics
  activeUsers: {
    dau: number;
    wau: number;
    mau: number;
  };
  newUsers: number;
  churnRate: number;

  // Content metrics
  postsCreated: number;
  commentsCreated: number;
  mediaUploaded: number;

  // Engagement metrics
  likes: number;
  shares: number;
  avgEngagementRate: number;

  // Performance metrics
  avgPageLoadTime: number;
  errorRate: number;
  apiLatencyP99: number;
}

export interface UserAnalytics {
  userId: string;
  firstSeen: Date;
  lastSeen: Date;
  totalSessions: number;
  totalPageViews: number;
  totalEvents: number;
  engagementScore: number;
  retentionDays: number[];
  topActions: Array<{ action: string; count: number }>;
}

export interface ContentAnalytics {
  contentId: string;
  contentType: string;
  views: number;
  uniqueViewers: number;
  likes: number;
  shares: number;
  comments: number;
  avgViewDuration: number;
  engagementRate: number;
}

export interface FunnelStep {
  name: string;
  eventAction: EventAction;
  count: number;
  conversionRate: number;
  dropoffRate: number;
}

export interface Funnel {
  name: string;
  steps: FunnelStep[];
  overallConversionRate: number;
}

export interface Cohort {
  name: string;
  startDate: Date;
  userCount: number;
  retentionByWeek: number[];
}

export interface AnalyticsConfig {
  kafka: {
    brokers: string[];
    topic: string;
    groupId: string;
  };
  redis: {
    host: string;
    port: number;
  };
  retention: {
    rawEvents: number; // days
    aggregatedMetrics: number; // days
  };
  sampling: {
    enabled: boolean;
    rate: number;
  };
}
