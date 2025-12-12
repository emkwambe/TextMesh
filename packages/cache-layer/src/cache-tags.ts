/**
 * Cache Tags
 *
 * Tag-based cache invalidation for complex relationships
 */

import Redis from 'ioredis';
import { createLogger } from '@textmesh/logger';

const logger = createLogger({ service: 'cache-tags', level: 'info' });

export class CacheTagManager {
  private redis: Redis;
  private prefix: string;

  constructor(redis: Redis, prefix: string = 'cache:') {
    this.redis = redis;
    this.prefix = prefix;
  }

  /**
   * Tag a cache key
   */
  async tag(key: string, tags: string[], ttl: number): Promise<void> {
    const pipeline = this.redis.pipeline();

    for (const tag of tags) {
      const tagKey = `${this.prefix}tag:${tag}`;
      pipeline.sadd(tagKey, key);
      pipeline.expire(tagKey, ttl);
    }

    // Also store reverse mapping (key -> tags)
    const keyTagsKey = `${this.prefix}key-tags:${key}`;
    pipeline.sadd(keyTagsKey, ...tags);
    pipeline.expire(keyTagsKey, ttl);

    await pipeline.exec();
  }

  /**
   * Get all keys with a specific tag
   */
  async getTaggedKeys(tag: string): Promise<string[]> {
    const tagKey = `${this.prefix}tag:${tag}`;
    return this.redis.smembers(tagKey);
  }

  /**
   * Get all tags for a key
   */
  async getKeyTags(key: string): Promise<string[]> {
    const keyTagsKey = `${this.prefix}key-tags:${key}`;
    return this.redis.smembers(keyTagsKey);
  }

  /**
   * Invalidate all keys with a specific tag
   */
  async invalidateTag(tag: string): Promise<number> {
    const tagKey = `${this.prefix}tag:${tag}`;
    const keys = await this.redis.smembers(tagKey);

    if (keys.length === 0) {
      return 0;
    }

    const pipeline = this.redis.pipeline();

    // Delete all tagged cache keys
    for (const key of keys) {
      pipeline.del(`${this.prefix}${key}`);
      pipeline.del(`${this.prefix}key-tags:${key}`);
    }

    // Delete the tag set itself
    pipeline.del(tagKey);

    await pipeline.exec();

    logger.info('Invalidated tag', { tag, count: keys.length });

    return keys.length;
  }

  /**
   * Invalidate multiple tags
   */
  async invalidateTags(tags: string[]): Promise<number> {
    let totalInvalidated = 0;

    for (const tag of tags) {
      const count = await this.invalidateTag(tag);
      totalInvalidated += count;
    }

    return totalInvalidated;
  }

  /**
   * Remove key from all its tags
   */
  async untagKey(key: string): Promise<void> {
    const tags = await this.getKeyTags(key);

    if (tags.length === 0) return;

    const pipeline = this.redis.pipeline();

    // Remove key from each tag set
    for (const tag of tags) {
      const tagKey = `${this.prefix}tag:${tag}`;
      pipeline.srem(tagKey, key);
    }

    // Delete the key-tags mapping
    pipeline.del(`${this.prefix}key-tags:${key}`);

    await pipeline.exec();
  }

  /**
   * Get tag statistics
   */
  async getTagStats(): Promise<Map<string, number>> {
    const pattern = `${this.prefix}tag:*`;
    const keys = await this.redis.keys(pattern);

    const stats = new Map<string, number>();

    for (const key of keys) {
      const tag = key.replace(`${this.prefix}tag:`, '');
      const count = await this.redis.scard(key);
      stats.set(tag, count);
    }

    return stats;
  }

  /**
   * Clean up empty tag sets
   */
  async cleanup(): Promise<number> {
    const pattern = `${this.prefix}tag:*`;
    const keys = await this.redis.keys(pattern);

    let cleaned = 0;

    for (const key of keys) {
      const count = await this.redis.scard(key);
      if (count === 0) {
        await this.redis.del(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info('Cleaned up empty tag sets', { count: cleaned });
    }

    return cleaned;
  }
}

/**
 * Predefined tag generators for common entities
 */
export const TagGenerators = {
  user: (userId: string) => [
    `user:${userId}`,
    'entity:user',
  ],

  post: (postId: string, authorId: string) => [
    `post:${postId}`,
    `user-posts:${authorId}`,
    'entity:post',
  ],

  comment: (commentId: string, postId: string, authorId: string) => [
    `comment:${commentId}`,
    `post-comments:${postId}`,
    `user-comments:${authorId}`,
    'entity:comment',
  ],

  group: (groupId: string) => [
    `group:${groupId}`,
    'entity:group',
  ],

  feed: (userId: string) => [
    `feed:${userId}`,
    'entity:feed',
  ],

  notification: (userId: string) => [
    `notifications:${userId}`,
    'entity:notification',
  ],

  search: (query: string) => [
    `search:${query.toLowerCase().replace(/\s+/g, '_')}`,
    'entity:search',
  ],

  trending: () => [
    'trending',
    'volatile',
  ],
};

/**
 * Invalidation rules for entity updates
 */
export const InvalidationRules = {
  userUpdated: (userId: string) => [
    `user:${userId}`,
    `user-posts:${userId}`,
    `feed:${userId}`,
  ],

  postCreated: (authorId: string) => [
    `user-posts:${authorId}`,
    'trending',
    // Followers' feeds would be invalidated separately
  ],

  postDeleted: (postId: string, authorId: string) => [
    `post:${postId}`,
    `post-comments:${postId}`,
    `user-posts:${authorId}`,
    'trending',
  ],

  commentAdded: (postId: string) => [
    `post:${postId}`,
    `post-comments:${postId}`,
  ],

  followChanged: (followerId: string, followingId: string) => [
    `feed:${followerId}`,
    `user:${followerId}`,
    `user:${followingId}`,
  ],

  groupUpdated: (groupId: string) => [
    `group:${groupId}`,
    `group-members:${groupId}`,
    `group-posts:${groupId}`,
  ],
};
