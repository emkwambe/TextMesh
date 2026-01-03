// =================================
// TEXTMESH RECOMMENDATION ENGINE
// User, Post, Group, Topic Recommendations
// =================================

import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';

// ============ RECOMMENDATION TYPES ============

export interface UserRecommendation {
  userId: string;
  username: string;
  displayName: string;
  avatar?: string;
  bio?: string;
  followerCount: number;
  score: number;
  reasons: string[];
}

export interface PostRecommendation {
  postId: string;
  authorId: string;
  content: string;
  metrics: PostMetrics;
  score: number;
  reasons: string[];
}

export interface GroupRecommendation {
  groupId: string;
  name: string;
  description: string;
  memberCount: number;
  postFrequency: number;
  score: number;
  reasons: string[];
}

export interface TopicRecommendation {
  topic: string;
  postCount: number;
  engagementRate: number;
  score: number;
  reasons: string[];
}

interface PostMetrics {
  likes: number;
  comments: number;
  reposts: number;
}

// ============ RECOMMENDATION ENGINE CLASS ============

export class RecommendationEngine {
  private redis: Redis;
  private prisma: PrismaClient;

  constructor(redis: Redis, prisma: PrismaClient) {
    this.redis = redis;
    this.prisma = prisma;
  }

  /**
   * Get recommendations based on type
   */
  async getRecommendations(
    userId: string,
    type: 'users' | 'posts' | 'groups' | 'topics',
    limit: number = 20
  ): Promise<UserRecommendation[] | PostRecommendation[] | GroupRecommendation[] | TopicRecommendation[]> {
    switch (type) {
      case 'users':
        return this.recommendUsers(userId, limit);
      case 'posts':
        return this.recommendPosts(userId, limit);
      case 'groups':
        return this.recommendGroups(userId, limit);
      case 'topics':
        return this.recommendTopics(userId, limit);
      default:
        return [];
    }
  }

  /**
   * Recommend users to follow
   *
   * Algorithm:
   * 1. Friends of friends (mutual connections)
   * 2. Users with similar interests
   * 3. Popular users in user's interest areas
   * 4. Users from same groups
   */
  async recommendUsers(userId: string, limit: number): Promise<UserRecommendation[]> {
    const recommendations: UserRecommendation[] = [];
    const alreadyFollowing = await this.getFollowing(userId);
    const blockedUsers = await this.getBlockedUsers(userId);

    // Strategy 1: Friends of friends
    const fofRecommendations = await this.getFriendsOfFriends(
      userId,
      alreadyFollowing,
      blockedUsers,
      Math.ceil(limit * 0.4)
    );
    recommendations.push(...fofRecommendations);

    // Strategy 2: Similar interests
    const interestRecommendations = await this.getUsersWithSimilarInterests(
      userId,
      alreadyFollowing,
      blockedUsers,
      Math.ceil(limit * 0.3)
    );
    recommendations.push(...interestRecommendations);

    // Strategy 3: Popular in interests
    const popularRecommendations = await this.getPopularUsersInInterests(
      userId,
      alreadyFollowing,
      blockedUsers,
      Math.ceil(limit * 0.2)
    );
    recommendations.push(...popularRecommendations);

    // Strategy 4: Same groups
    const groupRecommendations = await this.getUsersFromSameGroups(
      userId,
      alreadyFollowing,
      blockedUsers,
      Math.ceil(limit * 0.1)
    );
    recommendations.push(...groupRecommendations);

    // Deduplicate and sort by score
    const deduped = this.deduplicateRecommendations(recommendations);
    return deduped.slice(0, limit);
  }

