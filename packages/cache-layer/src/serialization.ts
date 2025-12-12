/**
 * Cache Serialization
 *
 * Efficient serialization with optional compression
 */

import msgpack from 'msgpack-lite';
import { createLogger } from '@textmesh/logger';
import zlib from 'zlib';
import { promisify } from 'util';

const logger = createLogger({ service: 'cache-serialization', level: 'info' });

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

// Magic bytes to identify compressed data
const COMPRESSED_PREFIX = Buffer.from([0x1f, 0x8b]);

export type SerializationFormat = 'json' | 'msgpack';

export interface SerializationOptions {
  format: SerializationFormat;
  compress: boolean;
  compressionThreshold: number;
}

const defaultOptions: SerializationOptions = {
  format: 'msgpack',
  compress: true,
  compressionThreshold: 1024, // 1KB
};

export class CacheSerializer {
  private options: SerializationOptions;

  constructor(options: Partial<SerializationOptions> = {}) {
    this.options = { ...defaultOptions, ...options };
  }

  /**
   * Serialize value to buffer/string
   */
  async serialize<T>(value: T): Promise<Buffer | string> {
    let serialized: Buffer;

    if (this.options.format === 'msgpack') {
      serialized = msgpack.encode(value);
    } else {
      serialized = Buffer.from(JSON.stringify(value));
    }

    // Compress if above threshold
    if (
      this.options.compress &&
      serialized.length > this.options.compressionThreshold
    ) {
      try {
        const compressed = await gzip(serialized);
        logger.debug('Compressed cache value', {
          original: serialized.length,
          compressed: compressed.length,
          ratio: (compressed.length / serialized.length).toFixed(2),
        });
        return compressed;
      } catch (error) {
        logger.warn('Compression failed, using uncompressed', { error });
      }
    }

    return serialized;
  }

  /**
   * Deserialize buffer/string to value
   */
  async deserialize<T>(data: Buffer | string): Promise<T> {
    let buffer = typeof data === 'string' ? Buffer.from(data) : data;

    // Check if compressed (gzip magic bytes)
    if (
      buffer.length >= 2 &&
      buffer[0] === COMPRESSED_PREFIX[0] &&
      buffer[1] === COMPRESSED_PREFIX[1]
    ) {
      try {
        buffer = await gunzip(buffer);
      } catch (error) {
        logger.warn('Decompression failed', { error });
        throw error;
      }
    }

    if (this.options.format === 'msgpack') {
      return msgpack.decode(buffer) as T;
    } else {
      return JSON.parse(buffer.toString()) as T;
    }
  }

  /**
   * Serialize for Redis (returns string)
   */
  async serializeForRedis<T>(value: T): Promise<string> {
    const serialized = await this.serialize(value);
    if (Buffer.isBuffer(serialized)) {
      return serialized.toString('base64');
    }
    return serialized;
  }

  /**
   * Deserialize from Redis
   */
  async deserializeFromRedis<T>(data: string): Promise<T> {
    // Try to detect if it's base64 encoded
    const buffer = Buffer.from(data, 'base64');

    // Check if it's valid base64 by re-encoding
    if (buffer.toString('base64') === data) {
      return this.deserialize<T>(buffer);
    }

    // It's a plain string (JSON)
    return this.deserialize<T>(data);
  }

  /**
   * Get serialized size estimate
   */
  getSerializedSize<T>(value: T): number {
    if (this.options.format === 'msgpack') {
      return msgpack.encode(value).length;
    }
    return Buffer.byteLength(JSON.stringify(value));
  }

  /**
   * Check if value can be serialized
   */
  canSerialize(value: unknown): boolean {
    try {
      if (this.options.format === 'msgpack') {
        msgpack.encode(value);
      } else {
        JSON.stringify(value);
      }
      return true;
    } catch {
      return false;
    }
  }
}

export const cacheSerializer = new CacheSerializer();
