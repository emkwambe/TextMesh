// =================================
// SETTINGS ROUTES
// =================================

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { Logger } from '@textmesh/logger';
import { SettingsService } from '../services/settings.service.js';
import { validateRequest } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { z } from 'zod';

const updateSettingsSchema = z.object({
  body: z.object({
    emailNotifications: z.boolean().optional(),
    pushNotifications: z.boolean().optional(),
    smsNotifications: z.boolean().optional(),
    privateAccount: z.boolean().optional(),
    showOnlineStatus: z.boolean().optional(),
    allowMentions: z.enum(['EVERYONE', 'FOLLOWERS', 'NONE']).optional(),
    allowDirectMessages: z.enum(['EVERYONE', 'FOLLOWERS', 'NONE']).optional(),
    language: z.string().max(10).optional(),
    timezone: z.string().max(50).optional(),
    theme: z.enum(['LIGHT', 'DARK', 'SYSTEM']).optional(),
    doNotSellData: z.boolean().optional(),
  }),
});

export function settingsRoutes(
  prisma: PrismaClient,
  redis: Redis,
  logger: Logger
): Router {
  const router = Router();
  const settingsService = new SettingsService(prisma, redis, logger);

  // Get user settings
  router.get(
    '/',
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }
      const settings = await settingsService.getSettings(req.userId);
      res.json({ success: true, data: { settings } });
    })
  );

  // Update settings
  router.patch(
    '/',
    validateRequest(updateSettingsSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }
      const settings = await settingsService.updateSettings(req.userId, req.body);
      res.json({ success: true, data: { settings } });
    })
  );

  // Request data export (GDPR)
  router.post(
    '/export',
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }
      const exportRequest = await settingsService.requestDataExport(req.userId);
      res.json({ success: true, data: exportRequest });
    })
  );

  // Get data export status
  router.get(
    '/export/:exportId',
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }
      const status = await settingsService.getExportStatus(req.userId, req.params['exportId']!);
      res.json({ success: true, data: status });
    })
  );

  // Request account deletion (GDPR)
  router.post(
    '/delete-account',
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }
      const { confirmation, reason } = req.body;
      if (confirmation !== 'DELETE') {
        res.status(400).json({ success: false, error: { code: 'INVALID_CONFIRMATION', message: 'Please confirm deletion by typing DELETE' } });
        return;
      }
      const result = await settingsService.requestAccountDeletion(req.userId, reason);
      res.json({ success: true, data: result });
    })
  );

  // Cancel account deletion
  router.delete(
    '/delete-account',
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }
      await settingsService.cancelAccountDeletion(req.userId);
      res.json({ success: true, data: { message: 'Account deletion cancelled' } });
    })
  );

  return router;
}
