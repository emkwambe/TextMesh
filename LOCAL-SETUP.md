# TextMesh Local Development Setup

Complete guide to run TextMesh locally and preview Sprint 2 features.

## Prerequisites

- Node.js >= 20.0.0
- pnpm >= 8.0.0
- Docker Desktop (for infrastructure)

## Quick Start (5 Steps)

### Step 1: Start Infrastructure Services

```bash
# Start PostgreSQL, Redis, Elasticsearch, and Kafka
pnpm run docker:up

# Wait ~30 seconds for all services to be healthy
# Check status: docker ps
```

**Services Running:**
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`
- Elasticsearch: `localhost:9200`
- Kafka: `localhost:29092`

### Step 2: Set Up Database

```bash
# Set the DATABASE_URL environment variable (PowerShell)
$env:DATABASE_URL = "postgresql://textmesh:textmesh_dev@localhost:5432/textmesh"

# Generate Prisma Client
cd packages/db-client
npx prisma generate

# Run database migrations
npx prisma db push

# Go back to root
cd ../..
```

### Step 3: Build All Packages

```bash
# Build all 47 packages
pnpm run build
```

Expected output: `Tasks: 47 successful, 47 total`

### Step 4: Start Services

```bash
# Start all services in development mode
pnpm run dev
```

**Services will start on:**
- API Gateway: `http://localhost:3000`
- Auth Service: `http://localhost:3001`
- User Service: `http://localhost:3002`
- Post Service: `http://localhost:3003`
- Feed Service: `http://localhost:3004`
- Group Service: `http://localhost:3005`
- Growth Service (Onboarding): `http://localhost:3011`
- Trust & Safety Service: `http://localhost:3010`

### Step 5: Test Sprint 2 Features

Open your API client (Postman, Insomnia, or curl) and test the new endpoints!

---

## Testing Sprint 2 Features

### 🎯 Phase 1: Schema Updates

**Verify new models exist:**
```bash
# Check Prisma schema
cat packages/db-client/prisma/schema.prisma | grep "enum UserIntent" -A 4
cat packages/db-client/prisma/schema.prisma | grep "model UserOnboarding" -A 15
```

### 🚀 Phase 2: Intent-First Onboarding

**1. Save User Intent**
```bash
POST http://localhost:3011/api/growth/onboarding/intent
Content-Type: application/json

{
  "userId": "your-user-id",
  "primaryIntent": "LEARNING",
  "secondaryIntent": "TEACHING",
  "topics": ["JavaScript", "TypeScript", "React"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "nextStep": "JOIN_GROUP"  // or "CREATE_GROUP" for TEACHING/COORDINATING
  }
}
```

**2. Get Suggested Groups**
```bash
GET http://localhost:3011/api/growth/onboarding/suggested-groups?userId=your-user-id&limit=10
```

**Response:**
```json
{
  "success": true,
  "data": {
    "groups": [
      {
        "id": "uuid",
        "name": "PMP Study Group",
        "purpose": "Prepare for PMP certification together",
        "groupType": "STUDY",
        "memberCount": 15,
        "lastActivityAt": "2026-01-03T10:00:00Z"
      }
    ]
  }
}
```

**3. Get Suggested Leaders**
```bash
GET http://localhost:3011/api/growth/onboarding/suggested-leaders?userId=your-user-id&limit=10
```

**4. Complete Onboarding**
```bash
POST http://localhost:3011/api/growth/onboarding/complete
Content-Type: application/json

{
  "userId": "your-user-id"
}
```

**5. Get Onboarding Progress**
```bash
GET http://localhost:3011/api/growth/onboarding/progress?userId=your-user-id
```

### 🛡️ Phase 3: Trust & Safety

**1. Get User Risk Score**
```bash
GET http://localhost:3010/api/trust-safety/risk/your-user-id
```

**Response:**
```json
{
  "success": true,
  "data": {
    "userId": "your-user-id",
    "overallScore": 25,
    "riskLevel": "low",
    "components": {
      "accountRisk": 10,
      "behaviorRisk": 15,
      "contentRisk": 5,
      "networkRisk": 0,
      "reputationRisk": 0
    },
    "factors": [
      {
        "category": "behavior",
        "name": "moderate_group_creation",
        "impact": 10,
        "description": "7 groups created in the last week"
      }
    ]
  }
}
```

