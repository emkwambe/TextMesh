import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { NotificationQueue } from './notification-queue';
import {
  PushNotification,
  NotificationCategory,
  NotificationPriority,
} from './types';

interface ScheduledNotification {
  id: string;
  notification: Omit<PushNotification, 'id' | 'createdAt' | 'status'>;
  schedule: ScheduleConfig;
  lastRun?: Date;
  nextRun: Date;
  runCount: number;
  isActive: boolean;
  createdAt: Date;
}

interface ScheduleConfig {
  type: 'once' | 'recurring' | 'cron';
  at?: Date;
  interval?: number;
  cron?: string;
  timezone?: string;
  maxRuns?: number;
  endDate?: Date;
}

export class NotificationScheduler {
  private redis: Redis;
  private queue: NotificationQueue;
  private readonly schedulePrefix = 'push:schedule:';
  private readonly userSchedulesPrefix = 'push:user_schedules:';
  private processingInterval?: NodeJS.Timeout;

  constructor(redis: Redis, queue: NotificationQueue) {
    this.redis = redis;
    this.queue = queue;
  }

  async schedule(
    userId: string,
    title: string,
    body: string,
    scheduleConfig: ScheduleConfig,
    options: {
      data?: Record<string, string>;
      imageUrl?: string;
      actionUrl?: string;
      category?: NotificationCategory;
      priority?: NotificationPriority;
      ttl?: number;
      collapseKey?: string;
    } = {}
  ): Promise<ScheduledNotification> {
    const nextRun = this.calculateNextRun(scheduleConfig);

    const scheduled: ScheduledNotification = {
      id: uuidv4(),
      notification: {
        userId,
        title,
        body,
        data: options.data,
        imageUrl: options.imageUrl,
        actionUrl: options.actionUrl,
        category: options.category || 'reminder',
        priority: options.priority || 'normal',
        ttl: options.ttl,
        collapseKey: options.collapseKey,
      },
      schedule: scheduleConfig,
      nextRun,
      runCount: 0,
      isActive: true,
      createdAt: new Date(),
    };

    await this.saveSchedule(scheduled);
    await this.redis.sadd(`${this.userSchedulesPrefix}${userId}`, scheduled.id);
    await this.redis.zadd(
      `${this.schedulePrefix}active`,
      nextRun.getTime(),
      scheduled.id
    );

    return scheduled;
  }

  async cancel(scheduleId: string): Promise<boolean> {
    const scheduled = await this.getSchedule(scheduleId);
    if (!scheduled) return false;

    scheduled.isActive = false;
    await this.saveSchedule(scheduled);
    await this.redis.zrem(`${this.schedulePrefix}active`, scheduleId);

    return true;
  }

  async pause(scheduleId: string): Promise<boolean> {
    const scheduled = await this.getSchedule(scheduleId);
    if (!scheduled) return false;

    scheduled.isActive = false;
    await this.saveSchedule(scheduled);
    await this.redis.zrem(`${this.schedulePrefix}active`, scheduleId);

    return true;
  }

  async resume(scheduleId: string): Promise<boolean> {
    const scheduled = await this.getSchedule(scheduleId);
    if (!scheduled) return false;

    scheduled.isActive = true;
    scheduled.nextRun = this.calculateNextRun(scheduled.schedule);
    await this.saveSchedule(scheduled);
    await this.redis.zadd(
      `${this.schedulePrefix}active`,
      scheduled.nextRun.getTime(),
      scheduleId
    );

    return true;
  }

  async getSchedule(scheduleId: string): Promise<ScheduledNotification | null> {
    const data = await this.redis.get(`${this.schedulePrefix}${scheduleId}`);
    if (!data) return null;
    return this.deserializeSchedule(data);
  }

  async getUserSchedules(userId: string): Promise<ScheduledNotification[]> {
    const scheduleIds = await this.redis.smembers(
      `${this.userSchedulesPrefix}${userId}`
    );
    if (scheduleIds.length === 0) return [];

    const schedules: ScheduledNotification[] = [];
    for (const id of scheduleIds) {
      const schedule = await this.getSchedule(id);
      if (schedule) {
        schedules.push(schedule);
      }
    }

    return schedules;
  }

