import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import {
  Notification,
  NotificationType,
  NotificationPreferences,
  Activity,
  FeedConfig,
} from './types';

const DEFAULT_PREFERENCES: Omit<NotificationPreferences, 'userId'> = {
  enabled: true,
  types: {
    like: { enabled: true, push: false, email: false, inApp: true },
    comment: { enabled: true, push: true, email: false, inApp: true },
    reply: { enabled: true, push: true, email: true, inApp: true },
    mention: { enabled: true, push: true, email: true, inApp: true },
    follow: { enabled: true, push: true, email: false, inApp: true },
    repost: { enabled: true, push: false, email: false, inApp: true },
    quote: { enabled: true, push: true, email: false, inApp: true },
    achievement: { enabled: true, push: true, email: false, inApp: true },
    badge: { enabled: true, push: true, email: false, inApp: true },
    streak: { enabled: true, push: true, email: false, inApp: true },
    challenge: { enabled: true, push: true, email: false, inApp: true },
    system: { enabled: true, push: true, email: true, inApp: true },
    marketing: { enabled: false, push: false, email: false, inApp: false },
  },
  aggregation: {
    enabled: true,
    windowMinutes: 60,
    maxItems: 10,
  },
};

export class NotificationManager {
  private redis: Redis;
  private config: FeedConfig;
  private readonly notificationPrefix = 'feed:notification:';
  private readonly userNotificationsPrefix = 'feed:user_notifications:';
  private readonly preferencesPrefix = 'feed:notification_preferences:';
  private readonly countsPrefix = 'feed:notification_counts:';

  constructor(redis: Redis, config: FeedConfig) {
    this.redis = redis;
    this.config = config;
  }

  async createNotification(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    options: {
      imageUrl?: string;
      actionUrl?: string;
      activityId?: string;
      data?: Record<string, unknown>;
      expiresAt?: Date;
    } = {}
  ): Promise<Notification | null> {
    const preferences = await this.getPreferences(userId);

    if (!preferences.enabled) return null;

    const typePrefs = preferences.types[type];
    if (typePrefs && !typePrefs.enabled) return null;

    const notification: Notification = {
      id: uuidv4(),
      userId,
      type,
      title,
      body,
      imageUrl: options.imageUrl,
      actionUrl: options.actionUrl,
      activityId: options.activityId,
      data: options.data,
      seen: false,
      read: false,
      createdAt: new Date(),
      expiresAt: options.expiresAt,
    };

    await this.redis.set(
      `${this.notificationPrefix}${notification.id}`,
      JSON.stringify(notification),
      'EX',
      this.config.notificationTTL
    );

    await this.redis.zadd(
      `${this.userNotificationsPrefix}${userId}`,
      notification.createdAt.getTime(),
      notification.id
    );

    await this.redis.incr(`${this.countsPrefix}${userId}:unseen`);
    await this.redis.incr(`${this.countsPrefix}${userId}:unread`);

    await this.trimNotifications(userId);

    return notification;
  }

  async createFromActivity(
    activity: Activity,
    targetUserId: string,
    options: {
      title?: string;
      body?: string;
      actionUrl?: string;
    } = {}
  ): Promise<Notification | null> {
    const notificationType = this.activityToNotificationType(activity.verb);
    if (!notificationType) return null;

    const title = options.title || this.generateTitle(activity);
    const body = options.body || this.generateBody(activity);

    return this.createNotification(targetUserId, notificationType, title, body, {
      activityId: activity.id,
      actionUrl: options.actionUrl,
      data: {
        actorId: activity.actorId,
        objectId: activity.objectId,
        objectType: activity.objectType,
      },
    });
  }

  async getNotification(notificationId: string): Promise<Notification | null> {
    const data = await this.redis.get(`${this.notificationPrefix}${notificationId}`);
    if (!data) return null;
    return this.deserializeNotification(data);
  }

