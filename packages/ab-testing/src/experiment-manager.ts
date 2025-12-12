/**
 * Experiment Manager
 *
 * Manages experiment lifecycle and configuration
 */

import { createLogger } from '@textmesh/logger';
import { v4 as uuidv4 } from 'uuid';
import {
  Experiment,
  ExperimentStatus,
  Variant,
  TargetingRule,
  ExperimentMetric,
  ExperimentEvent,
} from './types';

const logger = createLogger({ service: 'experiment-manager', level: 'info' });

export class ExperimentManager {
  private experiments: Map<string, Experiment> = new Map();
  private events: Map<string, ExperimentEvent[]> = new Map(); // experimentId -> events

  /**
   * Create a new experiment
   */
  createExperiment(params: {
    name: string;
    description: string;
    hypothesis?: string;
    variants: Array<Omit<Variant, 'id'>>;
    targetingRules?: TargetingRule[];
    metrics?: ExperimentMetric[];
    allocation?: number;
    tags?: string[];
    createdBy: string;
  }): Experiment {
    const id = uuidv4();

    // Validate variants
    if (params.variants.length < 2) {
      throw new Error('Experiment must have at least 2 variants');
    }

    const totalWeight = params.variants.reduce((sum, v) => sum + v.weight, 0);
    if (Math.abs(totalWeight - 100) > 0.1) {
      throw new Error('Variant weights must sum to 100');
    }

    // Ensure control variant exists
    const hasControl = params.variants.some((v) => v.type === 'control');
    if (!hasControl) {
      throw new Error('Experiment must have a control variant');
    }

    const variants: Variant[] = params.variants.map((v) => ({
      ...v,
      id: uuidv4(),
    }));

    const experiment: Experiment = {
      id,
      name: params.name,
      description: params.description,
      hypothesis: params.hypothesis,
      status: 'draft',
      variants,
      targetingRules: params.targetingRules || [],
      metrics: params.metrics || [],
      allocation: params.allocation || 100,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: params.createdBy,
      tags: params.tags || [],
    };

    this.experiments.set(id, experiment);
    this.events.set(id, []);

    logger.info('Experiment created', { experimentId: id, name: params.name });

    return experiment;
  }

  /**
   * Get experiment by ID
   */
  getExperiment(id: string): Experiment | null {
    return this.experiments.get(id) || null;
  }

  /**
   * Get experiment by name
   */
  getExperimentByName(name: string): Experiment | null {
    for (const experiment of this.experiments.values()) {
      if (experiment.name === name) {
        return experiment;
      }
    }
    return null;
  }

  /**
   * Update experiment
   */
  updateExperiment(
    id: string,
    updates: Partial<Omit<Experiment, 'id' | 'createdAt' | 'createdBy'>>
  ): Experiment | null {
    const experiment = this.experiments.get(id);
    if (!experiment) return null;

    // Don't allow updates to running experiments (except status)
    if (experiment.status === 'running' && Object.keys(updates).some(k => k !== 'status')) {
      throw new Error('Cannot update running experiment configuration');
    }

    // Validate variant weights if updating variants
    if (updates.variants) {
      const totalWeight = updates.variants.reduce((sum, v) => sum + v.weight, 0);
      if (Math.abs(totalWeight - 100) > 0.1) {
        throw new Error('Variant weights must sum to 100');
      }
    }

    Object.assign(experiment, updates, { updatedAt: new Date() });

    logger.info('Experiment updated', { experimentId: id });

    return experiment;
  }

  /**
   * Start experiment
   */
  startExperiment(id: string): Experiment | null {
    const experiment = this.experiments.get(id);
    if (!experiment) return null;

    if (experiment.status !== 'draft' && experiment.status !== 'paused') {
      throw new Error(`Cannot start experiment with status: ${experiment.status}`);
    }

    experiment.status = 'running';
    experiment.startDate = experiment.startDate || new Date();
    experiment.updatedAt = new Date();

    logger.info('Experiment started', { experimentId: id });

    return experiment;
  }

  /**
   * Pause experiment
   */
  pauseExperiment(id: string): Experiment | null {
    const experiment = this.experiments.get(id);
    if (!experiment) return null;

    if (experiment.status !== 'running') {
      throw new Error('Can only pause running experiments');
    }

    experiment.status = 'paused';
    experiment.updatedAt = new Date();

    logger.info('Experiment paused', { experimentId: id });

    return experiment;
  }

  /**
   * Complete experiment
   */
  completeExperiment(id: string): Experiment | null {
    const experiment = this.experiments.get(id);
    if (!experiment) return null;

    if (experiment.status !== 'running' && experiment.status !== 'paused') {
      throw new Error('Can only complete running or paused experiments');
    }

    experiment.status = 'completed';
    experiment.endDate = new Date();
    experiment.updatedAt = new Date();

    logger.info('Experiment completed', { experimentId: id });

    return experiment;
  }

  /**
   * Archive experiment
   */
  archiveExperiment(id: string): Experiment | null {
    const experiment = this.experiments.get(id);
    if (!experiment) return null;

    experiment.status = 'archived';
    experiment.updatedAt = new Date();

    logger.info('Experiment archived', { experimentId: id });

    return experiment;
  }

