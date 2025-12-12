export interface ModerationRule {
  id: string;
  name: string;
  description: string;
  type: RuleType;
  conditions: RuleCondition[];
  actions: RuleAction[];
  priority: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export type RuleType =
  | 'content'
  | 'user'
  | 'spam'
  | 'harassment'
  | 'nsfw'
  | 'custom';

export interface RuleCondition {
  field: string;
  operator: ConditionOperator;
  value: unknown;
  caseSensitive?: boolean;
}

export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'matches_regex'
  | 'greater_than'
  | 'less_than'
  | 'in'
  | 'not_in';

export interface RuleAction {
  type: ActionType;
  params?: Record<string, unknown>;
}

export type ActionType =
  | 'flag'
  | 'hide'
  | 'remove'
  | 'quarantine'
  | 'notify_moderator'
  | 'warn_user'
  | 'mute_user'
  | 'suspend_user'
  | 'ban_user'
  | 'add_label'
  | 'shadow_ban'
  | 'rate_limit';

export interface ModerationQueue {
  id: string;
  name: string;
  type: QueueType;
  filters: QueueFilter[];
  assignees: string[];
  priority: number;
  createdAt: Date;
}

export type QueueType = 'manual' | 'automated' | 'escalated' | 'appeals';

export interface QueueFilter {
  field: string;
  operator: ConditionOperator;
  value: unknown;
}

export interface ModerationItem {
  id: string;
  queueId: string;
  contentType: 'post' | 'comment' | 'user' | 'media';
  contentId: string;
  userId: string;
  reason: string;
  source: ModerationSource;
  priority: ItemPriority;
  status: ItemStatus;
  flags: string[];
  context: ModerationContext;
  assignedTo?: string;
  reviewedBy?: string;
  decision?: ModerationDecision;
  createdAt: Date;
  updatedAt: Date;
  reviewedAt?: Date;
}

export type ModerationSource = 'automated' | 'user_report' | 'manual' | 'appeal';
export type ItemPriority = 'low' | 'medium' | 'high' | 'critical';
export type ItemStatus = 'pending' | 'in_review' | 'completed' | 'escalated';

export interface ModerationContext {
  content?: string;
  mediaUrls?: string[];
  userHistory?: UserModerationHistory;
  relatedItems?: string[];
  mlScores?: Record<string, number>;
}

export interface UserModerationHistory {
  totalWarnings: number;
  totalMutes: number;
  totalSuspensions: number;
  totalBans: number;
  recentViolations: Violation[];
  trustScore: number;
}

export interface Violation {
  type: string;
  severity: 'minor' | 'moderate' | 'severe';
  date: Date;
  action: string;
}

export interface ModerationDecision {
  action: ActionType;
  reason: string;
  notes?: string;
  appealable: boolean;
  expiresAt?: Date;
}

export interface Appeal {
  id: string;
  moderationItemId: string;
  userId: string;
  reason: string;
  evidence?: string[];
  status: AppealStatus;
  reviewedBy?: string;
  decision?: AppealDecision;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
}

export type AppealStatus = 'pending' | 'under_review' | 'approved' | 'denied';

export interface AppealDecision {
  outcome: 'upheld' | 'overturned' | 'modified';
  newAction?: ActionType;
  reason: string;
  reviewedBy: string;
  reviewedAt: Date;
}

export interface WordFilter {
  id: string;
  word: string;
  type: FilterType;
  action: ActionType;
  severity: 'low' | 'medium' | 'high';
  isRegex: boolean;
  caseSensitive: boolean;
  contexts: string[];
  createdAt: Date;
  createdBy: string;
}

export type FilterType = 'block' | 'flag' | 'replace';

export interface ModerationStats {
  period: string;
  itemsReviewed: number;
  itemsApproved: number;
  itemsRemoved: number;
  itemsEscalated: number;
  averageReviewTime: number;
  byModerator: Record<string, ModeratorStats>;
  byReason: Record<string, number>;
  bySource: Record<string, number>;
  appealStats: {
    total: number;
    approved: number;
    denied: number;
    pending: number;
  };
}

export interface ModeratorStats {
  itemsReviewed: number;
  averageReviewTime: number;
  accuracy: number;
  appealOverturns: number;
}

export interface BulkAction {
  id: string;
  type: ActionType;
  targetIds: string[];
  targetType: 'content' | 'user';
  reason: string;
  executedBy: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress: {
    total: number;
    completed: number;
    failed: number;
  };
  createdAt: Date;
  completedAt?: Date;
}

export interface AutoModConfig {
  enabled: boolean;
  sensitivity: 'low' | 'medium' | 'high';
  actions: {
    spam: ActionType;
    harassment: ActionType;
    nsfw: ActionType;
    violence: ActionType;
    hate_speech: ActionType;
  };
  thresholds: {
    spam: number;
    harassment: number;
    nsfw: number;
    violence: number;
    hate_speech: number;
  };
  exemptions: {
    verifiedUsers: boolean;
    trustedUsers: boolean;
    minTrustScore: number;
  };
}
