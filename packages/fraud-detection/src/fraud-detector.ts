/**
 * Fraud Detector - Main Service
 *
 * Unified fraud detection service that orchestrates:
 * - Device fingerprint analysis
 * - Geo location analysis
 * - Velocity tracking
 * - Risk scoring
 * - Rule engine
 * - Event logging
 */

import { createLogger } from '@textmesh/logger';
import { v4 as uuidv4 } from 'uuid';
import {
  FraudAssessment,
  FraudEvent,
  FraudRule,
  RuleCondition,
  SessionContext,
  UserBehavior,
  FraudCategory,
} from './types';
import { riskScorer, RiskScorer } from './risk-scorer';
import { deviceFingerprintAnalyzer, DeviceFingerprintAnalyzer } from './device-fingerprint';
import { geoAnalyzer, GeoAnalyzer } from './geo-analyzer';
import { velocityTracker, VelocityTracker } from './velocity-tracker';

const logger = createLogger({ service: 'fraud-detector', level: 'info' });

export interface FraudDetectorConfig {
  enabled: boolean;
  blockThreshold: number;
  challengeThreshold: number;
  reviewThreshold: number;
  enableDeviceFingerprinting: boolean;
  enableGeoAnalysis: boolean;
  enableVelocityTracking: boolean;
  customRules?: FraudRule[];
  onBlock?: (event: FraudEvent) => void;
  onChallenge?: (event: FraudEvent) => void;
  onReview?: (event: FraudEvent) => void;
}

const DEFAULT_CONFIG: FraudDetectorConfig = {
  enabled: true,
  blockThreshold: 90,
  challengeThreshold: 70,
  reviewThreshold: 50,
  enableDeviceFingerprinting: true,
  enableGeoAnalysis: true,
  enableVelocityTracking: true,
};

// Built-in fraud rules
const BUILT_IN_RULES: FraudRule[] = [
  {
    id: 'tor_block',
    name: 'Block Tor Exit Nodes',
    description: 'Block requests from known Tor exit nodes',
    enabled: true,
    priority: 100,
    conditions: [{ field: 'geo.isTor', operator: 'eq', value: true }],
    action: 'block',
    score: 50,
  },
  {
    id: 'bot_block',
    name: 'Block Detected Bots',
    description: 'Block requests from detected bots',
    enabled: true,
    priority: 100,
    conditions: [{ field: 'device.isBot', operator: 'eq', value: true }],
    action: 'block',
    score: 50,
  },
  {
    id: 'impossible_travel',
    name: 'Challenge Impossible Travel',
    description: 'Challenge users with impossible travel patterns',
    enabled: true,
    priority: 90,
    conditions: [{ field: 'geo.impossibleTravel', operator: 'eq', value: true }],
    action: 'challenge',
    score: 40,
  },
  {
    id: 'new_device_sensitive',
    name: 'Challenge New Device on Sensitive Actions',
    description: 'Challenge new devices for sensitive actions',
    enabled: true,
    priority: 80,
    conditions: [
      { field: 'device.isNew', operator: 'eq', value: true },
      { field: 'action', operator: 'in', value: ['password_change', 'email_change', 'payment'] },
    ],
    action: 'challenge',
    score: 30,
  },
  {
    id: 'high_risk_country',
    name: 'Review High Risk Country',
    description: 'Review requests from high-risk countries',
    enabled: true,
    priority: 70,
    conditions: [{ field: 'geo.isHighRiskCountry', operator: 'eq', value: true }],
    action: 'review',
    score: 25,
  },
  {
    id: 'velocity_exceeded',
    name: 'Block Velocity Exceeded',
    description: 'Block when velocity limits are exceeded',
    enabled: true,
    priority: 95,
    conditions: [{ field: 'velocity.exceeded', operator: 'eq', value: true }],
    action: 'block',
    score: 45,
  },
];

export class FraudDetector {
  private config: FraudDetectorConfig;
  private rules: FraudRule[];
  private events: FraudEvent[] = [];
  private riskScorer: RiskScorer;
  private deviceAnalyzer: DeviceFingerprintAnalyzer;
  private geoAnalyzer: GeoAnalyzer;
  private velocityTracker: VelocityTracker;

  constructor(config: Partial<FraudDetectorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.rules = [...BUILT_IN_RULES, ...(config.customRules || [])];
    this.riskScorer = riskScorer;
    this.deviceAnalyzer = deviceFingerprintAnalyzer;
    this.geoAnalyzer = geoAnalyzer;
    this.velocityTracker = velocityTracker;
  }

