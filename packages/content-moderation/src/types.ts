/**
 * Content Moderation Types
 */

export type ModerationCategory =
  | 'toxicity'
  | 'spam'
  | 'nsfw'
  | 'violence'
  | 'harassment'
  | 'hate_speech'
  | 'self_harm'
  | 'sexual'
  | 'dangerous'
  | 'pii'
  | 'malicious_link';

export type ModerationAction =
  | 'allow'
  | 'flag'
  | 'hide'
  | 'remove'
  | 'ban';

export type ContentType =
  | 'post'
  | 'comment'
  | 'message'
  | 'bio'
  | 'username'
  | 'group_name'
  | 'group_description';

export interface ModerationResult {
  approved: boolean;
  action: ModerationAction;
  scores: Record<ModerationCategory, number>;
  categories: ModerationCategory[];
  reasons: string[];
  confidence: number;
  processingTime: number;
}

export interface ModerationConfig {
  thresholds: Record<ModerationCategory, number>;
  actions: Record<ModerationCategory, ModerationAction>;
  enabledChecks: ModerationCategory[];
  autoAction: boolean;
  appealable: boolean;
}

export interface ContentToModerate {
  id: string;
  type: ContentType;
  content: string;
  authorId: string;
  metadata?: Record<string, unknown>;
  urls?: string[];
  mediaUrls?: string[];
}

export interface ModerationQueueItem {
  id: string;
  content: ContentToModerate;
  result: ModerationResult;
  status: 'pending' | 'reviewing' | 'resolved';
  assignedTo?: string;
  createdAt: Date;
  resolvedAt?: Date;
  resolution?: {
    action: ModerationAction;
    reason: string;
    moderatorId: string;
  };
}

export interface ToxicityScores {
  toxicity: number;
  severeToxicity: number;
  identityAttack: number;
  insult: number;
  profanity: number;
  threat: number;
  sexuallyExplicit: number;
}

export interface SpamSignals {
  repetition: number;
  linkDensity: number;
  capsRatio: number;
  specialCharRatio: number;
  shortenerLinks: number;
  suspiciousPhrases: number;
  authorTrustScore: number;
}

export interface PIIMatch {
  type: 'email' | 'phone' | 'ssn' | 'credit_card' | 'address' | 'ip_address';
  value: string;
  start: number;
  end: number;
  confidence: number;
}
