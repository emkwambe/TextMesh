// =================================
// API RESPONSE TYPES
// =================================

import { UserProfile, UserSettings, UserSearchResult } from '../models/user.js';
import { PostWithDetails, PostSearchResult, HashtagTrend } from '../models/post.js';
import { GroupWithDetails, GroupMemberWithUser, GroupSearchResult, GroupStats } from '../models/group.js';
import { Notification, NotificationPreferences } from '../models/notification.js';
import { ReportWithDetails } from '../models/report.js';
import { Session, TokenPair } from '../models/session.js';
import { PaginatedResponse } from '../common/pagination.js';

// Base Response
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ResponseMeta;
}

export interface ResponseMeta {
  requestId: string;
  timestamp: string;
  version: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// Auth Responses
export interface AuthResponse {
  user: UserProfile;
  tokens: TokenPair;
  isNewUser: boolean;
}

export interface OTPSentResponse {
  message: string;
  expiresIn: number;
  maskedIdentifier: string;
}

export interface TokenRefreshResponse {
  tokens: TokenPair;
}

// User Responses
export interface UserProfileResponse {
  user: UserProfile;
}

export interface UserSettingsResponse {
  settings: UserSettings;
}

export interface FollowersResponse extends PaginatedResponse<UserProfile> {}

export interface FollowingResponse extends PaginatedResponse<UserProfile> {}

export interface UserSearchResponse extends PaginatedResponse<UserSearchResult> {}

export interface FollowResponse {
  isFollowing: boolean;
  followedAt?: string;
}

export interface BlockResponse {
  isBlocked: boolean;
}

export interface MuteResponse {
  isMuted: boolean;
}

// Post Responses
export interface PostResponse {
  post: PostWithDetails;
}

export interface PostsResponse extends PaginatedResponse<PostWithDetails> {}

export interface FeedResponse extends PaginatedResponse<PostWithDetails> {}

export interface PostSearchResponse extends PaginatedResponse<PostSearchResult> {}

export interface LikeResponse {
  isLiked: boolean;
  likeCount: number;
}

export interface BookmarkResponse {
  isBookmarked: boolean;
}

export interface TrendingHashtagsResponse {
  hashtags: HashtagTrend[];
}

// Group Responses
export interface GroupResponse {
  group: GroupWithDetails;
}

export interface GroupsResponse extends PaginatedResponse<GroupWithDetails> {}

export interface GroupMembersResponse extends PaginatedResponse<GroupMemberWithUser> {}

export interface GroupSearchResponse extends PaginatedResponse<GroupSearchResult> {}

export interface GroupStatsResponse {
  stats: GroupStats;
}

export interface JoinGroupResponse {
  status: 'joined' | 'pending' | 'already_member';
  membership?: {
    role: string;
    joinedAt: string;
  };
}

export interface LeaveGroupResponse {
  success: boolean;
}

// Notification Responses
export interface NotificationsResponse extends PaginatedResponse<Notification> {
  unreadCount: number;
}

export interface NotificationPreferencesResponse {
  preferences: NotificationPreferences;
}

export interface MarkReadResponse {
  success: boolean;
  readCount: number;
}

// Report/Moderation Responses
export interface ReportResponse {
  report: ReportWithDetails;
}

export interface ReportsResponse extends PaginatedResponse<ReportWithDetails> {}

// Session Responses
export interface SessionsResponse {
  sessions: Session[];
  currentSessionId: string;
}

// Search Responses
export interface GlobalSearchResponse {
  users: PaginatedResponse<UserSearchResult>;
  posts: PaginatedResponse<PostSearchResult>;
  groups: PaginatedResponse<GroupSearchResult>;
  hashtags: string[];
}

// Media Responses
export interface UploadUrlResponse {
  uploadId: string;
  uploadUrl: string;
  expiresAt: string;
  fields?: Record<string, string>;
}

export interface UploadCompleteResponse {
  mediaId: string;
  url: string;
  thumbnailUrl?: string;
  status: string;
}

// Compliance Responses
export interface DataExportResponse {
  exportId: string;
  status: 'pending' | 'processing' | 'ready' | 'expired';
  downloadUrl?: string;
  expiresAt?: string;
}

export interface DeleteAccountResponse {
  success: boolean;
  scheduledDeletionDate: string;
  message: string;
}

// Health Check Response
export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  services: {
    name: string;
    status: 'up' | 'down';
    latency?: number;
  }[];
}
