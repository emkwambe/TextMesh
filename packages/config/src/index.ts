// =================================
// TEXTMESH CONFIGURATION
// =================================

import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';
import path from 'path';

// Load environment variables
dotenvConfig({ path: path.resolve(process.cwd(), '.env') });

// Base configuration schema
const baseConfigSchema = z.object({
  nodeEnv: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

// Database configuration schema
const databaseConfigSchema = z.object({
  url: z.string().url(),
  poolMin: z.coerce.number().min(1).default(2),
  poolMax: z.coerce.number().min(1).default(10),
  ssl: z.coerce.boolean().default(false),
});

// Redis configuration schema
const redisConfigSchema = z.object({
  url: z.string().default('redis://localhost:6379'),
  password: z.string().optional(),
  tls: z.coerce.boolean().default(false),
});

// Kafka configuration schema
const kafkaConfigSchema = z.object({
  brokers: z.string().transform((val) => val.split(',')),
  clientId: z.string().default('textmesh'),
  groupId: z.string().default('textmesh-group'),
  ssl: z.coerce.boolean().default(false),
});

// Elasticsearch configuration schema
const elasticsearchConfigSchema = z.object({
  url: z.string().default('http://localhost:9200'),
  username: z.string().optional(),
  password: z.string().optional(),
});

// JWT configuration schema
const jwtConfigSchema = z.object({
  secret: z.string().min(32),
  accessTokenExpiry: z.string().default('15m'),
  refreshTokenExpiry: z.string().default('7d'),
  issuer: z.string().default('textmesh'),
});

// OAuth configuration schema
const oauthConfigSchema = z.object({
  google: z.object({
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
  }).optional(),
  apple: z.object({
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
    teamId: z.string().optional(),
    keyId: z.string().optional(),
  }).optional(),
});

// Push notification configuration schema
const pushConfigSchema = z.object({
  fcm: z.object({
    serverKey: z.string().optional(),
    projectId: z.string().optional(),
  }).optional(),
  apns: z.object({
    keyId: z.string().optional(),
    teamId: z.string().optional(),
    bundleId: z.string().optional(),
  }).optional(),
});

// S3/Object storage configuration schema
const storageConfigSchema = z.object({
  bucket: z.string().default('textmesh-media'),
  region: z.string().default('us-east-1'),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
  endpoint: z.string().optional(),
});

// Rate limiting configuration schema
const rateLimitConfigSchema = z.object({
  windowMs: z.coerce.number().default(60000),
  maxRequests: z.coerce.number().default(100),
});

// Security configuration schema
const securityConfigSchema = z.object({
  corsOrigins: z.string().transform((val) => val.split(',')).default('http://localhost:3000'),
  encryptionKey: z.string().min(32).optional(),
});

// Compliance configuration schema
const complianceConfigSchema = z.object({
  gdprDataRetentionDays: z.coerce.number().default(365),
  enableAuditLogging: z.coerce.boolean().default(true),
});

// Service-specific configuration schemas
export const apiGatewayConfigSchema = z.object({
  base: baseConfigSchema,
  port: z.coerce.number().default(8080),
  host: z.string().default('0.0.0.0'),
  redis: redisConfigSchema,
  jwt: jwtConfigSchema,
  rateLimit: rateLimitConfigSchema,
  security: securityConfigSchema,
  services: z.object({
    auth: z.string().default('http://auth-service:3001'),
    user: z.string().default('http://user-service:3002'),
    post: z.string().default('http://post-service:3003'),
    feed: z.string().default('http://feed-service:3004'),
    group: z.string().default('http://group-service:3005'),
    notification: z.string().default('http://notification-service:3006'),
    moderation: z.string().default('http://moderation-service:3007'),
    search: z.string().default('http://search-service:3008'),
  }),
});

export const authServiceConfigSchema = z.object({
  base: baseConfigSchema,
  port: z.coerce.number().default(3001),
  database: databaseConfigSchema,
  redis: redisConfigSchema,
  jwt: jwtConfigSchema,
  oauth: oauthConfigSchema,
  kafka: kafkaConfigSchema,
  compliance: complianceConfigSchema,
});

export const userServiceConfigSchema = z.object({
  base: baseConfigSchema,
  port: z.coerce.number().default(3002),
  database: databaseConfigSchema,
  redis: redisConfigSchema,
  kafka: kafkaConfigSchema,
  storage: storageConfigSchema,
  compliance: complianceConfigSchema,
});

export const postServiceConfigSchema = z.object({
  base: baseConfigSchema,
  port: z.coerce.number().default(3003),
  database: databaseConfigSchema,
  redis: redisConfigSchema,
  kafka: kafkaConfigSchema,
  storage: storageConfigSchema,
});

export const feedServiceConfigSchema = z.object({
  base: baseConfigSchema,
  port: z.coerce.number().default(3004),
  database: databaseConfigSchema,
  redis: redisConfigSchema,
  kafka: kafkaConfigSchema,
});

export const groupServiceConfigSchema = z.object({
  base: baseConfigSchema,
  port: z.coerce.number().default(3005),
  database: databaseConfigSchema,
  redis: redisConfigSchema,
  kafka: kafkaConfigSchema,
});

export const notificationServiceConfigSchema = z.object({
  base: baseConfigSchema,
  port: z.coerce.number().default(3006),
  database: databaseConfigSchema,
  redis: redisConfigSchema,
  kafka: kafkaConfigSchema,
  push: pushConfigSchema,
});

export const moderationServiceConfigSchema = z.object({
  base: baseConfigSchema,
  port: z.coerce.number().default(3007),
  database: databaseConfigSchema,
  redis: redisConfigSchema,
  kafka: kafkaConfigSchema,
});

export const searchServiceConfigSchema = z.object({
  base: baseConfigSchema,
  port: z.coerce.number().default(3008),
  elasticsearch: elasticsearchConfigSchema,
  kafka: kafkaConfigSchema,
  redis: redisConfigSchema,
});

// Configuration types
export type BaseConfig = z.infer<typeof baseConfigSchema>;
export type DatabaseConfig = z.infer<typeof databaseConfigSchema>;
export type RedisConfig = z.infer<typeof redisConfigSchema>;
export type KafkaConfig = z.infer<typeof kafkaConfigSchema>;
export type JwtConfig = z.infer<typeof jwtConfigSchema>;
export type ApiGatewayConfig = z.infer<typeof apiGatewayConfigSchema>;
export type AuthServiceConfig = z.infer<typeof authServiceConfigSchema>;
export type UserServiceConfig = z.infer<typeof userServiceConfigSchema>;
export type PostServiceConfig = z.infer<typeof postServiceConfigSchema>;
export type FeedServiceConfig = z.infer<typeof feedServiceConfigSchema>;
export type GroupServiceConfig = z.infer<typeof groupServiceConfigSchema>;
export type NotificationServiceConfig = z.infer<typeof notificationServiceConfigSchema>;
export type ModerationServiceConfig = z.infer<typeof moderationServiceConfigSchema>;
export type SearchServiceConfig = z.infer<typeof searchServiceConfigSchema>;

// Helper function to load config from environment
export function loadConfig<T extends z.ZodType>(
  schema: T,
  envMapping: Record<string, string>
): z.infer<T> {
  const config: Record<string, unknown> = {};

  for (const [configKey, envKey] of Object.entries(envMapping)) {
    const value = process.env[envKey];
    if (value !== undefined) {
      setNestedValue(config, configKey, value);
    }
  }

  return schema.parse(config);
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]!;
    if (!(key in current)) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }

  const lastKey = keys[keys.length - 1]!;
  current[lastKey] = value;
}

