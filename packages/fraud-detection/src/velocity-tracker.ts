/**
 * Velocity Tracker
 *
 * Tracks and limits the rate of actions to detect:
 * - Credential stuffing
 * - Brute force attacks
 * - Account enumeration
 * - Automated abuse
 */

import { createLogger } from '@textmesh/logger';
import { VelocityCheck, FraudSignal } from './types';

const logger = createLogger({ service: 'velocity-tracker', level: 'info' });

export interface VelocityRule {
  action: string;
  limit: number;
  windowMs: number;
  scope: 'user' | 'ip' | 'device' | 'global';
}

export interface VelocityResult {
  allowed: boolean;
  current: number;
  limit: number;
  remaining: number;
  resetAt: Date;
  signals: FraudSignal[];
}

// Default velocity rules
const DEFAULT_RULES: VelocityRule[] = [
  // Login attempts
  { action: 'login', limit: 5, windowMs: 60000, scope: 'ip' }, // 5 per minute per IP
  { action: 'login', limit: 10, windowMs: 3600000, scope: 'user' }, // 10 per hour per user
  { action: 'login_failed', limit: 3, windowMs: 60000, scope: 'ip' }, // 3 failures per minute

  // Registration
  { action: 'register', limit: 3, windowMs: 3600000, scope: 'ip' }, // 3 per hour per IP
  { action: 'register', limit: 10, windowMs: 86400000, scope: 'ip' }, // 10 per day per IP

  // Password reset
  { action: 'password_reset', limit: 3, windowMs: 3600000, scope: 'ip' }, // 3 per hour
  { action: 'password_reset', limit: 5, windowMs: 86400000, scope: 'user' }, // 5 per day

  // API calls
  { action: 'api_call', limit: 100, windowMs: 60000, scope: 'user' }, // 100 per minute
  { action: 'api_call', limit: 1000, windowMs: 3600000, scope: 'user' }, // 1000 per hour

  // Content creation
  { action: 'post_create', limit: 10, windowMs: 60000, scope: 'user' }, // 10 per minute
  { action: 'comment_create', limit: 30, windowMs: 60000, scope: 'user' }, // 30 per minute
  { action: 'message_send', limit: 50, windowMs: 60000, scope: 'user' }, // 50 per minute

  // Profile changes
  { action: 'profile_update', limit: 5, windowMs: 3600000, scope: 'user' }, // 5 per hour
  { action: 'email_change', limit: 2, windowMs: 86400000, scope: 'user' }, // 2 per day
];

interface WindowEntry {
  count: number;
  windowStart: number;
  timestamps: number[];
}

export class VelocityTracker {
  private rules: VelocityRule[];
  private windows: Map<string, WindowEntry> = new Map();

  constructor(customRules?: VelocityRule[]) {
    this.rules = customRules || DEFAULT_RULES;
  }

  /**
   * Track an action and check velocity limits
   */
  track(
    action: string,
    identifiers: {
      userId?: string;
      ip?: string;
      deviceId?: string;
    }
  ): VelocityResult {
    const applicableRules = this.rules.filter((r) => r.action === action);
    const signals: FraudSignal[] = [];
    let allowed = true;
    let lowestRemaining = Infinity;
    let nearestReset = new Date();
    let currentCount = 0;
    let limit = 0;

    for (const rule of applicableRules) {
      const scopeId = this.getScopeId(rule.scope, identifiers);
      if (!scopeId) continue;

      const key = `${action}:${rule.scope}:${scopeId}`;
      const result = this.checkAndIncrement(key, rule);

      if (!result.allowed) {
        allowed = false;
        signals.push({
          type: 'velocity_exceeded',
          value: 1,
          weight: 0.5,
          details: {
            action,
            scope: rule.scope,
            limit: rule.limit,
            count: result.current,
            windowMs: rule.windowMs,
          },
        });
      }

      if (result.remaining < lowestRemaining) {
        lowestRemaining = result.remaining;
        currentCount = result.current;
        limit = rule.limit;
        nearestReset = result.resetAt;
      }
    }

    return {
      allowed,
      current: currentCount,
      limit,
      remaining: Math.max(0, lowestRemaining),
      resetAt: nearestReset,
      signals,
    };
  }

