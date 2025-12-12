# ===========================================
# TextMesh Deployment Verification Script
# ===========================================
# Run: powershell -ExecutionPolicy Bypass -File .\scripts\verify-deployment.ps1

param(
    [switch]$SkipInstall,
    [switch]$SkipBuild,
    [switch]$Verbose
)

$ErrorActionPreference = "Continue"
$script:errors = @()
$script:warnings = @()

function Write-Status {
    param([string]$Message, [string]$Status = "INFO")
    $color = switch ($Status) {
        "OK"    { "Green" }
        "FAIL"  { "Red" }
        "WARN"  { "Yellow" }
        "INFO"  { "Cyan" }
        default { "White" }
    }
    Write-Host "[$Status] " -ForegroundColor $color -NoNewline
    Write-Host $Message
}

function Test-PathExists {
    param([string]$Path, [string]$Description)
    if (Test-Path $Path) {
        Write-Status "$Description exists" "OK"
        return $true
    } else {
        Write-Status "$Description MISSING: $Path" "FAIL"
        $script:errors += "Missing: $Path"
        return $false
    }
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  TextMesh Deployment Verification" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# ===========================================
# 1. Git Status Check
# ===========================================
Write-Host "`n--- Git Status ---" -ForegroundColor Yellow

$gitBranch = git branch --show-current 2>$null
Write-Status "Current branch: $gitBranch" "INFO"

$gitStatus = git status --porcelain 2>$null
if ([string]::IsNullOrEmpty($gitStatus)) {
    Write-Status "Working tree is clean" "OK"
} else {
    Write-Status "Uncommitted changes detected" "WARN"
    $script:warnings += "Uncommitted changes in working tree"
}

Write-Host "`nRecent commits:" -ForegroundColor Gray
git log --oneline -5

# ===========================================
# 2. Core Services Check
# ===========================================
Write-Host "`n--- Core Services ---" -ForegroundColor Yellow

$coreServices = @(
    "services/auth-service",
    "services/user-service",
    "services/post-service",
    "services/feed-service",
    "services/notification-service",
    "services/group-service",
    "services/search-service",
    "services/moderation-service"
)

foreach ($service in $coreServices) {
    Test-PathExists "$service/package.json" $service | Out-Null
}

# ===========================================
# 3. NEW Priority 1 Services Check
# ===========================================
Write-Host "`n--- Priority 1 Services (NEW) ---" -ForegroundColor Yellow

$newServices = @{
    "services/messaging-service" = @(
        "package.json",
        "tsconfig.json",
        "src/index.ts",
        "src/services/conversation.service.ts",
        "src/services/message.service.ts",
        "src/routes/conversation.routes.ts",
        "src/routes/message.routes.ts"
    )
    "services/media-service" = @(
        "package.json",
        "tsconfig.json",
        "src/index.ts",
        "src/services/media.service.ts",
        "src/storage/s3.provider.ts",
        "src/processors/image.processor.ts",
        "src/processors/video.processor.ts",
        "src/routes/upload.routes.ts",
        "src/routes/media.routes.ts"
    )
    "services/realtime-gateway" = @(
        "package.json",
        "tsconfig.json",
        "src/index.ts",
        "src/socket/server.ts",
        "src/socket/handlers.ts",
        "src/services/presence.service.ts",
        "src/services/room.service.ts",
        "src/handlers/notification.handler.ts",
        "src/handlers/message.handler.ts",
        "src/handlers/feed.handler.ts"
    )
}

foreach ($service in $newServices.Keys) {
    Write-Host "`n  Checking $service..." -ForegroundColor Gray
    foreach ($file in $newServices[$service]) {
        Test-PathExists "$service/$file" "  - $file" | Out-Null
    }
}

# ===========================================
# 4. Feed Enhancement Files
# ===========================================
Write-Host "`n--- Feed Service Enhancements ---" -ForegroundColor Yellow

$feedEnhancements = @(
    "services/feed-service/src/services/fanout.service.ts",
    "services/feed-service/src/services/precompute.service.ts"
)

foreach ($file in $feedEnhancements) {
    Test-PathExists $file $file | Out-Null
}

# ===========================================
# 5. Database Client Enhancements
# ===========================================
Write-Host "`n--- Database Client Enhancements ---" -ForegroundColor Yellow

$dbEnhancements = @(
    "packages/db-client/src/replica.ts",
    "packages/db-client/src/connection-pool.ts"
)

foreach ($file in $dbEnhancements) {
    Test-PathExists $file $file | Out-Null
}

# ===========================================
# 6. Shared Packages Check
# ===========================================
Write-Host "`n--- Shared Packages ---" -ForegroundColor Yellow

$packages = @(
    "packages/db-client",
    "packages/event-bus",
    "packages/logger",
    "packages/api-client"
)

foreach ($pkg in $packages) {
    Test-PathExists "$pkg/package.json" $pkg | Out-Null
}

# ===========================================
# 7. Infrastructure Check
# ===========================================
Write-Host "`n--- Infrastructure ---" -ForegroundColor Yellow

$infraFiles = @(
    "docker-compose.yml",
    "k8s/base/kustomization.yaml",
    "monitoring/prometheus/prometheus.yml",
    "monitoring/grafana/dashboards"
)

foreach ($file in $infraFiles) {
    Test-PathExists $file $file | Out-Null
}

# ===========================================
# 8. Dependencies Installation Check
# ===========================================
if (-not $SkipInstall) {
    Write-Host "`n--- Dependencies Check ---" -ForegroundColor Yellow

    if (Get-Command pnpm -ErrorAction SilentlyContinue) {
        Write-Status "pnpm is installed" "OK"

        Write-Host "Running pnpm install..." -ForegroundColor Gray
        $installResult = pnpm install 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Status "Dependencies installed successfully" "OK"
        } else {
            Write-Status "Dependency installation had issues" "WARN"
            $script:warnings += "pnpm install reported issues"
            if ($Verbose) { Write-Host $installResult -ForegroundColor Gray }
        }
    } else {
        Write-Status "pnpm not found - skipping install" "WARN"
        $script:warnings += "pnpm not installed"
    }
} else {
    Write-Status "Skipping dependency installation (use -SkipInstall:$false to enable)" "INFO"
}

