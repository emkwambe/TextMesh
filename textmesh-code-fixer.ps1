# ============================================================================
# TEXTMESH SERVICE CODE FIXER
# ============================================================================
# Run AFTER schema-patcher.ps1 and prisma generate
# Fixes TypeScript errors in service code
# ============================================================================

$ErrorActionPreference = "Continue"

Write-Host @"

 ██████╗ ██████╗ ██████╗ ███████╗    ███████╗██╗██╗  ██╗███████╗██████╗ 
██╔════╝██╔═══██╗██╔══██╗██╔════╝    ██╔════╝██║╚██╗██╔╝██╔════╝██╔══██╗
██║     ██║   ██║██║  ██║█████╗      █████╗  ██║ ╚███╔╝ █████╗  ██████╔╝
██║     ██║   ██║██║  ██║██╔══╝      ██╔══╝  ██║ ██╔██╗ ██╔══╝  ██╔══██╗
╚██████╗╚██████╔╝██████╔╝███████╗    ██║     ██║██╔╝ ██╗███████╗██║  ██║
 ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝    ╚═╝     ╚═╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝
                    Service Code Fixer v1.0

"@ -ForegroundColor Blue

# ============================================================================
# FIX 1: user-service - MentionSetting enum
# ============================================================================
Write-Host "`n[FIX 1] user-service: MentionSetting enum" -ForegroundColor Cyan
Write-Host "-" * 50

$settingsServicePath = ".\services\user-service\src\services\settings.service.ts"

if (Test-Path $settingsServicePath) {
    $content = Get-Content $settingsServicePath -Raw
    
    # Check if already fixed
    if ($content -match 'as MentionSetting') {
        Write-Host "  Already fixed, skipping" -ForegroundColor Yellow
    } else {
        # Add import for MentionSetting if not present
        if ($content -notmatch "import.*MentionSetting") {
            $content = $content -replace "(import \{ PrismaClient[^}]*\} from '@prisma/client')", "`$1`nimport { MentionSetting } from '@prisma/client'"
        }
        
        # Fix the type casting - wrap string values with enum cast
        # This is a simplified fix - the actual fix depends on the code structure
        $content = $content -replace "allowMentions:\s*([^,\n]+),", "allowMentions: (`$1) as MentionSetting,"
        $content = $content -replace "allowDirectMessages:\s*([^,\n]+),", "allowDirectMessages: (`$1) as MentionSetting,"
        
        # Write back
        $content | Out-File $settingsServicePath -Encoding UTF8 -NoNewline
        Write-Host "  Fixed MentionSetting enum casting" -ForegroundColor Green
    }
} else {
    Write-Host "  File not found: $settingsServicePath" -ForegroundColor Red
}

# ============================================================================
# FIX 2: growth-service - avatarUrl vs avatar naming
# ============================================================================
Write-Host "`n[FIX 2] growth-service: Property naming fixes" -ForegroundColor Cyan
Write-Host "-" * 50

$growthServiceFiles = @(
    ".\services\growth-service\src\engagement\AchievementSystem.ts",
    ".\services\growth-service\src\engagement\ReferralSystem.ts",
    ".\services\growth-service\src\onboarding\FollowSuggestions.ts",
    ".\services\growth-service\src\onboarding\OnboardingManager.ts",
    ".\services\growth-service\src\onboarding\ProfileWizard.ts",
    ".\services\growth-service\src\retention\RetentionHooks.ts"
)

foreach ($file in $growthServiceFiles) {
    if (Test-Path $file) {
        $content = Get-Content $file -Raw
        $changed = $false
        
        # Fix avatarUrl -> avatar in type definitions (where type expects 'avatar')
        if ($content -match "avatarUrl.*does not exist.*avatar") {
            # In object literals where type expects 'avatar', change avatarUrl to avatar
            $content = $content -replace "avatarUrl:\s*user\.avatarUrl", "avatar: user.avatarUrl"
            $content = $content -replace "avatarUrl:\s*([^,\n]+)(?=,?\s*//.*avatar)", "avatar: `$1"
            $changed = $true
        }
        
        # Fix refereeavatarUrl -> refereeAvatar (typo)
        if ($content -match 'refereeavatarUrl') {
            $content = $content -replace 'refereeavatarUrl', 'refereeAvatar'
            $changed = $true
        }
        
        # Fix hasAvatar vs hasavatarUrl
        if ($content -match 'hasavatarUrl') {
            # The type expects hasAvatar, code uses hasavatarUrl
            $content = $content -replace 'hasavatarUrl', 'hasAvatar'
            $changed = $true
        }
        
        if ($changed) {
            $content | Out-File $file -Encoding UTF8 -NoNewline
            Write-Host "  Fixed: $(Split-Path $file -Leaf)" -ForegroundColor Green
        } else {
            Write-Host "  No changes needed: $(Split-Path $file -Leaf)" -ForegroundColor DarkGray
        }
    } else {
        Write-Host "  Not found: $(Split-Path $file -Leaf)" -ForegroundColor Yellow
    }
}

# ============================================================================
# FIX 3: trust-safety-service - avatar field and ReportStatus
# ============================================================================
Write-Host "`n[FIX 3] trust-safety-service: Field naming and enums" -ForegroundColor Cyan
Write-Host "-" * 50

