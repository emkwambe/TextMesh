// =================================
// COMMON ENUMS
// =================================

export enum PostVisibility {
  PUBLIC = 'public',
  FOLLOWERS = 'followers',
  GROUP = 'group',
}

export enum GroupPrivacy {
  PUBLIC = 'public',
  PRIVATE = 'private',
  SECRET = 'secret',
}

export enum GroupRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member',
}

export enum MembershipStatus {
  ACTIVE = 'active',
  PENDING = 'pending',
  BANNED = 'banned',
}

export enum NotificationType {
  NEW_FOLLOWER = 'new_follower',
  POST_LIKE = 'post_like',
  POST_REPLY = 'post_reply',
  POST_REPOST = 'post_repost',
  MENTION = 'mention',
  GROUP_INVITE = 'group_invite',
  GROUP_JOIN_REQUEST = 'group_join_request',
  GROUP_REQUEST_APPROVED = 'group_request_approved',
  GROUP_REQUEST_DENIED = 'group_request_denied',
}

export enum ReportTargetType {
  USER = 'user',
  POST = 'post',
  GROUP = 'group',
}

export enum ReportStatus {
  OPEN = 'open',
  IN_REVIEW = 'in_review',
  RESOLVED = 'resolved',
  DISMISSED = 'dismissed',
}

export enum ReportReason {
  SPAM = 'spam',
  HARASSMENT = 'harassment',
  HATE_SPEECH = 'hate_speech',
  VIOLENCE = 'violence',
  MISINFORMATION = 'misinformation',
  NUDITY = 'nudity',
  SELF_HARM = 'self_harm',
  IMPERSONATION = 'impersonation',
  COPYRIGHT = 'copyright',
  OTHER = 'other',
}

export enum MediaType {
  IMAGE = 'image',
  VIDEO = 'video',
}

export enum AuthProvider {
  EMAIL = 'email',
  PHONE = 'phone',
  GOOGLE = 'google',
  APPLE = 'apple',
}

export enum AccountStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  DEACTIVATED = 'deactivated',
  DELETED = 'deleted',
}

export enum UserRole {
  USER = 'user',
  MODERATOR = 'moderator',
  ADMIN = 'admin',
}

export enum AuditAction {
  USER_CREATED = 'user_created',
  USER_UPDATED = 'user_updated',
  USER_DELETED = 'user_deleted',
  USER_SUSPENDED = 'user_suspended',
  POST_CREATED = 'post_created',
  POST_UPDATED = 'post_updated',
  POST_DELETED = 'post_deleted',
  GROUP_CREATED = 'group_created',
  GROUP_UPDATED = 'group_updated',
  GROUP_DELETED = 'group_deleted',
  REPORT_CREATED = 'report_created',
  REPORT_RESOLVED = 'report_resolved',
  LOGIN = 'login',
  LOGOUT = 'logout',
  PASSWORD_CHANGED = 'password_changed',
  DATA_EXPORT_REQUESTED = 'data_export_requested',
  DATA_DELETION_REQUESTED = 'data_deletion_requested',
}
