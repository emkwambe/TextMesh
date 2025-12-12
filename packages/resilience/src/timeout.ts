/**
 * Timeout Handling
 *
 * Prevent operations from hanging indefinitely
 */

import { createLogger } from '@textmesh/logger';
import { TimeoutConfig } from './types';

const logger = createLogger({ service: 'timeout', level: 'info' });

/**
 * Execute a function with timeout
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  config: TimeoutConfig
): Promise<T> {
  const { timeout, fallback } = config;

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (fallback) {
        logger.warn('Operation timed out, using fallback', { timeout });
        resolve(fallback() as T);
      } else {
        reject(new TimeoutError(`Operation timed out after ${timeout}ms`));
      }
    }, timeout);

    fn()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * Timeout Error
 */
export class TimeoutError extends Error {
  public readonly timeout: number;

  constructor(message: string, timeout?: number) {
    super(message);
    this.name = 'TimeoutError';
    this.timeout = timeout || 0;
  }
}

/**
 * Decorator for adding timeout to class methods
 */
export function Timeout(config: TimeoutConfig) {
  return function (
    _target: unknown,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      return withTimeout(() => originalMethod.apply(this, args), config);
    };

    return descriptor;
  };
}

/**
 * Race multiple promises with timeout
 */
export async function raceWithTimeout<T>(
  promises: Promise<T>[],
  timeout: number
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new TimeoutError(`Race timed out after ${timeout}ms`));
    }, timeout);
  });

  return Promise.race([...promises, timeoutPromise]);
}

/**
 * Deadline-based timeout
 */
export class Deadline {
  private deadline: number;

  constructor(timeoutMs: number) {
    this.deadline = Date.now() + timeoutMs;
  }

  /**
   * Get remaining time in milliseconds
   */
  remaining(): number {
    return Math.max(0, this.deadline - Date.now());
  }

  /**
   * Check if deadline has passed
   */
  isExpired(): boolean {
    return Date.now() >= this.deadline;
  }

  /**
   * Execute with remaining time
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const remaining = this.remaining();

    if (remaining <= 0) {
      throw new TimeoutError('Deadline already expired');
    }

    return withTimeout(fn, { timeout: remaining });
  }

  /**
   * Create a child deadline with shorter timeout
   */
  child(maxMs: number): Deadline {
    const remaining = this.remaining();
    return new Deadline(Math.min(remaining, maxMs));
  }
}

/**
 * Adaptive timeout that adjusts based on historical performance
 */
export class AdaptiveTimeout {
  private samples: number[] = [];
  private maxSamples: number;
  private percentile: number;
  private minTimeout: number;
  private maxTimeout: number;

  constructor(options: {
    maxSamples?: number;
    percentile?: number;
    minTimeout?: number;
    maxTimeout?: number;
  } = {}) {
    this.maxSamples = options.maxSamples || 100;
    this.percentile = options.percentile || 0.99; // P99
    this.minTimeout = options.minTimeout || 100;
    this.maxTimeout = options.maxTimeout || 30000;
  }

  /**
   * Record a sample duration
   */
  record(duration: number): void {
    this.samples.push(duration);

    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
  }

  /**
   * Get recommended timeout based on historical data
   */
  getTimeout(): number {
    if (this.samples.length === 0) {
      return this.maxTimeout;
    }

    // Sort samples
    const sorted = [...this.samples].sort((a, b) => a - b);

    // Calculate percentile
    const index = Math.floor(sorted.length * this.percentile);
    const percentileValue = sorted[Math.min(index, sorted.length - 1)];

    // Add buffer (2x the percentile value)
    const recommended = percentileValue * 2;

    // Clamp to min/max
    return Math.min(this.maxTimeout, Math.max(this.minTimeout, recommended));
  }

  /**
   * Execute with adaptive timeout
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const timeout = this.getTimeout();
    const start = Date.now();

    try {
      const result = await withTimeout(fn, { timeout });
      this.record(Date.now() - start);
      return result;
    } catch (error) {
      if (error instanceof TimeoutError) {
        // Don't record timeouts
        throw error;
      }
      this.record(Date.now() - start);
      throw error;
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    samples: number;
    min: number;
    max: number;
    avg: number;
    p99: number;
    recommendedTimeout: number;
  } {
    if (this.samples.length === 0) {
      return {
        samples: 0,
        min: 0,
        max: 0,
        avg: 0,
        p99: 0,
        recommendedTimeout: this.maxTimeout,
      };
    }

    const sorted = [...this.samples].sort((a, b) => a - b);
    const sum = this.samples.reduce((a, b) => a + b, 0);
    const p99Index = Math.floor(sorted.length * 0.99);

    return {
      samples: this.samples.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sum / this.samples.length,
      p99: sorted[Math.min(p99Index, sorted.length - 1)],
      recommendedTimeout: this.getTimeout(),
    };
  }
}
