// =================================
// API REQUEST TYPES
// =================================

import { PostVisibility, GroupPrivacy, ReportReason, ReportTargetType } from '../common/enums.js';

// Auth Requests
export interface SignupRequest {
  email?: string;
  phone?: string;
  username: string;
  displayName: string;
  dateOfBirth: string;
}

export interface LoginRequest {
  email?: string;
  phone?: string;
}

export interface VerifyOTPRequest {
  identifier: string;
  code: string;
  deviceInfo?: {
    deviceId: string;
    deviceType: string;
    deviceName?: string;
    osVersion?: string;
    appVersion?: string;
  };
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface OAuthLoginRequest {
  provider: 'google' | 'apple';
  idToken: string;
  deviceInfo?: {
    deviceId: string;
    deviceType: string;
    deviceName?: string;
    osVersion?: string;
    appVersion?: string;
  };
}

// User Requests
export interface UpdateProfileRequest {
  displayName?: string;
  bio?: string;
  location?: string;
  website?: string;
  isPrivate?: boolean;
}

export interface UpdateSettingsRequest {
  emailNotifications?: boolean;
  pushNotifications?: boolean;
  smsNotifications?: boolean;
  privateAccount?: boolean;
  showOnlineStatus?: boolean;
  allowMentions?: 'everyone' | 'followers' | 'none';
  allowDirectMessages?: 'everyone' | 'followers' | 'none';
  language?: string;
  timezone?: string;
  theme?: 'light' | 'dark' | 'system';
  doNotSellData?: boolean;
}

export interface ChangeUsernameRequest {
  username: string;
}

// Post Requests
export interface CreatePostRequest {
  content: string;
  visibility?: PostVisibility;
  groupId?: string;
  parentId?: string;
  repostId?: string;
  mediaIds?: string[];
}

export interface UpdatePostRequest {
  content: string;
}

// Group Requests
export interface CreateGroupRequest {
  name: string;
  slug: string;
  description?: string;
  privacy: GroupPrivacy;
  rules?: string;
}

export interface UpdateGroupRequest {
  name?: string;
  description?: string;
  privacy?: GroupPrivacy;
  rules?: string;
}

export interface InviteToGroupRequest {
  userIds: string[];
}

export interface UpdateMemberRoleRequest {
  role: 'admin' | 'member';
}

// Report Requests
export interface CreateReportRequest {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  description?: string;
}

export interface ResolveReportRequest {
  status: 'resolved' | 'dismissed';
  resolutionNote?: string;
  action?: {
    type: 'warn' | 'delete_content' | 'suspend_user' | 'ban_user' | 'delete_group';
    duration?: number;
    reason: string;
  };
}

// Notification Requests
export interface RegisterPushTokenRequest {
  token: string;
  platform: 'ios' | 'android' | 'web';
  deviceId: string;
}

export interface UpdateNotificationPreferencesRequest {
  newFollower?: boolean;
  postLike?: boolean;
  postReply?: boolean;
  postRepost?: boolean;
  mention?: boolean;
  groupInvite?: boolean;
  groupJoinRequest?: boolean;
  pushEnabled?: boolean;
  emailEnabled?: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
}

// Search Requests
export interface SearchRequest {
  query: string;
  type?: 'all' | 'users' | 'posts' | 'groups' | 'hashtags';
  cursor?: string;
  limit?: number;
}

// Media Requests
export interface RequestUploadRequest {
  filename: string;
  mimeType: string;
  size: number;
  type: 'image' | 'video';
}

export interface CompleteUploadRequest {
  uploadId: string;
}

// Compliance Requests
export interface DataExportRequest {
  format: 'json' | 'zip';
}

export interface DeleteAccountRequest {
  confirmation: string;
  reason?: string;
}