  async getUserNotifications(
    userId: string,
    options: {
      limit?: number;
      cursor?: string;
      unreadOnly?: boolean;
    } = {}
  ): Promise<{
    notifications: Notification[];
    cursor?: string;
    hasMore: boolean;
  }> {
    const { limit = 50, cursor, unreadOnly = false } = options;

    const maxScore = cursor ? parseInt(cursor) - 1 : '+inf';
    const notificationIds = await this.redis.zrevrangebyscore(
      `${this.userNotificationsPrefix}${userId}`,
      maxScore,
      '-inf',
      'LIMIT',
      0,
      limit + 1
    );

    const hasMore = notificationIds.length > limit;
    if (hasMore) notificationIds.pop();

    let notifications = await this.getNotifications(notificationIds);

    if (unreadOnly) {
      notifications = notifications.filter((n) => !n.read);
    }

    const nextCursor =
      notifications.length > 0
        ? notifications[notifications.length - 1].createdAt.getTime().toString()
        : undefined;

    return { notifications, cursor: nextCursor, hasMore };
  }

  async getNotifications(notificationIds: string[]): Promise<Notification[]> {
    if (notificationIds.length === 0) return [];

    const pipeline = this.redis.pipeline();
    notificationIds.forEach((id) => pipeline.get(`${this.notificationPrefix}${id}`));
    const results = await pipeline.exec();

    const notifications: Notification[] = [];
    results?.forEach(([err, data]) => {
      if (!err && data) {
        notifications.push(this.deserializeNotification(data as string));
      }
    });

    return notifications;
  }

  async markAsSeen(userId: string, notificationIds?: string[]): Promise<void> {
    if (notificationIds) {
      for (const id of notificationIds) {
        const notification = await this.getNotification(id);
        if (notification && !notification.seen) {
          notification.seen = true;
          await this.redis.set(
            `${this.notificationPrefix}${id}`,
            JSON.stringify(notification),
            'KEEPTTL'
          );
          await this.redis.decr(`${this.countsPrefix}${userId}:unseen`);
        }
      }
    } else {
      const { notifications } = await this.getUserNotifications(userId, { limit: 1000 });
      const unseenIds = notifications.filter((n) => !n.seen).map((n) => n.id);
      await this.markAsSeen(userId, unseenIds);
    }
  }

  async markAsRead(userId: string, notificationIds: string[]): Promise<void> {
    for (const id of notificationIds) {
      const notification = await this.getNotification(id);
      if (notification && !notification.read) {
        if (!notification.seen) {
          notification.seen = true;
          await this.redis.decr(`${this.countsPrefix}${userId}:unseen`);
        }
        notification.read = true;
        await this.redis.set(
          `${this.notificationPrefix}${id}`,
          JSON.stringify(notification),
          'KEEPTTL'
        );
        await this.redis.decr(`${this.countsPrefix}${userId}:unread`);
      }
    }
  }

  async markAllAsRead(userId: string): Promise<void> {
    const { notifications } = await this.getUserNotifications(userId, { limit: 1000 });
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    await this.markAsRead(userId, unreadIds);
  }

  async deleteNotification(
    userId: string,
    notificationId: string
  ): Promise<boolean> {
    const notification = await this.getNotification(notificationId);
    if (!notification) return false;

    await this.redis.del(`${this.notificationPrefix}${notificationId}`);
    await this.redis.zrem(`${this.userNotificationsPrefix}${userId}`, notificationId);

    if (!notification.seen) {
      await this.redis.decr(`${this.countsPrefix}${userId}:unseen`);
    }
    if (!notification.read) {
      await this.redis.decr(`${this.countsPrefix}${userId}:unread`);
    }

    return true;
  }

  async clearAllNotifications(userId: string): Promise<number> {
    const { notifications } = await this.getUserNotifications(userId, { limit: 1000 });

    const pipeline = this.redis.pipeline();
    notifications.forEach((n) => {
      pipeline.del(`${this.notificationPrefix}${n.id}`);
    });
    await pipeline.exec();

    await this.redis.del(`${this.userNotificationsPrefix}${userId}`);
    await this.redis.set(`${this.countsPrefix}${userId}:unseen`, '0');
    await this.redis.set(`${this.countsPrefix}${userId}:unread`, '0');

    return notifications.length;
  }

