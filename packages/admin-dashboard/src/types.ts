export interface AdminUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  passwordHash: string;
  role: AdminRole;
  permissions: Permission[];
  mfaEnabled: boolean;
  mfaSecret?: string;
  lastLoginAt?: Date;
  lastLoginIp?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
}

export type AdminRole =
  | 'super_admin'
  | 'admin'
  | 'moderator'
  | 'support'
  | 'analyst'
  | 'viewer';

export type Permission =
  | 'users:read'
  | 'users:write'
  | 'users:delete'
  | 'users:ban'
  | 'content:read'
  | 'content:write'
  | 'content:delete'
  | 'content:moderate'
  | 'reports:read'
  | 'reports:resolve'
  | 'analytics:read'
  | 'analytics:export'
  | 'settings:read'
  | 'settings:write'
  | 'admin:read'
  | 'admin:write'
  | 'admin:delete'
  | 'audit:read'
  | 'system:read'
  | 'system:write';

export interface AdminSession {
  id: string;
  adminId: string;
  token: string;
  ipAddress: string;
  userAgent: string;
  createdAt: Date;
  expiresAt: Date;
  lastActivityAt: Date;
  isActive: boolean;
}

export interface DashboardStats {
  users: UserStats;
  content: ContentStats;
  engagement: EngagementStats;
  reports: ReportStats;
  system: SystemStats;
  period: string;
  generatedAt: Date;
}

export interface UserStats {
  total: number;
  active: number;
  new: number;
  banned: number;
  suspended: number;
  verified: number;
  growth: number;
  retention: number;
  churn: number;
  byCountry: Record<string, number>;
  byPlatform: Record<string, number>;
}

export interface ContentStats {
  totalPosts: number;
  newPosts: number;
  totalComments: number;
  newComments: number;
  totalMedia: number;
  moderatedContent: number;
  removedContent: number;
  averagePostsPerUser: number;
  topHashtags: Array<{ tag: string; count: number }>;
}

export interface EngagementStats {
  totalLikes: number;
  totalShares: number;
  totalFollows: number;
  averageSessionDuration: number;
  dailyActiveUsers: number;
  weeklyActiveUsers: number;
  monthlyActiveUsers: number;
  engagementRate: number;
  peakHours: number[];
}

export interface ReportStats {
  total: number;
  pending: number;
  resolved: number;
  escalated: number;
  byReason: Record<string, number>;
  averageResolutionTime: number;
  falsePositiveRate: number;
}

export interface SystemStats {
  uptime: number;
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  requestsPerSecond: number;
  averageLatency: number;
  errorRate: number;
  activeConnections: number;
}

export interface AdminAction {
  id: string;
  adminId: string;
  adminUsername: string;
  action: AdminActionType;
  targetType: TargetType;
  targetId: string;
  details: Record<string, unknown>;
  reason?: string;
  ipAddress: string;
  userAgent: string;
  createdAt: Date;
}

export type AdminActionType =
  | 'user_ban'
  | 'user_unban'
  | 'user_suspend'
  | 'user_unsuspend'
  | 'user_verify'
  | 'user_unverify'
  | 'user_delete'
  | 'user_role_change'
  | 'content_remove'
  | 'content_restore'
  | 'content_flag'
  | 'content_unflag'
  | 'report_resolve'
  | 'report_escalate'
  | 'report_dismiss'
  | 'settings_update'
  | 'admin_create'
  | 'admin_update'
  | 'admin_delete'
  | 'system_config';

export type TargetType = 'user' | 'content' | 'report' | 'admin' | 'system';

export interface UserManagement {
  id: string;
  username: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  status: UserStatus;
  role: string;
  verified: boolean;
  trustScore: number;
  postsCount: number;
  followersCount: number;
  reportsAgainst: number;
  createdAt: Date;
  lastActiveAt?: Date;
  banHistory: BanRecord[];
}

export type UserStatus = 'active' | 'suspended' | 'banned' | 'deleted';

export interface BanRecord {
  id: string;
  adminId: string;
  reason: string;
  duration?: number;
  startedAt: Date;
  endsAt?: Date;
  liftedAt?: Date;
  liftedBy?: string;
  isPermanent: boolean;
}

export interface ContentItem {
  id: string;
  type: 'post' | 'comment' | 'media';
  authorId: string;
  authorUsername: string;
  content: string;
  mediaUrls?: string[];
  status: ContentStatus;
  visibility: string;
  likesCount: number;
  commentsCount: number;
  reportsCount: number;
  flags: ContentFlag[];
  createdAt: Date;
  moderatedAt?: Date;
  moderatedBy?: string;
}

export type ContentStatus = 'active' | 'hidden' | 'removed' | 'flagged';

export interface ContentFlag {
  type: string;
  reason: string;
  confidence?: number;
  detectedAt: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
}

export interface Report {
  id: string;
  reporterId: string;
  reporterUsername: string;
  targetType: 'user' | 'post' | 'comment';
  targetId: string;
  reason: ReportReason;
  description?: string;
  evidence?: string[];
  status: ReportStatus;
  priority: ReportPriority;
  assignedTo?: string;
  resolution?: ReportResolution;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
}

export type ReportReason =
  | 'spam'
  | 'harassment'
  | 'hate_speech'
  | 'violence'
  | 'nudity'
  | 'misinformation'
  | 'copyright'
  | 'impersonation'
  | 'self_harm'
  | 'illegal'
  | 'other';

export type ReportStatus = 'pending' | 'under_review' | 'resolved' | 'escalated';
export type ReportPriority = 'low' | 'medium' | 'high' | 'critical';

export interface ReportResolution {
  action: 'dismissed' | 'warning' | 'content_removed' | 'user_suspended' | 'user_banned';
  notes?: string;
  resolvedBy: string;
  resolvedAt: Date;
}

export interface SystemConfig {
  key: string;
  value: unknown;
  type: 'string' | 'number' | 'boolean' | 'json';
  category: string;
  description: string;
  isSecret: boolean;
  updatedAt: Date;
  updatedBy?: string;
}

export interface AnnouncementBanner {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  targetAudience: 'all' | 'new_users' | 'verified' | 'specific';
  targetUserIds?: string[];
  actionUrl?: string;
  actionText?: string;
  startDate: Date;
  endDate?: Date;
  isActive: boolean;
  dismissible: boolean;
  createdBy: string;
  createdAt: Date;
}
