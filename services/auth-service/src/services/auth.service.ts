// =================================
// AUTH SERVICE
// =================================

import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { EventBus, EventType } from '@textmesh/event-bus';
import { Logger } from '@textmesh/logger';
import {
  ErrorCode,
  AppError,
  AuthResponse,
  OTPSentResponse,
  TokenRefreshResponse,
  DeviceInfo,
  UserProfile,
} from '@textmesh/shared-types';
import { TokenService } from './token.service.js';
import { OTPService } from './otp.service.js';
import { CacheKeys } from '@textmesh/db-client';

const MIN_AGE_YEARS = 16;

interface SignupInput {
  username: string;
  displayName: string;
  email?: string;
  phone?: string;
  dateOfBirth?: Date;
}

interface OAuthUser {
  id: string;
  email: string;
  name?: string;
  picture?: string;
}

export class AuthService {
  constructor(
    private prisma: PrismaClient,
    private redis: Redis,
    private eventBus: EventBus,
    private tokenService: TokenService,
    private otpService: OTPService,
    private logger: Logger
  ) {}

  async sendOTP(identifier: string, type: 'email' | 'phone'): Promise<OTPSentResponse> {
    // Check rate limit
    const rateLimitKey = `otp:ratelimit:${identifier}`;
    const attempts = await this.redis.incr(rateLimitKey);

    if (attempts === 1) {
      await this.redis.expire(rateLimitKey, 60);
    }

    if (attempts > 3) {
      throw new AppError(
        ErrorCode.RATE_LIMITED,
        'Too many OTP requests. Please try again later.',
        429
      );
    }

    // Generate and send OTP
    const otp = await this.otpService.generateOTP(identifier, type);

    // TODO: Implement actual email/SMS sending
    // For now, log the OTP (remove in production!)
    this.logger.info('OTP generated', { identifier, otp: otp.code });

    // Mask identifier for response
    const masked = type === 'email'
      ? this.maskEmail(identifier)
      : this.maskPhone(identifier);

    return {
      message: `Verification code sent to ${masked}`,
      expiresIn: 600, // 10 minutes
      maskedIdentifier: masked,
    };
  }

