
## TextMesh Build Fix Plan

### Priority 1: Prisma Schema Updates
The following models need to be added to schema.prisma:

- Like (for post likes)
- Comment (for post comments)  
- Repost (for reposts/retweets)
- Appeal (for moderation appeals)
- ShadowBan (for shadow ban management)
- Violation (for trust/safety violations)
- Warning (for user warnings)
- MessageReadReceipt (for read receipts)
- MessageReaction (for message reactions)

### Priority 2: Missing Fields
Add these fields to existing models:

**User model:**
- onboardingCompleted: Boolean
- isBanned: Boolean

**ConversationParticipant model:**
- leftAt: DateTime?
- deletedAt: DateTime?

**Message model:**
- replyToId: String?
- replyTo: Message? (relation)
- readBy: User[] (relation)
- isDeleted: Boolean
- isEdited: Boolean

**Post model:**
- isHidden: Boolean

**AuditLog model:**
- timestamp: DateTime

### Priority 3: Missing Dependencies
Install missing packages:
```
pnpm add cors -D --filter @textmesh/auth-service
pnpm add @types/cors -D --filter @textmesh/auth-service
```

### Priority 4: Type Fixes
- Fix MentionSetting enum usage in user-service
- Fix DeviceInfo type compatibility in auth-service
- Fix avatar vs avatarUrl property names

### Execution Order:
1. Update Prisma schema
2. Run: pnpm run db-generate (regenerate Prisma client)
3. Run: pnpm run db-migrate-dev (apply migrations)
4. Install missing dependencies
5. Rebuild: pnpm run build

