@echo off
set DASHARR_API_URL=http://localhost:3000
set DASHARR_API_KEY=dasharr-api-key-12345
set IGDB_TRAIN_LIMIT=2000
set PROGRESS_INTERVAL=10
set NODE_OPTIONS=--trace-uncaught --trace-warnings
cd /d C:\tools\dasharr
pnpm --filter @dasharr/api exec tsx src/scripts/build-match-training-data.ts
