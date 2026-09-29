#!/usr/bin/env bash
set -euo pipefail

: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is required and must point to a non-production restore target}"
DUMP_FILE="${1:-}"
if [[ -z "$DUMP_FILE" || ! -f "$DUMP_FILE" ]]; then
  echo "Usage: RESTORE_DATABASE_URL=... $0 <backup.dump>" >&2
  exit 2
fi
if [[ "$RESTORE_DATABASE_URL" == *"prod"* || "$RESTORE_DATABASE_URL" == *"production"* ]]; then
  echo "Refusing a restore target whose URL looks like production." >&2
  exit 3
fi

pg_restore --clean --if-exists --no-owner --no-acl --dbname="$RESTORE_DATABASE_URL" "$DUMP_FILE"
echo "Restore completed on the isolated target."
