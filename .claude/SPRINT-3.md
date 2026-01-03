# Sprint 3: Expression & Polish

> **Goal**: Make the core expression experience delightful and fast
> **Duration**: 2 weeks
> **Status**: 📋 PLANNED

---

## Sprint Philosophy

TextMesh is **text-first, media-supportive** — richness serves clarity, not the other way around.

This sprint establishes:
1. **Expressive text** — Styling that enhances communication, not decoration
2. **Blazing-fast feeds** — Smooth scrolling with smart caching
3. **Calm notifications** — User control over noise, not algorithmic push
4. **Internal analytics** — Measure what matters, hide vanity metrics

---

## Success Criteria

| Metric | Target |
|--------|--------|
| Feed scroll latency | < 50ms |
| Time to render 20 posts | < 200ms |
| Text styling adoption | Track internally |
| Notification opt-out rate | < 10% |
| Build status | 47/47 maintained |

---

## Schema Updates Required

### New Enums

```prisma
enum PostStyle {
  DEFAULT
  ANNOUNCEMENT
  QUESTION
  UPDATE
  DISCUSSION
}

enum NotificationFrequency {
  IMMEDIATE
  DAILY_DIGEST
  WEEKLY_DIGEST
  DISABLED
}

enum PostEmphasis {
  NONE
  HIGHLIGHT_YELLOW
  HIGHLIGHT_BLUE
  HIGHLIGHT_GREEN
  COLOR_RED
  COLOR_BLUE
  COLOR_GREEN
}
```

### New Models

```prisma
model PostTemplate {
  id          String     @id @default(uuid()) @db.Uuid
  name        String
  style       PostStyle
  placeholder String
  structure   Json       // Template structure
  isSystem    Boolean    @default(true)
  createdAt   DateTime   @default(now())

  @@index([style])
}

model NotificationPreference {
  id             String                 @id @default(uuid()) @db.Uuid
  userId         String                 @db.Uuid
  groupId        String?                @db.Uuid  // null = global preference
  frequency      NotificationFrequency  @default(IMMEDIATE)
  mutedUntil     DateTime?
  createdAt      DateTime               @default(now())
  updatedAt      DateTime               @updatedAt

  user           User                   @relation(fields: [userId], references: [id], onDelete: Cascade)
  group          Group?                 @relation(fields: [groupId], references: [id], onDelete: Cascade)

  @@unique([userId, groupId])
  @@index([userId])
  @@index([groupId])
}

model AnalyticsEvent {
  id          String   @id @default(uuid()) @db.Uuid
  eventType   String   // 'post_created', 'group_joined', 'user_active', etc.
  userId      String?  @db.Uuid
  groupId     String?  @db.Uuid
  postId      String?  @db.Uuid
  metadata    Json?    // Additional event data
  timestamp   DateTime @default(now())

  @@index([eventType, timestamp])
  @@index([userId, timestamp])
  @@index([groupId, timestamp])
}
```

### Updates to Existing Models

```prisma
// Add to Post model
model Post {
  // ... existing fields ...
  style       PostStyle      @default(DEFAULT)
  emphasis    PostEmphasis   @default(NONE)
  template    String?        // Template ID if used
}

// Add to User model
model User {
  // ... existing fields ...
  notificationPreferences NotificationPreference[]
}

// Add to Group model
model Group {
  // ... existing fields ...
  notificationPreferences NotificationPreference[]
}
```

---

## Epic 1: Text Styling & Templates

**Owner**: post-service
**Priority**: 🟡 High

### Task 1.1: Schema Updates

Add PostStyle, PostEmphasis enums and PostTemplate model to schema.

```bash
# After schema changes
cd packages/db-client
npx prisma generate
cd ../..
pnpm run build
```

### Task 1.2: Post Styling Endpoints

**File**: `services/post-service/src/services/styling.service.ts` (create)

```typescript
// POST /posts - Enhanced with styling
interface CreatePostRequest {
  content: string;
  visibility: PostVisibility;
  groupId?: string;
  parentId?: string;
  style?: PostStyle;        // NEW
  emphasis?: PostEmphasis;  // NEW
  template?: string;        // NEW - template ID
}

// Validation
function validateStyling(data: CreatePostRequest): void {
  // Style and emphasis are optional
  // If template is provided, validate it exists
  if (data.template) {
    const template = await prisma.postTemplate.findUnique({
      where: { id: data.template }
    });
    if (!template) {
      throw new Error('Invalid template ID');
    }
  }
}
```

