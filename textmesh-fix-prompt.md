# TextMesh Monorepo Build Fix Request

## Project Overview
TextMesh is a large-scale text-based social media platform built as a TypeScript monorepo with 47 packages (17 microservices + 30 shared packages). It uses:
- **Runtime**: Node.js + TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Build System**: Turborepo + pnpm workspaces
- **Location**: `C:\Users\HP\Documents\TextMesh`

## Current Build Status
- **39/47 packages building successfully** (83%)
- **8 packages failing** due to schema-code mismatch

## The Core Problem

The Prisma schema (`packages/db-client/prisma/schema.prisma`) does not contain all the models and fields that the service code expects. This is a **schema-code synchronization issue** - the services were written expecting database models that were never added to the schema.

### Category 1: Missing Prisma Models (services expect models that don't exist)

| Missing Model | Used By | Current Alternative |
|---------------|---------|---------------------|
| `like` | analytics-service | Schema has `PostLike` model |
| `comment` | analytics-service | Schema has no Comment model |
| `repost` | analytics-service | Schema has self-referential Post.repostId |
| `messageReadReceipt` | messaging-service | Does not exist |
| `messageReaction` | messaging-service | Does not exist |
| `appeal` | trust-safety-service | Does not exist |
| `violation` | trust-safety-service | Does not exist |
| `warning` | trust-safety-service | Does not exist |
| `shadowBan` | trust-safety-service | Does not exist |

### Category 2: Missing Fields on Existing Models

| Model | Missing Field | Used By |
|-------|---------------|---------|
| `User` | `onboardingCompleted` (Boolean) | growth-service |
| `User` | `isBanned` (Boolean) | growth-service |
| `Post` | `isHidden` (Boolean) | trust-safety-service |
| `Message` | `replyToId` (String?) | messaging-service |
| `Message` | `isDeleted` (Boolean) | messaging-service |
| `Message` | `isEdited` (Boolean) | messaging-service |
| `ConversationParticipant` | `leftAt` (DateTime?) | messaging-service |
| `ConversationParticipant` | `deletedAt` (DateTime?) | messaging-service |
| `Conversation` | `creatorId` (String) | messaging-service |

### Category 3: Type Mismatches (code passes wrong types)

| File | Issue |
|------|-------|
| `user-service/src/services/settings.service.ts` | `allowMentions` passed as `string` but schema expects `MentionSetting` enum |
| `growth-service/src/onboarding/ProfileWizard.ts` | Code uses `avatarUrl` but local type defines `avatar` |

## Failing Services Detail

### 1. analytics-service (15 errors)
**Files**: `EngagementAnalytics.ts`, `GrowthAnalytics.ts`, `PlatformMetrics.ts`
**Problem**: Uses `prisma.like`, `prisma.comment`, `prisma.repost` - none exist
**Schema has**: `PostLike` model (different name), no Comment, no Repost model

### 2. messaging-service (34 errors)
**Files**: `conversation.service.ts`, `message.service.ts`
**Problems**:
- Uses `Conversation.creatorId` - doesn't exist
- Uses `Message.replyToId`, `Message.isDeleted`, `Message.isEdited` - don't exist
- Uses `ConversationParticipant.leftAt`, `ConversationParticipant.deletedAt` - don't exist
- Uses `Message.readBy` relation - doesn't exist
- Uses `prisma.messageReadReceipt`, `prisma.messageReaction` - models don't exist

### 3. growth-service (11 errors)
**Files**: `NotificationCampaigns.ts`, `FollowSuggestions.ts`, `OnboardingManager.ts`, `ProfileWizard.ts`
**Problems**:
- Uses `User.onboardingCompleted` - doesn't exist
- Uses `User.isBanned` - doesn't exist
- Uses `ProfileUpdates.avatarUrl` but type defines `avatar`

### 4. user-service (2 errors)
**File**: `settings.service.ts`
**Problem**: Passes `allowMentions` and `allowDirectMessages` as strings, but Prisma expects `MentionSetting` enum

