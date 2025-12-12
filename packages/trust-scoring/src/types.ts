/**
 * Trust Scoring Types
 */

export type TrustTier = 'new' | 'low' | 'medium' | 'high' | 'verified' | 'trusted';

export interface TrustScore {
  userId: string;
  score: number; // 0-100
  tier: TrustTier;
  factors: TrustFactors;
  history: TrustHistoryEntry[];
  updatedAt: Date;
  createdAt: Date;
}

export interface TrustFactors {
  accountAge: TrustFactor;
  verification: TrustFactor;
  activity: TrustFactor;
  contentQuality: TrustFactor;
  socialConnections: TrustFactor;
  moderation: TrustFactor;
  engagement: TrustFactor;
}

export interface TrustFactor {
  name: string;
  value: number; // 0-100
  weight: number;
  details: Record<string, unknown>;
}

export interface TrustHistoryEntry {
  timestamp: Date;
  score: number;
  tier: TrustTier;
  reason: string;
  delta: number;
}

export interface UserActivityMetrics {
  totalPosts: number;
  totalComments: number;
  totalLikes: number;
  totalFollowers: number;
  totalFollowing: number;
  postsLast30Days: number;
  commentsLast30Days: number;
  avgEngagementRate: number;
  activeStreak: number;
}

export interface ContentQualityMetrics {
  avgLikesPerPost: number;
  avgCommentsPerPost: number;
  avgSharesPerPost: number;
  reportedContentCount: number;
  removedContentCount: number;
  flaggedContentCount: number;
  qualityScore: number;
}

export interface ModerationMetrics {
  warningsReceived: number;
  contentRemoved: number;
  temporaryBans: number;
  spamReportsReceived: number;
  spamReportsConfirmed: number;
  fraudSignals: number;
}

export interface VerificationStatus {
  emailVerified: boolean;
  phoneVerified: boolean;
  identityVerified: boolean;
  twoFactorEnabled: boolean;
  trustedDevices: number;
}

export interface SocialMetrics {
  followers: number;
  following: number;
  mutualFollowers: number;
  accountsBlocked: number;
  accountsBlockedBy: number;
  groupMemberships: number;
  communities: number;
}

export interface TrustConfig {
  weights: {
    accountAge: number;
    verification: number;
    activity: number;
    contentQuality: number;
    socialConnections: number;
    moderation: number;
    engagement: number;
  };
  thresholds: {
    new: number;
    low: number;
    medium: number;
    high: number;
    verified: number;
    trusted: number;
  };
  penalties: {
    warning: number;
    contentRemoved: number;
    temporaryBan: number;
    spamConfirmed: number;
    fraudSignal: number;
  };
  bonuses: {
    emailVerified: number;
    phoneVerified: number;
    identityVerified: number;
    twoFactorEnabled: number;
  };
}

export interface TrustUpdateEvent {
  userId: string;
  type: string;
  value: number;
  metadata?: Record<string, unknown>;
}
