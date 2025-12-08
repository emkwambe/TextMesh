// =================================
// TEXTMESH FOLLOW SUGGESTIONS
// Smart User Discovery & Suggestions
// =================================

import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';

// ============ SUGGESTION TYPES ============

export interface UserSuggestion {
  userId: string;
  username: string;
  displayName: string;
  avatar?: string;
  bio?: string;
  followerCount: number;
  isVerified: boolean;
  reason: SuggestionReason;
  score: number;
  mutualFollowers?: number;
  mutualInterests?: string[];
}

export interface SuggestionReason {
  type: SuggestionType;
  description: string;
  icon: string;
}

export type SuggestionType =
  | 'popular'
  | 'interests'
  | 'mutual'
  | 'similar'
  | 'local'
  | 'contacts'
  | 'trending'
  | 'curated';

export interface SuggestionOptions {
  limit?: number;
  type?: SuggestionType | 'all';
  excludeFollowing?: boolean;
}

// ============ SUGGESTION REASONS ============

const SUGGESTION_REASONS: Record<SuggestionType, SuggestionReason> = {
  popular: {
    type: 'popular',
    description: 'Popular on TextMesh',
    icon: '🔥',
  },
  interests: {
    type: 'interests',
    description: 'Based on your interests',
    icon: '🎯',
  },
  mutual: {
    type: 'mutual',
    description: 'Followed by people you follow',
    icon: '👥',
  },
  similar: {
    type: 'similar',
    description: 'Similar to accounts you follow',
    icon: '✨',
  },
  local: {
    type: 'local',
    description: 'From your area',
    icon: '📍',
  },
  contacts: {
    type: 'contacts',
    description: 'From your contacts',
    icon: '📱',
  },
  trending: {
    type: 'trending',
    description: 'Trending today',
    icon: '📈',
  },
  curated: {
    type: 'curated',
    description: 'Recommended for you',
    icon: '⭐',
  },
};

// ============ FOLLOW SUGGESTIONS CLASS ============

export class FollowSuggestions {
  private redis: Redis;
  private prisma: PrismaClient;

  constructor(redis: Redis, prisma: PrismaClient) {
    this.redis = redis;
    this.prisma = prisma;
  }

