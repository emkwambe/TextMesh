# TextMesh Architecture

## System Overview

TextMesh is a text-first social media platform designed for 100M+ users. The architecture follows microservices principles with a focus on scalability, reliability, and performance.

```
                                    ┌─────────────────────────────────────────┐
                                    │              CDN (CloudFlare)           │
                                    │         Static Assets / Edge Cache      │
                                    └─────────────────────────────────────────┘
                                                        │
                                    ┌─────────────────────────────────────────┐
                                    │           Load Balancer (K8s)           │
                                    │          SSL Termination / WAF          │
                                    └─────────────────────────────────────────┘
                                                        │
                    ┌───────────────────────────────────┼───────────────────────────────────┐
                    │                                   │                                   │
            ┌───────┴───────┐               ┌───────────┴───────────┐             ┌─────────┴─────────┐
            │   Web App     │               │    API Gateway        │             │   Mobile Apps     │
            │   (Next.js)   │               │    (Express/Kong)     │             │   (RN/Flutter)    │
            └───────────────┘               └───────────┬───────────┘             └───────────────────┘
                                                        │
        ┌───────────────────────────────────────────────┼───────────────────────────────────────────────┐
        │                                               │                                               │
┌───────┴───────┐   ┌───────────────┐   ┌───────────────┴───────────────┐   ┌───────────────┐   ┌───────┴───────┐
│  Auth Service │   │ User Service  │   │     Core Services             │   │ Media Service │   │ Search Engine │
│   (JWT/OAuth) │   │  (Profiles)   │   │                               │   │  (CDN/S3)     │   │ (Elasticsearch)│
└───────────────┘   └───────────────┘   │  ┌─────────┐  ┌─────────────┐ │   └───────────────┘   └───────────────┘
                                        │  │ Feed    │  │ Post        │ │
                                        │  │ Service │  │ Service     │ │
                                        │  └─────────┘  └─────────────┘ │
                                        │  ┌─────────┐  ┌─────────────┐ │
                                        │  │ Social  │  │ Notification│ │
                                        │  │ Service │  │ Service     │ │
                                        │  └─────────┘  └─────────────┘ │
                                        └───────────────────────────────┘
                                                        │
        ┌───────────────────────────────────────────────┼───────────────────────────────────────────────┐
        │                                               │                                               │
┌───────┴───────┐                           ┌───────────┴───────────┐                       ┌───────────┴───────────┐
│ PostgreSQL    │                           │     Redis Cluster     │                       │   Message Queue       │
│ (Primary + RR)│                           │   (Cache/Sessions)    │                       │   (RabbitMQ/Kafka)    │
└───────────────┘                           └───────────────────────┘                       └───────────────────────┘
```

## Service Architecture

### Core Services

| Service | Port | Description | Tech Stack |
|---------|------|-------------|------------|
| api-gateway | 3001 | Entry point, routing, auth | Express, Kong |
| user-service | 3002 | User profiles, follows | Express, Prisma |
| post-service | 3003 | Post CRUD, engagement | Express, Prisma |
| feed-service | 3004 | Feed generation, ranking | Express, Redis |
| social-service | 3005 | Follows, interactions | Express, Prisma |
| notification-service | 3006 | Push, in-app, email | Express, FCM |
| search-service | 3007 | Full-text search | Express, Elasticsearch |
| media-service | 3008 | File uploads, processing | Express, S3 |

### Platform Services

| Service | Port | Description |
|---------|------|-------------|
| moderation-service | 3009 | Content moderation |
| trust-safety-service | 3010 | User safety, enforcement |
| analytics-service | 3012 | Metrics, dashboards |
| growth-service | 3013 | Onboarding, engagement |
| ranking-service | 3014 | ML ranking, recommendations |

## Data Architecture

### PostgreSQL Schema

```sql
-- Core tables with relationships
Users ─────┬────── Posts ─────── Likes
           │          │          │
           │          └── Comments
           │          │
           └─ Follows │── Reposts
                      │
                      └── Bookmarks
```

### Redis Data Structures

```
# User Sessions
session:{sessionId} → hash (user data, expiry)

# Feed Cache
feed:{userId} → sorted set (postId by score)

# Rate Limiting
ratelimit:{userId}:{endpoint} → counter with TTL

# Real-time Stats
stats:realtime → hash (active users, posts/min)

# Trending
trending:hashtags → sorted set (tag by count)
trending:posts → sorted set (postId by engagement)
```

### Elasticsearch Indexes

```json
{
  "users": {
    "properties": {
      "username": { "type": "keyword" },
      "displayName": { "type": "text" },
      "bio": { "type": "text" }
    }
  },
  "posts": {
    "properties": {
      "content": { "type": "text", "analyzer": "standard" },
      "hashtags": { "type": "keyword" },
      "createdAt": { "type": "date" }
    }
  }
}
```

## Request Flow

### Post Creation

