import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { SendGridProvider } from './providers/sendgrid-provider';
import { SMTPProvider } from './providers/smtp-provider';
import { TemplateEngine } from './template-engine';
import { EmailQueue } from './email-queue';
import { PreferencesManager } from './preferences-manager';
import {
  Email,
  EmailConfig,
  EmailRecipient,
  EmailCategory,
  EmailPriority,
  EmailAttachment,
  EmailTemplate,
  EmailStats,
  EmailEvent,
  EmailEventType,
  DigestConfig,
  DigestContent,
} from './types';

export class EmailService {
  private redis: Redis;
  private provider: SendGridProvider | SMTPProvider;
  private templateEngine: TemplateEngine;
  private queue: EmailQueue;
  private preferencesManager: PreferencesManager;
  private config: EmailConfig;
  private processingInterval?: NodeJS.Timeout;
  private readonly eventsPrefix = 'email:events:';
  private readonly statsPrefix = 'email:stats:';

  constructor(redis: Redis, config: EmailConfig) {
    this.redis = redis;
    this.config = config;
    this.templateEngine = new TemplateEngine(redis);
    this.queue = new EmailQueue(redis, {
      maxRetries: config.retryAttempts,
      retryDelayMs: config.retryDelay,
    });
    this.preferencesManager = new PreferencesManager(redis);

    if (config.provider === 'sendgrid' && config.sendgrid) {
      this.provider = new SendGridProvider(config.sendgrid);
    } else if (config.provider === 'smtp' && config.smtp) {
      this.provider = new SMTPProvider(config.smtp);
    } else {
      throw new Error('Invalid email provider configuration');
    }
  }

  async send(
    to: EmailRecipient | EmailRecipient[],
    subject: string,
    html: string,
    options: {
      text?: string;
      cc?: EmailRecipient[];
      bcc?: EmailRecipient[];
      replyTo?: EmailRecipient;
      from?: EmailRecipient;
      attachments?: EmailAttachment[];
      headers?: Record<string, string>;
      tags?: string[];
      metadata?: Record<string, string>;
      category?: EmailCategory;
      priority?: EmailPriority;
      scheduledAt?: Date;
      skipPreferenceCheck?: boolean;
    } = {}
  ): Promise<Email> {
    const recipients = Array.isArray(to) ? to : [to];
    const category = options.category || 'transactional';

    if (!options.skipPreferenceCheck) {
      for (const recipient of recipients) {
        const userId = options.metadata?.userId || recipient.email;
        const { send, reason } = await this.preferencesManager.shouldSendEmail(
          userId,
          category
        );

        if (!send) {
          const email: Email = {
            id: uuidv4(),
            to: recipients,
            from: options.from || this.config.defaultFrom,
            subject,
            html,
            text: options.text,
            category,
            priority: options.priority || 'normal',
            createdAt: new Date(),
            status: 'failed',
          };
          return email;
        }
      }
    }

    return this.queue.enqueue(
      recipients,
      options.from || this.config.defaultFrom,
      subject,
      html,
      {
        text: options.text,
        cc: options.cc,
        bcc: options.bcc,
        replyTo: options.replyTo || this.config.replyTo,
        attachments: options.attachments,
        headers: options.headers,
        tags: options.tags,
        metadata: options.metadata,
        category,
        priority: options.priority,
        scheduledAt: options.scheduledAt,
      }
    );
  }

  async sendFromTemplate(
    to: EmailRecipient | EmailRecipient[],
    templateId: string,
    data: Record<string, unknown>,
    options: {
      from?: EmailRecipient;
      cc?: EmailRecipient[];
      bcc?: EmailRecipient[];
      replyTo?: EmailRecipient;
      attachments?: EmailAttachment[];
      tags?: string[];
      metadata?: Record<string, string>;
      priority?: EmailPriority;
      scheduledAt?: Date;
    } = {}
  ): Promise<Email> {
    const template = await this.templateEngine.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const rendered = this.templateEngine.render(template, data);

    return this.send(to, rendered.subject, rendered.html, {
      ...options,
      text: rendered.text,
      category: template.category,
    });
  }

