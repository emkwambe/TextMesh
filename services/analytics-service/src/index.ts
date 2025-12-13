// =================================
// TEXTMESH ANALYTICS SERVICE
// Platform Metrics & Dashboards
// =================================

import express, { Request, Response, Application } from 'express';
import { createLogger } from '@textmesh/logger';
import { getRedisClient, getPrismaClient } from '@textmesh/db-client';

const app: Application = express();
const logger = createLogger({ service: 'analytics-service' });
const PORT = process.env['PORT'] || 3012;

app.use(express.json());

// ============ IMPORTS ============

import { PlatformMetrics } from './metrics/PlatformMetrics';
import { UserAnalytics } from './metrics/UserAnalytics';
import { ContentAnalytics } from './metrics/ContentAnalytics';
import { EngagementAnalytics } from './metrics/EngagementAnalytics';
import { GrowthAnalytics } from './metrics/GrowthAnalytics';
import { RealtimeTracker } from './realtime/RealtimeTracker';
import { DashboardBuilder } from './dashboards/DashboardBuilder';
import { ReportGenerator } from './reports/ReportGenerator';

// ============ SERVICE INSTANCES ============

let platformMetrics: PlatformMetrics;
let userAnalytics: UserAnalytics;
let contentAnalytics: ContentAnalytics;
let engagementAnalytics: EngagementAnalytics;
let growthAnalytics: GrowthAnalytics;
let realtimeTracker: RealtimeTracker;
let dashboardBuilder: DashboardBuilder;
let reportGenerator: ReportGenerator;

// ============ PLATFORM METRICS ENDPOINTS ============

// Get platform overview
app.get('/api/analytics/overview', async (req: Request, res: Response) => {
  try {
    const { period = '24h' } = req.query;
    const overview = await platformMetrics.getOverview(period as string);

    res.json({
      success: true,
      data: overview,
    });
  } catch (error) {
    logger.error('Failed to get overview', error);
    res.status(500).json({ success: false, error: 'Failed to get overview' });
  }
});

// Get real-time stats
app.get('/api/analytics/realtime', async (_req: Request, res: Response) => {
  try {
    const stats = await realtimeTracker.getCurrentStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Failed to get realtime stats', error);
    res.status(500).json({ success: false, error: 'Failed to get stats' });
  }
});

// ============ USER ANALYTICS ENDPOINTS ============

// Get user analytics
app.get('/api/analytics/users', async (req: Request, res: Response) => {
  try {
    const { period = '30d', metric } = req.query;
    const analytics = await userAnalytics.getMetrics(
      period as string,
      metric as string | undefined
    );

    res.json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    logger.error('Failed to get user analytics', error);
    res.status(500).json({ success: false, error: 'Failed to get analytics' });
  }
});

// Get user cohort analysis
app.get('/api/analytics/users/cohorts', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, granularity = 'week' } = req.query;
    const cohorts = await userAnalytics.getCohortAnalysis({
      startDate: startDate as string,
      endDate: endDate as string,
      granularity: granularity as 'day' | 'week' | 'month',
    });

    res.json({
      success: true,
      data: cohorts,
    });
  } catch (error) {
    logger.error('Failed to get cohort analysis', error);
    res.status(500).json({ success: false, error: 'Failed to get cohorts' });
  }
});

// Get user demographics
app.get('/api/analytics/users/demographics', async (_req: Request, res: Response) => {
  try {
    const demographics = await userAnalytics.getDemographics();

    res.json({
      success: true,
      data: demographics,
    });
  } catch (error) {
    logger.error('Failed to get demographics', error);
    res.status(500).json({ success: false, error: 'Failed to get demographics' });
  }
});

// ============ CONTENT ANALYTICS ENDPOINTS ============

// Get content analytics
app.get('/api/analytics/content', async (req: Request, res: Response) => {
  try {
    const { period = '30d' } = req.query;
    const analytics = await contentAnalytics.getMetrics(period as string);

    res.json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    logger.error('Failed to get content analytics', error);
    res.status(500).json({ success: false, error: 'Failed to get analytics' });
  }
});

// Get trending content
app.get('/api/analytics/content/trending', async (req: Request, res: Response) => {
  try {
    const { limit = 50 } = req.query;
    const trending = await contentAnalytics.getTrending(Number(limit));

    res.json({
      success: true,
      data: trending,
    });
  } catch (error) {
    logger.error('Failed to get trending content', error);
    res.status(500).json({ success: false, error: 'Failed to get trending' });
  }
});

// Get content performance
app.get('/api/analytics/content/:contentId', async (req: Request, res: Response) => {
  try {
    const { contentId } = req.params;
    const performance = await contentAnalytics.getContentPerformance(contentId);

    res.json({
      success: true,
      data: performance,
    });
  } catch (error) {
    logger.error('Failed to get content performance', error);
    res.status(500).json({ success: false, error: 'Failed to get performance' });
  }
});

// ============ ENGAGEMENT ANALYTICS ENDPOINTS ============

// Get engagement metrics
app.get('/api/analytics/engagement', async (req: Request, res: Response) => {
  try {
    const { period = '30d' } = req.query;
    const analytics = await engagementAnalytics.getMetrics(period as string);

    res.json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    logger.error('Failed to get engagement analytics', error);
    res.status(500).json({ success: false, error: 'Failed to get analytics' });
  }
});

