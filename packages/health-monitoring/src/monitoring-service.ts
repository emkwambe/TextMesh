import { Redis } from 'ioredis';
import { MetricsCollector } from './metrics-collector';
import { HealthChecker } from './health-checker';
import { AlertingService } from './alerting';
import {
  SystemHealth,
  ServiceStatus,
  Alert,
  AlertRule,
  AlertSeverity,
  AlertCondition,
  MonitoringConfig,
  HealthCheckConfig,
  MetricSeries,
} from './types';

const DEFAULT_CONFIG: MonitoringConfig = {
  enabled: true,
  metricsRetention: 86400 * 7,
  alertsRetention: 86400 * 30,
  checkInterval: 30000,
  services: [],
  healthChecks: [],
};

export class MonitoringService {
  private redis: Redis;
  private metricsCollector: MetricsCollector;
  private healthChecker: HealthChecker;
  private alertingService: AlertingService;
  private config: MonitoringConfig;
  private isRunning: boolean = false;

  constructor(redis: Redis, config?: Partial<MonitoringConfig>) {
    this.redis = redis;
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.metricsCollector = new MetricsCollector(
      redis,
      this.config.metricsRetention
    );
    this.healthChecker = new HealthChecker(redis, this.metricsCollector);
    this.alertingService = new AlertingService(redis, this.metricsCollector);

    for (const checkConfig of this.config.healthChecks) {
      this.healthChecker.registerHealthCheck(checkConfig);
    }
  }

  async initialize(): Promise<void> {
    await this.alertingService.loadRules();

    if (this.config.enabled) {
      this.start();
    }
  }

  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.healthChecker.startPeriodicChecks(this.config.checkInterval);
    this.alertingService.startPeriodicChecks(this.config.checkInterval);
  }

  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    this.healthChecker.stopPeriodicChecks();
    this.alertingService.stopPeriodicChecks();
  }

  async getSystemHealth(): Promise<SystemHealth> {
    return this.healthChecker.getSystemHealth();
  }

  async getServiceStatus(serviceName: string): Promise<ServiceStatus | null> {
    return this.healthChecker.getServiceStatus(serviceName);
  }

  async getAllServicesStatus(): Promise<ServiceStatus[]> {
    return this.healthChecker.getAllServicesStatus();
  }

  addHealthCheck(config: HealthCheckConfig): void {
    this.healthChecker.registerHealthCheck(config);
  }

  removeHealthCheck(name: string): void {
    this.healthChecker.unregisterHealthCheck(name);
  }

  async recordMetric(
    name: string,
    value: number,
    tags?: Record<string, string>
  ): Promise<void> {
    await this.metricsCollector.recordMetric(name, value, tags);
  }

  async getMetrics(
    name: string,
    startTime: Date,
    endTime: Date,
    options?: {
      aggregation?: 'avg' | 'min' | 'max' | 'sum' | 'count';
      interval?: number;
    }
  ): Promise<MetricSeries> {
    return this.metricsCollector.getMetricSeries(name, startTime, endTime, options);
  }

  async getAvailableMetrics(): Promise<string[]> {
    return this.metricsCollector.getAvailableMetrics();
  }

  async createAlertRule(
    name: string,
    metric: string,
    condition: AlertCondition,
    severity: AlertSeverity,
    options?: {
      description?: string;
      cooldownMinutes?: number;
    }
  ): Promise<AlertRule> {
    return this.alertingService.createRule(name, metric, condition, severity, options);
  }

  async updateAlertRule(
    ruleId: string,
    updates: Partial<Pick<AlertRule, 'name' | 'description' | 'enabled' | 'condition' | 'severity' | 'cooldownMinutes'>>
  ): Promise<AlertRule | null> {
    return this.alertingService.updateRule(ruleId, updates);
  }

  async deleteAlertRule(ruleId: string): Promise<boolean> {
    return this.alertingService.deleteRule(ruleId);
  }

  async getAlertRules(): Promise<AlertRule[]> {
    return this.alertingService.listRules();
  }

  async getActiveAlerts(options?: {
    severity?: AlertSeverity;
    source?: string;
    limit?: number;
  }): Promise<Alert[]> {
    return this.alertingService.getActiveAlerts(options);
  }

  async acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<boolean> {
    return this.alertingService.acknowledgeAlert(alertId, acknowledgedBy);
  }

  async resolveAlert(alertId: string): Promise<boolean> {
    return this.alertingService.resolveAlert(alertId);
  }

  async getAlertHistory(options?: {
    startDate?: Date;
    endDate?: Date;
    severity?: AlertSeverity;
    limit?: number;
  }): Promise<Alert[]> {
    return this.alertingService.getAlertHistory(options);
  }

  async registerService(
    serviceName: string,
    instance: {
      id: string;
      host: string;
      port: number;
      status?: 'healthy' | 'degraded' | 'unhealthy';
      metrics?: Record<string, number>;
    }
  ): Promise<void> {
    await this.healthChecker.registerService(serviceName, {
      ...instance,
      status: instance.status || 'healthy',
    });
  }

  async heartbeat(serviceName: string, instanceId: string): Promise<void> {
    await this.healthChecker.heartbeat(serviceName, instanceId);
  }

  async incrementCounter(name: string, value: number = 1): Promise<number> {
    return this.metricsCollector.incrementCounter(name, value);
  }

  async setGauge(name: string, value: number): Promise<void> {
    return this.metricsCollector.setGauge(name, value);
  }

  async recordLatency(name: string, durationMs: number): Promise<void> {
    return this.metricsCollector.recordLatency(name, durationMs);
  }

  async getDashboardData(): Promise<{
    health: SystemHealth;
    services: ServiceStatus[];
    activeAlerts: Alert[];
    recentMetrics: Record<string, number | null>;
  }> {
    const [health, services, activeAlerts] = await Promise.all([
      this.getSystemHealth(),
      this.getAllServicesStatus(),
      this.getActiveAlerts({ limit: 10 }),
    ]);

    const metricNames = [
      'cpu.usage',
      'memory.usage_percent',
      'disk.usage_percent',
      'network.rps',
      'network.latency',
    ];

    const recentMetrics: Record<string, number | null> = {};
    for (const name of metricNames) {
      const latest = await this.metricsCollector.getLatestMetric(name);
      recentMetrics[name] = latest?.value ?? null;
    }

    return {
      health,
      services,
      activeAlerts,
      recentMetrics,
    };
  }

  getMetricsCollector(): MetricsCollector {
    return this.metricsCollector;
  }

  getHealthChecker(): HealthChecker {
    return this.healthChecker;
  }

  getAlertingService(): AlertingService {
    return this.alertingService;
  }

  isMonitoringRunning(): boolean {
    return this.isRunning;
  }
}
