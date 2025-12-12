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
  | 'malicious_link'
  | 'scam';

export type ModerationAction =
  | 'allow'
  | 'flag'
  | 'hide'
  | 'remove'
  | 'ban'
  | 'block'
  | 'redact';

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
  scores: Record<string, number>;
  categories: ModerationCategory[];
  reasons: string[];
  confidence: number;
  processingTime: number;
}

export interface CategoryConfig {
  threshold?: number;
  enabled: boolean;
  action?: ModerationAction;
  types?: string[];
  blockMalicious?: boolean;
  warnSuspicious?: boolean;
}

export interface ModerationConfig {
  thresholds?: Record<string, number>;
  actions?: Record<string, ModerationAction>;
  enabledChecks?: ModerationCategory[];
  autoAction?: boolean;
  appealable?: boolean;
  toxicity?: CategoryConfig;
  spam?: CategoryConfig;
  nsfw?: CategoryConfig;
  pii?: CategoryConfig & { types?: PIIType[] };
  links?: CategoryConfig;
  autoModeration?: {
    enabled: boolean;
    threshold?: number;
    escalateToHuman?: boolean;
    escalationThreshold?: number;
  };
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

// PIIType supports both snake_case and camelCase for compatibility
export type PIIType =
  | 'email'
  | 'phone'
  | 'ssn'
  | 'credit_card'
  | 'creditCard'
  | 'address'
  | 'ip_address'
  | 'ipAddress'
  | 'name'
  | 'date_of_birth'
  | 'dateOfBirth'
  | 'passport'
  | 'driver_license'
  | 'driverLicense'
  | 'bankAccount';

export type PIISeverity = 'low' | 'medium' | 'high' | 'critical';

export interface PIIMatch {
  type: PIIType;
  value: string;
  start: number;
  end: number;
  confidence: number;
  severity?: PIISeverity;
}

