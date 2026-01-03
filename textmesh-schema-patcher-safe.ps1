<#
.SYNOPSIS
    Safe TextMesh Prisma Schema Patcher
.DESCRIPTION
    Adds missing models and fields to the Prisma schema without breaking existing structure.
    Creates backup before changes and validates schema after.
#>

param(
    [switch]$DryRun,
    [switch]$SkipBackup
)

$ErrorActionPreference = "Stop"
$schemaPath = ".\packages\db-client\prisma\schema.prisma"

Write-Host "=== TextMesh Safe Schema Patcher ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Create backup
if (-not $SkipBackup) {
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupPath = "$schemaPath.backup-$timestamp"
    Copy-Item $schemaPath $backupPath
    Write-Host "[OK] Backup created: $backupPath" -ForegroundColor Green
}

# Step 2: Read current schema
$schema = Get-Content $schemaPath -Raw
Write-Host "[OK] Schema loaded" -ForegroundColor Green

# Step 3: Define what we need to add

# New enums to add (if not present)
$newEnums = @"

// === ADDED BY SCHEMA PATCHER ===

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
  SEXUAL_CONTENT
  MISINFORMATION
  IMPERSONATION
  COPYRIGHT
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

# New models to add
$newModels = @"

// === NEW MODELS ADDED BY SCHEMA PATCHER ===

model Like {
  id        String   @id @default(cuid())
  userId    String
  postId    String
  createdAt DateTime @default(now())

  @@unique([userId, postId])
  @@index([postId])
  @@index([userId])
}

model Comment {
  id        String   @id @default(cuid())
  content   String
  userId    String
  postId    String
  parentId  String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([postId])
  @@index([userId])
  @@index([parentId])
}

model Repost {
  id        String   @id @default(cuid())
  userId    String
  postId    String
  comment   String?
  createdAt DateTime @default(now())

  @@unique([userId, postId])
  @@index([postId])
  @@index([userId])
}

model MessageReadReceipt {
  id        String   @id @default(cuid())
  messageId String
  userId    String
  readAt    DateTime @default(now())

  @@unique([messageId, userId])
  @@index([messageId])
  @@index([userId])
}

model MessageReaction {
  id        String   @id @default(cuid())
  messageId String
  userId    String
  emoji     String
  createdAt DateTime @default(now())

  @@unique([messageId, userId, emoji])
  @@index([messageId])
  @@index([userId])
}

model Appeal {
  id           String       @id @default(cuid())
  odriUserId   String
  odriActionId String
  odriType     String
  reason       String
  evidence     String?
  status       AppealStatus @default(PENDING)
  reviewerId   String?
  reviewNotes  String?
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt
  resolvedAt   DateTime?

  @@index([odriUserId])
  @@index([status])
}

model Violation {
  id          String            @id @default(cuid())
  userId      String
  type        ViolationType
  severity    ViolationSeverity
  description String
  evidence    String?
  actionTaken String?
  createdAt   DateTime          @default(now())
  resolvedAt  DateTime?

  @@index([userId])
  @@index([type])
  @@index([severity])
}

model Warning {
  id             String        @id @default(cuid())
  userId         String
  reason         String
  severity       ViolationSeverity
  status         WarningStatus @default(ACTIVE)
  acknowledgedAt DateTime?
  expiresAt      DateTime?
  createdAt      DateTime      @default(now())

  @@index([userId])
  @@index([status])
}

model ShadowBan {
  id        String          @id @default(cuid())
  userId    String
  reason    String
  status    ShadowBanStatus @default(ACTIVE)
  scope     String          @default("global")
  createdAt DateTime        @default(now())
  expiresAt DateTime?
  liftedAt  DateTime?
  liftedBy  String?

  @@index([userId])
  @@index([status])
}
"@

# Step 4: Check what's already present
$changes = @()

# Check enums
$enumsToAdd = @("AppealStatus", "ViolationType", "ViolationSeverity", "WarningStatus", "ShadowBanStatus")
$missingEnums = @()
foreach ($enum in $enumsToAdd) {
    if ($schema -notmatch "enum $enum \{") {
        $missingEnums += $enum
    }
}

