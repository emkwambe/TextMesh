import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import {
  RegulatorMetrics,
  ComplianceAlert,
  AlertType,
} from './types';

export class RegulatorDashboard {
  private redis: Redis;
  private readonly metricsPrefix = 'compliance:metrics:';
  private readonly alertPrefix = 'compliance:alert:';

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async generateMetrics(period: string): Promise<RegulatorMetrics> {
    // In production, these would aggregate from actual data sources
    const metrics: RegulatorMetrics = {
      period,
      generatedAt: new Date(),
      userMetrics: await this.getUserMetrics(period),
      contentMetrics: await this.getContentMetrics(period),
      dataRequestMetrics: await this.getDataRequestMetrics(period),
      safetyMetrics: await this.getSafetyMetrics(period),
      algorithmMetrics: await this.getAlgorithmMetrics(period),
    };

    // Cache metrics
    await this.redis.set(
      `${this.metricsPrefix}${period}`,
      JSON.stringify(metrics),
      'EX',
      86400 * 30 // 30 days
    );

    return metrics;
  }

  async getMetrics(period: string): Promise<RegulatorMetrics | null> {
    const data = await this.redis.get(`${this.metricsPrefix}${period}`);
    if (!data) return null;

    const metrics = JSON.parse(data);
    metrics.generatedAt = new Date(metrics.generatedAt);
    return metrics;
  }

  async getMetricsHistory(months: number = 12): Promise<RegulatorMetrics[]> {
    const metrics: RegulatorMetrics[] = [];
    const now = new Date();

    for (let i = 0; i < months; i++) {
      const date = new Date(now);
      date.setMonth(date.getMonth() - i);
      const period = date.toISOString().slice(0, 7);

      let metric = await this.getMetrics(period);
      if (!metric) {
        metric = await this.generateMetrics(period);
      }
      metrics.push(metric);
    }

    return metrics;
  }

  async createAlert(
    type: AlertType,
    severity: ComplianceAlert['severity'],
    message: string,
    details: Record<string, unknown>
  ): Promise<ComplianceAlert> {
    const alert: ComplianceAlert = {
      id: uuidv4(),
      type,
      severity,
      message,
      details,
      createdAt: new Date(),
      acknowledged: false,
    };

    await this.redis.set(
      `${this.alertPrefix}${alert.id}`,
      JSON.stringify(alert)
    );

    // Add to active alerts list
    await this.redis.zadd(
      'compliance:active_alerts',
      alert.createdAt.getTime(),
      alert.id
    );

    // Set expiry for auto-cleanup (90 days)
    await this.redis.expire(`${this.alertPrefix}${alert.id}`, 86400 * 90);

    return alert;
  }

  async acknowledgeAlert(
    alertId: string,
    acknowledgedBy: string
  ): Promise<ComplianceAlert | null> {
    const data = await this.redis.get(`${this.alertPrefix}${alertId}`);
    if (!data) return null;

    const alert: ComplianceAlert = JSON.parse(data);
    alert.acknowledged = true;
    alert.acknowledgedBy = acknowledgedBy;
    alert.acknowledgedAt = new Date();

    await this.redis.set(`${this.alertPrefix}${alertId}`, JSON.stringify(alert));

    // Remove from active alerts
    await this.redis.zrem('compliance:active_alerts', alertId);

    return alert;
  }

  async getActiveAlerts(): Promise<ComplianceAlert[]> {
    const alertIds = await this.redis.zrevrange('compliance:active_alerts', 0, -1);
    const alerts: ComplianceAlert[] = [];

    for (const id of alertIds) {
      const data = await this.redis.get(`${this.alertPrefix}${id}`);
      if (data) {
        const alert = JSON.parse(data);
        alert.createdAt = new Date(alert.createdAt);
        if (alert.acknowledgedAt) alert.acknowledgedAt = new Date(alert.acknowledgedAt);
        alerts.push(alert);
      }
    }

    return alerts;
  }

  async getAlertsByType(type: AlertType): Promise<ComplianceAlert[]> {
    const allAlerts = await this.getActiveAlerts();
    return allAlerts.filter(a => a.type === type);
  }

