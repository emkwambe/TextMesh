# TextMesh — Claude Code Context

> Read this file FIRST before any coding task.

## Project Identity

**TextMesh** is a purpose-driven coordination system with social affordances — NOT a social network with groups.

### One-Line Description
A lightweight, text-first communication platform for Special Interest Groups (SIGs) — where people gather around shared goals and communicate clearly, efficiently, and safely.

### Core Philosophy (Non-Negotiables)
1. **Clarity before richness** — Text leads, media supports
2. **Intent before attention** — No algorithmic manipulation
3. **Groups before audiences** — SIGs are first-class citizens
4. **Usefulness over engagement** — No vanity metrics
5. **Calm over chaos** — No infinite scroll traps

### What TextMesh Is NOT
- ❌ A Twitter/X clone
- ❌ A chat replacement
- ❌ A video-first platform
- ❌ An algorithmic attention engine
- ❌ A creator popularity contest

---

## Target Users

### Primary (Launch Focus)
- **Lecturers and instructors**
- **Tutors** (individual or small companies)
- **Certification study group organizers** (PMP, CFA, AWS)
- **Professional trainers and coaches**
- **Community and nonprofit organizers**

### Use Cases
1. **PMP Study Group** — Weekly focus areas, resource sharing, deadline tracking
2. **Tutoring Cohorts** — Announcements to students/parents, schedule updates
3. **Fitness Programs** — Daily motivation, weekly summaries, accountability

---

## Technical Architecture

### Stack
| Layer | Technology |
|-------|------------|
| Language | TypeScript (strict) |
| Runtime | Node.js |
| Framework | Express.js |
| Database | PostgreSQL |
| ORM | Prisma |
| Cache | Redis |
| Build | Turborepo + pnpm |
| API | REST (OpenAPI spec) |

### Monorepo Structure
```
TextMesh/
├── packages/                    # Shared packages (30)
│   ├── db-client/              # Prisma client + schema
│   ├── shared-types/           # TypeScript types
│   ├── config/                 # Environment config
│   ├── logger/                 # Logging utility
│   ├── cache-layer/            # Redis abstraction
│   ├── event-bus/              # Message queue
│   └── ...
├── services/                    # Microservices (17)
│   ├── api-gateway/            # Entry point, routing
│   ├── auth-service/           # Authentication
│   ├── user-service/           # User management
│   ├── post-service/           # Post CRUD
│   ├── feed-service/           # Feed generation
│   ├── group-service/          # Group management
│   ├── messaging-service/      # Direct messages
│   ├── notification-service/   # Push notifications
│   ├── growth-service/         # Onboarding, suggestions
│   ├── trust-safety-service/   # Moderation, risk scoring
│   ├── analytics-service/      # Metrics, reporting
│   ├── moderation-service/     # Content moderation
│   ├── search-service/         # Search functionality
│   ├── media-service/          # Media handling
│   ├── ranking-service/        # Content ranking
│   ├── realtime-gateway/       # WebSocket connections
│   └── spam-filtering-service/ # Spam detection
├── apps/                        # Frontend applications
│   └── web/                    # Next.js web app
└── .claude/                     # Claude Code context (this folder)
```

### Key Files
| File | Purpose |
|------|---------|
| `packages/db-client/prisma/schema.prisma` | Database schema (source of truth) |
| `services/*/src/index.ts` | Service entry points |
| `services/*/src/services/*.service.ts` | Business logic |
| `services/*/src/routes/*.routes.ts` | API endpoints |

---

## Coding Conventions

### TypeScript Rules
```typescript
// ✅ DO: Use Prisma enums via import
import { AppealStatus } from "@prisma/client";
status: AppealStatus.PENDING

// ❌ DON'T: Use string literals for enums
status: "pending"

// ✅ DO: Type-safe, explicit
const userId: string = input.userId;

// ❌ DON'T: Type casting hacks
const userId = input.userId as any;
```

### Prisma Rules
```prisma
// ✅ DO: Relations defined on BOTH sides
model Post {
  comments Comment[] @relation("PostComments")
}
model Comment {
  post Post @relation("PostComments", fields: [postId], references: [id])
}

// ✅ DO: Required fields have no ?
purpose String  // Required

// ✅ DO: Optional fields have ?
secondaryIntent UserIntent?  // Optional
```

### File Naming
- Services: `*.service.ts`
- Routes: `*.routes.ts`
- Types: `*.types.ts`
- Tests: `*.test.ts` or `*.spec.ts`

### API Response Format
```typescript
// Success
{ success: true, data: { ... } }

// Error
{ success: false, error: { code: "ERROR_CODE", message: "..." } }
```

---

## Build Commands

```bash
# Install dependencies
pnpm install

# Generate Prisma client (after schema changes)
$env:DATABASE_URL = "postgresql://user:pass@localhost:5432/textmesh"
cd packages/db-client
npx prisma generate
cd ../..

# Build all packages
pnpm run build

# Clear cache and rebuild
Remove-Item -Recurse -Force .\.turbo -ErrorAction SilentlyContinue
pnpm run build

# Expected result: 47/47 packages successful
```

---

## Current Status

### Sprint 1 ✅ COMPLETE
- 47/47 packages building
- All schema models in place
- trust-safety-service fully enabled
- growth-service fully enabled
- Type-safe code (no hacks)

### Sprint 2 🚧 IN PROGRESS
- See `.claude/SPRINT-2.md` for full plan

---

## Decision Log

| Decision | Rationale |
|----------|-----------|
| Text-first, media-second | Reduces noise, works globally, simplifies moderation |
| Groups are first-class | SIG-first positioning, not audience-first |
| Required group purpose | Quality enforcement without policing speech |
| Intent-based onboarding | Guides users to purpose, not popularity |
| No gamified progress | Calm experience, not checklist-driven |
| Invisible tracking | Internal metrics, no user pressure |

---

## What Claude Code Should Do

### Before ANY Coding Task
1. Read this file (`CLAUDE.md`)
2. Read the current sprint file (e.g., `SPRINT-2.md`)
3. Check current schema: `packages/db-client/prisma/schema.prisma`
4. Understand the service structure before modifying

### During Coding
1. Follow TypeScript conventions above
2. Use Prisma enum imports (never string literals)
3. Define relations on BOTH sides
4. Commit after each epic/milestone

### After Coding
1. Run `pnpm run build`
2. Verify 47/47 packages pass
3. Commit with descriptive message
4. Report what was done

---

## Contact

Project: TextMesh
Repository: https://github.com/emkwambe/TextMesh.git
Current Branch: `claude/textmesh-full-system-*`
