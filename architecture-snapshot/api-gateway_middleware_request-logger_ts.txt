// =================================
// REQUEST LOGGING MIDDLEWARE
// =================================

import { Request, Response, NextFunction } from 'express';

export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const startTime = Date.now();

  // Log request
  req.logger.logRequest({
    method: req.method,
    url: req.originalUrl,
    headers: {
      'user-agent': req.headers['user-agent'],
      'content-type': req.headers['content-type'],
      'content-length': req.headers['content-length'],
    },
    query: req.query,
  });

  // Capture response
  const originalSend = res.send;
  let responseBody: unknown;

  res.send = function (body): Response {
    responseBody = body;
    return originalSend.call(this, body);
  };

  // Log response on finish
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const contentLength = res.getHeader('content-length');

    req.logger.logResponse({
      statusCode: res.statusCode,
      duration,
      contentLength: contentLength ? parseInt(contentLength as string, 10) : undefined,
    });

    // Log slow requests
    if (duration > 1000) {
      req.logger.warn('Slow request detected', {
        method: req.method,
        url: req.originalUrl,
        duration,
        statusCode: res.statusCode,
      });
    }

    // Log errors
    if (res.statusCode >= 500) {
      req.logger.error('Server error response', undefined, {
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        responseBody: typeof responseBody === 'string'
          ? responseBody.substring(0, 500)
          : undefined,
      });
    }
  });

  next();
}

// Audit logging for sensitive operations
export function auditLogger(action: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        req.logger.audit(action, {
          userId: req.userId,
          method: req.method,
          path: req.path,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
        });
      }
    });
    next();
  };
}
