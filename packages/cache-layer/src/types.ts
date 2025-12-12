/**
 * Cache Layer Types
 */

export interface CacheConfig {
  l1: {
    enabled: boolean;
    maxSize: number;
    ttl: number;
  };
  l2: {
    enabled: boolean;
    ttl: number;
    prefix: string;
  };
  serialization: 'json' | 'msgpack';
  compression: boolean;
  compressionThreshold: number;
}

export interface CacheEntry<T> {
  value: T;
  createdAt: number;
  expiresAt: number;
  tags?: string[];
  version?: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  l1Hits: number;
  l2Hits: number;
  writes: number;
  deletes: number;
  hitRate: number;
  avgLatency: number;
}

export interface CacheOptions {
  ttl?: number;
  tags?: string[];
  l1Only?: boolean;
  l2Only?: boolean;
  skipL1?: boolean;
  version?: number;
}

export interface WarmingStrategy {
  pattern: string;
  fetcher: () => Promise<Array<{ key: string; value: unknown }>>;
  schedule?: string;
  priority?: number;
}

export interface InvalidationRule {
  pattern: string | RegExp;
  tags?: string[];
  cascade?: boolean;
}
