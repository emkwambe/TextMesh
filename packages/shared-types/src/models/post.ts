// =================================
// POST MODEL TYPES
// =================================

import { PostVisibility } from '../common/enums.js';
import { UserProfile } from './user.js';
import { Media } from './media.js';

export interface Post {
  id: string;
  userId: string;
  content: string;
  visibility: PostVisibility;
  groupId: string | null;
  parentId: string | null;
  repostId: string | null;
  likeCount: number;
  replyCount: number;
  repostCount: number;
  viewCount: number;
  isEdited: boolean;
  editedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PostWithDetails extends Post {
  user: UserProfile;
  group?: {
    id: string;
    name: string;
    slug: string;
  } | null;
  parent?: PostWithDetails | null;
  repost?: PostWithDetails | null;
  media?: Media[];
  isLiked?: boolean;
  isReposted?: boolean;
  isBookmarked?: boolean;
}

export interface PostLike {
  userId: string;
  postId: string;
  createdAt: Date;
}

export interface PostBookmark {
  userId: string;
  postId: string;
  createdAt: Date;
}

export interface CreatePostInput {
  content: string;
  visibility?: PostVisibility;
  groupId?: string;
  parentId?: string;
  repostId?: string;
  mediaIds?: string[];
}

export interface UpdatePostInput {
  content: string;
}

export interface PostSearchResult {
  id: string;
  content: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  likeCount: number;
  replyCount: number;
  createdAt: Date;
}

export interface HashtagTrend {
  hashtag: string;
  postCount: number;
  trend: 'rising' | 'stable' | 'falling';
}

export const POST_MAX_LENGTH = 1000;
export const POST_EDIT_WINDOW_MINUTES = 5;