// Environment variable mappings for each service
export const API_GATEWAY_ENV_MAPPING: Record<string, string> = {
  'base.nodeEnv': 'NODE_ENV',
  'base.logLevel': 'LOG_LEVEL',
  'port': 'API_GATEWAY_PORT',
  'host': 'API_GATEWAY_HOST',
  'redis.url': 'REDIS_URL',
  'redis.password': 'REDIS_PASSWORD',
  'jwt.secret': 'JWT_SECRET',
  'jwt.accessTokenExpiry': 'JWT_ACCESS_TOKEN_EXPIRY',
  'jwt.refreshTokenExpiry': 'JWT_REFRESH_TOKEN_EXPIRY',
  'jwt.issuer': 'JWT_ISSUER',
  'rateLimit.windowMs': 'RATE_LIMIT_WINDOW_MS',
  'rateLimit.maxRequests': 'RATE_LIMIT_MAX_REQUESTS',
  'security.corsOrigins': 'CORS_ORIGINS',
  'services.auth': 'AUTH_SERVICE_URL',
  'services.user': 'USER_SERVICE_URL',
  'services.post': 'POST_SERVICE_URL',
  'services.feed': 'FEED_SERVICE_URL',
  'services.group': 'GROUP_SERVICE_URL',
  'services.notification': 'NOTIFICATION_SERVICE_URL',
  'services.moderation': 'MODERATION_SERVICE_URL',
  'services.search': 'SEARCH_SERVICE_URL',
};

