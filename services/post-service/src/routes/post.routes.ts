// =================================
// POST ROUTES
// =================================

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { EventBus } from '@textmesh/event-bus';
import { Logger } from '@textmesh/logger';
import { PostService } from '../services/post.service.js';
import { validateRequest } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { z } from 'zod';

const createPostSchema = z.object({
  body: z.object({
    content: z.string().min(1, 'Content is required').max(1000, 'Content too long'),
    visibility: z.enum(['PUBLIC', 'FOLLOWERS', 'GROUP']).default('PUBLIC'),
    groupId: z.string().uuid().optional(),
    parentId: z.string().uuid().optional(),
    repostId: z.string().uuid().optional(),
  }),
});

const updatePostSchema = z.object({
  body: z.object({
    content: z.string().min(1).max(1000),
  }),
});

const paginationSchema = z.object({
  query: z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().min(1).max(100).default(20),
  }),
});

export function postRoutes(
  prisma: PrismaClient,
  redis: Redis,
  eventBus: EventBus,
  logger: Logger
): Router {
  const router = Router();
  const postService = new PostService(prisma, redis, eventBus, logger);

  // Create post
  router.post(
    '/',
    validateRequest(createPostSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }
      const post = await postService.createPost(req.userId, req.body);
      res.status(201).json({ success: true, data: { post } });
    })
  );

  // Get post by ID
  router.get(
    '/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const post = await postService.getPostById(req.params['id']!, req.userId);
      res.json({ success: true, data: { post } });
    })
  );

  // Update post
  router.patch(
    '/:id',
    validateRequest(updatePostSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }
      const post = await postService.updatePost(req.params['id']!, req.userId, req.body.content);
      res.json({ success: true, data: { post } });
    })
  );

  // Delete post
  router.delete(
    '/:id',
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }
      await postService.deletePost(req.params['id']!, req.userId);
      res.json({ success: true, data: { message: 'Post deleted' } });
    })
  );

  // Like post
  router.post(
    '/:id/like',
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }
      const result = await postService.likePost(req.params['id']!, req.userId);
      res.json({ success: true, data: result });
    })
  );

  // Unlike post
  router.delete(
    '/:id/like',
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }
      const result = await postService.unlikePost(req.params['id']!, req.userId);
      res.json({ success: true, data: result });
    })
  );

  // Get post likes
  router.get(
    '/:id/likes',
    validateRequest(paginationSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const { cursor, limit = 20 } = req.query as unknown as { cursor?: string; limit: number };
      const likes = await postService.getPostLikes(req.params['id']!, cursor, limit);
      res.json({ success: true, data: likes });
    })
  );

  // Bookmark post
  router.post(
    '/:id/bookmark',
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }
      await postService.bookmarkPost(req.params['id']!, req.userId);
      res.json({ success: true, data: { isBookmarked: true } });
    })
  );

  // Remove bookmark
  router.delete(
    '/:id/bookmark',
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }
      await postService.removeBookmark(req.params['id']!, req.userId);
      res.json({ success: true, data: { isBookmarked: false } });
    })
  );

  // Get user's bookmarks
  router.get(
    '/bookmarks/me',
    validateRequest(paginationSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }
      const { cursor, limit = 20 } = req.query as unknown as { cursor?: string; limit: number };
      const bookmarks = await postService.getUserBookmarks(req.userId, cursor, limit);
      res.json({ success: true, data: bookmarks });
    })
  );

  // Get post replies
  router.get(
    '/:id/replies',
    validateRequest(paginationSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const { cursor, limit = 20 } = req.query as unknown as { cursor?: string; limit: number };
      const replies = await postService.getPostReplies(req.params['id']!, req.userId, cursor, limit);
      res.json({ success: true, data: replies });
    })
  );

  // Get posts by hashtag
  router.get(
    '/hashtag/:tag',
    validateRequest(paginationSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const { cursor, limit = 20 } = req.query as unknown as { cursor?: string; limit: number };
      const posts = await postService.getPostsByHashtag(req.params['tag']!, req.userId, cursor, limit);
      res.json({ success: true, data: posts });
    })
  );

  // Get trending hashtags
  router.get(
    '/trending/hashtags',
    asyncHandler(async (_req: Request, res: Response) => {
      const hashtags = await postService.getTrendingHashtags();
      res.json({ success: true, data: { hashtags } });
    })
  );

  return router;
}
