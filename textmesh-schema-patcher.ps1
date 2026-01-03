# ============================================================================
# TEXTMESH SCHEMA AUTO-PATCHER
# ============================================================================
# Run from: C:\Users\HP\Documents\TextMesh
# This script automatically patches your Prisma schema with missing models
# ============================================================================

$ErrorActionPreference = "Stop"

Write-Host @"

 ███████╗ ██████╗██╗  ██╗███████╗███╗   ███╗ █████╗ 
 ██╔════╝██╔════╝██║  ██║██╔════╝████╗ ████║██╔══██╗
 ███████╗██║     ███████║█████╗  ██╔████╔██║███████║
 ╚════██║██║     ██╔══██║██╔══╝  ██║╚██╔╝██║██╔══██║
 ███████║╚██████╗██║  ██║███████╗██║ ╚═╝ ██║██║  ██║
 ╚══════╝ ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝     ╚═╝╚═╝  ╚═╝
           AUTO-PATCHER v1.0

"@ -ForegroundColor Magenta

$schemaPath = ".\packages\db-client\prisma\schema.prisma"

# Verify schema exists
if (-not (Test-Path $schemaPath)) {
    Write-Host "ERROR: Schema not found at $schemaPath" -ForegroundColor Red
    exit 1
}

# Create backup
$backupPath = "$schemaPath.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item $schemaPath $backupPath
Write-Host "[OK] Backup created: $backupPath" -ForegroundColor Green

# Read current schema
$schema = Get-Content $schemaPath -Raw

# ============================================================================
# STEP 1: Add new enums (before first model)
# ============================================================================
Write-Host "`n[STEP 1] Adding new enums..." -ForegroundColor Cyan

$newEnums = @"

// ============================================================================
// ADDED BY AUTO-PATCHER - New Enums for Trust & Safety
// ============================================================================

enum AppealStatus {
  PENDING
  UNDER_REVIEW
  APPROVED
  REJECTED
  ESCALATED
}

enum ViolationType {
  SPAM
  HARASSMENT
  HATE_SPEECH
  VIOLENCE
  MISINFORMATION
  NUDITY
  SELF_HARM
  IMPERSONATION
  COPYRIGHT
  COMMUNITY_GUIDELINES
  OTHER
}

enum ViolationSeverity {
  LOW
  MEDIUM
  HIGH
  CRITICAL
}

enum WarningStatus {
  ACTIVE
  ACKNOWLEDGED
  EXPIRED
  APPEALED
}

enum ShadowBanStatus {
  ACTIVE
  LIFTED
  EXPIRED
}

"@

# Find position before first model to insert enums
if ($schema -notmatch 'enum AppealStatus') {
    $schema = $schema -replace '(model User \{)', "$newEnums`$1"
    Write-Host "  Added 5 new enums" -ForegroundColor Green
} else {
    Write-Host "  Enums already exist, skipping" -ForegroundColor Yellow
}

# ============================================================================
# STEP 2: Add fields to User model
# ============================================================================
Write-Host "`n[STEP 2] Patching User model..." -ForegroundColor Cyan

$userAdditions = @"

  // ADDED BY AUTO-PATCHER
  onboardingCompleted Boolean @default(false)
  isBanned            Boolean @default(false)

  // New relations for engagement
  likesGiven          Like[]              @relation("UserLikes")
  commentsWritten     Comment[]           @relation("UserComments")
  repostsCreated      Repost[]            @relation("UserReposts")
  
  // New relations for messaging
  messageReadReceipts MessageReadReceipt[] @relation("UserReadReceipts")
  messageReactions    MessageReaction[]   @relation("UserMessageReactions")
  
  // New relations for trust & safety
  appeals             Appeal[]            @relation("UserAppeals")
  reviewedAppeals     Appeal[]            @relation("ReviewerAppeals")
  shadowBansReceived  ShadowBan[]         @relation("UserShadowBans")
  shadowBansIssued    ShadowBan[]         @relation("IssuedShadowBans")
  violations          Violation[]         @relation("UserViolations")
  reviewedViolations  Violation[]         @relation("ReviewerViolations")
  warningsReceived    Warning[]           @relation("UserWarnings")
  warningsIssued      Warning[]           @relation("IssuedWarnings")

"@

if ($schema -notmatch 'onboardingCompleted') {
    # Find the closing of User model relations and add before @@
    $schema = $schema -replace '(model User \{[^}]+)(@@)', "`$1$userAdditions`$2"
    Write-Host "  Added onboardingCompleted, isBanned, and relations" -ForegroundColor Green
} else {
    Write-Host "  User fields already exist, skipping" -ForegroundColor Yellow
}

# ============================================================================
# STEP 3: Add fields to ConversationParticipant model
# ============================================================================
Write-Host "`n[STEP 3] Patching ConversationParticipant model..." -ForegroundColor Cyan

