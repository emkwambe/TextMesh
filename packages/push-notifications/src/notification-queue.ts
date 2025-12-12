import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import {
  PushNotification,
  NotificationCategory,
  NotificationPriority,
  BatchNotification,
} from './types';

interface QueuedNotification {
  notification: PushNotification;
  attempts: number;
  lastAttempt?: Date;
  nextRetry?: Date;
}

export class NotificationQueue {
  private redis: Redis;
  private readonly queuePrefix = 'push:queue:';
  private readonly processingPrefix = 'push:processing:';
  private readonly deadLetterPrefix = 'push:dlq:';
  private readonly batchPrefix = 'push:batch:';
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  constructor(
    redis: Redis,
    options: {
      maxRetries?: number;
      retryDelayMs?: number;
    } = {}
  ) {
    this.redis = redis;
    this.maxRetries = options.maxRetries || 3;
    this.retryDelayMs = options.retryDelayMs || 5000;
  }

  async enqueue(
    userId: string,
    title: string,
    body: string,
    options: {
      data?: Record<string, string>;
      imageUrl?: string;
      actionUrl?: string;
      category?: NotificationCategory;
      priority?: NotificationPriority;
      ttl?: number;
      collapseKey?: string;
      scheduledAt?: Date;
    } = {}
  ): Promise<PushNotification> {
    const notification: PushNotification = {
      id: uuidv4(),
      userId,
      title,
      body,
      data: options.data,
      imageUrl: options.imageUrl,
      actionUrl: options.actionUrl,
      category: options.category || 'social',
      priority: options.priority || 'normal',
      ttl: options.ttl,
      collapseKey: options.collapseKey,
      createdAt: new Date(),
      scheduledAt: options.scheduledAt,
      status: options.scheduledAt ? 'scheduled' : 'pending',
    };

    const queued: QueuedNotification = {
      notification,
      attempts: 0,
    };

    const queueKey = this.getQueueKey(notification.priority);
    const score = options.scheduledAt
      ? options.scheduledAt.getTime()
      : Date.now();

    await this.redis.zadd(queueKey, score, JSON.stringify(queued));

    return notification;
  }

  async enqueueBatch(
    batch: BatchNotification
  ): Promise<void> {
    await this.redis.set(
      `${this.batchPrefix}${batch.id}`,
      JSON.stringify(batch)
    );

    if (batch.scheduledAt && batch.scheduledAt > new Date()) {
      await this.redis.zadd(
        `${this.queuePrefix}batches`,
        batch.scheduledAt.getTime(),
        batch.id
      );
    } else {
      await this.redis.lpush(`${this.queuePrefix}batch_ready`, batch.id);
    }
  }

  async dequeue(
    priority: NotificationPriority = 'normal',
    count: number = 10
  ): Promise<QueuedNotification[]> {
    const queueKey = this.getQueueKey(priority);
    const now = Date.now();

    const items = await this.redis.zrangebyscore(
      queueKey,
      '-inf',
      now,
      'LIMIT',
      0,
      count
    );

    if (items.length === 0) return [];

    const pipeline = this.redis.pipeline();
    items.forEach((item) => {
      pipeline.zrem(queueKey, item);
      pipeline.hset(
        `${this.processingPrefix}${priority}`,
        JSON.parse(item).notification.id,
        item
      );
    });
    await pipeline.exec();

    return items.map((item) => JSON.parse(item));
  }

  async dequeueAll(count: number = 100): Promise<QueuedNotification[]> {
    const priorities: NotificationPriority[] = ['high', 'normal', 'low'];
    const results: QueuedNotification[] = [];

    for (const priority of priorities) {
      const items = await this.dequeue(priority, count - results.length);
      results.push(...items);

      if (results.length >= count) break;
    }

    return results;
  }

  async markComplete(
    notificationId: string,
    priority: NotificationPriority = 'normal'
  ): Promise<void> {
    await this.redis.hdel(`${this.processingPrefix}${priority}`, notificationId);
  }

  async markFailed(
    notificationId: string,
    priority: NotificationPriority = 'normal',
    error: string
  ): Promise<void> {
    const item = await this.redis.hget(
      `${this.processingPrefix}${priority}`,
      notificationId
    );

    if (!item) return;

    const queued: QueuedNotification = JSON.parse(item);
    queued.attempts++;
    queued.lastAttempt = new Date();

    await this.redis.hdel(`${this.processingPrefix}${priority}`, notificationId);

    if (queued.attempts >= this.maxRetries) {
      await this.moveToDeadLetter(queued, error);
    } else {
      queued.nextRetry = new Date(
        Date.now() + this.retryDelayMs * Math.pow(2, queued.attempts - 1)
      );
      const queueKey = this.getQueueKey(priority);
      await this.redis.zadd(
        queueKey,
        queued.nextRetry.getTime(),
        JSON.stringify(queued)
      );
    }
  }

