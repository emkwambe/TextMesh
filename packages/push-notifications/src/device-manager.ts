import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import {
  DeviceToken,
  PushSubscription,
  Platform,
  NotificationPreferences,
  NotificationCategory,
} from './types';

export class DeviceManager {
  private redis: Redis;
  private readonly devicePrefix = 'push:device:';
  private readonly userDevicesPrefix = 'push:user_devices:';
  private readonly subscriptionPrefix = 'push:subscription:';
  private readonly userSubscriptionsPrefix = 'push:user_subscriptions:';
  private readonly preferencesPrefix = 'push:preferences:';

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async registerDevice(
    userId: string,
    token: string,
    platform: Platform,
    deviceId: string,
    metadata?: {
      deviceName?: string;
      appVersion?: string;
      osVersion?: string;
    }
  ): Promise<DeviceToken> {
    const existingDevice = await this.findDeviceByToken(token);
    if (existingDevice) {
      existingDevice.userId = userId;
      existingDevice.lastUsedAt = new Date();
      existingDevice.isActive = true;
      if (metadata) {
        existingDevice.deviceName = metadata.deviceName;
        existingDevice.appVersion = metadata.appVersion;
        existingDevice.osVersion = metadata.osVersion;
      }
      await this.saveDevice(existingDevice);
      return existingDevice;
    }

    const device: DeviceToken = {
      id: uuidv4(),
      userId,
      token,
      platform,
      deviceId,
      deviceName: metadata?.deviceName,
      appVersion: metadata?.appVersion,
      osVersion: metadata?.osVersion,
      createdAt: new Date(),
      lastUsedAt: new Date(),
      isActive: true,
    };

    await this.saveDevice(device);
    await this.redis.sadd(`${this.userDevicesPrefix}${userId}`, device.id);

    return device;
  }

  async unregisterDevice(deviceId: string): Promise<void> {
    const device = await this.getDevice(deviceId);
    if (!device) return;

    device.isActive = false;
    await this.saveDevice(device);
    await this.redis.srem(`${this.userDevicesPrefix}${device.userId}`, deviceId);
  }

  async getDevice(deviceId: string): Promise<DeviceToken | null> {
    const data = await this.redis.get(`${this.devicePrefix}${deviceId}`);
    if (!data) return null;
    return this.deserializeDevice(data);
  }

  async getUserDevices(userId: string, activeOnly = true): Promise<DeviceToken[]> {
    const deviceIds = await this.redis.smembers(`${this.userDevicesPrefix}${userId}`);
    if (deviceIds.length === 0) return [];

    const pipeline = this.redis.pipeline();
    deviceIds.forEach((id) => pipeline.get(`${this.devicePrefix}${id}`));
    const results = await pipeline.exec();

    const devices: DeviceToken[] = [];
    results?.forEach(([err, data]) => {
      if (!err && data) {
        const device = this.deserializeDevice(data as string);
        if (!activeOnly || device.isActive) {
          devices.push(device);
        }
      }
    });

    return devices;
  }

  async getUserDevicesByPlatform(
    userId: string,
    platform: Platform
  ): Promise<DeviceToken[]> {
    const devices = await this.getUserDevices(userId);
    return devices.filter((d) => d.platform === platform);
  }

  async registerWebPushSubscription(
    userId: string,
    endpoint: string,
    keys: { p256dh: string; auth: string },
    userAgent?: string
  ): Promise<PushSubscription> {
    const existingSubscription = await this.findSubscriptionByEndpoint(endpoint);
    if (existingSubscription) {
      existingSubscription.userId = userId;
      existingSubscription.lastUsedAt = new Date();
      existingSubscription.isActive = true;
      await this.saveSubscription(existingSubscription);
      return existingSubscription;
    }

    const subscription: PushSubscription = {
      id: uuidv4(),
      userId,
      endpoint,
      keys,
      userAgent,
      createdAt: new Date(),
      lastUsedAt: new Date(),
      isActive: true,
    };

    await this.saveSubscription(subscription);
    await this.redis.sadd(`${this.userSubscriptionsPrefix}${userId}`, subscription.id);

    return subscription;
  }

  async unregisterWebPushSubscription(subscriptionId: string): Promise<void> {
    const subscription = await this.getSubscription(subscriptionId);
    if (!subscription) return;

    subscription.isActive = false;
    await this.saveSubscription(subscription);
    await this.redis.srem(
      `${this.userSubscriptionsPrefix}${subscription.userId}`,
      subscriptionId
    );
  }

  async getSubscription(subscriptionId: string): Promise<PushSubscription | null> {
    const data = await this.redis.get(`${this.subscriptionPrefix}${subscriptionId}`);
    if (!data) return null;
    return this.deserializeSubscription(data);
  }

  async getUserSubscriptions(userId: string): Promise<PushSubscription[]> {
    const subscriptionIds = await this.redis.smembers(
      `${this.userSubscriptionsPrefix}${userId}`
    );
    if (subscriptionIds.length === 0) return [];

    const pipeline = this.redis.pipeline();
    subscriptionIds.forEach((id) =>
      pipeline.get(`${this.subscriptionPrefix}${id}`)
    );
    const results = await pipeline.exec();

    const subscriptions: PushSubscription[] = [];
    results?.forEach(([err, data]) => {
      if (!err && data) {
        const subscription = this.deserializeSubscription(data as string);
        if (subscription.isActive) {
          subscriptions.push(subscription);
        }
      }
    });

    return subscriptions;
  }