### Task 1.3: Template System

**File**: `services/post-service/src/templates/TemplateManager.ts` (create)

```typescript
interface Template {
  id: string;
  name: string;
  style: PostStyle;
  placeholder: string;
  structure: {
    prefix?: string;
    suffix?: string;
    format?: string;
  };
}

class TemplateManager {
  // Seed system templates
  async seedTemplates(): Promise<void> {
    const templates = [
      {
        name: 'Announcement',
        style: PostStyle.ANNOUNCEMENT,
        placeholder: 'Important update for the group...',
        structure: { prefix: '📢 ' }
      },
      {
        name: 'Question',
        style: PostStyle.QUESTION,
        placeholder: 'What are your thoughts on...',
        structure: { suffix: ' ?' }
      },
      {
        name: 'Weekly Update',
        style: PostStyle.UPDATE,
        placeholder: 'This week we covered...',
        structure: { prefix: '📅 Week of ' }
      }
    ];

    // Insert templates if they don't exist
  }

  // GET /templates
  async getTemplates(style?: PostStyle): Promise<Template[]> {
    return prisma.postTemplate.findMany({
      where: style ? { style } : {},
      orderBy: { name: 'asc' }
    });
  }
}
```

### Task 1.4: Preview Endpoint

**File**: `services/post-service/src/routes/preview.routes.ts` (create)

```typescript
// POST /posts/preview
interface PreviewRequest {
  content: string;
  style?: PostStyle;
  emphasis?: PostEmphasis;
  template?: string;
}

interface PreviewResponse {
  renderedContent: string;
  estimatedLength: number;
  warnings?: string[];  // e.g., "Content exceeds recommended length"
}

// This endpoint applies template + styling without saving
```

---

## Epic 2: Feed Performance

**Owner**: feed-service
**Priority**: 🔴 Critical

### Task 2.1: Feed Caching Strategy

**File**: `services/feed-service/src/cache/FeedCache.ts` (create)

```typescript
interface FeedCacheStrategy {
  // Home feed cache (user's followed groups)
  cacheHomeFeed(userId: string, posts: Post[]): Promise<void>;

  // Group feed cache
  cacheGroupFeed(groupId: string, posts: Post[]): Promise<void>;

  // Trending feed cache (global)
  cacheTrendingFeed(posts: Post[]): Promise<void>;

  // Invalidation rules
  invalidateOnNewPost(postId: string): Promise<void>;
  invalidateOnGroupJoin(userId: string, groupId: string): Promise<void>;
}

// Cache TTL Configuration
const CACHE_TTL = {
  HOME_FEED: 60 * 5,        // 5 minutes
  GROUP_FEED: 60 * 10,      // 10 minutes
  TRENDING_FEED: 60 * 15,   // 15 minutes
  POST_DETAIL: 60 * 30,     // 30 minutes
};
```

### Task 2.2: Pagination Optimization

**File**: `services/feed-service/src/services/pagination.service.ts` (create)

```typescript
// Cursor-based pagination (not offset-based)
interface FeedPaginationRequest {
  cursor?: string;  // Last post ID
  limit?: number;   // Default 20, max 50
}

interface FeedPaginationResponse {
  posts: Post[];
  nextCursor?: string;  // null if last page
  hasMore: boolean;
}

// Use indexed queries for fast cursor jumps
async function getHomeFeed(
  userId: string,
  cursor?: string,
  limit: number = 20
): Promise<FeedPaginationResponse> {
  const posts = await prisma.post.findMany({
    where: {
      // User's subscribed groups
      group: {
        members: {
          some: { userId }
        }
      },
      // Cursor-based pagination
      ...(cursor && { id: { lt: cursor } }),
    },
    take: limit + 1,  // Fetch one extra to check hasMore
    orderBy: { createdAt: 'desc' },
    include: {
      author: true,
      group: true,
      _count: { select: { likes: true, replies: true } }
    }
  });

  const hasMore = posts.length > limit;
  const results = hasMore ? posts.slice(0, limit) : posts;

  return {
    posts: results,
    nextCursor: hasMore ? results[results.length - 1].id : undefined,
    hasMore
  };
}
```

### Task 2.3: Prefetching Strategy

**File**: `services/feed-service/src/prefetch/PrefetchService.ts` (create)

