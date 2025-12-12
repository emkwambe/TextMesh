import { Redis } from 'ioredis';
import {
  EmailPreferences,
  EmailCategory,
  DigestConfig,
} from './types';

export class PreferencesManager {
  private redis: Redis;
  private readonly preferencesPrefix = 'email:preferences:';
  private readonly digestPrefix = 'email:digest:';
  private readonly suppressionPrefix = 'email:suppression:';

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async getPreferences(userId: string): Promise<EmailPreferences> {
    const data = await this.redis.get(`${this.preferencesPrefix}${userId}`);
    if (!data) {
      return this.getDefaultPreferences(userId);
    }
    return JSON.parse(data);
  }

  async setPreferences(
    userId: string,
    preferences: Partial<EmailPreferences>
  ): Promise<EmailPreferences> {
    const existing = await this.getPreferences(userId);
    const updated: EmailPreferences = {
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

  async updateCategoryPreference(
    userId: string,
    category: EmailCategory,
    enabled: boolean
  ): Promise<void> {
    const preferences = await this.getPreferences(userId);
    preferences.categories[category] = enabled;
    preferences.updatedAt = new Date();

    await this.redis.set(
      `${this.preferencesPrefix}${userId}`,
      JSON.stringify(preferences)
    );
  }

  async shouldSendEmail(
    userId: string,
    category: EmailCategory
  ): Promise<{ send: boolean; reason?: string }> {
    const preferences = await this.getPreferences(userId);

    if (preferences.globalUnsubscribe) {
      return { send: false, reason: 'global_unsubscribe' };
    }

    if (preferences.categories[category] === false) {
      return { send: false, reason: 'category_unsubscribe' };
    }

    const email = preferences.email;
    if (await this.isEmailSuppressed(email)) {
      return { send: false, reason: 'email_suppressed' };
    }

    return { send: true };
  }

  async globalUnsubscribe(userId: string, email: string): Promise<void> {
    await this.setPreferences(userId, {
      email,
      globalUnsubscribe: true,
    });

    await this.addToSuppressionList(email, 'unsubscribe');
  }

  async resubscribe(userId: string): Promise<void> {
    await this.setPreferences(userId, {
      globalUnsubscribe: false,
    });

    const preferences = await this.getPreferences(userId);
    await this.removeFromSuppressionList(preferences.email);
  }

  async addToSuppressionList(
    email: string,
    reason: 'unsubscribe' | 'bounce' | 'complaint' | 'manual',
    details?: string
  ): Promise<void> {
    const suppression = {
      email,
      reason,
      details,
      timestamp: new Date(),
    };

    await this.redis.hset(
      `${this.suppressionPrefix}list`,
      email.toLowerCase(),
      JSON.stringify(suppression)
    );
  }

  async removeFromSuppressionList(email: string): Promise<void> {
    await this.redis.hdel(`${this.suppressionPrefix}list`, email.toLowerCase());
  }

  async isEmailSuppressed(email: string): Promise<boolean> {
    return (await this.redis.hexists(
      `${this.suppressionPrefix}list`,
      email.toLowerCase()
    )) === 1;
  }

  async getSuppressionList(
    offset: number = 0,
    limit: number = 100
  ): Promise<Array<{ email: string; reason: string; timestamp: Date }>> {
    const all = await this.redis.hgetall(`${this.suppressionPrefix}list`);
    const entries = Object.values(all)
      .map((data) => JSON.parse(data))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return entries.slice(offset, offset + limit);
  }

  async setDigestConfig(config: DigestConfig): Promise<void> {
    await this.redis.hset(
      `${this.digestPrefix}configs`,
      config.userId,
      JSON.stringify(config)
    );

    const nextDelivery = this.calculateNextDelivery(config);
    await this.redis.zadd(
      `${this.digestPrefix}schedule`,
      nextDelivery.getTime(),
      config.userId
    );
  }

  async getDigestConfig(userId: string): Promise<DigestConfig | null> {
    const data = await this.redis.hget(`${this.digestPrefix}configs`, userId);
    if (!data) return null;
    return JSON.parse(data);
  }

  async removeDigestConfig(userId: string): Promise<void> {
    await this.redis.hdel(`${this.digestPrefix}configs`, userId);
    await this.redis.zrem(`${this.digestPrefix}schedule`, userId);
  }

  async getDueDigests(): Promise<DigestConfig[]> {
    const now = Date.now();
    const userIds = await this.redis.zrangebyscore(
      `${this.digestPrefix}schedule`,
      '-inf',
      now
    );

    const configs: DigestConfig[] = [];
    for (const userId of userIds) {
      const config = await this.getDigestConfig(userId);
      if (config) {
        configs.push(config);
      }
    }

    return configs;
  }

  async markDigestSent(userId: string): Promise<void> {
    const config = await this.getDigestConfig(userId);
    if (!config) return;

    const nextDelivery = this.calculateNextDelivery(config);
    await this.redis.zadd(
      `${this.digestPrefix}schedule`,
      nextDelivery.getTime(),
      userId
    );
  }

  private calculateNextDelivery(config: DigestConfig): Date {
    const now = new Date();
    const userTime = this.getDateInTimezone(now, config.timezone);

    const next = new Date(userTime);
    next.setHours(config.deliveryHour, 0, 0, 0);

    if (config.frequency === 'daily') {
      if (next <= userTime) {
        next.setDate(next.getDate() + 1);
      }
    } else if (config.frequency === 'weekly') {
      const targetDay = config.deliveryDayOfWeek ?? 1;
      const currentDay = next.getDay();
      const daysUntilTarget = (targetDay - currentDay + 7) % 7 || 7;

      if (next <= userTime || daysUntilTarget === 0) {
        next.setDate(next.getDate() + daysUntilTarget);
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
      hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const values: Record<string, string> = {};
    parts.forEach((part) => {
      values[part.type] = part.value;
    });

    return new Date(
      `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:00`
    );
  }

  private getDefaultPreferences(userId: string): EmailPreferences {
    return {
      userId,
      email: '',
      globalUnsubscribe: false,
      categories: {
        transactional: true,
        notification: true,
        marketing: false,
        digest: true,
        security: true,
        welcome: true,
        password_reset: true,
        verification: true,
        invitation: true,
      },
      frequency: 'realtime',
      updatedAt: new Date(),
    };
  }
}