  /**
   * Check and increment window counter
   */
  private checkAndIncrement(
    key: string,
    rule: VelocityRule
  ): {
    allowed: boolean;
    current: number;
    remaining: number;
    resetAt: Date;
  } {
    const now = Date.now();
    let entry = this.windows.get(key);

    // Initialize or reset window
    if (!entry || now - entry.windowStart >= rule.windowMs) {
      entry = {
        count: 0,
        windowStart: now,
        timestamps: [],
      };
    }

    // Clean old timestamps
    entry.timestamps = entry.timestamps.filter((t) => now - t < rule.windowMs);
    entry.count = entry.timestamps.length;

    // Check limit
    const allowed = entry.count < rule.limit;

    // Increment if allowed
    if (allowed) {
      entry.count++;
      entry.timestamps.push(now);
    }

    this.windows.set(key, entry);

    return {
      allowed,
      current: entry.count,
      remaining: rule.limit - entry.count,
      resetAt: new Date(entry.windowStart + rule.windowMs),
    };
  }

  /**
   * Get scope identifier
   */
  private getScopeId(
    scope: VelocityRule['scope'],
    identifiers: {
      userId?: string;
      ip?: string;
      deviceId?: string;
    }
  ): string | null {
    switch (scope) {
      case 'user':
        return identifiers.userId || null;
      case 'ip':
        return identifiers.ip || null;
      case 'device':
        return identifiers.deviceId || null;
      case 'global':
        return 'global';
      default:
        return null;
    }
  }

  /**
   * Check all applicable rules without incrementing
   */
  check(
    action: string,
    identifiers: {
      userId?: string;
      ip?: string;
      deviceId?: string;
    }
  ): VelocityCheck[] {
    const applicableRules = this.rules.filter((r) => r.action === action);
    const checks: VelocityCheck[] = [];

    for (const rule of applicableRules) {
      const scopeId = this.getScopeId(rule.scope, identifiers);
      if (!scopeId) continue;

      const key = `${action}:${rule.scope}:${scopeId}`;
      const entry = this.windows.get(key);
      const now = Date.now();

      let count = 0;
      if (entry && now - entry.windowStart < rule.windowMs) {
        count = entry.timestamps.filter((t) => now - t < rule.windowMs).length;
      }

      checks.push({
        action,
        count,
        windowMs: rule.windowMs,
        limit: rule.limit,
        exceeded: count >= rule.limit,
      });
    }

    return checks;
  }

  /**
   * Get current counts for an identifier
   */
  getCounts(
    identifiers: {
      userId?: string;
      ip?: string;
      deviceId?: string;
    }
  ): Record<string, number> {
    const counts: Record<string, number> = {};
    const now = Date.now();

    for (const rule of this.rules) {
      const scopeId = this.getScopeId(rule.scope, identifiers);
      if (!scopeId) continue;

      const key = `${action}:${rule.scope}:${scopeId}`;
      const entry = this.windows.get(key);

      if (entry && now - entry.windowStart < rule.windowMs) {
        const count = entry.timestamps.filter((t) => now - t < rule.windowMs).length;
        const countKey = `${rule.action}:${rule.scope}`;
        counts[countKey] = (counts[countKey] || 0) + count;
      }
    }

    return counts;
  }

  /**
   * Reset velocity for a specific scope
   */
  reset(
    action: string,
    scope: VelocityRule['scope'],
    scopeId: string
  ): void {
    const key = `${action}:${scope}:${scopeId}`;
    this.windows.delete(key);
  }

  /**
   * Reset all velocities for an identifier
   */
  resetAll(identifiers: {
    userId?: string;
    ip?: string;
    deviceId?: string;
  }): void {
    const keysToDelete: string[] = [];

    for (const [key] of this.windows) {
      const [, scope, scopeId] = key.split(':');

      if (
        (scope === 'user' && scopeId === identifiers.userId) ||
        (scope === 'ip' && scopeId === identifiers.ip) ||
        (scope === 'device' && scopeId === identifiers.deviceId)
      ) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.windows.delete(key);
    }
  }

  /**
   * Add custom rule
   */
  addRule(rule: VelocityRule): void {
    this.rules.push(rule);
  }

  /**
   * Remove rule
   */
  removeRule(action: string, scope: VelocityRule['scope']): void {
    this.rules = this.rules.filter((r) => !(r.action === action && r.scope === scope));
  }

  /**
   * Get all rules
   */
  getRules(): VelocityRule[] {
    return [...this.rules];
  }

  /**
   * Clean up expired windows
   */
  cleanup(): void {
    const now = Date.now();
    const maxWindow = Math.max(...this.rules.map((r) => r.windowMs));

    for (const [key, entry] of this.windows) {
      if (now - entry.windowStart > maxWindow) {
        this.windows.delete(key);
      }
    }
  }
}

export const velocityTracker = new VelocityTracker();
