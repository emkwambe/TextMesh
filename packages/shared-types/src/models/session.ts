// =================================
// SESSION MODEL TYPES
// =================================

export interface Session {
  id: string;
  userId: string;
  deviceInfo: DeviceInfo;
  ipAddress: string;
  userAgent: string;
  refreshToken: string;
  expiresAt: Date;
  lastActiveAt: Date;
  isRevoked: boolean;
  revokedAt: Date | null;
  revokedReason: string | null;
  createdAt: Date;
}

export interface DeviceInfo {
  deviceId: string;
  deviceType: 'ios' | 'android' | 'web' | 'unknown';
  deviceName: string | null;
  osVersion: string | null;
  appVersion: string | null;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface AccessTokenPayload {
  sub: string;
  email?: string;
  username: string;
  role: string;
  sessionId: string;
  iat: number;
  exp: number;
  iss: string;
}

export interface RefreshTokenPayload {
  sub: string;
  sessionId: string;
  jti: string;
  iat: number;
  exp: number;
  iss: string;
}

export interface OTPRequest {
  id: string;
  identifier: string;
  type: 'email' | 'phone';
  code: string;
  attempts: number;
  expiresAt: Date;
  verifiedAt: Date | null;
  createdAt: Date;
}

export interface MagicLink {
  id: string;
  userId: string | null;
  email: string;
  token: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

export interface PasswordReset {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

export interface LoginAttempt {
  id: string;
  identifier: string;
  ipAddress: string;
  userAgent: string;
  success: boolean;
  failureReason: string | null;
  createdAt: Date;
}

export const MAX_LOGIN_ATTEMPTS = 5;
export const LOGIN_LOCKOUT_MINUTES = 15;
export const OTP_EXPIRY_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 3;
export const MAGIC_LINK_EXPIRY_MINUTES = 30;
export const ACCESS_TOKEN_EXPIRY_MINUTES = 15;
export const REFRESH_TOKEN_EXPIRY_DAYS = 7;
