/**
 * Error Handler Middleware
 */

import { Request, Response, NextFunction } from 'express';
import { createLogger } from '@textmesh/logger';

const logger = createLogger('media-error-handler');

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  // Log error
  if (statusCode >= 500) {
    logger.error('Server error', {
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
      body: req.body,
    });
  } else {
    logger.warn('Client error', {
      error: err.message,
      path: req.path,
      method: req.method,
      statusCode,
    });
  }

  // Multer errors
  if (err.name === 'MulterError') {
    const multerMessages: Record<string, string> = {
      LIMIT_FILE_SIZE: 'File too large',
      LIMIT_FILE_COUNT: 'Too many files',
      LIMIT_UNEXPECTED_FILE: 'Unexpected file field',
    };

    res.status(400).json({
      error: multerMessages[(err as any).code] || 'Upload error',
      code: (err as any).code,
    });
    return;
  }

  // Send response
  res.status(statusCode).json({
    error: message,
    ...(err.code && { code: err.code }),
    ...(process.env.NODE_ENV === 'development' && err.stack && { stack: err.stack }),
  });
}
