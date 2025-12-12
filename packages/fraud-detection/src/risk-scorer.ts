/**
 * Risk Scoring Engine
 *
 * Calculates overall fraud risk scores by combining:
 * - Device fingerprint analysis
 * - Geo location analysis
 * - Velocity checks
 * - Behavioral signals
 * - Historical data
 */

import { createLogger } from '@textmesh/logger';
import {
  FraudAssessment,
  FraudSignal,
  RiskLevel,
  FraudCategory,
  SessionContext,
  UserBehavior,
} from './types';
import { deviceFingerprintAnalyzer, DeviceAnalysis } from './device-fingerprint';
import { geoAnalyzer, GeoAnalysis } from './geo-analyzer';
import { velocityTracker, VelocityResult } from './velocity-tracker';

const logger = createLogger({ service: 'risk-scorer', level: 'info' });

// Risk weights for different signal categories
const RISK_WEIGHTS = {
  device: 0.25,
  geo: 0.25,
  velocity: 0.20,
  behavior: 0.20,
  history: 0.10,
};

// Risk thresholds
const RISK_THRESHOLDS = {
  low: 25,
  medium: 50,
  high: 75,
  critical: 90,
};

export interface RiskAssessmentInput {
  session: SessionContext;
  action: string;
  userBehavior?: UserBehavior;
  additionalSignals?: FraudSignal[];
}

export interface RiskScoreBreakdown {
  device: number;
  geo: number;
  velocity: number;
  behavior: number;
  history: number;
}

export class RiskScorer {
  private userRiskHistory: Map<string, number[]> = new Map();

  /**
   * Calculate risk assessment
   */
  assess(input: RiskAssessmentInput): FraudAssessment {
    const signals: FraudSignal[] = [];
    const categories: FraudCategory[] = [];
    const reasons: string[] = [];
    const breakdown: RiskScoreBreakdown = {
      device: 0,
      geo: 0,
      velocity: 0,
      behavior: 0,
      history: 0,
    };

    // 1. Analyze device fingerprint
    const deviceAnalysis = deviceFingerprintAnalyzer.analyze(
      input.session.device,
      input.session.userId
    );
    breakdown.device = 100 - deviceAnalysis.trustScore;
    signals.push(...deviceAnalysis.signals);
    reasons.push(...deviceAnalysis.reasons);

    if (deviceAnalysis.isBot) {
      categories.push('bot_activity');
    }

    // 2. Analyze geo location
    const geoAnalysis = geoAnalyzer.analyze(input.session.ip, input.session.userId);
    breakdown.geo = geoAnalysis.riskScore;
    signals.push(...geoAnalysis.signals);
    reasons.push(...geoAnalysis.reasons);

    if (geoAnalysis.impossibleTravel) {
      categories.push('account_takeover');
    }

    // 3. Check velocity limits
    const velocityResult = velocityTracker.track(input.action, {
      userId: input.session.userId,
      ip: input.session.ip,
      deviceId: deviceAnalysis.fingerprintId,
    });
    breakdown.velocity = velocityResult.allowed ? 0 : 60;
    signals.push(...velocityResult.signals);

    if (!velocityResult.allowed) {
      reasons.push('Velocity limit exceeded');
      categories.push('abuse');
    }

    // 4. Analyze user behavior
    if (input.userBehavior) {
      const behaviorAnalysis = this.analyzeBehavior(input.session, input.userBehavior);
      breakdown.behavior = behaviorAnalysis.riskScore;
      signals.push(...behaviorAnalysis.signals);
      reasons.push(...behaviorAnalysis.reasons);

      if (behaviorAnalysis.categories.length > 0) {
        categories.push(...behaviorAnalysis.categories);
      }
    }

    // 5. Check historical risk
    if (input.session.userId) {
      breakdown.history = this.getHistoricalRisk(input.session.userId);
    }

    // Add additional signals
    if (input.additionalSignals) {
      signals.push(...input.additionalSignals);
    }

    // Calculate weighted risk score
    const riskScore = this.calculateWeightedScore(breakdown);

    // Determine risk level
    const riskLevel = this.getRiskLevel(riskScore);

    // Determine fraud probability
    const fraudProbability = this.calculateFraudProbability(signals);

    // Determine recommendation
    const recommendation = this.getRecommendation(riskScore, riskLevel, categories);

    // Determine if MFA is required
    const requiresMFA = this.shouldRequireMFA(riskScore, riskLevel, input);

    // Store in risk history
    if (input.session.userId) {
      this.updateRiskHistory(input.session.userId, riskScore);
    }

    return {
      riskScore: Math.round(riskScore),
      riskLevel,
      fraudProbability,
      signals,
      categories: [...new Set(categories)],
      recommendation,
      requiresMFA,
      reasons,
    };
  }

