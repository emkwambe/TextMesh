/**
 * A/B Testing Service
 *
 * Main service that combines all A/B testing functionality
 */

import { createLogger } from '@textmesh/logger';
import {
  Experiment,
  ExperimentStatus,
  Variant,
  Assignment,
  AssignmentContext,
  ExperimentResult,
  ExperimentEvent,
  FeatureFlag,
  ABTestConfig,
} from './types';
import { AssignmentEngine } from './assignment';
import { ExperimentManager } from './experiment-manager';
import { FeatureFlagManager } from './feature-flags';
import { StatisticsEngine } from './statistics';

const logger = createLogger({ service: 'ab-testing-service', level: 'info' });

const DEFAULT_CONFIG: ABTestConfig = {
  hashSeed: 12345,
  defaultAllocation: 100,
  minimumSampleSize: 100,
  significanceLevel: 0.05,
  power: 0.8,
};

export class ABTestingService {
  private config: ABTestConfig;
  private assignmentEngine: AssignmentEngine;
  private experimentManager: ExperimentManager;
  private featureFlagManager: FeatureFlagManager;
  private statisticsEngine: StatisticsEngine;

  constructor(config: Partial<ABTestConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.assignmentEngine = new AssignmentEngine(this.config);
    this.experimentManager = new ExperimentManager();
    this.featureFlagManager = new FeatureFlagManager();
    this.statisticsEngine = new StatisticsEngine();
  }

  // ==================== Experiments ====================

  /**
   * Create experiment
   */
  createExperiment(params: {
    name: string;
    description: string;
    hypothesis?: string;
    variants: Array<Omit<Variant, 'id'>>;
    targetingRules?: Experiment['targetingRules'];
    metrics?: Experiment['metrics'];
    allocation?: number;
    tags?: string[];
    createdBy: string;
  }): Experiment {
    return this.experimentManager.createExperiment(params);
  }

  /**
   * Get experiment
   */
  getExperiment(id: string): Experiment | null {
    return this.experimentManager.getExperiment(id);
  }

  /**
   * Get experiment by name
   */
  getExperimentByName(name: string): Experiment | null {
    return this.experimentManager.getExperimentByName(name);
  }

  /**
   * List experiments
   */
  listExperiments(filters?: {
    status?: ExperimentStatus;
    tags?: string[];
    createdBy?: string;
  }): Experiment[] {
    return this.experimentManager.listExperiments(filters);
  }

  /**
   * Start experiment
   */
  startExperiment(id: string): Experiment | null {
    return this.experimentManager.startExperiment(id);
  }

  /**
   * Pause experiment
   */
  pauseExperiment(id: string): Experiment | null {
    return this.experimentManager.pauseExperiment(id);
  }

  /**
   * Complete experiment
   */
  completeExperiment(id: string): Experiment | null {
    return this.experimentManager.completeExperiment(id);
  }

  /**
   * Delete experiment
   */
  deleteExperiment(id: string): boolean {
    this.assignmentEngine.clearExperimentAssignments(id);
    return this.experimentManager.deleteExperiment(id);
  }

  // ==================== Assignments ====================

  /**
   * Get variant assignment for user
   */
  getAssignment(
    experimentId: string,
    userId: string,
    context: AssignmentContext = {}
  ): Assignment | null {
    const experiment = this.experimentManager.getExperiment(experimentId);
    if (!experiment) return null;

    return this.assignmentEngine.getAssignment(experiment, userId, context);
  }

  /**
   * Get variant for user (convenience method)
   */
  getVariant(
    experimentId: string,
    userId: string,
    context: AssignmentContext = {}
  ): Variant | null {
    const assignment = this.getAssignment(experimentId, userId, context);
    if (!assignment) return null;

    const experiment = this.experimentManager.getExperiment(experimentId);
    if (!experiment) return null;

    return experiment.variants.find((v) => v.id === assignment.variantId) || null;
  }

  /**
   * Get variant config for user
   */
  getVariantConfig(
    experimentId: string,
    userId: string,
    context: AssignmentContext = {}
  ): Record<string, unknown> | null {
    const variant = this.getVariant(experimentId, userId, context);
    return variant?.config || null;
  }

  /**
   * Set assignment override
   */
  setOverride(experimentId: string, userId: string, variantId: string): void {
    this.assignmentEngine.setOverride(experimentId, userId, variantId);
  }

  /**
   * Remove assignment override
   */
  removeOverride(experimentId: string, userId: string): void {
    this.assignmentEngine.removeOverride(experimentId, userId);
  }

  /**
   * Get all assignments for user
   */
  getUserAssignments(userId: string): Assignment[] {
    return this.assignmentEngine.getUserAssignments(userId);
  }

  // ==================== Events & Results ====================

