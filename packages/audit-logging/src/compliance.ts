import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import {
  AuditEvent,
  AuditQueryFilters,
  RetentionPolicy,
  ComplianceReport,
  ComplianceReportType,
  AuditArchive,
  IntegrityCheckResult,
} from './types';
import { QueryEngine } from './query-engine';

export class ComplianceManager {
  private redis: Redis;
  private queryEngine: QueryEngine;
  private readonly policyPrefix = 'audit:retention_policy:';
  private readonly reportPrefix = 'audit:report:';
  private readonly archivePrefix = 'audit:archive:';
  private readonly indexPrefix = 'audit:index:';
  private readonly eventPrefix = 'audit:event:';

  constructor(redis: Redis, queryEngine: QueryEngine) {
    this.redis = redis;
    this.queryEngine = queryEngine;
  }

  // Retention Policy Management
  async createRetentionPolicy(
    name: string,
    retentionDays: number,
    options: {
      categories?: RetentionPolicy['categories'];
      severities?: RetentionPolicy['severities'];
      archiveBeforeDelete?: boolean;
    } = {}
  ): Promise<RetentionPolicy> {
    const policy: RetentionPolicy = {
      id: uuidv4(),
      name,
      enabled: true,
      categories: options.categories,
      severities: options.severities,
      retentionDays,
      archiveBeforeDelete: options.archiveBeforeDelete ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.redis.set(
      `${this.policyPrefix}${policy.id}`,
      JSON.stringify(policy)
    );

    return policy;
  }

  async updateRetentionPolicy(
    policyId: string,
    updates: Partial<Pick<RetentionPolicy, 'name' | 'enabled' | 'retentionDays' | 'archiveBeforeDelete'>>
  ): Promise<RetentionPolicy | null> {
    const data = await this.redis.get(`${this.policyPrefix}${policyId}`);
    if (!data) return null;

    const policy: RetentionPolicy = JSON.parse(data);
    Object.assign(policy, updates, { updatedAt: new Date() });

    await this.redis.set(
      `${this.policyPrefix}${policyId}`,
      JSON.stringify(policy)
    );

    return policy;
  }

  async deleteRetentionPolicy(policyId: string): Promise<boolean> {
    const result = await this.redis.del(`${this.policyPrefix}${policyId}`);
    return result > 0;
  }

  async listRetentionPolicies(): Promise<RetentionPolicy[]> {
    const policies: RetentionPolicy[] = [];
    let cursor = '0';

    do {
      const [newCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${this.policyPrefix}*`,
        'COUNT',
        100
      );
      cursor = newCursor;

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const policy = JSON.parse(data);
          policy.createdAt = new Date(policy.createdAt);
          policy.updatedAt = new Date(policy.updatedAt);
          policies.push(policy);
        }
      }
    } while (cursor !== '0');

    return policies;
  }

  async applyRetentionPolicies(): Promise<{
    deletedCount: number;
    archivedCount: number;
  }> {
    const policies = await this.listRetentionPolicies();
    let deletedCount = 0;
    let archivedCount = 0;

    for (const policy of policies) {
      if (!policy.enabled) continue;

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - policy.retentionDays);

      const filters: AuditQueryFilters = {
        endDate: cutoffDate,
        categories: policy.categories,
        severities: policy.severities,
      };

      const { events } = await this.queryEngine.query(filters, { limit: 10000 });

      if (events.length === 0) continue;

      if (policy.archiveBeforeDelete) {
        await this.archiveEvents(events);
        archivedCount += events.length;
      }

      await this.deleteEvents(events.map(e => e.id));
      deletedCount += events.length;
    }

    return { deletedCount, archivedCount };
  }

  // Compliance Report Generation
  async generateReport(
    type: ComplianceReportType,
    name: string,
    filters: AuditQueryFilters,
    generatedBy: string,
    options: {
      description?: string;
      format?: 'json' | 'csv' | 'pdf';
    } = {}
  ): Promise<ComplianceReport> {
    const report: ComplianceReport = {
      id: uuidv4(),
      type,
      name,
      description: options.description,
      filters,
      generatedAt: new Date(),
      generatedBy,
      eventCount: 0,
      format: options.format || 'json',
      status: 'pending',
    };

    await this.saveReport(report);

    // Generate report asynchronously
    this.processReport(report).catch(console.error);

    return report;
  }

  private async processReport(report: ComplianceReport): Promise<void> {
    try {
      report.status = 'generating';
      await this.saveReport(report);

      const { events } = await this.queryEngine.query(report.filters, {
        limit: 100000,
      });

      report.eventCount = events.length;

      // Generate report content based on format
      const content = this.formatReportContent(report.type, events, report.format);

      // Store report content
      const fileKey = `audit:report_file:${report.id}`;
      await this.redis.set(fileKey, content, 'EX', 86400 * 30); // 30 days

      report.fileUrl = fileKey;
      report.status = 'completed';
      report.expiresAt = new Date(Date.now() + 86400 * 30 * 1000);

      await this.saveReport(report);
    } catch (error) {
      report.status = 'failed';
      await this.saveReport(report);
      throw error;
    }
  }

  private formatReportContent(
    type: ComplianceReportType,
    events: AuditEvent[],
    format: 'json' | 'csv' | 'pdf'
  ): string {
    if (format === 'json') {
      return JSON.stringify({
        reportType: type,
        generatedAt: new Date().toISOString(),
        totalEvents: events.length,
        events: events.map(e => ({
          id: e.id,
          timestamp: e.timestamp,
          category: e.category,
          action: e.action,
          severity: e.severity,
          status: e.status,
          actor: {
            type: e.actor.type,
            id: e.actor.id,
            username: e.actor.username,
          },
          resource: e.resource,
          message: e.message,
        })),
      }, null, 2);
    }

    if (format === 'csv') {
      const headers = [
        'id',
        'timestamp',
        'category',
        'action',
        'severity',
        'status',
        'actor_type',
        'actor_id',
        'actor_username',
        'resource_type',
        'resource_id',
        'message',
      ];

      const rows = events.map(e => [
        e.id,
        e.timestamp.toISOString(),
        e.category,
        e.action,
        e.severity,
        e.status,
        e.actor.type,
        e.actor.id || '',
        e.actor.username || '',
        e.resource?.type || '',
        e.resource?.id || '',
        `"${e.message.replace(/"/g, '""')}"`,
      ]);

