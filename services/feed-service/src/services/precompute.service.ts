/**
 * Feed Pre-computation Service
 *
 * Background service for:
 * - Pre-computing personalized feeds
 * - Warming feed caches
 * - Generating trending/discovery feeds
 * - Score calculation for ranking
 */

import { redis, prisma } from '@textmesh/db-client';
import { createLogger } from '@textmesh/logger';

const logger = createLogger({ service: 'precompute-service' });

// Feed types
type FeedType = 'home' | 'trending' | 'following' | 'for_you';

// Scoring weights
const SCORE_WEIGHTS = {
  recency: 1.0,
  engagement: 0.3,
  authorAffinity: 0.4,
  contentRelevance: 0.2,
};

// Configuration
const TRENDING_WINDOW_HOURS = 24;
const TRENDING_CACHE_TTL = 300; // 5 minutes
const FOR_YOU_CACHE_TTL = 600; // 10 minutes
const MAX_PRECOMPUTE_POSTS = 500;

export interface ScoredPost {
  postId: string;
  userId: string;
  score: number;
  components: {
    recency: number;
    engagement: number;
    affinity: number;
    relevance: number;
  };
}

export class PrecomputeService {
  /**
   * Pre-compute trending feed
   */
  async computeTrendingFeed(): Promise<void> {
    logger.info('Computing trending feed');

    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - TRENDING_WINDOW_HOURS);

