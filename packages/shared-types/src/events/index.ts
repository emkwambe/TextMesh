// =================================
// EVENT TYPES FOR KAFKA/PUBSUB
// =================================

export enum EventType {
  // User Events
  USER_CREATED = 'user.created',
  USER_UPDATED = 'user.updated',
  USER_DELETED = 'user.deleted',
  USER_SUSPENDED = 'user.suspended',
  USER_REACTIVATED = 'user.reactivated',

  // Follow Events
  USER_FOLLOWED = 'user.followed',
  USER_UNFOLLOWED = 'user.unfollowed',
  FOLLOW_REQUEST_CREATED = 'follow.request.created',
  FOLLOW_REQUEST_APPROVED = 'follow.request.approved',
  FOLLOW_REQUEST_REJECTED = 'follow.request.rejected',

  // Post Events
  POST_CREATED = 'post.created',
  POST_UPDATED = 'post.updated',
  POST_DELETED = 'post.deleted',
  POST_LIKED = 'post.liked',
  POST_UNLIKED = 'post.unliked',
  POST_REPOSTED = 'post.reposted',
  POST_REPLIED = 'post.replied',

  // Group Events
  GROUP_CREATED = 'group.created',
  GROUP_UPDATED = 'group.updated',
  GROUP_DELETED = 'group.deleted',
  GROUP_MEMBER_JOINED = 'group.member.joined',
  GROUP_MEMBER_LEFT = 'group.member.left',
  GROUP_MEMBER_BANNED = 'group.member.banned',
  GROUP_MEMBER_ROLE_CHANGED = 'group.member.role_changed',
  GROUP_INVITE_SENT = 'group.invite.sent',
  GROUP_JOIN_REQUEST_CREATED = 'group.join_request.created',

  // Notification Events
  NOTIFICATION_CREATED = 'notification.created',
  PUSH_NOTIFICATION_SEND = 'push.notification.send',

  // Report Events
  REPORT_CREATED = 'report.created',
  REPORT_RESOLVED = 'report.resolved',

  // Media Events
  MEDIA_UPLOADED = 'media.uploaded',
  MEDIA_PROCESSED = 'media.processed',
  MEDIA_FAILED = 'media.failed',
  MEDIA_DELETED = 'media.deleted',

  // Compliance Events
  DATA_EXPORT_REQUESTED = 'compliance.export.requested',
  DATA_EXPORT_COMPLETED = 'compliance.export.completed',
  DATA_DELETION_REQUESTED = 'compliance.deletion.requested',
  DATA_DELETION_COMPLETED = 'compliance.deletion.completed',

  // Analytics Events
  ANALYTICS_PAGE_VIEW = 'analytics.page_view',
  ANALYTICS_ACTION = 'analytics.action',

  // Messaging Events
  MESSAGE_SENT = 'message.sent',
  MESSAGE_EDITED = 'message.edited',
  MESSAGE_DELETED = 'message.deleted',
  MESSAGES_READ = 'message.read',
  MESSAGE_READ = 'message.read',
  READ_RECEIPT = 'message.read_receipt',
  MESSAGE_REACTION_ADDED = 'message.reaction_added',
  MESSAGE_REACTION_REMOVED = 'message.reaction_removed',
  CONVERSATION_CREATED = 'conversation.created',
  CONVERSATION_LEFT = 'conversation.left',

  // Notification Events (additional)
  NOTIFICATION_READ = 'notification.read',
  NOTIFICATION_READ_ALL = 'notification.read-all',
}

export interface BaseEvent<T extends EventType, P> {
  id: string;
  type: T;
  payload: P;
  metadata: EventMetadata;
}

export interface EventMetadata {
  timestamp: string;
  version: string;
  source: string;
  correlationId?: string;
  userId?: string;
}

// User Events
export interface UserCreatedPayload {
  userId: string;
  username: string;
  email?: string;
  phone?: string;
  authProvider: string;
}

export interface UserUpdatedPayload {
  userId: string;
  changes: Record<string, unknown>;
}

export interface UserDeletedPayload {
  userId: string;
  reason?: string;
}

// Follow Events
export interface UserFollowedPayload {
  followerId: string;
  followeeId: string;
}

export interface UserUnfollowedPayload {
  followerId: string;
  followeeId: string;
}

// Post Events
export interface PostCreatedPayload {
  postId: string;
  userId: string;
  content: string;
  visibility: string;
  groupId?: string;
  parentId?: string;
  mentions: string[];
  hashtags: string[];
}

export interface PostUpdatedPayload {
  postId: string;
  userId: string;
  content: string;
}

export interface PostDeletedPayload {
  postId: string;
  userId: string;
}

export interface PostLikedPayload {
  postId: string;
  userId: string;
  postAuthorId: string;
}

export interface PostRepostedPayload {
  postId: string;
  userId: string;
  repostId: string;
  postAuthorId: string;
}