  /**
   * Recommend posts (explore feed)
   */
  async recommendPosts(userId: string, limit: number): Promise<PostRecommendation[]> {
    const userInterests = await this.getUserInterests(userId);
    const seenPosts = await this.getRecentlySeenPosts(userId);

    // Get posts from topics the user is interested in
    const recommendations: PostRecommendation[] = [];

    // Strategy 1: High engagement posts from interest areas
    const interestPosts = await this.getPostsFromInterests(
      userInterests,
      seenPosts,
      Math.ceil(limit * 0.5)
    );
    recommendations.push(...interestPosts);

    // Strategy 2: Viral posts
    const viralPosts = await this.getViralPosts(seenPosts, Math.ceil(limit * 0.3));
    recommendations.push(...viralPosts);

    // Strategy 3: Rising posts (gaining engagement quickly)
    const risingPosts = await this.getRisingPosts(seenPosts, Math.ceil(limit * 0.2));
    recommendations.push(...risingPosts);

    return this.deduplicatePostRecommendations(recommendations).slice(0, limit);
  }

  /**
   * Recommend groups to join
   */
  async recommendGroups(userId: string, limit: number): Promise<GroupRecommendation[]> {
    const joinedGroups = await this.getJoinedGroups(userId);
    const userInterests = await this.getUserInterests(userId);

    const recommendations: GroupRecommendation[] = [];

    // Strategy 1: Groups matching interests
    const interestGroups = await this.getGroupsMatchingInterests(
      userInterests,
      joinedGroups,
      Math.ceil(limit * 0.5)
    );
    recommendations.push(...interestGroups);

    // Strategy 2: Groups friends are in
    const friendGroups = await this.getGroupsFriendsAreIn(
      userId,
      joinedGroups,
      Math.ceil(limit * 0.3)
    );
    recommendations.push(...friendGroups);

    // Strategy 3: Popular groups
    const popularGroups = await this.getPopularGroups(
      joinedGroups,
      Math.ceil(limit * 0.2)
    );
    recommendations.push(...popularGroups);

    return recommendations.slice(0, limit);
  }

  /**
   * Recommend topics to follow
   */
  async recommendTopics(userId: string, limit: number): Promise<TopicRecommendation[]> {
    const followedTopics = await this.getFollowedTopics(userId);

    const recommendations: TopicRecommendation[] = [];

    // Strategy 1: Related to followed topics
    const relatedTopics = await this.getRelatedTopics(
      followedTopics,
      Math.ceil(limit * 0.5)
    );
    recommendations.push(...relatedTopics);

    // Strategy 2: Trending topics
    const trendingTopics = await this.getTrendingTopics(
      followedTopics,
      Math.ceil(limit * 0.3)
    );
    recommendations.push(...trendingTopics);

    // Strategy 3: Popular topics
    const popularTopics = await this.getPopularTopics(
      followedTopics,
      Math.ceil(limit * 0.2)
    );
    recommendations.push(...popularTopics);

    return recommendations.slice(0, limit);
  }

  // ============ HELPER METHODS ============

  private async getFollowing(userId: string): Promise<Set<string>> {
    const cacheKey = `user:following:${userId}`;
    const cached = await this.redis.smembers(cacheKey);
    if (cached.length > 0) {
      return new Set(cached);
    }

    try {
      const following = await this.prisma.follow.findMany({
        where: { followerId: userId },
        select: { followeeId: true },
      });
      const ids = following.map((f) => f.followeeId);
      if (ids.length > 0) {
        await this.redis.sadd(cacheKey, ...ids);
        await this.redis.expire(cacheKey, 3600);
      }
      return new Set(ids);
    } catch {
      return new Set();
    }
  }

  private async getBlockedUsers(userId: string): Promise<Set<string>> {
    const cacheKey = `user:blocked:${userId}`;
    const blocked = await this.redis.smembers(cacheKey);
    return new Set(blocked);
  }

