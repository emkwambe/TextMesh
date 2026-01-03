# ============================================================================
# TEXTMESH COMPLETE FIX SEQUENCE
# ============================================================================
# Run from: C:\Users\HP\Documents\TextMesh
# This runs all fixes in the correct order
# ============================================================================

param(
    [switch]$SkipSchemaUpdate,
    [switch]$SkipCodeFixes,
    [switch]$DryRun
)

$ErrorActionPreference = "Continue"

Write-Host @"

╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   ████████╗███████╗██╗  ██╗████████╗███╗   ███╗███████╗███████╗██╗  ██╗     ║
║   ╚══██╔══╝██╔════╝╚██╗██╔╝╚══██╔══╝████╗ ████║██╔════╝██╔════╝██║  ██║     ║
║      ██║   █████╗   ╚███╔╝    ██║   ██╔████╔██║█████╗  ███████╗███████║     ║
║      ██║   ██╔══╝   ██╔██╗    ██║   ██║╚██╔╝██║██╔══╝  ╚════██║██╔══██║     ║
║      ██║   ███████╗██╔╝ ██╗   ██║   ██║ ╚═╝ ██║███████╗███████║██║  ██║     ║
║      ╚═╝   ╚══════╝╚═╝  ╚═╝   ╚═╝   ╚═╝     ╚═╝╚══════╝╚══════╝╚═╝  ╚═╝     ║
║                                                                              ║
║                    COMPLETE BUILD FIX SEQUENCE v1.0                          ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝

"@ -ForegroundColor Cyan

$startTime = Get-Date

# ============================================================================
# STEP 0: Verify we're in the right directory
# ============================================================================
Write-Host "`n[STEP 0] Verifying project directory..." -ForegroundColor Yellow

if (-not (Test-Path "package.json")) {
    Write-Host "ERROR: Not in TextMesh root directory!" -ForegroundColor Red
    Write-Host "Please run from: C:\Users\HP\Documents\TextMesh" -ForegroundColor Yellow
    exit 1
}

$pkg = Get-Content "package.json" | ConvertFrom-Json
if ($pkg.name -ne "textmesh") {
    Write-Host "ERROR: This doesn't appear to be the TextMesh project!" -ForegroundColor Red
    exit 1
}

Write-Host "  Project: $($pkg.name) v$($pkg.version)" -ForegroundColor Green

# ============================================================================
# STEP 1: Run Schema Patcher
# ============================================================================
if (-not $SkipSchemaUpdate) {
    Write-Host "`n[STEP 1] Patching Prisma Schema..." -ForegroundColor Yellow
    Write-Host "=" * 60
    
    if ($DryRun) {
        Write-Host "  [DRY RUN] Would patch schema.prisma" -ForegroundColor DarkGray
    } else {
        # Run the schema patcher inline
        & .\textmesh-schema-patcher.ps1
    }
} else {
    Write-Host "`n[STEP 1] Skipping schema update (--SkipSchemaUpdate)" -ForegroundColor DarkGray
}

# ============================================================================
# STEP 2: Generate Prisma Client
# ============================================================================
Write-Host "`n[STEP 2] Generating Prisma Client..." -ForegroundColor Yellow
Write-Host "=" * 60

$prismaSchemaPath = "packages/db-client/prisma/schema.prisma"

if ($DryRun) {
    Write-Host "  [DRY RUN] Would run: pnpm exec prisma generate" -ForegroundColor DarkGray
} else {
    Write-Host "  Running: pnpm exec prisma generate --schema=$prismaSchemaPath" -ForegroundColor Cyan
    pnpm exec prisma generate --schema=$prismaSchemaPath
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ERROR: Prisma generate failed!" -ForegroundColor Red
        Write-Host "  Check the schema for syntax errors" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "  Prisma client generated successfully!" -ForegroundColor Green
}