  /**
   * Evaluate session for fraud
   */
  async evaluate(
    session: SessionContext,
    action: string,
    userBehavior?: UserBehavior
  ): Promise<FraudAssessment> {
    if (!this.config.enabled) {
      return this.createAllowedAssessment();
    }

    const startTime = Date.now();

    // Gather analysis data
    const analysisData = await this.gatherAnalysisData(session, action);

    // Get risk assessment
    const assessment = this.riskScorer.assess({
      session,
      action,
      userBehavior,
      additionalSignals: [],
    });

    // Apply custom rules
    const ruleResult = this.applyRules(analysisData, action);
    if (ruleResult.triggered) {
      assessment.riskScore = Math.max(assessment.riskScore, ruleResult.score);
      assessment.recommendation = this.escalateRecommendation(
        assessment.recommendation,
        ruleResult.action
      );
      assessment.reasons.push(...ruleResult.reasons);
    }

    // Apply threshold-based decisions
    assessment.recommendation = this.applyThresholds(assessment.riskScore);

    // Log event
    const event = this.logEvent(session, action, assessment);

    // Trigger callbacks
    this.triggerCallbacks(event, assessment);

    logger.info('Fraud evaluation completed', {
      sessionId: session.sessionId,
      userId: session.userId,
      action,
      riskScore: assessment.riskScore,
      recommendation: assessment.recommendation,
      duration: Date.now() - startTime,
    });

    return assessment;
  }

  /**
   * Gather analysis data
   */
  private async gatherAnalysisData(
    session: SessionContext,
    action: string
  ): Promise<Record<string, unknown>> {
    const data: Record<string, unknown> = {
      action,
      session,
    };

    // Device analysis
    if (this.config.enableDeviceFingerprinting) {
      const deviceResult = this.deviceAnalyzer.analyze(session.device, session.userId);
      data.device = {
        ...deviceResult,
        isNew: session.userId
          ? !this.deviceAnalyzer.isTrustedDevice(deviceResult.fingerprintId, session.userId)
          : true,
      };
    }

    // Geo analysis
    if (this.config.enableGeoAnalysis) {
      const geoResult = this.geoAnalyzer.analyze(session.ip, session.userId);
      data.geo = geoResult;
    }

    // Velocity check
    if (this.config.enableVelocityTracking) {
      const velocityResult = this.velocityTracker.check(action, {
        userId: session.userId,
        ip: session.ip,
        deviceId: (data.device as Record<string, unknown>)?.fingerprintId as string,
      });
      data.velocity = {
        checks: velocityResult,
        exceeded: velocityResult.some((c) => c.exceeded),
      };
    }

    return data;
  }

  /**
   * Apply fraud rules
   */
  private applyRules(
    data: Record<string, unknown>,
    action: string
  ): {
    triggered: boolean;
    action: FraudRule['action'];
    score: number;
    reasons: string[];
  } {
    const triggeredRules: FraudRule[] = [];

    // Sort rules by priority
    const sortedRules = [...this.rules].sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
      if (!rule.enabled) continue;

      const matches = this.evaluateConditions(rule.conditions, data);
      if (matches) {
        triggeredRules.push(rule);
      }
    }

    if (triggeredRules.length === 0) {
      return { triggered: false, action: 'flag', score: 0, reasons: [] };
    }

    // Use highest priority rule's action
    const primaryRule = triggeredRules[0];
    const totalScore = triggeredRules.reduce((sum, r) => sum + r.score, 0);

