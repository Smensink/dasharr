Continue = 'Stop'
Set-Location -Path 'C:\tools\dasharr'
 = 'http://localhost:3000'
 = 'dasharr-api-key-12345'
 = '2000'
 = '10'
 = '--trace-uncaught --trace-warnings'

Remove-Item -Path data/hydra-audit.log,data/hydra-audit.err.log -ErrorAction SilentlyContinue
try {
  pnpm --filter @dasharr/api exec tsx src/scripts/build-match-training-data.ts *>&1 | Tee-Object -FilePath data/hydra-audit.log
} catch {
   | Out-String | Tee-Object -FilePath data/hydra-audit.err.log
  throw
}
