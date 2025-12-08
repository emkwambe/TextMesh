// =================================
// REPORT MODEL TYPES
// =================================

import { ReportTargetType, ReportStatus, ReportReason } from '../common/enums.js';

export interface Report {
  id: string;
  reporterId: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  description: string | null;
  status: ReportStatus;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  resolutionNote: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReportWithDetails extends Report {
  reporter: {
    id: string;
    username: string;
    displayName: string;
  };
  target: ReportTarget;
  resolver?: {
    id: string;
    username: string;
    displayName: string;
  } | null;
}

export type ReportTarget =
  | {
      type: 'user';
      id: string;
      username: string;
      displayName: string;
    }
  | {
      type: 'post';
      id: string;
      content: string;
      authorId: string;
      authorUsername: string;
    }
  | {
      type: 'group';
      id: string;
      name: string;
      ownerId: string;
    };

export interface CreateReportInput {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  description?: string;
}

export interface ResolveReportInput {
  status: ReportStatus.RESOLVED | ReportStatus.DISMISSED;
  resolutionNote?: string;
  action?: ModerationAction;
}

export interface ModerationAction {
  type: 'warn' | 'delete_content' | 'suspend_user' | 'ban_user' | 'delete_group';
  targetId: string;
  duration?: number;
  reason: string;
}

export interface ModerationLog {
  id: string;
  moderatorId: string;
  action: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface ContentFilter {
  id: string;
  pattern: string;
  type: 'keyword' | 'regex' | 'phrase';
  action: 'flag' | 'block' | 'shadow_ban';
  severity: 'low' | 'medium' | 'high';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
