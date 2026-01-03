// =================================
// NOTIFICATION PREFERENCE ROUTES
// =================================

import { Router, Request, Response } from 'express';
import { PrismaClient, NotificationFrequency } from '@prisma/client';
import { Logger } from '@textmesh/logger';
import { NotificationPreferenceService } from '../services/notification-preference.service.js';

export function preferenceRoutes(prisma: PrismaClient, logger: Logger): Router {
  const router = Router();
  const preferenceService = new NotificationPreferenceService(prisma, logger);

  // Get global notification preference
  router.get('/', async (req: Request, res: Response) => {
    if (!req.userId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const preference = await preferenceService.getGlobalPreference(req.userId);
    res.json({ success: true, data: { preference } });
  });

  // Update global notification preference
  router.patch('/', async (req: Request, res: Response) => {
    if (!req.userId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { frequency, mutedUntil } = req.body;

    // Validate frequency if provided
    if (frequency && !['IMMEDIATE', 'DAILY_DIGEST', 'WEEKLY_DIGEST', 'DISABLED'].includes(frequency)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_FREQUENCY', message: 'Invalid notification frequency' }
      });
    }

    const preference = await preferenceService.updateGlobalPreference(req.userId, {
      frequency: frequency as NotificationFrequency,
      mutedUntil: mutedUntil ? new Date(mutedUntil) : undefined
    });

    res.json({ success: true, data: { preference } });
  });

  // Get all group-specific preferences
  router.get('/groups', async (req: Request, res: Response) => {
    if (!req.userId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const preferences = await preferenceService.getAllGroupPreferences(req.userId);
    res.json({ success: true, data: { preferences } });
  });

  // Get notification preference for a specific group
  router.get('/groups/:groupId', async (req: Request, res: Response) => {
    if (!req.userId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { groupId } = req.params;
    const preference = await preferenceService.getGroupPreference(req.userId, groupId!);
    res.json({ success: true, data: { preference } });
  });

  // Update notification preference for a specific group
  router.patch('/groups/:groupId', async (req: Request, res: Response) => {
    if (!req.userId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { groupId } = req.params;
    const { frequency, mutedUntil } = req.body;

    // Validate frequency if provided
    if (frequency && !['IMMEDIATE', 'DAILY_DIGEST', 'WEEKLY_DIGEST', 'DISABLED'].includes(frequency)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_FREQUENCY', message: 'Invalid notification frequency' }
      });
    }

    const preference = await preferenceService.updateGroupPreference(req.userId, {
      groupId: groupId!,
      frequency: frequency as NotificationFrequency,
      mutedUntil: mutedUntil ? new Date(mutedUntil) : undefined
    });

    res.json({ success: true, data: { preference } });
  });

  // Mute notifications for a duration
  router.post('/mute', async (req: Request, res: Response) => {
    if (!req.userId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { durationHours, groupId } = req.body;

    if (!durationHours || durationHours <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_DURATION', message: 'Duration must be positive' }
      });
    }

    const preference = await preferenceService.muteNotifications(
      req.userId,
      durationHours,
      groupId
    );

    res.json({ success: true, data: { preference } });
  });

  // Unmute notifications
  router.post('/unmute', async (req: Request, res: Response) => {
    if (!req.userId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { groupId } = req.body;
    const preference = await preferenceService.unmuteNotifications(req.userId, groupId);

    res.json({ success: true, data: { preference } });
  });

  return router;
}
