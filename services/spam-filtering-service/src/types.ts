/**
 * Spam Filtering Service Types
 */

export type SpamStatus = 'pending' | 'clean' | 'spam' | 'quarantined' | 'appealed';

export type ContentSource = 'post' | 'comment' | 'message' | 'profile' | 'bio';

export interface SpamFilterRequest {
  id: string;
  contentId: string;
  contentType: ContentSource;
  content: string;
  authorId: string;
  urls?: string[];
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

export interface SpamFilterResult {
  requestId: string;
  contentId: string;
  isSpam: boolean;
  confidence: number;
  status: SpamStatus;
  reasons: string[];
  processedAt: Date;
  processingTime: number;
}

export interface SpamReport {
  id: string;
  contentId: string;
  contentType: ContentSource;
  reporterId: string;
  authorId: string;
  reason: string;
  details?: string;
  status: 'pending' | 'confirmed' | 'rejected';
  createdAt: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
}

export interface QuarantinedContent {
  id: string;
  contentId: string;
  contentType: ContentSource;
  content: string;
  authorId: string;
  spamScore: number;
  reasons: string[];
  quarantinedAt: Date;
  expiresAt: Date;
  status: 'quarantined' | 'released' | 'deleted';
  reviewedBy?: string;
  reviewedAt?: Date;
}

export interface AuthorSpamStats {
  authorId: string;
  totalContent: number;
  spamCount: number;
  quarantinedCount: number;
  reportCount: number;
  spamRatio: number;
  lastSpamAt?: Date;
  isBanned: boolean;
  trustScore: number;
}

export interface SpamPattern {
  id: string;
  pattern: string;
  type: 'regex' | 'keyword' | 'domain';
  category: string;
  severity: 'low' | 'medium' | 'high';
  enabled: boolean;
  hitCount: number;
  createdAt: Date;
}

export interface SpamFilterConfig {
  enabled: boolean;
  threshold: number;
  quarantineEnabled: boolean;
  quarantineDuration: number; // hours
  autoDeleteThreshold: number;
  reportThresholdForAutoBlock: number;
  enableMachineLearning: boolean;
  enableRuleBasedDetection: boolean;
  customPatterns: SpamPattern[];
}
