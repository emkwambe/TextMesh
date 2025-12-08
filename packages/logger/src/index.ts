// =================================
// TEXTMESH LOGGER
// =================================

import pino, { Logger as PinoLogger, LoggerOptions } from 'pino';

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

export interface LogContext {
  requestId?: string;
  userId?: string;
  service?: string;
  traceId?: string;
  spanId?: string;
  [key: string]: unknown;
}

export interface LoggerConfig {
  level?: LogLevel;
  service: string;
  environment?: string;
  pretty?: boolean;
}

const defaultConfig: Partial<LoggerConfig> = {
  level: 'info',
  environment: process.env['NODE_ENV'] || 'development',
  pretty: process.env['NODE_ENV'] !== 'production',
};

function createPinoConfig(config: LoggerConfig): LoggerOptions {
  const { level, service, environment, pretty } = { ...defaultConfig, ...config };

  const baseConfig: LoggerOptions = {
    level: level || 'info',
    base: {
      service,
      environment,
      pid: process.pid,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
      bindings: (bindings) => ({
        service: bindings['service'],
        environment: bindings['environment'],
        pid: bindings['pid'],
        hostname: bindings['hostname'],
      }),
    },
    redact: {
      paths: [
        'password',
        'token',
        'accessToken',
        'refreshToken',
        'authorization',
        'cookie',
        'email',
        'phone',
        '*.password',
        '*.token',
        '*.accessToken',
        '*.refreshToken',
      ],
      censor: '[REDACTED]',
    },
  };

  if (pretty) {
    return {
      ...baseConfig,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    };
  }

  return baseConfig;
}

export class Logger {
  private pino: PinoLogger;
  private context: LogContext;

  constructor(config: LoggerConfig, context: LogContext = {}) {
    this.pino = pino(createPinoConfig(config));
    this.context = { service: config.service, ...context };
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    const logData = {
      ...this.context,
      ...data,
    };
    this.pino[level](logData, message);
  }

  fatal(message: string, data?: Record<string, unknown>): void {
    this.log('fatal', message, data);
  }

  error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void {
    const errorData = error instanceof Error
      ? {
          error: {
            name: error.name,
            message: error.message,
            stack: error.stack,
          },
          ...data,
        }
      : { error, ...data };
    this.log('error', message, errorData);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data);
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data);
  }

  trace(message: string, data?: Record<string, unknown>): void {
    this.log('trace', message, data);
  }

  child(context: LogContext): Logger {
    const childLogger = new Logger({ service: this.context['service'] as string }, {
      ...this.context,
      ...context,
    });
    childLogger.pino = this.pino.child(context);
    return childLogger;
  }

  withRequestId(requestId: string): Logger {
    return this.child({ requestId });
  }

  withUserId(userId: string): Logger {
    return this.child({ userId });
  }

  withTracing(traceId: string, spanId: string): Logger {
    return this.child({ traceId, spanId });
  }

  // HTTP Request Logging
  logRequest(req: {
    method: string;
    url: string;
    headers?: Record<string, unknown>;
    query?: Record<string, unknown>;
    body?: unknown;
  }): void {
    this.info('Incoming request', {
      http: {
        method: req.method,
        url: req.url,
        headers: req.headers,
        query: req.query,
      },
    });
  }

  logResponse(res: {
    statusCode: number;
    duration: number;
    contentLength?: number;
  }): void {
    const level: LogLevel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    this.log(level, 'Request completed', {
      http: {
        statusCode: res.statusCode,
        duration: res.duration,
        contentLength: res.contentLength,
      },
    });
  }

  // Database Query Logging
  logQuery(query: string, duration: number, params?: unknown[]): void {
    this.debug('Database query', {
      database: {
        query,
        duration,
        params: params?.length,
      },
    });
  }

  // Event Logging
  logEvent(eventType: string, payload: Record<string, unknown>): void {
    this.info('Event processed', {
      event: {
        type: eventType,
        payload,
      },
    });
  }

  // Audit Logging
  audit(action: string, details: Record<string, unknown>): void {
    this.info('Audit log', {
      audit: {
        action,
        ...details,
        timestamp: new Date().toISOString(),
      },
    });
  }
}

// Factory function for creating loggers
export function createLogger(config: LoggerConfig): Logger {
  return new Logger(config);
}

// Singleton logger for simple use cases
let defaultLogger: Logger | null = null;

export function getLogger(service?: string): Logger {
  if (!defaultLogger) {
    defaultLogger = createLogger({
      service: service || 'textmesh',
      level: (process.env['LOG_LEVEL'] as LogLevel) || 'info',
    });
  }
  return defaultLogger;
}

export default Logger;