if ($schema -notmatch 'ConversationParticipant[^}]+leftAt') {
    $schema = $schema -replace '(model ConversationParticipant \{[^}]+lastReadAt\s+DateTime[^\n]*)', "`$1`n  leftAt    DateTime?`n  deletedAt DateTime?"
    Write-Host "  Added leftAt and deletedAt fields" -ForegroundColor Green
} else {
    Write-Host "  Fields already exist, skipping" -ForegroundColor Yellow
}

# ============================================================================
# STEP 4: Add fields to Message model  
# ============================================================================
Write-Host "`n[STEP 4] Patching Message model..." -ForegroundColor Cyan

$messageAdditions = @"

  // ADDED BY AUTO-PATCHER
  replyToId    String?
  replyTo      Message?  @relation("MessageReplies", fields: [replyToId], references: [id], onDelete: SetNull)
  replies      Message[] @relation("MessageReplies")
  isDeleted    Boolean   @default(false)
  isEdited     Boolean   @default(false)
  
  readReceipts MessageReadReceipt[] @relation("MessageReadReceipts")
  reactions    MessageReaction[]    @relation("MessageReactions")

"@

if ($schema -notmatch 'Message[^}]+replyToId') {
    $schema = $schema -replace '(model Message \{[^}]+sender\s+User[^\n]*)', "`$1$messageAdditions"
    Write-Host "  Added replyToId, isDeleted, isEdited, and relations" -ForegroundColor Green
} else {
    Write-Host "  Fields already exist, skipping" -ForegroundColor Yellow
}

# ============================================================================
# STEP 5: Add fields to Post model
# ============================================================================
Write-Host "`n[STEP 5] Patching Post model..." -ForegroundColor Cyan

$postAdditions = @"

  // ADDED BY AUTO-PATCHER
  isHidden    Boolean   @default(false)
  
  likesNew    Like[]    @relation("PostLikesNew")
  comments    Comment[] @relation("PostComments")
  reposts     Repost[]  @relation("PostReposts")

"@

if ($schema -notmatch 'Post[^}]+isHidden') {
    $schema = $schema -replace '(model Post \{[^}]+)(@@map)', "$postAdditions`$1`$2"
    Write-Host "  Added isHidden and new relations" -ForegroundColor Green
} else {
    Write-Host "  Fields already exist, skipping" -ForegroundColor Yellow
}

# ============================================================================
# STEP 6: Add timestamp to AuditLog model
# ============================================================================
Write-Host "`n[STEP 6] Patching AuditLog model..." -ForegroundColor Cyan

if ($schema -notmatch 'AuditLog[^}]+timestamp') {
    $schema = $schema -replace '(model AuditLog \{[^}]+id\s+String[^\n]*)', "`$1`n  timestamp DateTime @default(now())"
    Write-Host "  Added timestamp field" -ForegroundColor Green
} else {
    Write-Host "  Field already exists, skipping" -ForegroundColor Yellow
}

# ============================================================================
# STEP 7: Add new models at the end
# ============================================================================
Write-Host "`n[STEP 7] Adding new models..." -ForegroundColor Cyan

$newModels = @"

// ============================================================================
// ADDED BY AUTO-PATCHER - Engagement Models
// ============================================================================

model Like {
  id        String   @id @default(cuid())
  userId    String
  postId    String
  createdAt DateTime @default(now())

  user User @relation("UserLikes", fields: [userId], references: [id], onDelete: Cascade)
  post Post @relation("PostLikesNew", fields: [postId], references: [id], onDelete: Cascade)

  @@unique([userId, postId])
  @@index([postId])
  @@index([userId])
  @@index([createdAt])
  @@map("likes")
}

model Comment {
  id        String   @id @default(cuid())
  content   String   @db.Text
  userId    String
  postId    String
  parentId  String?
  isEdited  Boolean  @default(false)
  isDeleted Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user    User      @relation("UserComments", fields: [userId], references: [id], onDelete: Cascade)
  post    Post      @relation("PostComments", fields: [postId], references: [id], onDelete: Cascade)
  parent  Comment?  @relation("CommentReplies", fields: [parentId], references: [id], onDelete: SetNull)
  replies Comment[] @relation("CommentReplies")

  @@index([postId])
  @@index([userId])
  @@index([parentId])
  @@index([createdAt])
  @@map("comments")
}

model Repost {
  id        String   @id @default(cuid())
  userId    String
  postId    String
  quote     String?  @db.Text
  createdAt DateTime @default(now())

  user User @relation("UserReposts", fields: [userId], references: [id], onDelete: Cascade)
  post Post @relation("PostReposts", fields: [postId], references: [id], onDelete: Cascade)

  @@unique([userId, postId])
  @@index([postId])
  @@index([userId])
  @@index([createdAt])
  @@map("reposts")
}

// ============================================================================
// ADDED BY AUTO-PATCHER - Messaging Models
// ============================================================================

model MessageReadReceipt {
  id        String   @id @default(cuid())
  messageId String
  userId    String
  readAt    DateTime @default(now())

  message Message @relation("MessageReadReceipts", fields: [messageId], references: [id], onDelete: Cascade)
  user    User    @relation("UserReadReceipts", fields: [userId], references: [id], onDelete: Cascade)

  @@unique([messageId, userId])
  @@index([messageId])
  @@index([userId])
  @@map("message_read_receipts")
}

