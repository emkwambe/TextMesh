import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import {
  AlgorithmicDecision,
  AlgorithmType,
  AlgorithmFactor,
  TransparencyReport,
} from './types';

export class AlgorithmicTransparency {
  private redis: Redis;
  private readonly decisionPrefix = 'compliance:algo_decision:';
  private readonly userDecisionsPrefix = 'compliance:user_decisions:';
  private readonly statsPrefix = 'compliance:algo_stats:';

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async logDecision(
    algorithm: AlgorithmType,
    targetType: AlgorithmicDecision['targetType'],
    targetId: string,
    decision: string,
    factors: AlgorithmFactor[],
    options: {
      confidence?: number;
      userVisible?: boolean;
      appealable?: boolean;
      userId?: string; // User affected by decision
    } = {}
  ): Promise<AlgorithmicDecision> {
    const explanation = this.generateExplanation(algorithm, decision, factors);

    const algoDecision: AlgorithmicDecision = {
      id: uuidv4(),
      timestamp: new Date(),
      algorithm,
      targetType,
      targetId,
      decision,
      factors,
      confidence: options.confidence || this.calculateConfidence(factors),
      explanation,
      userVisible: options.userVisible ?? true,
      appealable: options.appealable ?? false,
    };

    await this.storeDecision(algoDecision, options.userId);

    return algoDecision;
  }

  async getDecision(decisionId: string): Promise<AlgorithmicDecision | null> {
    const data = await this.redis.get(`${this.decisionPrefix}${decisionId}`);
    if (!data) return null;

    return this.deserializeDecision(data);
  }

  async getUserDecisions(
    userId: string,
    options: {
      algorithm?: AlgorithmType;
      limit?: number;
      onlyVisible?: boolean;
    } = {}
  ): Promise<AlgorithmicDecision[]> {
    const { algorithm, limit = 100, onlyVisible = true } = options;

    const decisionIds = await this.redis.lrange(
      `${this.userDecisionsPrefix}${userId}`,
      0,
      limit - 1
    );

    const decisions: AlgorithmicDecision[] = [];

    for (const id of decisionIds) {
      const decision = await this.getDecision(id);
      if (decision) {
        if (onlyVisible && !decision.userVisible) continue;
        if (algorithm && decision.algorithm !== algorithm) continue;
        decisions.push(decision);
      }
    }

    return decisions;
  }

