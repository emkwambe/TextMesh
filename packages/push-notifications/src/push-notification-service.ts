import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { FCMProvider } from './providers/fcm-provider';
import { APNSProvider } from './providers/apns-provider';
import { WebPushProvider } from './providers/web-push-provider';
import { DeviceManager } from './device-manager';
import { NotificationQueue } from './notification-queue';
import { NotificationScheduler } from './scheduler';
import {
  PushNotification,
  PushConfig,
  NotificationCategory,
  NotificationPriority,
  DeliveryResult,
  NotificationStats,
  NotificationTemplate,
  Platform,
} from './types';

export class PushNotificationService {
  private redis: Redis;
  private fcmProvider?: FCMProvider;
  private apnsProvider?: APNSProvider;
  private webPushProvider?: WebPushProvider;
  private deviceManager: DeviceManager;
  private queue: NotificationQueue;
  private scheduler: NotificationScheduler;
  private templates: Map<string, NotificationTemplate> = new Map();
  private config: PushConfig;
  private processingInterval?: NodeJS.Timeout;
  private readonly statsPrefix = 'push:stats:';

  constructor(redis: Redis, config: PushConfig) {
    this.redis = redis;
    this.config = config;
    this.deviceManager = new DeviceManager(redis);
    this.queue = new NotificationQueue(redis, {
      maxRetries: config.retryAttempts,
      retryDelayMs: config.retryDelay,
    });
    this.scheduler = new NotificationScheduler(redis, this.queue);

    if (config.fcm) {
      this.fcmProvider = new FCMProvider(config.fcm);
    }
    if (config.apns) {
      this.apnsProvider = new APNSProvider(config.apns);
    }
    if (config.webPush) {
      this.webPushProvider = new WebPushProvider(config.webPush);
    }
  }