# ===========================================
# 9. TypeScript Build Check
# ===========================================
if (-not $SkipBuild) {
    Write-Host "`n--- TypeScript Build Check ---" -ForegroundColor Yellow

    if (Get-Command pnpm -ErrorAction SilentlyContinue) {
        Write-Host "Running TypeScript compilation check..." -ForegroundColor Gray
        $buildResult = pnpm exec tsc --noEmit 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Status "TypeScript compilation passed" "OK"
        } else {
            Write-Status "TypeScript compilation has errors" "WARN"
            $script:warnings += "TypeScript compilation errors"
            if ($Verbose) {
                Write-Host "Build output:" -ForegroundColor Gray
                Write-Host $buildResult -ForegroundColor Gray
            }
        }
    }
} else {
    Write-Status "Skipping build check (use -SkipBuild:$false to enable)" "INFO"
}

# ===========================================
# 10. File Count Summary
# ===========================================
Write-Host "`n--- File Statistics ---" -ForegroundColor Yellow

$tsFiles = (Get-ChildItem -Recurse -Filter "*.ts" -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch "node_modules|dist" }).Count
$jsonFiles = (Get-ChildItem -Recurse -Filter "package.json" -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch "node_modules" }).Count
$yamlFiles = (Get-ChildItem -Recurse -Filter "*.yaml" -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch "node_modules" }).Count

Write-Status "TypeScript files: $tsFiles" "INFO"
Write-Status "Package.json files: $jsonFiles" "INFO"
Write-Status "YAML config files: $yamlFiles" "INFO"

# ===========================================
# Summary
# ===========================================
Write-Host "`n==========================================" -ForegroundColor Cyan
Write-Host "  VERIFICATION SUMMARY" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

if ($script:errors.Count -eq 0 -and $script:warnings.Count -eq 0) {
    Write-Host "`n  ALL CHECKS PASSED!" -ForegroundColor Green
    Write-Host "  TextMesh deployment is complete.`n" -ForegroundColor Green
    exit 0
} else {
    if ($script:errors.Count -gt 0) {
        Write-Host "`n  ERRORS ($($script:errors.Count)):" -ForegroundColor Red
        foreach ($err in $script:errors) {
            Write-Host "    - $err" -ForegroundColor Red
        }
    }
    if ($script:warnings.Count -gt 0) {
        Write-Host "`n  WARNINGS ($($script:warnings.Count)):" -ForegroundColor Yellow
        foreach ($warn in $script:warnings) {
            Write-Host "    - $warn" -ForegroundColor Yellow
        }
    }
    Write-Host ""
    exit 1
}
