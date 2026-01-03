/**
 * Upload Routes
 *
 * Handles media upload endpoints:
 * - Direct file uploads
 * - Presigned URL generation
 * - Upload confirmation
 */

import { Router, Request, Response, NextFunction, IRouter } from 'express';
import multer from 'multer';
import { mediaService } from '../services/media.service';
import { createLogger } from '@textmesh/logger';

const logger = createLogger({ service: 'upload-routes' });
const router: IRouter = Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB max
    files: 10,
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/webm',
      'video/quicktime',
      'video/x-msvideo',
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}`));
    }
  },
});

// Middleware to get user from token (simplified - should use auth middleware)
const getUserId = (req: Request): string => {
  // In production, this would come from auth middleware
  return (req as any).user?.id || req.headers['x-user-id'] as string;
};

/**
 * POST /upload/image
 * Upload a single image
 */
router.post('/image', upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const type = (req.body.type as 'AVATAR' | 'BANNER' | 'POST' | 'MESSAGE') || 'POST';
    const metadata = req.body.metadata ? JSON.parse(req.body.metadata) : undefined;

    const media = await mediaService.uploadImage({
      userId,
      file: {
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      },
      type,
      metadata,
    });

    logger.info('Image uploaded', { mediaId: media.id, userId, type });

    res.status(201).json({ media });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /upload/images
 * Upload multiple images
 */
router.post('/images', upload.array('files', 10), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    const type = (req.body.type as 'POST' | 'MESSAGE') || 'POST';

    const results = await Promise.all(
      files.map((file) =>
        mediaService.uploadImage({
          userId,
          file: {
            buffer: file.buffer,
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
          },
          type,
        })
      )
    );

    logger.info('Multiple images uploaded', { count: results.length, userId });

    res.status(201).json({ media: results });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /upload/video
 * Upload a video
 */
router.post('/video', upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const metadata = req.body.metadata ? JSON.parse(req.body.metadata) : undefined;

    const media = await mediaService.uploadVideo({
      userId,
      file: {
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      },
      type: 'VIDEO',
      metadata,
    });

    logger.info('Video uploaded', { mediaId: media.id, userId });

    res.status(201).json({ media });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /upload/avatar
 * Upload user avatar
 */
router.post('/avatar', upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const media = await mediaService.uploadImage({
      userId,
      file: {
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      },
      type: 'AVATAR',
    });

    logger.info('Avatar uploaded', { mediaId: media.id, userId });

    res.status(201).json({ media });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /upload/banner
 * Upload user banner/cover image
 */
router.post('/banner', upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const media = await mediaService.uploadImage({
      userId,
      file: {
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      },
      type: 'BANNER',
    });

    logger.info('Banner uploaded', { mediaId: media.id, userId });

    res.status(201).json({ media });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /upload/presigned
 * Get a presigned URL for direct client upload
 */
router.post('/presigned', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { filename, contentType, contentLength } = req.body;

    if (!filename || !contentType) {
      return res.status(400).json({ error: 'filename and contentType required' });
    }

    const result = await mediaService.getPresignedUploadUrl(
      userId,
      filename,
      contentType,
      contentLength || 0
    );

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /upload/confirm/:uploadId
 * Confirm a presigned upload is complete
 */
router.post('/confirm/:uploadId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { uploadId } = req.params;
    const { type } = req.body;

    const media = await mediaService.confirmUpload(uploadId, type || 'POST');

    res.json({ media });
  } catch (error) {
    next(error);
  }
});

export default router;