  /**
   * Analyze user behavior patterns
   */
  private analyzeBehavior(
    session: SessionContext,
    behavior: UserBehavior
  ): {
    riskScore: number;
    signals: FraudSignal[];
    reasons: string[];
    categories: FraudCategory[];
  } {
    const signals: FraudSignal[] = [];
    const reasons: string[] = [];
    const categories: FraudCategory[] = [];
    let riskScore = 0;

    // Check failed login ratio
    if (behavior.loginAttempts > 0) {
      const failRatio = behavior.failedLogins / behavior.loginAttempts;
      if (failRatio > 0.5) {
        signals.push({
          type: 'high_fail_ratio',
          value: failRatio,
          weight: 0.3,
        });
        reasons.push('High failed login ratio');
        riskScore += 25;

        if (failRatio > 0.8) {
          categories.push('credential_stuffing');
        }
      }
    }

    // Check for new account
    if (behavior.accountAge < 1) {
      signals.push({
        type: 'new_account',
        value: 0.5,
        weight: 0.2,
      });
      reasons.push('New account (less than 1 day old)');
      riskScore += 15;
    }

    // Check for unusual login time
    const currentHour = session.timestamp.getHours();
    if (!behavior.typicalLoginHours.includes(currentHour)) {
      signals.push({
        type: 'unusual_login_time',
        value: 0.3,
        weight: 0.1,
        details: { hour: currentHour, typical: behavior.typicalLoginHours },
      });
      reasons.push('Login at unusual time');
      riskScore += 10;
    }

    // Check for suspicious activity count
    if (behavior.suspiciousActivities > 5) {
      signals.push({
        type: 'suspicious_history',
        value: 0.7,
        weight: 0.3,
        details: { count: behavior.suspiciousActivities },
      });
      reasons.push('History of suspicious activity');
      riskScore += 30;
    }

    // Check for frequent password resets
    if (behavior.passwordResets > 3) {
      signals.push({
        type: 'frequent_password_resets',
        value: 0.5,
        weight: 0.2,
      });
      reasons.push('Frequent password resets');
      riskScore += 15;
      categories.push('account_takeover');
    }

    // Check for new device
    const deviceId = session.device.id;
    if (deviceId && !behavior.trustedDevices.includes(deviceId)) {
      signals.push({
        type: 'new_device',
        value: 0.4,
        weight: 0.2,
      });
      reasons.push('Login from new device');
      riskScore += 15;
    }

    return {
      riskScore: Math.min(100, riskScore),
      signals,
      reasons,
      categories,
    };
  }

  /**
   * Calculate weighted risk score
   */
  private calculateWeightedScore(breakdown: RiskScoreBreakdown): number {
    return (
      breakdown.device * RISK_WEIGHTS.device +
      breakdown.geo * RISK_WEIGHTS.geo +
      breakdown.velocity * RISK_WEIGHTS.velocity +
      breakdown.behavior * RISK_WEIGHTS.behavior +
      breakdown.history * RISK_WEIGHTS.history
    );
  }

