// Thoughtfulness scoring
export interface ThoughtfulnessMetrics {
  compositionTime: number; // seconds spent writing
  editCount: number; // number of revisions
  wordCount: number;
  citationCount: number; // links/sources included
  mediaCount: number; // images, videos attached
  readabilityScore: number; // 0-100
  originalityScore: number; // 0-100 (vs copy-paste)
}

export interface ThoughtfulnessScore {
  overall: number; // 0-100
  breakdown: {
    effort: number; // time + edits
    substance: number; // length + citations
    clarity: number; // readability
    originality: number; // unique content
  };
  tier: 'low' | 'medium' | 'high' | 'exceptional';
  multiplier: number; // for engagement rewards
}

export interface ThoughtfulnessConfig {
  weights: {
    effort: number;
    substance: number;
    clarity: number;
    originality: number;
  };
  thresholds: {
    low: number;
    medium: number;
    high: number;
    exceptional: number;
  };
  minCompositionTime: number; // seconds
  minWordCount: number;
}

// Read gate system
export interface ReadGateConfig {
  enabled: boolean;
  minReadTimePercent: number; // % of estimated read time required
  minScrollPercent: number; // % of content scrolled
  bypassForShortContent: boolean;
  shortContentThreshold: number; // words
  cooldownAfterFail: number; // seconds before retry
}

export interface ReadAttempt {
  userId: string;
  contentId: string;
  startTime: Date;
  endTime?: Date;
  scrollDepth: number; // 0-100
  timeSpent: number; // seconds
  passed: boolean;
  attemptCount: number;
}

export interface ReadGateResult {
  passed: boolean;
  reason?: 'insufficient_time' | 'insufficient_scroll' | 'cooldown_active';
  requiredTime?: number;
  actualTime?: number;
  requiredScroll?: number;
  actualScroll?: number;
  cooldownRemaining?: number;
}

// Finite feed system
export interface FiniteFeedConfig {
  enabled: boolean;
  dailyContentLimit: number; // max items per day
  sessionLimit: number; // max items per session
  digestEnabled: boolean;
  digestTime: string; // HH:MM in user timezone
  catchUpThreshold: number; // items remaining to show "caught up"
}

export interface FeedSession {
  userId: string;
  sessionId: string;
  startTime: Date;
  itemsViewed: number;
  itemsRemaining: number;
  isCaughtUp: boolean;
  nextRefreshAt: Date;
}

export interface FeedItem {
  id: string;
  contentId: string;
  contentType: string;
  authorId: string;
  thoughtfulnessScore: number;
  priority: number;
  createdAt: Date;
  expiresAt?: Date;
}

export interface DailyDigest {
  userId: string;
  date: string; // YYYY-MM-DD
  generatedAt: Date;
  items: DigestItem[];
  stats: {
    totalContent: number;
    includedContent: number;
    topThemes: string[];
  };
}

export interface DigestItem {
  contentId: string;
  contentType: string;
  authorId: string;
  authorName: string;
  snippet: string;
  thoughtfulnessScore: number;
  engagementScore: number;
  category: string;
}

// Hidden metrics system
export interface MetricVisibility {
  showLikeCounts: boolean;
  showFollowerCounts: boolean;
  showShareCounts: boolean;
  showViewCounts: boolean;
  showToAuthorOnly: boolean;
  delayPublicMetrics: number; // hours before showing
}

export interface PrivateMetrics {
  userId: string;
  contentId: string;
  likes: number;
  shares: number;
  bookmarks: number;
  replies: number;
  readTime: number; // total seconds
  reach: number;
  visibleAt?: Date; // when metrics become public
}

// Content quality events
export type QualityEvent =
  | 'content_scored'
  | 'read_gate_passed'
  | 'read_gate_failed'
  | 'feed_caught_up'
  | 'digest_generated'
  | 'metrics_revealed';

export interface QualityEventData {
  event: QualityEvent;
  userId: string;
  contentId?: string;
  timestamp: Date;
  data: Record<string, unknown>;
}
