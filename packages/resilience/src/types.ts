/**
 * Resilience Types
 */

export interface RateLimitConfig {
  algorithm: 'token-bucket' | 'sliding-window' | 'fixed-window';
  limit: number;
  window: number; // in seconds
  keyPrefix?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number; // in milliseconds
  halfOpenLimit: number;
  resetTimeout: number; // in milliseconds
}

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerStatus {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure?: Date;
  lastSuccess?: Date;
  nextRetry?: Date;
}

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number; // in milliseconds
  maxDelay: number; // in milliseconds
  backoffMultiplier: number;
  jitter: boolean;
  retryableErrors?: string[];
}

export interface BulkheadConfig {
  maxConcurrent: number;
  maxQueue: number;
  queueTimeout: number; // in milliseconds
}

export interface TimeoutConfig {
  timeout: number; // in milliseconds
  fallback?: () => unknown;
}
