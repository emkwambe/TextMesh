// =================================
// USER MODEL TYPES
// =================================

import { AccountStatus, AuthProvider, UserRole } from '../common/enums.js';

export interface User {
  id: string;
  username: string;
  email: string | null;
  phone: string | null;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  coverImageUrl: string | null;
  authProvider: AuthProvider;
  status: AccountStatus;
  role: UserRole;
  followerCount: number;
  followingCount: number;
  postCount: number;
  isVerified: boolean;
  isPrivate: boolean;
  dateOfBirth: Date | null;
  location: string | null;
  website: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  coverImageUrl: string | null;
  followerCount: number;
  followingCount: number;
  postCount: number;
  isVerified: boolean;
  isPrivate: boolean;
  location: string | null;
  website: string | null;
  isFollowing?: boolean;
  isFollowedBy?: boolean;
  isBlocked?: boolean;
  isMuted?: boolean;
  createdAt: Date;
}

export interface UserSettings {
  userId: string;
  emailNotifications: boolean;
  pushNotifications: boolean;
  smsNotifications: boolean;
  privateAccount: boolean;
  showOnlineStatus: boolean;
  allowMentions: 'everyone' | 'followers' | 'none';
  allowDirectMessages: 'everyone' | 'followers' | 'none';
  language: string;
  timezone: string;
  theme: 'light' | 'dark' | 'system';
  doNotSellData: boolean;
  dataExportRequested: boolean;
  deletionRequested: boolean;
  updatedAt: Date;
}

export interface UserBlock {
  blockerId: string;
  blockedId: string;
  createdAt: Date;
}

export interface UserMute {
  muterId: string;
  mutedId: string;
  createdAt: Date;
}

export interface CreateUserInput {
  username: string;
  email?: string;
  phone?: string;
  displayName: string;
  authProvider: AuthProvider;
  dateOfBirth?: Date;
}

export interface UpdateUserInput {
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  coverImageUrl?: string;
  location?: string;
  website?: string;
  isPrivate?: boolean;
}

export interface UserSearchResult {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  isVerified: boolean;
  followerCount: number;
}
