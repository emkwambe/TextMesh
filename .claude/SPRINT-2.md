# Sprint 2: Intentional Onboarding & Safe Participation

> **Goal**: New user → meaningful participation in < 5 minutes
> **Duration**: 2 weeks
> **Status**: 🚧 IN PROGRESS

---

## Sprint Philosophy

TextMesh is a **purpose-driven coordination system** with social affordances — NOT a social network with groups.

This sprint establishes:
1. **Intentional onboarding** — Guide users to purpose, not popularity
2. **Safe participation** — Trust & safety guardrails active
3. **Purpose-driven groups** — Every group needs a reason to exist

---

## Success Criteria

| Metric | Target |
|--------|--------|
| Time to first meaningful action | < 5 minutes |
| Group creation includes purpose | 100% required |
| Onboarding completion rate | Track internally |
| Build status | 47/47 maintained |

---

## Schema Updates Required

### New Enums

```prisma
enum UserIntent {
  LEARNING
  TEACHING
  COORDINATING
  FOLLOWING_UPDATES
}

enum GroupType {
  STUDY
  JOURNEY
  UPDATES
  COMMUNITY
  OTHER
}
```

### New Models

```prisma
model UserOnboarding {
  id              String       @id @default(uuid())
  userId          String       @unique
  primaryIntent   UserIntent
  secondaryIntent UserIntent?
  topics          String[]     // Optional interest tags
  completedSteps  String[]     // Internal tracking
  completedAt     DateTime?
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt
  
  user            User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([userId])
  @@index([primaryIntent])
}
```

### Updates to Existing Models

```prisma
// Add to Group model
model Group {
  // ... existing fields ...
  purpose    String      // REQUIRED - "What is this group for?"
  groupType  GroupType   @default(OTHER)
}

// Add to User model (if not exists)
model User {
  // ... existing fields ...
  onboarding UserOnboarding?
}

// Add to ReportReason enum
enum ReportReason {
  SPAM
  HARASSMENT
  HATE_SPEECH
  MISINFORMATION
  MISLEADING_LACKS_CONTEXT  // NEW - for context-aware reporting
  INAPPROPRIATE
  OTHER
}
```

---

## Epic 1: Intent-First Onboarding

**Owner**: growth-service
**Priority**: 🔴 Critical

### Task 1.1: Schema Updates

Add UserIntent enum, GroupType enum, and UserOnboarding model to schema.

```bash
# After schema changes
cd packages/db-client
npx prisma generate
cd ../..
pnpm run build
```

### Task 1.2: Intent Selection Endpoint

**File**: `services/growth-service/src/onboarding/IntentSelection.ts`

```typescript
// POST /onboarding/intent
interface IntentSelectionRequest {
  primaryIntent: UserIntent;       // Required
  secondaryIntent?: UserIntent;    // Optional
  topics?: string[];               // Optional tags
}

// Response
interface IntentSelectionResponse {
  success: boolean;
  nextStep: 'CREATE_GROUP' | 'JOIN_GROUP';  // Based on intent
}
```

**Logic**:
- If `primaryIntent` = `TEACHING` or `COORDINATING` → `nextStep: 'CREATE_GROUP'`
- If `primaryIntent` = `LEARNING` or `FOLLOWING_UPDATES` → `nextStep: 'JOIN_GROUP'`

### Task 1.3: Suggested Groups Endpoint

**File**: `services/growth-service/src/onboarding/GroupSuggestions.ts`

```typescript
// GET /onboarding/suggested-groups
interface SuggestedGroupsResponse {
  groups: Array<{
    id: string;
    name: string;
    purpose: string;        // Required field
    memberCount: number;
    lastActivityAt: Date;
  }>;
}
```

**Business Rules**:
1. ✅ ONLY return groups WITH `purpose` field populated
2. ✅ Bias toward small groups (< 50 members)
3. ✅ Bias toward recently active groups
4. ✅ Match user's primaryIntent to groupType
5. ❌ Groups without clear purpose are NEVER suggested

### Task 1.4: Suggested Leaders Endpoint

**File**: `services/growth-service/src/onboarding/LeaderSuggestions.ts`

```typescript
// GET /onboarding/suggested-leaders
interface SuggestedLeadersResponse {
  leaders: Array<{
    id: string;
    displayName: string;
    bio: string;
    groupsOwned: number;
    primaryGroupPurpose: string;
  }>;
}
```

**Business Rules**:
1. Return group OWNERS/FACILITATORS, not random users
2. Match to user's intent
3. For `FOLLOWING_UPDATES` intent: suggest briefing-style group owners
4. ❌ NOT generic "people to follow"

### Task 1.5: Onboarding Completion

**File**: `services/growth-service/src/onboarding/OnboardingManager.ts`

```typescript
// POST /onboarding/complete
// Sets User.onboardingCompleted = true
// Records UserOnboarding.completedAt

// GET /onboarding/progress
interface OnboardingProgressResponse {
  completed: boolean;
  completedAt?: Date;
  currentStep?: string;  // Internal use only
}
```

**Important**: NO gamified progress bar shown to users. Tracking is internal only.

---

## Epic 2: Trust & Safety Activation

**Owner**: trust-safety-service
**Priority**: 🔴 Critical

### Task 2.1: Enhanced Risk Scoring

**File**: `services/trust-safety-service/src/scoring/RiskScorer.ts`

Add these scoring factors:

```typescript
interface RiskFactors {
  accountAge: number;           // Days since signup
  postingVelocity: number;      // Posts per hour
  groupCreationRate: number;    // Groups created per week
  externalLinkFrequency: number; // % of posts with external links
  reportCount: number;          // Reports received
  suspiciousPatterns: boolean;  // Detected spam patterns
}

// Risk score: 0-100 (higher = more risky)
function calculateRiskScore(factors: RiskFactors): number {
  // New accounts with high velocity = high risk
  // Many external links = medium risk
  // etc.
}
```

