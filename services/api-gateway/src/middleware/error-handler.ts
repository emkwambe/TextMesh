// =================================
// ERROR HANDLING MIDDLEWARE
// =================================

import { Request, Response, NextFunction } from 'express';
import { ErrorCode, ERROR_MESSAGES, ERROR_STATUS_CODES, AppError } from '@textmesh/shared-types';
import { ZodError } from 'zod';

interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta?: {
    requestId: string;
    timestamp: string;
  };
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Handle case where logger is not attached to request
  if (req.logger) {
    req.logger.error('Request error', err);
  } else {
    console.error('Request error (no logger):', err);
  }

  const response: ErrorResponse = {
    success: false,
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: 'An unexpected error occurred',
    },
    meta: {
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    },
  };

  let statusCode = 500;

  // Handle AppError (custom application errors)
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    response.error = {
      code: err.code,
      message: err.message,
      details: err.details,
    };
  }
  // Handle Zod validation errors
  else if (err instanceof ZodError) {
    statusCode = 400;
    response.error = {
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Validation failed',
      details: {
        errors: err.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
          code: e.code,
        })),
      },
    };
  }
  // Handle JWT errors
  else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    response.error = {
      code: ErrorCode.INVALID_TOKEN,
      message: ERROR_MESSAGES[ErrorCode.INVALID_TOKEN],
    };
  }
  else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    response.error = {
      code: ErrorCode.TOKEN_EXPIRED,
      message: ERROR_MESSAGES[ErrorCode.TOKEN_EXPIRED],
    };
  }
  // Handle syntax errors (malformed JSON)
  else if (err instanceof SyntaxError && 'body' in err) {
    statusCode = 400;
    response.error = {
      code: ErrorCode.BAD_REQUEST,
      message: 'Invalid JSON in request body',
    };
  }
  // Handle known error codes
  else if ('code' in err && typeof err.code === 'string' && err.code in ERROR_STATUS_CODES) {
    const errorCode = err.code as ErrorCode;
    statusCode = ERROR_STATUS_CODES[errorCode];
    response.error = {
      code: errorCode,
      message: err.message || ERROR_MESSAGES[errorCode],
    };
  }

  // Don't expose internal error details in production
  if (process.env['NODE_ENV'] === 'production' && statusCode === 500) {
    response.error = {
      code: ErrorCode.INTERNAL_ERROR,
      message: 'An unexpected error occurred',
    };
  }

  res.status(statusCode).json(response);
}

// Async error wrapper
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Not found handler
export function notFoundHandler(
  req: Request,
  res: Response
): void {
  res.status(404).json({
    success: false,
    error: {
      code: ErrorCode.NOT_FOUND,
      message: `Route ${req.method} ${req.path} not found`,
    },
    meta: {
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    },
  });
}
