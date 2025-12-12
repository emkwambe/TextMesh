/**
 * Statistics Module
 *
 * Statistical analysis for A/B tests
 */

import { createLogger } from '@textmesh/logger';
import {
  Experiment,
  ExperimentResult,
  VariantResult,
  ExperimentEvent,
} from './types';

const logger = createLogger({ service: 'statistics', level: 'info' });

export class StatisticsEngine {
  private significanceLevel: number = 0.05;
  private minimumSampleSize: number = 100;

  /**
   * Calculate experiment results
   */
  calculateResults(
    experiment: Experiment,
    events: ExperimentEvent[]
  ): ExperimentResult {
    const variantResults: VariantResult[] = [];
    let controlResult: VariantResult | null = null;

    // Group events by variant
    const eventsByVariant = this.groupEventsByVariant(events);

    // Calculate results for each variant
    for (const variant of experiment.variants) {
      const variantEvents = eventsByVariant.get(variant.id) || [];
      const result = this.calculateVariantResult(
        variant.id,
        variant.name,
        variantEvents,
        experiment.metrics
      );

      variantResults.push(result);

      if (variant.type === 'control') {
        controlResult = result;
      }
    }

    // Calculate improvement vs control
    if (controlResult) {
      for (const result of variantResults) {
        if (result.variantId !== controlResult.variantId) {
          result.improvement = this.calculateImprovement(
            result.conversionRate,
            controlResult.conversionRate
          );

          // Calculate statistical significance
          const significance = this.calculateSignificance(
            controlResult.participants,
            controlResult.conversions,
            result.participants,
            result.conversions
          );

          result.pValue = significance.pValue;
          result.confidenceInterval = significance.confidenceInterval;
        }
      }
    }

    // Determine winner
    const isSignificant = variantResults.some(
      (r) => r.pValue <= this.significanceLevel && r.variantId !== controlResult?.variantId
    );

    let winner: string | undefined;
    if (isSignificant) {
      const best = variantResults
        .filter((r) => r.variantId !== controlResult?.variantId)
        .reduce((a, b) => (a.improvement > b.improvement ? a : b));

      if (best.pValue <= this.significanceLevel) {
        winner = best.variantId;
      }
    }

    const totalParticipants = variantResults.reduce((sum, r) => sum + r.participants, 0);

    return {
      experimentId: experiment.id,
      startDate: experiment.startDate || new Date(),
      endDate: experiment.endDate || new Date(),
      totalParticipants,
      variantResults,
      winner,
      confidence: 1 - (isSignificant ? this.significanceLevel : 1),
      isStatisticallySignificant: isSignificant,
    };
  }

  /**
   * Group events by variant
   */
  private groupEventsByVariant(events: ExperimentEvent[]): Map<string, ExperimentEvent[]> {
    const grouped = new Map<string, ExperimentEvent[]>();

    for (const event of events) {
      const list = grouped.get(event.variantId) || [];
      list.push(event);
      grouped.set(event.variantId, list);
    }

    return grouped;
  }

  /**
   * Calculate results for a single variant
   */
  private calculateVariantResult(
    variantId: string,
    variantName: string,
    events: ExperimentEvent[],
    metrics: Experiment['metrics']
  ): VariantResult {
    // Count unique participants
    const uniqueUsers = new Set(events.map((e) => e.userId));
    const participants = uniqueUsers.size;

    // Find primary metric
    const primaryMetric = metrics.find((m) => m.isPrimary) || metrics[0];

    // Count conversions for primary metric
    const conversions = primaryMetric
      ? events.filter((e) => e.eventName === primaryMetric.eventName).length
      : 0;

    const conversionRate = participants > 0 ? conversions / participants : 0;

    return {
      variantId,
      variantName,
      participants,
      conversions,
      conversionRate,
      improvement: 0,
      confidenceInterval: [0, 0],
      pValue: 1,
    };
  }

  /**
   * Calculate improvement percentage
   */
  private calculateImprovement(treatment: number, control: number): number {
    if (control === 0) return 0;
    return ((treatment - control) / control) * 100;
  }