### 5. trust-safety-service (25+ errors)
**Files**: `AppealManager.ts`, `ShadowBanManager.ts`, `RiskScorer.ts`, `AuditLogger.ts`
**Problems**:
- Uses `prisma.appeal`, `prisma.violation`, `prisma.warning`, `prisma.shadowBan` - none exist
- Uses `Post.isHidden`, `User.isBanned` - don't exist
- AuditLog field mapping mismatch

## What Is Needed

A fix that achieves **47/47 successful builds** by reconciling the schema with the service code.

## Options for Consideration

### Option A: Update Services to Match Existing Schema (Code-Only Fix)
**Approach**: Modify service code to use existing schema models
- Change `prisma.like` → `prisma.postLike` in analytics-service
- Remove/stub references to non-existent fields
- Cast enum types where needed

**Pros**: No schema changes, no migration needed, faster
**Cons**: May lose functionality, requires stubbing features

### Option B: Update Schema to Match Services (Schema Fix)
**Approach**: Add all missing models and fields to Prisma schema
- Add 9 new models (Like, Comment, Repost, MessageReadReceipt, MessageReaction, Appeal, Violation, Warning, ShadowBan)
- Add missing fields to User, Post, Message, ConversationParticipant, Conversation
- Regenerate Prisma client

**Pros**: Full functionality preserved
**Cons**: Must handle Prisma relations correctly, need migration for production

**CRITICAL CONSTRAINT**: When adding models with relations (e.g., `Like` with `post Post @relation(...)`), the opposite side MUST be defined on the related model (e.g., `Post` must have `likes Like[]`). The current schema already has:
- `Post.likes PostLike[]` - so adding a new `Like` model would conflict
- `Post.reposts Post[]` - self-referential, adding `Repost` model would conflict

### Option C: Hybrid Approach (Recommended)
**Approach**: 
1. For analytics-service: Update code to use existing `PostLike` instead of `Like`
2. For messaging-service: Add missing fields to existing models + add MessageReadReceipt/MessageReaction models
3. For growth-service: Add `onboardingCompleted` and `isBanned` to User model, fix ProfileWizard type
4. For user-service: Cast enum values properly
5. For trust-safety-service: Add Appeal, Violation, Warning, ShadowBan models (these don't conflict)

## File Locations

```
C:\Users\HP\Documents\TextMesh\
├── packages/
│   └── db-client/
│       └── prisma/
│           └── schema.prisma          # THE PRISMA SCHEMA
├── services/
│   ├── analytics-service/src/metrics/
│   │   ├── EngagementAnalytics.ts
│   │   ├── GrowthAnalytics.ts
│   │   └── PlatformMetrics.ts
│   ├── messaging-service/src/services/
│   │   ├── conversation.service.ts
│   │   └── message.service.ts
│   ├── growth-service/src/
│   │   ├── campaigns/NotificationCampaigns.ts
│   │   └── onboarding/
│   │       ├── FollowSuggestions.ts
│   │       ├── OnboardingManager.ts
│   │       └── ProfileWizard.ts
│   ├── user-service/src/services/
│   │   └── settings.service.ts
│   └── trust-safety-service/src/
│       ├── audit/AuditLogger.ts
│       ├── enforcement/
│       │   ├── AppealManager.ts
│       │   └── ShadowBanManager.ts
│       └── scoring/RiskScorer.ts
```

## Commands Reference

```powershell
# From C:\Users\HP\Documents\TextMesh

# Set DATABASE_URL for Prisma
$env:DATABASE_URL = "postgresql://user:pass@localhost:5432/textmesh"

# Regenerate Prisma client after schema changes
cd packages/db-client
npx prisma generate
cd ../..

# Clear build cache and rebuild
Remove-Item -Recurse -Force .\.turbo -ErrorAction SilentlyContinue
pnpm run build

# Write files without BOM (important for Prisma schema)
[System.IO.File]::WriteAllText($filePath, $content, [System.Text.UTF8Encoding]::new($false))
```

## Request

Please implement **Option C (Hybrid Approach)** to achieve 47/47 successful builds:

1. **First**: Show me exactly what changes need to be made to the Prisma schema
2. **Second**: Show me the code fixes for each failing service
3. **Third**: Provide the complete execution sequence

Prioritize minimal, surgical changes that fix the build without introducing new bugs or breaking existing functionality.
