// =================================
// PREVIEW ROUTES
// Preview posts before posting
// =================================

import { Router, Request, Response } from 'express';
import { PrismaClient, PostStyle, PostEmphasis } from '@prisma/client';
import { Logger } from '@textmesh/logger';
import { TemplateManager } from '../templates/TemplateManager.js';
import { validateRequest } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { z } from 'zod';

const previewSchema = z.object({
  body: z.object({
    content: z.string().min(1, 'Content is required').max(1000, 'Content too long'),
    style: z.nativeEnum(PostStyle).optional(),
    emphasis: z.nativeEnum(PostEmphasis).optional(),
    template: z.string().uuid().optional(),
  }),
});

export function previewRoutes(
  prisma: PrismaClient,
  logger: Logger
): Router {
  const router = Router();
  const templateManager = new TemplateManager(prisma, logger);

  // POST /preview
  router.post(
    '/',
    validateRequest(previewSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const { content, style, emphasis, template: templateId } = req.body;

      let renderedContent = content;
      let warnings: string[] = [];

      // Apply template if provided
      if (templateId) {
        const template = await templateManager.getTemplateById(templateId);
        if (!template) {
          res.status(404).json({
            success: false,
            error: { code: 'TEMPLATE_NOT_FOUND', message: 'Template not found' }
          });
          return;
        }
        renderedContent = templateManager.applyTemplate(content, template);
      }

      // Check content length warnings
      if (renderedContent.length > 800) {
        warnings.push('Content is quite long. Consider breaking it into multiple posts.');
      }

      if (renderedContent.length < 10) {
        warnings.push('Very short content. Consider adding more context.');
      }

      // Check for external links
      const linkCount = (renderedContent.match(/https?:\/\//g) || []).length;
      if (linkCount > 2) {
        warnings.push('Multiple external links detected. Ensure you provide context.');
      }

      res.json({
        success: true,
        data: {
          renderedContent,
          estimatedLength: renderedContent.length,
          style: style || PostStyle.DEFAULT,
          emphasis: emphasis || PostEmphasis.NONE,
          warnings: warnings.length > 0 ? warnings : undefined
        }
      });
    })
  );

  return router;
}
