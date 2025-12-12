import { Redis } from 'ioredis';
import {
  AuditEvent,
  AuditEventInput,
  AuditConfig,
  AuditQueryFilters,
  AuditQueryOptions,
  AuditAggregation,
  AggregationType,
  RetentionPolicy,
  ComplianceReport,
  ComplianceReportType,
  AuditArchive,
  AuditSubscriber,
  IntegrityCheckResult,
} from './types';
import { EventLogger } from './event-logger';
import { QueryEngine } from './query-engine';
import { ComplianceManager } from './compliance';

const DEFAULT_CONFIG: AuditConfig = {
  enabled: true,
  retentionDays: 365,
  archiveEnabled: true,
  realTimeStream: true,
  batchSize: 1,
  flushIntervalMs: 5000,
  hashPII: true,
  signEvents: true,
};

export class AuditService {
  private redis: Redis;
  private config: AuditConfig;
  private eventLogger: EventLogger;
  private queryEngine: QueryEngine;
  private complianceManager: ComplianceManager;
  private retentionInterval?: NodeJS.Timeout;
  private signingKey: string;

  constructor(
    redis: Redis,
    config?: Partial<AuditConfig>,
    signingKey?: string
  ) {
    this.redis = redis;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.signingKey = signingKey || '';

    this.eventLogger = new EventLogger(redis, this.config, this.signingKey);
    this.queryEngine = new QueryEngine(redis);
    this.complianceManager = new ComplianceManager(redis, this.queryEngine);
  }

  async initialize(): Promise<void> {
    // Start retention policy enforcement
    if (this.config.archiveEnabled) {
      this.startRetentionEnforcement();
    }
  }

  // Event Logging
  async log(input: AuditEventInput): Promise<AuditEvent> {
    return this.eventLogger.log(input);
  }

  async logBatch(inputs: AuditEventInput[]): Promise<AuditEvent[]> {
    return this.eventLogger.logBatch(inputs);
  }

  // Convenience logging methods
  async logAuthentication(
    action: 'login' | 'logout' | 'login_failed' | 'password_change' | 'password_reset',
    actorId: string,
    options?: {
      username?: string;
      ip?: string;
      userAgent?: string;
      sessionId?: string;
      success?: boolean;
      reason?: string;
    }
  ): Promise<AuditEvent> {
    return this.eventLogger.logAuthentication(action, actorId, options);
  }

  async logAuthorization(
    action: 'permission_granted' | 'permission_revoked' | 'role_assigned' | 'role_removed' | 'access_denied',
    actorId: string,
    targetUserId: string,
    permission: string,
    options?: {
      adminUsername?: string;
      ip?: string;
    }
  ): Promise<AuditEvent> {
    return this.eventLogger.logAuthorization(action, actorId, targetUserId, permission, options);
  }

  async logContentAction(
    action: 'content_created' | 'content_updated' | 'content_deleted' | 'content_published',
    actorId: string,
    contentType: string,
    contentId: string,
    options?: {
      username?: string;
      ip?: string;
      changes?: Array<{ field: string; oldValue: unknown; newValue: unknown }>;
    }
  ): Promise<AuditEvent> {
    return this.eventLogger.logContentAction(action, actorId, contentType, contentId, options);
  }

  async logModeration(
    action: 'content_flagged' | 'content_removed' | 'content_approved' | 'user_warned' | 'user_banned',
    moderatorId: string,
    targetType: 'user' | 'content',
    targetId: string,
    options?: {
      moderatorUsername?: string;
      ip?: string;
      reason?: string;
      duration?: number;
    }
  ): Promise<AuditEvent> {
    return this.eventLogger.logModeration(action, moderatorId, targetType, targetId, options);
  }

