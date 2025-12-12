import { Redis } from 'ioredis';
import * as os from 'os';
import {
  SystemMetrics,
  CPUMetrics,
  MemoryMetrics,
  DiskMetrics,
  NetworkMetrics,
  ProcessMetrics,
  MetricPoint,
  MetricSeries,
} from './types';

export class MetricsCollector {
  private redis: Redis;
  private readonly metricsPrefix = 'monitoring:metrics:';
  private readonly retentionSeconds: number;
  private lastCpuUsage: { user: number; system: number } = { user: 0, system: 0 };
  private lastCpuTime: number = Date.now();

  constructor(redis: Redis, retentionSeconds: number = 86400 * 7) {
    this.redis = redis;
    this.retentionSeconds = retentionSeconds;
  }

  async collectSystemMetrics(): Promise<SystemMetrics> {
    const [cpu, memory, disk, network, process] = await Promise.all([
      this.collectCPUMetrics(),
      this.collectMemoryMetrics(),
      this.collectDiskMetrics(),
      this.collectNetworkMetrics(),
      this.collectProcessMetrics(),
    ]);

    const metrics: SystemMetrics = {
      cpu,
      memory,
      disk,
      network,
      process,
    };

    await this.recordMetrics(metrics);

    return metrics;
  }

  private async collectCPUMetrics(): Promise<CPUMetrics> {
    const cpus = os.cpus();
    const loadAverage = os.loadavg();

    const currentUsage = process.cpuUsage();
    const currentTime = Date.now();

    const userDiff = currentUsage.user - this.lastCpuUsage.user;
    const systemDiff = currentUsage.system - this.lastCpuUsage.system;
    const timeDiff = (currentTime - this.lastCpuTime) * 1000;

    const usage = timeDiff > 0
      ? Math.min(100, ((userDiff + systemDiff) / timeDiff) * 100)
      : 0;

    this.lastCpuUsage = { user: currentUsage.user, system: currentUsage.system };
    this.lastCpuTime = currentTime;

    return {
      usage,
      loadAverage,
      cores: cpus.length,
    };
  }

  private async collectMemoryMetrics(): Promise<MemoryMetrics> {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    const memUsage = process.memoryUsage();

    return {
      total,
      used,
      free,
      usagePercent: (used / total) * 100,
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
    };
  }

  private async collectDiskMetrics(): Promise<DiskMetrics> {
    return {
      total: 0,
      used: 0,
      free: 0,
      usagePercent: 0,
    };
  }

  private async collectNetworkMetrics(): Promise<NetworkMetrics> {
    const activeConnections = await this.redis.get(
      `${this.metricsPrefix}network:connections`
    );
    const requestsPerSecond = await this.redis.get(
      `${this.metricsPrefix}network:rps`
    );
    const avgLatency = await this.redis.get(
      `${this.metricsPrefix}network:latency`
    );

    return {
      bytesIn: 0,
      bytesOut: 0,
      connectionsActive: parseInt(activeConnections || '0'),
      requestsPerSecond: parseFloat(requestsPerSecond || '0'),
      averageLatency: parseFloat(avgLatency || '0'),
    };
  }

  private async collectProcessMetrics(): Promise<ProcessMetrics> {
    const memUsage = process.memoryUsage();

    return {
      pid: process.pid,
      uptime: process.uptime(),
      memoryUsage: memUsage.rss,
      cpuUsage: 0,
      handles: 0,
    };
  }

  async recordMetric(
    name: string,
    value: number,
    tags?: Record<string, string>
  ): Promise<void> {
    const timestamp = Date.now();
    const point: MetricPoint = {
      timestamp: new Date(timestamp),
      value,
      tags,
    };

    const key = `${this.metricsPrefix}${name}`;
    await this.redis.zadd(key, timestamp, JSON.stringify(point));

    await this.redis.zremrangebyscore(
      key,
      '-inf',
      timestamp - this.retentionSeconds * 1000
    );
  }

