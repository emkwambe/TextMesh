// =================================
// TEXTMESH COLD START ENGINE
// Recommendations for New Users
// =================================

import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';

// ============ COLD START TYPES ============

export interface ColdStartRecommendations {
  users: ColdStartUser[];
  groups: ColdStartGroup[];
  topics: ColdStartTopic[];
  posts: ColdStartPost[];
}

export interface ColdStartUser {
  userId: string;
  username: string;
  displayName: string;
  avatar?: string;
  bio?: string;
  followerCount: number;
  category: string;
  score: number;
}

export interface ColdStartGroup {
  groupId: string;
  name: string;
  description: string;
  memberCount: number;
  category: string;
  score: number;
}

export interface ColdStartTopic {
  topic: string;
  postCount: number;
  category: string;
  score: number;
}

export interface ColdStartPost {
  postId: string;
  authorId: string;
  content: string;
  category: string;
  score: number;
}

export interface ColdStartContext {
  signupSource?: string;
  deviceType?: string;
  location?: string;
  language?: string;
  referredBy?: string;
}

// ============ INTEREST CATEGORIES ============

const INTEREST_CATEGORIES = [
  'technology',
  'sports',
  'music',
  'movies',
  'gaming',
  'food',
  'travel',
  'fitness',
  'fashion',
  'business',
  'science',
  'art',
  'photography',
  'books',
  'news',
  'comedy',
  'education',
  'lifestyle',
  'beauty',
  'automotive',
  'entertainment',
] as const;

type InterestCategory = typeof INTEREST_CATEGORIES[number];

// ============ COLD START ENGINE CLASS ============

export class ColdStartEngine {
  private redis: Redis;
  private prisma: PrismaClient;

  constructor(redis: Redis, prisma: PrismaClient) {
    this.redis = redis;
    this.prisma = prisma;
  }

  /**
   * Get initial recommendations for a new user
   */
  async getInitialRecommendations(
    userId: string,
    interests?: string[],
    context?: ColdStartContext
  ): Promise<ColdStartRecommendations> {
    // Determine interests
    const userInterests = interests?.length
      ? this.normalizeInterests(interests)
      : await this.inferInterests(context);

    // Get recommendations for each category
    const [users, groups, topics, posts] = await Promise.all([
      this.getRecommendedUsers(userInterests, context),
      this.getRecommendedGroups(userInterests, context),
      this.getRecommendedTopics(userInterests),
      this.getRecommendedPosts(userInterests),
    ]);

    // Save user interests for future recommendations
    await this.saveUserInterests(userId, userInterests);

    return {
      users,
      groups,
      topics,
      posts,
    };
  }

  /**
   * Normalize and validate user interests
   */
  private normalizeInterests(interests: string[]): InterestCategory[] {
    const normalized: InterestCategory[] = [];

    for (const interest of interests) {
      const lower = interest.toLowerCase().trim();
      const matched = INTEREST_CATEGORIES.find((cat) =>
        cat.includes(lower) || lower.includes(cat)
      );
      if (matched && !normalized.includes(matched)) {
        normalized.push(matched);
      }
    }

    // If no valid interests, return default set
    if (normalized.length === 0) {
      return ['technology', 'entertainment', 'sports'] as InterestCategory[];
    }

    return normalized;
  }

  /**
   * Infer interests from context
   */
  private async inferInterests(
    context?: ColdStartContext
  ): Promise<InterestCategory[]> {
    const interests: InterestCategory[] = [];

    if (context?.signupSource) {
      // Infer interests from signup source
      const sourceInterests: Record<string, InterestCategory[]> = {
        producthunt: ['technology', 'business'],
        hackernews: ['technology', 'science'],
        instagram: ['photography', 'lifestyle', 'fashion'],
        twitter: ['news', 'technology'],
        reddit: ['gaming', 'technology', 'comedy'],
        tiktok: ['entertainment', 'music', 'comedy'],
        youtube: ['entertainment', 'gaming', 'music'],
      };

      const inferred = sourceInterests[context.signupSource.toLowerCase()];
      if (inferred) {
        interests.push(...inferred);
      }
    }

    // Add some diversity with popular categories
    if (interests.length < 3) {
      const popular: InterestCategory[] = ['technology', 'entertainment', 'sports'];
      for (const cat of popular) {
        if (!interests.includes(cat)) {
          interests.push(cat);
        }
        if (interests.length >= 3) break;
      }
    }

    return interests;
  }