  async sendBulk(
    recipients: Array<{
      to: EmailRecipient;
      data?: Record<string, unknown>;
    }>,
    templateId: string,
    options: {
      from?: EmailRecipient;
      tags?: string[];
      category?: EmailCategory;
      priority?: EmailPriority;
    } = {}
  ): Promise<Email[]> {
    const template = await this.templateEngine.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const emails: Array<{
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
    }> = [];

    for (const recipient of recipients) {
      const rendered = this.templateEngine.render(template, recipient.data || {});
      emails.push({
        to: recipient.to,
        from: options.from || this.config.defaultFrom,
        subject: rendered.subject,
        html: rendered.html,
        options: {
          text: rendered.text,
          category: options.category || template.category,
          priority: options.priority,
          tags: options.tags,
        },
      });
    }

    return this.queue.enqueueMultiple(emails);
  }

  async processQueue(): Promise<number> {
    const items = await this.queue.dequeueAll(this.config.batchSize);
    let processed = 0;

    for (const item of items) {
      try {
        const result = await this.provider.send(item.email);

        if (result.success) {
          await this.queue.markComplete(
            item.email.id,
            item.email.priority,
            result.messageId
          );
          await this.recordEvent(item.email.id, 'sent', {
            messageId: result.messageId,
          });
          processed++;
        } else {
          await this.queue.markFailed(
            item.email.id,
            item.email.priority,
            'Send failed'
          );
        }
      } catch (error) {
        await this.queue.markFailed(
          item.email.id,
          item.email.priority,
          error instanceof Error ? error.message : 'Unknown error'
        );
      }
    }

    return processed;
  }

  async handleWebhook(
    event: {
      type: EmailEventType;
      email?: string;
      emailId?: string;
      messageId?: string;
      timestamp?: Date;
      data?: Record<string, unknown>;
    }
  ): Promise<void> {
    const emailId = event.emailId || event.messageId || '';

    await this.recordEvent(emailId, event.type, event.data);

    const date = new Date().toISOString().split('T')[0];

    switch (event.type) {
      case 'delivered':
        await this.redis.hincrby(`${this.statsPrefix}daily:${date}`, 'delivered', 1);
        break;
      case 'opened':
        await this.redis.hincrby(`${this.statsPrefix}daily:${date}`, 'opened', 1);
        break;
      case 'clicked':
        await this.redis.hincrby(`${this.statsPrefix}daily:${date}`, 'clicked', 1);
        break;
      case 'bounced':
        await this.redis.hincrby(`${this.statsPrefix}daily:${date}`, 'bounced', 1);
        if (event.email) {
          await this.preferencesManager.addToSuppressionList(
            event.email,
            'bounce',
            event.data?.type as string
          );
        }
        break;
      case 'complained':
        await this.redis.hincrby(`${this.statsPrefix}daily:${date}`, 'complained', 1);
        if (event.email) {
          await this.preferencesManager.addToSuppressionList(
            event.email,
            'complaint'
          );
        }
        break;
      case 'unsubscribed':
        await this.redis.hincrby(`${this.statsPrefix}daily:${date}`, 'unsubscribed', 1);
        break;
    }
  }

  async sendDigest(userId: string, content: DigestContent): Promise<Email | null> {
    const config = await this.preferencesManager.getDigestConfig(userId);
    if (!config) return null;

    const preferences = await this.preferencesManager.getPreferences(userId);
    if (preferences.globalUnsubscribe || preferences.categories.digest === false) {
      return null;
    }

    const template = await this.templateEngine.getTemplateByName(
      config.frequency === 'daily' ? 'daily_digest' : 'weekly_digest'
    );

    if (!template) {
      console.error(`Digest template not found for ${config.frequency}`);
      return null;
    }

    const rendered = this.templateEngine.render(template, {
      items: content.items,
      period: content.period,
      itemCount: content.items.length,
    });

    const email = await this.send(
      { email: preferences.email, name: userId },
      rendered.subject,
      rendered.html,
      {
        text: rendered.text,
        category: 'digest',
        metadata: { userId },
        skipPreferenceCheck: true,
      }
    );

    await this.preferencesManager.markDigestSent(userId);

    return email;
  }