# Check models
$modelsToAdd = @("Like", "Comment", "Repost", "MessageReadReceipt", "MessageReaction", "Appeal", "Violation", "Warning", "ShadowBan")
$missingModels = @()
foreach ($model in $modelsToAdd) {
    if ($schema -notmatch "model $model \{") {
        $missingModels += $model
    }
}

Write-Host ""
Write-Host "Analysis:" -ForegroundColor Yellow
Write-Host "  Missing enums: $($missingEnums -join ', ')" 
Write-Host "  Missing models: $($missingModels -join ', ')"
Write-Host ""

if ($missingEnums.Count -eq 0 -and $missingModels.Count -eq 0) {
    Write-Host "[OK] All required enums and models already exist!" -ForegroundColor Green
    exit 0
}

if ($DryRun) {
    Write-Host "[DRY RUN] Would add:" -ForegroundColor Yellow
    Write-Host "  - $($missingEnums.Count) enums"
    Write-Host "  - $($missingModels.Count) models"
    Write-Host ""
    Write-Host "Run without -DryRun to apply changes."
    exit 0
}

# Step 5: Add missing content
$newContent = $schema

# Add enums if any are missing
if ($missingEnums.Count -gt 0) {
    # Find a good place to insert enums (after existing enums or before first model)
    if ($newContent -match "(?s)(enum \w+ \{[^}]+\})") {
        # Add after last enum
        $lastEnumMatch = [regex]::Matches($newContent, "(?s)enum \w+ \{[^}]+\}") | Select-Object -Last 1
        $insertPos = $lastEnumMatch.Index + $lastEnumMatch.Length
        $newContent = $newContent.Insert($insertPos, $newEnums)
        Write-Host "[OK] Added $($missingEnums.Count) new enums" -ForegroundColor Green
    }
}

# Add models at the end
if ($missingModels.Count -gt 0) {
    $newContent = $newContent.TrimEnd() + "`n" + $newModels
    Write-Host "[OK] Added $($missingModels.Count) new models" -ForegroundColor Green
}

# Step 6: Write updated schema
$newContent | Out-File $schemaPath -Encoding UTF8 -NoNewline
Write-Host "[OK] Schema file updated" -ForegroundColor Green

# Step 7: Validate schema
Write-Host ""
Write-Host "Validating schema..." -ForegroundColor Yellow

# Try to find prisma
$prismaPath = $null
$possiblePaths = @(
    ".\node_modules\.bin\prisma.cmd",
    ".\node_modules\prisma\build\index.js",
    ".\packages\db-client\node_modules\.bin\prisma.cmd"
)

foreach ($path in $possiblePaths) {
    if (Test-Path $path) {
        $prismaPath = $path
        break
    }
}

if ($prismaPath) {
    try {
        $validateResult = & $prismaPath validate --schema=$schemaPath 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "[OK] Schema validation passed!" -ForegroundColor Green
        } else {
            Write-Host "[ERROR] Schema validation failed:" -ForegroundColor Red
            Write-Host $validateResult
            Write-Host ""
            Write-Host "Restoring backup..." -ForegroundColor Yellow
            if (-not $SkipBackup) {
                Copy-Item $backupPath $schemaPath -Force
                Write-Host "[OK] Backup restored" -ForegroundColor Green
            }
            exit 1
        }
    } catch {
        Write-Host "[WARN] Could not run prisma validate: $_" -ForegroundColor Yellow
    }
} else {
    Write-Host "[WARN] Prisma CLI not found, skipping validation" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Schema Patcher Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Generate Prisma client:"
Write-Host "     pnpm exec prisma generate --schema=packages/db-client/prisma/schema.prisma"
Write-Host ""
Write-Host "  2. Clear turbo cache and rebuild:"
Write-Host "     Remove-Item -Recurse -Force .\.turbo -ErrorAction SilentlyContinue"
Write-Host "     pnpm run build"
Write-Host ""
