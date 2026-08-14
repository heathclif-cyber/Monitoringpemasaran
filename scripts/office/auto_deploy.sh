#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
LOG="$ROOT/logs/auto_deploy.log"
mkdir -p "$ROOT/logs"
{
  echo "==== $(date -Iseconds) ===="
  git fetch origin
  LOCAL=$(git rev-parse HEAD)
  REMOTE=$(git rev-parse origin/main 2>/dev/null || git rev-parse origin/master)
  if [ "$LOCAL" != "$REMOTE" ]; then
    git pull --ff-only origin main || git pull --ff-only origin master
    docker compose up -d --build
    echo "deployed $REMOTE"
  else
    echo "no update"
  fi
} >>"$LOG" 2>&1
