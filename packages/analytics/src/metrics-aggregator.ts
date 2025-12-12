/**
 * Metrics Aggregator
 *
 * Aggregates events into time-series metrics
 */

import { createLogger } from '@textmesh/logger';
import {
  AnalyticsEvent,
  AggregatedMetric,
  MetricValue,
  TimeSeriesData,
} from './types';

const logger = createLogger({ service: 'metrics-aggregator', level: 'info' });

type Period = 'minute' | 'hour' | 'day' | 'week' | 'month';

interface MetricBucket {
  name: string;
  period: Period;
  timestamp: Date;
  dimensions: Record<string, string>;
  values: number[];
}

export class MetricsAggregator {
  private buckets: Map<string, MetricBucket> = new Map();
  private aggregatedMetrics: AggregatedMetric[] = [];
  private flushInterval?: NodeJS.Timeout;

  constructor() {
    this.startPeriodicFlush();
  }

  /**
   * Process an event and update metrics
   */
  processEvent(event: AnalyticsEvent): void {
    // Update event counts
    this.incrementCounter(`events.${event.category}.${event.action}`, {
      category: event.category,
      action: event.action,
    });

    // Update user metrics
    if (event.userId) {
      this.incrementCounter('active_users', { period: 'daily' });

      if (event.action === 'signup') {
        this.incrementCounter('new_users', {});
      }
    }

    // Update content metrics
    if (event.category === 'content') {
      this.incrementCounter(`content.${event.action}`, {
        contentType: event.properties.contentType as string || 'unknown',
      });
    }

    // Update engagement metrics
    if (event.category === 'engagement') {
      this.incrementCounter(`engagement.${event.action}`, {});

      const targetId = event.properties.targetId as string;
      if (targetId) {
        this.incrementCounter(`engagement.by_target.${event.action}`, {
          targetId,
        });
      }
    }

    // Update performance metrics
    if (event.category === 'performance') {
      const durationMs = event.properties.durationMs as number;
      if (durationMs !== undefined) {
        this.recordValue(`performance.${event.action}.duration`, durationMs, {
          action: event.action,
        });
      }
    }

    // Update error metrics
    if (event.category === 'error') {
      this.incrementCounter('errors', {
        errorName: event.properties.name as string || 'unknown',
      });
    }

    // Update platform metrics
    if (event.metadata.platform) {
      this.incrementCounter('events_by_platform', {
        platform: event.metadata.platform,
      });
    }
  }

  /**
   * Increment a counter metric
   */
  incrementCounter(
    name: string,
    dimensions: Record<string, string>,
    value: number = 1
  ): void {
    const periods: Period[] = ['minute', 'hour', 'day'];

    for (const period of periods) {
      const timestamp = this.getBucketTimestamp(new Date(), period);
      const key = this.getBucketKey(name, period, timestamp, dimensions);

      let bucket = this.buckets.get(key);
      if (!bucket) {
        bucket = {
          name,
          period,
          timestamp,
          dimensions,
          values: [],
        };
        this.buckets.set(key, bucket);
      }

      bucket.values.push(value);
    }
  }

  /**
   * Record a value metric (for averages, percentiles, etc.)
   */
  recordValue(
    name: string,
    value: number,
    dimensions: Record<string, string>
  ): void {
    const periods: Period[] = ['minute', 'hour', 'day'];

    for (const period of periods) {
      const timestamp = this.getBucketTimestamp(new Date(), period);
      const key = this.getBucketKey(name, period, timestamp, dimensions);

      let bucket = this.buckets.get(key);
      if (!bucket) {
        bucket = {
          name,
          period,
          timestamp,
          dimensions,
          values: [],
        };
        this.buckets.set(key, bucket);
      }

      bucket.values.push(value);
    }
  }

  /**
   * Get bucket timestamp (rounded to period)
   */
  private getBucketTimestamp(date: Date, period: Period): Date {
    const ts = new Date(date);

    switch (period) {
      case 'minute':
        ts.setSeconds(0, 0);
        break;
      case 'hour':
        ts.setMinutes(0, 0, 0);
        break;
      case 'day':
        ts.setHours(0, 0, 0, 0);
        break;
      case 'week':
        ts.setHours(0, 0, 0, 0);
        ts.setDate(ts.getDate() - ts.getDay());
        break;
      case 'month':
        ts.setHours(0, 0, 0, 0);
        ts.setDate(1);
        break;
    }

    return ts;
  }

  /**
   * Get bucket key
   */
  private getBucketKey(
    name: string,
    period: Period,
    timestamp: Date,
    dimensions: Record<string, string>
  ): string {
    const dimStr = Object.entries(dimensions)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');

    return `${name}:${period}:${timestamp.getTime()}:${dimStr}`;
  }

  /**
   * Aggregate bucket values
   */
  private aggregateBucket(bucket: MetricBucket): AggregatedMetric {
    const values = bucket.values;
    const count = values.length;
    const sum = values.reduce((a, b) => a + b, 0);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = count > 0 ? sum / count : 0;

    return {
      name: bucket.name,
      period: bucket.period,
      timestamp: bucket.timestamp,
      value: { count, sum, min, max, avg },
      dimensions: bucket.dimensions,
    };
  }