### Task 2.2: Content Flagging Rule

**File**: `services/trust-safety-service/src/moderation/ContentRules.ts`

```typescript
// Auto-flag rule (don't block, just flag for review)
function shouldFlagPost(post: Post): boolean {
  const hasExternalLink = /https?:\/\//.test(post.content);
  const isShort = post.content.length < 50;
  
  // Headline-only posts: short text + link = flag
  if (hasExternalLink && isShort) {
    return true;
  }
  return false;
}
```

**Note**: This enforces the manifesto rule against headline-only framing without blocking.

### Task 2.3: Report Reason Update

Update `ReportReason` enum to include:
```prisma
MISLEADING_LACKS_CONTEXT
```

This is critical for SIG use cases where context matters.

### Task 2.4: Report Flow Verification

Ensure complete flow works:
1. User submits report → `POST /reports`
2. Report goes to queue → stored in database
3. Admin views queue → `GET /admin/reports`
4. Admin takes action → `POST /admin/reports/:id/action`

---

## Epic 3: Purpose-Driven Groups

**Owner**: group-service
**Priority**: 🔴 Critical

### Task 3.1: Required Purpose Field

**File**: `services/group-service/src/services/group.service.ts`

```typescript
// Group creation validation
interface CreateGroupRequest {
  name: string;
  purpose: string;      // REQUIRED - reject if empty
  groupType: GroupType;
  privacy: GroupPrivacy;
  description?: string;
}

function validateGroupCreation(data: CreateGroupRequest): void {
  if (!data.purpose || data.purpose.trim().length < 10) {
    throw new Error('Group purpose is required (min 10 characters)');
  }
}
```

### Task 3.2: Context-Aware First Post Prompts

**File**: `services/post-service/src/prompts/FirstPostPrompts.ts` (create if needed)

```typescript
function getFirstPostPrompt(groupType: GroupType): string {
  switch (groupType) {
    case GroupType.STUDY:
      return "What are we focusing on first?";
    case GroupType.JOURNEY:
      return "What's the goal for this week?";
    case GroupType.UPDATES:
      return "What should members know right now?";
    case GroupType.COMMUNITY:
      return "Introduce yourself to the group";
    case GroupType.OTHER:
    default:
      return "Share your first update with the group";
  }
}
```

### Task 3.3: Discovery Guardrail

**Internal rule** (not user-facing):

```typescript
// In group suggestion/discovery queries
function getDiscoverableGroups(): Group[] {
  return prisma.group.findMany({
    where: {
      purpose: { not: null },           // Must have purpose
      purpose: { not: '' },             // Must not be empty
      // ... other filters
    }
  });
}
```

Groups without purpose:
- ✅ Function normally
- ❌ NOT suggested during onboarding
- ❌ NOT shown in discovery

---

## Execution Order

### Phase 1: Schema (Day 1)
1. Add UserIntent enum
2. Add GroupType enum  
3. Add UserOnboarding model
4. Add purpose field to Group
5. Add groupType field to Group
6. Update ReportReason enum
7. Run prisma generate
8. Verify build: 47/47

**Commit**: "feat: Sprint 2 schema updates - onboarding and group purpose"

### Phase 2: Onboarding Endpoints (Days 2-4)
1. Intent selection endpoint
2. Suggested groups endpoint
3. Suggested leaders endpoint
4. Onboarding completion endpoint
5. Test all endpoints

**Commit**: "feat: Intent-first onboarding flow"

### Phase 3: Trust & Safety (Days 5-7)
1. Enhanced risk scoring
2. Content flagging rule
3. Report reason update
4. Verify report flow

**Commit**: "feat: Enhanced trust & safety with context-aware reporting"

### Phase 4: Groups (Days 8-9)
1. Required purpose validation
2. Context-aware prompts
3. Discovery guardrail

**Commit**: "feat: Purpose-driven groups with contextual prompts"

### Phase 5: Integration & Testing (Day 10)
1. End-to-end onboarding test
2. Group creation test
3. Report flow test
4. Final build verification

**Commit**: "feat: Sprint 2 complete - intentional onboarding & safe participation"

---

## API Endpoints Summary

### Onboarding (growth-service)
```
POST /onboarding/intent           # Save user intent
GET  /onboarding/suggested-groups # Get group recommendations
GET  /onboarding/suggested-leaders # Get facilitator recommendations
POST /onboarding/complete         # Mark onboarding done
GET  /onboarding/progress         # Get completion status (internal)
```

### Groups (group-service)
```
POST /groups                      # Create group (purpose required)
GET  /groups/:id                  # Get group details
POST /groups/:id/join             # Join group
POST /groups/:id/invite           # Generate invite link
```

### Trust & Safety (trust-safety-service)
```
POST /reports                     # Submit report
GET  /admin/reports               # View report queue
POST /admin/reports/:id/action    # Take action
GET  /users/:id/risk-score        # Get risk score (admin)
```

---

## Definition of Done

- [ ] Schema updated with all new enums and models
- [ ] Prisma client regenerated
- [ ] All onboarding endpoints implemented
- [ ] Risk scoring enhanced
- [ ] Report flow includes new reason
- [ ] Group purpose is required
- [ ] Context-aware prompts working
- [ ] Build: 47/47 passing
- [ ] All changes committed and pushed

---

## Notes for Claude Code

1. **Read CLAUDE.md first** for project context
2. **Follow TypeScript conventions** — use Prisma enum imports
3. **Schema changes require** prisma generate after
4. **Commit after each phase** with descriptive messages
5. **Maintain 47/47 build** — don't break existing code
