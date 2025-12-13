// =================================
// HEALTH CHECK ROUTES
// =================================

import { Router, Request, Response, IRouter } from 'express';
import { checkDatabaseHealth } from '@textmesh/db-client';
import { HealthCheckResponse } from '@textmesh/shared-types';

export const healthRoutes: IRouter = Router();

const startTime = Date.now();

// Basic health check
healthRoutes.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

// Liveness probe (for Kubernetes)
healthRoutes.get('/live', (_req: Request, res: Response) => {
  res.json({
    status: 'alive',
    timestamp: new Date().toISOString(),
  });
});

// Readiness probe (for Kubernetes)
healthRoutes.get('/ready', async (_req: Request, res: Response) => {
  try {
    const dbHealth = await checkDatabaseHealth();

    if (!dbHealth.redis) {
      res.status(503).json({
        status: 'not_ready',
        reason: 'Redis not available',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    res.json({
      status: 'ready',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'not_ready',
      reason: 'Health check failed',
      timestamp: new Date().toISOString(),
    });
  }
});

// Detailed health check
healthRoutes.get('/detailed', async (req: Request, res: Response) => {
  const dbHealth = await checkDatabaseHealth();
  const uptime = Math.floor((Date.now() - startTime) / 1000);

  // Check downstream services
  const services = await checkDownstreamServices();

  const allServicesUp = services.every((s) => s.status === 'up') && dbHealth.redis;

  const response: HealthCheckResponse = {
    status: allServicesUp ? 'healthy' : 'degraded',
    version: process.env['npm_package_version'] || '1.0.0',
    uptime,
    services: [
      { name: 'redis', status: dbHealth.redis ? 'up' : 'down' },
      ...services,
    ],
  };

  res.status(allServicesUp ? 200 : 503).json(response);
});

async function checkDownstreamServices(): Promise<
  Array<{ name: string; status: 'up' | 'down'; latency?: number }>
> {
  const serviceEndpoints: Record<string, string> = {
    'auth-service': process.env['AUTH_SERVICE_URL'] || 'http://localhost:3001',
    'user-service': process.env['USER_SERVICE_URL'] || 'http://localhost:3002',
    'post-service': process.env['POST_SERVICE_URL'] || 'http://localhost:3003',
    'feed-service': process.env['FEED_SERVICE_URL'] || 'http://localhost:3004',
    'group-service': process.env['GROUP_SERVICE_URL'] || 'http://localhost:3005',
    'notification-service': process.env['NOTIFICATION_SERVICE_URL'] || 'http://localhost:3006',
    'moderation-service': process.env['MODERATION_SERVICE_URL'] || 'http://localhost:3007',
    'search-service': process.env['SEARCH_SERVICE_URL'] || 'http://localhost:3008',
  };

  const results = await Promise.all(
    Object.entries(serviceEndpoints).map(async ([name, url]) => {
      const startTime = Date.now();
      try {
        const response = await fetch(`${url}/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });
        const latency = Date.now() - startTime;

        return {
          name,
          status: response.ok ? ('up' as const) : ('down' as const),
          latency,
        };
      } catch {
        return {
          name,
          status: 'down' as const,
        };
      }
    })
  );

  return results;
}

// Version endpoint
healthRoutes.get('/version', (_req: Request, res: Response) => {
  res.json({
    version: process.env['npm_package_version'] || '1.0.0',
    commit: process.env['GIT_COMMIT'] || 'unknown',
    buildDate: process.env['BUILD_DATE'] || new Date().toISOString(),
    nodeVersion: process.version,
  });
});
