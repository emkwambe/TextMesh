export interface UserEngagement {
  userId: string;
  level: number;
  xp: number;
  xpToNextLevel: number;
  totalXp: number;
  rank: UserRank;
  badges: string[];
  achievements: string[];
  streaks: UserStreaks;
  stats: EngagementStats;
  createdAt: Date;
  updatedAt: Date;
}

export type UserRank =
  | 'newcomer'
  | 'regular'
  | 'contributor'
  | 'influencer'
  | 'expert'
  | 'legend';

export interface UserStreaks {
  current: StreakInfo;
  longest: StreakInfo;
  weekly: WeeklyStreak;
}

export interface StreakInfo {
  count: number;
  startDate: Date;
  lastActivityDate: Date;
}

export interface WeeklyStreak {
  daysActive: number[];
  weekStart: Date;
}

export interface EngagementStats {
  postsCreated: number;
  commentsWritten: number;
  likesGiven: number;
  likesReceived: number;
  followersGained: number;
  followingCount: number;
  sharesCreated: number;
  mentionsReceived: number;
  profileViews: number;
  contentViews: number;
  engagementRate: number;
  lastActiveAt: Date;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  category: AchievementCategory;
  icon: string;
  rarity: AchievementRarity;
  xpReward: number;
  criteria: AchievementCriteria;
  isSecret: boolean;
  createdAt: Date;
}

export type AchievementCategory =
  | 'content'
  | 'social'
  | 'engagement'
  | 'milestone'
  | 'special'
  | 'seasonal';

export type AchievementRarity =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'epic'
  | 'legendary';

export interface AchievementCriteria {
  type: CriteriaType;
  metric: string;
  threshold: number;
  timeframe?: 'day' | 'week' | 'month' | 'all_time';
  conditions?: AchievementCondition[];
}

export type CriteriaType =
  | 'count'
  | 'streak'
  | 'milestone'
  | 'rate'
  | 'unique'
  | 'compound';

export interface AchievementCondition {
  metric: string;
  operator: 'eq' | 'gt' | 'gte' | 'lt' | 'lte';
  value: number;
}

export interface UserAchievement {
  achievementId: string;
  unlockedAt: Date;
  progress?: number;
  notified: boolean;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: BadgeCategory;
  tier: BadgeTier;
  requirements: BadgeRequirement[];
  isDisplayable: boolean;
  createdAt: Date;
}

export type BadgeCategory =
  | 'verification'
  | 'expertise'
  | 'community'
  | 'creator'
  | 'supporter'
  | 'event';

export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';

export interface BadgeRequirement {
  type: 'achievement' | 'metric' | 'manual' | 'time';
  value: string | number;
  description?: string;
}

export interface UserBadge {
  badgeId: string;
  awardedAt: Date;
  awardedBy?: string;
  reason?: string;
  featured: boolean;
}

export interface LeaderboardEntry {
  userId: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  score: number;
  rank: number;
  level: number;
  badges: string[];
  change: number;
}

export interface Leaderboard {
  id: string;
  name: string;
  type: LeaderboardType;
  metric: string;
  timeframe: LeaderboardTimeframe;
  entries: LeaderboardEntry[];
  updatedAt: Date;
}

export type LeaderboardType = 'global' | 'regional' | 'category' | 'custom';
export type LeaderboardTimeframe = 'daily' | 'weekly' | 'monthly' | 'all_time';

export interface XPEvent {
  id: string;
  userId: string;
  action: XPAction;
  amount: number;
  multiplier: number;
  source?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export type XPAction =
  | 'post_created'
  | 'post_liked'
  | 'post_shared'
  | 'comment_created'
  | 'comment_liked'
  | 'follower_gained'
  | 'following_added'
  | 'profile_completed'
  | 'daily_login'
  | 'streak_bonus'
  | 'achievement_unlocked'
  | 'badge_earned'
  | 'referral_signup'
  | 'content_featured'
  | 'challenge_completed';

export interface XPConfig {
  baseXP: Record<XPAction, number>;
  levelThresholds: number[];
  streakMultipliers: Record<number, number>;
  rarityMultipliers: Record<AchievementRarity, number>;
}

export interface Challenge {
  id: string;
  name: string;
  description: string;
  type: ChallengeType;
  criteria: ChallengeCriteria;
  rewards: ChallengeReward[];
  startDate: Date;
  endDate: Date;
  maxParticipants?: number;
  currentParticipants: number;
  isActive: boolean;
  createdAt: Date;
}

export type ChallengeType = 'daily' | 'weekly' | 'special' | 'community';

export interface ChallengeCriteria {
  actions: Array<{
    type: XPAction;
    count: number;
  }>;
  minLevel?: number;
  prerequisites?: string[];
}

export interface ChallengeReward {
  type: 'xp' | 'badge' | 'achievement' | 'feature';
  value: string | number;
}

export interface UserChallenge {
  challengeId: string;
  userId: string;
  progress: Record<string, number>;
  completedAt?: Date;
  claimed: boolean;
  joinedAt: Date;
}

export interface EngagementNotification {
  type: 'achievement' | 'badge' | 'level_up' | 'streak' | 'challenge' | 'leaderboard';
  title: string;
  message: string;
  data: Record<string, unknown>;
  createdAt: Date;
}