  async getContentDecisions(contentId: string): Promise<AlgorithmicDecision[]> {
    const decisionIds = await this.redis.smembers(
      `${this.decisionPrefix}content:${contentId}`
    );

    const decisions: AlgorithmicDecision[] = [];

    for (const id of decisionIds) {
      const decision = await this.getDecision(id);
      if (decision) decisions.push(decision);
    }

    return decisions.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async explainFeedItem(
    userId: string,
    contentId: string
  ): Promise<{
    reasons: string[];
    factors: AlgorithmFactor[];
    algorithms: AlgorithmType[];
  }> {
    const decisions = await this.getContentDecisions(contentId);
    const relevantDecisions = decisions.filter(
      d => d.targetType === 'content' || d.targetType === 'feed'
    );

    const reasons: string[] = [];
    const allFactors: AlgorithmFactor[] = [];
    const algorithms: Set<AlgorithmType> = new Set();

    for (const decision of relevantDecisions) {
      if (decision.userVisible) {
        reasons.push(decision.explanation);
        allFactors.push(...decision.factors);
        algorithms.add(decision.algorithm);
      }
    }

    // Deduplicate factors by name
    const uniqueFactors = allFactors.reduce((acc, factor) => {
      const existing = acc.find(f => f.name === factor.name);
      if (!existing) {
        acc.push(factor);
      }
      return acc;
    }, [] as AlgorithmFactor[]);

    return {
      reasons: [...new Set(reasons)],
      factors: uniqueFactors.sort((a, b) => b.contribution - a.contribution),
      algorithms: Array.from(algorithms),
    };
  }

  async generateTransparencyReport(
    userId: string,
    period: string // YYYY-MM
  ): Promise<TransparencyReport> {
    const decisions = await this.getUserDecisions(userId, { limit: 10000 });
    const periodDecisions = decisions.filter(d => {
      const decisionPeriod = d.timestamp.toISOString().slice(0, 7);
      return decisionPeriod === period;
    });

    const contentDecisions = {
      total: 0,
      promoted: 0,
      demoted: 0,
      hidden: 0,
    };

    const feedStats = {
      totalItems: 0,
      fromFollowing: 0,
      fromRecommendations: 0,
      fromTrending: 0,
    };

    const algorithmExposure: Record<AlgorithmType, number> = {} as Record<AlgorithmType, number>;

    for (const decision of periodDecisions) {
      // Count algorithm exposure
      algorithmExposure[decision.algorithm] = (algorithmExposure[decision.algorithm] || 0) + 1;

      if (decision.targetType === 'content') {
        contentDecisions.total++;

        if (decision.decision === 'promoted') contentDecisions.promoted++;
        if (decision.decision === 'demoted') contentDecisions.demoted++;
        if (decision.decision === 'hidden') contentDecisions.hidden++;
      }

      if (decision.algorithm === 'feed_curation') {
        feedStats.totalItems++;

        const source = decision.factors.find(f => f.name === 'source');
        if (source) {
          if (source.humanReadable.includes('following')) {
            feedStats.fromFollowing++;
          } else if (source.humanReadable.includes('recommendation')) {
            feedStats.fromRecommendations++;
          } else if (source.humanReadable.includes('trending')) {
            feedStats.fromTrending++;
          }
        }
      }
    }

    const report: TransparencyReport = {
      userId,
      period,
      generatedAt: new Date(),
      contentDecisions,
      feedStats,
      algorithmExposure,
    };

    // Cache report
    await this.redis.set(
      `compliance:transparency_report:${userId}:${period}`,
      JSON.stringify(report),
      'EX',
      86400 * 90 // 90 days
    );

    return report;
  }

  async getAlgorithmStats(
    algorithm: AlgorithmType,
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalDecisions: number;
    decisionBreakdown: Record<string, number>;
    averageConfidence: number;
    appealedCount: number;
  }> {
    const statsKey = `${this.statsPrefix}${algorithm}`;
    const data = await this.redis.hgetall(statsKey);

    // In production, this would aggregate from decision logs
    return {
      totalDecisions: parseInt(data.total || '0'),
      decisionBreakdown: JSON.parse(data.breakdown || '{}'),
      averageConfidence: parseFloat(data.avgConfidence || '0'),
      appealedCount: parseInt(data.appealed || '0'),
    };
  }

  private async storeDecision(
    decision: AlgorithmicDecision,
    userId?: string
  ): Promise<void> {
    // Store decision
    await this.redis.set(
      `${this.decisionPrefix}${decision.id}`,
      JSON.stringify(decision),
      'EX',
      86400 * 365 // 1 year
    );

    // Index by content if applicable
    if (decision.targetType === 'content') {
      await this.redis.sadd(
        `${this.decisionPrefix}content:${decision.targetId}`,
        decision.id
      );
    }

    // Index by user if provided
    if (userId) {
      await this.redis.lpush(`${this.userDecisionsPrefix}${userId}`, decision.id);
      await this.redis.ltrim(`${this.userDecisionsPrefix}${userId}`, 0, 9999);
    }

    // Update stats
    await this.updateStats(decision);
  }

  private async updateStats(decision: AlgorithmicDecision): Promise<void> {
    const statsKey = `${this.statsPrefix}${decision.algorithm}`;

    await this.redis.hincrby(statsKey, 'total', 1);
    await this.redis.hincrby(statsKey, `decision:${decision.decision}`, 1);

    // Update running average confidence
    const total = await this.redis.hget(statsKey, 'total');
    const currentAvg = await this.redis.hget(statsKey, 'avgConfidence');

    const n = parseInt(total || '1');
    const avg = parseFloat(currentAvg || '0');
    const newAvg = ((avg * (n - 1)) + decision.confidence) / n;

    await this.redis.hset(statsKey, 'avgConfidence', newAvg.toString());
  }

  private generateExplanation(
    algorithm: AlgorithmType,
    decision: string,
    factors: AlgorithmFactor[]
  ): string {
    const topFactors = factors
      .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
      .slice(0, 3);

    const factorExplanations = topFactors
      .map(f => f.humanReadable)
      .join(', ');

    const templates: Record<AlgorithmType, string> = {
      content_ranking: `This content was ${decision} because: ${factorExplanations}`,
      feed_curation: `Shown in your feed because: ${factorExplanations}`,
      recommendation: `Recommended because: ${factorExplanations}`,
      moderation: `Content ${decision} due to: ${factorExplanations}`,
      spam_detection: `Flagged as ${decision}: ${factorExplanations}`,
      toxicity_detection: `Detected as ${decision}: ${factorExplanations}`,
      trend_detection: `Identified as ${decision}: ${factorExplanations}`,
    };

    return templates[algorithm] || `Decision: ${decision}. Factors: ${factorExplanations}`;
  }

  private calculateConfidence(factors: AlgorithmFactor[]): number {
    if (factors.length === 0) return 0;

    const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
    const weightedSum = factors.reduce((sum, f) => sum + f.value * f.weight, 0);

    return Math.min(100, Math.max(0, (weightedSum / totalWeight) * 100));
  }

  private deserializeDecision(data: string): AlgorithmicDecision {
    const decision = JSON.parse(data);
    decision.timestamp = new Date(decision.timestamp);
    return decision;
  }
}
