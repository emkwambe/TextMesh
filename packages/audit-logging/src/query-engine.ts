import { Redis } from 'ioredis';
import {
  AuditEvent,
  AuditQueryFilters,
  AuditQueryOptions,
  AuditAggregation,
  AggregationType,
} from './types';

export class QueryEngine {
  private redis: Redis;
  private readonly eventPrefix = 'audit:event:';
  private readonly indexPrefix = 'audit:index:';

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async query(
    filters: AuditQueryFilters = {},
    options: AuditQueryOptions = {}
  ): Promise<{ events: AuditEvent[]; total: number }> {
    const {
      limit = 100,
      offset = 0,
      sortField = 'timestamp',
      sortDirection = 'desc',
    } = options;

    // Get candidate event IDs from indexes
    let eventIds = await this.getFilteredEventIds(filters);

    const total = eventIds.length;

    // Sort and paginate
    if (sortDirection === 'desc') {
      eventIds = eventIds.reverse();
    }
    eventIds = eventIds.slice(offset, offset + limit);

    // Fetch events
    const events = await this.getEventsByIds(eventIds);

    // Apply text search if needed
    let filteredEvents = events;
    if (filters.searchText) {
      const searchLower = filters.searchText.toLowerCase();
      filteredEvents = events.filter(
        e =>
          e.message.toLowerCase().includes(searchLower) ||
          e.details?.toLowerCase().includes(searchLower) ||
          e.actor.username?.toLowerCase().includes(searchLower)
      );
    }

    return {
      events: filteredEvents,
      total,
    };
  }

  async getEvent(eventId: string): Promise<AuditEvent | null> {
    const data = await this.redis.get(`${this.eventPrefix}${eventId}`);
    if (!data) return null;
    return this.deserializeEvent(data);
  }

  async getEventsByIds(eventIds: string[]): Promise<AuditEvent[]> {
    if (eventIds.length === 0) return [];

    const pipeline = this.redis.pipeline();
    for (const id of eventIds) {
      pipeline.get(`${this.eventPrefix}${id}`);
    }

    const results = await pipeline.exec();
    const events: AuditEvent[] = [];

    if (results) {
      for (const [err, data] of results) {
        if (!err && data) {
          events.push(this.deserializeEvent(data as string));
        }
      }
    }

    return events;
  }

  async getEventsByCorrelationId(correlationId: string): Promise<AuditEvent[]> {
    const eventIds = await this.redis.smembers(
      `${this.indexPrefix}correlation:${correlationId}`
    );
    return this.getEventsByIds(eventIds);
  }

