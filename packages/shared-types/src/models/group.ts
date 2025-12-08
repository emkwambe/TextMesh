// =================================
// GROUP MODEL TYPES
// =================================

import { GroupPrivacy, GroupRole, MembershipStatus } from '../common/enums.js';
import { UserProfile } from './user.js';

export interface Group {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  privacy: GroupPrivacy;
  ownerId: string;
  avatarUrl: string | null;
  coverImageUrl: string | null;
  memberCount: number;
  postCount: number;
  rules: string | null;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface GroupWithDetails extends Group {
  owner: UserProfile;
  membership?: GroupMembership | null;
  isMember?: boolean;
  isPendingMember?: boolean;
}

export interface GroupMembership {
  userId: string;
  groupId: string;
  role: GroupRole;
  status: MembershipStatus;
  joinedAt: Date;
  updatedAt: Date;
}

export interface GroupMemberWithUser extends GroupMembership {
  user: UserProfile;
}

export interface GroupInvite {
  id: string;
  groupId: string;
  inviterId: string;
  inviteeId: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateGroupInput {
  name: string;
  slug: string;
  description?: string;
  privacy: GroupPrivacy;
  rules?: string;
}

export interface UpdateGroupInput {
  name?: string;
  description?: string;
  privacy?: GroupPrivacy;
  rules?: string;
  avatarUrl?: string;
  coverImageUrl?: string;
}

export interface GroupSearchResult {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  privacy: GroupPrivacy;
  memberCount: number;
  avatarUrl: string | null;
}

export interface GroupStats {
  totalMembers: number;
  activeMembers: number;
  pendingRequests: number;
  totalPosts: number;
  postsToday: number;
}
