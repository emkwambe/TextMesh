/**
 * Fraud Detection Types
 */

export type FraudCategory =
  | 'account_takeover'
  | 'fake_account'
  | 'payment_fraud'
  | 'identity_fraud'
  | 'bot_activity'
  | 'abuse'
  | 'spam_network'
  | 'credential_stuffing';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface FraudSignal {
  type: string;
  value: number;
  weight: number;
  details?: Record<string, unknown>;
}

export interface FraudAssessment {
  riskScore: number; // 0-100
  riskLevel: RiskLevel;
  fraudProbability: number; // 0-1
  signals: FraudSignal[];
  categories: FraudCategory[];
  recommendation: 'allow' | 'review' | 'challenge' | 'block';
  requiresMFA: boolean;
  reasons: string[];
}

export interface DeviceFingerprint {
  id: string;
  userAgent: string;
  platform: string;
  language: string;
  timezone: string;
  screenResolution: string;
  colorDepth: number;
  cookiesEnabled: boolean;
  doNotTrack: boolean;
  plugins: string[];
  fonts: string[];
  canvas: string;
  webgl: string;
  audio: string;
  hardwareConcurrency: number;
  deviceMemory?: number;
  touchSupport: boolean;
}

export interface GeoLocation {
  ip: string;
  country: string;
  countryCode: string;
  region: string;
  city: string;
  latitude: number;
  longitude: number;
  timezone: string;
  isp: string;
  asn: string;
  isVPN: boolean;
  isProxy: boolean;
  isTor: boolean;
  isDataCenter: boolean;
}

export interface SessionContext {
  sessionId: string;
  userId?: string;
  ip: string;
  device: Partial<DeviceFingerprint>;
  geo?: GeoLocation;
  timestamp: Date;
  userAgent?: string;
  referrer?: string;
}

export interface UserBehavior {
  userId: string;
  loginAttempts: number;
  failedLogins: number;
  passwordResets: number;
  profileChanges: number;
  suspiciousActivities: number;
  lastLogin: Date;
  accountAge: number; // days
  averageSessionDuration: number;
  typicalLoginHours: number[];
  typicalCountries: string[];
  trustedDevices: string[];
}

export interface VelocityCheck {
  action: string;
  count: number;
  windowMs: number;
  limit: number;
  exceeded: boolean;
}

export interface FraudRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  priority: number;
  conditions: RuleCondition[];
  action: 'flag' | 'block' | 'challenge' | 'review';
  score: number;
}

export interface RuleCondition {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'regex' | 'exists';
  value: unknown;
}

export interface FraudEvent {
  id: string;
  timestamp: Date;
  userId?: string;
  sessionId: string;
  eventType: string;
  ip: string;
  device?: Partial<DeviceFingerprint>;
  assessment: FraudAssessment;
  actionTaken: string;
  resolved: boolean;
  notes?: string;
}
