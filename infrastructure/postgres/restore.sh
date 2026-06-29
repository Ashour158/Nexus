#!/bin/bash
set -euo pipefail

DB="$1"
TIMESTAMP="$2"
BACKUP_DIR="/opt/backups/postgres"
DUMP_FILE="$BACKUP_DIR/${DB}_${TIMESTAMP}.dump"

if [ ! -f "$DUMP_FILE" ]; then
  echo "ERROR: Backup file not found: $DUMP_FILE"
  exit 1
fi

export PGPASSWORD="${POSTGRES_PASSWORD:-nexus}"
pg_restore -h "${POSTGRES_HOST:-postgres}" -U "${POSTGRES_USER:-nexus}" -d "$DB" --clean --if-exists "$DUMP_FILE"
echo "Restore complete: $DB from $TIMESTAMP"