**2. Submit a Report (with new MISLEADING_LACKS_CONTEXT reason)**
```bash
POST http://localhost:3010/api/trust-safety/report
Content-Type: application/json

{
  "reporterId": "reporter-user-id",
  "contentId": "post-id",
  "contentType": "post",
  "reason": "MISLEADING_LACKS_CONTEXT",
  "details": "Headline-only post with external link, no context provided"
}
```

**3. Get Moderation Queue (Admin)**
```bash
GET http://localhost:3010/api/trust-safety/queue?status=pending&limit=50
```

### 📋 Phase 4: Purpose-Driven Groups

**1. Create Group with Purpose**
```bash
POST http://localhost:3005/
Content-Type: application/json
X-User-Id: your-user-id

{
  "name": "React Advanced Patterns Study Group",
  "slug": "react-advanced-patterns",
  "purpose": "Master advanced React patterns including hooks, context, and performance optimization",
  "groupType": "STUDY",
  "privacy": "PUBLIC",
  "description": "Weekly study sessions on advanced React concepts"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "group": {
      "id": "group-uuid",
      "name": "React Advanced Patterns Study Group",
      "purpose": "Master advanced React patterns...",
      "groupType": "STUDY"
    }
  }
}
```

**2. Get First Post Prompt**
```bash
GET http://localhost:3003/prompts/first-post/group-uuid
```

**Response:**
```json
{
  "success": true,
  "data": {
    "prompt": {
      "prompt": "What are we focusing on first?",
      "placeholder": "Share the first topic or chapter we should tackle...",
      "suggestions": [
        "Share the study schedule",
        "Post the first topic or chapter",
        "Link to key resources",
        "Set expectations for the group"
      ]
    }
  }
}
```

---

## Sprint 2 Feature Matrix

| Feature | Service | Endpoint | Status |
|---------|---------|----------|--------|
| Intent Selection | growth-service | POST /api/growth/onboarding/intent | ✅ |
| Group Suggestions | growth-service | GET /api/growth/onboarding/suggested-groups | ✅ |
| Leader Suggestions | growth-service | GET /api/growth/onboarding/suggested-leaders | ✅ |
| Onboarding Complete | growth-service | POST /api/growth/onboarding/complete | ✅ |
| Onboarding Progress | growth-service | GET /api/growth/onboarding/progress | ✅ |
| Risk Scoring | trust-safety-service | GET /api/trust-safety/risk/:userId | ✅ |
| Submit Report | trust-safety-service | POST /api/trust-safety/report | ✅ |
| Moderation Queue | trust-safety-service | GET /api/trust-safety/queue | ✅ |
| Group Creation (Purpose) | group-service | POST / | ✅ |
| First Post Prompts | post-service | GET /prompts/first-post/:groupId | ✅ |

---

## Troubleshooting

### Docker services not starting
```bash
# Check Docker Desktop is running
docker ps

# View logs for specific service
docker logs textmesh-postgres
docker logs textmesh-kafka
docker logs textmesh-redis
```

### Prisma errors
```bash
# Regenerate Prisma Client
cd packages/db-client
npx prisma generate

# Reset database (⚠️ deletes all data)
npx prisma db push --force-reset
```

### Port already in use
```bash
# Find process using port (PowerShell)
Get-NetTCPConnection -LocalPort 3000 | Select-Object OwningProcess
Stop-Process -Id <process-id>
```

### Services not connecting to Kafka
```bash
# Verify Kafka is healthy
docker exec -it textmesh-kafka kafka-broker-api-versions --bootstrap-server localhost:9092

# Check environment variable
echo $env:KAFKA_BROKERS
# Should be: localhost:29092
```

---

## Stop Services

```bash
# Stop all Node.js services (Ctrl+C in terminal)

# Stop Docker infrastructure
pnpm run docker:down

# Or keep data volumes
docker-compose -f docker/docker-compose.yml stop
```

---

## Next Steps

- Test the complete onboarding flow
- Create groups with different GroupTypes
- Verify risk scoring with different user behaviors
- Test content flagging rules
- Explore context-aware first post prompts

Enjoy testing Sprint 2! 🚀