  async processDue(): Promise<number> {
    const now = Date.now();
    const dueIds = await this.redis.zrangebyscore(
      `${this.schedulePrefix}active`,
      '-inf',
      now
    );

    let processed = 0;

    for (const scheduleId of dueIds) {
      const scheduled = await this.getSchedule(scheduleId);
      if (!scheduled || !scheduled.isActive) {
        await this.redis.zrem(`${this.schedulePrefix}active`, scheduleId);
        continue;
      }

      try {
        await this.queue.enqueue(
          scheduled.notification.userId,
          scheduled.notification.title,
          scheduled.notification.body,
          {
            data: scheduled.notification.data,
            imageUrl: scheduled.notification.imageUrl,
            actionUrl: scheduled.notification.actionUrl,
            category: scheduled.notification.category,
            priority: scheduled.notification.priority,
            ttl: scheduled.notification.ttl,
            collapseKey: scheduled.notification.collapseKey,
          }
        );

        scheduled.lastRun = new Date();
        scheduled.runCount++;

        if (this.shouldContinue(scheduled)) {
          scheduled.nextRun = this.calculateNextRun(
            scheduled.schedule,
            scheduled.lastRun
          );
          await this.saveSchedule(scheduled);
          await this.redis.zadd(
            `${this.schedulePrefix}active`,
            scheduled.nextRun.getTime(),
            scheduleId
          );
        } else {
          scheduled.isActive = false;
          await this.saveSchedule(scheduled);
          await this.redis.zrem(`${this.schedulePrefix}active`, scheduleId);
        }

        processed++;
      } catch (error) {
        console.error(`Failed to process scheduled notification ${scheduleId}:`, error);
      }
    }

    return processed;
  }

  startProcessing(intervalMs: number = 60000): void {
    if (this.processingInterval) {
      this.stopProcessing();
    }

    this.processingInterval = setInterval(async () => {
      try {
        await this.processDue();
      } catch (error) {
        console.error('Error processing scheduled notifications:', error);
      }
    }, intervalMs);

    this.processDue().catch(console.error);
  }

  stopProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
    }
  }

  private calculateNextRun(config: ScheduleConfig, fromDate?: Date): Date {
    const from = fromDate || new Date();

    switch (config.type) {
      case 'once':
        return config.at || from;

      case 'recurring':
        if (!config.interval) {
          throw new Error('Interval required for recurring schedule');
        }
        return new Date(from.getTime() + config.interval);

      case 'cron':
        return this.getNextCronRun(config.cron!, config.timezone);

      default:
        return from;
    }
  }

  private getNextCronRun(cronExpression: string, timezone?: string): Date {
    const [minute, hour, dayOfMonth, month, dayOfWeek] = cronExpression.split(' ');

    const now = timezone
      ? this.getDateInTimezone(new Date(), timezone)
      : new Date();

    const next = new Date(now);
    next.setSeconds(0);
    next.setMilliseconds(0);

    const targetMinute = minute === '*' ? now.getMinutes() : parseInt(minute);
    const targetHour = hour === '*' ? now.getHours() : parseInt(hour);

    next.setMinutes(targetMinute);
    next.setHours(targetHour);

    if (next <= now) {
      if (hour === '*' && minute !== '*') {
        next.setHours(next.getHours() + 1);
      } else {
        next.setDate(next.getDate() + 1);
      }
    }

    return next;
  }

  private getDateInTimezone(date: Date, timezone: string): Date {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const values: Record<string, string> = {};
    parts.forEach((part) => {
      values[part.type] = part.value;
    });

    return new Date(
      `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}`
    );
  }

  private shouldContinue(scheduled: ScheduledNotification): boolean {
    if (scheduled.schedule.type === 'once') {
      return false;
    }

    if (
      scheduled.schedule.maxRuns &&
      scheduled.runCount >= scheduled.schedule.maxRuns
    ) {
      return false;
    }

    if (
      scheduled.schedule.endDate &&
      scheduled.nextRun > scheduled.schedule.endDate
    ) {
      return false;
    }

    return true;
  }

  private async saveSchedule(scheduled: ScheduledNotification): Promise<void> {
    await this.redis.set(
      `${this.schedulePrefix}${scheduled.id}`,
      JSON.stringify(scheduled)
    );
  }

  private deserializeSchedule(data: string): ScheduledNotification {
    const scheduled = JSON.parse(data);
    scheduled.createdAt = new Date(scheduled.createdAt);
    scheduled.nextRun = new Date(scheduled.nextRun);
    if (scheduled.lastRun) {
      scheduled.lastRun = new Date(scheduled.lastRun);
    }
    if (scheduled.schedule.at) {
      scheduled.schedule.at = new Date(scheduled.schedule.at);
    }
    if (scheduled.schedule.endDate) {
      scheduled.schedule.endDate = new Date(scheduled.schedule.endDate);
    }
    return scheduled;
  }
}