  async checkSLACompliance(): Promise<{
    compliant: boolean;
    metrics: {
      dsrCompletionRate: number;
      averageResponseTime: number;
      overdueRequests: number;
    };
    issues: string[];
  }> {
    const issues: string[] = [];

    // Get DSR metrics
    const dsrStats = await this.getDataRequestMetrics(
      new Date().toISOString().slice(0, 7)
    );

    // Check completion rate (should be > 95%)
    if (dsrStats.completionRate < 95) {
      issues.push(`DSR completion rate (${dsrStats.completionRate}%) below 95% target`);
    }

    // Check average response time (should be < 25 days for GDPR)
    if (dsrStats.averageCompletionTime > 25 * 24 * 60 * 60 * 1000) {
      issues.push('Average DSR response time exceeds 25 days');
    }

    // Check for overdue requests
    const overdueKey = 'compliance:overdue_requests';
    const overdueCount = await this.redis.scard(overdueKey);

    if (overdueCount > 0) {
      issues.push(`${overdueCount} overdue data subject requests`);
    }

    return {
      compliant: issues.length === 0,
      metrics: {
        dsrCompletionRate: dsrStats.completionRate,
        averageResponseTime: dsrStats.averageCompletionTime,
        overdueRequests: overdueCount,
      },
      issues,
    };
  }

  async generateComplianceReport(
    startDate: Date,
    endDate: Date
  ): Promise<{
    period: { start: Date; end: Date };
    summary: string;
    metrics: RegulatorMetrics;
    alerts: ComplianceAlert[];
    slaCompliance: {
      compliant: boolean;
      metrics: {
        dsrCompletionRate: number;
        averageResponseTime: number;
        overdueRequests: number;
      };
      issues: string[];
    };
    recommendations: string[];
  }> {
    const period = startDate.toISOString().slice(0, 7);
    const metrics = await this.generateMetrics(period);
    const alerts = await this.getActiveAlerts();
    const slaCompliance = await this.checkSLACompliance();

    const recommendations: string[] = [];

    // Generate recommendations based on metrics
    if (metrics.contentMetrics.removalReasons['hate_speech'] > 100) {
      recommendations.push('Consider enhancing hate speech detection algorithms');
    }

    if (metrics.safetyMetrics.falsePositiveRate > 10) {
      recommendations.push('Review moderation accuracy - false positive rate is high');
    }

    if (metrics.dataRequestMetrics.completionRate < 95) {
      recommendations.push('Improve DSR processing capacity to meet SLA targets');
    }

    if (metrics.algorithmMetrics.overturnedDecisions / metrics.algorithmMetrics.appealedDecisions > 0.3) {
      recommendations.push('Review algorithmic decision criteria - high appeal success rate');
    }

    const summary = this.generateSummary(metrics, slaCompliance);

    return {
      period: { start: startDate, end: endDate },
      summary,
      metrics,
      alerts,
      slaCompliance,
      recommendations,
    };
  }

  async getPublicTransparencyData(): Promise<{
    reportingPeriod: string;
    contentActions: {
      totalRemoved: number;
      byCategory: Record<string, number>;
      appealRate: number;
      restoredAfterAppeal: number;
    };
    governmentRequests: {
      total: number;
      complied: number;
      rejected: number;
    };
    automatedEnforcement: {
      percentageAutomated: number;
      accuracyRate: number;
    };
  }> {
    const period = new Date().toISOString().slice(0, 7);
    const metrics = await this.getMetrics(period);

    if (!metrics) {
      throw new Error('Metrics not available');
    }

    return {
      reportingPeriod: period,
      contentActions: {
        totalRemoved: metrics.contentMetrics.contentRemoved,
        byCategory: metrics.contentMetrics.removalReasons,
        appealRate: metrics.safetyMetrics.appealRate,
        restoredAfterAppeal: Math.round(
          metrics.safetyMetrics.appealSuccessRate * metrics.algorithmMetrics.appealedDecisions / 100
        ),
      },
      governmentRequests: {
        total: 0, // Would come from government request tracking
        complied: 0,
        rejected: 0,
      },
      automatedEnforcement: {
        percentageAutomated: 85, // Example value
        accuracyRate: 100 - metrics.safetyMetrics.falsePositiveRate,
      },
    };
  }

