<#
.SYNOPSIS
    Add missing fields to existing Prisma models
.DESCRIPTION
    Adds fields like onboardingCompleted, isBanned, isHidden, etc. to existing models
#>

$ErrorActionPreference = "Stop"
$schemaPath = ".\packages\db-client\prisma\schema.prisma"

Write-Host "=== Adding Missing Fields to Existing Models ===" -ForegroundColor Cyan
Write-Host ""

$schema = Get-Content $schemaPath -Raw

# Track changes
$changes = @()

# === USER MODEL ===
# Add onboardingCompleted and isBanned to User model
if ($schema -match "model User \{" -and $schema -notmatch "onboardingCompleted\s+Boolean") {
    # Find the User model and add fields before the closing brace
    $schema = $schema -replace "(model User \{[^}]+)(updatedAt\s+DateTime[^\n]*\n)(\s*\})", "`$1`$2  onboardingCompleted Boolean  @default(false)`n  isBanned           Boolean  @default(false)`n`$3"
    $changes += "User: added onboardingCompleted, isBanned"
}

# === POST MODEL ===
# Add isHidden to Post model
if ($schema -match "model Post \{" -and $schema -notmatch "isHidden\s+Boolean") {
    $schema = $schema -replace "(model Post \{[^}]+)(updatedAt\s+DateTime[^\n]*\n)(\s*@@)", "`$1`$2  isHidden  Boolean  @default(false)`n`n  `$3"
    $changes += "Post: added isHidden"
}

# === MESSAGE MODEL ===
# Add replyToId, isDeleted, isEdited to Message model
if ($schema -match "model Message \{" -and $schema -notmatch "replyToId\s+String") {
    $schema = $schema -replace "(model Message \{[^}]+)(content\s+String[^\n]*\n)", "`$1`$2  replyToId String?`n  isDeleted Boolean @default(false)`n  isEdited  Boolean @default(false)`n"
    $changes += "Message: added replyToId, isDeleted, isEdited"
}

# === CONVERSATIONPARTICIPANT MODEL ===
# Add leftAt, deletedAt to ConversationParticipant model
if ($schema -match "model ConversationParticipant \{" -and $schema -notmatch "leftAt\s+DateTime") {
    $schema = $schema -replace "(model ConversationParticipant \{[^}]+)(lastReadAt\s+DateTime[^\n]*\n)(\s*@@)", "`$1`$2  leftAt    DateTime?`n  deletedAt DateTime?`n`n  `$3"
    $changes += "ConversationParticipant: added leftAt, deletedAt"
}

# === MEDIA MODEL ===
# Add variants and originalFilename to Media model  
if ($schema -match "model Media \{" -and $schema -notmatch "variants\s+") {
    $schema = $schema -replace "(model Media \{[^}]+)(metadata\s+Json[^\n]*\n)", "`$1`$2  variants         Json?`n  originalFilename String?`n"
    $changes += "Media: added variants, originalFilename"
}

# Report changes
Write-Host ""
if ($changes.Count -gt 0) {
    Write-Host "Changes made:" -ForegroundColor Green
    foreach ($change in $changes) {
        Write-Host "  - $change" -ForegroundColor Green
    }
    
    # Write updated schema
    $schema | Out-File $schemaPath -Encoding UTF8 -NoNewline
    Write-Host ""
    Write-Host "[OK] Schema updated with new fields" -ForegroundColor Green
} else {
    Write-Host "[OK] All required fields already exist" -ForegroundColor Green
}

Write-Host ""