  /**
   * Get follow suggestions for user
   */
  async getSuggestions(
    userId: string,
    options: SuggestionOptions = {}
  ): Promise<UserSuggestion[]> {
    const { limit = 20, type = 'all', excludeFollowing = true } = options;

    let suggestions: UserSuggestion[] = [];

    // Get user's current following list for exclusion
    let followingIds: Set<string> = new Set();
    if (excludeFollowing) {
      const following = await this.redis.smembers(`user:following:${userId}`);
      followingIds = new Set(following);
      followingIds.add(userId); // Exclude self
    }

    // Get suggestions based on type
    if (type === 'all') {
      const [
        popular,
        interests,
        mutual,
        similar,
        trending,
      ] = await Promise.all([
        this.getPopularSuggestions(userId, followingIds, 10),
        this.getInterestBasedSuggestions(userId, followingIds, 10),
        this.getMutualFollowerSuggestions(userId, followingIds, 10),
        this.getSimilarAccountSuggestions(userId, followingIds, 10),
        this.getTrendingSuggestions(userId, followingIds, 5),
      ]);

      suggestions = [
        ...this.diversify([...popular, ...interests, ...mutual, ...similar, ...trending]),
      ];
    } else {
      suggestions = await this.getSuggestionsByType(userId, type, followingIds, limit);
    }

    // Sort by score and limit
    return suggestions
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Get suggestions by specific type
   */
  private async getSuggestionsByType(
    userId: string,
    type: SuggestionType,
    excludeIds: Set<string>,
    limit: number
  ): Promise<UserSuggestion[]> {
    switch (type) {
      case 'popular':
        return this.getPopularSuggestions(userId, excludeIds, limit);
      case 'interests':
        return this.getInterestBasedSuggestions(userId, excludeIds, limit);
      case 'mutual':
        return this.getMutualFollowerSuggestions(userId, excludeIds, limit);
      case 'similar':
        return this.getSimilarAccountSuggestions(userId, excludeIds, limit);
      case 'local':
        return this.getLocalSuggestions(userId, excludeIds, limit);
      case 'trending':
        return this.getTrendingSuggestions(userId, excludeIds, limit);
      case 'curated':
        return this.getCuratedSuggestions(userId, excludeIds, limit);
      default:
        return this.getPopularSuggestions(userId, excludeIds, limit);
    }
  }

  /**
   * Get popular users
   */
  private async getPopularSuggestions(
    userId: string,
    excludeIds: Set<string>,
    limit: number
  ): Promise<UserSuggestion[]> {
    try {
      const users = await this.prisma.user.findMany({
        where: {
          id: { notIn: [...excludeIds] },
          isVerified: true,
          isBanned: false,
        },
        orderBy: { followerCount: 'desc' },
        take: limit * 2,
        select: {
          id: true,
          username: true,
          displayName: true,
          avatar: true,
          bio: true,
          followerCount: true,
          isVerified: true,
        },
      });

      return users
        .filter((u) => !excludeIds.has(u.id))
        .slice(0, limit)
        .map((u) => ({
          userId: u.id,
          username: u.username,
          displayName: u.displayName,
          avatar: u.avatar || undefined,
          bio: u.bio || undefined,
          followerCount: u.followerCount,
          isVerified: u.isVerified,
          reason: SUGGESTION_REASONS.popular,
          score: Math.min(1, u.followerCount / 100000),
        }));
    } catch {
      return [];
    }
  }

  /**
   * Get suggestions based on shared interests
   */
  private async getInterestBasedSuggestions(
    userId: string,
    excludeIds: Set<string>,
    limit: number
  ): Promise<UserSuggestion[]> {
    // Get user's interests
    const userInterests = await this.redis.smembers(`user:interests:${userId}`);
    if (userInterests.length === 0) {
      return [];
    }

    const suggestions: UserSuggestion[] = [];

    // Find users with matching interests
    for (const interest of userInterests.slice(0, 5)) {
      const usersWithInterest = await this.redis.smembers(`interest:users:${interest}`);

      for (const candidateId of usersWithInterest.slice(0, 20)) {
        if (excludeIds.has(candidateId) || suggestions.some((s) => s.userId === candidateId)) {
          continue;
        }

        // Get candidate's full interests to calculate overlap
        const candidateInterests = await this.redis.smembers(`user:interests:${candidateId}`);
        const overlap = userInterests.filter((i) => candidateInterests.includes(i));

        if (overlap.length >= 1) {
          const user = await this.getUserDetails(candidateId);
          if (user) {
            suggestions.push({
              ...user,
              reason: SUGGESTION_REASONS.interests,
              score: 0.5 + (overlap.length / userInterests.length) * 0.5,
              mutualInterests: overlap,
            });
          }
        }

        if (suggestions.length >= limit) break;
      }

      if (suggestions.length >= limit) break;
    }

    return suggestions.slice(0, limit);
  }

  /**
   * Get suggestions based on mutual followers
   */
  private async getMutualFollowerSuggestions(
    userId: string,
    excludeIds: Set<string>,
    limit: number
  ): Promise<UserSuggestion[]> {
    // Get who the user follows
    const following = await this.redis.smembers(`user:following:${userId}`);
    if (following.length === 0) {
      return [];
    }

    // Count how many times each candidate is followed by people user follows
    const candidateCounts = new Map<string, number>();

    for (const followedId of following.slice(0, 50)) {
      const theirFollowing = await this.redis.smembers(`user:following:${followedId}`);

      for (const candidateId of theirFollowing) {
        if (excludeIds.has(candidateId)) continue;

        candidateCounts.set(
          candidateId,
          (candidateCounts.get(candidateId) || 0) + 1
        );
      }
    }

    // Sort by count and get top candidates
    const sortedCandidates = [...candidateCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    const suggestions: UserSuggestion[] = [];

    for (const [candidateId, mutualCount] of sortedCandidates) {
      const user = await this.getUserDetails(candidateId);
      if (user) {
        suggestions.push({
          ...user,
          reason: SUGGESTION_REASONS.mutual,
          score: Math.min(1, 0.3 + mutualCount * 0.1),
          mutualFollowers: mutualCount,
        });
      }
    }

    return suggestions;
  }

  /**
   * Get suggestions similar to accounts user follows
   */
  private async getSimilarAccountSuggestions(
    userId: string,
    excludeIds: Set<string>,
    limit: number
  ): Promise<UserSuggestion[]> {
    // This would use ML-based similarity in production
    // For now, use follower overlap
    const following = await this.redis.smembers(`user:following:${userId}`);
    if (following.length === 0) {
      return [];
    }

    const candidateScores = new Map<string, number>();

    // For each followed account, find their followers
    for (const followedId of following.slice(0, 20)) {
      const followers = await this.redis.smembers(`user:followers:${followedId}`);

      for (const candidateId of followers.slice(0, 50)) {
        if (excludeIds.has(candidateId)) continue;

        // Check if candidate follows similar accounts
        const candidateFollowing = await this.redis.smembers(`user:following:${candidateId}`);
        const overlap = following.filter((f) => candidateFollowing.includes(f));

        if (overlap.length >= 2) {
          candidateScores.set(
            candidateId,
            Math.max(
              candidateScores.get(candidateId) || 0,
              overlap.length / following.length
            )
          );
        }
      }
    }

    const sorted = [...candidateScores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    const suggestions: UserSuggestion[] = [];

    for (const [candidateId, score] of sorted) {
      const user = await this.getUserDetails(candidateId);
      if (user) {
        suggestions.push({
          ...user,
          reason: SUGGESTION_REASONS.similar,
          score: 0.4 + score * 0.6,
        });
      }
    }

    return suggestions;
  }

  /**
   * Get local suggestions based on location
   */
  private async getLocalSuggestions(
    userId: string,
    excludeIds: Set<string>,
    limit: number
  ): Promise<UserSuggestion[]> {
    // Get user's location
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { location: true },
    });

    if (!user?.location) {
      return [];
    }

    try {
      const localUsers = await this.prisma.user.findMany({
        where: {
          id: { notIn: [...excludeIds] },
          location: { contains: user.location, mode: 'insensitive' },
          isBanned: false,
        },
        take: limit,
        select: {
          id: true,
          username: true,
          displayName: true,
          avatar: true,
          bio: true,
          followerCount: true,
          isVerified: true,
        },
      });

      return localUsers.map((u) => ({
        userId: u.id,
        username: u.username,
        displayName: u.displayName,
        avatar: u.avatar || undefined,
        bio: u.bio || undefined,
        followerCount: u.followerCount,
        isVerified: u.isVerified,
        reason: SUGGESTION_REASONS.local,
        score: 0.6,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Get trending users
   */
  private async getTrendingSuggestions(
    userId: string,
    excludeIds: Set<string>,
    limit: number
  ): Promise<UserSuggestion[]> {
    const trendingIds = await this.redis.zrevrange('trending:users', 0, limit * 2);

    const suggestions: UserSuggestion[] = [];

    for (const candidateId of trendingIds) {
      if (excludeIds.has(candidateId)) continue;

      const user = await this.getUserDetails(candidateId);
      if (user) {
        suggestions.push({
          ...user,
          reason: SUGGESTION_REASONS.trending,
          score: 0.7,
        });
      }

      if (suggestions.length >= limit) break;
    }

    return suggestions;
  }

  /**
   * Get curated suggestions (staff picks, featured accounts)
   */
  private async getCuratedSuggestions(
    _userId: string,
    excludeIds: Set<string>,
    limit: number
  ): Promise<UserSuggestion[]> {
    const curatedIds = await this.redis.smembers('curated:users');

    const suggestions: UserSuggestion[] = [];

    for (const candidateId of curatedIds) {
      if (excludeIds.has(candidateId)) continue;

      const user = await this.getUserDetails(candidateId);
      if (user) {
        suggestions.push({
          ...user,
          reason: SUGGESTION_REASONS.curated,
          score: 0.9,
        });
      }

      if (suggestions.length >= limit) break;
    }

    return suggestions;
  }

  /**
   * Dismiss a suggestion
   */
  async dismissSuggestion(userId: string, targetUserId: string): Promise<void> {
    const key = `suggestions:dismissed:${userId}`;
    await this.redis.sadd(key, targetUserId);
    await this.redis.expire(key, 86400 * 30); // 30 days
  }

  /**
   * Get dismissed suggestions
   */
  async getDismissedSuggestions(userId: string): Promise<string[]> {
    return this.redis.smembers(`suggestions:dismissed:${userId}`);
  }

  // ============ HELPER METHODS ============

  private async getUserDetails(userId: string): Promise<Omit<UserSuggestion, 'reason' | 'score'> | null> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          displayName: true,
          avatar: true,
          bio: true,
          followerCount: true,
          isVerified: true,
        },
      });

      if (!user) return null;

      return {
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
        avatar: user.avatar || undefined,
        bio: user.bio || undefined,
        followerCount: user.followerCount,
        isVerified: user.isVerified,
      };
    } catch {
      return null;
    }
  }

  private diversify(suggestions: UserSuggestion[]): UserSuggestion[] {
    // Ensure diversity by alternating between different suggestion types
    const byType = new Map<SuggestionType, UserSuggestion[]>();

    for (const s of suggestions) {
      const list = byType.get(s.reason.type) || [];
      list.push(s);
      byType.set(s.reason.type, list);
    }

    const result: UserSuggestion[] = [];
    const types = [...byType.keys()];
    let typeIndex = 0;

    while (result.length < suggestions.length) {
      const type = types[typeIndex % types.length];
      if (type) {
        const list = byType.get(type);
        if (list && list.length > 0) {
          const item = list.shift();
          if (item && !result.some((r) => r.userId === item.userId)) {
            result.push(item);
          }
        }
      }
      typeIndex++;

      // Safety check to prevent infinite loop
      if (typeIndex > suggestions.length * 2) break;
    }

    return result;
  }
}

export default FollowSuggestions;