  async getQueueStats(): Promise<{
    pending: { high: number; normal: number; low: number };
    processing: { high: number; normal: number; low: number };
    deadLetter: number;
  }> {
    const priorities: NotificationPriority[] = ['high', 'normal', 'low'];
    const pending: Record<string, number> = {};
    const processing: Record<string, number> = {};

    for (const priority of priorities) {
      pending[priority] = await this.redis.zcard(this.getQueueKey(priority));
      processing[priority] = await this.redis.hlen(
        `${this.processingPrefix}${priority}`
      );
    }

    const deadLetter = await this.redis.llen(`${this.deadLetterPrefix}notifications`);

    return {
      pending: pending as { high: number; normal: number; low: number },
      processing: processing as { high: number; normal: number; low: number },
      deadLetter,
    };
  }

  async getDeadLetterItems(
    offset: number = 0,
    limit: number = 100
  ): Promise<Array<{ notification: QueuedNotification; error: string; movedAt: Date }>> {
    const items = await this.redis.lrange(
      `${this.deadLetterPrefix}notifications`,
      offset,
      offset + limit - 1
    );

    return items.map((item) => JSON.parse(item));
  }

  async retryDeadLetter(notificationId: string): Promise<boolean> {
    const items = await this.redis.lrange(
      `${this.deadLetterPrefix}notifications`,
      0,
      -1
    );

    for (let i = 0; i < items.length; i++) {
      const item = JSON.parse(items[i]);
      if (item.notification.notification.id === notificationId) {
        await this.redis.lrem(`${this.deadLetterPrefix}notifications`, 1, items[i]);

        const queued: QueuedNotification = {
          notification: item.notification.notification,
          attempts: 0,
        };

        const queueKey = this.getQueueKey(queued.notification.priority);
        await this.redis.zadd(queueKey, Date.now(), JSON.stringify(queued));

        return true;
      }
    }

    return false;
  }

  async clearDeadLetter(): Promise<number> {
    const count = await this.redis.llen(`${this.deadLetterPrefix}notifications`);
    await this.redis.del(`${this.deadLetterPrefix}notifications`);
    return count;
  }

  async cancelNotification(notificationId: string): Promise<boolean> {
    const priorities: NotificationPriority[] = ['high', 'normal', 'low'];

    for (const priority of priorities) {
      const queueKey = this.getQueueKey(priority);
      const items = await this.redis.zrange(queueKey, 0, -1);

      for (const item of items) {
        const queued: QueuedNotification = JSON.parse(item);
        if (queued.notification.id === notificationId) {
          await this.redis.zrem(queueKey, item);
          return true;
        }
      }

      const processingItem = await this.redis.hget(
        `${this.processingPrefix}${priority}`,
        notificationId
      );
      if (processingItem) {
        await this.redis.hdel(`${this.processingPrefix}${priority}`, notificationId);
        return true;
      }
    }

    return false;
  }

  async collapseNotifications(
    userId: string,
    collapseKey: string
  ): Promise<number> {
    const priorities: NotificationPriority[] = ['high', 'normal', 'low'];
    let removed = 0;

    for (const priority of priorities) {
      const queueKey = this.getQueueKey(priority);
      const items = await this.redis.zrange(queueKey, 0, -1);

      for (const item of items) {
        const queued: QueuedNotification = JSON.parse(item);
        if (
          queued.notification.userId === userId &&
          queued.notification.collapseKey === collapseKey
        ) {
          await this.redis.zrem(queueKey, item);
          removed++;
        }
      }
    }

    return removed;
  }

  private getQueueKey(priority: NotificationPriority): string {
    return `${this.queuePrefix}${priority}`;
  }

  private async moveToDeadLetter(
    queued: QueuedNotification,
    error: string
  ): Promise<void> {
    const deadLetterItem = {
      notification: queued,
      error,
      movedAt: new Date(),
    };

    await this.redis.lpush(
      `${this.deadLetterPrefix}notifications`,
      JSON.stringify(deadLetterItem)
    );
  }
}
