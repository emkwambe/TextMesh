/**
 * Message Routes
 */

import { Router, Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { messageService } from '../services/message.service';
import { createLogger } from '@textmesh/logger';

const router = Router();
const logger = createLogger('message-routes');

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

// Get user ID from header
const getUserId = (req: Request): string => {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    throw new Error('User ID not found in request');
  }
  return userId;
};

/**
 * GET /messages/:conversationId
 * Get messages in a conversation with pagination
 */
router.get(
  '/:conversationId',
  [
    param('conversationId').isUUID().withMessage('Valid conversation ID is required'),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('before').optional().isISO8601(),
    query('after').optional().isISO8601(),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);
      const { conversationId } = req.params;
      const limit = req.query.limit as unknown as number;
      const before = req.query.before as string;
      const after = req.query.after as string;

      const result = await messageService.getMessages(conversationId, userId, {
        limit,
        before,
        after,
      });

      res.json({
        success: true,
        data: result.messages,
        meta: {
          cursor: result.cursor,
          hasMore: result.hasMore,
        },
      });
    } catch (error: any) {
      if (error.message?.includes('Not a participant')) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: error.message },
        });
      }
      next(error);
    }
  }
);

/**
 * POST /messages/:conversationId
 * Send a message to a conversation
 */
router.post(
  '/:conversationId',
  [
    param('conversationId').isUUID().withMessage('Valid conversation ID is required'),
    body('content')
      .isString()
      .isLength({ max: 5000 })
      .withMessage('Message must be 5000 characters or less'),
    body('replyToId').optional().isUUID(),
    body('attachments').optional().isArray({ max: 10 }),
    body('attachments.*.type')
      .optional()
      .isIn(['image', 'video', 'file'])
      .withMessage('Invalid attachment type'),
    body('attachments.*.url').optional().isURL(),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);
      const { conversationId } = req.params;
      const { content, replyToId, attachments } = req.body;

      const message = await messageService.sendMessage(userId, {
        conversationId,
        content: content || '',
        replyToId,
        attachments,
      });

      res.status(201).json({
        success: true,
        data: message,
      });
    } catch (error: any) {
      if (error.message?.includes('not a participant')) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: error.message },
        });
      }
      if (error.message?.includes('cannot be empty') || error.message?.includes('exceeds')) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_MESSAGE', message: error.message },
        });
      }
      next(error);
    }
  }
);

/**
 * PATCH /messages/:messageId
 * Edit a message
 */
router.patch(
  '/:messageId',
  [
    param('messageId').isUUID().withMessage('Valid message ID is required'),
    body('content')
      .isString()
      .isLength({ min: 1, max: 5000 })
      .withMessage('Message must be between 1 and 5000 characters'),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);
      const { messageId } = req.params;
      const { content } = req.body;

      const message = await messageService.editMessage(messageId, userId, content);

      res.json({
        success: true,
        data: message,
      });
    } catch (error: any) {
      if (error.message?.includes('only edit your own')) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: error.message },
        });
      }
      if (error.message?.includes('Edit window') || error.message?.includes('exceeds')) {
        return res.status(400).json({
          success: false,
          error: { code: 'EDIT_EXPIRED', message: error.message },
        });
      }
      if (error.message?.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: error.message },
        });
      }
      next(error);
    }
  }
);

/**
 * DELETE /messages/:messageId
 * Delete a message
 */
router.delete(
  '/:messageId',
  [param('messageId').isUUID().withMessage('Valid message ID is required')],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);
      const { messageId } = req.params;

      await messageService.deleteMessage(messageId, userId);

      res.json({
        success: true,
        data: { message: 'Message deleted successfully' },
      });
    } catch (error: any) {
      if (error.message?.includes('only delete your own')) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: error.message },
        });
      }
      if (error.message?.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: error.message },
        });
      }
      next(error);
    }
  }
);

/**
 * POST /messages/:conversationId/read
 * Mark messages as read
 */
router.post(
  '/:conversationId/read',
  [
    param('conversationId').isUUID().withMessage('Valid conversation ID is required'),
    body('upToMessageId').optional().isUUID(),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);
      const { conversationId } = req.params;
      const { upToMessageId } = req.body;

      await messageService.markAsRead(conversationId, userId, upToMessageId);

      res.json({
        success: true,
        data: { message: 'Messages marked as read' },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /messages/:messageId/reactions
 * Add a reaction to a message
 */
router.post(
  '/:messageId/reactions',
  [
    param('messageId').isUUID().withMessage('Valid message ID is required'),
    body('emoji').isString().isLength({ min: 1, max: 10 }).withMessage('Valid emoji is required'),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);
      const { messageId } = req.params;
      const { emoji } = req.body;

      await messageService.addReaction(messageId, userId, emoji);

      res.status(201).json({
        success: true,
        data: { message: 'Reaction added' },
      });
    } catch (error: any) {
      if (error.message?.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: error.message },
        });
      }
      if (error.message?.includes('Not a participant')) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: error.message },
        });
      }
      next(error);
    }
  }
);

/**
 * DELETE /messages/:messageId/reactions/:emoji
 * Remove a reaction from a message
 */
router.delete(
  '/:messageId/reactions/:emoji',
  [
    param('messageId').isUUID().withMessage('Valid message ID is required'),
    param('emoji').isString().withMessage('Valid emoji is required'),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);
      const { messageId, emoji } = req.params;

      await messageService.removeReaction(messageId, userId, decodeURIComponent(emoji));

      res.json({
        success: true,
        data: { message: 'Reaction removed' },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /messages/:conversationId/search
 * Search messages in a conversation
 */
router.get(
  '/:conversationId/search',
  [
    param('conversationId').isUUID().withMessage('Valid conversation ID is required'),
    query('q').isString().isLength({ min: 1 }).withMessage('Search query is required'),
    query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt(),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);
      const { conversationId } = req.params;
      const q = req.query.q as string;
      const limit = req.query.limit as unknown as number;
      const offset = req.query.offset as unknown as number;

      const result = await messageService.searchMessages(conversationId, userId, q, {
        limit,
        offset,
      });

      res.json({
        success: true,
        data: result.messages,
        meta: {
          total: result.total,
          limit: limit || 20,
          offset: offset || 0,
        },
      });
    } catch (error: any) {
      if (error.message?.includes('Not a participant')) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: error.message },
        });
      }
      next(error);
    }
  }
);

export default router;
