/**
 * Cache Strategies
 *
 * Common caching patterns and strategies
 */

import { createLogger } from '@textmesh/logger';
import { MultiTierCache } from './multi-tier-cache';
import { CacheOptions } from './types';

const logger = createLogger({ service: 'cache-strategies', level: 'info' });

/**
 * Write-Through Strategy
 * Write to cache and database simultaneously
 */
export async function writeThrough<T>(
  cache: MultiTierCache,
  key: string,
  value: T,
  dbWriter: () => Promise<void>,
  options: CacheOptions = {}
): Promise<void> {
  // Write to database first
  await dbWriter();

  // Then write to cache
  await cache.set(key, value, options);

  logger.debug('Write-through completed', { key });
}

/**
 * Write-Behind (Write-Back) Strategy
 * Write to cache immediately, batch write to database later
 */
export class WriteBehindStrategy<T> {
  private cache: MultiTierCache;
  private buffer: Map<string, { value: T; options: CacheOptions }>;
  private flushInterval: NodeJS.Timeout | null = null;
  private batchWriter: (entries: Map<string, T>) => Promise<void>;
  private maxBufferSize: number;
  private flushIntervalMs: number;

  constructor(
    cache: MultiTierCache,
    batchWriter: (entries: Map<string, T>) => Promise<void>,
    options: {
      maxBufferSize?: number;
      flushIntervalMs?: number;
    } = {}
  ) {
    this.cache = cache;
    this.batchWriter = batchWriter;
    this.buffer = new Map();
    this.maxBufferSize = options.maxBufferSize || 100;
    this.flushIntervalMs = options.flushIntervalMs || 5000;

    this.startFlushInterval();
  }

  async write(key: string, value: T, options: CacheOptions = {}): Promise<void> {
    // Write to cache immediately
    await this.cache.set(key, value, options);

    // Add to write buffer
    this.buffer.set(key, { value, options });

    // Flush if buffer is full
    if (this.buffer.size >= this.maxBufferSize) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.size === 0) return;

    const entries = new Map<string, T>();
    for (const [key, { value }] of this.buffer) {
      entries.set(key, value);
    }

    try {
      await this.batchWriter(entries);
      this.buffer.clear();
      logger.debug('Write-behind flush completed', { count: entries.size });
    } catch (error) {
      logger.error('Write-behind flush failed', { error });
      throw error;
    }
  }

  private startFlushInterval(): void {
    this.flushInterval = setInterval(async () => {
      try {
        await this.flush();
      } catch (error) {
        logger.error('Scheduled flush failed', { error });
      }
    }, this.flushIntervalMs);
  }

  stop(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }
}

/**
 * Read-Through Strategy
 * Cache handles loading from database on miss
 */
export function createReadThroughCache<T>(
  cache: MultiTierCache,
  loader: (key: string) => Promise<T | null>,
  options: CacheOptions = {}
): {
  get: (key: string) => Promise<T | null>;
  invalidate: (key: string) => Promise<void>;
} {
  return {
    async get(key: string): Promise<T | null> {
      return cache.getOrSet(key, () => loader(key), options);
    },

    async invalidate(key: string): Promise<void> {
      await cache.delete(key);
    },
  };
}

/**
 * Cache-Aside with Stale-While-Revalidate
 */
export class StaleWhileRevalidate<T> {
  private cache: MultiTierCache;
  private fetcher: (key: string) => Promise<T>;
  private ttl: number;
  private staleTTL: number;
  private revalidating: Set<string> = new Set();

  constructor(
    cache: MultiTierCache,
    fetcher: (key: string) => Promise<T>,
    options: { ttl?: number; staleTTL?: number } = {}
  ) {
    this.cache = cache;
    this.fetcher = fetcher;
    this.ttl = options.ttl || 300; // 5 minutes
    this.staleTTL = options.staleTTL || 3600; // 1 hour
  }

  async get(key: string): Promise<T | null> {
    const cached = await this.cache.get<{ value: T; fetchedAt: number }>(key);

    if (cached) {
      const age = Date.now() - cached.fetchedAt;

      // Fresh - return immediately
      if (age < this.ttl * 1000) {
        return cached.value;
      }

      // Stale but usable - return and revalidate in background
      if (age < this.staleTTL * 1000) {
        this.revalidateInBackground(key);
        return cached.value;
      }
    }

    // Miss or expired - fetch synchronously
    return this.fetchAndCache(key);
  }

  private async fetchAndCache(key: string): Promise<T | null> {
    try {
      const value = await this.fetcher(key);
      await this.cache.set(
        key,
        { value, fetchedAt: Date.now() },
        { ttl: this.staleTTL }
      );
      return value;
    } catch (error) {
      logger.error('Fetch failed', { key, error });
      return null;
    }
  }

  private revalidateInBackground(key: string): void {
    if (this.revalidating.has(key)) return;

    this.revalidating.add(key);

    this.fetchAndCache(key)
      .finally(() => {
        this.revalidating.delete(key);
      });
  }
}

/**
 * Request Coalescing (Thundering Herd Protection)
 */
export class RequestCoalescer<T> {
  private pending: Map<string, Promise<T>> = new Map();

  async coalesce(key: string, fetcher: () => Promise<T>): Promise<T> {
    // Check if there's already a pending request
    const pending = this.pending.get(key);
    if (pending) {
      logger.debug('Coalescing request', { key });
      return pending;
    }

    // Create new request
    const promise = fetcher().finally(() => {
      this.pending.delete(key);
    });

    this.pending.set(key, promise);
    return promise;
  }
}

/**
 * Probabilistic Early Expiration (PER)
 * Helps prevent cache stampedes
 */
export function shouldRefreshEarly(
  ttlRemaining: number,
  totalTTL: number,
  beta: number = 1
): boolean {
  if (ttlRemaining <= 0) return true;

  // XFetch algorithm: probability increases as TTL decreases
  const delta = totalTTL - ttlRemaining;
  const probability = Math.exp(-beta * Math.random() * delta / totalTTL);

  return Math.random() < (1 - probability);
}

/**
 * Negative Cache (Cache misses)
 */
export async function cacheNegative(
  cache: MultiTierCache,
  key: string,
  fetcher: () => Promise<unknown | null>,
  options: { ttl?: number; negativeTTL?: number } = {}
): Promise<unknown | null> {
  const { ttl = 300, negativeTTL = 60 } = options;

  const cached = await cache.get<{ value: unknown | null; isNegative: boolean }>(key);

  if (cached) {
    return cached.isNegative ? null : cached.value;
  }

  const value = await fetcher();

  await cache.set(
    key,
    { value, isNegative: value === null },
    { ttl: value === null ? negativeTTL : ttl }
  );

  return value;
}
