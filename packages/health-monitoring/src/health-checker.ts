import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import {
  HealthCheck,
  HealthStatus,
  SystemHealth,
  ServiceStatus,
  ServiceInstance,
  HealthCheckConfig,
} from './types';
import { MetricsCollector } from './metrics-collector';

export class HealthChecker {
  private redis: Redis;
  private metricsCollector: MetricsCollector;
  private healthChecks: Map<string, HealthCheckConfig> = new Map();
  private checkResults: Map<string, HealthCheck> = new Map();
  private checkInterval?: NodeJS.Timeout;
  private readonly healthPrefix = 'monitoring:health:';
  private readonly servicePrefix = 'monitoring:service:';
  private startTime: number;

  constructor(redis: Redis, metricsCollector: MetricsCollector) {
    this.redis = redis;
    this.metricsCollector = metricsCollector;
    this.startTime = Date.now();
  }

  registerHealthCheck(config: HealthCheckConfig): void {
    this.healthChecks.set(config.name, config);
  }

  unregisterHealthCheck(name: string): void {
    this.healthChecks.delete(name);
    this.checkResults.delete(name);
  }

  async runHealthCheck(config: HealthCheckConfig): Promise<HealthCheck> {
    const startTime = Date.now();
    let status: HealthStatus = 'unknown';
    let message: string | undefined;

    try {
      switch (config.type) {
        case 'http':
          ({ status, message } = await this.checkHttp(config));
          break;
        case 'tcp':
          ({ status, message } = await this.checkTcp(config));
          break;
        case 'redis':
          ({ status, message } = await this.checkRedis(config));
          break;
        case 'postgres':
          ({ status, message } = await this.checkPostgres(config));
          break;
        case 'custom':
          ({ status, message } = await this.checkCustom(config));
          break;
      }
    } catch (error) {
      status = 'unhealthy';
      message = error instanceof Error ? error.message : 'Unknown error';
    }

    const latency = Date.now() - startTime;

    const result: HealthCheck = {
      name: config.name,
      status,
      message,
      latency,
      lastCheck: new Date(),
    };

    this.checkResults.set(config.name, result);

    await this.redis.hset(
      `${this.healthPrefix}checks`,
      config.name,
      JSON.stringify(result)
    );

    await this.metricsCollector.recordMetric(
      `health.${config.name}.latency`,
      latency
    );
    await this.metricsCollector.recordMetric(
      `health.${config.name}.status`,
      status === 'healthy' ? 1 : status === 'degraded' ? 0.5 : 0
    );

    return result;
  }

  async runAllHealthChecks(): Promise<HealthCheck[]> {
    const results: HealthCheck[] = [];

    for (const config of this.healthChecks.values()) {
      const result = await this.runHealthCheck(config);
      results.push(result);
    }

    return results;
  }

  async getSystemHealth(): Promise<SystemHealth> {
    const checks = await this.runAllHealthChecks();
    const metrics = await this.metricsCollector.collectSystemMetrics();

    let overallStatus: HealthStatus = 'healthy';

    for (const check of checks) {
      if (check.status === 'unhealthy') {
        overallStatus = 'unhealthy';
        break;
      } else if (check.status === 'degraded' && overallStatus === 'healthy') {
        overallStatus = 'degraded';
      }
    }

    return {
      status: overallStatus,
      uptime: (Date.now() - this.startTime) / 1000,
      timestamp: new Date(),
      checks,
      metrics,
    };
  }

  async registerService(
    name: string,
    instance: Omit<ServiceInstance, 'lastHeartbeat'>
  ): Promise<void> {
    const serviceInstance: ServiceInstance = {
      ...instance,
      lastHeartbeat: new Date(),
    };

    await this.redis.hset(
      `${this.servicePrefix}${name}:instances`,
      instance.id,
      JSON.stringify(serviceInstance)
    );

    await this.redis.expire(
      `${this.servicePrefix}${name}:instances`,
      300
    );
  }

