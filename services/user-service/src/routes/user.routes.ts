// =================================
// USER ROUTES
// =================================

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { EventBus } from '@textmesh/event-bus';
import { Logger } from '@textmesh/logger';
import { UserService } from '../services/user.service.js';
import { validateRequest } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { z } from 'zod';

const updateProfileSchema = z.object({
  body: z.object({
    displayName: z.string().min(1).max(50).optional(),
    bio: z.string().max(500).optional(),
    location: z.string().max(100).optional(),
    website: z.string().url().max(200).optional().or(z.literal('')),
    isPrivate: z.boolean().optional(),
  }),
});

const paginationSchema = z.object({
  query: z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().min(1).max(100).default(20),
  }),
});

export function userRoutes(
  prisma: PrismaClient,
  redis: Redis,
  eventBus: EventBus,
  logger: Logger
): Router {
  const router = Router();
  const userService = new UserService(prisma, redis, eventBus, logger);

  // Get current user profile
  router.get(
    '/me',
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }
      const user = await userService.getUserById(req.userId, req.userId);
      res.json({ success: true, data: { user } });
    })
  );

  // Get user by ID
  router.get(
    '/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;
      const user = await userService.getUserById(id, req.userId);
      res.json({ success: true, data: { user } });
    })
  );

  // Get user by username
  router.get(
    '/username/:username',
    asyncHandler(async (req: Request, res: Response) => {
      const { username } = req.params;
      const user = await userService.getUserByUsername(username, req.userId);
      res.json({ success: true, data: { user } });
    })
  );

  // Update profile
  router.patch(
    '/me',
    validateRequest(updateProfileSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }
      const user = await userService.updateProfile(req.userId, req.body);
      res.json({ success: true, data: { user } });
    })
  );

  // Get user's posts
  router.get(
    '/:id/posts',
    validateRequest(paginationSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;
      const { cursor, limit = 20 } = req.query as unknown as { cursor?: string; limit: number };
      const posts = await userService.getUserPosts(id, req.userId, cursor, limit);
      res.json({ success: true, data: posts });
    })
  );

  // Get user's followers
  router.get(
    '/:id/followers',
    validateRequest(paginationSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;
      const { cursor, limit = 20 } = req.query as unknown as { cursor?: string; limit: number };
      const followers = await userService.getFollowers(id, cursor, limit);
      res.json({ success: true, data: followers });
    })
  );

  // Get user's following
  router.get(
    '/:id/following',
    validateRequest(paginationSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;
      const { cursor, limit = 20 } = req.query as unknown as { cursor?: string; limit: number };
      const following = await userService.getFollowing(id, cursor, limit);
      res.json({ success: true, data: following });
    })
  );

  // Block user
  router.post(
    '/:id/block',
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }
      await userService.blockUser(req.userId, req.params['id']!);
      res.json({ success: true, data: { isBlocked: true } });
    })
  );

  // Unblock user
  router.delete(
    '/:id/block',
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }
      await userService.unblockUser(req.userId, req.params['id']!);
      res.json({ success: true, data: { isBlocked: false } });
    })
  );

  // Mute user
  router.post(
    '/:id/mute',
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }
      await userService.muteUser(req.userId, req.params['id']!);
      res.json({ success: true, data: { isMuted: true } });
    })
  );

  // Unmute user
  router.delete(
    '/:id/mute',
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }
      await userService.unmuteUser(req.userId, req.params['id']!);
      res.json({ success: true, data: { isMuted: false } });
    })
  );

  // Search users
  router.get(
    '/search',
    asyncHandler(async (req: Request, res: Response) => {
      const { q, cursor, limit } = req.query as { q: string; cursor?: string; limit?: string };
      const results = await userService.searchUsers(q, cursor, parseInt(limit || '20', 10));
      res.json({ success: true, data: results });
    })
  );

  return router;
}
