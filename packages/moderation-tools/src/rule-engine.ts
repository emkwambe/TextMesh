import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import {
  ModerationRule,
  RuleType,
  RuleCondition,
  RuleAction,
  ConditionOperator,
} from './types';

export class RuleEngine {
  private redis: Redis;
  private rules: Map<string, ModerationRule> = new Map();
  private readonly rulePrefix = 'moderation:rule:';

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async loadRules(): Promise<void> {
    this.rules.clear();
    let cursor = '0';

    do {
      const [newCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${this.rulePrefix}*`,
        'COUNT',
        100
      );
      cursor = newCursor;

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const rule = this.deserializeRule(data);
          if (rule.isActive) {
            this.rules.set(rule.id, rule);
          }
        }
      }
    } while (cursor !== '0');
  }

  async createRule(
    name: string,
    type: RuleType,
    conditions: RuleCondition[],
    actions: RuleAction[],
    options: {
      description?: string;
      priority?: number;
      createdBy: string;
    }
  ): Promise<ModerationRule> {
    const rule: ModerationRule = {
      id: uuidv4(),
      name,
      description: options.description || '',
      type,
      conditions,
      actions,
      priority: options.priority || 0,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: options.createdBy,
    };

    await this.saveRule(rule);
    this.rules.set(rule.id, rule);

    return rule;
  }

  async updateRule(
    ruleId: string,
    updates: Partial<Pick<ModerationRule, 'name' | 'description' | 'conditions' | 'actions' | 'priority' | 'isActive'>>
  ): Promise<ModerationRule | null> {
    const rule = await this.getRule(ruleId);
    if (!rule) return null;

    Object.assign(rule, updates, { updatedAt: new Date() });
    await this.saveRule(rule);

    if (rule.isActive) {
      this.rules.set(rule.id, rule);
    } else {
      this.rules.delete(rule.id);
    }

    return rule;
  }

  async deleteRule(ruleId: string): Promise<boolean> {
    await this.redis.del(`${this.rulePrefix}${ruleId}`);
    this.rules.delete(ruleId);
    return true;
  }

  async getRule(ruleId: string): Promise<ModerationRule | null> {
    const data = await this.redis.get(`${this.rulePrefix}${ruleId}`);
    if (!data) return null;
    return this.deserializeRule(data);
  }

  async listRules(
    options: {
      type?: RuleType;
      isActive?: boolean;
    } = {}
  ): Promise<ModerationRule[]> {
    const rules: ModerationRule[] = [];
    let cursor = '0';

    do {
      const [newCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${this.rulePrefix}*`,
        'COUNT',
        100
      );
      cursor = newCursor;

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const rule = this.deserializeRule(data);
          if (options.type && rule.type !== options.type) continue;
          if (options.isActive !== undefined && rule.isActive !== options.isActive) continue;
          rules.push(rule);
        }
      }
    } while (cursor !== '0');

    return rules.sort((a, b) => b.priority - a.priority);
  }

  evaluate(
    content: Record<string, unknown>,
    type?: RuleType
  ): { matched: boolean; rules: ModerationRule[]; actions: RuleAction[] } {
    const matchedRules: ModerationRule[] = [];
    const allActions: RuleAction[] = [];

    const sortedRules = Array.from(this.rules.values())
      .filter((rule) => !type || rule.type === type)
      .sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
      if (this.evaluateConditions(rule.conditions, content)) {
        matchedRules.push(rule);
        allActions.push(...rule.actions);
      }
    }

    return {
      matched: matchedRules.length > 0,
      rules: matchedRules,
      actions: this.deduplicateActions(allActions),
    };
  }

  private evaluateConditions(
    conditions: RuleCondition[],
    content: Record<string, unknown>
  ): boolean {
    return conditions.every((condition) =>
      this.evaluateCondition(condition, content)
    );
  }

  private evaluateCondition(
    condition: RuleCondition,
    content: Record<string, unknown>
  ): boolean {
    const fieldValue = this.getFieldValue(content, condition.field);
    const conditionValue = condition.value;

    let compareValue = fieldValue;
    let compareAgainst = conditionValue;

    if (
      !condition.caseSensitive &&
      typeof compareValue === 'string' &&
      typeof compareAgainst === 'string'
    ) {
      compareValue = compareValue.toLowerCase();
      compareAgainst = compareAgainst.toLowerCase();
    }

    switch (condition.operator) {
      case 'equals':
        return compareValue === compareAgainst;

      case 'not_equals':
        return compareValue !== compareAgainst;

      case 'contains':
        if (typeof compareValue !== 'string' || typeof compareAgainst !== 'string') {
          return false;
        }
        return compareValue.includes(compareAgainst);

      case 'not_contains':
        if (typeof compareValue !== 'string' || typeof compareAgainst !== 'string') {
          return true;
        }
        return !compareValue.includes(compareAgainst);

      case 'starts_with':
        if (typeof compareValue !== 'string' || typeof compareAgainst !== 'string') {
          return false;
        }
        return compareValue.startsWith(compareAgainst);

      case 'ends_with':
        if (typeof compareValue !== 'string' || typeof compareAgainst !== 'string') {
          return false;
        }
        return compareValue.endsWith(compareAgainst);

      case 'matches_regex':
        if (typeof fieldValue !== 'string' || typeof conditionValue !== 'string') {
          return false;
        }
        try {
          const regex = new RegExp(
            conditionValue,
            condition.caseSensitive ? '' : 'i'
          );
          return regex.test(fieldValue);
        } catch {
          return false;
        }

      case 'greater_than':
        return (
          typeof compareValue === 'number' &&
          typeof compareAgainst === 'number' &&
          compareValue > compareAgainst
        );

      case 'less_than':
        return (
          typeof compareValue === 'number' &&
          typeof compareAgainst === 'number' &&
          compareValue < compareAgainst
        );

      case 'in':
        if (!Array.isArray(compareAgainst)) return false;
        return compareAgainst.includes(compareValue);

      case 'not_in':
        if (!Array.isArray(compareAgainst)) return true;
        return !compareAgainst.includes(compareValue);

      default:
        return false;
    }
  }

  private getFieldValue(
    content: Record<string, unknown>,
    field: string
  ): unknown {
    const parts = field.split('.');
    let value: unknown = content;

    for (const part of parts) {
      if (value === null || value === undefined) return undefined;
      if (typeof value !== 'object') return undefined;
      value = (value as Record<string, unknown>)[part];
    }

    return value;
  }

  private deduplicateActions(actions: RuleAction[]): RuleAction[] {
    const seen = new Set<string>();
    const unique: RuleAction[] = [];

    for (const action of actions) {
      const key = `${action.type}:${JSON.stringify(action.params || {})}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(action);
      }
    }

    return unique;
  }

  private async saveRule(rule: ModerationRule): Promise<void> {
    await this.redis.set(`${this.rulePrefix}${rule.id}`, JSON.stringify(rule));
  }

  private deserializeRule(data: string): ModerationRule {
    const rule = JSON.parse(data);
    rule.createdAt = new Date(rule.createdAt);
    rule.updatedAt = new Date(rule.updatedAt);
    return rule;
  }
}