  async logSecurityEvent(
    action: 'suspicious_activity' | 'rate_limit_exceeded' | 'ip_blocked' | 'security_alert',
    severity: 'low' | 'medium' | 'high' | 'critical',
    options?: {
      actorId?: string;
      ip?: string;
      details?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<AuditEvent> {
    return this.eventLogger.logSecurityEvent(action, severity, options);
  }

  async logDataAccess(
    action: 'data_exported' | 'data_imported' | 'data_deleted' | 'pii_accessed',
    actorId: string,
    resourceType: string,
    resourceId: string,
    options?: {
      username?: string;
      ip?: string;
      purpose?: string;
      dataTypes?: string[];
    }
  ): Promise<AuditEvent> {
    return this.eventLogger.logDataAccess(action, actorId, resourceType, resourceId, options);
  }

  async logAdminAction(
    action: 'admin_action' | 'config_changed' | 'feature_toggled' | 'maintenance_started' | 'maintenance_ended',
    adminId: string,
    options?: {
      username?: string;
      ip?: string;
      target?: { type: string; id: string };
      changes?: Array<{ field: string; oldValue: unknown; newValue: unknown }>;
      details?: string;
    }
  ): Promise<AuditEvent> {
    return this.eventLogger.logAdminAction(action, adminId, options);
  }

  async logSystemEvent(
    action: 'system_started' | 'system_stopped' | 'backup_created' | 'backup_restored' | 'migration_run' | 'cache_cleared',
    options?: {
      details?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<AuditEvent> {
    return this.eventLogger.logSystemEvent(action, options);
  }

  // Querying
  async query(
    filters?: AuditQueryFilters,
    options?: AuditQueryOptions
  ): Promise<{ events: AuditEvent[]; total: number }> {
    return this.queryEngine.query(filters, options);
  }

  async getEvent(eventId: string): Promise<AuditEvent | null> {
    return this.queryEngine.getEvent(eventId);
  }

  async getEventsByActor(
    actorId: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    }
  ): Promise<AuditEvent[]> {
    return this.queryEngine.getEventsByActor(actorId, options);
  }

  async getEventsByResource(
    resourceType: string,
    resourceId: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    }
  ): Promise<AuditEvent[]> {
    return this.queryEngine.getEventsByResource(resourceType, resourceId, options);
  }

  async getEventsByCorrelationId(correlationId: string): Promise<AuditEvent[]> {
    return this.queryEngine.getEventsByCorrelationId(correlationId);
  }

  async getRecentEvents(
    limit?: number,
    filters?: Partial<AuditQueryFilters>
  ): Promise<AuditEvent[]> {
    return this.queryEngine.getRecentEvents(limit, filters);
  }

  async searchEvents(
    searchText: string,
    options?: {
      limit?: number;
      categories?: string[];
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<AuditEvent[]> {
    return this.queryEngine.searchEvents(searchText, options);
  }

  // Aggregations
  async aggregate(
    type: AggregationType,
    filters?: AuditQueryFilters,
    options?: {
      interval?: 'hour' | 'day' | 'week' | 'month';
    }
  ): Promise<AuditAggregation> {
    return this.queryEngine.aggregate(type, filters, options);
  }

  async getEventStats(
    startDate: Date,
    endDate: Date
  ): Promise<{
    total: number;
    byCategory: Record<string, number>;
    byAction: Record<string, number>;
    bySeverity: Record<string, number>;
    byStatus: Record<string, number>;
    byHour: Record<string, number>;
  }> {
    return this.queryEngine.getEventStats(startDate, endDate);
  }

  // Retention Policies
  async createRetentionPolicy(
    name: string,
    retentionDays: number,
    options?: {
      categories?: RetentionPolicy['categories'];
      severities?: RetentionPolicy['severities'];
      archiveBeforeDelete?: boolean;
    }
  ): Promise<RetentionPolicy> {
    return this.complianceManager.createRetentionPolicy(name, retentionDays, options);
  }

  async updateRetentionPolicy(
    policyId: string,
    updates: Partial<Pick<RetentionPolicy, 'name' | 'enabled' | 'retentionDays' | 'archiveBeforeDelete'>>
  ): Promise<RetentionPolicy | null> {
    return this.complianceManager.updateRetentionPolicy(policyId, updates);
  }

  async deleteRetentionPolicy(policyId: string): Promise<boolean> {
    return this.complianceManager.deleteRetentionPolicy(policyId);
  }

  async listRetentionPolicies(): Promise<RetentionPolicy[]> {
    return this.complianceManager.listRetentionPolicies();
  }

  async applyRetentionPolicies(): Promise<{
    deletedCount: number;
    archivedCount: number;
  }> {
    return this.complianceManager.applyRetentionPolicies();
  }

  // Compliance Reports
  async generateReport(
    type: ComplianceReportType,
    name: string,
    filters: AuditQueryFilters,
    generatedBy: string,
    options?: {
      description?: string;
      format?: 'json' | 'csv' | 'pdf';
    }
  ): Promise<ComplianceReport> {
    return this.complianceManager.generateReport(type, name, filters, generatedBy, options);
  }

  async generateGDPRDataAccessReport(
    userId: string,
    generatedBy: string
  ): Promise<ComplianceReport> {
    return this.complianceManager.generateGDPRDataAccessReport(userId, generatedBy);
  }

  async generateGDPRDeletionReport(
    userId: string,
    generatedBy: string
  ): Promise<ComplianceReport> {
    return this.complianceManager.generateGDPRDeletionReport(userId, generatedBy);
  }

  async generateSecurityAuditReport(
    startDate: Date,
    endDate: Date,
    generatedBy: string
  ): Promise<ComplianceReport> {
    return this.complianceManager.generateSecurityAuditReport(startDate, endDate, generatedBy);
  }

  async getReport(reportId: string): Promise<ComplianceReport | null> {
    return this.complianceManager.getReport(reportId);
  }

  async getReportContent(reportId: string): Promise<string | null> {
    return this.complianceManager.getReportContent(reportId);
  }

  async listReports(options?: {
    type?: ComplianceReportType;
    status?: ComplianceReport['status'];
    limit?: number;
  }): Promise<ComplianceReport[]> {
    return this.complianceManager.listReports(options);
  }

  // Archives
  async archiveEvents(events: AuditEvent[]): Promise<AuditArchive> {
    return this.complianceManager.archiveEvents(events);
  }

  async getArchive(archiveId: string): Promise<AuditArchive | null> {
    return this.complianceManager.getArchive(archiveId);
  }

  async restoreArchive(archiveId: string): Promise<AuditEvent[]> {
    return this.complianceManager.restoreArchive(archiveId);
  }

  async listArchives(options?: {
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<AuditArchive[]> {
    return this.complianceManager.listArchives(options);
  }

  // Integrity Verification
  async verifyEventIntegrity(eventId: string): Promise<IntegrityCheckResult> {
    return this.complianceManager.verifyEventIntegrity(eventId, this.signingKey);
  }

  async verifyChainIntegrity(
    startDate: Date,
    endDate: Date
  ): Promise<{
    valid: boolean;
    checkedCount: number;
    invalidEvents: IntegrityCheckResult[];
  }> {
    return this.complianceManager.verifyChainIntegrity(startDate, endDate, this.signingKey);
  }

  // Subscriptions
  subscribe(subscriber: AuditSubscriber): string {
    return this.eventLogger.subscribe(subscriber);
  }

  unsubscribe(subscriberId: string): boolean {
    return this.eventLogger.unsubscribe(subscriberId);
  }

  // Dashboard Data
  async getDashboardData(options?: {
    timeRange?: 'hour' | 'day' | 'week' | 'month';
  }): Promise<{
    recentEvents: AuditEvent[];
    stats: {
      total: number;
      byCategory: Record<string, number>;
      bySeverity: Record<string, number>;
      byStatus: Record<string, number>;
    };
    timeline: Record<string, number>;
    topActors: Array<{ actorId: string; count: number }>;
    securityAlerts: AuditEvent[];
  }> {
    const timeRange = options?.timeRange || 'day';
    const now = new Date();
    const startDate = new Date(now);

    switch (timeRange) {
      case 'hour':
        startDate.setHours(startDate.getHours() - 1);
        break;
      case 'day':
        startDate.setDate(startDate.getDate() - 1);
        break;
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
    }

    const [recentEvents, stats, securityEvents] = await Promise.all([
      this.getRecentEvents(20),
      this.getEventStats(startDate, now),
      this.query(
        {
          startDate,
          endDate: now,
          categories: ['security'],
          severities: ['high', 'critical'],
        },
        { limit: 10 }
      ),
    ]);

    // Calculate top actors
    const actorAggregation = await this.aggregate('count_by_actor', {
      startDate,
      endDate: now,
    });

    const topActors = Object.entries(actorAggregation.results as Record<string, number>)
      .map(([actorId, count]) => ({ actorId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      recentEvents,
      stats: {
        total: stats.total,
        byCategory: stats.byCategory,
        bySeverity: stats.bySeverity,
        byStatus: stats.byStatus,
      },
      timeline: stats.byHour,
      topActors,
      securityAlerts: securityEvents.events,
    };
  }

  // Utilities
  async flush(): Promise<void> {
    await this.eventLogger.flushBuffer();
  }

  private startRetentionEnforcement(): void {
    // Run retention enforcement daily
    this.retentionInterval = setInterval(
      async () => {
        try {
          const result = await this.applyRetentionPolicies();
          console.log(
            `Retention enforcement completed: ${result.deletedCount} deleted, ${result.archivedCount} archived`
          );
        } catch (error) {
          console.error('Retention enforcement failed:', error);
        }
      },
      24 * 60 * 60 * 1000 // 24 hours
    );

    // Run immediately on startup
    this.applyRetentionPolicies().catch(console.error);
  }

  async shutdown(): Promise<void> {
    if (this.retentionInterval) {
      clearInterval(this.retentionInterval);
    }
    await this.eventLogger.shutdown();
  }

  // Getters for internal components
  getEventLogger(): EventLogger {
    return this.eventLogger;
  }

  getQueryEngine(): QueryEngine {
    return this.queryEngine;
  }

  getComplianceManager(): ComplianceManager {
    return this.complianceManager;
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }
}
