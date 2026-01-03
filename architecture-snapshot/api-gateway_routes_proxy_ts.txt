// =================================
// PROXY ROUTES TO BACKEND SERVICES
// =================================

import { Router, Request, Response, NextFunction } from 'express';
import { createProxyMiddleware, Options } from 'http-proxy-middleware';

type ServiceName = 'auth' | 'user' | 'post' | 'feed' | 'group' | 'notification' | 'moderation' | 'search';

const serviceUrls: Record<ServiceName, string> = {
  auth: process.env['AUTH_SERVICE_URL'] || 'http://localhost:3001',
  user: process.env['USER_SERVICE_URL'] || 'http://localhost:3002',
  post: process.env['POST_SERVICE_URL'] || 'http://localhost:3003',
  feed: process.env['FEED_SERVICE_URL'] || 'http://localhost:3004',
  group: process.env['GROUP_SERVICE_URL'] || 'http://localhost:3005',
  notification: process.env['NOTIFICATION_SERVICE_URL'] || 'http://localhost:3006',
  moderation: process.env['MODERATION_SERVICE_URL'] || 'http://localhost:3007',
  search: process.env['SEARCH_SERVICE_URL'] || 'http://localhost:3008',
};

export function createProxyRoutes(service: ServiceName): Router {
  const router = Router();
  const targetUrl = serviceUrls[service];

  const proxyOptions: Options = {
    target: targetUrl,
    changeOrigin: true,
    pathRewrite: (path) => {
      // Remove the service prefix from path
      // e.g., /api/v1/users/123 -> /123
      return path;
    },
    onProxyReq: (proxyReq, req) => {
      // Forward request ID
      proxyReq.setHeader('X-Request-ID', (req as Request).requestId);

      // Forward user info if authenticated
      const userId = (req as Request).headers['x-user-id'];
      const sessionId = (req as Request).headers['x-session-id'];
      const userRole = (req as Request).headers['x-user-role'];

      if (userId) proxyReq.setHeader('X-User-ID', userId as string);
      if (sessionId) proxyReq.setHeader('X-Session-ID', sessionId as string);
      if (userRole) proxyReq.setHeader('X-User-Role', userRole as string);

      // Log proxy request
      (req as Request).logger?.debug('Proxying request', {
        target: targetUrl,
        path: req.url,
        method: req.method,
      });
    },
    onProxyRes: (proxyRes, req) => {
      // Log proxy response
      (req as Request).logger?.debug('Proxy response received', {
        target: targetUrl,
        path: req.url,
        statusCode: proxyRes.statusCode,
      });
    },
    onError: (err, req, res) => {
      (req as Request).logger?.error('Proxy error', err);

      (res as Response).status(502).json({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: `Service ${service} is temporarily unavailable`,
        },
      });
    },
  };

  router.use('/', createProxyMiddleware(proxyOptions));

  return router;
}

// Direct HTTP client for internal service calls (alternative to proxy)
import http from 'http';
import https from 'https';

interface ServiceCallOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
}

export async function callService<T>(
  service: ServiceName,
  options: ServiceCallOptions
): Promise<{ statusCode: number; data: T }> {
  const baseUrl = serviceUrls[service];
  const url = new URL(options.path, baseUrl);
  const isHttps = url.protocol === 'https:';
  const client = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const requestOptions: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: options.method,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      timeout: options.timeout || 30000,
    };

    const req = client.request(requestOptions, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({
            statusCode: res.statusCode || 500,
            data: parsed,
          });
        } catch {
          resolve({
            statusCode: res.statusCode || 500,
            data: data as unknown as T,
          });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Service call to ${service} timed out`));
    });

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}