  /**
   * Flush expired buckets to aggregated metrics
   */
  flushExpiredBuckets(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, bucket] of this.buckets) {
      const age = now - bucket.timestamp.getTime();
      let expiry: number;

      switch (bucket.period) {
        case 'minute':
          expiry = 60 * 1000; // 1 minute
          break;
        case 'hour':
          expiry = 60 * 60 * 1000; // 1 hour
          break;
        case 'day':
          expiry = 24 * 60 * 60 * 1000; // 1 day
          break;
        default:
          expiry = 24 * 60 * 60 * 1000;
      }

      if (age > expiry) {
        const metric = this.aggregateBucket(bucket);
        this.aggregatedMetrics.push(metric);
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.buckets.delete(key);
    }

    // Keep only recent aggregated metrics (last 7 days)
    const cutoff = now - 7 * 24 * 60 * 60 * 1000;
    this.aggregatedMetrics = this.aggregatedMetrics.filter(
      (m) => m.timestamp.getTime() > cutoff
    );

    if (expiredKeys.length > 0) {
      logger.debug('Flushed expired buckets', { count: expiredKeys.length });
    }
  }

  /**
   * Start periodic flush
   */
  private startPeriodicFlush(): void {
    this.flushInterval = setInterval(() => {
      this.flushExpiredBuckets();
    }, 60000); // Every minute
  }

  /**
   * Stop aggregator
   */
  stop(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    this.flushExpiredBuckets();
  }

  /**
   * Get metric time series
   */
  getTimeSeries(
    name: string,
    period: Period,
    start: Date,
    end: Date,
    dimensions?: Record<string, string>
  ): TimeSeriesData[] {
    const result: TimeSeriesData[] = [];

    // Check aggregated metrics
    for (const metric of this.aggregatedMetrics) {
      if (
        metric.name === name &&
        metric.period === period &&
        metric.timestamp >= start &&
        metric.timestamp <= end
      ) {
        if (!dimensions || this.matchesDimensions(metric.dimensions, dimensions)) {
          result.push({
            timestamp: metric.timestamp,
            value: metric.value.sum,
            dimensions: metric.dimensions,
          });
        }
      }
    }

    // Check current buckets
    for (const bucket of this.buckets.values()) {
      if (
        bucket.name === name &&
        bucket.period === period &&
        bucket.timestamp >= start &&
        bucket.timestamp <= end
      ) {
        if (!dimensions || this.matchesDimensions(bucket.dimensions, dimensions)) {
          const sum = bucket.values.reduce((a, b) => a + b, 0);
          result.push({
            timestamp: bucket.timestamp,
            value: sum,
            dimensions: bucket.dimensions,
          });
        }
      }
    }

    return result.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Check if dimensions match
   */
  private matchesDimensions(
    actual: Record<string, string>,
    expected: Record<string, string>
  ): boolean {
    for (const [key, value] of Object.entries(expected)) {
      if (actual[key] !== value) return false;
    }
    return true;
  }

  /**
   * Get current metric value
   */
  getCurrentValue(
    name: string,
    period: Period,
    dimensions?: Record<string, string>
  ): MetricValue | null {
    const timestamp = this.getBucketTimestamp(new Date(), period);
    const key = dimensions
      ? this.getBucketKey(name, period, timestamp, dimensions)
      : null;

    if (key) {
      const bucket = this.buckets.get(key);
      if (bucket) {
        return this.aggregateBucket(bucket).value;
      }
    }

    // Search for matching bucket
    for (const bucket of this.buckets.values()) {
      if (
        bucket.name === name &&
        bucket.period === period &&
        bucket.timestamp.getTime() === timestamp.getTime()
      ) {
        if (!dimensions || this.matchesDimensions(bucket.dimensions, dimensions)) {
          return this.aggregateBucket(bucket).value;
        }
      }
    }

    return null;
  }

  /**
   * Get all metrics for a period
   */
  getMetrics(period: Period): AggregatedMetric[] {
    const results: AggregatedMetric[] = [];

    for (const bucket of this.buckets.values()) {
      if (bucket.period === period) {
        results.push(this.aggregateBucket(bucket));
      }
    }

    return results;
  }

  /**
   * Get statistics
   */
  getStats(): {
    activeBuckets: number;
    aggregatedMetrics: number;
    bucketsByPeriod: Record<Period, number>;
  } {
    const bucketsByPeriod: Record<Period, number> = {
      minute: 0,
      hour: 0,
      day: 0,
      week: 0,
      month: 0,
    };

    for (const bucket of this.buckets.values()) {
      bucketsByPeriod[bucket.period]++;
    }

    return {
      activeBuckets: this.buckets.size,
      aggregatedMetrics: this.aggregatedMetrics.length,
      bucketsByPeriod,
    };
  }
}
