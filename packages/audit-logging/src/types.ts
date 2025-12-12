// Audit event categories
export type AuditCategory =
  | 'authentication'
  | 'authorization'
  | 'user_management'
  | 'content'
  | 'moderation'
  | 'admin'
  | 'system'
  | 'security'
  | 'data_access'
  | 'configuration'
  | 'api'
  | 'payment'
  | 'compliance';

// Audit action types
export type AuditAction =
  // Authentication
  | 'login'
  | 'logout'
  | 'login_failed'
  | 'password_change'
  | 'password_reset'
  | 'mfa_enabled'
  | 'mfa_disabled'
  | 'session_created'
  | 'session_revoked'
  // Authorization
  | 'permission_granted'
  | 'permission_revoked'
  | 'role_assigned'
  | 'role_removed'
  | 'access_denied'
  // User management
  | 'user_created'
  | 'user_updated'
  | 'user_deleted'
  | 'user_suspended'
  | 'user_activated'
  | 'user_verified'
  | 'profile_updated'
  // Content
  | 'content_created'
  | 'content_updated'
  | 'content_deleted'
  | 'content_published'
  | 'content_unpublished'
  | 'content_archived'
  | 'content_restored'
  // Moderation
  | 'content_flagged'
  | 'content_removed'
  | 'content_approved'
  | 'user_warned'
  | 'user_banned'
  | 'user_unbanned'
  | 'appeal_submitted'
  | 'appeal_resolved'
  // Admin
  | 'admin_action'
  | 'config_changed'
  | 'feature_toggled'
  | 'maintenance_started'
  | 'maintenance_ended'
  // System
  | 'system_started'
  | 'system_stopped'
  | 'backup_created'
  | 'backup_restored'
  | 'migration_run'
  | 'cache_cleared'
  // Security
  | 'suspicious_activity'
  | 'rate_limit_exceeded'
  | 'ip_blocked'
  | 'ip_unblocked'
  | 'security_alert'
  // Data access
  | 'data_exported'
  | 'data_imported'
  | 'data_deleted'
  | 'pii_accessed'
  // API
  | 'api_key_created'
  | 'api_key_revoked'
  | 'webhook_created'
  | 'webhook_deleted'
  // Payment
  | 'payment_processed'
  | 'payment_failed'
  | 'subscription_created'
  | 'subscription_cancelled'
  | 'refund_issued';

// Audit severity levels
export type AuditSeverity = 'low' | 'medium' | 'high' | 'critical';

// Audit event status
export type AuditStatus = 'success' | 'failure' | 'pending' | 'partial';

// Actor types
export type ActorType = 'user' | 'admin' | 'system' | 'service' | 'anonymous';

// Actor information
export interface AuditActor {
  type: ActorType;
  id?: string;
  username?: string;
  email?: string;
  ip?: string;
  userAgent?: string;
  sessionId?: string;
  roles?: string[];
}

// Resource that was acted upon
export interface AuditResource {
  type: string;
  id: string;
  name?: string;
  attributes?: Record<string, unknown>;
}

// Location context
export interface AuditLocation {
  ip?: string;
  country?: string;
  region?: string;
  city?: string;
  coordinates?: {
    lat: number;
    lon: number;
  };
}

// Request context
export interface AuditRequestContext {
  requestId?: string;
  method?: string;
  path?: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  duration?: number;
}

// Change tracking
export interface AuditChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  type: 'added' | 'removed' | 'modified';
}

// Main audit event interface
export interface AuditEvent {
  id: string;
  timestamp: Date;
  category: AuditCategory;
  action: AuditAction;
  severity: AuditSeverity;
  status: AuditStatus;
  actor: AuditActor;
  resource?: AuditResource;
  changes?: AuditChange[];
  location?: AuditLocation;
  request?: AuditRequestContext;
  metadata?: Record<string, unknown>;
  message: string;
  details?: string;
  correlationId?: string;
  parentEventId?: string;
  tags?: string[];
}

// Audit event input for creating new events
export interface AuditEventInput {
  category: AuditCategory;
  action: AuditAction;
  severity?: AuditSeverity;
  status?: AuditStatus;
  actor: AuditActor;
  resource?: AuditResource;
  changes?: AuditChange[];
  location?: AuditLocation;
  request?: AuditRequestContext;
  metadata?: Record<string, unknown>;
  message: string;
  details?: string;
  correlationId?: string;
  parentEventId?: string;
  tags?: string[];
}

// Query filters for searching audit logs
export interface AuditQueryFilters {
  startDate?: Date;
  endDate?: Date;
  categories?: AuditCategory[];
  actions?: AuditAction[];
  severities?: AuditSeverity[];
  statuses?: AuditStatus[];
  actorIds?: string[];
  actorTypes?: ActorType[];
  resourceTypes?: string[];
  resourceIds?: string[];
  ips?: string[];
  correlationId?: string;
  tags?: string[];
  searchText?: string;
}

// Query options
export interface AuditQueryOptions {
  limit?: number;
  offset?: number;
  sortField?: keyof AuditEvent;
  sortDirection?: 'asc' | 'desc';
  includeMetadata?: boolean;
}

// Aggregation types
export type AggregationType =
  | 'count'
  | 'count_by_category'
  | 'count_by_action'
  | 'count_by_actor'
  | 'count_by_status'
  | 'count_by_severity'
  | 'timeline';

// Aggregation result
export interface AuditAggregation {
  type: AggregationType;
  filters: AuditQueryFilters;
  results: Record<string, number> | number;
  period?: {
    start: Date;
    end: Date;
    interval: string;
  };
}

// Retention policy
export interface RetentionPolicy {
  id: string;
  name: string;
  enabled: boolean;
  categories?: AuditCategory[];
  severities?: AuditSeverity[];
  retentionDays: number;
  archiveBeforeDelete: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Compliance report types
export type ComplianceReportType =
  | 'gdpr_data_access'
  | 'gdpr_data_deletion'
  | 'security_audit'
  | 'user_activity'
  | 'admin_activity'
  | 'access_log'
  | 'change_log'
  | 'custom';

// Compliance report
export interface ComplianceReport {
  id: string;
  type: ComplianceReportType;
  name: string;
  description?: string;
  filters: AuditQueryFilters;
  generatedAt: Date;
  generatedBy: string;
  eventCount: number;
  format: 'json' | 'csv' | 'pdf';
  status: 'pending' | 'generating' | 'completed' | 'failed';
  fileUrl?: string;
  expiresAt?: Date;
}

// Audit configuration
export interface AuditConfig {
  enabled: boolean;
  retentionDays: number;
  archiveEnabled: boolean;
  archivePath?: string;
  realTimeStream: boolean;
  batchSize: number;
  flushIntervalMs: number;
  excludeCategories?: AuditCategory[];
  excludeActions?: AuditAction[];
  sensitiveFields?: string[];
  hashPII: boolean;
  signEvents: boolean;
}

// Event stream subscriber
export interface AuditSubscriber {
  id: string;
  name: string;
  filter: Partial<AuditQueryFilters>;
  callback: (event: AuditEvent) => void | Promise<void>;
}

// Archive entry
export interface AuditArchive {
  id: string;
  startDate: Date;
  endDate: Date;
  eventCount: number;
  compressedSize: number;
  checksum: string;
  location: string;
  createdAt: Date;
}

// Integrity verification result
export interface IntegrityCheckResult {
  valid: boolean;
  eventId: string;
  timestamp: Date;
  issues?: string[];
}
