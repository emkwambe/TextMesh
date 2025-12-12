/**
 * Multi-Tier Cache
 *
 * L1 (Memory) + L2 (Redis) caching with automatic promotion
 */

import { LRUCache } from 'lru-cache';
import Redis from 'ioredis';
import { createLogger } from '@textmesh/logger';
import { CacheConfig, CacheEntry, CacheOptions, CacheStats } from './types';
import { CacheSerializer } from './serialization';

const logger = createLogger({ service: 'multi-tier-cache', level: 'info' });

const DEFAULT_CONFIG: CacheConfig = {
  l1: {
    enabled: true,
    maxSize: 10000,
    ttl: 60, // 1 minute
  },
  l2: {
    enabled: true,
    ttl: 3600, // 1 hour
    prefix: 'cache:',
  },
  serialization: 'msgpack',
  compression: true,
  compressionThreshold: 1024,
};

export class MultiTierCache {
  private l1Cache: LRUCache<string, CacheEntry<unknown>>;
  private redis: Redis | null;
  private config: CacheConfig;
  private serializer: CacheSerializer;
  private stats: CacheStats;

  constructor(config: Partial<CacheConfig> = {}, redis?: Redis) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.redis = redis || null;

    // Initialize L1 cache
    this.l1Cache = new LRUCache({
      max: this.config.l1.maxSize,
      ttl: this.config.l1.ttl * 1000,
      updateAgeOnGet: true,
      updateAgeOnHas: false,
    });

    // Initialize serializer
    this.serializer = new CacheSerializer({
      format: this.config.serialization,
      compress: this.config.compression,
      compressionThreshold: this.config.compressionThreshold,
    });

