// =================================
// FOLLOW MODEL TYPES
// =================================

import { UserProfile } from './user.js';

export interface Follow {
  followerId: string;
  followeeId: string;
  createdAt: Date;
}

export interface FollowRequest {
  id: string;
  followerId: string;
  followeeId: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
}

export interface FollowWithUser extends Follow {
  follower?: UserProfile;
  followee?: UserProfile;
}

export interface FollowStats {
  followersCount: number;
  followingCount: number;
}

export interface FollowSuggestion {
  user: UserProfile;
  reason: 'mutual_followers' | 'similar_interests' | 'popular' | 'new_user';
  mutualFollowersCount?: number;
}