  private async getFriendsOfFriends(
    userId: string,
    alreadyFollowing: Set<string>,
    blockedUsers: Set<string>,
    limit: number
  ): Promise<UserRecommendation[]> {
    // In production, use graph database or optimized SQL query
    // This is a simplified implementation
    const fofScores = new Map<string, number>();

    for (const followeeId of alreadyFollowing) {
      const theirFollowing = await this.getFollowing(followeeId);
      for (const fofId of theirFollowing) {
        if (fofId !== userId && !alreadyFollowing.has(fofId) && !blockedUsers.has(fofId)) {
          fofScores.set(fofId, (fofScores.get(fofId) || 0) + 1);
        }
      }
    }

    // Convert to recommendations
    const recommendations: UserRecommendation[] = [];
    const sortedFof = Array.from(fofScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    for (const [fofId, mutualCount] of sortedFof) {
      recommendations.push({
        userId: fofId,
        username: '',
        displayName: '',
        followerCount: 0,
        score: Math.min(1.0, mutualCount * 0.1),
        reasons: [`${mutualCount} mutual connections`],
      });
    }

    return recommendations;
  }

  private async getUsersWithSimilarInterests(
    userId: string,
    alreadyFollowing: Set<string>,
    blockedUsers: Set<string>,
    limit: number
  ): Promise<UserRecommendation[]> {
    // Simplified - in production, use collaborative filtering
    return [];
  }

  private async getPopularUsersInInterests(
    userId: string,
    alreadyFollowing: Set<string>,
    blockedUsers: Set<string>,
    limit: number
  ): Promise<UserRecommendation[]> {
    // Get popular users overall
    return [];
  }

  private async getUsersFromSameGroups(
    userId: string,
    alreadyFollowing: Set<string>,
    blockedUsers: Set<string>,
    limit: number
  ): Promise<UserRecommendation[]> {
    return [];
  }

  private async getUserInterests(userId: string): Promise<string[]> {
    const cacheKey = `user:interests:${userId}`;
    const cached = await this.redis.smembers(cacheKey);
    return cached;
  }

  private async getRecentlySeenPosts(userId: string): Promise<Set<string>> {
    const cacheKey = `user:seen_posts:${userId}`;
    const seen = await this.redis.smembers(cacheKey);
    return new Set(seen);
  }

  private async getPostsFromInterests(
    interests: string[],
    seenPosts: Set<string>,
    limit: number
  ): Promise<PostRecommendation[]> {
    return [];
  }

  private async getViralPosts(
    seenPosts: Set<string>,
    limit: number
  ): Promise<PostRecommendation[]> {
    return [];
  }

  private async getRisingPosts(
    seenPosts: Set<string>,
    limit: number
  ): Promise<PostRecommendation[]> {
    return [];
  }

  private async getJoinedGroups(userId: string): Promise<Set<string>> {
    return new Set();
  }

  private async getGroupsMatchingInterests(
    interests: string[],
    joinedGroups: Set<string>,
    limit: number
  ): Promise<GroupRecommendation[]> {
    return [];
  }

  private async getGroupsFriendsAreIn(
    userId: string,
    joinedGroups: Set<string>,
    limit: number
  ): Promise<GroupRecommendation[]> {
    return [];
  }

  private async getPopularGroups(
    joinedGroups: Set<string>,
    limit: number
  ): Promise<GroupRecommendation[]> {
    return [];
  }

  private async getFollowedTopics(userId: string): Promise<string[]> {
    return [];
  }

  private async getRelatedTopics(
    followedTopics: string[],
    limit: number
  ): Promise<TopicRecommendation[]> {
    return [];
  }

  private async getTrendingTopics(
    followedTopics: string[],
    limit: number
  ): Promise<TopicRecommendation[]> {
    return [];
  }

  private async getPopularTopics(
    followedTopics: string[],
    limit: number
  ): Promise<TopicRecommendation[]> {
    return [];
  }

  private deduplicateRecommendations(
    recommendations: UserRecommendation[]
  ): UserRecommendation[] {
    const seen = new Set<string>();
    return recommendations.filter((r) => {
      if (seen.has(r.userId)) return false;
      seen.add(r.userId);
      return true;
    }).sort((a, b) => b.score - a.score);
  }

  private deduplicatePostRecommendations(
    recommendations: PostRecommendation[]
  ): PostRecommendation[] {
    const seen = new Set<string>();
    return recommendations.filter((r) => {
      if (seen.has(r.postId)) return false;
      seen.add(r.postId);
      return true;
    }).sort((a, b) => b.score - a.score);
  }
}

export default RecommendationEngine;
