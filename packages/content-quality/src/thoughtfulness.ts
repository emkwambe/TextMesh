import { Redis } from 'ioredis';
import {
  ThoughtfulnessMetrics,
  ThoughtfulnessScore,
  ThoughtfulnessConfig,
} from './types';

const DEFAULT_CONFIG: ThoughtfulnessConfig = {
  weights: {
    effort: 0.3,
    substance: 0.3,
    clarity: 0.2,
    originality: 0.2,
  },
  thresholds: {
    low: 25,
    medium: 50,
    high: 75,
    exceptional: 90,
  },
  minCompositionTime: 30, // 30 seconds minimum
  minWordCount: 10,
};

export class ThoughtfulnessScorer {
  private redis: Redis;
  private config: ThoughtfulnessConfig;
  private readonly scorePrefix = 'quality:thoughtfulness:';
  private readonly metricsPrefix = 'quality:metrics:';

  constructor(redis: Redis, config?: Partial<ThoughtfulnessConfig>) {
    this.redis = redis;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async scoreContent(
    contentId: string,
    metrics: ThoughtfulnessMetrics
  ): Promise<ThoughtfulnessScore> {
    const breakdown = {
      effort: this.calculateEffortScore(metrics),
      substance: this.calculateSubstanceScore(metrics),
      clarity: metrics.readabilityScore,
      originality: metrics.originalityScore,
    };

    const overall = Math.round(
      breakdown.effort * this.config.weights.effort +
      breakdown.substance * this.config.weights.substance +
      breakdown.clarity * this.config.weights.clarity +
      breakdown.originality * this.config.weights.originality
    );

    const tier = this.determineTier(overall);
    const multiplier = this.calculateMultiplier(tier);

    const score: ThoughtfulnessScore = {
      overall,
      breakdown,
      tier,
      multiplier,
    };

    // Store score
    await this.redis.set(
      `${this.scorePrefix}${contentId}`,
      JSON.stringify(score)
    );

    // Store metrics for analysis
    await this.redis.set(
      `${this.metricsPrefix}${contentId}`,
      JSON.stringify(metrics)
    );

    return score;
  }

  async getScore(contentId: string): Promise<ThoughtfulnessScore | null> {
    const data = await this.redis.get(`${this.scorePrefix}${contentId}`);
    if (!data) return null;
    return JSON.parse(data);
  }

  async getMetrics(contentId: string): Promise<ThoughtfulnessMetrics | null> {
    const data = await this.redis.get(`${this.metricsPrefix}${contentId}`);
    if (!data) return null;
    return JSON.parse(data);
  }

  async getUserAverageScore(userId: string): Promise<number> {
    const key = `quality:user_avg:${userId}`;
    const cached = await this.redis.get(key);
    if (cached) return parseFloat(cached);
    return 50; // Default average
  }

  async updateUserAverageScore(
    userId: string,
    newScore: number
  ): Promise<number> {
    const key = `quality:user_avg:${userId}`;
    const countKey = `quality:user_count:${userId}`;

    const [currentAvg, count] = await Promise.all([
      this.redis.get(key),
      this.redis.get(countKey),
    ]);

    const prevAvg = currentAvg ? parseFloat(currentAvg) : 50;
    const prevCount = count ? parseInt(count) : 0;

    // Rolling average
    const newCount = prevCount + 1;
    const newAvg = (prevAvg * prevCount + newScore) / newCount;

    await Promise.all([
      this.redis.set(key, newAvg.toString()),
      this.redis.set(countKey, newCount.toString()),
    ]);

    return newAvg;
  }

  async getTopThoughtfulContent(
    limit: number = 20,
    minScore: number = 75
  ): Promise<Array<{ contentId: string; score: ThoughtfulnessScore }>> {
    const results: Array<{ contentId: string; score: ThoughtfulnessScore }> = [];
    let cursor = '0';

    do {
      const [newCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${this.scorePrefix}*`,
        'COUNT',
        100
      );
      cursor = newCursor;

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const score: ThoughtfulnessScore = JSON.parse(data);
          if (score.overall >= minScore) {
            const contentId = key.replace(this.scorePrefix, '');
            results.push({ contentId, score });
          }
        }
      }
    } while (cursor !== '0' && results.length < limit * 2);

    return results
      .sort((a, b) => b.score.overall - a.score.overall)
      .slice(0, limit);
  }

  private calculateEffortScore(metrics: ThoughtfulnessMetrics): number {
    // Time component (0-50 points)
    const timeScore = Math.min(50, (metrics.compositionTime / 300) * 50);

    // Edit component (0-30 points)
    const editScore = Math.min(30, metrics.editCount * 10);

    // Combined (0-80, normalized to 0-100)
    const rawScore = timeScore + editScore + (metrics.mediaCount * 5);
    return Math.min(100, Math.round(rawScore * 1.25));
  }

  private calculateSubstanceScore(metrics: ThoughtfulnessMetrics): number {
    // Word count component (0-40 points)
    const wordScore = Math.min(40, (metrics.wordCount / 500) * 40);

    // Citation component (0-40 points)
    const citationScore = Math.min(40, metrics.citationCount * 15);

    // Media component (0-20 points)
    const mediaScore = Math.min(20, metrics.mediaCount * 10);

    return Math.min(100, Math.round(wordScore + citationScore + mediaScore));
  }

  private determineTier(score: number): ThoughtfulnessScore['tier'] {
    if (score >= this.config.thresholds.exceptional) return 'exceptional';
    if (score >= this.config.thresholds.high) return 'high';
    if (score >= this.config.thresholds.medium) return 'medium';
    return 'low';
  }

  private calculateMultiplier(tier: ThoughtfulnessScore['tier']): number {
    switch (tier) {
      case 'exceptional': return 2.0;
      case 'high': return 1.5;
      case 'medium': return 1.0;
      case 'low': return 0.5;
    }
  }

  // Analyze composition in real-time
  analyzeComposition(
    text: string,
    compositionTime: number,
    editHistory: string[]
  ): Partial<ThoughtfulnessMetrics> {
    const words = text.trim().split(/\s+/).filter(w => w.length > 0);
    const urls = text.match(/https?:\/\/[^\s]+/g) || [];

    // Simple readability (Flesch-Kincaid approximation)
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const avgWordsPerSentence = words.length / Math.max(1, sentences.length);
    const readability = Math.max(0, Math.min(100,
      100 - (avgWordsPerSentence - 15) * 3
    ));

    // Originality (check against edit history for copy-paste detection)
    let originality = 100;
    if (editHistory.length > 0) {
      const lastEdit = editHistory[editHistory.length - 1];
      const addedChars = text.length - lastEdit.length;
      if (addedChars > 100) {
        // Large paste detected, reduce originality
        originality = Math.max(20, 100 - (addedChars / 10));
      }
    }

    return {
      compositionTime,
      editCount: editHistory.length,
      wordCount: words.length,
      citationCount: urls.length,
      mediaCount: 0, // Set by caller
      readabilityScore: Math.round(readability),
      originalityScore: Math.round(originality),
    };
  }
}
