/**
 * Circuit Breaker
 *
 * Prevents cascading failures by stopping calls to failing services
 */

import { createLogger } from '@textmesh/logger';
import { CircuitBreakerConfig, CircuitState, CircuitBreakerStatus } from './types';

const logger = createLogger({ service: 'circuit-breaker', level: 'info' });

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000,
  halfOpenLimit: 3,
  resetTimeout: 60000,
};

export class CircuitBreaker {
  private config: CircuitBreakerConfig;
  private state: CircuitState = 'closed';
  private failures: number = 0;
  private successes: number = 0;
  private lastFailure?: Date;
  private lastSuccess?: Date;
  private nextRetry?: Date;
  private halfOpenCalls: number = 0;
  private name: string;

  constructor(name: string, config: Partial<CircuitBreakerConfig> = {}) {
    this.name = name;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.canExecute()) {
      throw new CircuitBreakerError(
        `Circuit breaker '${this.name}' is open`,
        this.getStatus()
      );
    }

    if (this.state === 'half-open') {
      this.halfOpenCalls++;
    }

    try {
      const result = await this.executeWithTimeout(fn);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error);
      throw error;
    }
  }

  /**
   * Check if execution is allowed
   */
  private canExecute(): boolean {
    switch (this.state) {
      case 'closed':
        return true;

      case 'open':
        if (this.nextRetry && new Date() >= this.nextRetry) {
          this.transitionTo('half-open');
          return true;
        }
        return false;

      case 'half-open':
        return this.halfOpenCalls < this.config.halfOpenLimit;

      default:
        return false;
    }
  }

  /**
   * Execute with timeout
   */
  private async executeWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Circuit breaker timeout after ${this.config.timeout}ms`));
      }, this.config.timeout);

      fn()
        .then((result) => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.lastSuccess = new Date();

    switch (this.state) {
      case 'half-open':
        this.successes++;
        if (this.successes >= this.config.successThreshold) {
          this.transitionTo('closed');
        }
        break;

      case 'closed':
        // Reset failure count on success
        this.failures = 0;
        break;
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(error: Error): void {
    this.lastFailure = new Date();
    this.failures++;

    logger.warn('Circuit breaker failure', {
      name: this.name,
      state: this.state,
      failures: this.failures,
      error: error.message,
    });

    switch (this.state) {
      case 'closed':
        if (this.failures >= this.config.failureThreshold) {
          this.transitionTo('open');
        }
        break;

      case 'half-open':
        this.transitionTo('open');
        break;
    }
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    logger.info('Circuit breaker state change', {
      name: this.name,
      from: oldState,
      to: newState,
    });

    switch (newState) {
      case 'open':
        this.nextRetry = new Date(Date.now() + this.config.resetTimeout);
        break;

      case 'half-open':
        this.halfOpenCalls = 0;
        this.successes = 0;
        break;

      case 'closed':
        this.failures = 0;
        this.successes = 0;
        this.halfOpenCalls = 0;
        this.nextRetry = undefined;
        break;
    }
  }

  /**
   * Get current status
   */
  getStatus(): CircuitBreakerStatus {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailure: this.lastFailure,
      lastSuccess: this.lastSuccess,
      nextRetry: this.nextRetry,
    };
  }

  /**
   * Force circuit to close
   */
  reset(): void {
    this.transitionTo('closed');
    logger.info('Circuit breaker manually reset', { name: this.name });
  }

  /**
   * Force circuit to open
   */
  trip(): void {
    this.transitionTo('open');
    logger.info('Circuit breaker manually tripped', { name: this.name });
  }
}

/**
 * Circuit Breaker Error
 */
export class CircuitBreakerError extends Error {
  public readonly status: CircuitBreakerStatus;

  constructor(message: string, status: CircuitBreakerStatus) {
    super(message);
    this.name = 'CircuitBreakerError';
    this.status = status;
  }
}

/**
 * Circuit Breaker Registry
 */
export class CircuitBreakerRegistry {
  private breakers: Map<string, CircuitBreaker> = new Map();
  private defaultConfig: Partial<CircuitBreakerConfig>;

  constructor(defaultConfig: Partial<CircuitBreakerConfig> = {}) {
    this.defaultConfig = defaultConfig;
  }

  /**
   * Get or create a circuit breaker
   */
  get(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    let breaker = this.breakers.get(name);

    if (!breaker) {
      breaker = new CircuitBreaker(name, {
        ...this.defaultConfig,
        ...config,
      });
      this.breakers.set(name, breaker);
    }

    return breaker;
  }

  /**
   * Get all circuit breaker statuses
   */
  getAllStatus(): Map<string, CircuitBreakerStatus> {
    const statuses = new Map<string, CircuitBreakerStatus>();

    for (const [name, breaker] of this.breakers) {
      statuses.set(name, breaker.getStatus());
    }

    return statuses;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Get unhealthy circuits
   */
  getUnhealthy(): string[] {
    const unhealthy: string[] = [];

    for (const [name, breaker] of this.breakers) {
      const status = breaker.getStatus();
      if (status.state !== 'closed') {
        unhealthy.push(name);
      }
    }

    return unhealthy;
  }
}

// Global registry
export const circuitBreakerRegistry = new CircuitBreakerRegistry();