  /**
   * Track experiment event
   */
  trackEvent(params: {
    experimentId: string;
    userId: string;
    eventName: string;
    value?: number;
    metadata?: Record<string, unknown>;
  }): void {
    // Get variant assignment
    const assignment = this.getAssignment(params.experimentId, params.userId);
    if (!assignment) {
      logger.warn('No assignment found for event tracking', {
        experimentId: params.experimentId,
        userId: params.userId,
      });
      return;
    }

    const event: ExperimentEvent = {
      experimentId: params.experimentId,
      variantId: assignment.variantId,
      userId: params.userId,
      eventName: params.eventName,
      value: params.value,
      timestamp: new Date(),
      metadata: params.metadata,
    };

    this.experimentManager.recordEvent(event);
  }

  /**
   * Get experiment results
   */
  getResults(experimentId: string): ExperimentResult | null {
    const experiment = this.experimentManager.getExperiment(experimentId);
    if (!experiment) return null;

    const events = this.experimentManager.getEvents(experimentId);

    return this.statisticsEngine.calculateResults(experiment, events);
  }

  /**
   * Calculate required sample size
   */
  calculateSampleSize(params: {
    baselineConversionRate: number;
    minimumDetectableEffect: number;
  }): number {
    return this.statisticsEngine.calculateRequiredSampleSize({
      baselineConversionRate: params.baselineConversionRate,
      minimumDetectableEffect: params.minimumDetectableEffect,
      significanceLevel: this.config.significanceLevel,
      power: this.config.power,
    });
  }

  /**
   * Estimate experiment duration
   */
  estimateDuration(params: {
    requiredSampleSize: number;
    dailyTraffic: number;
    allocation: number;
  }): number {
    return this.statisticsEngine.estimateDuration(params);
  }

  // ==================== Feature Flags ====================

  /**
   * Create feature flag
   */
  createFeatureFlag(params: {
    key: string;
    name: string;
    description: string;
    defaultValue: unknown;
  }): FeatureFlag {
    return this.featureFlagManager.createFlag(params);
  }

  /**
   * Get feature flag value
   */
  getFeatureValue(
    key: string,
    userId: string,
    context: AssignmentContext = {}
  ): unknown {
    return this.featureFlagManager.getValue(key, userId, context);
  }

  /**
   * Check if feature is enabled
   */
  isFeatureEnabled(
    key: string,
    userId: string,
    context: AssignmentContext = {}
  ): boolean {
    return this.featureFlagManager.isEnabled(key, userId, context);
  }

  /**
   * Enable feature flag
   */
  enableFeature(key: string): FeatureFlag | null {
    return this.featureFlagManager.enableFlag(key);
  }

  /**
   * Disable feature flag
   */
  disableFeature(key: string): FeatureFlag | null {
    return this.featureFlagManager.disableFlag(key);
  }

  /**
   * Set percentage rollout
   */
  setRolloutPercentage(key: string, percentage: number): FeatureFlag | null {
    return this.featureFlagManager.setPercentageRollout(key, percentage);
  }

  /**
   * Get feature flag
   */
  getFeatureFlag(key: string): FeatureFlag | null {
    return this.featureFlagManager.getFlag(key);
  }

  /**
   * List feature flags
   */
  listFeatureFlags(filters?: { enabled?: boolean }): FeatureFlag[] {
    return this.featureFlagManager.listFlags(filters);
  }

  /**
   * Delete feature flag
   */
  deleteFeatureFlag(key: string): boolean {
    return this.featureFlagManager.deleteFlag(key);
  }

  /**
   * Get all enabled flags for user
   */
  getEnabledFeatures(userId: string, context: AssignmentContext = {}): string[] {
    return this.featureFlagManager.getEnabledFlags(userId, context);
  }

  // ==================== Utilities ====================

  /**
   * Get all experiments and features for user (for client SDK)
   */
  getUserExperiments(
    userId: string,
    context: AssignmentContext = {}
  ): {
    experiments: Array<{
      experimentId: string;
      variantId: string;
      variantName: string;
      config: Record<string, unknown>;
    }>;
    features: string[];
  } {
    const experiments: Array<{
      experimentId: string;
      variantId: string;
      variantName: string;
      config: Record<string, unknown>;
    }> = [];

    // Get running experiments
    for (const experiment of this.experimentManager.getRunningExperiments()) {
      const assignment = this.assignmentEngine.getAssignment(experiment, userId, context);
      if (assignment) {
        const variant = experiment.variants.find((v) => v.id === assignment.variantId);
        if (variant) {
          experiments.push({
            experimentId: experiment.id,
            variantId: variant.id,
            variantName: variant.name,
            config: variant.config,
          });
        }
      }
    }

    // Get enabled features
    const features = this.featureFlagManager.getEnabledFlags(userId, context);

    return { experiments, features };
  }

  /**
   * Get statistics
   */
  getStats(): {
    experiments: ReturnType<ExperimentManager['getStats']>;
    assignments: ReturnType<AssignmentEngine['getStats']>;
    features: ReturnType<FeatureFlagManager['getStats']>;
  } {
    return {
      experiments: this.experimentManager.getStats(),
      assignments: this.assignmentEngine.getStats(),
      features: this.featureFlagManager.getStats(),
    };
  }
}

// Export singleton factory
export function createABTestingService(config?: Partial<ABTestConfig>): ABTestingService {
  return new ABTestingService(config);
}
