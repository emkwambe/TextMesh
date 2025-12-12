/**
 * Retry with Exponential Backoff
 *
 * Automatically retry failed operations with configurable backoff
 */

import { createLogger } from '@textmesh/logger';
import { RetryConfig } from './types';

const logger = createLogger({ service: 'retry', level: 'info' });

const DEFAULT_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitter: true,
};

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const options = { ...DEFAULT_CONFIG, ...config };
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Check if error is retryable
      if (options.retryableErrors && options.retryableErrors.length > 0) {
        const isRetryable = options.retryableErrors.some(
          (errType) =>
            lastError?.name === errType ||
            lastError?.message.includes(errType)
        );

        if (!isRetryable) {
          throw error;
        }
      }

      // Don't wait on last attempt
      if (attempt === options.maxAttempts) {
        break;
      }

      const delay = calculateDelay(attempt, options);

      logger.warn('Retry attempt', {
        attempt,
        maxAttempts: options.maxAttempts,
        delay,
        error: lastError.message,
      });

      await sleep(delay);
    }
  }

  throw new RetryError(
    `All ${options.maxAttempts} retry attempts failed`,
    lastError!,
    options.maxAttempts
  );
}

/**
 * Calculate delay with exponential backoff and optional jitter
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  let delay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
  delay = Math.min(delay, config.maxDelay);

  if (config.jitter) {
    // Add random jitter up to 25%
    const jitter = delay * 0.25 * Math.random();
    delay = delay + jitter;
  }

  return Math.floor(delay);
}

/**
 * Sleep for a given duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry Error
 */
export class RetryError extends Error {
  public readonly lastError: Error;
  public readonly attempts: number;

  constructor(message: string, lastError: Error, attempts: number) {
    super(message);
    this.name = 'RetryError';
    this.lastError = lastError;
    this.attempts = attempts;
  }
}

/**
 * Decorator for retrying class methods
 */
export function Retry(config: Partial<RetryConfig> = {}) {
  return function (
    _target: unknown,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      return retry(() => originalMethod.apply(this, args), config);
    };

    return descriptor;
  };
}

/**
 * Retry with fallback
 */
export async function retryWithFallback<T>(
  fn: () => Promise<T>,
  fallback: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  try {
    return await retry(fn, config);
  } catch (error) {
    logger.warn('Primary function failed, using fallback', {
      error: (error as Error).message,
    });
    return fallback();
  }
}

/**
 * Retry multiple operations in parallel, failing fast if one fails
 */
export async function retryParallel<T>(
  fns: Array<() => Promise<T>>,
  config: Partial<RetryConfig> = {}
): Promise<T[]> {
  return Promise.all(fns.map((fn) => retry(fn, config)));
}

/**
 * Retry with circuit breaker integration
 */
export async function retryWithCircuitBreaker<T>(
  fn: () => Promise<T>,
  circuitBreaker: { execute: <T>(fn: () => Promise<T>) => Promise<T> },
  config: Partial<RetryConfig> = {}
): Promise<T> {
  return retry(() => circuitBreaker.execute(fn), config);
}
