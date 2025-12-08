/**
 * Request Logger Middleware
 */

import { Request, Response, NextFunction } from 'express';
import { createLogger } from '@textmesh/logger';

const logger = createLogger('messaging-service');

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;

    logger.info('Request completed', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      userId: req.headers['x-user-id'],
      requestId: req.headers['x-request-id'],
    });
  });

  next();
}
