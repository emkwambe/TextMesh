import { Redis } from 'ioredis';
import {
  ThoughtfulnessMetrics,
  ThoughtfulnessScore,
  ReadGateResult,
  FeedSession,
  FeedItem,
  DailyDigest,
  DigestItem,
  PrivateMetrics,
  MetricVisibility,
} from './types';
import { ThoughtfulnessScorer } from './thoughtfulness';
import { ReadGate } from './read-gate';
import { FiniteFeed } from './finite-feed';
import { HiddenMetrics } from './hidden-metrics';

export interface QualityServiceConfig {
  thoughtfulness?: {
    weights?: { effort: number; substance: number; clarity: number; originality: number };
    thresholds?: { low: number; medium: number; high: number; exceptional: number };
  };
  readGate?: {
    enabled?: boolean;
    minReadTimePercent?: number;
    minScrollPercent?: number;
  };
  finiteFeed?: {
    dailyContentLimit?: number;
    sessionLimit?: number;
    digestEnabled?: boolean;
  };
  hiddenMetrics?: Partial<MetricVisibility>;
}

export class QualityService {
  private redis: Redis;
  private thoughtfulness: ThoughtfulnessScorer;
  private readGate: ReadGate;
  private finiteFeed: FiniteFeed;
  private hiddenMetrics: HiddenMetrics;

  constructor(redis: Redis, config?: QualityServiceConfig) {
    this.redis = redis;
    this.thoughtfulness = new ThoughtfulnessScorer(redis, config?.thoughtfulness);
    this.readGate = new ReadGate(redis, config?.readGate);
    this.finiteFeed = new FiniteFeed(redis, config?.finiteFeed);
    this.hiddenMetrics = new HiddenMetrics(redis, config?.hiddenMetrics);
  }

  // ============ THOUGHTFULNESS ============

  async scoreContent(
    contentId: string,
    metrics: ThoughtfulnessMetrics
  ): Promise<ThoughtfulnessScore> {
    return this.thoughtfulness.scoreContent(contentId, metrics);
  }

  async getThoughtfulnessScore(contentId: string): Promise<ThoughtfulnessScore | null> {
    return this.thoughtfulness.getScore(contentId);
  }

  analyzeComposition(
    text: string,
    compositionTime: number,
    editHistory: string[]
  ): Partial<ThoughtfulnessMetrics> {
    return this.thoughtfulness.analyzeComposition(text, compositionTime, editHistory);
  }

  async getTopThoughtfulContent(
    limit?: number,
    minScore?: number
  ): Promise<Array<{ contentId: string; score: ThoughtfulnessScore }>> {
    return this.thoughtfulness.getTopThoughtfulContent(limit, minScore);
  }

  // ============ READ GATE ============

  async startReading(
    userId: string,
    contentId: string,
    wordCount: number
  ): Promise<{ attemptId: string; estimatedReadTime: number }> {
    return this.readGate.startReading(userId, contentId, wordCount);
  }

  async updateReadProgress(
    attemptId: string,
    scrollDepth: number,
    timeSpent: number
  ): Promise<void> {
    return this.readGate.updateProgress(attemptId, scrollDepth, timeSpent);
  }

  async checkReadGate(
    userId: string,
    contentId: string,
    wordCount: number,
    scrollDepth: number,
    timeSpent: number
  ): Promise<ReadGateResult> {
    return this.readGate.checkGate(userId, contentId, wordCount, scrollDepth, timeSpent);
  }

  async canReply(
    userId: string,
    contentId: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    return this.readGate.canReply(userId, contentId);
  }

  // ============ FINITE FEED ============

  async startFeedSession(userId: string): Promise<FeedSession> {
    return this.finiteFeed.startSession(userId);
  }

  async getNextFeedItems(
    sessionId: string,
    count?: number
  ): Promise<{ items: FeedItem[]; session: FeedSession }> {
    return this.finiteFeed.getNextItems(sessionId, count);
  }

  async markFeedItemsViewed(sessionId: string, itemIds: string[]): Promise<FeedSession> {
    return this.finiteFeed.markViewed(sessionId, itemIds);
  }

  async addToUserFeed(userId: string, item: Omit<FeedItem, 'id'>): Promise<void> {
    return this.finiteFeed.addToFeed(userId, item);
  }

  async getDailyFeedStats(userId: string): Promise<{
    viewedToday: number;
    remainingToday: number;
    isCaughtUp: boolean;
    nextRefreshAt: Date;
  }> {
    return this.finiteFeed.getDailyStats(userId);
  }

  async generateDailyDigest(userId: string, items: DigestItem[]): Promise<DailyDigest> {
    return this.finiteFeed.generateDigest(userId, items);
  }

  async getDailyDigest(userId: string, date?: string): Promise<DailyDigest | null> {
    return this.finiteFeed.getDigest(userId, date);
  }

  // ============ HIDDEN METRICS ============

  async recordEngagement(
    contentId: string,
    authorId: string,
    metric: 'like' | 'share' | 'bookmark' | 'reply' | 'view',
    increment?: number
  ): Promise<void> {
    return this.hiddenMetrics.recordMetric(contentId, authorId, metric, increment);
  }

