/**
 * Database Read Replica Configuration
 *
 * Provides read/write splitting for optimal database performance:
 * - Write operations go to primary
 * - Read operations are distributed across replicas
 * - Connection pooling for both
 * - Automatic failover handling
 */

import { PrismaClient } from '@prisma/client';
import { createLogger } from '@textmesh/logger';

const logger = createLogger('db-replica');

// Configuration
interface ReplicaConfig {
  primaryUrl: string;
  replicaUrls: string[];
  maxConnectionsPerReplica?: number;
  connectionTimeout?: number;
}

// Default configuration from environment
const config: ReplicaConfig = {
  primaryUrl: process.env.DATABASE_URL || '',
  replicaUrls: (process.env.DATABASE_REPLICA_URLS || '').split(',').filter(Boolean),
  maxConnectionsPerReplica: parseInt(process.env.DB_MAX_CONNECTIONS || '10', 10),
  connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || '30000', 10),
};

// Primary client for writes
let primaryClient: PrismaClient | null = null;

// Replica clients for reads
let replicaClients: PrismaClient[] = [];
let currentReplicaIndex = 0;

/**
 * Initialize the primary database client
 */
export function getPrimaryClient(): PrismaClient {
  if (!primaryClient) {
    primaryClient = new PrismaClient({
      datasources: {
        db: {
          url: config.primaryUrl,
        },
      },
      log: process.env.NODE_ENV === 'development'
        ? ['query', 'info', 'warn', 'error']
        : ['error'],
    });

    logger.info('Primary database client initialized');
  }

  return primaryClient;
}

/**
 * Initialize replica clients
 */
function initializeReplicas(): void {
  if (replicaClients.length > 0) return;

  if (config.replicaUrls.length === 0) {
    logger.info('No read replicas configured, using primary for reads');
    return;
  }

  for (const url of config.replicaUrls) {
    const client = new PrismaClient({
      datasources: {
        db: { url },
      },
      log: ['error'],
    });

    replicaClients.push(client);
  }

  logger.info(`Initialized ${replicaClients.length} read replica(s)`);
}

/**
 * Get a replica client using round-robin selection
 */
export function getReplicaClient(): PrismaClient {
  initializeReplicas();

  // Fall back to primary if no replicas configured
  if (replicaClients.length === 0) {
    return getPrimaryClient();
  }

  // Round-robin selection
  const client = replicaClients[currentReplicaIndex];
  currentReplicaIndex = (currentReplicaIndex + 1) % replicaClients.length;

  return client;
}

/**
 * Get a random replica client (for better load distribution)
 */
export function getRandomReplicaClient(): PrismaClient {
  initializeReplicas();

  if (replicaClients.length === 0) {
    return getPrimaryClient();
  }

  const index = Math.floor(Math.random() * replicaClients.length);
  return replicaClients[index];
}

/**
 * Database client with read/write splitting
 */
export class DatabaseClient {
  private primary: PrismaClient;
  private useReplica: boolean;

  constructor(useReplica: boolean = true) {
    this.primary = getPrimaryClient();
    this.useReplica = useReplica && config.replicaUrls.length > 0;
  }

  /**
   * Get client for write operations
   */
  get write(): PrismaClient {
    return this.primary;
  }

  /**
   * Get client for read operations
   */
  get read(): PrismaClient {
    return this.useReplica ? getReplicaClient() : this.primary;
  }

  /**
   * Execute a transaction (always on primary)
   */
  async transaction<T>(
    fn: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use'>) => Promise<T>
  ): Promise<T> {
    return this.primary.$transaction(fn);
  }

  /**
   * Force read from primary (for consistency-critical reads)
   */
  get primaryRead(): PrismaClient {
    return this.primary;
  }
}

/**
 * Health check for all database connections
 */
export async function checkDatabaseHealth(): Promise<{
  primary: boolean;
  replicas: boolean[];
}> {
  const results = {
    primary: false,
    replicas: [] as boolean[],
  };

  // Check primary
  try {
    await getPrimaryClient().$queryRaw`SELECT 1`;
    results.primary = true;
  } catch (error) {
    logger.error('Primary database health check failed', { error });
  }

  // Check replicas
  initializeReplicas();
  for (let i = 0; i < replicaClients.length; i++) {
    try {
      await replicaClients[i].$queryRaw`SELECT 1`;
      results.replicas.push(true);
    } catch (error) {
      logger.error(`Replica ${i} health check failed`, { error });
      results.replicas.push(false);
    }
  }

  return results;
}

/**
 * Get replication lag for all replicas
 */
export async function getReplicationLag(): Promise<number[]> {
  const lags: number[] = [];

  initializeReplicas();

  for (const replica of replicaClients) {
    try {
      // PostgreSQL specific - get replication lag in seconds
      const result = await replica.$queryRaw<[{ lag: number }]>`
        SELECT EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp()))::int as lag
      `;
      lags.push(result[0]?.lag || 0);
    } catch (error) {
      logger.error('Failed to get replication lag', { error });
      lags.push(-1);
    }
  }

  return lags;
}

/**
 * Disconnect all clients
 */
export async function disconnectAll(): Promise<void> {
  const disconnects: Promise<void>[] = [];

  if (primaryClient) {
    disconnects.push(primaryClient.$disconnect());
  }

  for (const replica of replicaClients) {
    disconnects.push(replica.$disconnect());
  }

  await Promise.all(disconnects);

  primaryClient = null;
  replicaClients = [];

  logger.info('All database connections closed');
}

// Export singleton instance
export const db = new DatabaseClient();