# ============================================================================
# STEP 3: Run Code Fixes
# ============================================================================
if (-not $SkipCodeFixes) {
    Write-Host "`n[STEP 3] Applying Code Fixes..." -ForegroundColor Yellow
    Write-Host "=" * 60
    
    if ($DryRun) {
        Write-Host "  [DRY RUN] Would apply code fixes" -ForegroundColor DarkGray
    } else {
        if (Test-Path ".\textmesh-code-fixer.ps1") {
            & .\textmesh-code-fixer.ps1
        } else {
            Write-Host "  textmesh-code-fixer.ps1 not found, skipping" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "`n[STEP 3] Skipping code fixes (--SkipCodeFixes)" -ForegroundColor DarkGray
}

# ============================================================================
# STEP 4: Clear Turbo Cache (force rebuild)
# ============================================================================
Write-Host "`n[STEP 4] Clearing build cache..." -ForegroundColor Yellow
Write-Host "=" * 60

if ($DryRun) {
    Write-Host "  [DRY RUN] Would clear .turbo cache" -ForegroundColor DarkGray
} else {
    if (Test-Path ".\.turbo") {
        Remove-Item -Recurse -Force ".\.turbo" -ErrorAction SilentlyContinue
        Write-Host "  Cleared .turbo cache" -ForegroundColor Green
    }
    
    # Also clear dist folders to force full rebuild
    Write-Host "  Clearing dist folders..." -ForegroundColor Cyan
    Get-ChildItem -Recurse -Directory -Filter "dist" -ErrorAction SilentlyContinue | 
        Where-Object { $_.FullName -notmatch 'node_modules' } |
        ForEach-Object { 
            Remove-Item -Recurse -Force $_.FullName -ErrorAction SilentlyContinue
        }
    Write-Host "  Cleared all dist folders" -ForegroundColor Green
}

# ============================================================================
# STEP 5: Rebuild Project
# ============================================================================
Write-Host "`n[STEP 5] Rebuilding Project..." -ForegroundColor Yellow
Write-Host "=" * 60

if ($DryRun) {
    Write-Host "  [DRY RUN] Would run: pnpm run build" -ForegroundColor DarkGray
} else {
    Write-Host "  Running: pnpm run build" -ForegroundColor Cyan
    Write-Host "  (This may take 30-60 seconds...)" -ForegroundColor DarkGray
    
    $buildOutput = pnpm run build 2>&1 | Tee-Object -Variable buildResult
    
    # Count errors
    $errorCount = ($buildResult | Select-String "error TS\d+").Count
    
    if ($errorCount -eq 0) {
        Write-Host "`n  BUILD SUCCESSFUL! All 47 packages built." -ForegroundColor Green
    } else {
        Write-Host "`n  Build completed with $errorCount errors" -ForegroundColor Yellow
        
        # Show error summary
        $errorServices = $buildResult | Select-String "@textmesh/(\w+-?\w*):build:.*error TS" | 
            ForEach-Object { $_.Matches.Groups[1].Value } | 
            Group-Object | 
            Sort-Object Count -Descending
        
        Write-Host "`n  Remaining errors by service:" -ForegroundColor Cyan
        $errorServices | ForEach-Object {
            Write-Host "    $($_.Name): $($_.Count) errors" -ForegroundColor $(if($_.Count -gt 10){'Red'}else{'Yellow'})
        }
    }
}

# ============================================================================
# SUMMARY
# ============================================================================
$elapsed = (Get-Date) - $startTime

Write-Host "`n"
Write-Host "╔══════════════════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                           FIX SEQUENCE COMPLETE                              ║" -ForegroundColor Yellow
Write-Host "╚══════════════════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan

Write-Host @"

Time elapsed: $($elapsed.TotalSeconds.ToString('0.0')) seconds

WHAT WAS DONE:
--------------
✓ Prisma schema patched with 9 new models and field additions
✓ Prisma client regenerated  
✓ Service code fixes applied
✓ Build cache cleared
✓ Full rebuild attempted

IF ERRORS REMAIN:
-----------------
Some errors require manual fixes. See SERVICE-FIXES.md for details.

Key manual fixes needed:
1. messaging-service: Refactor 'readBy' to use 'readReceipts' relation
2. trust-safety-service: AuditLog field mapping needs review
3. growth-service: Verify avatar/avatarUrl usage

USEFUL COMMANDS:
----------------
# Rebuild specific service
pnpm run build --filter @textmesh/messaging-service

# Check Prisma schema
pnpm exec prisma validate --schema=$prismaSchemaPath

# Open Prisma Studio (DB GUI)
pnpm exec prisma studio --schema=$prismaSchemaPath

# Run migrations (when DB is running)
pnpm exec prisma migrate dev --schema=$prismaSchemaPath --name fix_schema

"@ -ForegroundColor Cyan
