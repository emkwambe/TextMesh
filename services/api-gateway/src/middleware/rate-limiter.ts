// =================================
// RATE LIMITING MIDDLEWARE
// =================================

import { Request, Response, NextFunction } from 'express';
import { RateLimiter, getRedisClient } from '@textmesh/db-client';
import { ErrorCode } from '@textmesh/shared-types';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: Request) => string;
  skip?: (req: Request) => boolean;
}

const defaultConfig: RateLimitConfig = {
  windowMs: parseInt(process.env['RATE_LIMIT_WINDOW_MS'] || '60000', 10),
  maxRequests: parseInt(process.env['RATE_LIMIT_MAX_REQUESTS'] || '100', 10),
};

// Different rate limits for different endpoints
const rateLimitConfigs: Record<string, RateLimitConfig> = {
  auth: {
    windowMs: 900000, // 15 minutes
    maxRequests: 10, // 10 attempts per 15 min
  },
  otp: {
    windowMs: 60000, // 1 minute
    maxRequests: 3, // 3 OTP requests per minute
  },
  posts: {
    windowMs: 60000, // 1 minute
    maxRequests: 30, // 30 posts per minute
  },
  search: {
    windowMs: 60000,
    maxRequests: 60,
  },
  default: defaultConfig,
};

function getConfigForPath(path: string): RateLimitConfig {
  if (path.includes('/auth/verify') || path.includes('/auth/login')) {
    return rateLimitConfigs['auth']!;
  }
  if (path.includes('/auth/send-otp')) {
    return rateLimitConfigs['otp']!;
  }
  if (path.includes('/posts') && path === '/posts') {
    return rateLimitConfigs['posts']!;
  }
  if (path.includes('/search')) {
    return rateLimitConfigs['search']!;
  }
  return rateLimitConfigs['default']!;
}

function generateKey(req: Request, config: RateLimitConfig): string {
  if (config.keyGenerator) {
    return config.keyGenerator(req);
  }

  // Use user ID if authenticated, otherwise use IP
  const identifier = req.userId || req.ip || 'unknown';
  const path = req.path.split('/').slice(0, 3).join('/'); // Normalize path

  return `${identifier}:${path}`;
}

let rateLimiter: RateLimiter | null = null;

function getRateLimiter(): RateLimiter {
  if (!rateLimiter) {
    rateLimiter = new RateLimiter(getRedisClient());
  }
  return rateLimiter;
}

export async function rateLimiterMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const config = getConfigForPath(req.path);

    // Skip rate limiting for certain requests
    if (config.skip && config.skip(req)) {
      return next();
    }

    const key = generateKey(req, config);
    const windowSeconds = Math.floor(config.windowMs / 1000);

    const result = await getRateLimiter().isAllowed(
      key,
      config.maxRequests,
      windowSeconds
    );

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', config.maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
    res.setHeader('X-RateLimit-Reset', new Date(result.resetAt).toISOString());

    if (!result.allowed) {
      req.logger.warn('Rate limit exceeded', {
        key,
        path: req.path,
        ip: req.ip,
        userId: req.userId,
      });

      res.status(429).json({
        success: false,
        error: {
          code: ErrorCode.RATE_LIMITED,
          message: 'Too many requests, please try again later',
        },
        meta: {
          retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000),
        },
      });
      return;
    }

    next();
  } catch (error) {
    req.logger.error('Rate limiter error', error);
    // Don't block request on rate limiter failure
    next();
  }
}

// Create rate limiter with custom config
export function createRateLimiter(config: Partial<RateLimitConfig>) {
  const mergedConfig = { ...defaultConfig, ...config };

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const key = generateKey(req, mergedConfig);
      const windowSeconds = Math.floor(mergedConfig.windowMs / 1000);

      const result = await getRateLimiter().isAllowed(
        key,
        mergedConfig.maxRequests,
        windowSeconds
      );

      res.setHeader('X-RateLimit-Limit', mergedConfig.maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
      res.setHeader('X-RateLimit-Reset', new Date(result.resetAt).toISOString());

      if (!result.allowed) {
        res.status(429).json({
          success: false,
          error: {
            code: ErrorCode.RATE_LIMITED,
            message: 'Too many requests, please try again later',
          },
        });
        return;
      }

      next();
    } catch (error) {
      next();
    }
  };
}

// Export with simpler name
export { rateLimiterMiddleware as rateLimiter };
