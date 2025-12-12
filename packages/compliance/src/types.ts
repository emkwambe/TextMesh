// Immutable Audit Trail
export interface AuditEntry {
  id: string;
  timestamp: Date;
  action: AuditAction;
  actorType: 'user' | 'admin' | 'system' | 'algorithm';
  actorId: string;
  targetType: 'user' | 'content' | 'account' | 'setting' | 'system';
  targetId: string;
  details: Record<string, unknown>;
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
  hash: string; // Chain hash for tamper detection
  previousHash: string;
}

export type AuditAction =
  // Content moderation
  | 'content_created'
  | 'content_updated'
  | 'content_deleted'
  | 'content_hidden'
  | 'content_restored'
  | 'content_flagged'
  | 'content_reported'
  // User actions
  | 'user_registered'
  | 'user_verified'
  | 'user_suspended'
  | 'user_banned'
  | 'user_reinstated'
  | 'user_deleted'
  | 'user_data_exported'
  | 'user_data_deleted'
  // Account settings
  | 'privacy_settings_changed'
  | 'notification_settings_changed'
  | 'security_settings_changed'
  // Algorithm actions
  | 'content_ranked'
  | 'content_demoted'
  | 'content_promoted'
  | 'feed_generated'
  | 'recommendation_made'
  // Admin actions
  | 'admin_action'
  | 'policy_updated'
  | 'feature_toggled';

// Algorithmic Transparency
export interface AlgorithmicDecision {
  id: string;
  timestamp: Date;
  algorithm: AlgorithmType;
  targetType: 'content' | 'user' | 'feed';
  targetId: string;
  decision: string;
  factors: AlgorithmFactor[];
  confidence: number;
  explanation: string;
  userVisible: boolean;
  appealable: boolean;
}

export type AlgorithmType =
  | 'content_ranking'
  | 'feed_curation'
  | 'recommendation'
  | 'moderation'
  | 'spam_detection'
  | 'toxicity_detection'
  | 'trend_detection';

export interface AlgorithmFactor {
  name: string;
  weight: number;
  value: number;
  contribution: number; // How much this factor contributed to decision
  humanReadable: string;
}

export interface TransparencyReport {
  userId: string;
  period: string; // YYYY-MM
  generatedAt: Date;
  contentDecisions: {
    total: number;
    promoted: number;
    demoted: number;
    hidden: number;
  };
  feedStats: {
    totalItems: number;
    fromFollowing: number;
    fromRecommendations: number;
    fromTrending: number;
  };
  algorithmExposure: Record<AlgorithmType, number>;
}

// GDPR++ Data Management
export interface DataSubjectRequest {
  id: string;
  userId: string;
  type: DataRequestType;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'verified';
  requestedAt: Date;
  completedAt?: Date;
  verificationMethod?: string;
  dataPackageUrl?: string;
  deletionConfirmation?: DeletionConfirmation;
  expiresAt?: Date;
}

export type DataRequestType =
  | 'access' // Right to access
  | 'portability' // Right to data portability
  | 'rectification' // Right to rectification
  | 'erasure' // Right to be forgotten
  | 'restriction' // Right to restrict processing
  | 'objection'; // Right to object

export interface DeletionConfirmation {
  deletedAt: Date;
  deletedBy: string;
  dataTypes: string[];
  retainedData?: {
    type: string;
    reason: string;
    retentionPeriod: string;
  }[];
  thirdPartyNotified: boolean;
  verificationHash: string;
}

export interface DataInventory {
  userId: string;
  generatedAt: Date;
  categories: DataCategory[];
  totalSize: number;
  retentionPolicies: RetentionPolicy[];
}

export interface DataCategory {
  name: string;
  description: string;
  dataPoints: number;
  size: number;
  sources: string[];
  purposes: string[];
  legalBasis: string;
  retention: string;
  sharedWith: string[];
}

export interface RetentionPolicy {
  dataType: string;
  retentionPeriod: string;
  deletionMethod: string;
  legalBasis: string;
}

// Age-Appropriate Defaults
export interface AgeGroup {
  name: string;
  minAge: number;
  maxAge: number;
  defaults: AgeAppropriateDefaults;
  restrictions: string[];
}

export interface AgeAppropriateDefaults {
  privateAccount: boolean;
  dmRestriction: 'none' | 'followers' | 'disabled';
  contentFilter: 'off' | 'standard' | 'strict';
  dataCollection: 'full' | 'limited' | 'minimal';
  adPersonalization: boolean;
  locationSharing: boolean;
  searchable: boolean;
}

// Regulator Dashboard
export interface RegulatorMetrics {
  period: string;
  generatedAt: Date;
  userMetrics: {
    totalUsers: number;
    activeUsers: number;
    newUsers: number;
    deletedAccounts: number;
    suspendedAccounts: number;
  };
  contentMetrics: {
    totalContent: number;
    contentRemoved: number;
    contentFlagged: number;
    removalReasons: Record<string, number>;
    averageRemovalTime: number;
  };
  dataRequestMetrics: {
    accessRequests: number;
    deletionRequests: number;
    averageCompletionTime: number;
    completionRate: number;
  };
  safetyMetrics: {
    reportsReceived: number;
    reportsActioned: number;
    falsePositiveRate: number;
    appealRate: number;
    appealSuccessRate: number;
  };
  algorithmMetrics: {
    decisionsTotal: number;
    decisionsByType: Record<string, number>;
    appealedDecisions: number;
    overturnedDecisions: number;
  };
}

export interface ComplianceAlert {
  id: string;
  type: AlertType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  details: Record<string, unknown>;
  createdAt: Date;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
}

export type AlertType =
  | 'data_breach_suspected'
  | 'unusual_deletion_volume'
  | 'sla_breach_imminent'
  | 'audit_anomaly'
  | 'algorithm_drift'
  | 'compliance_deadline';
