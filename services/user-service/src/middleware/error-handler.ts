// =================================
// ERROR HANDLER MIDDLEWARE
// =================================

import { Request, Response, NextFunction } from 'express';
import { ErrorCode, ERROR_STATUS_CODES, AppError } from '@textmesh/shared-types';
import { ZodError } from 'zod';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('Error:', err);

  let statusCode = 500;
  let errorResponse = {
    success: false,
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: 'An unexpected error occurred',
      details: undefined as any,
    },
  };

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    errorResponse.error = {
      code: err.code,
      message: err.message,
      details: err.details,
    };
  } else if (err instanceof ZodError) {
    statusCode = 400;
    errorResponse.error = {
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Validation failed',
      details: { errors: err.errors },
    };
  } else if ('code' in err && typeof err.code === 'string' && err.code in ERROR_STATUS_CODES) {
    const errorCode = err.code as ErrorCode;
    statusCode = ERROR_STATUS_CODES[errorCode];
    errorResponse.error = {
      code: errorCode,
      message: err.message,
      details: undefined,
    };
  }

  if (process.env['NODE_ENV'] === 'production' && statusCode === 500) {
    errorResponse.error = {
      code: ErrorCode.INTERNAL_ERROR,
      message: 'An unexpected error occurred',
      details: undefined,
    };
  }

  res.status(statusCode).json(errorResponse);
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
