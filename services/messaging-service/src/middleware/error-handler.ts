/**
 * Error Handler Middleware
 */

import { Request, Response, NextFunction } from 'express';
import { createLogger } from '@textmesh/logger';

const logger = createLogger('messaging-service');

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  logger.error('Request error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    userId: req.headers['x-user-id'],
  });

  // Don't expose internal errors to clients
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}
