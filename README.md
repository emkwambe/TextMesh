# TextMesh

A text-only social media platform designed for 100M+ users scale.

## Quick Start

### Prerequisites

- **Node.js** 22+
- **pnpm** 8.10+
- **Docker** and **Docker Compose**
- **Git**

### 1. Clone and Install

```bash
git clone <repository-url>
cd TextMesh

# Install dependencies
pnpm install
```

### 2. Environment Setup

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your configuration (optional for local dev)
```

### 3. Start Infrastructure (Docker)

```bash
# Start PostgreSQL, Redis, Kafka, Elasticsearch
make docker-infra

# Or manually:
docker-compose up -d postgres redis kafka zookeeper elasticsearch
```

Wait ~30 seconds for all services to be healthy.

### 4. Database Setup

```bash
# Generate Prisma client
make db-generate

# Run database migrations
make db-migrate-dev

# (Optional) Seed with test data
make db-seed
```

### 5. Start Backend Services

**Option A: Run all services with Docker (Recommended for testing)**

```bash
# Build and start all services
make docker-dev
```

**Option B: Run services locally (Recommended for development)**

```bash
# Build shared packages first
pnpm run build --filter='./packages/*'

# Start all services in development mode
pnpm run dev
```

### 6. Verify Setup

```bash
# Check service health
make health-check

# Or manually:
curl http://localhost:3000/health
```

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

## Infrastructure Ports

| Service | Port |
|---------|------|
| PostgreSQL | 5432 |
| Redis | 6379 |
| Kafka | 29092 |
| Elasticsearch | 9200 |
| Kafka UI (dev only) | 8080 |
| Redis Commander (dev only) | 8081 |
| Adminer (dev only) | 8082 |

## Development Commands

```bash
# Install dependencies
make install

# Build all packages
make build

# Start development mode
make dev

# Run tests
make test

# Run linter
make lint

# Open Prisma Studio (database GUI)
make db-studio
```

## Docker Commands

```bash
# Start everything
make docker-up

# Start only infrastructure
make docker-infra

# Start development environment (with hot reload)
make docker-dev

# View logs
make docker-logs

# Stop all containers
make docker-down

# Clean everything (including volumes)
make docker-clean
```

## API Usage

### Register a new user

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "johndoe",
    "email": "john@example.com",
    "password": "securepassword123",
    "dateOfBirth": "1990-01-15"
  }'
```

### Login

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "securepassword123"
  }'
```

### Create a post (authenticated)

```bash
curl -X POST http://localhost:3000/posts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-access-token>" \
  -d '{
    "content": "Hello, TextMesh! #firstpost",
    "visibility": "PUBLIC"
  }'
```

### Get home feed (authenticated)

```bash
curl http://localhost:3000/feed/home \
  -H "Authorization: Bearer <your-access-token>"
```

## Project Structure

```
TextMesh/
├── apps/
│   ├── ios/                    # iOS app (SwiftUI)
│   └── android/                # Android app (Jetpack Compose)
├── packages/
│   ├── shared-types/           # TypeScript types
│   ├── logger/                 # Logging utility
│   ├── config/                 # Configuration schemas
│   ├── db-client/              # Prisma + Redis
│   └── event-bus/              # Kafka wrapper
├── services/
│   ├── api-gateway/            # Main entry point
│   ├── auth-service/           # Authentication
│   ├── user-service/           # User management
│   ├── post-service/           # Posts & interactions
│   ├── feed-service/           # Feed generation
│   ├── group-service/          # Groups
│   ├── notification-service/   # Notifications
│   ├── moderation-service/     # Content moderation
│   └── search-service/         # Search
├── k8s/                        # Kubernetes manifests
├── nginx/                      # Nginx configuration
├── docs/
│   └── api/
│       └── openapi.yaml        # API specification
├── docker-compose.yml          # Production compose
├── docker-compose.dev.yml      # Development compose
└── Makefile                    # Helper commands
```

## Mobile Apps

### iOS

```bash
cd apps/ios
open TextMesh.xcworkspace
# Build and run in Xcode
```

### Android

```bash
cd apps/android
./gradlew assembleDebug
# Or open in Android Studio
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment | `development` |
| `DATABASE_URL` | PostgreSQL connection | `postgresql://textmesh:textmesh_dev_password@localhost:5432/textmesh` |
| `REDIS_URL` | Redis connection | `redis://localhost:6379` |
| `KAFKA_BROKERS` | Kafka brokers | `localhost:29092` |
| `ELASTICSEARCH_URL` | Elasticsearch | `http://localhost:9200` |
| `JWT_SECRET` | JWT signing key | (required in production) |
| `JWT_REFRESH_SECRET` | Refresh token key | (required in production) |

## Production Deployment

### Using Kubernetes

```bash
# Deploy to Kubernetes cluster
make k8s-deploy

# Check status
make k8s-status

# View logs
make k8s-logs
```

### Using Docker Compose

```bash
# Build production images
make prod-build

# Deploy
make prod-deploy
```

## Troubleshooting

### Services won't start

1. Make sure Docker is running
2. Check if ports are available: `make check-ports`
3. Verify infrastructure is healthy: `docker-compose ps`

### Database connection errors

1. Wait for PostgreSQL to be ready (~15s after starting)
2. Run migrations: `make db-migrate-dev`
3. Check connection string in `.env`

### Kafka connection errors

1. Wait for Kafka to be ready (~30s after starting)
2. Ensure Zookeeper is running
3. Check Kafka UI at http://localhost:8080

### Build errors

```bash
# Clean and rebuild
make clean
pnpm install
make build
```

## License

MIT
