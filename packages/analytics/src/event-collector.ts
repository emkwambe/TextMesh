/**
 * Event Collector
 *
 * Collects and batches analytics events
 */

import { createLogger } from '@textmesh/logger';
import { v4 as uuidv4 } from 'uuid';
import {
  AnalyticsEvent,
  EventCategory,
  EventAction,
  EventMetadata,
  AnalyticsConfig,
} from './types';

const logger = createLogger({ service: 'event-collector', level: 'info' });

export interface EventCollectorOptions {
  batchSize: number;
  flushInterval: number;
  maxQueueSize: number;
  onFlush: (events: AnalyticsEvent[]) => Promise<void>;
}

const DEFAULT_OPTIONS: EventCollectorOptions = {
  batchSize: 100,
  flushInterval: 5000, // 5 seconds
  maxQueueSize: 10000,
  onFlush: async () => {},
};

export class EventCollector {
  private options: EventCollectorOptions;
  private queue: AnalyticsEvent[] = [];
  private flushTimer?: NodeJS.Timeout;
  private isProcessing: boolean = false;
  private samplingRate: number;

  constructor(options: Partial<EventCollectorOptions> = {}, samplingRate: number = 1) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.samplingRate = samplingRate;
    this.startFlushTimer();
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
    // Apply sampling
    if (this.samplingRate < 1 && Math.random() > this.samplingRate) {
      return null;
    }

    const event: AnalyticsEvent = {
      id: uuidv4(),
      timestamp: new Date(),
      category,
      action,
      userId: context.userId,
      sessionId: context.sessionId,
      deviceId: context.deviceId,
      properties,
      metadata: context.metadata || {},
    };

    this.enqueue(event);

    return event.id;
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
    return this.track('user', action, properties, { userId, metadata });
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
    return this.track('content', action, { contentId, ...properties }, { userId, metadata });
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
    return this.track('engagement', action, { targetId, ...properties }, { userId, metadata });
  }

  /**
   * Track navigation event
   */
  trackNavigation(
    action: 'page_view' | 'search' | 'click' | 'scroll',
    properties: Record<string, unknown> = {},
    context: {
      userId?: string;
      sessionId?: string;
      metadata?: Partial<EventMetadata>;
    } = {}
  ): string | null {
    return this.track('navigation', action, properties, context);
  }

  /**
   * Track conversion event
   */
  trackConversion(
    action: 'subscription' | 'purchase' | 'referral',
    userId: string,
    properties: Record<string, unknown> = {},
    metadata?: Partial<EventMetadata>
  ): string | null {
    return this.track('conversion', action, properties, { userId, metadata });
  }

  /**
   * Track error event
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
    const errorProps = {
      message: typeof error === 'string' ? error : error.message,
      stack: typeof error === 'string' ? undefined : error.stack,
      name: typeof error === 'string' ? 'Error' : error.name,
      ...properties,
    };

    return this.track('error', 'error', errorProps, context);
  }

  /**
   * Track performance event
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
    return this.track('performance', action, { durationMs, ...properties }, context);
  }

  /**
   * Enqueue event for processing
   */
  private enqueue(event: AnalyticsEvent): void {
    if (this.queue.length >= this.options.maxQueueSize) {
      logger.warn('Event queue full, dropping oldest events');
      this.queue.shift();
    }

    this.queue.push(event);

    // Flush if batch size reached
    if (this.queue.length >= this.options.batchSize) {
      this.flush();
    }
  }

  /**
   * Start flush timer
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      if (this.queue.length > 0) {
        this.flush();
      }
    }, this.options.flushInterval);
  }

  /**
   * Flush events to handler
   */
  async flush(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      const events = this.queue.splice(0, this.options.batchSize);
      await this.options.onFlush(events);

      logger.debug('Events flushed', { count: events.length });
    } catch (error) {
      logger.error('Failed to flush events', { error });
      // Events are lost - in production, you'd want dead letter queue
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Stop collector
   */
  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    // Final flush
    while (this.queue.length > 0) {
      await this.flush();
    }

    logger.info('Event collector stopped');
  }

  /**
   * Set sampling rate
   */
  setSamplingRate(rate: number): void {
    this.samplingRate = Math.max(0, Math.min(1, rate));
  }

  /**
   * Get statistics
   */
  getStats(): {
    queueSize: number;
    samplingRate: number;
    isProcessing: boolean;
  } {
    return {
      queueSize: this.queue.length,
      samplingRate: this.samplingRate,
      isProcessing: this.isProcessing,
    };
  }
}
