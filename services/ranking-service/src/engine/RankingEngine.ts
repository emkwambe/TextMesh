// =================================
// TEXTMESH RANKING ENGINE
// Core Ranking Algorithm Implementation
// =================================

import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import {
  RankablePost,
  RankedPost,
  RankingContext,
  ScoreBreakdown,
  UserInteraction,
} from '../index';

// ============ RANKING WEIGHTS ============

export interface RankingWeights {
  relevance: number;
  recency: number;
  engagement: number;
  authorAffinity: number;
  diversity: number;
  quality: number;
}

const DEFAULT_WEIGHTS: RankingWeights = {
  relevance: 0.25,
  recency: 0.20,
  engagement: 0.20,
  authorAffinity: 0.15,
  diversity: 0.10,
  quality: 0.10,
};

// ============ RANKING PARAMETERS ============

const RECENCY_HALF_LIFE_HOURS = 6;
const MAX_AUTHOR_POSTS_IN_FEED = 3;
const DIVERSITY_WINDOW = 10;
const ENGAGEMENT_VELOCITY_WINDOW_HOURS = 1;

// ============ RANKING ENGINE CLASS ============

export class RankingEngine {
  private redis: Redis;
  private prisma: PrismaClient;
  private weights: RankingWeights;

  constructor(redis: Redis, prisma: PrismaClient, weights?: Partial<RankingWeights>) {
    this.redis = redis;
    this.prisma = prisma;
    this.weights = { ...DEFAULT_WEIGHTS, ...weights };
  }

  /**
   * Main ranking function - ranks posts for a user's feed
   */
  async rankPosts(
    userId: string,
    posts: RankablePost[],
    context?: RankingContext
  ): Promise<RankedPost[]> {
    if (posts.length === 0) return [];

    // Fetch user data needed for ranking
    const [userAffinities, userInteractions, blockedUsers] = await Promise.all([
      this.getUserAffinities(userId),
      this.getRecentInteractions(userId),
      this.getBlockedUsers(userId),
    ]);

    // Filter out blocked users
    const filteredPosts = posts.filter(
      (post) => !blockedUsers.has(post.authorId)
    );

    // Score each post
    const scoredPosts = await Promise.all(
      filteredPosts.map((post) =>
        this.scorePost(post, userId, userAffinities, userInteractions, context)
      )
    );

    // Apply diversity rules
    const diversifiedPosts = this.applyDiversity(scoredPosts);

    // Sort by score
    diversifiedPosts.sort((a, b) => b.score - a.score);

    // Add ranks
    return diversifiedPosts.map((post, index) => ({
      ...post,
      rank: index + 1,
    }));
  }

  /**
   * Score an individual post
   */
  private async scorePost(
    post: RankablePost,
    userId: string,
    userAffinities: UserAffinities,
    userInteractions: Set<string>,
    context?: RankingContext
  ): Promise<RankedPost> {
    const scoreBreakdown: ScoreBreakdown = {
      relevanceScore: this.calculateRelevanceScore(post, userAffinities),
      recencyScore: this.calculateRecencyScore(post),
      engagementScore: this.calculateEngagementScore(post),
      authorAffinityScore: this.calculateAuthorAffinityScore(post, userAffinities),
      diversityScore: 1.0, // Will be adjusted later
      qualityScore: this.calculateQualityScore(post),
    };

    // Apply context adjustments
    if (context) {
      this.applyContextAdjustments(scoreBreakdown, context);
    }

    // Apply penalties
    if (userInteractions.has(post.id)) {
      // Penalize already-seen content
      scoreBreakdown.relevanceScore *= 0.3;
    }

    // Calculate final score
    const score =
      scoreBreakdown.relevanceScore * this.weights.relevance +
      scoreBreakdown.recencyScore * this.weights.recency +
      scoreBreakdown.engagementScore * this.weights.engagement +
      scoreBreakdown.authorAffinityScore * this.weights.authorAffinity +
      scoreBreakdown.diversityScore * this.weights.diversity +
      scoreBreakdown.qualityScore * this.weights.quality;

    return {
      ...post,
      score,
      scoreBreakdown,
      rank: 0, // Will be set after sorting
    };
  }

  /**
   * Calculate relevance score based on user interests and content
   */
  private calculateRelevanceScore(
    post: RankablePost,
    userAffinities: UserAffinities
  ): number {
    let score = 0.5; // Base score

    // Hashtag relevance
    if (post.hashtags) {
      for (const hashtag of post.hashtags) {
        const affinityScore = userAffinities.hashtags.get(hashtag) || 0;
        score += affinityScore * 0.1;
      }
    }

    // Topic relevance (inferred from content)
    const contentTopics = this.extractTopics(post.content);
    for (const topic of contentTopics) {
      const affinityScore = userAffinities.topics.get(topic) || 0;
      score += affinityScore * 0.05;
    }

    // Group relevance
    if (post.groupId && userAffinities.groups.has(post.groupId)) {
      score += userAffinities.groups.get(post.groupId) || 0;
    }

    return Math.min(1.0, Math.max(0, score));
  }

