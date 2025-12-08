// =================================
// VALIDATION MIDDLEWARE
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
        res.status(400).json({
          success: false,
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Validation failed',
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