  /**
   * Get recommended users for cold start
   */
  private async getRecommendedUsers(
    interests: InterestCategory[],
    context?: ColdStartContext
  ): Promise<ColdStartUser[]> {
    // Get curated users for each interest category
    const recommendations: ColdStartUser[] = [];

    for (const interest of interests) {
      const categoryUsers = await this.getCuratedUsersForCategory(interest);
      recommendations.push(...categoryUsers);
    }

    // Add popular users
    const popularUsers = await this.getPopularUsers();
    recommendations.push(...popularUsers);

    // If referral, include referrer's connections
    if (context?.referredBy) {
      const referrerConnections = await this.getReferrerConnections(
        context.referredBy
      );
      recommendations.push(...referrerConnections);
    }

    // Deduplicate and limit
    return this.deduplicateUsers(recommendations).slice(0, 30);
  }

  /**
   * Get recommended groups for cold start
   */
  private async getRecommendedGroups(
    interests: InterestCategory[],
    context?: ColdStartContext
  ): Promise<ColdStartGroup[]> {
    const recommendations: ColdStartGroup[] = [];

    // Get groups for each interest
    for (const interest of interests) {
      const categoryGroups = await this.getGroupsForCategory(interest);
      recommendations.push(...categoryGroups);
    }

    // Add popular groups
    const popularGroups = await this.getPopularGroups();
    recommendations.push(...popularGroups);

    // Location-based groups if available
    if (context?.location) {
      const localGroups = await this.getLocalGroups(context.location);
      recommendations.push(...localGroups);
    }

    return this.deduplicateGroups(recommendations).slice(0, 20);
  }

  /**
   * Get recommended topics for cold start
   */
  private async getRecommendedTopics(
    interests: InterestCategory[]
  ): Promise<ColdStartTopic[]> {
    const recommendations: ColdStartTopic[] = [];

    // Get topics for each interest
    for (const interest of interests) {
      const categoryTopics = await this.getTopicsForCategory(interest);
      recommendations.push(...categoryTopics);
    }

    // Add trending topics
    const trendingTopics = await this.getTrendingTopics();
    recommendations.push(...trendingTopics);

    return this.deduplicateTopics(recommendations).slice(0, 15);
  }

  /**
   * Get recommended posts for cold start (explore feed)
   */
  private async getRecommendedPosts(
    interests: InterestCategory[]
  ): Promise<ColdStartPost[]> {
    const recommendations: ColdStartPost[] = [];

    // Get high-quality posts for each interest
    for (const interest of interests) {
      const categoryPosts = await this.getPostsForCategory(interest);
      recommendations.push(...categoryPosts);
    }

    // Add viral posts
    const viralPosts = await this.getViralPosts();
    recommendations.push(...viralPosts);

    return this.deduplicatePosts(recommendations).slice(0, 50);
  }

  // ============ DATA FETCHING METHODS ============