  /**
   * Calculate recency score with exponential decay
   *
   * Formula: score = e^(-λt)
   * where λ = ln(2) / halfLife
   */
  private calculateRecencyScore(post: RankablePost): number {
    const postAge = Date.now() - new Date(post.createdAt).getTime();
    const hoursOld = postAge / (1000 * 60 * 60);

    const lambda = Math.LN2 / RECENCY_HALF_LIFE_HOURS;
    const score = Math.exp(-lambda * hoursOld);

    return Math.min(1.0, Math.max(0, score));
  }

  /**
   * Calculate engagement score based on post metrics
   *
   * Formula: weighted sum of normalized engagement metrics
   * with velocity bonus for trending content
   */
  private calculateEngagementScore(post: RankablePost): number {
    const { likes, comments, reposts, shares, views } = post.metrics;

    // Prevent division by zero
    const safeViews = Math.max(views, 1);

    // Calculate engagement rate
    const engagementRate =
      (likes * 1.0 + comments * 3.0 + reposts * 2.0 + shares * 2.5) / safeViews;

    // Normalize (assuming typical engagement rate is around 5%)
    const normalizedRate = Math.min(1.0, engagementRate / 0.1);

    // Add volume bonus for posts with many interactions
    const volumeBonus = Math.log10(Math.max(1, likes + comments + reposts)) / 5;

    return Math.min(1.0, normalizedRate * 0.7 + volumeBonus * 0.3);
  }

  /**
   * Calculate author affinity score
   */
  private calculateAuthorAffinityScore(
    post: RankablePost,
    userAffinities: UserAffinities
  ): number {
    const authorAffinity = userAffinities.authors.get(post.authorId) || 0;

    // Check if user follows the author
    const followBonus = userAffinities.following.has(post.authorId) ? 0.3 : 0;

    return Math.min(1.0, authorAffinity + followBonus);
  }

  /**
   * Calculate content quality score
   */
  private calculateQualityScore(post: RankablePost): number {
    let score = 0.5; // Base score

    // Content length quality (too short or too long is penalized)
    const contentLength = post.content.length;
    if (contentLength >= 50 && contentLength <= 280) {
      score += 0.2;
    } else if (contentLength < 20 || contentLength > 500) {
      score -= 0.1;
    }

    // Hashtag quality (1-3 hashtags is good)
    const hashtagCount = post.hashtags?.length || 0;
    if (hashtagCount >= 1 && hashtagCount <= 3) {
      score += 0.1;
    } else if (hashtagCount > 5) {
      score -= 0.1; // Too many hashtags is spammy
    }

    // Mention quality
    const mentionCount = post.mentions?.length || 0;
    if (mentionCount > 5) {
      score -= 0.1; // Too many mentions is spammy
    }

    return Math.min(1.0, Math.max(0, score));
  }

  /**
   * Apply context-based adjustments
   */
  private applyContextAdjustments(
    scores: ScoreBreakdown,
    context: RankingContext
  ): void {
    // Time of day adjustments
    if (context.timeOfDay !== undefined) {
      // Boost fresh content during morning commute (7-9am)
      if (context.timeOfDay >= 7 && context.timeOfDay <= 9) {
        scores.recencyScore *= 1.1;
      }
      // Boost engaging content during evening (6-10pm)
      if (context.timeOfDay >= 18 && context.timeOfDay <= 22) {
        scores.engagementScore *= 1.1;
      }
    }

    // Session depth adjustments
    if (context.sessionDepth !== undefined) {
      // Show more diverse content as session progresses
      if (context.sessionDepth > 20) {
        scores.diversityScore *= 1.2;
      }
    }
  }

  /**
   * Apply diversity rules to prevent repetitive content
   */
  private applyDiversity(posts: RankedPost[]): RankedPost[] {
    const authorCounts = new Map<string, number>();
    const recentHashtags = new Set<string>();

    return posts.map((post, index) => {
      let diversityPenalty = 0;

      // Penalize multiple posts from same author
      const authorCount = authorCounts.get(post.authorId) || 0;
      if (authorCount >= MAX_AUTHOR_POSTS_IN_FEED) {
        diversityPenalty += 0.3;
      }
      authorCounts.set(post.authorId, authorCount + 1);

      // Penalize repetitive hashtags in recent window
      if (index > 0 && index < DIVERSITY_WINDOW && post.hashtags) {
        const commonHashtags = post.hashtags.filter((h) => recentHashtags.has(h));
        diversityPenalty += commonHashtags.length * 0.05;
        post.hashtags.forEach((h) => recentHashtags.add(h));
      }

      // Apply penalty
      post.scoreBreakdown.diversityScore = Math.max(0, 1 - diversityPenalty);
      post.score -= diversityPenalty * this.weights.diversity;

      return post;
    });
  }

