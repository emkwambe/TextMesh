// =================================
// AUTH ROUTES
// =================================

import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { EventBus } from '@textmesh/event-bus';
import { Logger } from '@textmesh/logger';
import { AuthService } from '../services/auth.service.js';
import { TokenService } from '../services/token.service.js';
import { OTPService } from '../services/otp.service.js';
import { OAuthService } from '../services/oauth.service.js';
import { validateRequest } from '../middleware/validate.js';
import {
  signupSchema,
  loginSchema,
  verifyOTPSchema,
  refreshTokenSchema,
  oauthLoginSchema,
} from '../schemas/auth.schemas.js';
import { asyncHandler } from '../middleware/error-handler.js';

export function authRoutes(
  prisma: PrismaClient,
  redis: Redis,
  eventBus: EventBus,
  logger: Logger
): Router {
  const router = Router();

  const tokenService = new TokenService(redis);
  const otpService = new OTPService(redis);
  const oauthService = new OAuthService();
  const authService = new AuthService(prisma, redis, eventBus, tokenService, otpService, logger);

  // Send OTP for login/signup
  router.post(
    '/send-otp',
    validateRequest(loginSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const { email, phone } = req.body;
      const identifier = email || phone;
      const type = email ? 'email' : 'phone';

      const result = await authService.sendOTP(identifier, type as 'email' | 'phone');

      res.json({
        success: true,
        data: result,
      });
    })
  );

  // Verify OTP and login/signup
  router.post(
    '/verify-otp',
    validateRequest(verifyOTPSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const { identifier, code, deviceInfo } = req.body;

      const result = await authService.verifyOTP(
        identifier,
        code,
        deviceInfo,
        req.ip || 'unknown',
        req.headers['user-agent'] || 'unknown'
      );

      res.json({
        success: true,
        data: result,
      });
    })
  );

  // Signup with email/phone
  router.post(
    '/signup',
    validateRequest(signupSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const { username, displayName, email, phone, dateOfBirth } = req.body;

      const result = await authService.signup(
        {
          username,
          displayName,
          email,
          phone,
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
        },
        {
          deviceId: req.body.deviceInfo?.deviceId || crypto.randomUUID(),
          deviceType: req.body.deviceInfo?.deviceType || 'unknown',
          deviceName: req.body.deviceInfo?.deviceName,
          osVersion: req.body.deviceInfo?.osVersion,
          appVersion: req.body.deviceInfo?.appVersion,
        },
        req.ip || 'unknown',
        req.headers['user-agent'] || 'unknown'
      );

      res.status(201).json({
        success: true,
        data: result,
      });
    })
  );

  // OAuth login (Google, Apple)
  router.post(
    '/oauth/:provider',
    validateRequest(oauthLoginSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const { provider } = req.params;
      const { idToken, deviceInfo } = req.body;

      if (provider !== 'google' && provider !== 'apple') {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_PROVIDER', message: 'Invalid OAuth provider' },
        });
        return;
      }

      // Verify OAuth token
      let oauthUser;
      if (provider === 'google') {
        oauthUser = await oauthService.verifyGoogleToken(idToken);
      } else {
        oauthUser = await oauthService.verifyAppleToken(idToken);
      }

      const result = await authService.oauthLogin(
        provider,
        oauthUser,
        deviceInfo || {
          deviceId: crypto.randomUUID(),
          deviceType: 'unknown',
        },
        req.ip || 'unknown',
        req.headers['user-agent'] || 'unknown'
      );

      res.json({
        success: true,
        data: result,
      });
    })
  );

  // Refresh token
  router.post(
    '/refresh',
    validateRequest(refreshTokenSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const { refreshToken } = req.body;

      const result = await authService.refreshToken(refreshToken);

      res.json({
        success: true,
        data: result,
      });
    })
  );

  // Logout
  router.post(
    '/logout',
    asyncHandler(async (req: Request, res: Response) => {
      const sessionId = req.headers['x-session-id'] as string;

      if (sessionId) {
        await authService.logout(sessionId);
      }

      res.json({
        success: true,
        data: { message: 'Logged out successfully' },
      });
    })
  );

  // Logout all sessions
  router.post(
    '/logout-all',
    asyncHandler(async (req: Request, res: Response) => {
      const userId = req.headers['x-user-id'] as string;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'User ID required' },
        });
        return;
      }

      await authService.logoutAll(userId);

      res.json({
        success: true,
        data: { message: 'All sessions logged out' },
      });
    })
  );

  // Get active sessions
  router.get(
    '/sessions',
    asyncHandler(async (req: Request, res: Response) => {
      const userId = req.headers['x-user-id'] as string;
      const currentSessionId = req.headers['x-session-id'] as string;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'User ID required' },
        });
        return;
      }

      const sessions = await authService.getSessions(userId);

      res.json({
        success: true,
        data: {
          sessions,
          currentSessionId,
        },
      });
    })
  );

  // Revoke specific session
  router.delete(
    '/sessions/:sessionId',
    asyncHandler(async (req: Request, res: Response) => {
      const userId = req.headers['x-user-id'] as string;
      const { sessionId } = req.params;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'User ID required' },
        });
        return;
      }

      await authService.revokeSession(sessionId, userId);

      res.json({
        success: true,
        data: { message: 'Session revoked' },
      });
    })
  );

  // Check username availability
  router.get(
    '/check-username/:username',
    asyncHandler(async (req: Request, res: Response) => {
      const { username } = req.params;

      const isAvailable = await authService.checkUsernameAvailability(username);

      res.json({
        success: true,
        data: { available: isAvailable },
      });
    })
  );

  // Check email availability
  router.get(
    '/check-email/:email',
    asyncHandler(async (req: Request, res: Response) => {
      const { email } = req.params;

      const isAvailable = await authService.checkEmailAvailability(email);

      res.json({
        success: true,
        data: { available: isAvailable },
      });
    })
  );

  return router;
}