  async processDigests(
    getDigestContent: (userId: string, config: DigestConfig) => Promise<DigestContent>
  ): Promise<number> {
    const dueDigests = await this.preferencesManager.getDueDigests();
    let sent = 0;

    for (const config of dueDigests) {
      try {
        const content = await getDigestContent(config.userId, config);
        if (content.items.length > 0) {
          await this.sendDigest(config.userId, content);
          sent++;
        } else {
          await this.preferencesManager.markDigestSent(config.userId);
        }
      } catch (error) {
        console.error(`Failed to send digest to ${config.userId}:`, error);
      }
    }

    return sent;
  }

  async getStats(date?: string): Promise<EmailStats> {
    const targetDate = date || new Date().toISOString().split('T')[0];

    const daily = await this.redis.hgetall(`${this.statsPrefix}daily:${targetDate}`);

    const sent = parseInt(daily.sent || '0');
    const delivered = parseInt(daily.delivered || '0');
    const opened = parseInt(daily.opened || '0');
    const clicked = parseInt(daily.clicked || '0');
    const bounced = parseInt(daily.bounced || '0');
    const complained = parseInt(daily.complained || '0');
    const unsubscribed = parseInt(daily.unsubscribed || '0');

    const categories: EmailCategory[] = [
      'transactional', 'notification', 'marketing', 'digest',
      'security', 'welcome', 'password_reset', 'verification', 'invitation',
    ];

    const byCategory: Record<string, { sent: number; delivered: number; opened: number; clicked: number }> = {};
    for (const category of categories) {
      byCategory[category] = {
        sent: 0,
        delivered: 0,
        opened: 0,
        clicked: 0,
      };
    }

    return {
      period: targetDate,
      sent,
      delivered,
      opened,
      clicked,
      bounced,
      complained,
      unsubscribed,
      deliveryRate: sent > 0 ? delivered / sent : 0,
      openRate: delivered > 0 ? opened / delivered : 0,
      clickRate: opened > 0 ? clicked / opened : 0,
      bounceRate: sent > 0 ? bounced / sent : 0,
      complaintRate: delivered > 0 ? complained / delivered : 0,
      byCategory: byCategory as EmailStats['byCategory'],
    };
  }

  async getEmailEvents(
    emailId: string
  ): Promise<EmailEvent[]> {
    const events = await this.redis.lrange(
      `${this.eventsPrefix}${emailId}`,
      0,
      -1
    );

    return events.map((e) => {
      const event = JSON.parse(e);
      event.timestamp = new Date(event.timestamp);
      return event;
    });
  }

  private async recordEvent(
    emailId: string,
    type: EmailEventType,
    data?: Record<string, unknown>
  ): Promise<void> {
    const event: EmailEvent = {
      id: uuidv4(),
      emailId,
      type,
      timestamp: new Date(),
      data,
    };

    await this.redis.lpush(
      `${this.eventsPrefix}${emailId}`,
      JSON.stringify(event)
    );

    await this.redis.expire(`${this.eventsPrefix}${emailId}`, 86400 * 30);
  }

  async createTemplate(
    name: string,
    category: EmailCategory,
    subject: string,
    content: { mjml?: string; html?: string; text?: string },
    variables: EmailTemplate['variables'],
    options?: { description?: string; preheader?: string }
  ): Promise<EmailTemplate> {
    return this.templateEngine.createTemplate(
      name,
      category,
      subject,
      content,
      variables,
      options
    );
  }

  async updateTemplate(
    templateId: string,
    updates: Partial<Pick<EmailTemplate, 'name' | 'subject' | 'html' | 'mjml' | 'text' | 'variables' | 'preheader' | 'isActive'>>
  ): Promise<EmailTemplate> {
    return this.templateEngine.updateTemplate(templateId, updates);
  }

  getTemplateEngine(): TemplateEngine {
    return this.templateEngine;
  }

  getQueue(): EmailQueue {
    return this.queue;
  }

  getPreferencesManager(): PreferencesManager {
    return this.preferencesManager;
  }

  startProcessing(intervalMs: number = 1000): void {
    if (this.processingInterval) {
      this.stopProcessing();
    }

    this.processingInterval = setInterval(async () => {
      try {
        await this.processQueue();
      } catch (error) {
        console.error('Error processing email queue:', error);
      }
    }, intervalMs);
  }

  stopProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
    }
  }

  async shutdown(): Promise<void> {
    this.stopProcessing();
    if (this.provider instanceof SMTPProvider) {
      this.provider.close();
    }
  }
}
