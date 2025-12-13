// =================================
// TOKEN SERVICE
// =================================

import jwt from 'jsonwebtoken';
import Redis from 'ioredis';
import {
  TokenPair,
  AccessTokenPayload,
  RefreshTokenPayload,
  ErrorCode,
  AppError,
} from '@textmesh/shared-types';

const JWT_SECRET = process.env['JWT_SECRET'] || 'your-super-secret-jwt-key';
const JWT_ISSUER = process.env['JWT_ISSUER'] || 'textmesh';
const ACCESS_TOKEN_EXPIRY = process.env['JWT_ACCESS_TOKEN_EXPIRY'] || '15m';
const REFRESH_TOKEN_EXPIRY = process.env['JWT_REFRESH_TOKEN_EXPIRY'] || '7d';

interface User {
  id: string;
  username: string;
  email: string | null;
  role: string;
}

export class TokenService {
  constructor(private redis: Redis) {}

  async generateTokenPair(user: User, sessionId: string): Promise<TokenPair> {
    const accessToken = this.generateAccessToken(user, sessionId);
    const refreshToken = this.generateRefreshToken(user.id, sessionId);

    // Parse expiry time to seconds
    const expiresIn = this.parseExpiryToSeconds(ACCESS_TOKEN_EXPIRY);

    return {
      accessToken,
      refreshToken,
      expiresIn,
      tokenType: 'Bearer',
    };
  }

  generateAccessToken(user: User, sessionId: string): string {
    const payload: Omit<AccessTokenPayload, 'iat' | 'exp' | 'iss'> = {
      sub: user.id,
      email: user.email || undefined,
      username: user.username,
      role: user.role,
      sessionId,
    };

    return jwt.sign(payload, JWT_SECRET, {
      expiresIn: ACCESS_TOKEN_EXPIRY as string,
      issuer: JWT_ISSUER,
      algorithm: 'HS256',
    } as jwt.SignOptions);
  }

  generateRefreshToken(userId: string, sessionId: string): string {
    const jti = crypto.randomUUID();

    const payload: Omit<RefreshTokenPayload, 'iat' | 'exp' | 'iss'> = {
      sub: userId,
      sessionId,
      jti,
    };

    return jwt.sign(payload, JWT_SECRET, {
      expiresIn: REFRESH_TOKEN_EXPIRY as string,
      issuer: JWT_ISSUER,
      algorithm: 'HS256',
    } as jwt.SignOptions);
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    try {
      const payload = jwt.verify(token, JWT_SECRET, {
        issuer: JWT_ISSUER,
        algorithms: ['HS256'],
      }) as AccessTokenPayload;

      // Check if session is revoked
      const isRevoked = await this.redis.get(`revoked:${payload.sessionId}`);
      if (isRevoked) {
        throw new AppError(ErrorCode.SESSION_REVOKED, 'Session has been revoked', 401);
      }

      return payload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AppError(ErrorCode.TOKEN_EXPIRED, 'Token has expired', 401);
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new AppError(ErrorCode.INVALID_TOKEN, 'Invalid token', 401);
      }
      throw error;
    }
  }

  async verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
    try {
      const payload = jwt.verify(token, JWT_SECRET, {
        issuer: JWT_ISSUER,
        algorithms: ['HS256'],
      }) as RefreshTokenPayload;

      // Check if session is revoked
      const isRevoked = await this.redis.get(`revoked:${payload.sessionId}`);
      if (isRevoked) {
        throw new AppError(ErrorCode.SESSION_REVOKED, 'Session has been revoked', 401);
      }

      // Check if this specific token has been used (for rotation)
      const usedKey = `refresh:used:${payload.jti}`;
      const isUsed = await this.redis.get(usedKey);
      if (isUsed) {
        // Potential token reuse attack - revoke all sessions for this user
        await this.redis.set(`revoked:${payload.sessionId}`, '1', 'EX', 86400 * 7);
        throw new AppError(
          ErrorCode.SESSION_REVOKED,
          'Refresh token has already been used',
          401
        );
      }

      // Mark this token as used
      await this.redis.set(usedKey, '1', 'EX', 86400 * 7);

      return payload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AppError(ErrorCode.TOKEN_EXPIRED, 'Refresh token has expired', 401);
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new AppError(ErrorCode.INVALID_TOKEN, 'Invalid refresh token', 401);
      }
      throw error;
    }
  }

  decodeToken(token: string): AccessTokenPayload | null {
    try {
      return jwt.decode(token) as AccessTokenPayload;
    } catch {
      return null;
    }
  }

  private parseExpiryToSeconds(expiry: string): number {
    const match = expiry.match(/^(\d+)(s|m|h|d)$/);
    if (!match) return 900; // Default 15 minutes

    const value = parseInt(match[1]!, 10);
    const unit = match[2];

    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 3600;
      case 'd': return value * 86400;
      default: return 900;
    }
  }
}