    // Get posts with high engagement in the time window
    const posts = await prisma.post.findMany({
      where: {
        createdAt: { gte: cutoff },
        deletedAt: null,
        parentId: null, // Only original posts
      },
      select: {
        id: true,
        userId: true,
        createdAt: true,
        _count: {
          select: {
            likes: true,
            replies: true,
            reposts: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_PRECOMPUTE_POSTS,
    });

    // Calculate trending score
    const scoredPosts = posts.map((post) => {
      const ageHours = (Date.now() - post.createdAt.getTime()) / (1000 * 60 * 60);
      const engagement = post._count.likes + post._count.replies * 2 + post._count.reposts * 3;

      // Trending score: engagement / (age + 2)^gravity
      const gravity = 1.8;
      const score = engagement / Math.pow(ageHours + 2, gravity);

      return {
        postId: post.id,
        userId: post.userId,
        score,
      };
    });

    // Sort by score
    scoredPosts.sort((a, b) => b.score - a.score);

    // Store in Redis
    const key = 'feed:trending';
    const pipeline = redis.pipeline();

    pipeline.del(key);

    for (const post of scoredPosts.slice(0, 100)) {
      pipeline.zadd(key, post.score, JSON.stringify({
        postId: post.postId,
        userId: post.userId,
        score: post.score,
      }));
    }

    pipeline.expire(key, TRENDING_CACHE_TTL);
    await pipeline.exec();

    logger.info('Trending feed computed', { postCount: scoredPosts.length });
  }

  /**
   * Pre-compute "For You" feed for a user
   */
  async computeForYouFeed(userId: string): Promise<void> {
    logger.info('Computing For You feed', { userId });

    // Get user's interests from interactions
    const interests = await this.getUserInterests(userId);

    // Get users this person follows
    const following = await prisma.follow.findMany({
      where: { followerId: userId },
      select: { followeeId: true },
    });
    const followeeIds: Set<string> = new Set(following.map((f) => f.followeeId as string));

    // Get recent posts from various sources
    const candidatePosts = await this.getCandidatePosts(userId, followeeIds);

    // Score each post
    const scoredPosts: ScoredPost[] = [];

    for (const post of candidatePosts) {
      const recency = this.calculateRecencyScore(post.createdAt);
      const engagement = this.calculateEngagementScore(
        post._count.likes,
        post._count.replies,
        post._count.reposts
      );
      const affinity = await this.calculateAffinityScore(userId, post.userId, followeeIds);
      const relevance = this.calculateRelevanceScore(post, interests);

      const score =
        recency * SCORE_WEIGHTS.recency +
        engagement * SCORE_WEIGHTS.engagement +
        affinity * SCORE_WEIGHTS.authorAffinity +
        relevance * SCORE_WEIGHTS.contentRelevance;

      scoredPosts.push({
        postId: post.id,
        userId: post.userId,
        score,
        components: {
          recency,
          engagement,
          affinity,
          relevance,
        },
      });
    }

    // Sort by score
    scoredPosts.sort((a, b) => b.score - a.score);

    // Store in Redis
    const key = `feed:for_you:${userId}`;
    const pipeline = redis.pipeline();

    pipeline.del(key);

    for (const post of scoredPosts.slice(0, 100)) {
      pipeline.zadd(key, post.score, JSON.stringify(post));
    }

    pipeline.expire(key, FOR_YOU_CACHE_TTL);
    await pipeline.exec();

    logger.info('For You feed computed', { userId, postCount: scoredPosts.length });
  }

  /**
   * Get candidate posts for personalized feed
   */
  private async getCandidatePosts(
    userId: string,
    followeeIds: Set<string>
  ): Promise<any[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7); // Last 7 days

    // Posts from followed users
    const followingPosts = await prisma.post.findMany({
      where: {
        userId: { in: [...followeeIds] },
        createdAt: { gte: cutoff },
        deletedAt: null,
      },
      select: {
        id: true,
        userId: true,
        content: true,
        createdAt: true,
        _count: {
          select: {
            likes: true,
            replies: true,
            reposts: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    // Highly engaged posts from non-followed users
    const discoverPosts = await prisma.post.findMany({
      where: {
        userId: { notIn: [...followeeIds, userId] },
        createdAt: { gte: cutoff },
        deletedAt: null,
        likes: {
          some: {},
        },
      },
      select: {
        id: true,
        userId: true,
        content: true,
        createdAt: true,
        _count: {
          select: {
            likes: true,
            replies: true,
            reposts: true,
          },
        },
      },
      orderBy: [
        { likes: { _count: 'desc' } },
        { createdAt: 'desc' },
      ],
      take: 100,
    });

    return [...followingPosts, ...discoverPosts];
  }

  /**
   * Get user's interests based on interactions
   */
  private async getUserInterests(userId: string): Promise<{
    likedAuthors: Set<string>;
    engagedTopics: string[];
  }> {
    // Get authors user has liked
    const likes = await prisma.postLike.findMany({
      where: { userId },
      select: {
        post: {
          select: { userId: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const likedAuthors: Set<string> = new Set(likes.map((l) => l.post.userId as string));

    // Get topics from user's posts and likes (would need hashtag extraction)
    const engagedTopics: string[] = [];

    return { likedAuthors, engagedTopics };
  }

  /**
   * Calculate recency score (exponential decay)
   */
  private calculateRecencyScore(createdAt: Date): number {
    const ageHours = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
    const halfLife = 24; // Posts lose half their recency score every 24 hours

    return Math.pow(0.5, ageHours / halfLife);
  }

  /**
   * Calculate engagement score (normalized)
   */
  private calculateEngagementScore(
    likes: number,
    replies: number,
    reposts: number
  ): number {
    // Weighted sum with diminishing returns
    const raw = likes + replies * 2 + reposts * 3;

    // Logarithmic scaling to prevent viral posts from dominating
    return Math.log10(raw + 1) / 4; // Normalize to roughly 0-1 range
  }

  /**
   * Calculate author affinity score
   */
  private async calculateAffinityScore(
    userId: string,
    authorId: string,
    followeeIds: Set<string>
  ): Promise<number> {
    // Base score for followed users
    if (followeeIds.has(userId)) {
      return 0.8;
    }

    // Check if author is followed by people user follows (2nd degree)
    const mutualFollows = await prisma.follow.count({
      where: {
        followeeId: userId,
        followerId: { in: [...followeeIds] },
      },
    });

    if (mutualFollows > 0) {
      return Math.min(0.5, mutualFollows * 0.1);
    }

    return 0.1; // Base score for unknown authors
  }

  /**
   * Calculate content relevance score
   */
  private calculateRelevanceScore(
    post: any,
    interests: { likedAuthors: Set<string>; engagedTopics: string[] }
  ): number {
    let score = 0.3; // Base relevance

    // Boost if user has liked this author before
    if (interests.likedAuthors.has(post.userId)) {
      score += 0.4;
    }

    // Would add topic matching here

    return Math.min(1, score);
  }

  /**
   * Compute trending hashtags
   */
  async computeTrendingHashtags(): Promise<void> {
    logger.info('Computing trending hashtags');

    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - TRENDING_WINDOW_HOURS);

    // Get hashtags from recent posts
    const posts = await prisma.post.findMany({
      where: {
        createdAt: { gte: cutoff },
        deletedAt: null,
      },
      select: { content: true },
      take: 10000,
    });

    // Extract hashtags
    const hashtagCounts = new Map<string, number>();
    const hashtagRegex = /#(\w+)/g;

    for (const post of posts) {
      let match;
      while ((match = hashtagRegex.exec(post.content)) !== null) {
        const tag = match[1].toLowerCase();
        hashtagCounts.set(tag, (hashtagCounts.get(tag) || 0) + 1);
      }
    }

    // Sort by count
    const sortedTags = [...hashtagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);

    // Store in Redis
    const key = 'trending:hashtags';
    const pipeline = redis.pipeline();

    pipeline.del(key);

    for (const [tag, count] of sortedTags) {
      pipeline.zadd(key, count, tag);
    }

    pipeline.expire(key, TRENDING_CACHE_TTL);
    await pipeline.exec();

    logger.info('Trending hashtags computed', { count: sortedTags.length });
  }

  /**
   * Warm feed cache for active users
   */
  async warmFeedCaches(): Promise<void> {
    logger.info('Warming feed caches');

    // Get recently active users
    const activeUsers = await prisma.user.findMany({
      where: {
        lastActiveAt: {
          gte: new Date(Date.now() - 60 * 60 * 1000), // Active in last hour
        },
      },
      select: { id: true },
      take: 1000,
    });

    // Pre-compute feeds for active users
    for (const user of activeUsers) {
      try {
        await this.computeForYouFeed(user.id);
      } catch (error) {
        logger.error('Failed to warm feed', { userId: user.id, error });
      }
    }

    logger.info('Feed cache warming complete', { userCount: activeUsers.length });
  }
}

export const precomputeService = new PrecomputeService();

/**
 * Start scheduled pre-computation jobs
 */
export function startPrecomputeJobs(): void {
  // Compute trending every 5 minutes
  setInterval(async () => {
    try {
      await precomputeService.computeTrendingFeed();
      await precomputeService.computeTrendingHashtags();
    } catch (error) {
      logger.error('Trending computation failed', { error });
    }
  }, 5 * 60 * 1000);

  // Warm caches every 15 minutes
  setInterval(async () => {
    try {
      await precomputeService.warmFeedCaches();
    } catch (error) {
      logger.error('Feed cache warming failed', { error });
    }
  }, 15 * 60 * 1000);

  // Initial computation
  precomputeService.computeTrendingFeed().catch(logger.error);
  precomputeService.computeTrendingHashtags().catch(logger.error);

  logger.info('Pre-compute jobs started');
}
