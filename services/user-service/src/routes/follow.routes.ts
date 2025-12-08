// =================================
// FOLLOW ROUTES
// =================================

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { EventBus } from '@textmesh/event-bus';
import { Logger } from '@textmesh/logger';
import { FollowService } from '../services/follow.service.js';
import { asyncHandler } from '../middleware/error-handler.js';

export function followRoutes(
  prisma: PrismaClient,
  redis: Redis,
  eventBus: EventBus,
  logger: Logger
): Router {
  const router = Router();
  const followService = new FollowService(prisma, redis, eventBus, logger);

  // Follow user
  router.post(
    '/:userId',
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }
      const result = await followService.followUser(req.userId, req.params['userId']!);
      res.json({ success: true, data: result });
    })
  );

  // Unfollow user
  router.delete(
    '/:userId',
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }
      await followService.unfollowUser(req.userId, req.params['userId']!);
      res.json({ success: true, data: { isFollowing: false } });
    })
  );

  // Get follow requests (for private accounts)
  router.get(
    '/requests',
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }
      const { cursor, limit } = req.query as { cursor?: string; limit?: string };
      const requests = await followService.getFollowRequests(req.userId, cursor, parseInt(limit || '20', 10));
      res.json({ success: true, data: requests });
    })
  );

  // Accept follow request
  router.post(
    '/requests/:requestId/accept',
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }
      await followService.acceptFollowRequest(req.userId, req.params['requestId']!);
      res.json({ success: true, data: { message: 'Follow request accepted' } });
    })
  );

  // Reject follow request
  router.post(
    '/requests/:requestId/reject',
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }
      await followService.rejectFollowRequest(req.userId, req.params['requestId']!);
      res.json({ success: true, data: { message: 'Follow request rejected' } });
    })
  );

  // Check follow status
  router.get(
    '/status/:userId',
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }
      const status = await followService.getFollowStatus(req.userId, req.params['userId']!);
      res.json({ success: true, data: status });
    })
  );

  // Get follow suggestions
  router.get(
    '/suggestions',
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }
      const { limit } = req.query as { limit?: string };
      const suggestions = await followService.getFollowSuggestions(req.userId, parseInt(limit || '10', 10));
      res.json({ success: true, data: suggestions });
    })
  );

  return router;
}