export interface PostRepliedPayload {
  postId: string;
  replyId: string;
  userId: string;
  postAuthorId: string;
  content: string;
}

// Group Events
export interface GroupCreatedPayload {
  groupId: string;
  name: string;
  slug: string;
  privacy: string;
  ownerId: string;
}

export interface GroupMemberJoinedPayload {
  groupId: string;
  userId: string;
  role: string;
}

export interface GroupMemberLeftPayload {
  groupId: string;
  userId: string;
}

export interface GroupInviteSentPayload {
  groupId: string;
  groupName: string;
  inviterId: string;
  inviteeId: string;
}

// Notification Events
export interface NotificationCreatedPayload {
  notificationId: string;
  userId: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface PushNotificationPayload {
  userId: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
}

// Report Events
export interface ReportCreatedPayload {
  reportId: string;
  reporterId: string;
  targetType: string;
  targetId: string;
  reason: string;
}

// Media Events
export interface MediaUploadedPayload {
  mediaId: string;
  userId: string;
  type: string;
  url: string;
}

export interface MediaProcessedPayload {
  mediaId: string;
  status: string;
  thumbnailUrl?: string;
  metadata: Record<string, unknown>;
}

// Compliance Events
export interface DataExportRequestedPayload {
  userId: string;
  exportId: string;
  format: string;
}

export interface DataDeletionRequestedPayload {
  userId: string;
  deletionId: string;
  scheduledDate: string;
}

// Event Type Definitions
export type UserCreatedEvent = BaseEvent<EventType.USER_CREATED, UserCreatedPayload>;
export type UserUpdatedEvent = BaseEvent<EventType.USER_UPDATED, UserUpdatedPayload>;
export type UserDeletedEvent = BaseEvent<EventType.USER_DELETED, UserDeletedPayload>;
export type UserFollowedEvent = BaseEvent<EventType.USER_FOLLOWED, UserFollowedPayload>;
export type UserUnfollowedEvent = BaseEvent<EventType.USER_UNFOLLOWED, UserUnfollowedPayload>;
export type PostCreatedEvent = BaseEvent<EventType.POST_CREATED, PostCreatedPayload>;
export type PostUpdatedEvent = BaseEvent<EventType.POST_UPDATED, PostUpdatedPayload>;
export type PostDeletedEvent = BaseEvent<EventType.POST_DELETED, PostDeletedPayload>;
export type PostLikedEvent = BaseEvent<EventType.POST_LIKED, PostLikedPayload>;
export type PostRepostedEvent = BaseEvent<EventType.POST_REPOSTED, PostRepostedPayload>;
export type PostRepliedEvent = BaseEvent<EventType.POST_REPLIED, PostRepliedPayload>;
export type GroupCreatedEvent = BaseEvent<EventType.GROUP_CREATED, GroupCreatedPayload>;
export type GroupMemberJoinedEvent = BaseEvent<EventType.GROUP_MEMBER_JOINED, GroupMemberJoinedPayload>;
export type GroupInviteSentEvent = BaseEvent<EventType.GROUP_INVITE_SENT, GroupInviteSentPayload>;
export type NotificationCreatedEvent = BaseEvent<EventType.NOTIFICATION_CREATED, NotificationCreatedPayload>;
export type PushNotificationEvent = BaseEvent<EventType.PUSH_NOTIFICATION_SEND, PushNotificationPayload>;
export type ReportCreatedEvent = BaseEvent<EventType.REPORT_CREATED, ReportCreatedPayload>;
export type MediaUploadedEvent = BaseEvent<EventType.MEDIA_UPLOADED, MediaUploadedPayload>;
export type MediaProcessedEvent = BaseEvent<EventType.MEDIA_PROCESSED, MediaProcessedPayload>;

export type TextMeshEvent =
  | UserCreatedEvent
  | UserUpdatedEvent
  | UserDeletedEvent
  | UserFollowedEvent
  | UserUnfollowedEvent
  | PostCreatedEvent
  | PostUpdatedEvent
  | PostDeletedEvent
  | PostLikedEvent
  | PostRepostedEvent
  | PostRepliedEvent
  | GroupCreatedEvent
  | GroupMemberJoinedEvent
  | GroupInviteSentEvent
  | NotificationCreatedEvent
  | PushNotificationEvent
  | ReportCreatedEvent
  | MediaUploadedEvent
  | MediaProcessedEvent;

// Event Topics
export const EVENT_TOPICS = {
  USERS: 'textmesh.users',
  POSTS: 'textmesh.posts',
  GROUPS: 'textmesh.groups',
  NOTIFICATIONS: 'textmesh.notifications',
  REPORTS: 'textmesh.reports',
  MEDIA: 'textmesh.media',
  COMPLIANCE: 'textmesh.compliance',
  ANALYTICS: 'textmesh.analytics',
} as const;
