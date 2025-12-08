// =================================
// TEXTMESH DATABASE CLIENT
// =================================

import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

// Prisma Client Singleton
let prisma: PrismaClient | null = null;

export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      log: process.env['NODE_ENV'] === 'development'
        ? ['query', 'info', 'warn', 'error']
        : ['error'],
    });
  }
  return prisma;
}

export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}

// Redis Client
let redis: Redis | null = null;

export interface RedisConfig {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  tls?: boolean;
}

export function getRedisClient(config?: RedisConfig): Redis {
  if (!redis) {
    const redisUrl = config?.url || process.env['REDIS_URL'] || 'redis://localhost:6379';
    const password = config?.password || process.env['REDIS_PASSWORD'];

    redis = new Redis(redisUrl, {
      ...(password && { password }),
      db: config?.db || 0,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) {
          return null;
        }
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    redis.on('error', (err) => {
      console.error('Redis connection error:', err);
    });

    redis.on('connect', () => {
      console.log('Connected to Redis');
    });
  }
  return redis;
}

export async function disconnectRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}

// Cache Utilities
export class CacheManager {
  private redis: Redis;
  private defaultTTL: number;

  constructor(redisClient: Redis, defaultTTL: number = 300) {
    this.redis = redisClient;
    this.defaultTTL = defaultTTL;
  }

  async get<T>(key: string): Promise<T | null> {
    const value = await this.redis.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    await this.redis.setex(key, ttl || this.defaultTTL, serialized);
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async deletePattern(pattern: string): Promise<void> {
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.redis.exists(key);
    return result === 1;
  }

  async incr(key: string): Promise<number> {
    return this.redis.incr(key);
  }

  async expire(key: string, ttl: number): Promise<void> {
    await this.redis.expire(key, ttl);
  }

  // Cache-aside pattern
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }
    const value = await fetcher();
    await this.set(key, value, ttl);
    return value;
  }
}

// Cache Key Generators
export const CacheKeys = {
  user: (id: string) => `user:${id}`,
  userByUsername: (username: string) => `user:username:${username}`,
  userProfile: (id: string) => `user:profile:${id}`,
  userSettings: (id: string) => `user:settings:${id}`,
  userFollowers: (id: string, page: number) => `user:followers:${id}:${page}`,
  userFollowing: (id: string, page: number) => `user:following:${id}:${page}`,

  post: (id: string) => `post:${id}`,
  postLikes: (id: string) => `post:likes:${id}`,
  userPosts: (userId: string, page: number) => `user:posts:${userId}:${page}`,

  feed: (userId: string, cursor: string) => `feed:${userId}:${cursor}`,
  feedHome: (userId: string) => `feed:home:${userId}`,
  feedGroup: (userId: string, groupId: string) => `feed:group:${userId}:${groupId}`,

  group: (id: string) => `group:${id}`,
  groupBySlug: (slug: string) => `group:slug:${slug}`,
  groupMembers: (id: string, page: number) => `group:members:${id}:${page}`,
  userGroups: (userId: string) => `user:groups:${userId}`,

  notifications: (userId: string) => `notifications:${userId}`,
  notificationCount: (userId: string) => `notifications:count:${userId}`,

  session: (id: string) => `session:${id}`,
  userSessions: (userId: string) => `user:sessions:${userId}`,

  rateLimit: (key: string) => `ratelimit:${key}`,
  otp: (identifier: string) => `otp:${identifier}`,
  loginAttempts: (identifier: string) => `login:attempts:${identifier}`,

  trending: () => `trending:hashtags`,
  trendingPosts: () => `trending:posts`,
};

// Rate Limiter
export class RateLimiter {
  private redis: Redis;

  constructor(redisClient: Redis) {
    this.redis = redisClient;
  }

  async isAllowed(
    key: string,
    maxRequests: number,
    windowSeconds: number
  ): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;
    const rateLimitKey = CacheKeys.rateLimit(key);

    // Remove old entries
    await this.redis.zremrangebyscore(rateLimitKey, 0, windowStart);

    // Count current requests
    const count = await this.redis.zcard(rateLimitKey);

    if (count >= maxRequests) {
      const oldestEntry = await this.redis.zrange(rateLimitKey, 0, 0, 'WITHSCORES');
      const resetAt = oldestEntry[1] ? parseInt(oldestEntry[1], 10) + windowSeconds * 1000 : now + windowSeconds * 1000;

      return {
        allowed: false,
        remaining: 0,
        resetAt,
      };
    }

    // Add new request
    await this.redis.zadd(rateLimitKey, now, `${now}-${Math.random()}`);
    await this.redis.expire(rateLimitKey, windowSeconds);

    return {
      allowed: true,
      remaining: maxRequests - count - 1,
      resetAt: now + windowSeconds * 1000,
    };
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(CacheKeys.rateLimit(key));
  }
}

// Distributed Lock
export class DistributedLock {
  private redis: Redis;
  private lockPrefix = 'lock:';

  constructor(redisClient: Redis) {
    this.redis = redisClient;
  }

  async acquire(
    resource: string,
    ttlSeconds: number = 30
  ): Promise<string | null> {
    const lockKey = `${this.lockPrefix}${resource}`;
    const lockValue = `${Date.now()}-${Math.random()}`;

    const result = await this.redis.set(lockKey, lockValue, 'EX', ttlSeconds, 'NX');

    return result === 'OK' ? lockValue : null;
  }

  async release(resource: string, lockValue: string): Promise<boolean> {
    const lockKey = `${this.lockPrefix}${resource}`;
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    const result = await this.redis.eval(script, 1, lockKey, lockValue);
    return result === 1;
  }

  async extend(
    resource: string,
    lockValue: string,
    ttlSeconds: number
  ): Promise<boolean> {
    const lockKey = `${this.lockPrefix}${resource}`;
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("expire", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;

    const result = await this.redis.eval(script, 1, lockKey, lockValue, ttlSeconds);
    return result === 1;
  }
}

// Transaction Helper
export async function withTransaction<T>(
  prismaClient: PrismaClient,
  fn: (tx: PrismaClient) => Promise<T>
): Promise<T> {
  return prismaClient.$transaction(async (tx: unknown) => {
    return fn(tx as PrismaClient);
  });
}

// Health Check
export async function checkDatabaseHealth(): Promise<{
  postgres: boolean;
  redis: boolean;
}> {
  let postgresHealthy = false;
  let redisHealthy = false;

  try {
    const client = getPrismaClient();
    await client.$queryRaw`SELECT 1`;
    postgresHealthy = true;
  } catch (error) {
    console.error('PostgreSQL health check failed:', error);
  }

  try {
    const client = getRedisClient();
    await client.ping();
    redisHealthy = true;
  } catch (error) {
    console.error('Redis health check failed:', error);
  }

  return {
    postgres: postgresHealthy,
    redis: redisHealthy,
  };
}

// Export types
export { PrismaClient } from '@prisma/client';
export { Redis };

// Export read replica and connection pool modules
export * from './replica';
export * from './connection-pool';

// Convenience exports for services
export const prisma = getPrismaClient();
export const redis = getRedisClient();

export default {
  getPrismaClient,
  disconnectPrisma,
  getRedisClient,
  disconnectRedis,
  CacheManager,
  CacheKeys,
  RateLimiter,
  DistributedLock,
  withTransaction,
  checkDatabaseHealth,
};
