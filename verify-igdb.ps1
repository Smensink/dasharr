# Verify IGDB Configuration
# This script tests your IGDB credentials to ensure they're working

$envFile = "$PSScriptRoot\.env"

Write-Host "IGDB Configuration Verification" -ForegroundColor Cyan
Write-Host "================================`n" -ForegroundColor Cyan

# Check if .env exists
if (!(Test-Path $envFile)) {
    Write-Host "❌ ERROR: .env file not found at $envFile" -ForegroundColor Red
    exit 1
}

# Read .env file
$envContent = Get-Content $envFile -Raw

# Extract IGDB values
$igdbEnabled = if ($envContent -match 'IGDB_ENABLED=(.+)') { $matches[1].Trim() } else { '' }
$igdbClientId = if ($envContent -match 'IGDB_CLIENT_ID=(.+)') { $matches[1].Trim() } else { '' }
$igdbClientSecret = if ($envContent -match 'IGDB_CLIENT_SECRET=(.+)') { $matches[1].Trim() } else { '' }

Write-Host "Configuration from .env file:" -ForegroundColor Yellow
Write-Host "  IGDB_ENABLED: $igdbEnabled" -ForegroundColor Gray
Write-Host "  IGDB_CLIENT_ID: $($igdbClientId.Substring(0, [Math]::Min(5, $igdbClientId.Length)))..." -ForegroundColor Gray
Write-Host "  IGDB_CLIENT_SECRET: $($igdbClientSecret.Substring(0, [Math]::Min(5, $igdbClientSecret.Length)))..." -ForegroundColor Gray
Write-Host ""

if ($igdbEnabled -ne 'true') {
    Write-Host "⚠️  WARNING: IGDB_ENABLED is not set to 'true'" -ForegroundColor Yellow
}

if (!$igdbClientId -or !$igdbClientSecret) {
    Write-Host "❌ ERROR: IGDB credentials are missing from .env file" -ForegroundColor Red
    exit 1
}

Write-Host "Testing IGDB API connection..." -ForegroundColor Yellow
Write-Host ""

# Test the connection using the API
$testScript = @"
const axios = require('axios');

async function test() {
  try {
    const tokenRes = await axios.post('https://id.twitch.tv/oauth2/token', null, {
      params: {
        client_id: '$igdbClientId',
        client_secret: '$igdbClientSecret',
        grant_type: 'client_credentials'
      }
    });
    
    const token = tokenRes.data.access_token;
    
    const gamesRes = await axios.post('https://api.igdb.com/v4/games', 
      'fields name; limit 1;',
      {
        headers: {
          'Client-ID': '$igdbClientId',
          'Authorization': 'Bearer ' + token
        }
      }
    );
    
    console.log('SUCCESS|' + gamesRes.data.length + ' games retrieved');
  } catch (err) {
    console.log('ERROR|' + (err.response?.status || 'Unknown') + '|' + (err.response?.data?.message || err.message));
  }
}

test();
"@

$tempFile = [System.IO.Path]::GetTempFileName() + ".js"
Set-Content -Path $tempFile -Value $testScript

try {
    $result = node $tempFile 2>&1
    Remove-Item $tempFile -ErrorAction SilentlyContinue
    
    if ($result -match '^SUCCESS\|(.+)') {
        Write-Host "✅ IGDB connection successful!" -ForegroundColor Green
        Write-Host "   $($matches[1])" -ForegroundColor Gray
        Write-Host ""
        Write-Host "Your games should now appear in the Discover page." -ForegroundColor Green
    } else {
        $parts = $result -split '\|'
        Write-Host "❌ IGDB connection failed!" -ForegroundColor Red
        Write-Host "   Status: $($parts[1])" -ForegroundColor Red
        Write-Host "   Message: $($parts[2])" -ForegroundColor Red
        Write-Host ""
        Write-Host "To fix this:" -ForegroundColor Yellow
        Write-Host "1. Go to https://dev.twitch.tv/console" -ForegroundColor Yellow
        Write-Host "2. Check your IGDB application credentials" -ForegroundColor Yellow
        Write-Host "3. Update IGDB_CLIENT_SECRET in your .env file" -ForegroundColor Yellow
        Write-Host "4. Restart the DashArr container" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Failed to run test: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "💡 Remember to backup your .env file regularly using: .\backup-config.ps1" -ForegroundColor Cyan
