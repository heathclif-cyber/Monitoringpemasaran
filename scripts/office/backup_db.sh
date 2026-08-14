#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
OUT="${HOME}/Backup/MonitoringPemasaran"
mkdir -p "$OUT"
STAMP=$(date +%Y%m%d_%H%M%S)
docker compose exec -T db pg_dump -U ptpn -d monitoringpemasaran --no-owner --no-acl \
  > "$OUT/monpem_$STAMP.sql"
ls -1t "$OUT"/monpem_*.sql 2>/dev/null | tail -n +15 | xargs -r rm --
