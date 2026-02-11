#!/usr/bin/env bash
set -euo pipefail

# Remote helper for:
# 1) building/running the reranker service
# 2) enriching audit CSV with cross-encoder scores
# 3) training the match model using the enriched CSV
#
# Auth:
# - Preferred: SSH keys (ssh should work non-interactively)
# - Password: set SSHPASS and use sshpass -e
#
# Required env:
# - DASHARR_SSH_HOST
# - DASHARR_SSH_USER
# - DASHARR_REMOTE_DIR (path to dasharr repo on the server)
#
# Optional env:
# - DASHARR_INPUT_CSV (default: /tmp/autolabeled-training.csv)
# - DASHARR_OUTPUT_CSV (default: /tmp/autolabeled-training-reranked.csv)
# - MATCH_TRAIN_DEDUP_MODE (default: gameIdTitleSource)
# - MATCH_TRAIN_CONFLICT_MODE (default: first)
#
# Example:
#   export DASHARR_SSH_HOST=100.94.141.30
#   export DASHARR_SSH_USER=seb_m
#   export DASHARR_REMOTE_DIR=/tools/dasharr
#   export SSHPASS='...'
#   ./scripts/remote-reranker-enrich-and-train.sh

HOST="${DASHARR_SSH_HOST:-}"
USER="${DASHARR_SSH_USER:-}"
REMOTE_DIR="${DASHARR_REMOTE_DIR:-}"

if [[ -z "$HOST" || -z "$USER" || -z "$REMOTE_DIR" ]]; then
  echo "Missing required env. Need DASHARR_SSH_HOST, DASHARR_SSH_USER, DASHARR_REMOTE_DIR" >&2
  exit 2
fi

INPUT_CSV="${DASHARR_INPUT_CSV:-/tmp/autolabeled-training.csv}"
OUTPUT_CSV="${DASHARR_OUTPUT_CSV:-/tmp/autolabeled-training-reranked.csv}"

DEDUP_MODE="${MATCH_TRAIN_DEDUP_MODE:-gameIdTitleSource}"
CONFLICT_MODE="${MATCH_TRAIN_CONFLICT_MODE:-first}"

SSH_BASE=(ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10)

run_ssh() {
  if command -v sshpass >/dev/null 2>&1 && [[ -n "${SSHPASS:-}" ]]; then
    sshpass -e "${SSH_BASE[@]}" "$USER@$HOST" "$@"
  else
    "${SSH_BASE[@]}" "$USER@$HOST" "$@"
  fi
}

echo "[remote] host=$HOST user=$USER repo=$REMOTE_DIR"
echo "[remote] input=$INPUT_CSV output=$OUTPUT_CSV"
echo "[remote] dedup=$DEDUP_MODE conflict=$CONFLICT_MODE"

run_ssh "set -euo pipefail
  cd \"$REMOTE_DIR\"
  echo '[remote] pwd='\"\\\$(pwd)\"
  echo '[remote] starting reranker'
  docker compose -f docker/docker-compose.reranker.yml up --build -d
  echo '[remote] enriching CSV (GPU if available)'
  docker exec dasharr-reranker python /app/enrich_csv.py --input \"$INPUT_CSV\" --output \"$OUTPUT_CSV\"
  echo '[remote] training model from enriched CSV'
  MATCH_TRAIN_SKIP_CV=true \\
  MATCH_TRAIN_DEDUP_MODE=\"$DEDUP_MODE\" \\
  MATCH_TRAIN_CONFLICT_MODE=\"$CONFLICT_MODE\" \\
  AUTO_LABELED_CSV=\"$OUTPUT_CSV\" \\
  apps/api/node_modules/.bin/tsx apps/api/src/scripts/train-match-model.ts
  echo '[remote] done; model at:' \"\\\$(node -e \\\"console.log(require('path').resolve('data/match-model.json'))\\\")\"
"

