// =================================
// EXPRESS APP CONFIGURATION
// =================================

import express, { Express, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { Logger } from '@textmesh/logger';
import { errorHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/request-logger.js';
import { authMiddleware } from './middleware/auth.js';
import { rateLimiter } from './middleware/rate-limiter.js';
import { createProxyRoutes } from './routes/proxy.js';
import { healthRoutes } from './routes/health.js';
import { v4 as uuidv4 } from 'uuid';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      userId?: string;
      sessionId?: string;
      logger: Logger;
    }
  }
}

export function createApp(logger: Logger): Express {
  const app = express();

  // Trust proxy for rate limiting behind load balancer
  app.set('trust proxy', 1);

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP for API
    crossOriginEmbedderPolicy: false,
  }));

  // CORS configuration
  const corsOrigins = process.env['CORS_ORIGINS']?.split(',') || ['http://localhost:3000'];
  app.use(cors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  }));

  // Compression
  app.use(compression());

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request ID and logger injection
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.requestId = (req.headers['x-request-id'] as string) || uuidv4();
    req.logger = logger.withRequestId(req.requestId);
    next();
  });

  // Request logging
  app.use(requestLogger);

  // Rate limiting
  app.use('/api', rateLimiter);

  // Health check routes (no auth required)
  app.use('/health', healthRoutes);

  // API version prefix
  const apiRouter = express.Router();

  // Public routes (no auth required)
  apiRouter.use('/auth', createProxyRoutes('auth'));

  // Protected routes (auth required)
  apiRouter.use('/users', authMiddleware, createProxyRoutes('user'));
  apiRouter.use('/posts', authMiddleware, createProxyRoutes('post'));
  apiRouter.use('/feed', authMiddleware, createProxyRoutes('feed'));
  apiRouter.use('/groups', authMiddleware, createProxyRoutes('group'));
  apiRouter.use('/notifications', authMiddleware, createProxyRoutes('notification'));
  apiRouter.use('/reports', authMiddleware, createProxyRoutes('moderation'));
  apiRouter.use('/search', authMiddleware, createProxyRoutes('search'));

  app.use('/api/v1', apiRouter);

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'The requested resource was not found',
      },
    });
  });

  // Error handler
  app.use(errorHandler);

  return app;
}