  /**
   * Get risk level from score
   */
  private getRiskLevel(score: number): RiskLevel {
    if (score >= RISK_THRESHOLDS.critical) return 'critical';
    if (score >= RISK_THRESHOLDS.high) return 'high';
    if (score >= RISK_THRESHOLDS.medium) return 'medium';
    return 'low';
  }

  /**
   * Calculate fraud probability from signals
   */
  private calculateFraudProbability(signals: FraudSignal[]): number {
    if (signals.length === 0) return 0;

    let totalWeight = 0;
    let weightedSum = 0;

    for (const signal of signals) {
      weightedSum += signal.value * signal.weight;
      totalWeight += signal.weight;
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  /**
   * Get recommendation based on risk assessment
   */
  private getRecommendation(
    score: number,
    level: RiskLevel,
    categories: FraudCategory[]
  ): FraudAssessment['recommendation'] {
    // Always block if critical risk
    if (level === 'critical') return 'block';

    // Block for specific high-risk categories
    if (
      categories.includes('bot_activity') ||
      categories.includes('credential_stuffing')
    ) {
      return 'block';
    }

    // Challenge for high risk
    if (level === 'high') return 'challenge';

    // Review for medium risk with account takeover signals
    if (level === 'medium' && categories.includes('account_takeover')) {
      return 'challenge';
    }

    // Review for medium risk
    if (level === 'medium') return 'review';

    // Allow for low risk
    return 'allow';
  }

  /**
   * Determine if MFA should be required
   */
  private shouldRequireMFA(
    score: number,
    level: RiskLevel,
    input: RiskAssessmentInput
  ): boolean {
    // Always require MFA for high-risk actions
    const highRiskActions = ['login', 'password_change', 'email_change', 'payment'];
    if (highRiskActions.includes(input.action) && level !== 'low') {
      return true;
    }

    // Require MFA for new devices
    if (
      input.userBehavior &&
      input.session.device.id &&
      !input.userBehavior.trustedDevices.includes(input.session.device.id)
    ) {
      return true;
    }

    // Require MFA for score above threshold
    return score > RISK_THRESHOLDS.medium;
  }

  /**
   * Get historical risk for user
   */
  private getHistoricalRisk(userId: string): number {
    const history = this.userRiskHistory.get(userId);
    if (!history || history.length === 0) return 0;

    // Calculate average of recent risk scores
    const recent = history.slice(-10);
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length;

    return avg;
  }

  /**
   * Update risk history
   */
  private updateRiskHistory(userId: string, score: number): void {
    const history = this.userRiskHistory.get(userId) || [];
    history.push(score);

    // Keep last 100 scores
    if (history.length > 100) {
      history.shift();
    }

    this.userRiskHistory.set(userId, history);
  }

  /**
   * Get risk statistics for user
   */
  getRiskStats(userId: string): {
    average: number;
    max: number;
    min: number;
    trend: 'increasing' | 'decreasing' | 'stable';
    samples: number;
  } {
    const history = this.userRiskHistory.get(userId);

    if (!history || history.length === 0) {
      return { average: 0, max: 0, min: 0, trend: 'stable', samples: 0 };
    }

    const average = history.reduce((a, b) => a + b, 0) / history.length;
    const max = Math.max(...history);
    const min = Math.min(...history);

    // Calculate trend
    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (history.length >= 5) {
      const recent = history.slice(-5);
      const older = history.slice(-10, -5);

      if (older.length > 0) {
        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

        if (recentAvg > olderAvg + 10) trend = 'increasing';
        else if (recentAvg < olderAvg - 10) trend = 'decreasing';
      }
    }

    return { average, max, min, trend, samples: history.length };
  }

  /**
   * Clear risk history for user
   */
  clearHistory(userId: string): void {
    this.userRiskHistory.delete(userId);
  }
}

export const riskScorer = new RiskScorer();
