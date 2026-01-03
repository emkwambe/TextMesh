// =================================
// FEED CACHE
// Redis caching strategy for feeds
// =================================

import Redis from 'ioredis';
import { Logger } from '@textmesh/logger';

// ============ TYPES ============

export interface Post {
  id: string;
  userId: string;
  content: string;
  createdAt: Date;
  // ... other fields
}

// Cache TTL Configuration (in seconds)
export const CACHE_TTL = {
  HOME_FEED: 60 * 5,        // 5 minutes
  GROUP_FEED: 60 * 10,      // 10 minutes
  TRENDING_FEED: 60 * 15,   // 15 minutes
  POST_DETAIL: 60 * 30,     // 30 minutes
} as const;

// ============ FEED CACHE CLASS ============

export class FeedCache {
  constructor(
    private redis: Redis,
    private logger: Logger
  ) {}

  /**
   * Cache home feed for a user
   */
  async cacheHomeFeed(userId: string, posts: any[], ttl: number = CACHE_TTL.HOME_FEED): Promise<void> {
    const key = `feed:home:${userId}`;
    try {
      await this.redis.setex(key, ttl, JSON.stringify(posts));
      this.logger.debug(`Cached home feed for user ${userId}`);
    } catch (error) {
      this.logger.error('Failed to cache home feed', { userId, error });
    }
  }

  /**
   * Get cached home feed
   */
  async getHomeFeed(userId: string): Promise<any[] | null> {
    const key = `feed:home:${userId}`;
    try {
      const cached = await this.redis.get(key);
      if (cached) {
        this.logger.debug(`Cache hit for home feed: ${userId}`);
        return JSON.parse(cached);
      }
      this.logger.debug(`Cache miss for home feed: ${userId}`);
      return null;
    } catch (error) {
      this.logger.error('Failed to get cached home feed', { userId, error });
      return null;
    }
  }

  /**
   * Cache group feed
   */
  async cacheGroupFeed(groupId: string, posts: any[], ttl: number = CACHE_TTL.GROUP_FEED): Promise<void> {
    const key = `feed:group:${groupId}`;
    try {
      await this.redis.setex(key, ttl, JSON.stringify(posts));
      this.logger.debug(`Cached group feed for ${groupId}`);
    } catch (error) {
      this.logger.error('Failed to cache group feed', { groupId, error });
    }
  }

  /**
   * Get cached group feed
   */
  async getGroupFeed(groupId: string): Promise<any[] | null> {
    const key = `feed:group:${groupId}`;
    try {
      const cached = await this.redis.get(key);
      if (cached) {
        this.logger.debug(`Cache hit for group feed: ${groupId}`);
        return JSON.parse(cached);
      }
      this.logger.debug(`Cache miss for group feed: ${groupId}`);
      return null;
    } catch (error) {
      this.logger.error('Failed to get cached group feed', { groupId, error });
      return null;
    }
  }

  /**
   * Cache trending feed (global)
   */
  async cacheTrendingFeed(posts: any[], ttl: number = CACHE_TTL.TRENDING_FEED): Promise<void> {
    const key = 'feed:trending';
    try {
      await this.redis.setex(key, ttl, JSON.stringify(posts));
      this.logger.debug('Cached trending feed');
    } catch (error) {
      this.logger.error('Failed to cache trending feed', { error });
    }
  }

  /**
   * Get cached trending feed
   */
  async getTrendingFeed(): Promise<any[] | null> {
    const key = 'feed:trending';
    try {
      const cached = await this.redis.get(key);
      if (cached) {
        this.logger.debug('Cache hit for trending feed');
        return JSON.parse(cached);
      }
      this.logger.debug('Cache miss for trending feed');
      return null;
    } catch (error) {
      this.logger.error('Failed to get cached trending feed', { error });
      return null;
    }
  }

  /**
   * Invalidate cache when a new post is created
   */
  async invalidateOnNewPost(postId: string, userId: string, groupId?: string): Promise<void> {
    try {
      // Invalidate user's home feed
      await this.redis.del(`feed:home:${userId}`);

      // Invalidate group feed if applicable
      if (groupId) {
        await this.redis.del(`feed:group:${groupId}`);
      }

      // Invalidate trending feed
      await this.redis.del('feed:trending');

      this.logger.debug(`Invalidated caches for new post ${postId}`);
    } catch (error) {
      this.logger.error('Failed to invalidate cache on new post', { postId, error });
    }
  }

  /**
   * Invalidate cache when user joins a group
   */
  async invalidateOnGroupJoin(userId: string, groupId: string): Promise<void> {
    try {
      // User's home feed now includes this group's posts
      await this.redis.del(`feed:home:${userId}`);

      this.logger.debug(`Invalidated home feed for user ${userId} after joining group ${groupId}`);
    } catch (error) {
      this.logger.error('Failed to invalidate cache on group join', { userId, groupId, error });
    }
  }

  /**
   * Invalidate all feed caches for a user
   */
  async invalidateUserFeeds(userId: string): Promise<void> {
    try {
      await this.redis.del(`feed:home:${userId}`);
      this.logger.debug(`Invalidated all feeds for user ${userId}`);
    } catch (error) {
      this.logger.error('Failed to invalidate user feeds', { userId, error });
    }
  }

  /**
   * Get cache hit rate (for monitoring)
   */
  async getCacheStats(): Promise<{ hits: number; misses: number; hitRate: number }> {
    try {
      const hits = parseInt(await this.redis.get('cache:hits') || '0', 10);
      const misses = parseInt(await this.redis.get('cache:misses') || '0', 10);
      const total = hits + misses;
      const hitRate = total > 0 ? hits / total : 0;

      return { hits, misses, hitRate };
    } catch (error) {
      this.logger.error('Failed to get cache stats', { error });
      return { hits: 0, misses: 0, hitRate: 0 };
    }
  }

  /**
   * Increment cache hit counter
   */
  async recordCacheHit(): Promise<void> {
    try {
      await this.redis.incr('cache:hits');
    } catch (error) {
      // Silently fail - stats are not critical
    }
  }

  /**
   * Increment cache miss counter
   */
  async recordCacheMiss(): Promise<void> {
    try {
      await this.redis.incr('cache:misses');
    } catch (error) {
      // Silently fail - stats are not critical
    }
  }
}
