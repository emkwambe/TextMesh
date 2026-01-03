// =================================
// ANALYTICS ROUTES
// Internal analytics dashboard endpoints
// =================================

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { Logger } from '@textmesh/logger';
import { AnalyticsEventService } from '../services/analytics-event.service.js';

export function analyticsRoutes(prisma: PrismaClient, logger: Logger): Router {
  const router = Router();
  const eventService = new AnalyticsEventService(prisma, logger);

  // Track event endpoint (for external services to log events)
  router.post('/events', async (req: Request, res: Response) => {
    const { eventType, userId, groupId, postId, metadata } = req.body;

    if (!eventType) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_EVENT_TYPE', message: 'Event type is required' }
      });
    }

    await eventService.trackEvent({
      eventType,
      userId,
      groupId,
      postId,
      metadata
    });

    res.json({ success: true, message: 'Event tracked' });
  });

  // Get platform overview
  router.get('/overview', async (req: Request, res: Response) => {
    const { period = '30d' } = req.query;

    const { startDate, endDate } = parsePeriod(period as string);
    const overview = await eventService.getPlatformOverview(startDate, endDate);

    res.json({ success: true, data: overview });
  });

  // Get event counts
  router.get('/events/counts', async (req: Request, res: Response) => {
    const { period = '30d' } = req.query;

    const { startDate, endDate } = parsePeriod(period as string);
    const counts = await eventService.getEventCounts(startDate, endDate);

    res.json({ success: true, data: { counts, period: { startDate, endDate } } });
  });

  // Get events timeline
  router.get('/events/timeline', async (req: Request, res: Response) => {
    const { eventType, period = '30d', granularity = 'day' } = req.query;

    if (!eventType) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_EVENT_TYPE', message: 'Event type is required' }
      });
    }

    const { startDate, endDate } = parsePeriod(period as string);
    const timeline = await eventService.getEventsTimeline(
      eventType as string,
      startDate,
      endDate,
      granularity as 'hour' | 'day'
    );

    res.json({ success: true, data: { timeline, eventType, period: { startDate, endDate } } });
  });

  // Get top users by activity
  router.get('/users/top', async (req: Request, res: Response) => {
    const { eventType = 'post_created', period = '30d', limit = '10' } = req.query;

    const { startDate, endDate } = parsePeriod(period as string);
    const topUsers = await eventService.getTopUsers(
      eventType as string,
      startDate,
      endDate,
      parseInt(limit as string, 10)
    );

    res.json({
      success: true,
      data: { topUsers, eventType, period: { startDate, endDate } }
    });
  });

  // Get top groups by activity
  router.get('/groups/top', async (req: Request, res: Response) => {
    const { eventType = 'post_created', period = '30d', limit = '10' } = req.query;

    const { startDate, endDate } = parsePeriod(period as string);
    const topGroups = await eventService.getTopGroups(
      eventType as string,
      startDate,
      endDate,
      parseInt(limit as string, 10)
    );

    res.json({
      success: true,
      data: { topGroups, eventType, period: { startDate, endDate } }
    });
  });

  // Dashboard summary endpoint
  router.get('/dashboard', async (req: Request, res: Response) => {
    const { period = '7d' } = req.query;
    const { startDate, endDate } = parsePeriod(period as string);

    const [overview, eventCounts, userGrowth, postTimeline, topUsers, topGroups] = await Promise.all([
      eventService.getPlatformOverview(startDate, endDate),
      eventService.getEventCounts(startDate, endDate),
      eventService.getEventsTimeline('user_joined', startDate, endDate, 'day'),
      eventService.getEventsTimeline('post_created', startDate, endDate, 'day'),
      eventService.getTopUsers('post_created', startDate, endDate, 5),
      eventService.getTopGroups('post_created', startDate, endDate, 5)
    ]);

    res.json({
      success: true,
      data: {
        overview,
        eventCounts,
        userGrowth,
        postTimeline,
        topUsers,
        topGroups,
        period: { startDate, endDate }
      }
    });
  });

  return router;
}

/**
 * Helper: Parse period string to date range
 */
function parsePeriod(period: string): { startDate: Date; endDate: Date } {
  const endDate = new Date();
  const startDate = new Date();

  const match = period.match(/^(\d+)([hdwm])$/);
  if (!match) {
    // Default to 30 days
    startDate.setDate(startDate.getDate() - 30);
    return { startDate, endDate };
  }

  const value = parseInt(match[1]!, 10);
  const unit = match[2];

  switch (unit) {
    case 'h':
      startDate.setHours(startDate.getHours() - value);
      break;
    case 'd':
      startDate.setDate(startDate.getDate() - value);
      break;
    case 'w':
      startDate.setDate(startDate.getDate() - value * 7);
      break;
    case 'm':
      startDate.setMonth(startDate.getMonth() - value);
      break;
  }

  return { startDate, endDate };
}