  async getCounts(userId: string): Promise<{ unseen: number; unread: number }> {
    const [unseen, unread] = await Promise.all([
      this.redis.get(`${this.countsPrefix}${userId}:unseen`),
      this.redis.get(`${this.countsPrefix}${userId}:unread`),
    ]);

    return {
      unseen: Math.max(0, parseInt(unseen || '0')),
      unread: Math.max(0, parseInt(unread || '0')),
    };
  }

  async getPreferences(userId: string): Promise<NotificationPreferences> {
    const data = await this.redis.get(`${this.preferencesPrefix}${userId}`);
    if (!data) {
      return { ...DEFAULT_PREFERENCES, userId };
    }
    return JSON.parse(data);
  }

  async setPreferences(
    userId: string,
    preferences: Partial<NotificationPreferences>
  ): Promise<NotificationPreferences> {
    const existing = await this.getPreferences(userId);
    const updated: NotificationPreferences = {
      ...existing,
      ...preferences,
      userId,
    };

    await this.redis.set(
      `${this.preferencesPrefix}${userId}`,
      JSON.stringify(updated)
    );

    return updated;
  }

  async shouldSendNotification(
    userId: string,
    type: NotificationType,
    channel: 'push' | 'email' | 'inApp'
  ): Promise<boolean> {
    const preferences = await this.getPreferences(userId);

    if (!preferences.enabled) return false;

    const typePrefs = preferences.types[type];
    if (!typePrefs?.enabled) return false;

    return typePrefs[channel] === true;
  }

  private async trimNotifications(userId: string): Promise<void> {
    const maxSize = 500;
    const size = await this.redis.zcard(`${this.userNotificationsPrefix}${userId}`);

    if (size > maxSize) {
      const toRemove = await this.redis.zrange(
        `${this.userNotificationsPrefix}${userId}`,
        0,
        size - maxSize - 1
      );

      if (toRemove.length > 0) {
        const pipeline = this.redis.pipeline();
        toRemove.forEach((id) => {
          pipeline.del(`${this.notificationPrefix}${id}`);
        });
        await pipeline.exec();

        await this.redis.zremrangebyrank(
          `${this.userNotificationsPrefix}${userId}`,
          0,
          size - maxSize - 1
        );
      }
    }
  }

  private activityToNotificationType(verb: string): NotificationType | null {
    const mapping: Record<string, NotificationType> = {
      like: 'like',
      comment: 'comment',
      reply: 'reply',
      mention: 'mention',
      follow: 'follow',
      repost: 'repost',
      quote: 'quote',
      achieve: 'achievement',
      badge: 'badge',
      streak: 'streak',
    };
    return mapping[verb] || null;
  }

  private generateTitle(activity: Activity): string {
    const titles: Record<string, string> = {
      like: 'New like',
      comment: 'New comment',
      reply: 'New reply',
      mention: 'You were mentioned',
      follow: 'New follower',
      repost: 'Your post was reposted',
      quote: 'Your post was quoted',
    };
    return titles[activity.verb] || 'New notification';
  }

  private generateBody(activity: Activity): string {
    const bodies: Record<string, string> = {
      like: 'Someone liked your post',
      comment: 'Someone commented on your post',
      reply: 'Someone replied to your comment',
      mention: 'Someone mentioned you in a post',
      follow: 'Someone started following you',
      repost: 'Someone reposted your post',
      quote: 'Someone quoted your post',
    };
    return bodies[activity.verb] || 'You have a new notification';
  }

  private deserializeNotification(data: string): Notification {
    const notification = JSON.parse(data);
    notification.createdAt = new Date(notification.createdAt);
    if (notification.expiresAt) {
      notification.expiresAt = new Date(notification.expiresAt);
    }
    return notification;
  }
}
