# DashArr Configuration Backup Script
# Run this script to backup your environment configuration

$BackupDir = "$PSScriptRoot\backups"
$DateStamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$BackupFile = "$BackupDir\dasharr-env-backup-$DateStamp.zip"

# Create backup directory if it doesn't exist
if (!(Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir | Out-Null
    Write-Host "Created backup directory: $BackupDir" -ForegroundColor Green
}

# Files to backup
$FilesToBackup = @(
    "$PSScriptRoot\.env",
    "$PSScriptRoot\.env.example"
)

# Check if .env exists
if (!(Test-Path "$PSScriptRoot\.env")) {
    Write-Host "ERROR: .env file not found!" -ForegroundColor Red
    exit 1
}

# Create zip archive
try {
    Compress-Archive -Path $FilesToBackup -DestinationPath $BackupFile -Force
    Write-Host "✅ Backup created successfully: $BackupFile" -ForegroundColor Green
    
    # Show file size
    $FileSize = (Get-Item $BackupFile).Length / 1KB
    Write-Host "   File size: $([math]::Round($FileSize, 2)) KB" -ForegroundColor Gray
    
    # List recent backups
    Write-Host "`nRecent backups:" -ForegroundColor Cyan
    Get-ChildItem $BackupDir -Filter "dasharr-env-backup-*.zip" | 
        Sort-Object LastWriteTime -Descending | 
        Select-Object -First 5 | 
        ForEach-Object { Write-Host "   - $($_.Name) ($([math]::Round($_.Length / 1KB, 2)) KB)" -ForegroundColor Gray }
    
} catch {
    Write-Host "ERROR: Failed to create backup: $_" -ForegroundColor Red
    exit 1
}

Write-Host "`n💡 Tip: Store this backup in a secure location (password manager, cloud storage, etc.)" -ForegroundColor Yellow
Write-Host "   Your IGDB credentials and all other service API keys are in the .env file." -ForegroundColor Yellow
