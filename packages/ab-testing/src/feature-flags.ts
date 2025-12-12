/**
 * Feature Flags
 *
 * Manages feature flags for gradual rollouts and kill switches
 */

import { createLogger } from '@textmesh/logger';
import { v4 as uuidv4 } from 'uuid';
import murmur from 'murmurhash';
import { FeatureFlag, FeatureFlagRule, TargetingRule, AssignmentContext } from './types';

const logger = createLogger({ service: 'feature-flags', level: 'info' });

export class FeatureFlagManager {
  private flags: Map<string, FeatureFlag> = new Map();
  private hashSeed: number = 12345;

  /**
   * Create a feature flag
   */
  createFlag(params: {
    key: string;
    name: string;
    description: string;
    defaultValue: unknown;
    rules?: FeatureFlagRule[];
  }): FeatureFlag {
    if (this.flags.has(params.key)) {
      throw new Error(`Feature flag with key "${params.key}" already exists`);
    }

    const flag: FeatureFlag = {
      id: uuidv4(),
      key: params.key,
      name: params.name,
      description: params.description,
      enabled: false,
      defaultValue: params.defaultValue,
      rules: params.rules || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.flags.set(params.key, flag);

    logger.info('Feature flag created', { key: params.key });

    return flag;
  }

  /**
   * Get flag value for user
   */
  getValue(
    key: string,
    userId: string,
    context: AssignmentContext = {}
  ): unknown {
    const flag = this.flags.get(key);
    if (!flag) {
      logger.warn('Feature flag not found', { key });
      return null;
    }

    if (!flag.enabled) {
      return flag.defaultValue;
    }

    // Sort rules by priority
    const sortedRules = [...flag.rules].sort((a, b) => a.priority - b.priority);

    // Evaluate rules
    for (const rule of sortedRules) {
      if (this.matchesConditions(rule.conditions, context)) {
        // Check percentage rollout
        if (rule.percentage < 100) {
          const hash = murmur.v3(`${key}:${userId}`, this.hashSeed);
          const bucket = hash % 100;
          if (bucket >= rule.percentage) {
            continue; // User not in percentage rollout
          }
        }

        return rule.value;
      }
    }

    return flag.defaultValue;
  }

  /**
   * Get boolean flag value
   */
  isEnabled(key: string, userId: string, context: AssignmentContext = {}): boolean {
    const value = this.getValue(key, userId, context);
    return Boolean(value);
  }

  /**
   * Check if user matches conditions
   */
  private matchesConditions(
    conditions: TargetingRule[],
    context: AssignmentContext
  ): boolean {
    if (conditions.length === 0) {
      return true;
    }

    const contextData: Record<string, unknown> = {
      platform: context.platform,
      country: context.country,
      deviceType: context.deviceType,
      userSegment: context.userSegment,
      ...context.customAttributes,
    };

    for (const condition of conditions) {
      if (!this.evaluateCondition(condition, contextData)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Evaluate single condition
   */
  private evaluateCondition(
    condition: TargetingRule,
    context: Record<string, unknown>
  ): boolean {
    const value = context[condition.attribute];

    switch (condition.operator) {
      case 'eq':
        return value === condition.value;
      case 'neq':
        return value !== condition.value;
      case 'gt':
        return Number(value) > Number(condition.value);
      case 'gte':
        return Number(value) >= Number(condition.value);
      case 'lt':
        return Number(value) < Number(condition.value);
      case 'lte':
        return Number(value) <= Number(condition.value);
      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(value);
      case 'nin':
        return Array.isArray(condition.value) && !condition.value.includes(value);
      case 'contains':
        return String(value).includes(String(condition.value));
      case 'regex':
        return new RegExp(String(condition.value)).test(String(value));
      default:
        return true;
    }
  }

  /**
   * Enable flag
   */
  enableFlag(key: string): FeatureFlag | null {
    const flag = this.flags.get(key);
    if (!flag) return null;

    flag.enabled = true;
    flag.updatedAt = new Date();

    logger.info('Feature flag enabled', { key });

    return flag;
  }

  /**
   * Disable flag
   */
  disableFlag(key: string): FeatureFlag | null {
    const flag = this.flags.get(key);
    if (!flag) return null;

    flag.enabled = false;
    flag.updatedAt = new Date();

    logger.info('Feature flag disabled', { key });

    return flag;
  }

  /**
   * Update flag
   */
  updateFlag(
    key: string,
    updates: Partial<Omit<FeatureFlag, 'id' | 'key' | 'createdAt'>>
  ): FeatureFlag | null {
    const flag = this.flags.get(key);
    if (!flag) return null;

    Object.assign(flag, updates, { updatedAt: new Date() });

    logger.info('Feature flag updated', { key });

    return flag;
  }

  /**
   * Delete flag
   */
  deleteFlag(key: string): boolean {
    const result = this.flags.delete(key);
    if (result) {
      logger.info('Feature flag deleted', { key });
    }
    return result;
  }

  /**
   * Get flag
   */
  getFlag(key: string): FeatureFlag | null {
    return this.flags.get(key) || null;
  }

  /**
   * List all flags
   */
  listFlags(filters?: { enabled?: boolean }): FeatureFlag[] {
    let flags = Array.from(this.flags.values());

    if (filters) {
      if (filters.enabled !== undefined) {
        flags = flags.filter((f) => f.enabled === filters.enabled);
      }
    }

    return flags.sort((a, b) => a.key.localeCompare(b.key));
  }

  /**
   * Add rule to flag
   */
  addRule(key: string, rule: Omit<FeatureFlagRule, 'id'>): FeatureFlag | null {
    const flag = this.flags.get(key);
    if (!flag) return null;

    flag.rules.push({
      ...rule,
      id: uuidv4(),
    });
    flag.updatedAt = new Date();

    return flag;
  }

  /**
   * Remove rule from flag
   */
  removeRule(key: string, ruleId: string): FeatureFlag | null {
    const flag = this.flags.get(key);
    if (!flag) return null;

    flag.rules = flag.rules.filter((r) => r.id !== ruleId);
    flag.updatedAt = new Date();

    return flag;
  }

  /**
   * Update rule priority
   */
  updateRulePriority(key: string, ruleId: string, priority: number): FeatureFlag | null {
    const flag = this.flags.get(key);
    if (!flag) return null;

    const rule = flag.rules.find((r) => r.id === ruleId);
    if (rule) {
      rule.priority = priority;
      flag.updatedAt = new Date();
    }

    return flag;
  }

  /**
   * Set percentage rollout for default rule
   */
  setPercentageRollout(key: string, percentage: number): FeatureFlag | null {
    const flag = this.flags.get(key);
    if (!flag) return null;

    // Find or create default rule
    let defaultRule = flag.rules.find((r) => r.conditions.length === 0);
    if (!defaultRule) {
      defaultRule = {
        id: uuidv4(),
        conditions: [],
        value: true,
        percentage,
        priority: 999, // Low priority (last)
      };
      flag.rules.push(defaultRule);
    } else {
      defaultRule.percentage = percentage;
    }

    flag.updatedAt = new Date();

    logger.info('Percentage rollout updated', { key, percentage });

    return flag;
  }

  /**
   * Get all enabled flags for user
   */
  getEnabledFlags(userId: string, context: AssignmentContext = {}): string[] {
    const enabled: string[] = [];

    for (const [key, flag] of this.flags) {
      if (flag.enabled && this.isEnabled(key, userId, context)) {
        enabled.push(key);
      }
    }

    return enabled;
  }

  /**
   * Get statistics
   */
  getStats(): {
    total: number;
    enabled: number;
    disabled: number;
    withRules: number;
  } {
    let enabled = 0;
    let withRules = 0;

    for (const flag of this.flags.values()) {
      if (flag.enabled) enabled++;
      if (flag.rules.length > 0) withRules++;
    }

    return {
      total: this.flags.size,
      enabled,
      disabled: this.flags.size - enabled,
      withRules,
    };
  }
}
