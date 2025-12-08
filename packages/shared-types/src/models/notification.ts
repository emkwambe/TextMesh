// =================================
// NOTIFICATION MODEL TYPES
// =================================

import { NotificationType } from '../common/enums.js';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  payload: NotificationPayload;
  read: boolean;
  readAt: Date | null;
  createdAt: Date;
}

export type NotificationPayload =
  | NewFollowerPayload
  | PostLikePayload
  | PostReplyPayload
  | PostRepostPayload
  | MentionPayload
  | GroupInvitePayload
  | GroupJoinRequestPayload
  | GroupRequestApprovedPayload
  | GroupRequestDeniedPayload;

export interface NewFollowerPayload {
  type: 'new_follower';
  followerId: string;
  followerUsername: string;
  followerDisplayName: string;
  followerAvatarUrl: string | null;
}

export interface PostLikePayload {
  type: 'post_like';
  postId: string;
  postContent: string;
  likerId: string;
  likerUsername: string;
  likerDisplayName: string;
  likerAvatarUrl: string | null;
}

export interface PostReplyPayload {
  type: 'post_reply';
  postId: string;
  postContent: string;
  replyId: string;
  replyContent: string;
  replierId: string;
  replierUsername: string;
  replierDisplayName: string;
  replierAvatarUrl: string | null;
}

export interface PostRepostPayload {
  type: 'post_repost';
  postId: string;
  postContent: string;
  reposterId: string;
  reposterUsername: string;
  reposterDisplayName: string;
  reposterAvatarUrl: string | null;
}

export interface MentionPayload {
  type: 'mention';
  postId: string;
  postContent: string;
  mentionerId: string;
  mentionerUsername: string;
  mentionerDisplayName: string;
  mentionerAvatarUrl: string | null;
}

export interface GroupInvitePayload {
  type: 'group_invite';
  groupId: string;
  groupName: string;
  groupSlug: string;
  inviterId: string;
  inviterUsername: string;
  inviterDisplayName: string;
}

export interface GroupJoinRequestPayload {
  type: 'group_join_request';
  groupId: string;
  groupName: string;
  groupSlug: string;
  requesterId: string;
  requesterUsername: string;
  requesterDisplayName: string;
}

export interface GroupRequestApprovedPayload {
  type: 'group_request_approved';
  groupId: string;
  groupName: string;
  groupSlug: string;
}

export interface GroupRequestDeniedPayload {
  type: 'group_request_denied';
  groupId: string;
  groupName: string;
  groupSlug: string;
}

export interface NotificationPreferences {
  userId: string;
  newFollower: boolean;
  postLike: boolean;
  postReply: boolean;
  postRepost: boolean;
  mention: boolean;
  groupInvite: boolean;
  groupJoinRequest: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  updatedAt: Date;
}

export interface PushToken {
  userId: string;
  token: string;
  platform: 'ios' | 'android' | 'web';
  deviceId: string;
  createdAt: Date;
  updatedAt: Date;
}