```typescript
// Prefetch next page when user is at 80% of current page
// Implemented on frontend, but API needs to support it

// GET /feed/home/prefetch?cursor=xxx&limit=20
// Same as regular feed, but with cache-control headers optimized

router.get('/home/prefetch', async (req, res) => {
  const { cursor, limit = 20 } = req.query;

  // Set aggressive caching for prefetch
  res.setHeader('Cache-Control', 'private, max-age=300');

  const feed = await feedService.getHomeFeed(req.userId, cursor, limit);
  res.json({ success: true, data: feed });
});
```

### Task 2.4: Performance Monitoring

**File**: `services/feed-service/src/monitoring/FeedMetrics.ts` (create)

```typescript
interface FeedMetrics {
  measureFeedLoadTime(userId: string, duration: number): void;
  measureCacheHitRate(feedType: string, hit: boolean): void;
  measureQueryTime(queryType: string, duration: number): void;
}

// Log metrics to analytics service
// Track percentiles (p50, p95, p99) for feed load times
// Alert if p95 > 200ms
```

---

## Epic 3: Push Notification Tuning

**Owner**: notification-service
**Priority**: 🟡 High

### Task 3.1: Notification Preferences

**File**: `services/notification-service/src/services/preferences.service.ts` (create)

```typescript
// POST /notification-preferences
interface NotificationPreferenceRequest {
  groupId?: string;  // null = global preference
  frequency: NotificationFrequency;
  mutedUntil?: Date;
}

// GET /notification-preferences
interface NotificationPreferenceResponse {
  global: NotificationFrequency;
  groups: Array<{
    groupId: string;
    groupName: string;
    frequency: NotificationFrequency;
    mutedUntil?: Date;
  }>;
}

class PreferencesService {
  async setPreference(
    userId: string,
    request: NotificationPreferenceRequest
  ): Promise<void> {
    await prisma.notificationPreference.upsert({
      where: {
        userId_groupId: {
          userId,
          groupId: request.groupId || null
        }
      },
      create: {
        userId,
        groupId: request.groupId,
        frequency: request.frequency,
        mutedUntil: request.mutedUntil
      },
      update: {
        frequency: request.frequency,
        mutedUntil: request.mutedUntil
      }
    });
  }

  async getPreferences(userId: string): Promise<NotificationPreferenceResponse> {
    const prefs = await prisma.notificationPreference.findMany({
      where: { userId },
      include: { group: { select: { id: true, name: true } } }
    });

    const globalPref = prefs.find(p => !p.groupId);
    const groupPrefs = prefs.filter(p => p.groupId);

    return {
      global: globalPref?.frequency || NotificationFrequency.IMMEDIATE,
      groups: groupPrefs.map(p => ({
        groupId: p.groupId!,
        groupName: p.group!.name,
        frequency: p.frequency,
        mutedUntil: p.mutedUntil || undefined
      }))
    };
  }
}
```

### Task 3.2: Digest Batching

**File**: `services/notification-service/src/digest/DigestBatcher.ts` (create)

```typescript
// Run daily/weekly to send digest notifications
interface DigestNotification {
  userId: string;
  frequency: 'DAILY_DIGEST' | 'WEEKLY_DIGEST';
  items: Array<{
    type: 'new_post' | 'new_member' | 'reply' | 'mention';
    groupId: string;
    groupName: string;
    count: number;
    preview?: string;
  }>;
}

class DigestBatcher {
  // Runs via cron job
  async sendDailyDigests(): Promise<void> {
    const users = await prisma.notificationPreference.findMany({
      where: { frequency: NotificationFrequency.DAILY_DIGEST },
      include: { user: true }
    });

    for (const pref of users) {
      const digest = await this.buildDigest(pref.userId, 'daily');
      if (digest.items.length > 0) {
        await this.sendDigest(pref.user, digest);
      }
    }
  }

  async buildDigest(
    userId: string,
    period: 'daily' | 'weekly'
  ): Promise<DigestNotification> {
    const since = period === 'daily'
      ? new Date(Date.now() - 24 * 60 * 60 * 1000)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Aggregate notifications since the last digest
    // Group by type and group
    // Return summary
  }
}
```

### Task 3.3: Smart Batching

**File**: `services/notification-service/src/batching/SmartBatcher.ts` (create)