  /**
   * Delete experiment
   */
  deleteExperiment(id: string): boolean {
    const experiment = this.experiments.get(id);
    if (!experiment) return false;

    if (experiment.status === 'running') {
      throw new Error('Cannot delete running experiment');
    }

    this.experiments.delete(id);
    this.events.delete(id);

    logger.info('Experiment deleted', { experimentId: id });

    return true;
  }

  /**
   * List experiments
   */
  listExperiments(filters?: {
    status?: ExperimentStatus;
    tags?: string[];
    createdBy?: string;
  }): Experiment[] {
    let experiments = Array.from(this.experiments.values());

    if (filters) {
      if (filters.status) {
        experiments = experiments.filter((e) => e.status === filters.status);
      }

      if (filters.tags && filters.tags.length > 0) {
        experiments = experiments.filter((e) =>
          filters.tags!.some((tag) => e.tags.includes(tag))
        );
      }

      if (filters.createdBy) {
        experiments = experiments.filter((e) => e.createdBy === filters.createdBy);
      }
    }

    return experiments.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  /**
   * Get running experiments
   */
  getRunningExperiments(): Experiment[] {
    return this.listExperiments({ status: 'running' });
  }

  /**
   * Record experiment event
   */
  recordEvent(event: ExperimentEvent): void {
    const events = this.events.get(event.experimentId);
    if (events) {
      events.push(event);

      // Keep last 100k events per experiment
      if (events.length > 100000) {
        events.shift();
      }
    }
  }

  /**
   * Get events for experiment
   */
  getEvents(experimentId: string, filters?: {
    variantId?: string;
    eventName?: string;
    startDate?: Date;
    endDate?: Date;
  }): ExperimentEvent[] {
    let events = this.events.get(experimentId) || [];

    if (filters) {
      if (filters.variantId) {
        events = events.filter((e) => e.variantId === filters.variantId);
      }

      if (filters.eventName) {
        events = events.filter((e) => e.eventName === filters.eventName);
      }

      if (filters.startDate) {
        events = events.filter((e) => e.timestamp >= filters.startDate!);
      }

      if (filters.endDate) {
        events = events.filter((e) => e.timestamp <= filters.endDate!);
      }
    }

    return events;
  }

  /**
   * Get event counts by variant
   */
  getEventCountsByVariant(
    experimentId: string,
    eventName: string
  ): Record<string, number> {
    const events = this.getEvents(experimentId, { eventName });
    const counts: Record<string, number> = {};

    for (const event of events) {
      counts[event.variantId] = (counts[event.variantId] || 0) + 1;
    }

    return counts;
  }

  /**
   * Get unique users by variant
   */
  getUniqueUsersByVariant(experimentId: string): Record<string, number> {
    const events = this.events.get(experimentId) || [];
    const usersByVariant: Record<string, Set<string>> = {};

    for (const event of events) {
      if (!usersByVariant[event.variantId]) {
        usersByVariant[event.variantId] = new Set();
      }
      usersByVariant[event.variantId].add(event.userId);
    }

    const counts: Record<string, number> = {};
    for (const [variantId, users] of Object.entries(usersByVariant)) {
      counts[variantId] = users.size;
    }

    return counts;
  }

  /**
   * Add targeting rule to experiment
   */
  addTargetingRule(experimentId: string, rule: Omit<TargetingRule, 'id'>): Experiment | null {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) return null;

    if (experiment.status === 'running') {
      throw new Error('Cannot modify targeting rules of running experiment');
    }

    experiment.targetingRules.push({
      ...rule,
      id: uuidv4(),
    });
    experiment.updatedAt = new Date();

    return experiment;
  }

  /**
   * Remove targeting rule
   */
  removeTargetingRule(experimentId: string, ruleId: string): Experiment | null {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) return null;

    if (experiment.status === 'running') {
      throw new Error('Cannot modify targeting rules of running experiment');
    }

    experiment.targetingRules = experiment.targetingRules.filter(
      (r) => r.id !== ruleId
    );
    experiment.updatedAt = new Date();

    return experiment;
  }

  /**
   * Add metric to experiment
   */
  addMetric(experimentId: string, metric: ExperimentMetric): Experiment | null {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) return null;

    experiment.metrics.push(metric);
    experiment.updatedAt = new Date();

    return experiment;
  }

  /**
   * Get statistics
   */
  getStats(): {
    total: number;
    byStatus: Record<ExperimentStatus, number>;
    totalEvents: number;
  } {
    const byStatus: Record<ExperimentStatus, number> = {
      draft: 0,
      running: 0,
      paused: 0,
      completed: 0,
      archived: 0,
    };

    let totalEvents = 0;

    for (const experiment of this.experiments.values()) {
      byStatus[experiment.status]++;
    }

    for (const events of this.events.values()) {
      totalEvents += events.length;
    }

    return {
      total: this.experiments.size,
      byStatus,
      totalEvents,
    };
  }
}