    return {
      triggered: true,
      action: primaryRule.action,
      score: Math.min(100, totalScore),
      reasons: triggeredRules.map((r) => `Rule triggered: ${r.name}`),
    };
  }

  /**
   * Evaluate rule conditions
   */
  private evaluateConditions(
    conditions: RuleCondition[],
    data: Record<string, unknown>
  ): boolean {
    for (const condition of conditions) {
      const value = this.getNestedValue(data, condition.field);
      const matches = this.evaluateCondition(value, condition.operator, condition.value);

      if (!matches) return false;
    }

    return true;
  }

  /**
   * Get nested value from object
   */
  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  /**
   * Evaluate single condition
   */
  private evaluateCondition(
    value: unknown,
    operator: RuleCondition['operator'],
    expected: unknown
  ): boolean {
    switch (operator) {
      case 'eq':
        return value === expected;
      case 'neq':
        return value !== expected;
      case 'gt':
        return Number(value) > Number(expected);
      case 'gte':
        return Number(value) >= Number(expected);
      case 'lt':
        return Number(value) < Number(expected);
      case 'lte':
        return Number(value) <= Number(expected);
      case 'in':
        return Array.isArray(expected) && expected.includes(value);
      case 'nin':
        return Array.isArray(expected) && !expected.includes(value);
      case 'regex':
        return new RegExp(String(expected)).test(String(value));
      case 'exists':
        return expected ? value !== undefined : value === undefined;
      default:
        return false;
    }
  }

  /**
   * Escalate recommendation
   */
  private escalateRecommendation(
    current: FraudAssessment['recommendation'],
    fromRule: FraudRule['action']
  ): FraudAssessment['recommendation'] {
    const priority: Record<string, number> = {
      block: 4,
      challenge: 3,
      review: 2,
      flag: 1,
      allow: 0,
    };

    const ruleAction = fromRule === 'flag' ? 'review' : fromRule;
    return priority[ruleAction] > priority[current] ? ruleAction : current;
  }

  /**
   * Apply thresholds
   */
  private applyThresholds(score: number): FraudAssessment['recommendation'] {
    if (score >= this.config.blockThreshold) return 'block';
    if (score >= this.config.challengeThreshold) return 'challenge';
    if (score >= this.config.reviewThreshold) return 'review';
    return 'allow';
  }

  /**
   * Create allowed assessment
   */
  private createAllowedAssessment(): FraudAssessment {
    return {
      riskScore: 0,
      riskLevel: 'low',
      fraudProbability: 0,
      signals: [],
      categories: [],
      recommendation: 'allow',
      requiresMFA: false,
      reasons: ['Fraud detection disabled'],
    };
  }

  /**
   * Log fraud event
   */
  private logEvent(
    session: SessionContext,
    action: string,
    assessment: FraudAssessment
  ): FraudEvent {
    const event: FraudEvent = {
      id: uuidv4(),
      timestamp: new Date(),
      userId: session.userId,
      sessionId: session.sessionId,
      eventType: action,
      ip: session.ip,
      device: session.device,
      assessment,
      actionTaken: assessment.recommendation,
      resolved: false,
    };

    this.events.push(event);

    // Keep last 10000 events
    if (this.events.length > 10000) {
      this.events = this.events.slice(-10000);
    }

    return event;
  }

  /**
   * Trigger callbacks
   */
  private triggerCallbacks(event: FraudEvent, assessment: FraudAssessment): void {
    switch (assessment.recommendation) {
      case 'block':
        this.config.onBlock?.(event);
        break;
      case 'challenge':
        this.config.onChallenge?.(event);
        break;
      case 'review':
        this.config.onReview?.(event);
        break;
    }
  }

  /**
   * Add custom rule
   */
  addRule(rule: FraudRule): void {
    this.rules.push(rule);
  }

  /**
   * Remove rule by ID
   */
  removeRule(ruleId: string): void {
    this.rules = this.rules.filter((r) => r.id !== ruleId);
  }

  /**
   * Enable/disable rule
   */
  setRuleEnabled(ruleId: string, enabled: boolean): void {
    const rule = this.rules.find((r) => r.id === ruleId);
    if (rule) {
      rule.enabled = enabled;
    }
  }

  /**
   * Get all rules
   */
  getRules(): FraudRule[] {
    return [...this.rules];
  }

  /**
   * Get recent events
   */
  getRecentEvents(limit: number = 100): FraudEvent[] {
    return this.events.slice(-limit);
  }

  /**
   * Get events for user
   */
  getUserEvents(userId: string, limit: number = 50): FraudEvent[] {
    return this.events
      .filter((e) => e.userId === userId)
      .slice(-limit);
  }

  /**
   * Get events by category
   */
  getEventsByCategory(category: FraudCategory): FraudEvent[] {
    return this.events.filter((e) => e.assessment.categories.includes(category));
  }

  /**
   * Resolve event
   */
  resolveEvent(eventId: string, notes?: string): void {
    const event = this.events.find((e) => e.id === eventId);
    if (event) {
      event.resolved = true;
      event.notes = notes;
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalEvents: number;
    blocked: number;
    challenged: number;
    reviewed: number;
    allowed: number;
    unresolvedCount: number;
    riskDistribution: Record<string, number>;
  } {
    const stats = {
      totalEvents: this.events.length,
      blocked: 0,
      challenged: 0,
      reviewed: 0,
      allowed: 0,
      unresolvedCount: 0,
      riskDistribution: {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0,
      },
    };

    for (const event of this.events) {
      switch (event.actionTaken) {
        case 'block':
          stats.blocked++;
          break;
        case 'challenge':
          stats.challenged++;
          break;
        case 'review':
          stats.reviewed++;
          break;
        default:
          stats.allowed++;
      }

      if (!event.resolved) {
        stats.unresolvedCount++;
      }

      stats.riskDistribution[event.assessment.riskLevel]++;
    }

    return stats;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<FraudDetectorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): FraudDetectorConfig {
    return { ...this.config };
  }
}

// Export singleton instance
export const fraudDetector = new FraudDetector();

// Export factory function
export function createFraudDetector(config?: Partial<FraudDetectorConfig>): FraudDetector {
  return new FraudDetector(config);
}
