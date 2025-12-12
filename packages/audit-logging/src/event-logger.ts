import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import {
  AuditEvent,
  AuditEventInput,
  AuditConfig,
  AuditSeverity,
  AuditSubscriber,
  AuditCategory,
  AuditAction,
} from './types';

const DEFAULT_CONFIG: AuditConfig = {
  enabled: true,
  retentionDays: 365,
  archiveEnabled: true,
  realTimeStream: true,
  batchSize: 100,
  flushIntervalMs: 5000,
  hashPII: true,
  signEvents: true,
};

export class EventLogger {
  private redis: Redis;
  private config: AuditConfig;
  private eventBuffer: AuditEvent[] = [];
  private flushInterval?: NodeJS.Timeout;
  private subscribers: Map<string, AuditSubscriber> = new Map();
  private signingKey: string;
  private readonly eventPrefix = 'audit:event:';
  private readonly indexPrefix = 'audit:index:';
  private readonly streamKey = 'audit:stream';
  private readonly piiFields = ['email', 'phone', 'ssn', 'password', 'creditCard'];

  constructor(redis: Redis, config?: Partial<AuditConfig>, signingKey?: string) {
    this.redis = redis;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.signingKey = signingKey || crypto.randomBytes(32).toString('hex');

    if (this.config.enabled && this.config.flushIntervalMs > 0) {
      this.startBufferFlush();
    }
  }

  async log(input: AuditEventInput): Promise<AuditEvent> {
    if (!this.config.enabled) {
      throw new Error('Audit logging is disabled');
    }

    if (this.shouldExclude(input.category, input.action)) {
      throw new Error('Event category or action is excluded');
    }

    const event = this.createEvent(input);

    if (this.config.hashPII) {
      this.hashSensitiveData(event);
    }

    if (this.config.signEvents) {
      (event as AuditEvent & { signature?: string }).signature = this.signEvent(event);
    }

    if (this.config.batchSize > 1) {
      this.eventBuffer.push(event);
      if (this.eventBuffer.length >= this.config.batchSize) {
        await this.flushBuffer();
      }
    } else {
      await this.persistEvent(event);
    }

    if (this.config.realTimeStream) {
      await this.publishToStream(event);
    }

    this.notifySubscribers(event);

    return event;
  }

  async logBatch(inputs: AuditEventInput[]): Promise<AuditEvent[]> {
    const events: AuditEvent[] = [];

    for (const input of inputs) {
      try {
        const event = await this.log(input);
        events.push(event);
      } catch (error) {
        console.error('Failed to log audit event:', error);
      }
    }

    return events;
  }

  // Convenience methods for common events
  async logAuthentication(
    action: 'login' | 'logout' | 'login_failed' | 'password_change' | 'password_reset',
    actorId: string,
    options: {
      username?: string;
      ip?: string;
      userAgent?: string;
      sessionId?: string;
      success?: boolean;
      reason?: string;
    } = {}
  ): Promise<AuditEvent> {
    return this.log({
      category: 'authentication',
      action,
      severity: action === 'login_failed' ? 'medium' : 'low',
      status: options.success !== false ? 'success' : 'failure',
      actor: {
        type: 'user',
        id: actorId,
        username: options.username,
        ip: options.ip,
        userAgent: options.userAgent,
        sessionId: options.sessionId,
      },
      message: this.getAuthMessage(action, options.username),
      details: options.reason,
    });
  }

  async logAuthorization(
    action: 'permission_granted' | 'permission_revoked' | 'role_assigned' | 'role_removed' | 'access_denied',
    actorId: string,
    targetUserId: string,
    permission: string,
    options: {
      adminUsername?: string;
      ip?: string;
    } = {}
  ): Promise<AuditEvent> {
    return this.log({
      category: 'authorization',
      action,
      severity: action === 'access_denied' ? 'medium' : 'low',
      status: action === 'access_denied' ? 'failure' : 'success',
      actor: {
        type: 'admin',
        id: actorId,
        username: options.adminUsername,
        ip: options.ip,
      },
      resource: {
        type: 'user',
        id: targetUserId,
        attributes: { permission },
      },
      message: `${action.replace(/_/g, ' ')}: ${permission}`,
    });
  }

