/**
 * Media Routes
 *
 * Handles media retrieval and management:
 * - Get media by ID
 * - Get user's media
 * - Delete media
 * - Update metadata
 */

import { Router, Request, Response, NextFunction } from 'express';
import { mediaService } from '../services/media.service';
import { createLogger } from '@textmesh/logger';

const logger = createLogger('media-routes');
const router = Router();

// Middleware to get user from token (simplified)
const getUserId = (req: Request): string => {
  return (req as any).user?.id || req.headers['x-user-id'] as string;
};

/**
 * GET /media/:id
 * Get media by ID
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const media = await mediaService.getMedia(id);

    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    res.json({ media });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /media/user/:userId
 * Get user's media
 */
router.get('/user/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.params;
    const { type, limit, cursor } = req.query;

    const result = await mediaService.getUserMedia(userId, {
      type: type as string,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      cursor: cursor as string,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /media/me
 * Get current user's media
 */
router.get('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { type, limit, cursor } = req.query;

    const result = await mediaService.getUserMedia(userId, {
      type: type as string,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      cursor: cursor as string,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /media/:id
 * Delete media
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;

    await mediaService.deleteMedia(id, userId);

    logger.info('Media deleted via API', { mediaId: id, userId });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /media/:id
 * Update media metadata
 */
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;
    const { metadata } = req.body;

    if (!metadata || typeof metadata !== 'object') {
      return res.status(400).json({ error: 'metadata object required' });
    }

    const media = await mediaService.updateMetadata(id, userId, metadata);

    res.json({ media });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /media/:id/moderate
 * Report media for moderation
 */
router.post('/:id/moderate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;
    const { reason, details } = req.body;

    if (!reason) {
      return res.status(400).json({ error: 'reason required' });
    }

    const media = await mediaService.getMedia(id);
    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    // In production, this would create a moderation queue entry
    logger.info('Media reported for moderation', {
      mediaId: id,
      reporterId: userId,
      reason,
      details,
    });

    res.json({ success: true, message: 'Report submitted for review' });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /media/:id/variants
 * Get all variant URLs for a media item
 */
router.get('/:id/variants', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const media = await mediaService.getMedia(id);

    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    res.json({
      id: media.id,
      type: media.type,
      variants: media.variants || { original: media.url },
      thumbnailUrl: media.thumbnailUrl,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
