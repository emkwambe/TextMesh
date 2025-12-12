import { Redis } from 'ioredis';
import {
  AuditEntry,
  AuditAction,
  AlgorithmicDecision,
  AlgorithmType,
  AlgorithmFactor,
  TransparencyReport,
  DataSubjectRequest,
  DataRequestType,
  DataInventory,
  AgeAppropriateDefaults,
  RegulatorMetrics,
  ComplianceAlert,
  AlertType,
} from './types';
import { ImmutableAuditTrail } from './immutable-audit';
import { AlgorithmicTransparency } from './algorithmic-transparency';
import { GDPRManager } from './gdpr-manager';
import { RegulatorDashboard } from './regulator-dashboard';

export interface ComplianceServiceConfig {
  auditRetentionDays?: number;
  autoGenerateReports?: boolean;
}

export class ComplianceService {
  private redis: Redis;
  private audit: ImmutableAuditTrail;
  private transparency: AlgorithmicTransparency;
  private gdpr: GDPRManager;
  private regulator: RegulatorDashboard;

  constructor(redis: Redis, config?: ComplianceServiceConfig) {
    this.redis = redis;
    this.audit = new ImmutableAuditTrail(redis);
    this.transparency = new AlgorithmicTransparency(redis);
    this.gdpr = new GDPRManager(redis);
    this.regulator = new RegulatorDashboard(redis);
  }

  // ============ AUDIT TRAIL ============