    // Initialize stats
    this.stats = {
      hits: 0,
      misses: 0,
      l1Hits: 0,
      l2Hits: 0,
      writes: 0,
      deletes: 0,
      hitRate: 0,
      avgLatency: 0,
    };
  }

  /**
   * Set Redis client
   */
  setRedis(redis: Redis): void {
    this.redis = redis;
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string, options: CacheOptions = {}): Promise<T | null> {
    const start = Date.now();

    try {
      // Try L1 first
      if (this.config.l1.enabled && !options.l2Only) {
        const l1Entry = this.l1Cache.get(key) as CacheEntry<T> | undefined;

        if (l1Entry && l1Entry.expiresAt > Date.now()) {
          this.stats.hits++;
          this.stats.l1Hits++;
          this.updateLatency(start);
          return l1Entry.value;
        }
      }

      // Try L2 (Redis)
      if (this.config.l2.enabled && this.redis && !options.l1Only) {
        const l2Key = `${this.config.l2.prefix}${key}`;
        const l2Data = await this.redis.get(l2Key);

        if (l2Data) {
          const entry = await this.serializer.deserializeFromRedis<CacheEntry<T>>(l2Data);

          if (entry.expiresAt > Date.now()) {
            // Promote to L1
            if (this.config.l1.enabled && !options.skipL1) {
              this.l1Cache.set(key, entry);
            }

            this.stats.hits++;
            this.stats.l2Hits++;
            this.updateLatency(start);
            return entry.value;
          } else {
            // Expired, delete from L2
            await this.redis.del(l2Key);
          }
        }
      }

      this.stats.misses++;
      this.updateLatency(start);
      return null;
    } catch (error) {
      logger.error('Cache get error', { key, error });
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set<T>(
    key: string,
    value: T,
    options: CacheOptions = {}
  ): Promise<void> {
    const ttl = options.ttl || this.config.l2.ttl;
    const now = Date.now();

    const entry: CacheEntry<T> = {
      value,
      createdAt: now,
      expiresAt: now + ttl * 1000,
      tags: options.tags,
      version: options.version,
    };

    try {
      // Set in L1
      if (this.config.l1.enabled && !options.l2Only) {
        this.l1Cache.set(key, entry, {
          ttl: Math.min(ttl * 1000, this.config.l1.ttl * 1000),
        });
      }

      // Set in L2
      if (this.config.l2.enabled && this.redis && !options.l1Only) {
        const l2Key = `${this.config.l2.prefix}${key}`;
        const serialized = await this.serializer.serializeForRedis(entry);
        await this.redis.setex(l2Key, ttl, serialized);

        // Store tags for invalidation
        if (options.tags && options.tags.length > 0) {
          await this.addToTags(key, options.tags, ttl);
        }
      }

      this.stats.writes++;
    } catch (error) {
      logger.error('Cache set error', { key, error });
    }
  }

  /**
   * Delete from cache
   */
  async delete(key: string): Promise<void> {
    try {
      // Delete from L1
      this.l1Cache.delete(key);

      // Delete from L2
      if (this.redis) {
        const l2Key = `${this.config.l2.prefix}${key}`;
        await this.redis.del(l2Key);
      }

      this.stats.deletes++;
    } catch (error) {
      logger.error('Cache delete error', { key, error });
    }
  }

  /**
   * Delete multiple keys
   */
  async deleteMany(keys: string[]): Promise<void> {
    await Promise.all(keys.map((key) => this.delete(key)));
  }

  /**
   * Get or set (cache-aside pattern)
   */
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.get<T>(key, options);
    if (cached !== null) {
      return cached;
    }

    // Fetch and cache
    const value = await fetcher();
    await this.set(key, value, options);

    return value;
  }

  /**
   * Check if key exists
   */
  async has(key: string): Promise<boolean> {
    if (this.l1Cache.has(key)) {
      return true;
    }

    if (this.redis) {
      const l2Key = `${this.config.l2.prefix}${key}`;
      const exists = await this.redis.exists(l2Key);
      return exists === 1;
    }

    return false;
  }

  /**
   * Get remaining TTL
   */
  async ttl(key: string): Promise<number> {
    // Check L1
    const l1Entry = this.l1Cache.get(key) as CacheEntry<unknown> | undefined;
    if (l1Entry) {
      return Math.max(0, Math.floor((l1Entry.expiresAt - Date.now()) / 1000));
    }

    // Check L2
    if (this.redis) {
      const l2Key = `${this.config.l2.prefix}${key}`;
      const ttl = await this.redis.ttl(l2Key);
      return Math.max(0, ttl);
    }

    return 0;
  }

  /**
   * Clear all caches
   */
  async clear(): Promise<void> {
    this.l1Cache.clear();

    if (this.redis) {
      const pattern = `${this.config.l2.prefix}*`;
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    }

    logger.info('Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? this.stats.hits / total : 0,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      l1Hits: 0,
      l2Hits: 0,
      writes: 0,
      deletes: 0,
      hitRate: 0,
      avgLatency: 0,
    };
  }

  /**
   * Get L1 cache size
   */
  getL1Size(): number {
    return this.l1Cache.size;
  }

  /**
   * Add key to tag sets for invalidation
   */
  private async addToTags(key: string, tags: string[], ttl: number): Promise<void> {
    if (!this.redis) return;

    const pipeline = this.redis.pipeline();

    for (const tag of tags) {
      const tagKey = `${this.config.l2.prefix}tag:${tag}`;
      pipeline.sadd(tagKey, key);
      pipeline.expire(tagKey, ttl);
    }

    await pipeline.exec();
  }

  /**
   * Invalidate by tag
   */
  async invalidateByTag(tag: string): Promise<number> {
    if (!this.redis) return 0;

    const tagKey = `${this.config.l2.prefix}tag:${tag}`;
    const keys = await this.redis.smembers(tagKey);

    if (keys.length === 0) return 0;

    // Delete all tagged keys
    await this.deleteMany(keys);

    // Delete tag set
    await this.redis.del(tagKey);

    logger.info('Invalidated by tag', { tag, count: keys.length });

    return keys.length;
  }

  /**
   * Update average latency
   */
  private updateLatency(start: number): void {
    const latency = Date.now() - start;
    const total = this.stats.hits + this.stats.misses;
    this.stats.avgLatency =
      (this.stats.avgLatency * (total - 1) + latency) / total;
  }
}

// Create default instance
let defaultCache: MultiTierCache | null = null;

export function getCache(config?: Partial<CacheConfig>, redis?: Redis): MultiTierCache {
  if (!defaultCache) {
    defaultCache = new MultiTierCache(config, redis);
  }
  return defaultCache;
}

export function setDefaultRedis(redis: Redis): void {
  if (defaultCache) {
    defaultCache.setRedis(redis);
  }
}
