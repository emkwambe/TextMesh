// =================================
// REQUEST VALIDATION MIDDLEWARE
// =================================

import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';
import { ErrorCode } from '@textmesh/shared-types';

export function validateRequest(schema: z.ZodType) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
          code: e.code,
        }));

        res.status(400).json({
          success: false,
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Validation failed',
            details: { errors },
          },
        });
        return;
      }
      next(error);
    }
  };
}

// Validate query parameters
export function validateQuery(schema: z.ZodType) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      req.query = await schema.parseAsync(req.query);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Invalid query parameters',
            details: {
              errors: error.errors.map((e) => ({
                field: e.path.join('.'),
                message: e.message,
              })),
            },
          },
        });
        return;
      }
      next(error);
    }
  };
}

// Validate path parameters
export function validateParams(schema: z.ZodType) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      req.params = await schema.parseAsync(req.params);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Invalid path parameters',
            details: {
              errors: error.errors.map((e) => ({
                field: e.path.join('.'),
                message: e.message,
              })),
            },
          },
        });
        return;
      }
      next(error);
    }
  };
}

// Common validation schemas
export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid ID format'),
});