  async logAuditEvent(
    action: AuditAction,
    actorType: AuditEntry['actorType'],
    actorId: string,
    targetType: AuditEntry['targetType'],
    targetId: string,
    details: Record<string, unknown>,
    options?: {
      previousState?: Record<string, unknown>;
      newState?: Record<string, unknown>;
      reason?: string;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<AuditEntry> {
    return this.audit.log(action, actorType, actorId, targetType, targetId, details, options);
  }

  async getAuditEntry(entryId: string): Promise<AuditEntry | null> {
    return this.audit.getEntry(entryId);
  }

  async getAuditHistory(
    targetType: AuditEntry['targetType'],
    targetId: string,
    options?: { limit?: number; startDate?: Date; endDate?: Date }
  ): Promise<AuditEntry[]> {
    return this.audit.getEntriesByTarget(targetType, targetId, options);
  }

  async verifyAuditIntegrity(): Promise<{
    valid: boolean;
    entriesChecked: number;
    invalidEntries: string[];
  }> {
    return this.audit.verifyIntegrity();
  }

  async exportAuditLog(
    startDate: Date,
    endDate: Date,
    filters?: { actions?: AuditAction[] }
  ): Promise<AuditEntry[]> {
    return this.audit.exportAuditLog(startDate, endDate, filters);
  }

  // ============ ALGORITHMIC TRANSPARENCY ============

  async logAlgorithmicDecision(
    algorithm: AlgorithmType,
    targetType: AlgorithmicDecision['targetType'],
    targetId: string,
    decision: string,
    factors: AlgorithmFactor[],
    options?: {
      confidence?: number;
      userVisible?: boolean;
      appealable?: boolean;
      userId?: string;
    }
  ): Promise<AlgorithmicDecision> {
    return this.transparency.logDecision(algorithm, targetType, targetId, decision, factors, options);
  }

  async getUserAlgorithmicDecisions(
    userId: string,
    options?: { algorithm?: AlgorithmType; limit?: number }
  ): Promise<AlgorithmicDecision[]> {
    return this.transparency.getUserDecisions(userId, options);
  }

  async explainFeedItem(
    userId: string,
    contentId: string
  ): Promise<{
    reasons: string[];
    factors: AlgorithmFactor[];
    algorithms: AlgorithmType[];
  }> {
    return this.transparency.explainFeedItem(userId, contentId);
  }

  async generateTransparencyReport(
    userId: string,
    period: string
  ): Promise<TransparencyReport> {
    return this.transparency.generateTransparencyReport(userId, period);
  }

  // ============ GDPR / DATA RIGHTS ============

  async createDataRequest(
    userId: string,
    type: DataRequestType
  ): Promise<DataSubjectRequest> {
    // Log the request
    await this.logAuditEvent(
      type === 'access' ? 'user_data_exported' : 'user_data_deleted',
      'user',
      userId,
      'user',
      userId,
      { requestType: type }
    );

    return this.gdpr.createRequest(userId, type);
  }

  async getDataRequest(requestId: string): Promise<DataSubjectRequest | null> {
    return this.gdpr.getRequest(requestId);
  }

  async getUserDataRequests(userId: string): Promise<DataSubjectRequest[]> {
    return this.gdpr.getUserRequests(userId);
  }

  async processAccessRequest(requestId: string): Promise<DataSubjectRequest> {
    return this.gdpr.processAccessRequest(requestId);
  }

  async processErasureRequest(
    requestId: string,
    processedBy: string
  ): Promise<DataSubjectRequest> {
    return this.gdpr.processErasureRequest(requestId, processedBy);
  }

  async verifyDeletion(requestId: string): Promise<{
    verified: boolean;
    issues?: string[];
  }> {
    return this.gdpr.verifyDeletion(requestId);
  }

  async getDataInventory(userId: string): Promise<DataInventory> {
    return this.gdpr.generateDataInventory(userId);
  }

  // Age-appropriate defaults
  getDefaultsForAge(age: number): AgeAppropriateDefaults {
    return this.gdpr.getDefaultsForAge(age);
  }

  getRestrictionsForAge(age: number): string[] {
    return this.gdpr.getRestrictionsForAge(age);
  }

  async applyAgeDefaults(userId: string, age: number): Promise<void> {
    return this.gdpr.applyAgeDefaults(userId, age);
  }

  // Consent management
  async recordConsent(
    userId: string,
    purpose: string,
    granted: boolean
  ): Promise<void> {
    await this.gdpr.recordConsent(userId, purpose, granted);

    // Audit the consent change
    await this.logAuditEvent(
      'privacy_settings_changed',
      'user',
      userId,
      'user',
      userId,
      { purpose, granted }
    );
  }

  async getConsent(userId: string, purpose: string): Promise<{
    granted: boolean;
    timestamp: Date;
  } | null> {
    return this.gdpr.getConsent(userId, purpose);
  }

  async getAllConsents(userId: string): Promise<Record<string, { granted: boolean; timestamp: Date }>> {
    return this.gdpr.getAllConsents(userId);
  }

  // ============ REGULATOR DASHBOARD ============

  async getRegulatorMetrics(period: string): Promise<RegulatorMetrics | null> {
    return this.regulator.getMetrics(period);
  }

  async generateRegulatorMetrics(period: string): Promise<RegulatorMetrics> {
    return this.regulator.generateMetrics(period);
  }

  async createComplianceAlert(
    type: AlertType,
    severity: ComplianceAlert['severity'],
    message: string,
    details: Record<string, unknown>
  ): Promise<ComplianceAlert> {
    return this.regulator.createAlert(type, severity, message, details);
  }

  async getActiveAlerts(): Promise<ComplianceAlert[]> {
    return this.regulator.getActiveAlerts();
  }

  async acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<ComplianceAlert | null> {
    return this.regulator.acknowledgeAlert(alertId, acknowledgedBy);
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
    return this.regulator.checkSLACompliance();
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
    return this.regulator.generateComplianceReport(startDate, endDate);
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
    return this.regulator.getPublicTransparencyData();
  }

  // ============ COMBINED WORKFLOWS ============

  async handleUserDeletion(
    userId: string,
    requestedBy: string,
    reason: string
  ): Promise<{
    auditEntry: AuditEntry;
    dataRequest: DataSubjectRequest;
  }> {
    // Create data request
    const dataRequest = await this.gdpr.createRequest(userId, 'erasure');

    // Process erasure
    await this.gdpr.processErasureRequest(dataRequest.id, requestedBy);

    // Audit the deletion
    const auditEntry = await this.logAuditEvent(
      'user_deleted',
      'admin',
      requestedBy,
      'user',
      userId,
      { reason, requestId: dataRequest.id },
      { reason }
    );

    return { auditEntry, dataRequest };
  }

  async handleContentModeration(
    contentId: string,
    moderatorId: string,
    action: 'hidden' | 'deleted' | 'restored',
    reason: string,
    algorithmFactors?: AlgorithmFactor[]
  ): Promise<{
    auditEntry: AuditEntry;
    algorithmicDecision?: AlgorithmicDecision;
  }> {
    const auditAction = action === 'restored' ? 'content_restored' :
      action === 'deleted' ? 'content_deleted' : 'content_hidden';

    const auditEntry = await this.logAuditEvent(
      auditAction,
      'admin',
      moderatorId,
      'content',
      contentId,
      { action, reason },
      { reason }
    );

    let algorithmicDecision: AlgorithmicDecision | undefined;

    if (algorithmFactors && algorithmFactors.length > 0) {
      algorithmicDecision = await this.logAlgorithmicDecision(
        'moderation',
        'content',
        contentId,
        action,
        algorithmFactors,
        { userVisible: true, appealable: true }
      );
    }

    return { auditEntry, algorithmicDecision };
  }

  // Service getters
  getAuditTrail(): ImmutableAuditTrail {
    return this.audit;
  }

  getTransparency(): AlgorithmicTransparency {
    return this.transparency;
  }

  getGDPRManager(): GDPRManager {
    return this.gdpr;
  }

  getRegulatorDashboard(): RegulatorDashboard {
    return this.regulator;
  }
}