```typescript
// For IMMEDIATE notifications, batch rapid events
// Example: 5 replies in 2 minutes = 1 notification "You have 5 new replies"

interface BatchRule {
  windowMs: number;      // Time window to batch events
  maxEvents: number;     // Max events before sending
  eventTypes: string[];  // Which events to batch
}

const BATCH_RULES: BatchRule[] = [
  {
    windowMs: 2 * 60 * 1000,  // 2 minutes
    maxEvents: 5,
    eventTypes: ['reply', 'like']
  },
  {
    windowMs: 5 * 60 * 1000,  // 5 minutes
    maxEvents: 10,
    eventTypes: ['new_post']
  }
];

// Reduces notification noise without missing important updates
```

---

## Epic 4: Analytics Dashboard (Internal)

**Owner**: analytics-service
**Priority**: 🟢 Medium

### Task 4.1: Event Tracking

**File**: `services/analytics-service/src/tracking/EventTracker.ts` (create)

```typescript
// Events to track
enum AnalyticsEventType {
  USER_SIGNUP = 'user_signup',
  USER_LOGIN = 'user_login',
  USER_ACTIVE = 'user_active',           // Daily active
  POST_CREATED = 'post_created',
  POST_VIEWED = 'post_viewed',
  GROUP_CREATED = 'group_created',
  GROUP_JOINED = 'group_joined',
  GROUP_LEFT = 'group_left',
  ONBOARDING_COMPLETED = 'onboarding_completed',
}

class EventTracker {
  async track(event: {
    type: AnalyticsEventType;
    userId?: string;
    groupId?: string;
    postId?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    await prisma.analyticsEvent.create({
      data: {
        eventType: event.type,
        userId: event.userId,
        groupId: event.groupId,
        postId: event.postId,
        metadata: event.metadata,
        timestamp: new Date()
      }
    });
  }
}
```

### Task 4.2: Metrics Aggregation

**File**: `services/analytics-service/src/metrics/MetricsAggregator.ts` (create)

```typescript
interface DailyMetrics {
  date: Date;
  dau: number;                    // Daily Active Users
  newUsers: number;
  postsCreated: number;
  groupsCreated: number;
  avgPostsPerGroup: number;
}

interface RetentionMetrics {
  cohort: Date;                   // Signup date
  day1Retention: number;          // % returned Day 1
  day7Retention: number;          // % returned Day 7
  day30Retention: number;         // % returned Day 30
}

class MetricsAggregator {
  // Run daily via cron
  async aggregateDailyMetrics(date: Date): Promise<DailyMetrics> {
    const startOfDay = new Date(date.setHours(0, 0, 0, 0));
    const endOfDay = new Date(date.setHours(23, 59, 59, 999));

    const dau = await prisma.analyticsEvent.groupBy({
      by: ['userId'],
      where: {
        eventType: AnalyticsEventType.USER_ACTIVE,
        timestamp: { gte: startOfDay, lte: endOfDay }
      },
      _count: true
    });

    // Calculate other metrics...

    return {
      date,
      dau: dau.length,
      // ...
    };
  }

  async calculateRetention(cohortDate: Date): Promise<RetentionMetrics> {
    // Get users who signed up on cohortDate
    // Check if they were active on Day 1, 7, 30
    // Calculate retention percentages
  }
}
```

### Task 4.3: Dashboard Endpoints (Internal Only)

**File**: `services/analytics-service/src/routes/dashboard.routes.ts` (create)

```typescript
// GET /analytics/daily?from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns daily metrics for date range

// GET /analytics/retention?cohort=YYYY-MM-DD
// Returns retention metrics for cohort

// GET /analytics/groups/health
interface GroupHealthResponse {
  groups: Array<{
    groupId: string;
    groupName: string;
    memberCount: number;
    postsThisWeek: number;
    activeMembers: number;
    healthScore: number;  // 0-100
  }>;
}

// Health score factors:
// - Posts per week (weighted high)
// - Active member ratio (members who posted/commented this week)
// - New member growth
// - Low moderation incidents
```

### Task 4.4: Internal Dashboard UI (Minimal)

**File**: `apps/web/src/app/(admin)/analytics/page.tsx` (create)

Simple admin-only dashboard showing:
- DAU graph (last 30 days)
- Retention cohort table
- Top 10 active groups
- New users today
- Posts created today

**Note**: This is internal-only, not user-facing. Keep it minimal.

---

## Execution Order