  async setPreferences(
    userId: string,
    preferences: Partial<NotificationPreferences>
  ): Promise<NotificationPreferences> {
    const existing = await this.getPreferences(userId);
    const updated: NotificationPreferences = {
      ...this.getDefaultPreferences(userId),
      ...existing,
      ...preferences,
      userId,
      updatedAt: new Date(),
    };

    await this.redis.set(
      `${this.preferencesPrefix}${userId}`,
      JSON.stringify(updated)
    );

    return updated;
  }

  async getPreferences(userId: string): Promise<NotificationPreferences> {
    const data = await this.redis.get(`${this.preferencesPrefix}${userId}`);
    if (!data) return this.getDefaultPreferences(userId);
    return JSON.parse(data);
  }

  async shouldSendNotification(
    userId: string,
    category: NotificationCategory
  ): Promise<{ send: boolean; reason?: string }> {
    const preferences = await this.getPreferences(userId);

    if (!preferences.enabled) {
      return { send: false, reason: 'notifications_disabled' };
    }

    const categoryPrefs = preferences.categories[category];
    if (categoryPrefs && !categoryPrefs.enabled) {
      return { send: false, reason: 'category_disabled' };
    }

    if (preferences.quietHours?.enabled) {
      const now = new Date();
      const userTime = this.getTimeInTimezone(now, preferences.quietHours.timezone);
      const currentMinutes = userTime.getHours() * 60 + userTime.getMinutes();

      const [startHour, startMin] = preferences.quietHours.start.split(':').map(Number);
      const [endHour, endMin] = preferences.quietHours.end.split(':').map(Number);
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;

      const inQuietHours =
        startMinutes < endMinutes
          ? currentMinutes >= startMinutes && currentMinutes < endMinutes
          : currentMinutes >= startMinutes || currentMinutes < endMinutes;

      if (inQuietHours) {
        return { send: false, reason: 'quiet_hours' };
      }
    }

    return { send: true };
  }

  async markDeviceInactive(deviceId: string, reason: string): Promise<void> {
    const device = await this.getDevice(deviceId);
    if (!device) return;

    device.isActive = false;
    await this.saveDevice(device);
    await this.redis.srem(`${this.userDevicesPrefix}${device.userId}`, deviceId);
  }

  async cleanupInactiveDevices(olderThanDays: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    let cleaned = 0;
    let cursor = '0';

    do {
      const [newCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${this.devicePrefix}*`,
        'COUNT',
        100
      );
      cursor = newCursor;

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const device = this.deserializeDevice(data);
          if (!device.isActive && device.lastUsedAt < cutoffDate) {
            await this.redis.del(key);
            cleaned++;
          }
        }
      }
    } while (cursor !== '0');

    return cleaned;
  }

  private async saveDevice(device: DeviceToken): Promise<void> {
    await this.redis.set(
      `${this.devicePrefix}${device.id}`,
      JSON.stringify(device)
    );
  }

  private async findDeviceByToken(token: string): Promise<DeviceToken | null> {
    let cursor = '0';
    do {
      const [newCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${this.devicePrefix}*`,
        'COUNT',
        100
      );
      cursor = newCursor;

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const device = this.deserializeDevice(data);
          if (device.token === token) {
            return device;
          }
        }
      }
    } while (cursor !== '0');

    return null;
  }

  private async saveSubscription(subscription: PushSubscription): Promise<void> {
    await this.redis.set(
      `${this.subscriptionPrefix}${subscription.id}`,
      JSON.stringify(subscription)
    );
  }

  private async findSubscriptionByEndpoint(
    endpoint: string
  ): Promise<PushSubscription | null> {
    let cursor = '0';
    do {
      const [newCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${this.subscriptionPrefix}*`,
        'COUNT',
        100
      );
      cursor = newCursor;

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const subscription = this.deserializeSubscription(data);
          if (subscription.endpoint === endpoint) {
            return subscription;
          }
        }
      }
    } while (cursor !== '0');

    return null;
  }

  private deserializeDevice(data: string): DeviceToken {
    const device = JSON.parse(data);
    device.createdAt = new Date(device.createdAt);
    device.lastUsedAt = new Date(device.lastUsedAt);
    return device;
  }

  private deserializeSubscription(data: string): PushSubscription {
    const subscription = JSON.parse(data);
    subscription.createdAt = new Date(subscription.createdAt);
    subscription.lastUsedAt = new Date(subscription.lastUsedAt);
    return subscription;
  }

  private getDefaultPreferences(userId: string): NotificationPreferences {
    return {
      userId,
      enabled: true,
      categories: {
        social: { enabled: true, push: true, email: false, inApp: true },
        message: { enabled: true, push: true, email: true, inApp: true },
        mention: { enabled: true, push: true, email: true, inApp: true },
        follow: { enabled: true, push: true, email: false, inApp: true },
        like: { enabled: true, push: false, email: false, inApp: true },
        comment: { enabled: true, push: true, email: false, inApp: true },
        repost: { enabled: true, push: false, email: false, inApp: true },
        system: { enabled: true, push: true, email: true, inApp: true },
        marketing: { enabled: false, push: false, email: false, inApp: false },
        reminder: { enabled: true, push: true, email: true, inApp: true },
      },
      updatedAt: new Date(),
    };
  }

  private getTimeInTimezone(date: Date, timezone: string): Date {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0');
    const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0');
    const result = new Date(date);
    result.setHours(hour, minute);
    return result;
  }
}