model MessageReaction {
  id        String   @id @default(cuid())
  messageId String
  userId    String
  emoji     String
  createdAt DateTime @default(now())

  message Message @relation("MessageReactions", fields: [messageId], references: [id], onDelete: Cascade)
  user    User    @relation("UserMessageReactions", fields: [userId], references: [id], onDelete: Cascade)

  @@unique([messageId, userId, emoji])
  @@index([messageId])
  @@index([userId])
  @@map("message_reactions")
}

// ============================================================================
// ADDED BY AUTO-PATCHER - Trust & Safety Models
// ============================================================================

model Appeal {
  id             String       @id @default(cuid())
  userId         String
  targetType     String
  targetId       String
  reason         String       @db.Text
  evidence       String?      @db.Text
  status         AppealStatus @default(PENDING)
  reviewerId     String?
  reviewNotes    String?      @db.Text
  originalAction String
  resolution     String?
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  resolvedAt     DateTime?

  user     User  @relation("UserAppeals", fields: [userId], references: [id], onDelete: Cascade)
  reviewer User? @relation("ReviewerAppeals", fields: [reviewerId], references: [id], onDelete: SetNull)

  @@index([userId])
  @@index([status])
  @@index([targetType, targetId])
  @@index([createdAt])
  @@map("appeals")
}

model ShadowBan {
  id         String          @id @default(cuid())
  userId     String
  reason     String          @db.Text
  scope      String          @default("full")
  status     ShadowBanStatus @default(ACTIVE)
  issuedBy   String
  expiresAt  DateTime?
  liftedAt   DateTime?
  liftedBy   String?
  liftReason String?         @db.Text
  createdAt  DateTime        @default(now())
  updatedAt  DateTime        @updatedAt

  user   User @relation("UserShadowBans", fields: [userId], references: [id], onDelete: Cascade)
  issuer User @relation("IssuedShadowBans", fields: [issuedBy], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([status])
  @@index([expiresAt])
  @@map("shadow_bans")
}

model Violation {
  id          String            @id @default(cuid())
  userId      String
  type        ViolationType
  severity    ViolationSeverity
  description String            @db.Text
  contentId   String?
  contentType String?
  evidence    String?           @db.Text
  detectedBy  String
  reviewerId  String?
  actionTaken String?
  createdAt   DateTime          @default(now())
  resolvedAt  DateTime?

  user     User      @relation("UserViolations", fields: [userId], references: [id], onDelete: Cascade)
  reviewer User?     @relation("ReviewerViolations", fields: [reviewerId], references: [id], onDelete: SetNull)
  warnings Warning[] @relation("ViolationWarnings")

  @@index([userId])
  @@index([type])
  @@index([severity])
  @@index([createdAt])
  @@map("violations")
}

model Warning {
  id             String        @id @default(cuid())
  userId         String
  violationId    String?
  type           String
  message        String        @db.Text
  status         WarningStatus @default(ACTIVE)
  issuedBy       String
  acknowledgedAt DateTime?
  expiresAt      DateTime?
  createdAt      DateTime      @default(now())

  user      User       @relation("UserWarnings", fields: [userId], references: [id], onDelete: Cascade)
  issuer    User       @relation("IssuedWarnings", fields: [issuedBy], references: [id], onDelete: Cascade)
  violation Violation? @relation("ViolationWarnings", fields: [violationId], references: [id], onDelete: SetNull)

  @@index([userId])
  @@index([status])
  @@index([createdAt])
  @@map("warnings")
}
"@

if ($schema -notmatch 'model Like \{') {
    $schema = $schema + $newModels
    Write-Host "  Added 9 new models: Like, Comment, Repost, MessageReadReceipt, MessageReaction, Appeal, ShadowBan, Violation, Warning" -ForegroundColor Green
} else {
    Write-Host "  Models already exist, skipping" -ForegroundColor Yellow
}

# ============================================================================
# STEP 8: Write updated schema
# ============================================================================
Write-Host "`n[STEP 8] Writing updated schema..." -ForegroundColor Cyan

$schema | Out-File $schemaPath -Encoding UTF8 -NoNewline
Write-Host "  Schema updated successfully!" -ForegroundColor Green

# ============================================================================
# SUMMARY
# ============================================================================
Write-Host "`n" + "=" * 60 -ForegroundColor Magenta
Write-Host "  SCHEMA PATCHING COMPLETE!" -ForegroundColor Yellow
Write-Host "=" * 60 -ForegroundColor Magenta

Write-Host @"

NEXT STEPS:
-----------
1. Generate Prisma client:
   pnpm exec prisma generate --schema=packages/db-client/prisma/schema.prisma

2. Create migration (if using database):
   pnpm exec prisma migrate dev --schema=packages/db-client/prisma/schema.prisma --name add_missing_models

3. Rebuild the project:
   pnpm run build

If you need to rollback:
   Copy-Item "$backupPath" "$schemaPath" -Force

"@ -ForegroundColor Cyan