  async logContentAction(
    action: 'content_created' | 'content_updated' | 'content_deleted' | 'content_published',
    actorId: string,
    contentType: string,
    contentId: string,
    options: {
      username?: string;
      ip?: string;
      changes?: Array<{ field: string; oldValue: unknown; newValue: unknown }>;
    } = {}
  ): Promise<AuditEvent> {
    return this.log({
      category: 'content',
      action,
      severity: 'low',
      status: 'success',
      actor: {
        type: 'user',
        id: actorId,
        username: options.username,
        ip: options.ip,
      },
      resource: {
        type: contentType,
        id: contentId,
      },
      changes: options.changes?.map(c => ({
        ...c,
        type: c.oldValue === undefined ? 'added' : c.newValue === undefined ? 'removed' : 'modified',
      })) as AuditEvent['changes'],
      message: `${contentType} ${action.replace('content_', '')}`,
    });
  }

  async logModeration(
    action: 'content_flagged' | 'content_removed' | 'content_approved' | 'user_warned' | 'user_banned',
    moderatorId: string,
    targetType: 'user' | 'content',
    targetId: string,
    options: {
      moderatorUsername?: string;
      ip?: string;
      reason?: string;
      duration?: number;
    } = {}
  ): Promise<AuditEvent> {
    return this.log({
      category: 'moderation',
      action,
      severity: action === 'user_banned' ? 'high' : 'medium',
      status: 'success',
      actor: {
        type: 'admin',
        id: moderatorId,
        username: options.moderatorUsername,
        ip: options.ip,
      },
      resource: {
        type: targetType,
        id: targetId,
        attributes: {
          reason: options.reason,
          duration: options.duration,
        },
      },
      message: `${action.replace(/_/g, ' ')}`,
      details: options.reason,
    });
  }