  private async getCuratedUsersForCategory(
    category: InterestCategory
  ): Promise<ColdStartUser[]> {
    const cacheKey = `coldstart:users:${category}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached) as ColdStartUser[];
    }

    // In production, maintain curated lists per category
    // For now, return placeholder
    const users: ColdStartUser[] = [];

    // Cache for 1 hour
    await this.redis.setex(cacheKey, 3600, JSON.stringify(users));

    return users;
  }

  private async getPopularUsers(): Promise<ColdStartUser[]> {
    const cacheKey = 'coldstart:users:popular';
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached) as ColdStartUser[];
    }

    try {
      const users = await this.prisma.user.findMany({
        where: {
          isVerified: true,
          status: 'ACTIVE',
        },
        orderBy: {
          followerCount: 'desc',
        },
        take: 50,
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          bio: true,
          followerCount: true,
        },
      });

      const formatted: ColdStartUser[] = users.map((user) => ({
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl || undefined,
        bio: user.bio || undefined,
        followerCount: user.followerCount,
        category: 'popular',
        score: user.followerCount / 10000, // Normalize
      }));

      await this.redis.setex(cacheKey, 3600, JSON.stringify(formatted));

      return formatted;
    } catch {
      return [];
    }
  }

  private async getReferrerConnections(
    referrerId: string
  ): Promise<ColdStartUser[]> {
    try {
      const following = await this.prisma.follow.findMany({
        where: { followerId: referrerId },
        include: {
          followee: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              bio: true,
              followerCount: true,
            },
          },
        },
        take: 20,
      });

      return following.map((f) => ({
        userId: f.followee.id,
        username: f.followee.username,
        displayName: f.followee.displayName,
        avatarUrl: f.followee.avatarUrl || undefined,
        bio: f.followee.bio || undefined,
        followerCount: f.followee.followerCount,
        category: 'referral',
        score: 0.8, // High score for referrer's connections
      }));
    } catch {
      return [];
    }
  }

  private async getGroupsForCategory(
    category: InterestCategory
  ): Promise<ColdStartGroup[]> {
    // Return cached or fetch from database
    return [];
  }

  private async getPopularGroups(): Promise<ColdStartGroup[]> {
    return [];
  }

  private async getLocalGroups(location: string): Promise<ColdStartGroup[]> {
    return [];
  }

  private async getTopicsForCategory(
    category: InterestCategory
  ): Promise<ColdStartTopic[]> {
    return [];
  }

  private async getTrendingTopics(): Promise<ColdStartTopic[]> {
    return [];
  }

  private async getPostsForCategory(
    category: InterestCategory
  ): Promise<ColdStartPost[]> {
    return [];
  }

  private async getViralPosts(): Promise<ColdStartPost[]> {
    return [];
  }

  // ============ UTILITY METHODS ============

  private async saveUserInterests(
    userId: string,
    interests: InterestCategory[]
  ): Promise<void> {
    const key = `user:interests:${userId}`;
    if (interests.length > 0) {
      await this.redis.sadd(key, ...interests);
    }
  }

  private deduplicateUsers(users: ColdStartUser[]): ColdStartUser[] {
    const seen = new Set<string>();
    return users
      .filter((u) => {
        if (seen.has(u.userId)) return false;
        seen.add(u.userId);
        return true;
      })
      .sort((a, b) => b.score - a.score);
  }

  private deduplicateGroups(groups: ColdStartGroup[]): ColdStartGroup[] {
    const seen = new Set<string>();
    return groups
      .filter((g) => {
        if (seen.has(g.groupId)) return false;
        seen.add(g.groupId);
        return true;
      })
      .sort((a, b) => b.score - a.score);
  }

  private deduplicateTopics(topics: ColdStartTopic[]): ColdStartTopic[] {
    const seen = new Set<string>();
    return topics
      .filter((t) => {
        if (seen.has(t.topic)) return false;
        seen.add(t.topic);
        return true;
      })
      .sort((a, b) => b.score - a.score);
  }

  private deduplicatePosts(posts: ColdStartPost[]): ColdStartPost[] {
    const seen = new Set<string>();
    return posts
      .filter((p) => {
        if (seen.has(p.postId)) return false;
        seen.add(p.postId);
        return true;
      })
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Get available interest categories
   */
  getInterestCategories(): string[] {
    return [...INTEREST_CATEGORIES];
  }

  /**
   * Update curated content for category (admin function)
   */
  async updateCuratedContent(
    category: InterestCategory,
    type: 'users' | 'groups' | 'topics',
    ids: string[]
  ): Promise<void> {
    const key = `coldstart:curated:${type}:${category}`;
    await this.redis.del(key);
    if (ids.length > 0) {
      await this.redis.sadd(key, ...ids);
    }
  }
}

export default ColdStartEngine;