### Phase 1: Schema & Foundation (Day 1-2)
1. Add PostStyle, PostEmphasis, NotificationFrequency enums
2. Add PostTemplate, NotificationPreference, AnalyticsEvent models
3. Update Post, User, Group models
4. Run prisma generate
5. Verify build: 47/47

**Commit**: "feat: Sprint 3 Phase 1 - Schema updates for styling, notifications, and analytics"

### Phase 2: Text Styling (Days 3-5)
1. Create styling.service.ts
2. Create TemplateManager.ts and seed templates
3. Create preview endpoint
4. Update post creation to support styling
5. Test template system

**Commit**: "feat: Sprint 3 Phase 2 - Text styling and template system"

### Phase 3: Feed Performance (Days 6-8)
1. Implement FeedCache.ts with Redis caching
2. Convert pagination to cursor-based
3. Add prefetch endpoint
4. Add performance monitoring
5. Test feed scroll latency

**Commit**: "feat: Sprint 3 Phase 3 - Feed performance optimization"

### Phase 4: Notifications (Days 9-11)
1. Implement preferences.service.ts
2. Create digest batching system
3. Implement smart batching
4. Add preference endpoints
5. Test notification flows

**Commit**: "feat: Sprint 3 Phase 4 - Push notification tuning with user control"

### Phase 5: Analytics (Days 12-14)
1. Implement EventTracker.ts
2. Create MetricsAggregator.ts
3. Build dashboard endpoints
4. Create minimal admin UI
5. Test metrics collection

**Commit**: "feat: Sprint 3 Phase 5 - Internal analytics dashboard"

---

## API Endpoints Summary

### Post Styling (post-service)
```
POST /posts                      # Enhanced with style/emphasis/template
GET  /templates                  # Get available templates
GET  /templates?style=ANNOUNCEMENT  # Filter by style
POST /posts/preview              # Preview before posting
```

### Feed Performance (feed-service)
```
GET  /feed/home?cursor=xxx&limit=20     # Cursor-based pagination
GET  /feed/group/:id?cursor=xxx         # Group feed
GET  /feed/home/prefetch?cursor=xxx     # Prefetch next page
GET  /feed/trending?cursor=xxx          # Trending feed
```

### Notifications (notification-service)
```
GET  /notification-preferences          # Get user preferences
POST /notification-preferences          # Set preference (global or per-group)
PUT  /notification-preferences/:groupId/mute  # Mute group notifications
DELETE /notification-preferences/:groupId     # Reset to global preference
```

### Analytics (analytics-service - Internal Only)
```
POST /analytics/track                   # Track event
GET  /analytics/daily?from=xxx&to=xxx   # Daily metrics
GET  /analytics/retention?cohort=xxx    # Retention metrics
GET  /analytics/groups/health           # Group health scores
```

---

## Definition of Done

- [ ] Schema updated with all new enums and models
- [ ] Prisma client regenerated
- [ ] Text styling system implemented
- [ ] Template system seeded with 3+ templates
- [ ] Feed caching with Redis implemented
- [ ] Cursor-based pagination working
- [ ] Feed scroll latency < 50ms (tested)
- [ ] Notification preferences working
- [ ] Digest batching functional
- [ ] Smart batching reducing noise
- [ ] Event tracking capturing key metrics
- [ ] Metrics aggregation running daily
- [ ] Internal analytics dashboard live
- [ ] Build: 47/47 passing
- [ ] All changes committed and pushed

---

## Performance Targets

| Metric | Before Sprint 3 | After Sprint 3 | How to Measure |
|--------|-----------------|----------------|----------------|
| Feed load time (p95) | ~500ms | < 200ms | Server timing headers |
| Feed scroll latency | ~100ms | < 50ms | Frontend performance API |
| Cache hit rate | 0% | > 70% | Redis metrics |
| Notification noise complaints | N/A | < 10% opt-out | User preferences |

---

## Notes for Claude Code

1. **Read CLAUDE.md first** for project context
2. **Follow TypeScript conventions** — use Prisma enum imports
3. **Schema changes require** `prisma generate` after
4. **Commit after each phase** with descriptive messages
5. **Maintain 47/47 build** — don't break existing code
6. **Performance is critical** — test feed latency after caching
7. **Internal analytics only** — no user-facing vanity metrics
8. **Text-first philosophy** — styling enhances, doesn't dominate
