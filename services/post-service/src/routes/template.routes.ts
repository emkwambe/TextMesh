// =================================
// TEMPLATE ROUTES
// Get available post templates
// =================================

import { Router, Request, Response } from 'express';
import { PrismaClient, PostStyle } from '@prisma/client';
import { Logger } from '@textmesh/logger';
import { TemplateManager } from '../templates/TemplateManager.js';
import { asyncHandler } from '../middleware/error-handler.js';

export function templateRoutes(
  prisma: PrismaClient,
  logger: Logger
): Router {
  const router = Router();
  const templateManager = new TemplateManager(prisma, logger);

  // GET /templates
  router.get(
    '/',
    asyncHandler(async (req: Request, res: Response) => {
      const { style } = req.query;

      // Validate style if provided
      let postStyle: PostStyle | undefined;
      if (style && typeof style === 'string') {
        if (Object.values(PostStyle).includes(style as PostStyle)) {
          postStyle = style as PostStyle;
        } else {
          res.status(400).json({
            success: false,
            error: { code: 'INVALID_STYLE', message: 'Invalid post style' }
          });
          return;
        }
      }

      const templates = await templateManager.getTemplates(postStyle);

      res.json({
        success: true,
        data: { templates }
      });
    })
  );

  // GET /templates/:id
  router.get(
    '/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const template = await templateManager.getTemplateById(req.params['id']!);

      if (!template) {
        res.status(404).json({
          success: false,
          error: { code: 'TEMPLATE_NOT_FOUND', message: 'Template not found' }
        });
        return;
      }

      res.json({
        success: true,
        data: { template }
      });
    })
  );

  return router;
}
