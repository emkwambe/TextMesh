/**
 * A/B Testing Types
 */

export type ExperimentStatus = 'draft' | 'running' | 'paused' | 'completed' | 'archived';

export type VariantType = 'control' | 'treatment';

export interface Experiment {
  id: string;
  name: string;
  description: string;
  hypothesis?: string;
  status: ExperimentStatus;
  variants: Variant[];
  targetingRules: TargetingRule[];
  metrics: ExperimentMetric[];
  allocation: number; // 0-100% of eligible traffic
  startDate?: Date;
  endDate?: Date;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  tags: string[];
}

export interface Variant {
  id: string;
  name: string;
  type: VariantType;
  weight: number; // 0-100, should sum to 100 across variants
  config: Record<string, unknown>;
  description?: string;
}

export interface TargetingRule {
  id: string;
  attribute: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'contains' | 'regex';
  value: unknown;
}

export interface ExperimentMetric {
  name: string;
  type: 'conversion' | 'count' | 'average' | 'sum';
  eventName: string;
  isPrimary: boolean;
}

export interface Assignment {
  experimentId: string;
  variantId: string;
  userId: string;
  timestamp: Date;
  context: AssignmentContext;
}

export interface AssignmentContext {
  platform?: string;
  country?: string;
  deviceType?: string;
  userSegment?: string;
  customAttributes?: Record<string, unknown>;
}

export interface ExperimentResult {
  experimentId: string;
  startDate: Date;
  endDate: Date;
  totalParticipants: number;
  variantResults: VariantResult[];
  winner?: string;
  confidence: number;
  isStatisticallySignificant: boolean;
}

export interface VariantResult {
  variantId: string;
  variantName: string;
  participants: number;
  conversions: number;
  conversionRate: number;
  improvement: number; // vs control
  confidenceInterval: [number, number];
  pValue: number;
}

export interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  defaultValue: unknown;
  rules: FeatureFlagRule[];
  createdAt: Date;
  updatedAt: Date;
}

export interface FeatureFlagRule {
  id: string;
  conditions: TargetingRule[];
  value: unknown;
  percentage: number; // 0-100
  priority: number;
}

export interface ExperimentEvent {
  experimentId: string;
  variantId: string;
  userId: string;
  eventName: string;
  value?: number;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface ABTestConfig {
  hashSeed: number;
  defaultAllocation: number;
  minimumSampleSize: number;
  significanceLevel: number;
  power: number;
}