  async verifyOTP(
    identifier: string,
    code: string,
    deviceInfo: DeviceInfo | undefined,
    ipAddress: string,
    userAgent: string
  ): Promise<AuthResponse> {
    // Verify OTP
    const isValid = await this.otpService.verifyOTP(identifier, code);

    if (!isValid) {
      // Log failed attempt
      await this.prisma.loginAttempt.create({
        data: {
          identifier,
          ipAddress,
          userAgent,
          success: false,
          failureReason: 'INVALID_OTP',
        },
      });

      throw new AppError(ErrorCode.OTP_INVALID, 'Invalid verification code', 400);
    }

    // Check if user exists
    let user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier },
          { phone: identifier },
        ],
      },
    });

    const isNewUser = !user;

    if (!user) {
      // User doesn't exist - return partial response indicating signup needed
      throw new AppError(
        ErrorCode.USER_NOT_FOUND,
        'User not found. Please complete signup.',
        404,
        { verified: true, identifier }
      );
    }

    // Check account status
    if (user.status === 'SUSPENDED') {
      throw new AppError(ErrorCode.ACCOUNT_SUSPENDED, 'Account is suspended', 403);
    }

    if (user.status === 'DELETED') {
      throw new AppError(ErrorCode.ACCOUNT_DELETED, 'Account has been deleted', 410);
    }

    // Create session and tokens
    const session = await this.createSession(user.id, deviceInfo, ipAddress, userAgent);
    const tokens = await this.tokenService.generateTokenPair(user, session.id);

    // Log successful login
    await this.prisma.loginAttempt.create({
      data: {
        identifier,
        ipAddress,
        userAgent,
        success: true,
      },
    });

    // Publish event
    await this.eventBus.publish(EventType.USER_CREATED, {
      userId: user.id,
      username: user.username,
      email: user.email,
      authProvider: user.authProvider,
    });

    return {
      user: this.toUserProfile(user),
      tokens,
      isNewUser,
    };
  }

  async signup(
    input: SignupInput,
    deviceInfo: DeviceInfo,
    ipAddress: string,
    userAgent: string
  ): Promise<AuthResponse> {
    // Validate age if date of birth provided
    if (input.dateOfBirth) {
      const age = this.calculateAge(input.dateOfBirth);
      if (age < MIN_AGE_YEARS) {
        throw new AppError(
          ErrorCode.AGE_REQUIREMENT_NOT_MET,
          `You must be at least ${MIN_AGE_YEARS} years old to use this service`,
          403
        );
      }
    }

    // Validate username
    if (!this.isValidUsername(input.username)) {
      throw new AppError(
        ErrorCode.INVALID_USERNAME,
        'Username must be 3-30 characters and contain only letters, numbers, and underscores',
        400
      );
    }

    // Check username availability
    const usernameExists = await this.prisma.user.findUnique({
      where: { username: input.username.toLowerCase() },
    });

    if (usernameExists) {
      throw new AppError(ErrorCode.USERNAME_TAKEN, 'Username is already taken', 409);
    }

    // Check email/phone availability
    if (input.email) {
      const emailExists = await this.prisma.user.findUnique({
        where: { email: input.email.toLowerCase() },
      });
      if (emailExists) {
        throw new AppError(ErrorCode.EMAIL_TAKEN, 'Email is already registered', 409);
      }
    }

    if (input.phone) {
      const phoneExists = await this.prisma.user.findUnique({
        where: { phone: input.phone },
      });
      if (phoneExists) {
        throw new AppError(ErrorCode.PHONE_TAKEN, 'Phone number is already registered', 409);
      }
    }

    // Create user
    const user = await this.prisma.user.create({
      data: {
        username: input.username.toLowerCase(),
        displayName: input.displayName,
        email: input.email?.toLowerCase(),
        phone: input.phone,
        dateOfBirth: input.dateOfBirth,
        authProvider: input.email ? 'EMAIL' : 'PHONE',
        status: 'ACTIVE',
        role: 'USER',
      },
    });

    // Create default settings
    await this.prisma.userSettings.create({
      data: {
        userId: user.id,
      },
    });

    // Create session and tokens
    const session = await this.createSession(user.id, deviceInfo, ipAddress, userAgent);
    const tokens = await this.tokenService.generateTokenPair(user, session.id);

    // Publish event
    await this.eventBus.publish(EventType.USER_CREATED, {
      userId: user.id,
      username: user.username,
      email: user.email,
      authProvider: user.authProvider,
    });

    this.logger.info('New user registered', { userId: user.id, username: user.username });

    return {
      user: this.toUserProfile(user),
      tokens,
      isNewUser: true,
    };
  }

  async oauthLogin(
    provider: 'google' | 'apple',
    oauthUser: OAuthUser,
    deviceInfo: DeviceInfo,
    ipAddress: string,
    userAgent: string
  ): Promise<AuthResponse> {
    // Check if user exists with this email
    let user = await this.prisma.user.findUnique({
      where: { email: oauthUser.email.toLowerCase() },
    });

    const isNewUser = !user;

    if (!user) {
      // Create new user
      const username = await this.generateUniqueUsername(oauthUser.email);

      user = await this.prisma.user.create({
        data: {
          username,
          displayName: oauthUser.name || username,
          email: oauthUser.email.toLowerCase(),
          avatarUrl: oauthUser.picture,
          authProvider: provider === 'google' ? 'GOOGLE' : 'APPLE',
          status: 'ACTIVE',
          role: 'USER',
        },
      });

      // Create default settings
      await this.prisma.userSettings.create({
        data: { userId: user.id },
      });

      await this.eventBus.publish(EventType.USER_CREATED, {
        userId: user.id,
        username: user.username,
        email: user.email,
        authProvider: user.authProvider,
      });
    }

    // Check account status
    if (user.status === 'SUSPENDED') {
      throw new AppError(ErrorCode.ACCOUNT_SUSPENDED, 'Account is suspended', 403);
    }

    // Create session and tokens
    const session = await this.createSession(user.id, deviceInfo, ipAddress, userAgent);
    const tokens = await this.tokenService.generateTokenPair(user, session.id);

    return {
      user: this.toUserProfile(user),
      tokens,
      isNewUser,
    };
  }

  async refreshToken(refreshToken: string): Promise<TokenRefreshResponse> {
    // Verify and decode refresh token
    const payload = await this.tokenService.verifyRefreshToken(refreshToken);

    // Get session
    const session = await this.prisma.session.findUnique({
      where: { id: payload.sessionId },
      include: { user: true },
    });

    if (!session || session.isRevoked) {
      throw new AppError(ErrorCode.SESSION_REVOKED, 'Session has been revoked', 401);
    }

    if (session.expiresAt < new Date()) {
      throw new AppError(ErrorCode.TOKEN_EXPIRED, 'Session has expired', 401);
    }

    // Generate new token pair
    const tokens = await this.tokenService.generateTokenPair(session.user, session.id);

    // Update session refresh token
    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        refreshToken: tokens.refreshToken,
        lastActiveAt: new Date(),
      },
    });

    return { tokens };
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
        revokedReason: 'USER_LOGOUT',
      },
    });

    // Add to revoked cache
    await this.redis.setex(`revoked:${sessionId}`, 86400 * 7, '1');
  }

  async logoutAll(userId: string): Promise<void> {
    const sessions = await this.prisma.session.findMany({
      where: { userId, isRevoked: false },
      select: { id: true },
    });

    await this.prisma.session.updateMany({
      where: { userId, isRevoked: false },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
        revokedReason: 'USER_LOGOUT_ALL',
      },
    });

    // Add all to revoked cache
    const pipeline = this.redis.pipeline();
    for (const session of sessions) {
      pipeline.setex(`revoked:${session.id}`, 86400 * 7, '1');
    }
    await pipeline.exec();
  }

  async getSessions(userId: string) {
    const sessions = await this.prisma.session.findMany({
      where: { userId, isRevoked: false, expiresAt: { gt: new Date() } },
      orderBy: { lastActiveAt: 'desc' },
    });

    return sessions.map((s) => ({
      id: s.id,
      deviceInfo: s.deviceInfo,
      ipAddress: s.ipAddress,
      lastActiveAt: s.lastActiveAt,
      createdAt: s.createdAt,
    }));
  }

  async revokeSession(sessionId: string, userId: string): Promise<void> {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, userId },
    });

    if (!session) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Session not found', 404);
    }

    await this.logout(sessionId);
  }

  async checkUsernameAvailability(username: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      select: { id: true },
    });
    return !user;
  }

  async checkEmailAvailability(email: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true },
    });
    return !user;
  }

  private async createSession(
    userId: string,
    deviceInfo: DeviceInfo | undefined,
    ipAddress: string,
    userAgent: string
  ) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    return this.prisma.session.create({
      data: {
        userId,
        deviceInfo: deviceInfo || {},
        ipAddress,
        userAgent,
        refreshToken: crypto.randomUUID(),
        expiresAt,
      },
    });
  }

  private toUserProfile(user: any): UserProfile {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      bio: user.bio,
      avatarUrl: user.avatarUrl,
      coverImageUrl: user.coverImageUrl,
      followerCount: user.followerCount,
      followingCount: user.followingCount,
      postCount: user.postCount,
      isVerified: user.isVerified,
      isPrivate: user.isPrivate,
      location: user.location,
      website: user.website,
      createdAt: user.createdAt,
    };
  }

  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!local || !domain) return '***@***';
    const masked = local.slice(0, 2) + '***' + local.slice(-1);
    return `${masked}@${domain}`;
  }

  private maskPhone(phone: string): string {
    return phone.slice(0, 3) + '****' + phone.slice(-2);
  }

  private calculateAge(birthDate: Date): number {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  }

  private isValidUsername(username: string): boolean {
    return /^[a-zA-Z0-9_]{3,30}$/.test(username);
  }

  private async generateUniqueUsername(email: string): Promise<string> {
    const base = email.split('@')[0]!.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20);
    let username = base;
    let counter = 1;

    while (await this.prisma.user.findUnique({ where: { username } })) {
      username = `${base}${counter}`;
      counter++;
    }

    return username;
  }
}
