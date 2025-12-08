/**
 * TextMesh API Client Types
 */

// ============================================================
// Core Types
// ============================================================

export interface TextMeshConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
  retries?: number;
  onTokenRefresh?: (tokens: AuthTokens) => void;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface ApiResponse<T> {
  data: T;
  meta?: {
    cursor?: string;
    hasMore?: boolean;
    total?: number;
  };
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  statusCode: number;
}

export interface PaginationParams {
  limit?: number;
  cursor?: string;
}

// ============================================================
// User Types
// ============================================================

export interface User {
  id: string;
  username: string;
  displayName: string;
  bio?: string;
  avatar?: string;
  coverImage?: string;
  location?: string;
  website?: string;
  verified: boolean;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile extends User {
  isFollowing?: boolean;
  isFollowedBy?: boolean;
  isMuted?: boolean;
  isBlocked?: boolean;
}

export interface UserSettings {
  notifications: {
    likes: boolean;
    replies: boolean;
    follows: boolean;
    mentions: boolean;
    directMessages: boolean;
    email: boolean;
    push: boolean;
  };
  privacy: {
    profileVisibility: 'public' | 'private';
    allowDMs: 'everyone' | 'followers' | 'none';
    showActivity: boolean;
  };
  preferences: {
    theme: 'light' | 'dark' | 'system';
    language: string;
    timezone: string;
  };
}

export interface UpdateUserInput {
  displayName?: string;
  bio?: string;
  location?: string;
  website?: string;
  avatar?: string;
  coverImage?: string;
}

// ============================================================
// Post Types
// ============================================================

export interface Post {
  id: string;
  content: string;
  author: User;
  styling?: PostStyling;
  visibility: 'public' | 'followers' | 'private';
  likesCount: number;
  repliesCount: number;
  repostsCount: number;
  bookmarksCount: number;
  isLiked?: boolean;
  isReposted?: boolean;
  isBookmarked?: boolean;
  parentId?: string;
  parent?: Post;
  repostedPost?: Post;
  quotedPost?: Post;
  mentions: string[];
  hashtags: string[];
  media?: PostMedia[];
  poll?: Poll;
  createdAt: string;
  updatedAt: string;
}

export interface PostStyling {
  template?: string;
  backgroundColor?: string;
  textColor?: string;
  fontSize?: 'small' | 'medium' | 'large';
  fontFamily?: string;
  gradient?: string[];
}

export interface PostMedia {
  id: string;
  type: 'image' | 'video' | 'gif';
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  duration?: number;
  altText?: string;
}

export interface Poll {
  id: string;
  question: string;
  options: PollOption[];
  endsAt: string;
  totalVotes: number;
  votedOptionId?: string;
}

export interface PollOption {
  id: string;
  text: string;
  votes: number;
  percentage: number;
}

export interface CreatePostInput {
  content: string;
  visibility?: 'public' | 'followers' | 'private';
  styling?: PostStyling;
  replyTo?: string;
  quotedPostId?: string;
  media?: string[];
  poll?: CreatePollInput;
}

export interface CreatePollInput {
  question: string;
  options: string[];
  duration: number; // hours
}

// ============================================================
// Feed Types
// ============================================================

export type FeedType = 'for-you' | 'following' | 'trending';

export interface FeedParams extends PaginationParams {
  type?: FeedType;
  filter?: 'all' | 'media' | 'text';
}

export interface FeedResponse {
  posts: Post[];
  cursor?: string;
  hasMore: boolean;
}

// ============================================================
// Notification Types
// ============================================================

export type NotificationType =
  | 'like'
  | 'reply'
  | 'repost'
  | 'follow'
  | 'mention'
  | 'quote'
  | 'poll_ended'
  | 'system';

export interface Notification {
  id: string;
  type: NotificationType;
  read: boolean;
  actor?: User;
  post?: Post;
  message?: string;
  createdAt: string;
}

export interface NotificationSettings {
  likes: boolean;
  replies: boolean;
  reposts: boolean;
  follows: boolean;
  mentions: boolean;
  quotes: boolean;
  directMessages: boolean;
}

// ============================================================
// Search Types
// ============================================================

export type SearchType = 'all' | 'posts' | 'users' | 'hashtags';

export interface SearchParams extends PaginationParams {
  query: string;
  type?: SearchType;
  sort?: 'relevance' | 'recent' | 'popular';
  from?: string;
  to?: string;
}

export interface SearchResults {
  posts?: Post[];
  users?: User[];
  hashtags?: HashtagResult[];
  cursor?: string;
  hasMore: boolean;
}

export interface HashtagResult {
  name: string;
  postsCount: number;
  trending: boolean;
}

// ============================================================
// Auth Types
// ============================================================

export interface LoginInput {
  email: string;
  password: string;
}

export interface SignupInput {
  email: string;
  password: string;
  username: string;
  displayName: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface PasswordResetInput {
  email: string;
}

export interface PasswordUpdateInput {
  token: string;
  password: string;
}

// ============================================================
// Conversation Types
// ============================================================

export interface Conversation {
  id: string;
  participants: User[];
  lastMessage?: DirectMessage;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DirectMessage {
  id: string;
  conversationId: string;
  sender: User;
  content: string;
  read: boolean;
  createdAt: string;
}

export interface SendMessageInput {
  conversationId: string;
  content: string;
}

// ============================================================
// Group Types
// ============================================================

export interface Group {
  id: string;
  name: string;
  description?: string;
  avatar?: string;
  coverImage?: string;
  visibility: 'public' | 'private';
  membersCount: number;
  postsCount: number;
  owner: User;
  isMember?: boolean;
  createdAt: string;
}

export interface GroupMember {
  user: User;
  role: 'owner' | 'admin' | 'moderator' | 'member';
  joinedAt: string;
}