  async recordReadTime(
    contentId: string,
    userId: string,
    seconds: number
  ): Promise<void> {
    return this.hiddenMetrics.recordReadTime(contentId, userId, seconds);
  }

  async getContentMetrics(
    contentId: string,
    requesterId: string
  ): Promise<PrivateMetrics | { hidden: true; reason: string }> {
    return this.hiddenMetrics.getMetrics(contentId, requesterId);
  }

  async getAuthorDashboard(authorId: string): Promise<{
    totalContent: number;
    aggregateMetrics: {
      totalLikes: number;
      totalShares: number;
      totalBookmarks: number;
      totalReplies: number;
      totalReadTime: number;
      totalReach: number;
    };
    recentPerformance: Array<{ contentId: string; metrics: PrivateMetrics }>;
  }> {
    return this.hiddenMetrics.getAuthorDashboard(authorId);
  }

  async setMetricVisibility(
    userId: string,
    settings: Partial<MetricVisibility>
  ): Promise<void> {
    return this.hiddenMetrics.setUserVisibilitySettings(userId, settings);
  }

  async getBookmarkLeaderboard(
    limit?: number
  ): Promise<Array<{ contentId: string; bookmarks: number }>> {
    return this.hiddenMetrics.getBookmarkLeaderboard(limit);
  }

  // ============ COMBINED WORKFLOWS ============

  /**
   * Complete workflow for publishing content
   */
  async publishContent(
    contentId: string,
    authorId: string,
    text: string,
    compositionTime: number,
    editHistory: string[],
    mediaCount: number = 0
  ): Promise<{
    thoughtfulnessScore: ThoughtfulnessScore;
    feedPriority: number;
  }> {
    // Analyze and score content
    const metrics = this.analyzeComposition(text, compositionTime, editHistory);
    metrics.mediaCount = mediaCount;

    const score = await this.scoreContent(
      contentId,
      metrics as ThoughtfulnessMetrics
    );

    // Update author's average
    await this.thoughtfulness.updateUserAverageScore(authorId, score.overall);

    // Calculate feed priority based on score
    const feedPriority = this.calculateFeedPriority(score);

    return {
      thoughtfulnessScore: score,
      feedPriority,
    };
  }

  /**
   * Complete workflow for replying to content
   */
  async attemptReply(
    userId: string,
    contentId: string,
    wordCount: number,
    scrollDepth: number,
    timeSpent: number
  ): Promise<{
    allowed: boolean;
    gateResult?: ReadGateResult;
    message?: string;
  }> {
    // Check read gate
    const gateResult = await this.checkReadGate(
      userId,
      contentId,
      wordCount,
      scrollDepth,
      timeSpent
    );

    if (!gateResult.passed) {
      let message = 'Please read the content before replying.';

      if (gateResult.reason === 'insufficient_time') {
        message = `Please spend more time reading. Required: ${gateResult.requiredTime}s, You: ${gateResult.actualTime}s`;
      } else if (gateResult.reason === 'insufficient_scroll') {
        message = `Please scroll through more of the content. Required: ${gateResult.requiredScroll}%, You: ${gateResult.actualScroll}%`;
      } else if (gateResult.reason === 'cooldown_active') {
        message = `Please wait ${gateResult.cooldownRemaining}s before trying again.`;
      }

      return {
        allowed: false,
        gateResult,
        message,
      };
    }

    return { allowed: true };
  }

  /**
   * Get user's content quality stats
   */
  async getUserQualityStats(userId: string): Promise<{
    averageThoughtfulness: number;
    readGatePassRate: number;
    feedStats: {
      viewedToday: number;
      remainingToday: number;
      isCaughtUp: boolean;
    };
    authorMetrics?: {
      totalContent: number;
      totalBookmarks: number;
      totalReplies: number;
    };
  }> {
    const [avgScore, readStats, feedStats, authorDashboard] = await Promise.all([
      this.thoughtfulness.getUserAverageScore(userId),
      this.readGate.getReadStats(userId),
      this.finiteFeed.getDailyStats(userId),
      this.hiddenMetrics.getAuthorDashboard(userId),
    ]);

    return {
      averageThoughtfulness: avgScore,
      readGatePassRate: readStats.passRate,
      feedStats: {
        viewedToday: feedStats.viewedToday,
        remainingToday: feedStats.remainingToday,
        isCaughtUp: feedStats.isCaughtUp,
      },
      authorMetrics: authorDashboard.totalContent > 0
        ? {
            totalContent: authorDashboard.totalContent,
            totalBookmarks: authorDashboard.aggregateMetrics.totalBookmarks,
            totalReplies: authorDashboard.aggregateMetrics.totalReplies,
          }
        : undefined,
    };
  }

  private calculateFeedPriority(score: ThoughtfulnessScore): number {
    // Higher thoughtfulness = higher priority
    return Math.round(score.overall * score.multiplier);
  }

  // Getters for individual services
  getThoughtfulnessScorer(): ThoughtfulnessScorer {
    return this.thoughtfulness;
  }

  getReadGate(): ReadGate {
    return this.readGate;
  }

  getFiniteFeed(): FiniteFeed {
    return this.finiteFeed;
  }

  getHiddenMetrics(): HiddenMetrics {
    return this.hiddenMetrics;
  }
}
