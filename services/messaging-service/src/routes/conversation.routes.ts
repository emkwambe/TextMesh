/**
 * Conversation Routes
 */

import { Router, Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { conversationService } from '../services/conversation.service';
import { createLogger } from '@textmesh/logger';

const router = Router();
const logger = createLogger('conversation-routes');

// Validation middleware
const validate = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: errors.array()[0].msg },
    });
  }
  next();
};

// Get user ID from header (set by API gateway)
const getUserId = (req: Request): string => {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    throw new Error('User ID not found in request');
  }
  return userId;
};

/**
 * GET /conversations
 * Get user's conversations with pagination
 */
router.get(
  '/',
  [
    query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
    query('cursor').optional().isString(),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);
      const limit = req.query.limit as unknown as number;
      const cursor = req.query.cursor as string;

      const result = await conversationService.getUserConversations(userId, {
        limit,
        cursor,
      });

      res.json({
        success: true,
        data: result.conversations,
        meta: {
          cursor: result.cursor,
          hasMore: result.hasMore,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /conversations/unread-count
 * Get unread conversation count
 */
router.get('/unread-count', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const count = await conversationService.getUnreadCount(userId);

    res.json({
      success: true,
      data: { count },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /conversations/direct
 * Start or get a direct conversation with a user
 */
router.post(
  '/direct',
  [body('userId').isUUID().withMessage('Valid user ID is required')],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const currentUserId = getUserId(req);
      const { userId: otherUserId } = req.body;

      if (currentUserId === otherUserId) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_REQUEST', message: 'Cannot message yourself' },
        });
      }

      const conversation = await conversationService.getOrCreateDirectConversation(
        currentUserId,
        otherUserId
      );

      res.status(200).json({
        success: true,
        data: conversation,
      });
    } catch (error: any) {
      if (error.message?.includes('Cannot message')) {
        return res.status(403).json({
          success: false,
          error: { code: 'MESSAGING_BLOCKED', message: error.message },
        });
      }
      next(error);
    }
  }
);

/**
 * POST /conversations/group
 * Create a group conversation
 */
router.post(
  '/group',
  [
    body('participantIds')
      .isArray({ min: 1 })
      .withMessage('At least one participant is required'),
    body('participantIds.*').isUUID().withMessage('Invalid participant ID'),
    body('name').optional().isString().isLength({ min: 1, max: 100 }),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);
      const { participantIds, name } = req.body;

      const conversation = await conversationService.createGroupConversation(
        userId,
        participantIds,
        name
      );

      res.status(201).json({
        success: true,
        data: conversation,
      });
    } catch (error: any) {
      if (error.message?.includes('Cannot message')) {
        return res.status(403).json({
          success: false,
          error: { code: 'MESSAGING_BLOCKED', message: error.message },
        });
      }
      next(error);
    }
  }
);

/**
 * GET /conversations/:id
 * Get a specific conversation
 */
router.get(
  '/:id',
  [param('id').isUUID().withMessage('Valid conversation ID is required')],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);
      const { id: conversationId } = req.params;

      const conversation = await conversationService.getConversation(
        conversationId,
        userId
      );

      if (!conversation) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Conversation not found' },
        });
      }

      res.json({
        success: true,
        data: conversation,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /conversations/:id/leave
 * Leave a group conversation
 */
router.post(
  '/:id/leave',
  [param('id').isUUID().withMessage('Valid conversation ID is required')],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);
      const { id: conversationId } = req.params;

      await conversationService.leaveConversation(conversationId, userId);

      res.json({
        success: true,
        data: { message: 'Left conversation successfully' },
      });
    } catch (error: any) {
      if (error.message?.includes('Cannot leave')) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_REQUEST', message: error.message },
        });
      }
      next(error);
    }
  }
);

/**
 * DELETE /conversations/:id
 * Delete a conversation (hides it for the user)
 */
router.delete(
  '/:id',
  [param('id').isUUID().withMessage('Valid conversation ID is required')],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);
      const { id: conversationId } = req.params;

      await conversationService.deleteConversation(conversationId, userId);

      res.json({
        success: true,
        data: { message: 'Conversation deleted successfully' },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