  async getEventsByActor(
    actorId: string,
    options: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    } = {}
  ): Promise<AuditEvent[]> {
    const { startDate, endDate, limit = 100 } = options;

    const start = startDate?.getTime() || '-inf';
    const end = endDate?.getTime() || '+inf';

    const eventIds = await this.redis.zrevrangebyscore(
      `${this.indexPrefix}actor:${actorId}`,
      end,
      start,
      'LIMIT',
      0,
      limit
    );

    return this.getEventsByIds(eventIds);
  }

  async getEventsByResource(
    resourceType: string,
    resourceId: string,
    options: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    } = {}
  ): Promise<AuditEvent[]> {
    const { startDate, endDate, limit = 100 } = options;

    const start = startDate?.getTime() || '-inf';
    const end = endDate?.getTime() || '+inf';

    const eventIds = await this.redis.zrevrangebyscore(
      `${this.indexPrefix}resource:${resourceType}:${resourceId}`,
      end,
      start,
      'LIMIT',
      0,
      limit
    );

    return this.getEventsByIds(eventIds);
  }

  async aggregate(
    type: AggregationType,
    filters: AuditQueryFilters = {},
    options: {
      interval?: 'hour' | 'day' | 'week' | 'month';
    } = {}
  ): Promise<AuditAggregation> {
    const eventIds = await this.getFilteredEventIds(filters);
    const events = await this.getEventsByIds(eventIds);

    let results: Record<string, number> | number;

    switch (type) {
      case 'count':
        results = events.length;
        break;

      case 'count_by_category':
        results = this.countByField(events, 'category');
        break;

      case 'count_by_action':
        results = this.countByField(events, 'action');
        break;

      case 'count_by_actor':
        results = {};
        for (const event of events) {
          const key = event.actor.id || 'anonymous';
          results[key] = (results[key] || 0) + 1;
        }
        break;

      case 'count_by_status':
        results = this.countByField(events, 'status');
        break;

      case 'count_by_severity':
        results = this.countByField(events, 'severity');
        break;

      case 'timeline':
        results = this.buildTimeline(events, options.interval || 'day');
        break;

      default:
        results = 0;
    }

    return {
      type,
      filters,
      results,
      period: filters.startDate && filters.endDate
        ? {
            start: filters.startDate,
            end: filters.endDate,
            interval: options.interval || 'day',
          }
        : undefined,
    };
  }

  async getRecentEvents(
    limit: number = 50,
    filters?: Partial<AuditQueryFilters>
  ): Promise<AuditEvent[]> {
    let eventIds: string[];

    if (filters?.categories?.length === 1) {
      eventIds = await this.redis.zrevrange(
        `${this.indexPrefix}category:${filters.categories[0]}`,
        0,
        limit - 1
      );
    } else if (filters?.severities?.length === 1) {
      eventIds = await this.redis.zrevrange(
        `${this.indexPrefix}severity:${filters.severities[0]}`,
        0,
        limit - 1
      );
    } else {
      eventIds = await this.redis.zrevrange(
        `${this.indexPrefix}time`,
        0,
        limit - 1
      );
    }

    const events = await this.getEventsByIds(eventIds);

    // Apply remaining filters
    return this.applyFilters(events, filters || {});
  }

  async getEventStats(
    startDate: Date,
    endDate: Date
  ): Promise<{
    total: number;
    byCategory: Record<string, number>;
    byAction: Record<string, number>;
    bySeverity: Record<string, number>;
    byStatus: Record<string, number>;
    byHour: Record<string, number>;
  }> {
    const eventIds = await this.redis.zrangebyscore(
      `${this.indexPrefix}time`,
      startDate.getTime(),
      endDate.getTime()
    );

    const events = await this.getEventsByIds(eventIds);

    return {
      total: events.length,
      byCategory: this.countByField(events, 'category'),
      byAction: this.countByField(events, 'action'),
      bySeverity: this.countByField(events, 'severity'),
      byStatus: this.countByField(events, 'status'),
      byHour: this.buildTimeline(events, 'hour'),
    };
  }

  async searchEvents(
    searchText: string,
    options: {
      limit?: number;
      categories?: string[];
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<AuditEvent[]> {
    const { limit = 100, categories, startDate, endDate } = options;

    // Get candidate events
    const start = startDate?.getTime() || '-inf';
    const end = endDate?.getTime() || '+inf';

    let eventIds: string[];

    if (categories?.length === 1) {
      eventIds = await this.redis.zrevrangebyscore(
        `${this.indexPrefix}category:${categories[0]}`,
        end,
        start
      );
    } else {
      eventIds = await this.redis.zrevrangebyscore(
        `${this.indexPrefix}time`,
        end,
        start
      );
    }

    const events = await this.getEventsByIds(eventIds);
    const searchLower = searchText.toLowerCase();

    // Filter by search text
    const matchingEvents = events.filter(
      e =>
        e.message.toLowerCase().includes(searchLower) ||
        e.details?.toLowerCase().includes(searchLower) ||
        e.actor.username?.toLowerCase().includes(searchLower) ||
        e.resource?.name?.toLowerCase().includes(searchLower) ||
        e.tags?.some(t => t.toLowerCase().includes(searchLower))
    );

    // Apply category filter if multiple
    let filtered = matchingEvents;
    if (categories && categories.length > 1) {
      filtered = matchingEvents.filter(e => categories.includes(e.category));
    }

    return filtered.slice(0, limit);
  }

  private async getFilteredEventIds(filters: AuditQueryFilters): Promise<string[]> {
    const start = filters.startDate?.getTime() || '-inf';
    const end = filters.endDate?.getTime() || '+inf';

    // Start with time-based query
    let baseIds = await this.redis.zrangebyscore(
      `${this.indexPrefix}time`,
      start,
      end
    );

    // Apply indexed filters using set intersections
    if (filters.categories?.length) {
      const categoryIds = await this.getIdsFromIndexes(
        filters.categories.map(c => `${this.indexPrefix}category:${c}`),
        start,
        end
      );
      baseIds = this.intersect(baseIds, categoryIds);
    }

    if (filters.actions?.length) {
      const actionIds = await this.getIdsFromIndexes(
        filters.actions.map(a => `${this.indexPrefix}action:${a}`),
        start,
        end
      );
      baseIds = this.intersect(baseIds, actionIds);
    }

    if (filters.severities?.length) {
      const severityIds = await this.getIdsFromIndexes(
        filters.severities.map(s => `${this.indexPrefix}severity:${s}`),
        start,
        end
      );
      baseIds = this.intersect(baseIds, severityIds);
    }

    if (filters.actorIds?.length) {
      const actorIds = await this.getIdsFromIndexes(
        filters.actorIds.map(a => `${this.indexPrefix}actor:${a}`),
        start,
        end
      );
      baseIds = this.intersect(baseIds, actorIds);
    }

    if (filters.tags?.length) {
      const tagIds = await this.getIdsFromIndexes(
        filters.tags.map(t => `${this.indexPrefix}tag:${t}`),
        start,
        end
      );
      baseIds = this.intersect(baseIds, tagIds);
    }

    return baseIds;
  }

  private async getIdsFromIndexes(
    keys: string[],
    start: number | string,
    end: number | string
  ): Promise<string[]> {
    const allIds: Set<string> = new Set();

    for (const key of keys) {
      const ids = await this.redis.zrangebyscore(key, start, end);
      ids.forEach(id => allIds.add(id));
    }

    return Array.from(allIds);
  }

  private intersect(arr1: string[], arr2: string[]): string[] {
    const set2 = new Set(arr2);
    return arr1.filter(id => set2.has(id));
  }

  private applyFilters(
    events: AuditEvent[],
    filters: Partial<AuditQueryFilters>
  ): AuditEvent[] {
    return events.filter(event => {
      if (filters.categories?.length && !filters.categories.includes(event.category)) {
        return false;
      }
      if (filters.actions?.length && !filters.actions.includes(event.action)) {
        return false;
      }
      if (filters.severities?.length && !filters.severities.includes(event.severity)) {
        return false;
      }
      if (filters.statuses?.length && !filters.statuses.includes(event.status)) {
        return false;
      }
      if (filters.actorIds?.length && event.actor.id && !filters.actorIds.includes(event.actor.id)) {
        return false;
      }
      if (filters.actorTypes?.length && !filters.actorTypes.includes(event.actor.type)) {
        return false;
      }
      if (filters.resourceTypes?.length && event.resource && !filters.resourceTypes.includes(event.resource.type)) {
        return false;
      }
      if (filters.resourceIds?.length && event.resource && !filters.resourceIds.includes(event.resource.id)) {
        return false;
      }
      if (filters.ips?.length && event.actor.ip && !filters.ips.includes(event.actor.ip)) {
        return false;
      }
      return true;
    });
  }

  private countByField(
    events: AuditEvent[],
    field: keyof AuditEvent
  ): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const event of events) {
      const value = String(event[field]);
      counts[value] = (counts[value] || 0) + 1;
    }
    return counts;
  }

  private buildTimeline(
    events: AuditEvent[],
    interval: 'hour' | 'day' | 'week' | 'month'
  ): Record<string, number> {
    const timeline: Record<string, number> = {};

    for (const event of events) {
      const date = new Date(event.timestamp);
      let key: string;

      switch (interval) {
        case 'hour':
          key = `${date.toISOString().slice(0, 13)}:00`;
          break;
        case 'day':
          key = date.toISOString().slice(0, 10);
          break;
        case 'week':
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = weekStart.toISOString().slice(0, 10);
          break;
        case 'month':
          key = date.toISOString().slice(0, 7);
          break;
        default:
          key = date.toISOString().slice(0, 10);
      }

      timeline[key] = (timeline[key] || 0) + 1;
    }

    // Sort by date
    const sorted: Record<string, number> = {};
    Object.keys(timeline)
      .sort()
      .forEach(key => {
        sorted[key] = timeline[key];
      });

    return sorted;
  }

  private deserializeEvent(data: string): AuditEvent {
    const event = JSON.parse(data);
    event.timestamp = new Date(event.timestamp);
    return event;
  }
}
