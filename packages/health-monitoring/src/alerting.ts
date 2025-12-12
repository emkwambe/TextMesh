import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import {
  Alert,
  AlertType,
  AlertSeverity,
  AlertStatus,
  AlertRule,
  AlertCondition,
  AlertNotification,
} from './types';
import { MetricsCollector } from './metrics-collector';

export class AlertingService {
  private redis: Redis;
  private metricsCollector: MetricsCollector;
  private rules: Map<string, AlertRule> = new Map();
  private alertCooldowns: Map<string, number> = new Map();
  private checkInterval?: NodeJS.Timeout;
  private readonly alertPrefix = 'monitoring:alert:';
  private readonly rulePrefix = 'monitoring:alert_rule:';
  private notificationHandlers: Map<string, NotificationHandler> = new Map();

  constructor(redis: Redis, metricsCollector: MetricsCollector) {
    this.redis = redis;
    this.metricsCollector = metricsCollector;
  }

  async loadRules(): Promise<void> {
    this.rules.clear();
    let cursor = '0';

    do {
      const [newCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${this.rulePrefix}*`,
        'COUNT',
        100
      );
      cursor = newCursor;

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const rule = this.deserializeRule(data);
          if (rule.enabled) {
            this.rules.set(rule.id, rule);
          }
        }
      }
    } while (cursor !== '0');
  }

  async createRule(
    name: string,
    metric: string,
    condition: AlertCondition,
    severity: AlertSeverity,
    options: {
      description?: string;
      cooldownMinutes?: number;
      notifications?: AlertNotification[];
    } = {}
  ): Promise<AlertRule> {
    const rule: AlertRule = {
      id: uuidv4(),
      name,
      description: options.description,
      enabled: true,
      metric,
      condition,
      severity,
      cooldownMinutes: options.cooldownMinutes || 5,
      notifications: options.notifications || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.saveRule(rule);
    this.rules.set(rule.id, rule);

    return rule;
  }

  async updateRule(
    ruleId: string,
    updates: Partial<Pick<AlertRule, 'name' | 'description' | 'enabled' | 'condition' | 'severity' | 'cooldownMinutes' | 'notifications'>>
  ): Promise<AlertRule | null> {
    const data = await this.redis.get(`${this.rulePrefix}${ruleId}`);
    if (!data) return null;

    const rule = this.deserializeRule(data);
    Object.assign(rule, updates, { updatedAt: new Date() });

    await this.saveRule(rule);

    if (rule.enabled) {
      this.rules.set(rule.id, rule);
    } else {
      this.rules.delete(rule.id);
    }

    return rule;
  }

  async deleteRule(ruleId: string): Promise<boolean> {
    await this.redis.del(`${this.rulePrefix}${ruleId}`);
    this.rules.delete(ruleId);
    return true;
  }

  async getRule(ruleId: string): Promise<AlertRule | null> {
    const data = await this.redis.get(`${this.rulePrefix}${ruleId}`);
    if (!data) return null;
    return this.deserializeRule(data);
  }

  async listRules(): Promise<AlertRule[]> {
    const rules: AlertRule[] = [];
    let cursor = '0';

    do {
      const [newCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${this.rulePrefix}*`,
        'COUNT',
        100
      );
      cursor = newCursor;

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          rules.push(this.deserializeRule(data));
        }
      }
    } while (cursor !== '0');

    return rules;
  }

  async checkRules(): Promise<Alert[]> {
    const triggeredAlerts: Alert[] = [];

    for (const rule of this.rules.values()) {
      const cooldownKey = `cooldown:${rule.id}`;
      const lastAlert = this.alertCooldowns.get(cooldownKey);

      if (lastAlert && Date.now() - lastAlert < rule.cooldownMinutes * 60 * 1000) {
        continue;
      }

      const latestMetric = await this.metricsCollector.getLatestMetric(rule.metric);
      if (!latestMetric) continue;

      const triggered = this.evaluateCondition(rule.condition, latestMetric.value);

      if (triggered) {
        const alert = await this.createAlert(
          'threshold',
          rule.severity,
          rule.name,
          rule.name,
          `${rule.metric} ${this.formatCondition(rule.condition)} (current: ${latestMetric.value})`,
          {
            metric: rule.metric,
            threshold: rule.condition.threshold,
            currentValue: latestMetric.value,
          }
        );

        triggeredAlerts.push(alert);
        this.alertCooldowns.set(cooldownKey, Date.now());

        await this.sendNotifications(alert, rule.notifications);
      }
    }

    return triggeredAlerts;
  }

  async createAlert(
    type: AlertType,
    severity: AlertSeverity,
    source: string,
    title: string,
    message: string,
    options: {
      metric?: string;
      threshold?: number;
      currentValue?: number;
    } = {}
  ): Promise<Alert> {
    const alert: Alert = {
      id: uuidv4(),
      type,
      severity,
      source,
      title,
      message,
      metric: options.metric,
      threshold: options.threshold,
      currentValue: options.currentValue,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.saveAlert(alert);

    await this.redis.zadd(
      `${this.alertPrefix}active`,
      alert.createdAt.getTime(),
      alert.id
    );

    return alert;
  }

  async getAlert(alertId: string): Promise<Alert | null> {
    const data = await this.redis.get(`${this.alertPrefix}${alertId}`);
    if (!data) return null;
    return this.deserializeAlert(data);
  }

  async getActiveAlerts(
    options: {
      severity?: AlertSeverity;
      source?: string;
      limit?: number;
    } = {}
  ): Promise<Alert[]> {
    const alertIds = await this.redis.zrevrange(`${this.alertPrefix}active`, 0, -1);
    const alerts: Alert[] = [];

    for (const id of alertIds) {
      const alert = await this.getAlert(id);
      if (!alert) continue;

      if (options.severity && alert.severity !== options.severity) continue;
      if (options.source && alert.source !== options.source) continue;

      alerts.push(alert);

      if (options.limit && alerts.length >= options.limit) break;
    }

    return alerts;
  }

  async acknowledgeAlert(
    alertId: string,
    acknowledgedBy: string
  ): Promise<boolean> {
    const alert = await this.getAlert(alertId);
    if (!alert || alert.status !== 'active') return false;

    alert.status = 'acknowledged';
    alert.acknowledgedBy = acknowledgedBy;
    alert.acknowledgedAt = new Date();
    alert.updatedAt = new Date();

    await this.saveAlert(alert);

    return true;
  }

  async resolveAlert(alertId: string): Promise<boolean> {
    const alert = await this.getAlert(alertId);
    if (!alert) return false;

    alert.status = 'resolved';
    alert.resolvedAt = new Date();
    alert.updatedAt = new Date();

    await this.saveAlert(alert);

    await this.redis.zrem(`${this.alertPrefix}active`, alertId);

    return true;
  }

  async getAlertHistory(
    options: {
      startDate?: Date;
      endDate?: Date;
      status?: AlertStatus;
      severity?: AlertSeverity;
      limit?: number;
    } = {}
  ): Promise<Alert[]> {
    const alerts: Alert[] = [];
    let cursor = '0';

    do {
      const [newCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${this.alertPrefix}????????-????-????-????-????????????`,
        'COUNT',
        100
      );
      cursor = newCursor;

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const alert = this.deserializeAlert(data);

          if (options.startDate && alert.createdAt < options.startDate) continue;
          if (options.endDate && alert.createdAt > options.endDate) continue;
          if (options.status && alert.status !== options.status) continue;
          if (options.severity && alert.severity !== options.severity) continue;

          alerts.push(alert);
        }
      }
    } while (cursor !== '0');

    alerts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return options.limit ? alerts.slice(0, options.limit) : alerts;
  }

  registerNotificationHandler(
    type: string,
    handler: NotificationHandler
  ): void {
    this.notificationHandlers.set(type, handler);
  }

  private async sendNotifications(
    alert: Alert,
    notifications: AlertNotification[]
  ): Promise<void> {
    for (const notification of notifications) {
      if (!notification.enabled) continue;

      const handler = this.notificationHandlers.get(notification.type);
      if (handler) {
        try {
          await handler(alert, notification.target);
        } catch (error) {
          console.error(
            `Failed to send ${notification.type} notification:`,
            error
          );
        }
      }
    }
  }

  startPeriodicChecks(intervalMs: number = 60000): void {
    if (this.checkInterval) {
      this.stopPeriodicChecks();
    }

    this.checkInterval = setInterval(async () => {
      try {
        await this.checkRules();
      } catch (error) {
        console.error('Error checking alert rules:', error);
      }
    }, intervalMs);

    this.checkRules().catch(console.error);
  }

  stopPeriodicChecks(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }
  }

  private evaluateCondition(condition: AlertCondition, value: number): boolean {
    switch (condition.operator) {
      case 'gt':
        return value > condition.threshold;
      case 'gte':
        return value >= condition.threshold;
      case 'lt':
        return value < condition.threshold;
      case 'lte':
        return value <= condition.threshold;
      case 'eq':
        return value === condition.threshold;
      case 'ne':
        return value !== condition.threshold;
      default:
        return false;
    }
  }

  private formatCondition(condition: AlertCondition): string {
    const operators: Record<string, string> = {
      gt: '>',
      gte: '>=',
      lt: '<',
      lte: '<=',
      eq: '==',
      ne: '!=',
    };
    return `${operators[condition.operator]} ${condition.threshold}`;
  }

  private async saveRule(rule: AlertRule): Promise<void> {
    await this.redis.set(`${this.rulePrefix}${rule.id}`, JSON.stringify(rule));
  }

  private async saveAlert(alert: Alert): Promise<void> {
    await this.redis.set(`${this.alertPrefix}${alert.id}`, JSON.stringify(alert));
  }

  private deserializeRule(data: string): AlertRule {
    const rule = JSON.parse(data);
    rule.createdAt = new Date(rule.createdAt);
    rule.updatedAt = new Date(rule.updatedAt);
    return rule;
  }

  private deserializeAlert(data: string): Alert {
    const alert = JSON.parse(data);
    alert.createdAt = new Date(alert.createdAt);
    alert.updatedAt = new Date(alert.updatedAt);
    if (alert.acknowledgedAt) alert.acknowledgedAt = new Date(alert.acknowledgedAt);
    if (alert.resolvedAt) alert.resolvedAt = new Date(alert.resolvedAt);
    return alert;
  }
}

type NotificationHandler = (alert: Alert, target: string) => Promise<void>;