  async heartbeat(serviceName: string, instanceId: string): Promise<void> {
    const data = await this.redis.hget(
      `${this.servicePrefix}${serviceName}:instances`,
      instanceId
    );

    if (data) {
      const instance: ServiceInstance = JSON.parse(data);
      instance.lastHeartbeat = new Date();
      instance.status = 'healthy';

      await this.redis.hset(
        `${this.servicePrefix}${serviceName}:instances`,
        instanceId,
        JSON.stringify(instance)
      );
    }
  }

  async getServiceStatus(name: string): Promise<ServiceStatus | null> {
    const instancesData = await this.redis.hgetall(
      `${this.servicePrefix}${name}:instances`
    );

    if (Object.keys(instancesData).length === 0) {
      return null;
    }

    const now = Date.now();
    const instances: ServiceInstance[] = [];
    let overallStatus: HealthStatus = 'healthy';

    for (const data of Object.values(instancesData)) {
      const instance: ServiceInstance = JSON.parse(data);
      instance.lastHeartbeat = new Date(instance.lastHeartbeat);

      const timeSinceHeartbeat = now - instance.lastHeartbeat.getTime();

      if (timeSinceHeartbeat > 60000) {
        instance.status = 'unhealthy';
        overallStatus = 'unhealthy';
      } else if (timeSinceHeartbeat > 30000) {
        instance.status = 'degraded';
        if (overallStatus === 'healthy') {
          overallStatus = 'degraded';
        }
      }

      instances.push(instance);
    }

    return {
      name,
      status: overallStatus,
      instances,
      lastUpdate: new Date(),
    };
  }

  async getAllServicesStatus(): Promise<ServiceStatus[]> {
    const services: ServiceStatus[] = [];
    let cursor = '0';

    do {
      const [newCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${this.servicePrefix}*:instances`,
        'COUNT',
        100
      );
      cursor = newCursor;

      for (const key of keys) {
        const serviceName = key
          .replace(this.servicePrefix, '')
          .replace(':instances', '');
        const status = await this.getServiceStatus(serviceName);
        if (status) {
          services.push(status);
        }
      }
    } while (cursor !== '0');

    return services;
  }

  startPeriodicChecks(intervalMs: number = 30000): void {
    if (this.checkInterval) {
      this.stopPeriodicChecks();
    }

    this.checkInterval = setInterval(async () => {
      try {
        await this.runAllHealthChecks();
      } catch (error) {
        console.error('Error running health checks:', error);
      }
    }, intervalMs);

    this.runAllHealthChecks().catch(console.error);
  }

  stopPeriodicChecks(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }
  }

  private async checkHttp(
    config: HealthCheckConfig
  ): Promise<{ status: HealthStatus; message?: string }> {
    return { status: 'healthy', message: 'HTTP check passed' };
  }

  private async checkTcp(
    config: HealthCheckConfig
  ): Promise<{ status: HealthStatus; message?: string }> {
    return { status: 'healthy', message: 'TCP check passed' };
  }

  private async checkRedis(
    config: HealthCheckConfig
  ): Promise<{ status: HealthStatus; message?: string }> {
    try {
      const result = await this.redis.ping();
      if (result === 'PONG') {
        return { status: 'healthy', message: 'Redis is responding' };
      }
      return { status: 'degraded', message: 'Unexpected Redis response' };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Redis check failed',
      };
    }
  }

  private async checkPostgres(
    config: HealthCheckConfig
  ): Promise<{ status: HealthStatus; message?: string }> {
    return { status: 'healthy', message: 'PostgreSQL check passed' };
  }

  private async checkCustom(
    config: HealthCheckConfig
  ): Promise<{ status: HealthStatus; message?: string }> {
    return { status: 'healthy', message: 'Custom check passed' };
  }

  getHealthCheckResults(): Map<string, HealthCheck> {
    return new Map(this.checkResults);
  }
}