  async recordMetrics(metrics: SystemMetrics): Promise<void> {
    const timestamp = Date.now();

    await Promise.all([
      this.recordMetric('cpu.usage', metrics.cpu.usage),
      this.recordMetric('cpu.load_1m', metrics.cpu.loadAverage[0]),
      this.recordMetric('cpu.load_5m', metrics.cpu.loadAverage[1]),
      this.recordMetric('cpu.load_15m', metrics.cpu.loadAverage[2]),
      this.recordMetric('memory.used', metrics.memory.used),
      this.recordMetric('memory.free', metrics.memory.free),
      this.recordMetric('memory.usage_percent', metrics.memory.usagePercent),
      this.recordMetric('memory.heap_used', metrics.memory.heapUsed),
      this.recordMetric('disk.usage_percent', metrics.disk.usagePercent),
      this.recordMetric('network.connections', metrics.network.connectionsActive),
      this.recordMetric('network.rps', metrics.network.requestsPerSecond),
      this.recordMetric('network.latency', metrics.network.averageLatency),
      this.recordMetric('process.uptime', metrics.process.uptime),
      this.recordMetric('process.memory', metrics.process.memoryUsage),
    ]);
  }

  async getMetricSeries(
    name: string,
    startTime: Date,
    endTime: Date,
    options: {
      aggregation?: 'avg' | 'min' | 'max' | 'sum' | 'count';
      interval?: number;
    } = {}
  ): Promise<MetricSeries> {
    const key = `${this.metricsPrefix}${name}`;
    const points = await this.redis.zrangebyscore(
      key,
      startTime.getTime(),
      endTime.getTime()
    );

    const metricPoints: MetricPoint[] = points.map((p) => {
      const point = JSON.parse(p);
      point.timestamp = new Date(point.timestamp);
      return point;
    });

    let aggregation;
    if (metricPoints.length > 0) {
      const values = metricPoints.map((p) => p.value);
      aggregation = {
        avg: values.reduce((a, b) => a + b, 0) / values.length,
        min: Math.min(...values),
        max: Math.max(...values),
        sum: values.reduce((a, b) => a + b, 0),
        count: values.length,
      };
    }

    return {
      name,
      points: metricPoints,
      aggregation,
    };
  }

  async getLatestMetric(name: string): Promise<MetricPoint | null> {
    const key = `${this.metricsPrefix}${name}`;
    const points = await this.redis.zrevrange(key, 0, 0);

    if (points.length === 0) return null;

    const point = JSON.parse(points[0]);
    point.timestamp = new Date(point.timestamp);
    return point;
  }

  async incrementCounter(name: string, value: number = 1): Promise<number> {
    const key = `${this.metricsPrefix}counter:${name}`;
    const newValue = await this.redis.incrbyfloat(key, value);
    await this.recordMetric(`counter.${name}`, newValue);
    return newValue;
  }

  async setGauge(name: string, value: number): Promise<void> {
    const key = `${this.metricsPrefix}gauge:${name}`;
    await this.redis.set(key, value.toString());
    await this.recordMetric(`gauge.${name}`, value);
  }

  async getGauge(name: string): Promise<number | null> {
    const key = `${this.metricsPrefix}gauge:${name}`;
    const value = await this.redis.get(key);
    return value !== null ? parseFloat(value) : null;
  }

  async recordHistogram(
    name: string,
    value: number,
    buckets: number[] = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
  ): Promise<void> {
    await this.recordMetric(`histogram.${name}`, value);

    for (const bucket of buckets) {
      if (value <= bucket) {
        await this.redis.incr(`${this.metricsPrefix}histogram:${name}:le_${bucket}`);
      }
    }
    await this.redis.incr(`${this.metricsPrefix}histogram:${name}:count`);
    await this.redis.incrbyfloat(`${this.metricsPrefix}histogram:${name}:sum`, value);
  }

  async recordLatency(name: string, durationMs: number): Promise<void> {
    await this.recordHistogram(`latency.${name}`, durationMs);
  }

  async getAvailableMetrics(): Promise<string[]> {
    const metrics: string[] = [];
    let cursor = '0';

    do {
      const [newCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${this.metricsPrefix}*`,
        'COUNT',
        100
      );
      cursor = newCursor;

      for (const key of keys) {
        const metricName = key.replace(this.metricsPrefix, '');
        if (!metricName.includes(':') || metricName.startsWith('counter.') ||
            metricName.startsWith('gauge.') || metricName.startsWith('histogram.')) {
          metrics.push(metricName);
        }
      }
    } while (cursor !== '0');

    return [...new Set(metrics)].sort();
  }
}
