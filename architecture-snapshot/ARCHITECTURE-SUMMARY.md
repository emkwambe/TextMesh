# TextMesh Architecture Summary
Generated: 2026-01-02 02:20:20

## Project Type
- Monorepo with pnpm workspaces
- Turborepo for build orchestration
- Microservices architecture

## Services
- analytics-service
- api-gateway
- auth-service
- feed-service
- group-service
- growth-service
- media-service
- messaging-service
- moderation-service
- notification-service
- post-service
- ranking-service
- realtime-gateway
- search-service
- spam-filtering-service
- trust-safety-service
- user-service


## Shared Packages  
- ab-testing
- activity-feed
- admin-dashboard
- analytics
- api-client
- audit-logging
- brand-identity
- cache-layer
- cdn-client
- compliance
- config
- content-moderation
- content-quality
- db-client
- email-service
- engagement
- event-bus
- fraud-detection
- health-monitoring
- logger
- marketplace
- moderation-tools
- monetization
- push-notifications
- resilience
- search
- shared-types
- styling-engine
- trust-scoring
- user-safety


## Infrastructure
- PostgreSQL (primary database)
- Redis (caching/sessions)
- Kafka (event streaming)
- Elasticsearch (search)

## Technology Stack
- Runtime: Node.js 22+
- Language: TypeScript
- ORM: Prisma
- Build: Turbo + tsc
- Package Manager: pnpm

## Service Ports
| Service | Port |
|---------|------|
| API Gateway | 3000 |
| Auth Service | 3001 |
| User Service | 3002 |
| Post Service | 3003 |
| Feed Service | 3004 |
| Group Service | 3005 |
| Notification Service | 3006 |
| Moderation Service | 3007 |
| Search Service | 3008 |

## Key Files Extracted
- analytics-service_index_ts.txt
- analytics-service_package_json.txt
- api-gateway_app_ts.txt
- api-gateway_index_ts.txt
- api-gateway_middleware_auth_ts.txt
- api-gateway_middleware_error-handler_ts.txt
- api-gateway_middleware_rate-limiter_ts.txt
- api-gateway_middleware_request-logger_ts.txt
- api-gateway_package_json.txt
- api-gateway_routes_health_ts.txt
- api-gateway_routes_proxy_ts.txt
- auth-service_index_ts.txt
- auth-service_package_json.txt
- connection-pool_ts.txt
- docker-compose_dev_yml.txt
- docker-compose_yml.txt
- enums_ts.txt
- errors_ts.txt
- feed-service_index_ts.txt
- feed-service_package_json.txt
- group-service_index_ts.txt
- group-service_package_json.txt
- growth-service_index_ts.txt
- growth-service_package_json.txt
- index_ts.txt
- Makefile.txt
- media-service_index_ts.txt
- media-service_package_json.txt
- messaging-service_index_ts.txt
- messaging-service_package_json.txt
- moderation-service_index_ts.txt
- moderation-service_package_json.txt
- notification-service_index_ts.txt
- notification-service_package_json.txt
- package_json.txt
- pnpm-workspace_yaml.txt
- post-service_index_ts.txt
- post-service_package_json.txt
- ranking-service_index_ts.txt
- ranking-service_package_json.txt
- realtime-gateway_index_ts.txt
- realtime-gateway_package_json.txt
- replica_ts.txt
- requests_ts.txt
- responses_ts.txt
- schema_prisma.txt
- search-service_index_ts.txt
- search-service_package_json.txt
- spam-filtering-service_index_ts.txt
- spam-filtering-service_package_json.txt
- trust-safety-service_index_ts.txt
- trust-safety-service_package_json.txt
- tsconfig_base_json.txt
- tsconfig_json.txt
- turbo_json.txt
- user-service_index_ts.txt
- user-service_package_json.txt
- _env_example.txt

