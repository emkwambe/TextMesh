// =================================
// HEALTH CHECK ROUTES
// =================================

import { Router, Request, Response } from 'express';
import { checkDatabaseHealth } from '@textmesh/db-client';

export const healthRoutes = Router();

healthRoutes.get('/', (_req: Request, res: Response) => {
  res.json({ status: 'healthy', service: 'auth-service' });
});

healthRoutes.get('/ready', async (_req: Request, res: Response) => {
  try {
    const health = await checkDatabaseHealth();

    if (health.postgres && health.redis) {
      res.json({ status: 'ready' });
    } else {
      res.status(503).json({
        status: 'not_ready',
        postgres: health.postgres,
        redis: health.redis,
      });
    }
  } catch (error) {
    res.status(503).json({ status: 'not_ready', error: 'Health check failed' });
  }
});
