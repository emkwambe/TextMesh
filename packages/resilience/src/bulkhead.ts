/**
 * Bulkhead Pattern
 *
 * Isolates different parts of the system to prevent cascading failures
 */

import { createLogger } from '@textmesh/logger';
import { BulkheadConfig } from './types';

const logger = createLogger({ service: 'bulkhead', level: 'info' });

const DEFAULT_CONFIG: BulkheadConfig = {
  maxConcurrent: 10,
  maxQueue: 100,
  queueTimeout: 30000,
};

interface QueuedRequest<T> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  enqueuedAt: number;
}

export class Bulkhead {
  private config: BulkheadConfig;
  private active: number = 0;
  private queue: QueuedRequest<unknown>[] = [];
  private name: string;

  constructor(name: string, config: Partial<BulkheadConfig> = {}) {
    this.name = name;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute a function within the bulkhead
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if we can execute immediately
    if (this.active < this.config.maxConcurrent) {
      return this.executeImmediately(fn);
    }

    // Check if queue is full
    if (this.queue.length >= this.config.maxQueue) {
      throw new BulkheadError(
        `Bulkhead '${this.name}' queue is full`,
        this.getStatus()
      );
    }

    // Queue the request
    return this.enqueue(fn);
  }

  /**
   * Execute immediately
   */
  private async executeImmediately<T>(fn: () => Promise<T>): Promise<T> {
    this.active++;

    try {
      return await fn();
    } finally {
      this.active--;
      this.processQueue();
    }
  }

  /**
   * Enqueue a request
   */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const request: QueuedRequest<T> = {
        fn,
        resolve,
        reject,
        enqueuedAt: Date.now(),
      };

      this.queue.push(request as QueuedRequest<unknown>);

      // Set up timeout
      setTimeout(() => {
        const index = this.queue.indexOf(request as QueuedRequest<unknown>);
        if (index !== -1) {
          this.queue.splice(index, 1);
          reject(
            new BulkheadError(
              `Bulkhead '${this.name}' queue timeout`,
              this.getStatus()
            )
          );
        }
      }, this.config.queueTimeout);
    });
  }

  /**
   * Process queued requests
   */
  private processQueue(): void {
    while (
      this.active < this.config.maxConcurrent &&
      this.queue.length > 0
    ) {
      const request = this.queue.shift()!;

      // Check if request has expired
      if (Date.now() - request.enqueuedAt > this.config.queueTimeout) {
        request.reject(
          new BulkheadError(
            `Bulkhead '${this.name}' queue timeout`,
            this.getStatus()
          )
        );
        continue;
      }

      this.active++;

      request
        .fn()
        .then(request.resolve)
        .catch(request.reject)
        .finally(() => {
          this.active--;
          this.processQueue();
        });
    }
  }

  /**
   * Get current status
   */
  getStatus(): BulkheadStatus {
    return {
      name: this.name,
      active: this.active,
      queued: this.queue.length,
      maxConcurrent: this.config.maxConcurrent,
      maxQueue: this.config.maxQueue,
      available: this.config.maxConcurrent - this.active,
      queueAvailable: this.config.maxQueue - this.queue.length,
    };
  }

  /**
   * Check if bulkhead has capacity
   */
  hasCapacity(): boolean {
    return (
      this.active < this.config.maxConcurrent ||
      this.queue.length < this.config.maxQueue
    );
  }

  /**
   * Clear the queue
   */
  clearQueue(): number {
    const cleared = this.queue.length;

    for (const request of this.queue) {
      request.reject(
        new BulkheadError(
          `Bulkhead '${this.name}' queue cleared`,
          this.getStatus()
        )
      );
    }

    this.queue = [];
    return cleared;
  }
}

export interface BulkheadStatus {
  name: string;
  active: number;
  queued: number;
  maxConcurrent: number;
  maxQueue: number;
  available: number;
  queueAvailable: number;
}

export class BulkheadError extends Error {
  public readonly status: BulkheadStatus;

  constructor(message: string, status: BulkheadStatus) {
    super(message);
    this.name = 'BulkheadError';
    this.status = status;
  }
}

/**
 * Bulkhead Registry
 */
export class BulkheadRegistry {
  private bulkheads: Map<string, Bulkhead> = new Map();
  private defaultConfig: Partial<BulkheadConfig>;

  constructor(defaultConfig: Partial<BulkheadConfig> = {}) {
    this.defaultConfig = defaultConfig;
  }

  /**
   * Get or create a bulkhead
   */
  get(name: string, config?: Partial<BulkheadConfig>): Bulkhead {
    let bulkhead = this.bulkheads.get(name);

    if (!bulkhead) {
      bulkhead = new Bulkhead(name, {
        ...this.defaultConfig,
        ...config,
      });
      this.bulkheads.set(name, bulkhead);
    }

    return bulkhead;
  }

  /**
   * Get all bulkhead statuses
   */
  getAllStatus(): Map<string, BulkheadStatus> {
    const statuses = new Map<string, BulkheadStatus>();

    for (const [name, bulkhead] of this.bulkheads) {
      statuses.set(name, bulkhead.getStatus());
    }

    return statuses;
  }

  /**
   * Get overloaded bulkheads
   */
  getOverloaded(): string[] {
    const overloaded: string[] = [];

    for (const [name, bulkhead] of this.bulkheads) {
      if (!bulkhead.hasCapacity()) {
        overloaded.push(name);
      }
    }

    return overloaded;
  }
}

export const bulkheadRegistry = new BulkheadRegistry();
