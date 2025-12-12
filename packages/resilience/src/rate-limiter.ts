/**
 * Rate Limiter
 *
 * Multiple rate limiting algorithms:
 * - Token Bucket: Smooth rate limiting with burst capacity
 * - Sliding Window: Accurate rate limiting
 * - Fixed Window: Simple and efficient
 */

import Redis from 'ioredis';
import { createLogger } from '@textmesh/logger';
import { RateLimitConfig, RateLimitResult } from './types';

const logger = createLogger({ service: 'rate-limiter', level: 'info' });

export class RateLimiter {
  private redis: Redis;
  private config: RateLimitConfig;
  private prefix: string;

  constructor(redis: Redis, config: RateLimitConfig) {
    this.redis = redis;
    this.config = config;
    this.prefix = config.keyPrefix || 'ratelimit:';
  }

  /**
   * Check if request is allowed
   */
  async check(key: string): Promise<RateLimitResult> {
    const fullKey = `${this.prefix}${key}`;

    switch (this.config.algorithm) {
      case 'token-bucket':
        return this.tokenBucket(fullKey);
      case 'sliding-window':
        return this.slidingWindow(fullKey);
      case 'fixed-window':
        return this.fixedWindow(fullKey);
      default:
        throw new Error(`Unknown algorithm: ${this.config.algorithm}`);
    }
  }

  /**
   * Token Bucket Algorithm
   * Allows bursts while maintaining average rate
   */
  private async tokenBucket(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    const { limit, window } = this.config;
    const refillRate = limit / window; // tokens per second

    const script = `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local limit = tonumber(ARGV[2])
      local refill_rate = tonumber(ARGV[3])
      local window = tonumber(ARGV[4])

      local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
      local tokens = tonumber(bucket[1]) or limit
      local last_refill = tonumber(bucket[2]) or now

      -- Refill tokens based on time passed
      local time_passed = (now - last_refill) / 1000
      tokens = math.min(limit, tokens + (time_passed * refill_rate))

      local allowed = 0
      if tokens >= 1 then
        tokens = tokens - 1
        allowed = 1
      end

      redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
      redis.call('EXPIRE', key, window)

      return {allowed, tokens, now + ((1 - tokens) / refill_rate * 1000)}
    `;

    const result = await this.redis.eval(
      script,
      1,
      key,
      now,
      limit,
      refillRate,
      this.config.window
    ) as [number, number, number];

    const [allowed, remaining, resetAt] = result;

    return {
      allowed: allowed === 1,
      remaining: Math.floor(remaining),
      resetAt: Math.floor(resetAt),
      retryAfter: allowed === 1 ? undefined : Math.ceil((resetAt - now) / 1000),
    };
  }

  /**
   * Sliding Window Algorithm
   * Accurate rate limiting with smooth transition
   */
  private async slidingWindow(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    const { limit, window } = this.config;
    const windowMs = window * 1000;
    const windowStart = now - windowMs;

    const script = `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local window_start = tonumber(ARGV[2])
      local limit = tonumber(ARGV[3])
      local window_ms = tonumber(ARGV[4])

      -- Remove old entries
      redis.call('ZREMRANGEBYSCORE', key, 0, window_start)

      -- Count current requests
      local count = redis.call('ZCARD', key)

      if count < limit then
        -- Add new request
        redis.call('ZADD', key, now, now .. '-' .. math.random())
        redis.call('EXPIRE', key, math.ceil(window_ms / 1000))
        return {1, limit - count - 1, now + window_ms}
      else
        -- Get oldest entry for reset time
        local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
        local reset_at = oldest[2] and (tonumber(oldest[2]) + window_ms) or (now + window_ms)
        return {0, 0, reset_at}
      end
    `;

    const result = await this.redis.eval(
      script,
      1,
      key,
      now,
      windowStart,
      limit,
      windowMs
    ) as [number, number, number];

    const [allowed, remaining, resetAt] = result;

    return {
      allowed: allowed === 1,
      remaining: Math.max(0, remaining),
      resetAt: Math.floor(resetAt),
      retryAfter: allowed === 1 ? undefined : Math.ceil((resetAt - now) / 1000),
    };
  }

  /**
   * Fixed Window Algorithm
   * Simple and efficient, resets at fixed intervals
   */
  private async fixedWindow(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    const { limit, window } = this.config;
    const windowKey = `${key}:${Math.floor(now / (window * 1000))}`;

    const count = await this.redis.incr(windowKey);

    if (count === 1) {
      await this.redis.expire(windowKey, window);
    }

    const windowEnd = (Math.floor(now / (window * 1000)) + 1) * window * 1000;

    if (count > limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: windowEnd,
        retryAfter: Math.ceil((windowEnd - now) / 1000),
      };
    }

    return {
      allowed: true,
      remaining: limit - count,
      resetAt: windowEnd,
    };
  }

  /**
   * Reset rate limit for a key
   */
  async reset(key: string): Promise<void> {
    const fullKey = `${this.prefix}${key}`;
    await this.redis.del(fullKey);
  }

  /**
   * Get current rate limit status
   */
  async getStatus(key: string): Promise<{
    count: number;
    remaining: number;
    resetAt: number;
  }> {
    const result = await this.check(key);
    return {
      count: this.config.limit - result.remaining,
      remaining: result.remaining,
      resetAt: result.resetAt,
    };
  }
}

/**
 * Rate limit middleware for Express
 */
export function rateLimitMiddleware(
  limiter: RateLimiter,
  keyExtractor: (req: unknown) => string = (req: any) => req.ip
) {
  return async (req: unknown, res: any, next: () => void) => {
    const key = keyExtractor(req);
    const result = await limiter.check(key);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', limiter['config'].limit);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', Math.floor(result.resetAt / 1000));

    if (!result.allowed) {
      res.setHeader('Retry-After', result.retryAfter);
      res.status(429).json({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded',
        retryAfter: result.retryAfter,
      });
      return;
    }

    next();
  };
}

/**
 * Tiered rate limiting for different user levels
 */
export class TieredRateLimiter {
  private limiters: Map<string, RateLimiter>;
  private redis: Redis;

  constructor(
    redis: Redis,
    tiers: Record<string, Omit<RateLimitConfig, 'keyPrefix'>>
  ) {
    this.redis = redis;
    this.limiters = new Map();

    for (const [tier, config] of Object.entries(tiers)) {
      this.limiters.set(
        tier,
        new RateLimiter(redis, { ...config, keyPrefix: `ratelimit:${tier}:` })
      );
    }
  }

  async check(key: string, tier: string): Promise<RateLimitResult> {
    const limiter = this.limiters.get(tier);
    if (!limiter) {
      logger.warn('Unknown tier, using default', { tier });
      return this.limiters.get('default')!.check(key);
    }
    return limiter.check(key);
  }
}

// Default tier configurations
export const DEFAULT_TIERS = {
  anonymous: { algorithm: 'sliding-window' as const, limit: 60, window: 60 },
  authenticated: { algorithm: 'sliding-window' as const, limit: 300, window: 60 },
  premium: { algorithm: 'sliding-window' as const, limit: 1000, window: 60 },
  api: { algorithm: 'token-bucket' as const, limit: 100, window: 60 },
};