$trustSafetyFiles = @(
    ".\services\trust-safety-service\src\detection\BehaviorAnalyzer.ts",
    ".\services\trust-safety-service\src\scoring\RiskScorer.ts"
)

foreach ($file in $trustSafetyFiles) {
    if (Test-Path $file) {
        $content = Get-Content $file -Raw
        $changed = $false
        
        # Fix avatar -> avatarUrl in select (Prisma field is avatarUrl)
        if ($content -match "avatar:\s*true") {
            $content = $content -replace "avatar:\s*true", "avatarUrl: true"
            $changed = $true
        }
        
        # Fix accessing .avatar -> .avatarUrl
        if ($content -match "\.avatar[^U]") {
            $content = $content -replace "\.avatar(?![Uu])", ".avatarUrl"
            $changed = $true
        }
        
        # Fix ReportStatus enum values (pending -> OPEN, confirmed -> RESOLVED)
        if ($content -match "'pending'|'confirmed'") {
            $content = $content -replace "'pending'", "ReportStatus.OPEN"
            $content = $content -replace "'confirmed'", "ReportStatus.RESOLVED"
            # Add import if needed
            if ($content -notmatch "import.*ReportStatus") {
                $content = $content -replace "(import \{[^}]*\} from '@prisma/client')", "`$1`nimport { ReportStatus } from '@prisma/client'"
            }
            $changed = $true
        }
        
        if ($changed) {
            $content | Out-File $file -Encoding UTF8 -NoNewline
            Write-Host "  Fixed: $(Split-Path $file -Leaf)" -ForegroundColor Green
        } else {
            Write-Host "  No changes needed: $(Split-Path $file -Leaf)" -ForegroundColor DarkGray
        }
    } else {
        Write-Host "  Not found: $(Split-Path $file -Leaf)" -ForegroundColor Yellow
    }
}

# ============================================================================
# FIX 4: trust-safety-service - AuditLogger mapping
# ============================================================================
Write-Host "`n[FIX 4] trust-safety-service: AuditLogger field mapping" -ForegroundColor Cyan
Write-Host "-" * 50

$auditLoggerPath = ".\services\trust-safety-service\src\audit\AuditLogger.ts"

if (Test-Path $auditLoggerPath) {
    $content = Get-Content $auditLoggerPath -Raw
    
    # The AuditLog model has different fields than what the service expects
    # Key mappings needed:
    # - timestamp -> createdAt
    # - actorId -> userId  
    # - targetId -> resourceId
    # - targetType -> resource
    
    # Fix orderBy timestamp -> createdAt
    if ($content -match "timestamp:\s*'desc'") {
        $content = $content -replace "timestamp:\s*'desc'", "createdAt: 'desc'"
        $content = $content -replace "timestamp:\s*'asc'", "createdAt: 'asc'"
    }
    
    # Fix where clause timestamp -> createdAt
    if ($content -match "timestamp:\s*\{") {
        $content = $content -replace "timestamp:\s*\{", "createdAt: {"
    }
    
    $content | Out-File $auditLoggerPath -Encoding UTF8 -NoNewline
    Write-Host "  Fixed timestamp -> createdAt mappings" -ForegroundColor Green
} else {
    Write-Host "  File not found: $auditLoggerPath" -ForegroundColor Red
}

# ============================================================================
# FIX 5: messaging-service - Conversation.creatorId
# ============================================================================
Write-Host "`n[FIX 5] messaging-service: Remove unsupported fields" -ForegroundColor Cyan
Write-Host "-" * 50

$conversationServicePath = ".\services\messaging-service\src\services\conversation.service.ts"

if (Test-Path $conversationServicePath) {
    $content = Get-Content $conversationServicePath -Raw
    
    # creatorId doesn't exist in Conversation model - comment it out or remove
    if ($content -match "creatorId:") {
        $content = $content -replace "creatorId:\s*[^,\n]+,?\n?", "// creatorId removed - not in schema`n"
        Write-Host "  Commented out creatorId references" -ForegroundColor Green
    }
    
    # readBy doesn't exist on Message - it uses MessageReadReceipt relation
    # This needs manual review as it changes the data access pattern
    
    $content | Out-File $conversationServicePath -Encoding UTF8 -NoNewline
    Write-Host "  Note: readBy access pattern needs manual review" -ForegroundColor Yellow
} else {
    Write-Host "  File not found: $conversationServicePath" -ForegroundColor Red
}

# ============================================================================
# SUMMARY
# ============================================================================
Write-Host "`n" + "=" * 60 -ForegroundColor Blue
Write-Host "  CODE FIXES APPLIED" -ForegroundColor Yellow
Write-Host "=" * 60 -ForegroundColor Blue

Write-Host @"

IMPORTANT NOTES:
----------------
1. Some fixes are pattern-based and may need manual verification
2. The messaging-service 'readBy' pattern needs manual refactoring
3. Run 'pnpm run build' to verify remaining errors

MANUAL REVIEW NEEDED:
- services/messaging-service/src/services/*.ts
  - Change 'readBy' to use 'readReceipts' relation
  - Update message read status queries

NEXT STEP:
  pnpm run build

"@ -ForegroundColor Cyan
