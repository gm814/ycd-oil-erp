#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
OUT="$BACKUP_DIR/ycd-oil-$STAMP.dump"

pg_dump --format=custom --no-owner --no-acl "$DATABASE_URL" > "$OUT"
test -s "$OUT"
echo "Backup created: $OUT"
