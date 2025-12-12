/**
 * Cache Warmer
 *
 * Pre-populate cache with frequently accessed data
 */

import { createLogger } from '@textmesh/logger';
import { MultiTierCache } from './multi-tier-cache';
import { WarmingStrategy, CacheOptions } from './types';

const logger = createLogger({ service: 'cache-warmer', level: 'info' });

export class CacheWarmer {
  private cache: MultiTierCache;
  private strategies: Map<string, WarmingStrategy> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private isWarming: Set<string> = new Set();

  constructor(cache: MultiTierCache) {
    this.cache = cache;
  }

  /**
   * Register a warming strategy
   */
  registerStrategy(name: string, strategy: WarmingStrategy): void {
    this.strategies.set(name, strategy);
    logger.info('Registered warming strategy', { name, pattern: strategy.pattern });

    // Setup scheduled warming if specified
    if (strategy.schedule) {
      this.setupSchedule(name, strategy);
    }
  }

  /**
   * Warm cache using a specific strategy
   */
  async warmStrategy(name: string, options: CacheOptions = {}): Promise<number> {
    const strategy = this.strategies.get(name);
    if (!strategy) {
      throw new Error(`Unknown warming strategy: ${name}`);
    }

    if (this.isWarming.has(name)) {
      logger.debug('Strategy already warming', { name });
      return 0;
    }

    this.isWarming.add(name);
    const startTime = Date.now();

    try {
      logger.info('Starting cache warm', { strategy: name });

      const entries = await strategy.fetcher();

      // Warm in parallel batches
      const batchSize = 100;
      let warmedCount = 0;

      for (let i = 0; i < entries.length; i += batchSize) {
        const batch = entries.slice(i, i + batchSize);

        await Promise.all(
          batch.map(({ key, value }) =>
            this.cache.set(key, value, options)
          )
        );

        warmedCount += batch.length;
      }

      const duration = Date.now() - startTime;
      logger.info('Cache warm completed', {
        strategy: name,
        count: warmedCount,
        duration: `${duration}ms`,
      });

      return warmedCount;
    } catch (error) {
      logger.error('Cache warm failed', { strategy: name, error });
      throw error;
    } finally {
      this.isWarming.delete(name);
    }
  }

  /**
   * Warm all registered strategies
   */
  async warmAll(options: CacheOptions = {}): Promise<Map<string, number>> {
    const results = new Map<string, number>();

    // Sort by priority
    const sorted = [...this.strategies.entries()]
      .sort((a, b) => (b[1].priority || 0) - (a[1].priority || 0));

    for (const [name] of sorted) {
      try {
        const count = await this.warmStrategy(name, options);
        results.set(name, count);
      } catch (error) {
        logger.error('Strategy warm failed', { name, error });
        results.set(name, 0);
      }
    }

    return results;
  }

  /**
   * Warm specific keys
   */
  async warmKeys<T>(
    keys: string[],
    fetcher: (key: string) => Promise<T>,
    options: CacheOptions = {}
  ): Promise<number> {
    const startTime = Date.now();
    let warmedCount = 0;

    await Promise.all(
      keys.map(async (key) => {
        try {
          const value = await fetcher(key);
          await this.cache.set(key, value, options);
          warmedCount++;
        } catch (error) {
          logger.warn('Failed to warm key', { key, error });
        }
      })
    );

    logger.info('Keys warmed', {
      requested: keys.length,
      warmed: warmedCount,
      duration: `${Date.now() - startTime}ms`,
    });

    return warmedCount;
  }

  /**
   * Setup scheduled warming
   */
  private setupSchedule(name: string, strategy: WarmingStrategy): void {
    const interval = this.parseSchedule(strategy.schedule!);

    if (interval > 0) {
      const timer = setInterval(async () => {
        try {
          await this.warmStrategy(name);
        } catch (error) {
          logger.error('Scheduled warm failed', { name, error });
        }
      }, interval);

      this.intervals.set(name, timer);
      logger.info('Scheduled warming setup', { name, interval: `${interval}ms` });
    }
  }

  /**
   * Parse schedule string to milliseconds
   */
  private parseSchedule(schedule: string): number {
    const match = schedule.match(/^(\d+)(s|m|h)$/);
    if (!match) {
      logger.warn('Invalid schedule format', { schedule });
      return 0;
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      default:
        return 0;
    }
  }

  /**
   * Stop all scheduled warming
   */
  stop(): void {
    for (const [name, timer] of this.intervals) {
      clearInterval(timer);
      logger.info('Stopped scheduled warming', { name });
    }
    this.intervals.clear();
  }

  /**
   * Remove a strategy
   */
  removeStrategy(name: string): void {
    this.strategies.delete(name);

    const timer = this.intervals.get(name);
    if (timer) {
      clearInterval(timer);
      this.intervals.delete(name);
    }
  }

  /**
   * Get warming status
   */
  getStatus(): {
    strategies: string[];
    warming: string[];
    scheduled: string[];
  } {
    return {
      strategies: [...this.strategies.keys()],
      warming: [...this.isWarming],
      scheduled: [...this.intervals.keys()],
    };
  }
}

/**
 * Common warming strategies factory
 */
export function createWarmingStrategies(
  fetchers: {
    getPopularUsers?: () => Promise<Array<{ id: string; data: unknown }>>;
    getTrendingPosts?: () => Promise<Array<{ id: string; data: unknown }>>;
    getActiveGroups?: () => Promise<Array<{ id: string; data: unknown }>>;
  }
): WarmingStrategy[] {
  const strategies: WarmingStrategy[] = [];

  if (fetchers.getPopularUsers) {
    strategies.push({
      pattern: 'user:*',
      fetcher: async () => {
        const users = await fetchers.getPopularUsers!();
        return users.map(({ id, data }) => ({ key: `user:${id}`, value: data }));
      },
      schedule: '10m',
      priority: 10,
    });
  }

  if (fetchers.getTrendingPosts) {
    strategies.push({
      pattern: 'post:*',
      fetcher: async () => {
        const posts = await fetchers.getTrendingPosts!();
        return posts.map(({ id, data }) => ({ key: `post:${id}`, value: data }));
      },
      schedule: '5m',
      priority: 9,
    });
  }

  if (fetchers.getActiveGroups) {
    strategies.push({
      pattern: 'group:*',
      fetcher: async () => {
        const groups = await fetchers.getActiveGroups!();
        return groups.map(({ id, data }) => ({ key: `group:${id}`, value: data }));
      },
      schedule: '15m',
      priority: 8,
    });
  }

  return strategies;
}
