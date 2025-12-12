/**
 * Assignment Engine
 *
 * Handles deterministic variant assignment using consistent hashing
 */

import { createLogger } from '@textmesh/logger';
import murmur from 'murmurhash';
import {
  Experiment,
  Variant,
  Assignment,
  AssignmentContext,
  TargetingRule,
  ABTestConfig,
} from './types';

const logger = createLogger({ service: 'assignment-engine', level: 'info' });

const DEFAULT_CONFIG: ABTestConfig = {
  hashSeed: 12345,
  defaultAllocation: 100,
  minimumSampleSize: 100,
  significanceLevel: 0.05,
  power: 0.8,
};

export class AssignmentEngine {
  private config: ABTestConfig;
  private assignments: Map<string, Assignment> = new Map(); // userId:experimentId -> assignment
  private overrides: Map<string, Map<string, string>> = new Map(); // experimentId -> userId -> variantId

  constructor(config: Partial<ABTestConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get variant assignment for user in experiment
   */
  getAssignment(
    experiment: Experiment,
    userId: string,
    context: AssignmentContext = {}
  ): Assignment | null {
    // Check if experiment is running
    if (experiment.status !== 'running') {
      return null;
    }

    // Check date bounds
    const now = new Date();
    if (experiment.startDate && now < experiment.startDate) {
      return null;
    }
    if (experiment.endDate && now > experiment.endDate) {
      return null;
    }

    // Check for override
    const override = this.getOverride(experiment.id, userId);
    if (override) {
      return this.createAssignment(experiment.id, override, userId, context);
    }

    // Check cached assignment
    const cacheKey = `${userId}:${experiment.id}`;
    const cached = this.assignments.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Check targeting rules
    if (!this.matchesTargeting(experiment.targetingRules, context)) {
      return null;
    }

    // Check allocation
    if (!this.isInAllocation(experiment.id, userId, experiment.allocation)) {
      return null;
    }

    // Determine variant
    const variant = this.selectVariant(experiment.id, userId, experiment.variants);
    if (!variant) {
      return null;
    }

    // Create and cache assignment
    const assignment = this.createAssignment(experiment.id, variant.id, userId, context);
    this.assignments.set(cacheKey, assignment);

    logger.debug('User assigned to variant', {
      experimentId: experiment.id,
      userId,
      variantId: variant.id,
    });

    return assignment;
  }

  /**
   * Check if user matches targeting rules
   */
  private matchesTargeting(rules: TargetingRule[], context: AssignmentContext): boolean {
    if (rules.length === 0) {
      return true;
    }

    const contextData: Record<string, unknown> = {
      platform: context.platform,
      country: context.country,
      deviceType: context.deviceType,
      userSegment: context.userSegment,
      ...context.customAttributes,
    };

    for (const rule of rules) {
      if (!this.evaluateRule(rule, contextData)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Evaluate a single targeting rule
   */
  private evaluateRule(rule: TargetingRule, context: Record<string, unknown>): boolean {
    const value = context[rule.attribute];

    switch (rule.operator) {
      case 'eq':
        return value === rule.value;
      case 'neq':
        return value !== rule.value;
      case 'gt':
        return Number(value) > Number(rule.value);
      case 'gte':
        return Number(value) >= Number(rule.value);
      case 'lt':
        return Number(value) < Number(rule.value);
      case 'lte':
        return Number(value) <= Number(rule.value);
      case 'in':
        return Array.isArray(rule.value) && rule.value.includes(value);
      case 'nin':
        return Array.isArray(rule.value) && !rule.value.includes(value);
      case 'contains':
        return String(value).includes(String(rule.value));
      case 'regex':
        return new RegExp(String(rule.value)).test(String(value));
      default:
        return true;
    }
  }

  /**
   * Check if user is in experiment allocation
   */
  private isInAllocation(experimentId: string, userId: string, allocation: number): boolean {
    const hash = this.hash(`${experimentId}:allocation:${userId}`);
    const bucket = hash % 100;
    return bucket < allocation;
  }

  /**
   * Select variant for user
   */
  private selectVariant(
    experimentId: string,
    userId: string,
    variants: Variant[]
  ): Variant | null {
    if (variants.length === 0) {
      return null;
    }

    const hash = this.hash(`${experimentId}:variant:${userId}`);
    const bucket = hash % 100;

    let cumulative = 0;
    for (const variant of variants) {
      cumulative += variant.weight;
      if (bucket < cumulative) {
        return variant;
      }
    }

    // Fallback to last variant
    return variants[variants.length - 1];
  }

  /**
   * Hash string to number
   */
  private hash(input: string): number {
    return murmur.v3(input, this.config.hashSeed);
  }

  /**
   * Create assignment object
   */
  private createAssignment(
    experimentId: string,
    variantId: string,
    userId: string,
    context: AssignmentContext
  ): Assignment {
    return {
      experimentId,
      variantId,
      userId,
      timestamp: new Date(),
      context,
    };
  }

  /**
   * Set override for user
   */
  setOverride(experimentId: string, userId: string, variantId: string): void {
    let experimentOverrides = this.overrides.get(experimentId);
    if (!experimentOverrides) {
      experimentOverrides = new Map();
      this.overrides.set(experimentId, experimentOverrides);
    }
    experimentOverrides.set(userId, variantId);

    // Clear cached assignment
    this.assignments.delete(`${userId}:${experimentId}`);

    logger.info('Override set', { experimentId, userId, variantId });
  }

  /**
   * Remove override for user
   */
  removeOverride(experimentId: string, userId: string): void {
    const experimentOverrides = this.overrides.get(experimentId);
    if (experimentOverrides) {
      experimentOverrides.delete(userId);
      this.assignments.delete(`${userId}:${experimentId}`);
    }
  }

  /**
   * Get override for user
   */
  private getOverride(experimentId: string, userId: string): string | null {
    const experimentOverrides = this.overrides.get(experimentId);
    if (experimentOverrides) {
      return experimentOverrides.get(userId) || null;
    }
    return null;
  }

  /**
   * Get all assignments for user
   */
  getUserAssignments(userId: string): Assignment[] {
    const assignments: Assignment[] = [];

    for (const [key, assignment] of this.assignments) {
      if (key.startsWith(`${userId}:`)) {
        assignments.push(assignment);
      }
    }

    return assignments;
  }

  /**
   * Clear assignments for experiment
   */
  clearExperimentAssignments(experimentId: string): void {
    const keysToDelete: string[] = [];

    for (const key of this.assignments.keys()) {
      if (key.endsWith(`:${experimentId}`)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.assignments.delete(key);
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalAssignments: number;
    totalOverrides: number;
    assignmentsByExperiment: Record<string, number>;
  } {
    const assignmentsByExperiment: Record<string, number> = {};

    for (const key of this.assignments.keys()) {
      const experimentId = key.split(':')[1];
      assignmentsByExperiment[experimentId] =
        (assignmentsByExperiment[experimentId] || 0) + 1;
    }

    let totalOverrides = 0;
    for (const overrides of this.overrides.values()) {
      totalOverrides += overrides.size;
    }

    return {
      totalAssignments: this.assignments.size,
      totalOverrides,
      assignmentsByExperiment,
    };
  }
}
