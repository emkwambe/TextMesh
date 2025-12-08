/**
 * Request Logger Middleware
 */

import { Request, Response, NextFunction } from 'express';
import { createLogger } from '@textmesh/logger';

const logger = createLogger('media-http');

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 400 ? 'warn' : 'info';

    logger[level]('HTTP Request', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.get('user-agent'),
      ip: req.ip,
      userId: (req as any).user?.id,
      contentLength: res.get('content-length'),
    });
  });

  next();
}
