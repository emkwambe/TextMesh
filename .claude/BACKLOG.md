# TextMesh Product Backlog

> Future sprints and features beyond Sprint 2

---

## Sprint Roadmap

| Sprint | Name | Focus | Status |
|--------|------|-------|--------|
| Sprint 1 | Foundation | Schema completion, service re-enablement | ✅ Complete |
| Sprint 2 | Onboarding & Safety | Intent-first onboarding, trust & safety | 🚧 In Progress |
| Sprint 3 | Expression & Polish | Text styling, feed performance | 📋 Planned |
| Sprint 4 | Private Alpha | Launch prep, monitoring, feedback | 📋 Planned |
| Sprint 5 | Media (Tier 1) | Annotated images | 📋 Backlog |
| Sprint 6 | Discovery | Improved group/content discovery | 📋 Backlog |

---

## Sprint 3: Expression & Polish (Week 5-6)

### Goal
Make the core expression experience delightful and fast.

### Epic 3.1: Text Styling & Templates
- [ ] Highlighted text support
- [ ] Color emphasis options
- [ ] Custom card backgrounds
- [ ] Pre-built templates (Announcement, Question, Update)
- [ ] Live preview in composer

### Epic 3.2: Feed Performance
- [ ] Feed scroll latency < 50ms
- [ ] Infinite scroll optimization
- [ ] Smart caching strategy
- [ ] Prefetching for smooth experience

### Epic 3.3: Push Notification Tuning
- [ ] Notification preferences per group
- [ ] Digest options (immediate, daily, weekly)
- [ ] Smart batching to reduce noise

### Epic 3.4: Analytics Dashboard (Internal)
- [ ] Daily Active Users (DAU)
- [ ] Retention metrics (Day 1, Day 7, Day 30)
- [ ] Posts per group
- [ ] Group health indicators

---

## Sprint 4: Private Alpha Launch (Week 7-8)

### Goal
Launch to friends, family, alumni (50-100 users).

### Epic 4.1: Launch Prep
- [ ] Invite code system
- [ ] Waitlist management
- [ ] Welcome email flow
- [ ] In-app welcome message

### Epic 4.2: Monitoring & Observability
- [ ] Error tracking (Sentry or similar)
- [ ] Performance monitoring
- [ ] Uptime monitoring
- [ ] Alert system for issues

### Epic 4.3: Feedback Collection
- [ ] In-app feedback button
- [ ] NPS survey (after 7 days)
- [ ] Bug report flow
- [ ] Feature request tracking

### Epic 4.4: Alpha Success Metrics
| Metric | Target |
|--------|--------|
| Active Users | 50-100 |
| Active Groups | 10+ |
| Posts/Group/Week | 5+ |
| Day-7 Return Rate | 60%+ |
| NPS | > 40 |

---

## Sprint 5: Media Tier 1 — Annotated Images

### Philosophy Reminder
> Media is supporting evidence, not the main act.
> No media without text. Ever.

### Rules (Non-Negotiable)
1. Images MUST be attached to text posts
2. Images appear BELOW text, never above
3. No autoplay
4. Tap to expand
5. Images are secondary in feed

### Epic 5.1: Image Upload
- [ ] Upload via presigned URLs (S3/GCS)
- [ ] Size limits enforced
- [ ] Format validation (jpg, png, webp)
- [ ] Compression pipeline

### Epic 5.2: Image Display
- [ ] Thumbnail generation
- [ ] Lazy loading in feed
- [ ] Tap to expand view
- [ ] Alt text support (accessibility)

### Epic 5.3: Annotation Tools (Optional)
- [ ] Highlight regions
- [ ] Add arrows/pointers
- [ ] Text labels on image
- [ ] Save annotated version

### Use Cases
- Tutor sharing a worked math problem
- Lecturer posting a slide excerpt
- Trainer showing posture diagram
- Study group sharing a chart

---

## Sprint 6: Discovery Improvements

### Epic 6.1: Group Discovery
- [ ] Search groups by purpose
- [ ] Filter by groupType
- [ ] "Featured Groups" (curated)
- [ ] "Groups Like Yours" recommendations

### Epic 6.2: Content Discovery (Careful)
- [ ] Trending topics within groups
- [ ] Popular posts (group-scoped)
- [ ] NO algorithmic public feed
- [ ] Discovery serves utility, not virality

### Epic 6.3: Search Enhancements
- [ ] Full-text post search
- [ ] Search within group
- [ ] Hashtag indexing
- [ ] Mention search

---

## Future Backlog (Not Scheduled)

### Tier 2 Media: Short Video Clips
- Max 30-90 seconds
- No autoplay, no looping
- Must have text explanation
- Explanation video, not entertainment

### Messaging Enhancements
- Read receipts (optional)
- Reactions
- Reply threading
- Message editing

### Monetization (Post Product-Market Fit)
- Premium features
- Group upgrades
- Creator tools
- Enterprise/institutional plans

### Advanced Trust & Safety
- ML-based content moderation
- Community guidelines enforcement
- Appeal automation
- Reputation system

### Internationalization
- Multi-language support
- RTL layout support
- Regional compliance

---

## Product Principles (Reference)

### What We Prioritize
1. Group utility over public engagement
2. Clarity over richness
3. Intent over attention
4. Small groups over massive followings
5. Text-first, media-supportive

### What We Avoid
1. Algorithmic rage amplification
2. Infinite scroll traps
3. Vanity metrics
4. Creator popularity contests
5. Media arms races

### Success Metrics That Matter
- Group retention over time
- Posts per group (usefulness)
- Time-to-first-useful-post
- Returning member rate
- Low moderation incidents

### Success Metrics We Ignore
- Follower counts
- Viral reach
- Time spent scrolling
- Engagement rate (vanity)

---

## How to Use This Backlog

### For Planning
1. Review current sprint status
2. Look ahead to next sprint
3. Adjust based on learnings

### For Claude Code
1. Reference current sprint file (e.g., SPRINT-2.md)
2. Use this file for context on future direction
3. Don't implement backlog items unless explicitly requested

### For Stakeholders
1. High-level roadmap visibility
2. Feature prioritization context
3. Philosophy documentation