  async logSecurityEvent(
    action: 'suspicious_activity' | 'rate_limit_exceeded' | 'ip_blocked' | 'security_alert',
    severity: AuditSeverity,
    options: {
      actorId?: string;
      ip?: string;
      details?: string;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<AuditEvent> {
    return this.log({
      category: 'security',
      action,
      severity,
      status: action === 'ip_blocked' ? 'success' : 'failure',
      actor: {
        type: options.actorId ? 'user' : 'anonymous',
        id: options.actorId,
        ip: options.ip,
      },
      message: action.replace(/_/g, ' '),
      details: options.details,
      metadata: options.metadata,
    });
  }

  async logDataAccess(
    action: 'data_exported' | 'data_imported' | 'data_deleted' | 'pii_accessed',
    actorId: string,
    resourceType: string,
    resourceId: string,
    options: {
      username?: string;
      ip?: string;
      purpose?: string;
      dataTypes?: string[];
    } = {}
  ): Promise<AuditEvent> {
    return this.log({
      category: 'data_access',
      action,
      severity: action === 'pii_accessed' ? 'high' : 'medium',
      status: 'success',
      actor: {
        type: 'user',
        id: actorId,
        username: options.username,
        ip: options.ip,
      },
      resource: {
        type: resourceType,
        id: resourceId,
        attributes: {
          dataTypes: options.dataTypes,
        },
      },
      message: `${action.replace(/_/g, ' ')} for ${resourceType}`,
      details: options.purpose,
    });
  }

  async logAdminAction(
    action: 'admin_action' | 'config_changed' | 'feature_toggled' | 'maintenance_started' | 'maintenance_ended',
    adminId: string,
    options: {
      username?: string;
      ip?: string;
      target?: { type: string; id: string };
      changes?: Array<{ field: string; oldValue: unknown; newValue: unknown }>;
      details?: string;
    } = {}
  ): Promise<AuditEvent> {
    return this.log({
      category: 'admin',
      action,
      severity: 'high',
      status: 'success',
      actor: {
        type: 'admin',
        id: adminId,
        username: options.username,
        ip: options.ip,
      },
      resource: options.target
        ? { type: options.target.type, id: options.target.id }
        : undefined,
      changes: options.changes?.map(c => ({
        ...c,
        type: c.oldValue === undefined ? 'added' : c.newValue === undefined ? 'removed' : 'modified',
      })) as AuditEvent['changes'],
      message: action.replace(/_/g, ' '),
      details: options.details,
    });
  }

  async logSystemEvent(
    action: 'system_started' | 'system_stopped' | 'backup_created' | 'backup_restored' | 'migration_run' | 'cache_cleared',
    options: {
      details?: string;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<AuditEvent> {
    return this.log({
      category: 'system',
      action,
      severity: action === 'system_stopped' ? 'high' : 'medium',
      status: 'success',
      actor: {
        type: 'system',
      },
      message: action.replace(/_/g, ' '),
      details: options.details,
      metadata: options.metadata,
    });
  }

  subscribe(subscriber: AuditSubscriber): string {
    this.subscribers.set(subscriber.id, subscriber);
    return subscriber.id;
  }

  unsubscribe(subscriberId: string): boolean {
    return this.subscribers.delete(subscriberId);
  }

  async flushBuffer(): Promise<void> {
    if (this.eventBuffer.length === 0) return;

    const events = [...this.eventBuffer];
    this.eventBuffer = [];

    const pipeline = this.redis.pipeline();

    for (const event of events) {
      this.addEventToPipeline(pipeline, event);
    }

    await pipeline.exec();
  }

  private createEvent(input: AuditEventInput): AuditEvent {
    return {
      id: uuidv4(),
      timestamp: new Date(),
      category: input.category,
      action: input.action,
      severity: input.severity || this.getDefaultSeverity(input.action),
      status: input.status || 'success',
      actor: input.actor,
      resource: input.resource,
      changes: input.changes,
      location: input.location,
      request: input.request,
      metadata: input.metadata,
      message: input.message,
      details: input.details,
      correlationId: input.correlationId,
      parentEventId: input.parentEventId,
      tags: input.tags,
    };
  }

  private getDefaultSeverity(action: AuditAction): AuditSeverity {
    const highSeverityActions = [
      'user_banned', 'user_deleted', 'data_deleted', 'system_stopped',
      'security_alert', 'ip_blocked', 'config_changed',
    ];
    const mediumSeverityActions = [
      'login_failed', 'access_denied', 'content_removed', 'user_suspended',
      'suspicious_activity', 'rate_limit_exceeded', 'pii_accessed',
    ];

    if (highSeverityActions.includes(action)) return 'high';
    if (mediumSeverityActions.includes(action)) return 'medium';
    return 'low';
  }

  private getAuthMessage(action: string, username?: string): string {
    const user = username || 'User';
    switch (action) {
      case 'login': return `${user} logged in successfully`;
      case 'logout': return `${user} logged out`;
      case 'login_failed': return `Failed login attempt for ${user}`;
      case 'password_change': return `${user} changed password`;
      case 'password_reset': return `Password reset for ${user}`;
      default: return `Authentication action: ${action}`;
    }
  }

  private shouldExclude(category: AuditCategory, action: AuditAction): boolean {
    if (this.config.excludeCategories?.includes(category)) return true;
    if (this.config.excludeActions?.includes(action)) return true;
    return false;
  }

  private hashSensitiveData(event: AuditEvent): void {
    const fieldsToHash = [...this.piiFields, ...(this.config.sensitiveFields || [])];

    const hashValue = (value: unknown): unknown => {
      if (typeof value === 'string' && value.length > 0) {
        return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16) + '***';
      }
      return value;
    };

    const processObject = (obj: Record<string, unknown>): void => {
      for (const key of Object.keys(obj)) {
        if (fieldsToHash.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
          obj[key] = hashValue(obj[key]);
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          processObject(obj[key] as Record<string, unknown>);
        }
      }
    };

    if (event.actor) processObject(event.actor as unknown as Record<string, unknown>);
    if (event.metadata) processObject(event.metadata);
    if (event.resource?.attributes) processObject(event.resource.attributes as Record<string, unknown>);
  }

  private signEvent(event: AuditEvent): string {
    const data = JSON.stringify({
      id: event.id,
      timestamp: event.timestamp,
      category: event.category,
      action: event.action,
      actor: event.actor,
      resource: event.resource,
    });

    return crypto
      .createHmac('sha256', this.signingKey)
      .update(data)
      .digest('hex');
  }

  private async persistEvent(event: AuditEvent): Promise<void> {
    const pipeline = this.redis.pipeline();
    this.addEventToPipeline(pipeline, event);
    await pipeline.exec();
  }

  private addEventToPipeline(pipeline: ReturnType<Redis['pipeline']>, event: AuditEvent): void {
    const eventData = JSON.stringify(event);
    const timestamp = event.timestamp.getTime();

    // Store event
    pipeline.set(
      `${this.eventPrefix}${event.id}`,
      eventData,
      'EX',
      this.config.retentionDays * 86400
    );

    // Add to time-based sorted set
    pipeline.zadd(`${this.indexPrefix}time`, timestamp, event.id);

    // Add to category index
    pipeline.zadd(`${this.indexPrefix}category:${event.category}`, timestamp, event.id);

    // Add to action index
    pipeline.zadd(`${this.indexPrefix}action:${event.action}`, timestamp, event.id);

    // Add to severity index
    pipeline.zadd(`${this.indexPrefix}severity:${event.severity}`, timestamp, event.id);

    // Add to actor index
    if (event.actor.id) {
      pipeline.zadd(`${this.indexPrefix}actor:${event.actor.id}`, timestamp, event.id);
    }

    // Add to resource index
    if (event.resource) {
      pipeline.zadd(
        `${this.indexPrefix}resource:${event.resource.type}:${event.resource.id}`,
        timestamp,
        event.id
      );
    }

    // Add to correlation index
    if (event.correlationId) {
      pipeline.sadd(`${this.indexPrefix}correlation:${event.correlationId}`, event.id);
    }

    // Add to tags index
    if (event.tags) {
      for (const tag of event.tags) {
        pipeline.zadd(`${this.indexPrefix}tag:${tag}`, timestamp, event.id);
      }
    }
  }

  private async publishToStream(event: AuditEvent): Promise<void> {
    await this.redis.xadd(
      this.streamKey,
      '*',
      'event',
      JSON.stringify(event)
    );

    // Trim stream to reasonable size
    await this.redis.xtrim(this.streamKey, 'MAXLEN', '~', 10000);
  }

  private notifySubscribers(event: AuditEvent): void {
    for (const subscriber of this.subscribers.values()) {
      if (this.matchesFilter(event, subscriber.filter)) {
        try {
          const result = subscriber.callback(event);
          if (result instanceof Promise) {
            result.catch(err => {
              console.error(`Subscriber ${subscriber.id} error:`, err);
            });
          }
        } catch (error) {
          console.error(`Subscriber ${subscriber.id} error:`, error);
        }
      }
    }
  }

  private matchesFilter(
    event: AuditEvent,
    filter: Partial<AuditSubscriber['filter']>
  ): boolean {
    if (filter.categories && !filter.categories.includes(event.category)) return false;
    if (filter.actions && !filter.actions.includes(event.action)) return false;
    if (filter.severities && !filter.severities.includes(event.severity)) return false;
    if (filter.actorIds && event.actor.id && !filter.actorIds.includes(event.actor.id)) return false;
    return true;
  }

  private startBufferFlush(): void {
    this.flushInterval = setInterval(async () => {
      try {
        await this.flushBuffer();
      } catch (error) {
        console.error('Failed to flush audit buffer:', error);
      }
    }, this.config.flushIntervalMs);
  }

  async shutdown(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    await this.flushBuffer();
  }
}