  async send(
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
      platforms?: Platform[];
    } = {}
  ): Promise<PushNotification> {
    const { send, reason } = await this.deviceManager.shouldSendNotification(
      userId,
      options.category || 'social'
    );

    if (!send) {
      const notification: PushNotification = {
        id: uuidv4(),
        userId,
        title,
        body,
        ...options,
        category: options.category || 'social',
        priority: options.priority || 'normal',
        createdAt: new Date(),
        status: 'cancelled',
      };
      return notification;
    }

    return this.queue.enqueue(userId, title, body, options);
  }

  async sendToMultiple(
    userIds: string[],
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
    } = {}
  ): Promise<PushNotification[]> {
    const notifications: PushNotification[] = [];

    for (const userId of userIds) {
      const notification = await this.send(userId, title, body, options);
      notifications.push(notification);
    }

    return notifications;
  }

  async sendFromTemplate(
    userId: string,
    templateId: string,
    variables: Record<string, string>,
    options: {
      data?: Record<string, string>;
      actionUrl?: string;
      priority?: NotificationPriority;
    } = {}
  ): Promise<PushNotification> {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const title = this.interpolate(template.titleTemplate, variables);
    const body = this.interpolate(template.bodyTemplate, variables);

    const data = template.dataTemplate
      ? Object.fromEntries(
          Object.entries(template.dataTemplate).map(([key, value]) => [
            key,
            this.interpolate(value, variables),
          ])
        )
      : undefined;

    return this.send(userId, title, body, {
      ...options,
      data: { ...data, ...options.data },
      category: template.category,
    });
  }

  async schedule(
    userId: string,
    title: string,
    body: string,
    scheduledAt: Date,
    options: {
      data?: Record<string, string>;
      imageUrl?: string;
      actionUrl?: string;
      category?: NotificationCategory;
      priority?: NotificationPriority;
      ttl?: number;
      collapseKey?: string;
    } = {}
  ): Promise<PushNotification> {
    return this.queue.enqueue(userId, title, body, {
      ...options,
      scheduledAt,
    });
  }

  async scheduleRecurring(
    userId: string,
    title: string,
    body: string,
    intervalMs: number,
    options: {
      data?: Record<string, string>;
      imageUrl?: string;
      actionUrl?: string;
      category?: NotificationCategory;
      priority?: NotificationPriority;
      maxRuns?: number;
      endDate?: Date;
    } = {}
  ): Promise<{ scheduleId: string }> {
    const scheduled = await this.scheduler.schedule(
      userId,
      title,
      body,
      {
        type: 'recurring',
        interval: intervalMs,
        maxRuns: options.maxRuns,
        endDate: options.endDate,
      },
      options
    );

    return { scheduleId: scheduled.id };
  }

  async cancel(notificationId: string): Promise<boolean> {
    return this.queue.cancelNotification(notificationId);
  }

  async cancelScheduled(scheduleId: string): Promise<boolean> {
    return this.scheduler.cancel(scheduleId);
  }

  async processQueue(): Promise<DeliveryResult[]> {
    const results: DeliveryResult[] = [];
    const items = await this.queue.dequeueAll(this.config.batchSize);

    for (const item of items) {
      const notification = item.notification;

      try {
        const deliveryResults = await this.deliverNotification(notification);
        results.push(...deliveryResults);

        const allSuccess = deliveryResults.every((r) => r.success);
        if (allSuccess) {
          await this.queue.markComplete(notification.id, notification.priority);
          await this.recordStats(notification, deliveryResults);
        } else {
          const failures = deliveryResults.filter((r) => !r.success);
          await this.handleDeliveryFailures(notification, failures);
        }
      } catch (error) {
        await this.queue.markFailed(
          notification.id,
          notification.priority,
          error instanceof Error ? error.message : 'Unknown error'
        );
      }
    }

    return results;
  }

  private async deliverNotification(
    notification: PushNotification
  ): Promise<DeliveryResult[]> {
    const results: DeliveryResult[] = [];

    const devices = await this.deviceManager.getUserDevices(notification.userId);
    const subscriptions = await this.deviceManager.getUserSubscriptions(
      notification.userId
    );

    if (devices.length === 0 && subscriptions.length === 0) {
      return [];
    }

    if (this.fcmProvider) {
      const fcmDevices = devices.filter((d) => d.platform === 'android');
      if (fcmDevices.length > 0) {
        const fcmResults = await this.fcmProvider.send(notification, fcmDevices);
        results.push(...fcmResults);
      }
    }

    if (this.apnsProvider) {
      const iosDevices = devices.filter((d) => d.platform === 'ios');
      if (iosDevices.length > 0) {
        const apnsResults = await this.apnsProvider.send(notification, iosDevices);
        results.push(...apnsResults);
      }
    }

    if (this.webPushProvider && subscriptions.length > 0) {
      const webResults = await this.webPushProvider.send(notification, subscriptions);
      results.push(...webResults);
    }

    return results;
  }

  private async handleDeliveryFailures(
    notification: PushNotification,
    failures: DeliveryResult[]
  ): Promise<void> {
    for (const failure of failures) {
      const errorCode = failure.error?.code || '';

      const shouldDeactivate = [
        'BadDeviceToken',
        'Unregistered',
        '404',
        '410',
        'InvalidRegistration',
        'NotRegistered',
      ].includes(errorCode);

      if (shouldDeactivate) {
        await this.deviceManager.markDeviceInactive(
          failure.deviceTokenId,
          failure.error?.message || 'Token invalid'
        );
      }
    }

    const successCount = failures.filter((f) => !f.success).length;
    if (successCount === 0) {
      await this.queue.markFailed(
        notification.id,
        notification.priority,
        'All delivery attempts failed'
      );
    } else {
      await this.queue.markComplete(notification.id, notification.priority);
    }
  }

  private async recordStats(
    notification: PushNotification,
    results: DeliveryResult[]
  ): Promise<void> {
    const date = new Date().toISOString().split('T')[0];
    const hour = new Date().getHours();

    const pipeline = this.redis.pipeline();

    pipeline.hincrby(`${this.statsPrefix}daily:${date}`, 'sent', 1);
    pipeline.hincrby(`${this.statsPrefix}daily:${date}`, 'delivered', results.filter((r) => r.success).length);
    pipeline.hincrby(`${this.statsPrefix}daily:${date}`, 'failed', results.filter((r) => !r.success).length);

    pipeline.hincrby(
      `${this.statsPrefix}category:${date}`,
      `${notification.category}:sent`,
      1
    );

    for (const result of results) {
      pipeline.hincrby(
        `${this.statsPrefix}platform:${date}`,
        `${result.platform}:${result.success ? 'delivered' : 'failed'}`,
        1
      );
    }

    pipeline.hincrby(`${this.statsPrefix}hourly:${date}`, `${hour}:sent`, 1);

    await pipeline.exec();
  }

  async getStats(date?: string): Promise<NotificationStats> {
    const targetDate = date || new Date().toISOString().split('T')[0];

    const [daily, category, platform] = await Promise.all([
      this.redis.hgetall(`${this.statsPrefix}daily:${targetDate}`),
      this.redis.hgetall(`${this.statsPrefix}category:${targetDate}`),
      this.redis.hgetall(`${this.statsPrefix}platform:${targetDate}`),
    ]);

    const sent = parseInt(daily.sent || '0');
    const delivered = parseInt(daily.delivered || '0');
    const failed = parseInt(daily.failed || '0');
    const opened = parseInt(daily.opened || '0');
    const clicked = parseInt(daily.clicked || '0');

    const byCategory: Record<string, { sent: number; delivered: number; opened: number }> = {};
    const categories: NotificationCategory[] = [
      'social', 'message', 'mention', 'follow', 'like',
      'comment', 'repost', 'system', 'marketing', 'reminder',
    ];

    for (const cat of categories) {
      byCategory[cat] = {
        sent: parseInt(category[`${cat}:sent`] || '0'),
        delivered: parseInt(category[`${cat}:delivered`] || '0'),
        opened: parseInt(category[`${cat}:opened`] || '0'),
      };
    }

    const byPlatform: Record<string, { sent: number; delivered: number; failed: number }> = {};
    const platforms: Platform[] = ['ios', 'android', 'web'];

    for (const p of platforms) {
      byPlatform[p] = {
        sent: parseInt(platform[`${p}:sent`] || '0'),
        delivered: parseInt(platform[`${p}:delivered`] || '0'),
        failed: parseInt(platform[`${p}:failed`] || '0'),
      };
    }

    return {
      period: targetDate,
      sent,
      delivered,
      failed,
      opened,
      clicked,
      deliveryRate: sent > 0 ? delivered / sent : 0,
      openRate: delivered > 0 ? opened / delivered : 0,
      clickRate: opened > 0 ? clicked / opened : 0,
      byCategory: byCategory as NotificationStats['byCategory'],
      byPlatform: byPlatform as NotificationStats['byPlatform'],
    };
  }

  async trackOpen(notificationId: string): Promise<void> {
    const date = new Date().toISOString().split('T')[0];
    await this.redis.hincrby(`${this.statsPrefix}daily:${date}`, 'opened', 1);
  }

  async trackClick(notificationId: string, action?: string): Promise<void> {
    const date = new Date().toISOString().split('T')[0];
    await this.redis.hincrby(`${this.statsPrefix}daily:${date}`, 'clicked', 1);
    if (action) {
      await this.redis.hincrby(`${this.statsPrefix}actions:${date}`, action, 1);
    }
  }

  registerTemplate(template: NotificationTemplate): void {
    this.templates.set(template.id, template);
  }

  getDeviceManager(): DeviceManager {
    return this.deviceManager;
  }

  getQueue(): NotificationQueue {
    return this.queue;
  }

  getScheduler(): NotificationScheduler {
    return this.scheduler;
  }

  startProcessing(intervalMs: number = 1000): void {
    if (this.processingInterval) {
      this.stopProcessing();
    }

    this.processingInterval = setInterval(async () => {
      try {
        await this.processQueue();
      } catch (error) {
        console.error('Error processing notification queue:', error);
      }
    }, intervalMs);

    this.scheduler.startProcessing();
  }

  stopProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
    }
    this.scheduler.stopProcessing();
  }

  private interpolate(template: string, variables: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return variables[key] || match;
    });
  }

  async shutdown(): Promise<void> {
    this.stopProcessing();
    if (this.fcmProvider) {
      await this.fcmProvider.shutdown();
    }
    if (this.apnsProvider) {
      this.apnsProvider.shutdown();
    }
  }
}