// Get engagement patterns
app.get('/api/analytics/engagement/patterns', async (_req: Request, res: Response) => {
  try {
    const patterns = await engagementAnalytics.getPatterns();

    res.json({
      success: true,
      data: patterns,
    });
  } catch (error) {
    logger.error('Failed to get engagement patterns', error);
    res.status(500).json({ success: false, error: 'Failed to get patterns' });
  }
});

// ============ GROWTH ANALYTICS ENDPOINTS ============

// Get growth metrics
app.get('/api/analytics/growth', async (req: Request, res: Response) => {
  try {
    const { period = '30d' } = req.query;
    const analytics = await growthAnalytics.getMetrics(period as string);

    res.json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    logger.error('Failed to get growth analytics', error);
    res.status(500).json({ success: false, error: 'Failed to get analytics' });
  }
});

// Get retention metrics
app.get('/api/analytics/growth/retention', async (req: Request, res: Response) => {
  try {
    const { period = '30d' } = req.query;
    const retention = await growthAnalytics.getRetention(period as string);

    res.json({
      success: true,
      data: retention,
    });
  } catch (error) {
    logger.error('Failed to get retention', error);
    res.status(500).json({ success: false, error: 'Failed to get retention' });
  }
});

// Get funnel analysis
app.get('/api/analytics/growth/funnel', async (req: Request, res: Response) => {
  try {
    const { funnelId = 'signup' } = req.query;
    const funnel = await growthAnalytics.getFunnel(funnelId as string);

    res.json({
      success: true,
      data: funnel,
    });
  } catch (error) {
    logger.error('Failed to get funnel', error);
    res.status(500).json({ success: false, error: 'Failed to get funnel' });
  }
});

// ============ DASHBOARD ENDPOINTS ============

// Get dashboard data
app.get('/api/analytics/dashboard/:dashboardId', async (req: Request, res: Response) => {
  try {
    const { dashboardId } = req.params;
    const dashboard = await dashboardBuilder.getDashboard(dashboardId);

    res.json({
      success: true,
      data: dashboard,
    });
  } catch (error) {
    logger.error('Failed to get dashboard', error);
    res.status(500).json({ success: false, error: 'Failed to get dashboard' });
  }
});

// Create custom dashboard
app.post('/api/analytics/dashboard', async (req: Request, res: Response) => {
  try {
    const config = req.body;
    const dashboard = await dashboardBuilder.createDashboard(config as any);

    res.json({
      success: true,
      data: dashboard,
    });
  } catch (error) {
    logger.error('Failed to create dashboard', error);
    res.status(500).json({ success: false, error: 'Failed to create dashboard' });
  }
});

// ============ REPORT ENDPOINTS ============

// Generate report
app.post('/api/analytics/report', async (req: Request, res: Response) => {
  try {
    const config = req.body as ReportConfig;
    const report = await reportGenerator.generateReport(config);

    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    logger.error('Failed to generate report', error);
    res.status(500).json({ success: false, error: 'Failed to generate report' });
  }
});

// Get scheduled reports
app.get('/api/analytics/reports', async (_req: Request, res: Response) => {
  try {
    const reports = await reportGenerator.getScheduledReports();

    res.json({
      success: true,
      data: reports,
    });
  } catch (error) {
    logger.error('Failed to get reports', error);
    res.status(500).json({ success: false, error: 'Failed to get reports' });
  }
});

// ============ EVENT TRACKING ============

// Track event
app.post('/api/analytics/track', async (req: Request, res: Response) => {
  try {
    const event = req.body;
    await realtimeTracker.trackEvent(event as any);

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to track event', error);
    res.status(500).json({ success: false, error: 'Failed to track' });
  }
});

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'healthy', service: 'analytics-service' });
});

// ============ TYPES ============

interface DashboardConfig {
  name: string;
  widgets: WidgetConfig[];
  filters?: Record<string, unknown>;
}

interface WidgetConfig {
  type: string;
  metric: string;
  options?: Record<string, unknown>;
}

interface ReportConfig {
  type: string;
  period: string;
  metrics: string[];
  format: 'json' | 'csv' | 'pdf';
}

interface AnalyticsEvent {
  type: string;
  userId?: string;
  properties: Record<string, unknown>;
  timestamp?: string;
}

// ============ STARTUP ============

async function main() {
  try {
    const redis = getRedisClient();
    const prisma = getPrismaClient();

    // Initialize services
    realtimeTracker = new RealtimeTracker(redis);
    platformMetrics = new PlatformMetrics(redis, prisma);
    userAnalytics = new UserAnalytics(redis, prisma);
    contentAnalytics = new ContentAnalytics(redis, prisma);
    engagementAnalytics = new EngagementAnalytics(redis, prisma);
    growthAnalytics = new GrowthAnalytics(redis, prisma);
    dashboardBuilder = new DashboardBuilder(redis, platformMetrics, userAnalytics, contentAnalytics, engagementAnalytics, growthAnalytics);
    reportGenerator = new ReportGenerator(redis, prisma, dashboardBuilder);

    app.listen(PORT, () => {
      logger.info(`Analytics service running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start analytics service', error);
    process.exit(1);
  }
}

main();

export { app };
