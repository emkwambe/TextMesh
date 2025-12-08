/**
 * Connection Pool Manager
 *
 * Manages database connection pools with:
 * - Adaptive pool sizing
 * - Connection health monitoring
 * - Automatic recovery
 * - Metrics collection
 */

import { PrismaClient } from '@prisma/client';
import { createLogger } from '@textmesh/logger';
import { redis } from './redis';

const logger = createLogger('connection-pool');

interface PoolMetrics {
  activeConnections: number;
  idleConnections: number;
  waitingRequests: number;
  totalConnections: number;
  maxConnections: number;
}

interface PoolConfig {
  minConnections: number;
  maxConnections: number;
  connectionTimeout: number;
  idleTimeout: number;
  acquireTimeout: number;
}

const defaultConfig: PoolConfig = {
  minConnections: 5,
  maxConnections: parseInt(process.env.DB_POOL_SIZE || '20', 10),
  connectionTimeout: 30000,
  idleTimeout: 60000,
  acquireTimeout: 10000,
};

/**
 * Connection pool wrapper with monitoring
 */
export class ConnectionPool {
  private client: PrismaClient;
  private config: PoolConfig;
  private metrics: PoolMetrics;
  private healthCheckInterval?: NodeJS.Timer;

  constructor(databaseUrl: string, config: Partial<PoolConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
    this.metrics = {
      activeConnections: 0,
      idleConnections: 0,
      waitingRequests: 0,
      totalConnections: 0,
      maxConnections: this.config.maxConnections,
    };

    // Build connection string with pool settings
    const url = new URL(databaseUrl);
    url.searchParams.set('connection_limit', this.config.maxConnections.toString());
    url.searchParams.set('pool_timeout', (this.config.acquireTimeout / 1000).toString());
    url.searchParams.set('connect_timeout', (this.config.connectionTimeout / 1000).toString());

    this.client = new PrismaClient({
      datasources: {
        db: { url: url.toString() },
      },
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
      ],
    });

    // Setup event listeners for monitoring
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // @ts-ignore - Prisma event types
    this.client.$on('query', (e: any) => {
      // Track slow queries
      if (e.duration > 1000) {
        logger.warn('Slow query detected', {
          query: e.query.substring(0, 200),
          duration: e.duration,
        });
      }
    });

    // @ts-ignore
    this.client.$on('error', (e: any) => {
      logger.error('Database error', { error: e.message });
    });
  }

  /**
   * Get the Prisma client
   */
  getClient(): PrismaClient {
    return this.client;
  }

  /**
   * Connect to the database
   */
  async connect(): Promise<void> {
    await this.client.$connect();
    logger.info('Connection pool connected', {
      maxConnections: this.config.maxConnections,
    });

    // Start health check
    this.startHealthCheck();
  }

  /**
   * Disconnect from the database
   */
  async disconnect(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    await this.client.$disconnect();
    logger.info('Connection pool disconnected');
  }

  /**
   * Get pool metrics
   */
  getMetrics(): PoolMetrics {
    return { ...this.metrics };
  }

  /**
   * Start periodic health checks
   */
  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        const start = Date.now();
        await this.client.$queryRaw`SELECT 1`;
        const latency = Date.now() - start;

        // Store metrics in Redis for monitoring
        await redis.hset('db:pool:metrics', {
          latency: latency.toString(),
          lastCheck: new Date().toISOString(),
          status: 'healthy',
        });

        // Log if latency is high
        if (latency > 100) {
          logger.warn('High database latency', { latency });
        }
      } catch (error) {
        logger.error('Database health check failed', { error });

        await redis.hset('db:pool:metrics', {
          lastCheck: new Date().toISOString(),
          status: 'unhealthy',
          error: (error as Error).message,
        });
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Execute with retry logic
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        // Check if error is retryable
        const isRetryable = this.isRetryableError(error);

        if (!isRetryable || attempt === maxRetries) {
          throw error;
        }

        // Exponential backoff
        const delay = baseDelay * Math.pow(2, attempt - 1);
        logger.warn('Retrying database operation', {
          attempt,
          maxRetries,
          delay,
          error: (error as Error).message,
        });

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: any): boolean {
    const retryableErrors = [
      'P1001', // Can't reach database server
      'P1002', // Database timeout
      'P1008', // Operations timed out
      'P1017', // Server closed the connection
    ];

    return retryableErrors.includes(error.code);
  }
}

// Factory function to create connection pools
export function createConnectionPool(
  databaseUrl: string,
  config?: Partial<PoolConfig>
): ConnectionPool {
  return new ConnectionPool(databaseUrl, config);
}

// Global pool instance
let globalPool: ConnectionPool | null = null;

export function getGlobalPool(): ConnectionPool {
  if (!globalPool) {
    globalPool = new ConnectionPool(
      process.env.DATABASE_URL || ''
    );
  }
  return globalPool;
}