  /**
   * Extract topics from content (simplified implementation)
   */
  private extractTopics(content: string): string[] {
    // In production, use NLP/ML for topic extraction
    // This is a simplified keyword-based approach
    const topicKeywords: Record<string, string[]> = {
      tech: ['code', 'programming', 'software', 'app', 'technology', 'ai', 'ml'],
      sports: ['game', 'score', 'team', 'player', 'match', 'win', 'championship'],
      music: ['song', 'album', 'artist', 'concert', 'music', 'band', 'listen'],
      food: ['recipe', 'cook', 'restaurant', 'food', 'eat', 'delicious', 'meal'],
      travel: ['trip', 'travel', 'vacation', 'destination', 'flight', 'hotel'],
      fitness: ['workout', 'gym', 'exercise', 'fitness', 'health', 'training'],
      business: ['business', 'startup', 'company', 'invest', 'market', 'finance'],
      entertainment: ['movie', 'show', 'series', 'watch', 'episode', 'streaming'],
    };

    const lowerContent = content.toLowerCase();
    const topics: string[] = [];

    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      if (keywords.some((keyword) => lowerContent.includes(keyword))) {
        topics.push(topic);
      }
    }

    return topics;
  }

  // ============ USER DATA METHODS ============

  /**
   * Get user affinities from Redis cache or calculate
   */
  async getUserAffinities(userId: string): Promise<UserAffinities> {
    const cacheKey = `user:affinities:${userId}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached) as UserAffinities;
    }

    // Calculate affinities from interaction history
    const affinities = await this.calculateUserAffinities(userId);

    // Cache for 1 hour
    await this.redis.setex(cacheKey, 3600, JSON.stringify(affinities));

    return affinities;
  }

  /**
   * Calculate user affinities from interaction history
   */
  private async calculateUserAffinities(userId: string): Promise<UserAffinities> {
    // This would query the database for user interactions
    // Simplified implementation
    const affinities: UserAffinities = {
      authors: new Map(),
      hashtags: new Map(),
      topics: new Map(),
      groups: new Map(),
      following: new Set(),
    };

    try {
      // Get users that this user follows
      const following = await this.prisma.follow.findMany({
        where: { followerId: userId },
        select: { followingId: true },
      });

      following.forEach((f) => affinities.following.add(f.followingId));

      // Get interaction-based affinities
      // In production, aggregate from user_interactions table
    } catch {
      // Handle case where tables don't exist yet
    }

    return affinities;
  }

  /**
   * Get recent user interactions (for seen content filtering)
   */
  private async getRecentInteractions(userId: string): Promise<Set<string>> {
    const cacheKey = `user:recent_interactions:${userId}`;
    const interactions = await this.redis.smembers(cacheKey);
    return new Set(interactions);
  }

  /**
   * Get blocked users
   */
  private async getBlockedUsers(userId: string): Promise<Set<string>> {
    const cacheKey = `user:blocked:${userId}`;
    const blocked = await this.redis.smembers(cacheKey);
    return new Set(blocked);
  }

  /**
   * Record user interaction for learning
   */
  async recordInteraction(interaction: UserInteraction): Promise<void> {
    const { userId, itemId, itemType, action } = interaction;

    // Store in Redis for quick access
    const interactionKey = `user:recent_interactions:${userId}`;
    await this.redis.sadd(interactionKey, itemId);
    await this.redis.expire(interactionKey, 86400); // 24 hours

    // Update affinity scores based on action
    const affinityDelta = this.getAffinityDelta(action);

    if (itemType === 'user') {
      const authorAffinityKey = `user:affinity:author:${userId}:${itemId}`;
      await this.redis.incrbyfloat(authorAffinityKey, affinityDelta);
    }

    // Store interaction in database for long-term learning
    // await this.prisma.userInteraction.create({ data: interaction });

    // Invalidate cached affinities
    await this.redis.del(`user:affinities:${userId}`);
  }

  /**
   * Get affinity delta based on action type
   */
  private getAffinityDelta(action: string): number {
    const actionWeights: Record<string, number> = {
      view: 0.01,
      like: 0.1,
      comment: 0.2,
      repost: 0.3,
      share: 0.25,
      follow: 0.5,
      hide: -0.3,
      report: -0.5,
    };

    return actionWeights[action] || 0;
  }

  /**
   * Update ranking weights (for A/B testing)
   */
  updateWeights(newWeights: Partial<RankingWeights>): void {
    this.weights = { ...this.weights, ...newWeights };
  }
}

// ============ TYPES ============

interface UserAffinities {
  authors: Map<string, number>;
  hashtags: Map<string, number>;
  topics: Map<string, number>;
  groups: Map<string, number>;
  following: Set<string>;
}

export default RankingEngine;