```
1. Client → API Gateway
   - JWT validation
   - Rate limit check

2. API Gateway → Post Service
   - Content validation
   - Toxicity check (async)
   - Store in PostgreSQL

3. Post Service → Event Bus
   - Emit "post.created" event

4. Event Consumers:
   - Feed Service: Update follower feeds
   - Notification Service: Notify mentioned users
   - Analytics Service: Track post metrics
   - Search Service: Index post content
```

### Feed Generation

```
1. Client → API Gateway → Feed Service

2. Feed Service:
   a. Check cache (Redis sorted set)
   b. If cache hit: Return cached posts
   c. If cache miss:
      - Query post IDs from social graph
      - Fetch post data from Post Service
      - Apply ranking algorithm
      - Cache result with TTL

3. Response enrichment:
   - User data from User Service
   - Engagement state (liked, bookmarked)
   - Batch API calls for efficiency
```

## Security Architecture

### Authentication Flow

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐
│  Client  │────▶│   API GW     │────▶│ Auth Service │
└──────────┘     └──────────────┘     └──────────────┘
     │                  │                    │
     │  1. Credentials  │                    │
     │─────────────────▶│  2. Validate       │
     │                  │───────────────────▶│
     │                  │  3. JWT Token      │
     │                  │◀───────────────────│
     │  4. Set Cookie   │                    │
     │◀─────────────────│                    │
```

### API Security Layers

1. **Edge (CDN)**
   - DDoS protection
   - Bot mitigation
   - Geographic blocking

2. **Gateway**
   - Rate limiting
   - JWT validation
   - Request sanitization

3. **Service**
   - Input validation
   - Authorization checks
   - Audit logging

4. **Data**
   - Encryption at rest
   - Encryption in transit
   - Column-level encryption for PII

## Deployment Architecture

### Kubernetes Structure

```
├── Namespaces
│   ├── textmesh-prod
│   ├── textmesh-staging
│   └── textmesh-monitoring
│
├── Deployments
│   ├── api-gateway (3 replicas)
│   ├── feed-service (5 replicas)
│   ├── post-service (3 replicas)
│   └── ... (other services)
│
├── StatefulSets
│   ├── postgresql (1 primary + 2 replicas)
│   └── redis-cluster (6 nodes)
│
├── Services
│   ├── ClusterIP (internal)
│   └── LoadBalancer (external)
│
└── ConfigMaps/Secrets
    ├── Environment configs
    └── Credentials (encrypted)
```

### CI/CD Pipeline

```
┌─────────┐    ┌──────────┐    ┌──────────┐    ┌───────────┐    ┌────────────┐
│  Code   │───▶│  Build   │───▶│  Test    │───▶│  Deploy   │───▶│ Production │
│  Push   │    │  Docker  │    │  Suite   │    │  Staging  │    │  (Manual)  │
└─────────┘    └──────────┘    └──────────┘    └───────────┘    └────────────┘
     │              │               │               │                 │
     └──────────────┴───────────────┴───────────────┴─────────────────┘
                              GitHub Actions
```

## Monitoring Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Observability Stack                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌───────────────┐   ┌───────────────┐   ┌───────────────┐    │
│   │   Metrics     │   │    Logs       │   │    Traces     │    │
│   │  (Prometheus) │   │   (Loki)      │   │   (Jaeger)    │    │
│   └───────┬───────┘   └───────┬───────┘   └───────┬───────┘    │
│           │                   │                   │             │
│           └───────────────────┴───────────────────┘             │
│                               │                                 │
│                    ┌──────────┴──────────┐                      │
│                    │      Grafana        │                      │
│                    │    Dashboards       │                      │
│                    └──────────┬──────────┘                      │
│                               │                                 │
│                    ┌──────────┴──────────┐                      │
│                    │   Alert Manager     │                      │
│                    │  (PagerDuty/Slack)  │                      │
│                    └─────────────────────┘                      │
└─────────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### 1. Microservices Over Monolith
- Independent scaling of high-traffic services (feed, posts)
- Team autonomy and faster deployments
- Technology flexibility per service

### 2. Event-Driven Architecture
- Loose coupling between services
- Async processing for non-critical paths
- Better fault tolerance

### 3. CQRS for Feed
- Separate read and write paths
- Optimized data models for each
- Pre-computed feeds for performance

### 4. Multi-Layer Caching
- Reduce database load
- Sub-100ms response times
- Graceful degradation

### 5. Feature Flags
- Safe rollouts
- A/B testing capability
- Quick incident response

## Technology Stack Summary

| Layer | Technology |
|-------|------------|
| Frontend | Next.js, React, Tailwind CSS |
| Mobile | React Native / Flutter |
| API | Express.js, TypeScript |
| Database | PostgreSQL + Prisma |
| Cache | Redis Cluster |
| Search | Elasticsearch |
| Queue | RabbitMQ / Kafka |
| Storage | AWS S3 / CloudFlare R2 |
| CDN | CloudFlare |
| Container | Docker, Kubernetes |
| CI/CD | GitHub Actions |
| Monitoring | Prometheus, Grafana, Loki |
| APM | Datadog / New Relic |
