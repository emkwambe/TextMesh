// =================================
// ANALYTICS EVENT SERVICE
// Logs key platform events for analytics tracking
// =================================

import { PrismaClient } from '@prisma/client';
import { Logger } from '@textmesh/logger';

export interface AnalyticsEventInput {
  eventType: string;
  userId?: string;
  groupId?: string;
  postId?: string;
  metadata?: Record<string, any>;
}

export class AnalyticsEventService {
  constructor(
    private prisma: PrismaClient,
    private logger: Logger
  ) {}

  /**
   * Track a generic analytics event
   */
  async trackEvent(input: AnalyticsEventInput): Promise<void> {
    try {
      await this.prisma.analyticsEvent.create({
        data: {
          eventType: input.eventType,
          userId: input.userId,
          groupId: input.groupId,
          postId: input.postId,
          metadata: input.metadata || null
        }
      });

      this.logger.debug('Event tracked', { eventType: input.eventType, userId: input.userId });
    } catch (error) {
      this.logger.error('Failed to track event', { error, input });
      // Don't throw - analytics failures shouldn't break the app
    }
  }

  /**
   * Track user signup/registration
   */
  async trackUserJoined(userId: string, metadata?: Record<string, any>): Promise<void> {
    await this.trackEvent({
      eventType: 'user_joined',
      userId,
      metadata
    });
  }

  /**
   * Track post creation
   */
  async trackPostCreated(userId: string, postId: string, groupId?: string, metadata?: Record<string, any>): Promise<void> {
    await this.trackEvent({
      eventType: 'post_created',
      userId,
      postId,
      groupId,
      metadata
    });
  }

  /**
   * Track post like
   */
  async trackPostLiked(userId: string, postId: string, postAuthorId: string, metadata?: Record<string, any>): Promise<void> {
    await this.trackEvent({
      eventType: 'post_liked',
      userId,
      postId,
      metadata: {
        ...metadata,
        postAuthorId
      }
    });
  }

  /**
   * Track group creation
   */
  async trackGroupCreated(userId: string, groupId: string, metadata?: Record<string, any>): Promise<void> {
    await this.trackEvent({
      eventType: 'group_created',
      userId,
      groupId,
      metadata
    });
  }

  /**
   * Track group join
   */
  async trackGroupJoined(userId: string, groupId: string, metadata?: Record<string, any>): Promise<void> {
    await this.trackEvent({
      eventType: 'group_joined',
      userId,
      groupId,
      metadata
    });
  }

  /**
   * Get event counts by type for a time period
   */
  async getEventCounts(startDate: Date, endDate: Date): Promise<Record<string, number>> {
    const events = await this.prisma.analyticsEvent.groupBy({
      by: ['eventType'],
      where: {
        timestamp: {
          gte: startDate,
          lte: endDate
        }
      },
      _count: {
        eventType: true
      }
    });

    const counts: Record<string, number> = {};
    for (const event of events) {
      counts[event.eventType] = event._count.eventType;
    }

    return counts;
  }

  /**
   * Get events timeline (count per hour/day)
   */
  async getEventsTimeline(
    eventType: string,
    startDate: Date,
    endDate: Date,
    granularity: 'hour' | 'day' = 'day'
  ): Promise<Array<{ timestamp: Date; count: number }>> {
    const events = await this.prisma.analyticsEvent.findMany({
      where: {
        eventType,
        timestamp: {
          gte: startDate,
          lte: endDate
        }
      },
      select: {
        timestamp: true
      },
      orderBy: {
        timestamp: 'asc'
      }
    });

    // Group by time bucket
    const buckets: Map<string, number> = new Map();

    for (const event of events) {
      const bucket = this.getTimeBucket(event.timestamp, granularity);
      buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
    }

    // Convert to array
    return Array.from(buckets.entries()).map(([timestamp, count]) => ({
      timestamp: new Date(timestamp),
      count
    }));
  }

  /**
   * Get top users by activity
   */
  async getTopUsers(eventType: string, startDate: Date, endDate: Date, limit: number = 10) {
    const events = await this.prisma.analyticsEvent.groupBy({
      by: ['userId'],
      where: {
        eventType,
        userId: { not: null },
        timestamp: {
          gte: startDate,
          lte: endDate
        }
      },
      _count: {
        userId: true
      },
      orderBy: {
        _count: {
          userId: 'desc'
        }
      },
      take: limit
    });

    return events.map(e => ({
      userId: e.userId!,
      count: e._count.userId
    }));
  }

  /**
   * Get top groups by activity
   */
  async getTopGroups(eventType: string, startDate: Date, endDate: Date, limit: number = 10) {
    const events = await this.prisma.analyticsEvent.groupBy({
      by: ['groupId'],
      where: {
        eventType,
        groupId: { not: null },
        timestamp: {
          gte: startDate,
          lte: endDate
        }
      },
      _count: {
        groupId: true
      },
      orderBy: {
        _count: {
          groupId: 'desc'
        }
      },
      take: limit
    });

    return events.map(e => ({
      groupId: e.groupId!,
      count: e._count.groupId
    }));
  }

  /**
   * Get platform overview metrics
   */
  async getPlatformOverview(startDate: Date, endDate: Date) {
    const [
      totalEvents,
      userJoined,
      postsCreated,
      postsLiked,
      groupsCreated,
      groupsJoined
    ] = await Promise.all([
      this.prisma.analyticsEvent.count({
        where: {
          timestamp: { gte: startDate, lte: endDate }
        }
      }),
      this.prisma.analyticsEvent.count({
        where: {
          eventType: 'user_joined',
          timestamp: { gte: startDate, lte: endDate }
        }
      }),
      this.prisma.analyticsEvent.count({
        where: {
          eventType: 'post_created',
          timestamp: { gte: startDate, lte: endDate }
        }
      }),
      this.prisma.analyticsEvent.count({
        where: {
          eventType: 'post_liked',
          timestamp: { gte: startDate, lte: endDate }
        }
      }),
      this.prisma.analyticsEvent.count({
        where: {
          eventType: 'group_created',
          timestamp: { gte: startDate, lte: endDate }
        }
      }),
      this.prisma.analyticsEvent.count({
        where: {
          eventType: 'group_joined',
          timestamp: { gte: startDate, lte: endDate }
        }
      })
    ]);

    return {
      totalEvents,
      userJoined,
      postsCreated,
      postsLiked,
      groupsCreated,
      groupsJoined,
      period: {
        startDate,
        endDate
      }
    };
  }

  /**
   * Helper: Get time bucket for grouping
   */
  private getTimeBucket(timestamp: Date, granularity: 'hour' | 'day'): string {
    if (granularity === 'hour') {
      const date = new Date(timestamp);
      date.setMinutes(0, 0, 0);
      return date.toISOString();
    } else {
      const date = new Date(timestamp);
      date.setHours(0, 0, 0, 0);
      return date.toISOString();
    }
  }
}