  /**
   * Calculate statistical significance using two-proportion z-test
   */
  private calculateSignificance(
    controlN: number,
    controlConversions: number,
    treatmentN: number,
    treatmentConversions: number
  ): {
    pValue: number;
    confidenceInterval: [number, number];
  } {
    if (controlN < this.minimumSampleSize || treatmentN < this.minimumSampleSize) {
      return { pValue: 1, confidenceInterval: [0, 0] };
    }

    const p1 = controlConversions / controlN;
    const p2 = treatmentConversions / treatmentN;

    // Pooled proportion
    const pPool = (controlConversions + treatmentConversions) / (controlN + treatmentN);

    // Standard error
    const se = Math.sqrt(pPool * (1 - pPool) * (1 / controlN + 1 / treatmentN));

    if (se === 0) {
      return { pValue: 1, confidenceInterval: [p2 - p1, p2 - p1] };
    }

    // Z-score
    const z = (p2 - p1) / se;

    // P-value (two-tailed)
    const pValue = 2 * (1 - this.normalCDF(Math.abs(z)));

    // Confidence interval for the difference
    const zAlpha = 1.96; // 95% confidence
    const seDiff = Math.sqrt((p1 * (1 - p1)) / controlN + (p2 * (1 - p2)) / treatmentN);
    const diff = p2 - p1;
    const ci: [number, number] = [diff - zAlpha * seDiff, diff + zAlpha * seDiff];

    return { pValue, confidenceInterval: ci };
  }

  /**
   * Normal cumulative distribution function (approximation)
   */
  private normalCDF(z: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = z < 0 ? -1 : 1;
    z = Math.abs(z) / Math.sqrt(2);

    const t = 1.0 / (1.0 + p * z);
    const y =
      1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);

    return 0.5 * (1.0 + sign * y);
  }

  /**
   * Calculate required sample size for experiment
   */
  calculateRequiredSampleSize(params: {
    baselineConversionRate: number;
    minimumDetectableEffect: number;
    significanceLevel?: number;
    power?: number;
  }): number {
    const alpha = params.significanceLevel || this.significanceLevel;
    const beta = 1 - (params.power || 0.8);

    const p1 = params.baselineConversionRate;
    const p2 = p1 * (1 + params.minimumDetectableEffect);

    const zAlpha = this.inverseCDF(1 - alpha / 2);
    const zBeta = this.inverseCDF(1 - beta);

    const pBar = (p1 + p2) / 2;

    const n =
      (2 *
        Math.pow(zAlpha * Math.sqrt(2 * pBar * (1 - pBar)) + zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2)), 2)) /
      Math.pow(p2 - p1, 2);

    return Math.ceil(n);
  }

  /**
   * Inverse normal CDF (approximation)
   */
  private inverseCDF(p: number): number {
    // Rational approximation
    const a = [
      -3.969683028665376e1,
      2.209460984245205e2,
      -2.759285104469687e2,
      1.383577518672690e2,
      -3.066479806614716e1,
      2.506628277459239e0,
    ];
    const b = [
      -5.447609879822406e1,
      1.615858368580409e2,
      -1.556989798598866e2,
      6.680131188771972e1,
      -1.328068155288572e1,
    ];
    const c = [
      -7.784894002430293e-3,
      -3.223964580411365e-1,
      -2.400758277161838e0,
      -2.549732539343734e0,
      4.374664141464968e0,
      2.938163982698783e0,
    ];
    const d = [
      7.784695709041462e-3,
      3.224671290700398e-1,
      2.445134137142996e0,
      3.754408661907416e0,
    ];

    const pLow = 0.02425;
    const pHigh = 1 - pLow;

    let q: number;
    let r: number;

    if (p < pLow) {
      q = Math.sqrt(-2 * Math.log(p));
      return (
        (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
      );
    } else if (p <= pHigh) {
      q = p - 0.5;
      r = q * q;
      return (
        ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
        (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
      );
    } else {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return (
        -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
      );
    }
  }

  /**
   * Calculate experiment duration estimate
   */
  estimateDuration(params: {
    requiredSampleSize: number;
    dailyTraffic: number;
    allocation: number;
  }): number {
    const eligibleTraffic = params.dailyTraffic * (params.allocation / 100);
    return Math.ceil(params.requiredSampleSize / eligibleTraffic);
  }

  /**
   * Check if experiment has enough data
   */
  hasMinimumSampleSize(participants: number): boolean {
    return participants >= this.minimumSampleSize;
  }

  /**
   * Set significance level
   */
  setSignificanceLevel(level: number): void {
    this.significanceLevel = level;
  }

  /**
   * Set minimum sample size
   */
  setMinimumSampleSize(size: number): void {
    this.minimumSampleSize = size;
  }
}
