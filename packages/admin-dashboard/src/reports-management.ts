import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import {
  Report,
  ReportReason,
  ReportStatus,
  ReportPriority,
  ReportResolution,
  AdminAction,
} from './types';

export class ReportsManagementService {
  private redis: Redis;
  private readonly reportPrefix = 'admin:report:';
  private readonly queuePrefix = 'admin:report_queue:';
  private readonly actionLogPrefix = 'admin:action_log';

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async createReport(
    reporterId: string,
    reporterUsername: string,
    targetType: 'user' | 'post' | 'comment',
    targetId: string,
    reason: ReportReason,
    options: {
      description?: string;
      evidence?: string[];
    } = {}
  ): Promise<Report> {
    const priority = this.calculatePriority(reason);

    const report: Report = {
      id: uuidv4(),
      reporterId,
      reporterUsername,
      targetType,
      targetId,
      reason,
      description: options.description,
      evidence: options.evidence,
      status: 'pending',
      priority,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.saveReport(report);

    await this.redis.zadd(
      `${this.queuePrefix}${priority}`,
      report.createdAt.getTime(),
      report.id
    );

    await this.redis.zincrby(`${this.reportPrefix}target:${targetId}`, 1, reason);

    return report;
  }

  async getReport(reportId: string): Promise<Report | null> {
    const data = await this.redis.get(`${this.reportPrefix}${reportId}`);
    if (!data) return null;
    return this.deserializeReport(data);
  }

  async getReports(
    options: {
      status?: ReportStatus;
      priority?: ReportPriority;
      reason?: ReportReason;
      targetType?: 'user' | 'post' | 'comment';
      assignedTo?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ reports: Report[]; total: number }> {
    const reports: Report[] = [];
    let cursor = '0';

    do {
      const [newCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${this.reportPrefix}????????-????-????-????-????????????`,
        'COUNT',
        100
      );
      cursor = newCursor;

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const report = this.deserializeReport(data);

          const matchesStatus = !options.status || report.status === options.status;
          const matchesPriority = !options.priority || report.priority === options.priority;
          const matchesReason = !options.reason || report.reason === options.reason;
          const matchesTargetType =
            !options.targetType || report.targetType === options.targetType;
          const matchesAssigned =
            !options.assignedTo || report.assignedTo === options.assignedTo;

          if (
            matchesStatus &&
            matchesPriority &&
            matchesReason &&
            matchesTargetType &&
            matchesAssigned
          ) {
            reports.push(report);
          }
        }
      }
    } while (cursor !== '0');

    const priorityOrder: Record<ReportPriority, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };

    reports.sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    const offset = options.offset || 0;
    const limit = options.limit || 50;

    return {
      reports: reports.slice(offset, offset + limit),
      total: reports.length,
    };
  }

  async getReportQueue(
    priority?: ReportPriority,
    limit: number = 50
  ): Promise<Report[]> {
    let reportIds: string[];

    if (priority) {
      reportIds = await this.redis.zrange(`${this.queuePrefix}${priority}`, 0, limit - 1);
    } else {
      const priorities: ReportPriority[] = ['critical', 'high', 'medium', 'low'];
      reportIds = [];

      for (const p of priorities) {
        if (reportIds.length >= limit) break;
        const ids = await this.redis.zrange(
          `${this.queuePrefix}${p}`,
          0,
          limit - reportIds.length - 1
        );
        reportIds.push(...ids);
      }
    }

    const reports: Report[] = [];
    for (const id of reportIds) {
      const report = await this.getReport(id);
      if (report && report.status === 'pending') {
        reports.push(report);
      }
    }

    return reports;
  }

  async assignReport(
    reportId: string,
    adminId: string
  ): Promise<boolean> {
    const report = await this.getReport(reportId);
    if (!report) return false;

    report.assignedTo = adminId;
    report.status = 'under_review';
    report.updatedAt = new Date();
    await this.saveReport(report);

    await this.redis.zrem(`${this.queuePrefix}${report.priority}`, reportId);

    return true;
  }

  async resolveReport(
    reportId: string,
    adminId: string,
    resolution: Omit<ReportResolution, 'resolvedBy' | 'resolvedAt'>,
    options: {
      ipAddress?: string;
      userAgent?: string;
    } = {}
  ): Promise<boolean> {
    const report = await this.getReport(reportId);
    if (!report) return false;

    report.status = 'resolved';
    report.resolution = {
      ...resolution,
      resolvedBy: adminId,
      resolvedAt: new Date(),
    };
    report.resolvedAt = new Date();
    report.updatedAt = new Date();
    await this.saveReport(report);

    await this.redis.zrem(`${this.queuePrefix}${report.priority}`, reportId);

    await this.logAction({
      adminId,
      action: 'report_resolve',
      targetType: 'report',
      targetId: reportId,
      details: {
        targetType: report.targetType,
        targetId: report.targetId,
        reason: report.reason,
        resolution: resolution.action,
      },
      ipAddress: options.ipAddress || '',
      userAgent: options.userAgent || '',
    });

    return true;
  }

  async escalateReport(
    reportId: string,
    adminId: string,
    reason: string,
    options: {
      ipAddress?: string;
      userAgent?: string;
    } = {}
  ): Promise<boolean> {
    const report = await this.getReport(reportId);
    if (!report) return false;

    report.status = 'escalated';
    report.priority = 'critical';
    report.updatedAt = new Date();
    await this.saveReport(report);

    await this.redis.zrem(`${this.queuePrefix}${report.priority}`, reportId);
    await this.redis.zadd(
      `${this.queuePrefix}critical`,
      report.createdAt.getTime(),
      reportId
    );

    await this.logAction({
      adminId,
      action: 'report_escalate',
      targetType: 'report',
      targetId: reportId,
      details: { reason },
      reason,
      ipAddress: options.ipAddress || '',
      userAgent: options.userAgent || '',
    });

    return true;
  }

  async dismissReport(
    reportId: string,
    adminId: string,
    reason: string,
    options: {
      ipAddress?: string;
      userAgent?: string;
    } = {}
  ): Promise<boolean> {
    const report = await this.getReport(reportId);
    if (!report) return false;

    report.status = 'resolved';
    report.resolution = {
      action: 'dismissed',
      notes: reason,
      resolvedBy: adminId,
      resolvedAt: new Date(),
    };
    report.resolvedAt = new Date();
    report.updatedAt = new Date();
    await this.saveReport(report);

    await this.redis.zrem(`${this.queuePrefix}${report.priority}`, reportId);

    await this.logAction({
      adminId,
      action: 'report_dismiss',
      targetType: 'report',
      targetId: reportId,
      details: { reason },
      reason,
      ipAddress: options.ipAddress || '',
      userAgent: options.userAgent || '',
    });

    return true;
  }

  async getReportsForTarget(
    targetId: string
  ): Promise<{ reports: Report[]; reasons: Record<string, number> }> {
    const { reports } = await this.getReports({ limit: 1000 });
    const targetReports = reports.filter((r) => r.targetId === targetId);

    const reasons = await this.redis.zrange(
      `${this.reportPrefix}target:${targetId}`,
      0,
      -1,
      'WITHSCORES'
    );

    const reasonCounts: Record<string, number> = {};
    for (let i = 0; i < reasons.length; i += 2) {
      reasonCounts[reasons[i]] = parseInt(reasons[i + 1]);
    }

    return {
      reports: targetReports,
      reasons: reasonCounts,
    };
  }

  async getReportStats(): Promise<{
    total: number;
    pending: number;
    underReview: number;
    resolved: number;
    escalated: number;
    byReason: Record<string, number>;
    byPriority: Record<string, number>;
    averageResolutionTime: number;
  }> {
    const { reports } = await this.getReports({ limit: 10000 });

    const stats = {
      total: reports.length,
      pending: 0,
      underReview: 0,
      resolved: 0,
      escalated: 0,
      byReason: {} as Record<string, number>,
      byPriority: {} as Record<string, number>,
      averageResolutionTime: 0,
    };

    let totalResolutionTime = 0;
    let resolvedCount = 0;

    for (const report of reports) {
      switch (report.status) {
        case 'pending':
          stats.pending++;
          break;
        case 'under_review':
          stats.underReview++;
          break;
        case 'resolved':
          stats.resolved++;
          if (report.resolvedAt) {
            totalResolutionTime +=
              report.resolvedAt.getTime() - report.createdAt.getTime();
            resolvedCount++;
          }
          break;
        case 'escalated':
          stats.escalated++;
          break;
      }

      stats.byReason[report.reason] = (stats.byReason[report.reason] || 0) + 1;
      stats.byPriority[report.priority] =
        (stats.byPriority[report.priority] || 0) + 1;
    }

    if (resolvedCount > 0) {
      stats.averageResolutionTime = totalResolutionTime / resolvedCount / 1000 / 60;
    }

    return stats;
  }

  private calculatePriority(reason: ReportReason): ReportPriority {
    const criticalReasons: ReportReason[] = ['self_harm', 'illegal', 'violence'];
    const highReasons: ReportReason[] = ['harassment', 'hate_speech', 'nudity'];
    const mediumReasons: ReportReason[] = ['impersonation', 'misinformation', 'copyright'];

    if (criticalReasons.includes(reason)) return 'critical';
    if (highReasons.includes(reason)) return 'high';
    if (mediumReasons.includes(reason)) return 'medium';
    return 'low';
  }

  private async logAction(
    data: Omit<AdminAction, 'id' | 'adminUsername' | 'createdAt'>
  ): Promise<void> {
    const action: AdminAction = {
      id: uuidv4(),
      adminUsername: data.adminId,
      ...data,
      createdAt: new Date(),
    };

    await this.redis.lpush(this.actionLogPrefix, JSON.stringify(action));
  }

  private async saveReport(report: Report): Promise<void> {
    await this.redis.set(`${this.reportPrefix}${report.id}`, JSON.stringify(report));
  }

  private deserializeReport(data: string): Report {
    const report = JSON.parse(data);
    report.createdAt = new Date(report.createdAt);
    report.updatedAt = new Date(report.updatedAt);
    if (report.resolvedAt) report.resolvedAt = new Date(report.resolvedAt);
    if (report.resolution?.resolvedAt) {
      report.resolution.resolvedAt = new Date(report.resolution.resolvedAt);
    }
    return report;
  }
}
