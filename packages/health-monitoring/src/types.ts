export interface HealthCheck {
  name: string;
  status: HealthStatus;
  message?: string;
  latency?: number;
  lastCheck: Date;
  metadata?: Record<string, unknown>;
}

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export interface SystemHealth {
  status: HealthStatus;
  uptime: number;
  timestamp: Date;
  checks: HealthCheck[];
  metrics: SystemMetrics;
}

export interface SystemMetrics {
  cpu: CPUMetrics;
  memory: MemoryMetrics;
  disk: DiskMetrics;
  network: NetworkMetrics;
  process: ProcessMetrics;
}

export interface CPUMetrics {
  usage: number;
  loadAverage: number[];
  cores: number;
}

export interface MemoryMetrics {
  total: number;
  used: number;
  free: number;
  usagePercent: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
}

export interface DiskMetrics {
  total: number;
  used: number;
  free: number;
  usagePercent: number;
}

export interface NetworkMetrics {
  bytesIn: number;
  bytesOut: number;
  connectionsActive: number;
  requestsPerSecond: number;
  averageLatency: number;
}

export interface ProcessMetrics {
  pid: number;
  uptime: number;
  memoryUsage: number;
  cpuUsage: number;
  handles: number;
}

export interface ServiceStatus {
  name: string;
  status: HealthStatus;
  version?: string;
  instances: ServiceInstance[];
  lastUpdate: Date;
}

export interface ServiceInstance {
  id: string;
  host: string;
  port: number;
  status: HealthStatus;
  metrics?: Record<string, number>;
  lastHeartbeat: Date;
}

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  source: string;
  title: string;
  message: string;
  metric?: string;
  threshold?: number;
  currentValue?: number;
  status: AlertStatus;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type AlertType =
  | 'threshold'
  | 'anomaly'
  | 'availability'
  | 'error_rate'
  | 'latency'
  | 'custom';

export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';
export type AlertStatus = 'active' | 'acknowledged' | 'resolved';

export interface AlertRule {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  metric: string;
  condition: AlertCondition;
  severity: AlertSeverity;
  cooldownMinutes: number;
  notifications: AlertNotification[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AlertCondition {
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'ne';
  threshold: number;
  duration?: number;
  aggregation?: 'avg' | 'min' | 'max' | 'sum' | 'count';
}

export interface AlertNotification {
  type: 'email' | 'slack' | 'webhook' | 'pagerduty';
  target: string;
  enabled: boolean;
}

export interface MetricPoint {
  timestamp: Date;
  value: number;
  tags?: Record<string, string>;
}

export interface MetricSeries {
  name: string;
  points: MetricPoint[];
  aggregation?: {
    avg: number;
    min: number;
    max: number;
    sum: number;
    count: number;
  };
}

export interface DashboardWidget {
  id: string;
  type: WidgetType;
  title: string;
  metric: string;
  config: WidgetConfig;
  position: { x: number; y: number; w: number; h: number };
}

export type WidgetType = 'line_chart' | 'gauge' | 'counter' | 'table' | 'status' | 'heatmap';

export interface WidgetConfig {
  timeRange?: string;
  refreshInterval?: number;
  thresholds?: { value: number; color: string }[];
  aggregation?: string;
  groupBy?: string;
}

export interface HealthCheckConfig {
  name: string;
  type: 'http' | 'tcp' | 'redis' | 'postgres' | 'custom';
  target: string;
  interval: number;
  timeout: number;
  retries: number;
  headers?: Record<string, string>;
  expectedStatus?: number;
  expectedBody?: string;
}

export interface MonitoringConfig {
  enabled: boolean;
  metricsRetention: number;
  alertsRetention: number;
  checkInterval: number;
  services: string[];
  healthChecks: HealthCheckConfig[];
}
