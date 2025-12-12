// Cooling periods
export interface CoolingPeriodConfig {
  enabled: boolean;
  defaultDelay: number; // seconds
  hotTopicMultiplier: number; // multiply delay for trending/controversial
  maxDelay: number; // maximum delay in seconds
  bypassForTrustedUsers: boolean;
  trustedUserMinScore: number;
}

export interface CoolingPeriod {
  id: string;
  userId: string;
  contentId: string;
  action: 'reply' | 'repost' | 'quote';
  reason: 'hot_topic' | 'heated_thread' | 'user_cooldown' | 'rate_limit';
  delaySeconds: number;
  expiresAt: Date;
  createdAt: Date;
}

export interface HotTopic {
  contentId: string;
  heatScore: number; // 0-100
  replyVelocity: number; // replies per minute
  controversyScore: number; // 0-100 based on disagreement
  isActive: boolean;
  detectedAt: Date;
  lastUpdated: Date;
}

// Toxicity shields
export interface ToxicityConfig {
  enabled: boolean;
  defaultSensitivity: ToxicitySensitivity;
  categories: ToxicityCategory[];
  autoHideThreshold: number; // 0-100
  warnThreshold: number; // 0-100
}

export type ToxicitySensitivity = 'low' | 'medium' | 'high' | 'maximum';

export type ToxicityCategory =
  | 'harassment'
  | 'hate_speech'
  | 'threats'
  | 'profanity'
  | 'sexual_content'
  | 'self_harm'
  | 'spam'
  | 'misinformation';

export interface ToxicityScore {
  overall: number; // 0-100
  categories: Partial<Record<ToxicityCategory, number>>;
  flagged: boolean;
  hidden: boolean;
  reviewRequired: boolean;
}

export interface UserShieldSettings {
  userId: string;
  enabled: boolean;
  sensitivity: ToxicitySensitivity;
  blockedCategories: ToxicityCategory[];
  allowFromFollowing: boolean;
  allowFromVerified: boolean;
  vulnerableMode: boolean; // Extra protection during difficult times
  vulnerableModeExpires?: Date;
  mutedWords: string[];
  mutedUsers: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ShieldedContent {
  contentId: string;
  authorId: string;
  toxicityScore: ToxicityScore;
  shieldAction: 'hidden' | 'warning' | 'passed';
  reason?: string;
  userCanReveal: boolean;
}

// Graduated trust
export interface TrustConfig {
  enabled: boolean;
  newUserRestrictionDays: number;
  trustLevels: TrustLevel[];
  decayRate: number; // trust decay per day of inactivity
}

export interface TrustLevel {
  level: number;
  name: string;
  minScore: number;
  permissions: TrustPermission[];
  rateLimit: {
    postsPerDay: number;
    repliesPerDay: number;
    dmPerDay: number;
    mentionsPerPost: number;
  };
}

export type TrustPermission =
  | 'post'
  | 'reply'
  | 'dm'
  | 'mention'
  | 'create_group'
  | 'post_links'
  | 'post_media'
  | 'go_live'
  | 'create_poll'
  | 'unlimited_reach';

export interface UserTrust {
  userId: string;
  score: number; // 0-100
  level: number;
  positiveSignals: TrustSignal[];
  negativeSignals: TrustSignal[];
  restrictions: string[];
  lastActivity: Date;
  accountAge: number; // days
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TrustSignal {
  type: TrustSignalType;
  value: number; // positive or negative impact
  source?: string;
  createdAt: Date;
  expiresAt?: Date;
}

export type TrustSignalType =
  // Positive signals
  | 'email_verified'
  | 'phone_verified'
  | 'id_verified'
  | 'consistent_posting'
  | 'quality_content'
  | 'helpful_replies'
  | 'trusted_followers'
  | 'community_vouches'
  | 'no_violations'
  // Negative signals
  | 'spam_detected'
  | 'harassment_report'
  | 'misinformation_flag'
  | 'rate_limit_hit'
  | 'appeal_denied'
  | 'temp_suspension'
  | 'content_removed';

// Private resolution
export interface PrivateResolution {
  id: string;
  initiatorId: string;
  respondentId: string;
  publicThreadId: string;
  privateThreadId: string;
  status: 'pending' | 'accepted' | 'declined' | 'resolved' | 'escalated';
  reason: string;
  outcome?: 'resolved_positively' | 'resolved_negatively' | 'no_resolution';
  createdAt: Date;
  resolvedAt?: Date;
}

// Rate limiting
export interface RateLimitConfig {
  enabled: boolean;
  windows: RateLimitWindow[];
}

export interface RateLimitWindow {
  action: string;
  windowSeconds: number;
  maxRequests: number;
  trustLevelMultipliers: Record<number, number>;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number;
}

// Safety events
export type SafetyEvent =
  | 'cooling_period_applied'
  | 'toxicity_detected'
  | 'content_shielded'
  | 'trust_level_changed'
  | 'private_resolution_started'
  | 'rate_limit_hit'
  | 'user_protected';

export interface SafetyEventData {
  event: SafetyEvent;
  userId: string;
  targetId?: string;
  contentId?: string;
  timestamp: Date;
  data: Record<string, unknown>;
}
