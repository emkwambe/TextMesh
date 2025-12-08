// =================================
// AUTHENTICATION MIDDLEWARE
// =================================

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getRedisClient, CacheKeys } from '@textmesh/db-client';
import { ErrorCode } from '@textmesh/shared-types';

interface JWTPayload {
  sub: string;
  username: string;
  role: string;
  sessionId: string;
  iat: number;
  exp: number;
  iss: string;
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: {
          code: ErrorCode.UNAUTHORIZED,
          message: 'Authentication required',
        },
      });
      return;
    }

    const token = authHeader.substring(7);
    const jwtSecret = process.env['JWT_SECRET'];

    if (!jwtSecret) {
      req.logger.error('JWT_SECRET not configured');
      res.status(500).json({
        success: false,
        error: {
          code: ErrorCode.INTERNAL_ERROR,
          message: 'Server configuration error',
        },
      });
      return;
    }

    // Verify JWT token
    let payload: JWTPayload;
    try {
      payload = jwt.verify(token, jwtSecret, {
        issuer: process.env['JWT_ISSUER'] || 'textmesh',
      }) as JWTPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        res.status(401).json({
          success: false,
          error: {
            code: ErrorCode.TOKEN_EXPIRED,
            message: 'Token has expired',
          },
        });
        return;
      }
      res.status(401).json({
        success: false,
        error: {
          code: ErrorCode.INVALID_TOKEN,
          message: 'Invalid token',
        },
      });
      return;
    }

    // Check if session is revoked (optional, for enhanced security)
    const redis = getRedisClient();
    const sessionKey = CacheKeys.session(payload.sessionId);
    const isRevoked = await redis.get(`revoked:${payload.sessionId}`);

    if (isRevoked) {
      res.status(401).json({
        success: false,
        error: {
          code: ErrorCode.SESSION_REVOKED,
          message: 'Session has been revoked',
        },
      });
      return;
    }

    // Attach user info to request
    req.userId = payload.sub;
    req.sessionId = payload.sessionId;

    // Add user context to logger
    req.logger = req.logger.withUserId(payload.sub);

    // Forward user info to downstream services via headers
    req.headers['x-user-id'] = payload.sub;
    req.headers['x-session-id'] = payload.sessionId;
    req.headers['x-user-role'] = payload.role;

    next();
  } catch (error) {
    req.logger.error('Auth middleware error', error);
    res.status(500).json({
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Authentication error',
      },
    });
  }
}

// Optional auth middleware (doesn't require auth but uses it if present)
export async function optionalAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);
    const jwtSecret = process.env['JWT_SECRET'];

    if (!jwtSecret) {
      return next();
    }

    try {
      const payload = jwt.verify(token, jwtSecret, {
        issuer: process.env['JWT_ISSUER'] || 'textmesh',
      }) as JWTPayload;

      req.userId = payload.sub;
      req.sessionId = payload.sessionId;
      req.logger = req.logger.withUserId(payload.sub);
      req.headers['x-user-id'] = payload.sub;
      req.headers['x-session-id'] = payload.sessionId;
      req.headers['x-user-role'] = payload.role;
    } catch {
      // Token invalid, continue without auth
    }

    next();
  } catch (error) {
    req.logger.error('Optional auth middleware error', error);
    next();
  }
}

// Admin-only middleware
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const userRole = req.headers['x-user-role'];

  if (userRole !== 'ADMIN') {
    res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Admin access required',
      },
    });
    return;
  }

  next();
}

// Moderator or Admin middleware
export function requireModerator(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const userRole = req.headers['x-user-role'];

  if (userRole !== 'ADMIN' && userRole !== 'MODERATOR') {
    res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Moderator access required',
      },
    });
    return;
  }

  next();
}