export const AUTH_SERVICE_ENV_MAPPING: Record<string, string> = {
  'base.nodeEnv': 'NODE_ENV',
  'base.logLevel': 'LOG_LEVEL',
  'port': 'AUTH_SERVICE_PORT',
  'database.url': 'DATABASE_URL',
  'database.poolMin': 'DATABASE_POOL_MIN',
  'database.poolMax': 'DATABASE_POOL_MAX',
  'redis.url': 'REDIS_URL',
  'redis.password': 'REDIS_PASSWORD',
  'jwt.secret': 'JWT_SECRET',
  'jwt.accessTokenExpiry': 'JWT_ACCESS_TOKEN_EXPIRY',
  'jwt.refreshTokenExpiry': 'JWT_REFRESH_TOKEN_EXPIRY',
  'jwt.issuer': 'JWT_ISSUER',
  'oauth.google.clientId': 'GOOGLE_CLIENT_ID',
  'oauth.google.clientSecret': 'GOOGLE_CLIENT_SECRET',
  'oauth.apple.clientId': 'APPLE_CLIENT_ID',
  'oauth.apple.clientSecret': 'APPLE_CLIENT_SECRET',
  'oauth.apple.teamId': 'APPLE_TEAM_ID',
  'oauth.apple.keyId': 'APPLE_KEY_ID',
  'kafka.brokers': 'KAFKA_BROKERS',
  'kafka.clientId': 'KAFKA_CLIENT_ID',
  'kafka.groupId': 'KAFKA_GROUP_ID',
  'compliance.gdprDataRetentionDays': 'GDPR_DATA_RETENTION_DAYS',
  'compliance.enableAuditLogging': 'ENABLE_AUDIT_LOGGING',
};

export const COMMON_SERVICE_ENV_MAPPING: Record<string, string> = {
  'base.nodeEnv': 'NODE_ENV',
  'base.logLevel': 'LOG_LEVEL',
  'database.url': 'DATABASE_URL',
  'database.poolMin': 'DATABASE_POOL_MIN',
  'database.poolMax': 'DATABASE_POOL_MAX',
  'redis.url': 'REDIS_URL',
  'redis.password': 'REDIS_PASSWORD',
  'kafka.brokers': 'KAFKA_BROKERS',
  'kafka.clientId': 'KAFKA_CLIENT_ID',
  'kafka.groupId': 'KAFKA_GROUP_ID',
};

export default {
  loadConfig,
  apiGatewayConfigSchema,
  authServiceConfigSchema,
  userServiceConfigSchema,
  postServiceConfigSchema,
  feedServiceConfigSchema,
  groupServiceConfigSchema,
  notificationServiceConfigSchema,
  moderationServiceConfigSchema,
  searchServiceConfigSchema,
};