      return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    }

    // PDF format would require a PDF library - return JSON for now
    return JSON.stringify(events);
  }

  async getReport(reportId: string): Promise<ComplianceReport | null> {
    const data = await this.redis.get(`${this.reportPrefix}${reportId}`);
    if (!data) return null;

    const report = JSON.parse(data);
    report.generatedAt = new Date(report.generatedAt);
    if (report.expiresAt) report.expiresAt = new Date(report.expiresAt);
    return report;
  }

  async getReportContent(reportId: string): Promise<string | null> {
    const report = await this.getReport(reportId);
    if (!report || !report.fileUrl) return null;

    return this.redis.get(report.fileUrl);
  }

  async listReports(options: {
    type?: ComplianceReportType;
    status?: ComplianceReport['status'];
    limit?: number;
  } = {}): Promise<ComplianceReport[]> {
    const reports: ComplianceReport[] = [];
    let cursor = '0';

    do {
      const [newCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${this.reportPrefix}*`,
        'COUNT',
        100
      );
      cursor = newCursor;

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const report = JSON.parse(data);
          report.generatedAt = new Date(report.generatedAt);
          if (report.expiresAt) report.expiresAt = new Date(report.expiresAt);

          if (options.type && report.type !== options.type) continue;
          if (options.status && report.status !== options.status) continue;

          reports.push(report);
        }
      }
    } while (cursor !== '0');

    reports.sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime());

    return options.limit ? reports.slice(0, options.limit) : reports;
  }

  // GDPR-specific reports
  async generateGDPRDataAccessReport(
    userId: string,
    generatedBy: string
  ): Promise<ComplianceReport> {
    return this.generateReport(
      'gdpr_data_access',
      `GDPR Data Access Report - User ${userId}`,
      {
        actorIds: [userId],
      },
      generatedBy,
      {
        description: `All audit events related to user ${userId} for GDPR data access request`,
      }
    );
  }

  async generateGDPRDeletionReport(
    userId: string,
    generatedBy: string
  ): Promise<ComplianceReport> {
    return this.generateReport(
      'gdpr_data_deletion',
      `GDPR Data Deletion Report - User ${userId}`,
      {
        resourceIds: [userId],
        actions: ['data_deleted', 'user_deleted'],
      },
      generatedBy,
      {
        description: `Audit trail for GDPR data deletion request for user ${userId}`,
      }
    );
  }

  async generateSecurityAuditReport(
    startDate: Date,
    endDate: Date,
    generatedBy: string
  ): Promise<ComplianceReport> {
    return this.generateReport(
      'security_audit',
      `Security Audit Report - ${startDate.toISOString().slice(0, 10)} to ${endDate.toISOString().slice(0, 10)}`,
      {
        startDate,
        endDate,
        categories: ['security', 'authentication', 'authorization'],
      },
      generatedBy,
      {
        description: 'Security audit report including authentication, authorization, and security events',
      }
    );
  }

  // Archive Management
  async archiveEvents(events: AuditEvent[]): Promise<AuditArchive> {
    const startDate = events.reduce(
      (min, e) => (e.timestamp < min ? e.timestamp : min),
      events[0].timestamp
    );
    const endDate = events.reduce(
      (max, e) => (e.timestamp > max ? e.timestamp : max),
      events[0].timestamp
    );

    const content = JSON.stringify(events);
    const compressed = Buffer.from(content).toString('base64');
    const checksum = crypto.createHash('sha256').update(content).digest('hex');

    const archive: AuditArchive = {
      id: uuidv4(),
      startDate,
      endDate,
      eventCount: events.length,
      compressedSize: compressed.length,
      checksum,
      location: `audit:archive_data:${uuidv4()}`,
      createdAt: new Date(),
    };

    // Store archive data
    await this.redis.set(archive.location, compressed);

    // Store archive metadata
    await this.redis.set(
      `${this.archivePrefix}${archive.id}`,
      JSON.stringify(archive)
    );

    return archive;
  }

  async getArchive(archiveId: string): Promise<AuditArchive | null> {
    const data = await this.redis.get(`${this.archivePrefix}${archiveId}`);
    if (!data) return null;

    const archive = JSON.parse(data);
    archive.startDate = new Date(archive.startDate);
    archive.endDate = new Date(archive.endDate);
    archive.createdAt = new Date(archive.createdAt);
    return archive;
  }

  async restoreArchive(archiveId: string): Promise<AuditEvent[]> {
    const archive = await this.getArchive(archiveId);
    if (!archive) throw new Error('Archive not found');

    const compressed = await this.redis.get(archive.location);
    if (!compressed) throw new Error('Archive data not found');

    const content = Buffer.from(compressed, 'base64').toString();

    // Verify checksum
    const checksum = crypto.createHash('sha256').update(content).digest('hex');
    if (checksum !== archive.checksum) {
      throw new Error('Archive integrity check failed');
    }

    const events: AuditEvent[] = JSON.parse(content);

    // Restore events to main storage
    const pipeline = this.redis.pipeline();
    for (const event of events) {
      event.timestamp = new Date(event.timestamp);
      pipeline.set(
        `${this.eventPrefix}${event.id}`,
        JSON.stringify(event)
      );
      pipeline.zadd(
        `${this.indexPrefix}time`,
        event.timestamp.getTime(),
        event.id
      );
    }
    await pipeline.exec();

    return events;
  }

  async listArchives(options: {
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  } = {}): Promise<AuditArchive[]> {
    const archives: AuditArchive[] = [];
    let cursor = '0';

    do {
      const [newCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${this.archivePrefix}*`,
        'COUNT',
        100
      );
      cursor = newCursor;

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const archive = JSON.parse(data);
          archive.startDate = new Date(archive.startDate);
          archive.endDate = new Date(archive.endDate);
          archive.createdAt = new Date(archive.createdAt);

          if (options.startDate && archive.endDate < options.startDate) continue;
          if (options.endDate && archive.startDate > options.endDate) continue;

          archives.push(archive);
        }
      }
    } while (cursor !== '0');

    archives.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return options.limit ? archives.slice(0, options.limit) : archives;
  }

  // Integrity Verification
  async verifyEventIntegrity(
    eventId: string,
    signingKey: string
  ): Promise<IntegrityCheckResult> {
    const event = await this.queryEngine.getEvent(eventId);

    if (!event) {
      return {
        valid: false,
        eventId,
        timestamp: new Date(),
        issues: ['Event not found'],
      };
    }

    const issues: string[] = [];

    // Verify signature if present
    const signedEvent = event as AuditEvent & { signature?: string };
    if (signedEvent.signature) {
      const data = JSON.stringify({
        id: event.id,
        timestamp: event.timestamp,
        category: event.category,
        action: event.action,
        actor: event.actor,
        resource: event.resource,
      });

      const expectedSignature = crypto
        .createHmac('sha256', signingKey)
        .update(data)
        .digest('hex');

      if (signedEvent.signature !== expectedSignature) {
        issues.push('Event signature mismatch');
      }
    }

    // Verify event exists in indexes
    const inTimeIndex = await this.redis.zscore(
      `${this.indexPrefix}time`,
      eventId
    );
    if (!inTimeIndex) {
      issues.push('Event missing from time index');
    }

    const inCategoryIndex = await this.redis.zscore(
      `${this.indexPrefix}category:${event.category}`,
      eventId
    );
    if (!inCategoryIndex) {
      issues.push('Event missing from category index');
    }

    return {
      valid: issues.length === 0,
      eventId,
      timestamp: new Date(),
      issues: issues.length > 0 ? issues : undefined,
    };
  }

  async verifyChainIntegrity(
    startDate: Date,
    endDate: Date,
    signingKey: string
  ): Promise<{
    valid: boolean;
    checkedCount: number;
    invalidEvents: IntegrityCheckResult[];
  }> {
    const { events } = await this.queryEngine.query(
      { startDate, endDate },
      { limit: 10000 }
    );

    const invalidEvents: IntegrityCheckResult[] = [];

    for (const event of events) {
      const result = await this.verifyEventIntegrity(event.id, signingKey);
      if (!result.valid) {
        invalidEvents.push(result);
      }
    }

    return {
      valid: invalidEvents.length === 0,
      checkedCount: events.length,
      invalidEvents,
    };
  }

  private async saveReport(report: ComplianceReport): Promise<void> {
    await this.redis.set(
      `${this.reportPrefix}${report.id}`,
      JSON.stringify(report)
    );
  }

  private async deleteEvents(eventIds: string[]): Promise<void> {
    const pipeline = this.redis.pipeline();

    for (const id of eventIds) {
      pipeline.del(`${this.eventPrefix}${id}`);
      pipeline.zrem(`${this.indexPrefix}time`, id);
    }

    await pipeline.exec();
  }
}
