import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import {
  Email,
  EmailRecipient,
  EmailCategory,
  EmailPriority,
  EmailAttachment,
} from './types';

interface QueuedEmail {
  email: Email;
  attempts: number;
  lastAttempt?: Date;
  nextRetry?: Date;
  error?: string;
}

export class EmailQueue {
  private redis: Redis;
  private readonly queuePrefix = 'email:queue:';
  private readonly processingPrefix = 'email:processing:';
  private readonly deadLetterPrefix = 'email:dlq:';
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
    to: EmailRecipient | EmailRecipient[],
    from: EmailRecipient,
    subject: string,
    html: string,
    options: {
      text?: string;
      cc?: EmailRecipient[];
      bcc?: EmailRecipient[];
      replyTo?: EmailRecipient;
      templateId?: string;
      templateData?: Record<string, unknown>;
      attachments?: EmailAttachment[];
      headers?: Record<string, string>;
      tags?: string[];
      metadata?: Record<string, string>;
      category?: EmailCategory;
      priority?: EmailPriority;
      scheduledAt?: Date;
    } = {}
  ): Promise<Email> {
    const email: Email = {
      id: uuidv4(),
      to,
      from,
      subject,
      html,
      text: options.text,
      cc: options.cc,
      bcc: options.bcc,
      replyTo: options.replyTo,
      templateId: options.templateId,
      templateData: options.templateData,
      attachments: options.attachments,
      headers: options.headers,
      tags: options.tags,
      metadata: options.metadata,
      category: options.category || 'transactional',
      priority: options.priority || 'normal',
      scheduledAt: options.scheduledAt,
      createdAt: new Date(),
      status: options.scheduledAt ? 'scheduled' : 'pending',
    };

    const queued: QueuedEmail = {
      email,
      attempts: 0,
    };

    const queueKey = this.getQueueKey(email.priority);
    const score = options.scheduledAt
      ? options.scheduledAt.getTime()
      : Date.now();

    await this.redis.zadd(queueKey, score, JSON.stringify(queued));

    return email;
  }

  async enqueueMultiple(emails: Array<{
    to: EmailRecipient | EmailRecipient[];
    from: EmailRecipient;
    subject: string;
    html: string;
    options?: {
      text?: string;
      category?: EmailCategory;
      priority?: EmailPriority;
      tags?: string[];
    };
  }>): Promise<Email[]> {
    const results: Email[] = [];
    const pipeline = this.redis.pipeline();

    for (const emailData of emails) {
      const email: Email = {
        id: uuidv4(),
        to: emailData.to,
        from: emailData.from,
        subject: emailData.subject,
        html: emailData.html,
        text: emailData.options?.text,
        category: emailData.options?.category || 'transactional',
        priority: emailData.options?.priority || 'normal',
        tags: emailData.options?.tags,
        createdAt: new Date(),
        status: 'pending',
      };

      const queued: QueuedEmail = {
        email,
        attempts: 0,
      };

      const queueKey = this.getQueueKey(email.priority);
      pipeline.zadd(queueKey, Date.now(), JSON.stringify(queued));
      results.push(email);
    }

    await pipeline.exec();
    return results;
  }

  async dequeue(
    priority: EmailPriority = 'normal',
    count: number = 10
  ): Promise<QueuedEmail[]> {
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
      const parsed = JSON.parse(item);
      pipeline.hset(
        `${this.processingPrefix}${priority}`,
        parsed.email.id,
        item
      );
    });
    await pipeline.exec();

    return items.map((item) => {
      const parsed = JSON.parse(item);
      parsed.email.createdAt = new Date(parsed.email.createdAt);
      if (parsed.email.scheduledAt) {
        parsed.email.scheduledAt = new Date(parsed.email.scheduledAt);
      }
      if (parsed.lastAttempt) {
        parsed.lastAttempt = new Date(parsed.lastAttempt);
      }
      return parsed;
    });
  }

  async dequeueAll(count: number = 100): Promise<QueuedEmail[]> {
    const priorities: EmailPriority[] = ['high', 'normal', 'low'];
    const results: QueuedEmail[] = [];

    for (const priority of priorities) {
      const items = await this.dequeue(priority, count - results.length);
      results.push(...items);

      if (results.length >= count) break;
    }

    return results;
  }

  async markComplete(
    emailId: string,
    priority: EmailPriority = 'normal',
    messageId?: string
  ): Promise<void> {
    await this.redis.hdel(`${this.processingPrefix}${priority}`, emailId);

    const date = new Date().toISOString().split('T')[0];
    await this.redis.hincrby(`email:stats:daily:${date}`, 'sent', 1);
  }

  async markFailed(
    emailId: string,
    priority: EmailPriority = 'normal',
    error: string
  ): Promise<void> {
    const item = await this.redis.hget(
      `${this.processingPrefix}${priority}`,
      emailId
    );

    if (!item) return;

    const queued: QueuedEmail = JSON.parse(item);
    queued.attempts++;
    queued.lastAttempt = new Date();
    queued.error = error;

    await this.redis.hdel(`${this.processingPrefix}${priority}`, emailId);

    if (queued.attempts >= this.maxRetries) {
      await this.moveToDeadLetter(queued);
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
    const priorities: EmailPriority[] = ['high', 'normal', 'low'];
    const pending: Record<string, number> = {};
    const processing: Record<string, number> = {};

    for (const priority of priorities) {
      pending[priority] = await this.redis.zcard(this.getQueueKey(priority));
      processing[priority] = await this.redis.hlen(
        `${this.processingPrefix}${priority}`
      );
    }

    const deadLetter = await this.redis.llen(`${this.deadLetterPrefix}emails`);

    return {
      pending: pending as { high: number; normal: number; low: number },
      processing: processing as { high: number; normal: number; low: number },
      deadLetter,
    };
  }

  async cancel(emailId: string): Promise<boolean> {
    const priorities: EmailPriority[] = ['high', 'normal', 'low'];

    for (const priority of priorities) {
      const queueKey = this.getQueueKey(priority);
      const items = await this.redis.zrange(queueKey, 0, -1);

      for (const item of items) {
        const queued: QueuedEmail = JSON.parse(item);
        if (queued.email.id === emailId) {
          await this.redis.zrem(queueKey, item);
          return true;
        }
      }

      const processingItem = await this.redis.hget(
        `${this.processingPrefix}${priority}`,
        emailId
      );
      if (processingItem) {
        await this.redis.hdel(`${this.processingPrefix}${priority}`, emailId);
        return true;
      }
    }

    return false;
  }

  async getDeadLetterItems(
    offset: number = 0,
    limit: number = 100
  ): Promise<Array<{ email: QueuedEmail; error: string; movedAt: Date }>> {
    const items = await this.redis.lrange(
      `${this.deadLetterPrefix}emails`,
      offset,
      offset + limit - 1
    );

    return items.map((item) => {
      const parsed = JSON.parse(item);
      parsed.movedAt = new Date(parsed.movedAt);
      return parsed;
    });
  }

  async retryDeadLetter(emailId: string): Promise<boolean> {
    const items = await this.redis.lrange(`${this.deadLetterPrefix}emails`, 0, -1);

    for (let i = 0; i < items.length; i++) {
      const item = JSON.parse(items[i]);
      if (item.email.email.id === emailId) {
        await this.redis.lrem(`${this.deadLetterPrefix}emails`, 1, items[i]);

        const queued: QueuedEmail = {
          email: item.email.email,
          attempts: 0,
        };

        const queueKey = this.getQueueKey(queued.email.priority);
        await this.redis.zadd(queueKey, Date.now(), JSON.stringify(queued));

        return true;
      }
    }

    return false;
  }

  private getQueueKey(priority: EmailPriority): string {
    return `${this.queuePrefix}${priority}`;
  }

  private async moveToDeadLetter(queued: QueuedEmail): Promise<void> {
    const deadLetterItem = {
      email: queued,
      error: queued.error,
      movedAt: new Date(),
    };

    await this.redis.lpush(
      `${this.deadLetterPrefix}emails`,
      JSON.stringify(deadLetterItem)
    );

    const date = new Date().toISOString().split('T')[0];
    await this.redis.hincrby(`email:stats:daily:${date}`, 'failed', 1);
  }
}