  private async getUserMetrics(period: string): Promise<RegulatorMetrics['userMetrics']> {
    const key = `compliance:user_metrics:${period}`;
    const data = await this.redis.hgetall(key);

    return {
      totalUsers: parseInt(data.totalUsers || '0'),
      activeUsers: parseInt(data.activeUsers || '0'),
      newUsers: parseInt(data.newUsers || '0'),
      deletedAccounts: parseInt(data.deletedAccounts || '0'),
      suspendedAccounts: parseInt(data.suspendedAccounts || '0'),
    };
  }

  private async getContentMetrics(period: string): Promise<RegulatorMetrics['contentMetrics']> {
    const key = `compliance:content_metrics:${period}`;
    const data = await this.redis.hgetall(key);

    return {
      totalContent: parseInt(data.totalContent || '0'),
      contentRemoved: parseInt(data.contentRemoved || '0'),
      contentFlagged: parseInt(data.contentFlagged || '0'),
      removalReasons: JSON.parse(data.removalReasons || '{}'),
      averageRemovalTime: parseFloat(data.averageRemovalTime || '0'),
    };
  }

  private async getDataRequestMetrics(period: string): Promise<RegulatorMetrics['dataRequestMetrics']> {
    const key = `compliance:dsr_metrics:${period}`;
    const data = await this.redis.hgetall(key);

    return {
      accessRequests: parseInt(data.accessRequests || '0'),
      deletionRequests: parseInt(data.deletionRequests || '0'),
      averageCompletionTime: parseFloat(data.averageCompletionTime || '0'),
      completionRate: parseFloat(data.completionRate || '100'),
    };
  }

  private async getSafetyMetrics(period: string): Promise<RegulatorMetrics['safetyMetrics']> {
    const key = `compliance:safety_metrics:${period}`;
    const data = await this.redis.hgetall(key);

    return {
      reportsReceived: parseInt(data.reportsReceived || '0'),
      reportsActioned: parseInt(data.reportsActioned || '0'),
      falsePositiveRate: parseFloat(data.falsePositiveRate || '0'),
      appealRate: parseFloat(data.appealRate || '0'),
      appealSuccessRate: parseFloat(data.appealSuccessRate || '0'),
    };
  }

  private async getAlgorithmMetrics(period: string): Promise<RegulatorMetrics['algorithmMetrics']> {
    const key = `compliance:algorithm_metrics:${period}`;
    const data = await this.redis.hgetall(key);

    return {
      decisionsTotal: parseInt(data.decisionsTotal || '0'),
      decisionsByType: JSON.parse(data.decisionsByType || '{}'),
      appealedDecisions: parseInt(data.appealedDecisions || '0'),
      overturnedDecisions: parseInt(data.overturnedDecisions || '0'),
    };
  }

  private generateSummary(
    metrics: RegulatorMetrics,
    slaCompliance: Awaited<ReturnType<typeof this.checkSLACompliance>>
  ): string {
    const lines: string[] = [];

    lines.push(`Compliance Report for ${metrics.period}`);
    lines.push('');
    lines.push(`SLA Status: ${slaCompliance.compliant ? 'COMPLIANT' : 'NON-COMPLIANT'}`);
    lines.push('');
    lines.push('Key Metrics:');
    lines.push(`- Active Users: ${metrics.userMetrics.activeUsers.toLocaleString()}`);
    lines.push(`- Content Removed: ${metrics.contentMetrics.contentRemoved.toLocaleString()}`);
    lines.push(`- DSR Completion Rate: ${metrics.dataRequestMetrics.completionRate}%`);
    lines.push(`- Appeal Success Rate: ${metrics.safetyMetrics.appealSuccessRate}%`);

    if (slaCompliance.issues.length > 0) {
      lines.push('');
      lines.push('Issues Requiring Attention:');
      slaCompliance.issues.forEach(issue => lines.push(`- ${issue}`));
    }

    return lines.join('\n');
  }
}
