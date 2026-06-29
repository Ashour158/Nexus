#!/usr/bin/env bash
set -euo pipefail

# NEXUS CRM — PostgreSQL Point-in-Time Recovery Script
# Usage: ./restore.sh [--full] [--incr] [--pitr TIMESTAMP]

STANZA="nexus"
RESTORE_TYPE="full"
PITR_TIMESTAMP=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --full) RESTORE_TYPE="full"; shift ;;
    --incr) RESTORE_TYPE="incr"; shift ;;
    --pitr)
      PITR_TIMESTAMP="$2"
      RESTORE_TYPE="pitr"
      shift 2
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

echo "=== NEXUS CRM PostgreSQL Restore ==="
echo "Restore type: $RESTORE_TYPE"
[[ -n "$PITR_TIMESTAMP" ]] && echo "PITR target: $PITR_TIMESTAMP"
echo ""

# Stop Postgres before restore
echo "[1/5] Stopping PostgreSQL..."
pg_ctl stop -D /var/lib/postgresql/data -m fast || true

# Prepare restore command
if [[ "$RESTORE_TYPE" == "pitr" && -n "$PITR_TIMESTAMP" ]]; then
  echo "[2/5] Restoring to PITR: $PITR_TIMESTAMP"
  pgbackrest --stanza="$STANZA" restore \
    --type=time \
    --target="$PITR_TIMESTAMP" \
    --target-action=promote
else
  echo "[2/5] Restoring latest $RESTORE_TYPE backup..."
  pgbackrest --stanza="$STANZA" restore \
    --set="${RESTORE_TYPE}-latest"
fi

# Fix permissions
echo "[3/5] Fixing permissions..."
chown -R postgres:postgres /var/lib/postgresql/data
chmod 700 /var/lib/postgresql/data

# Start Postgres
echo "[4/5] Starting PostgreSQL..."
pg_ctl start -D /var/lib/postgresql/data

# Verify
echo "[5/5] Verifying restore..."
pgbackrest --stanza="$STANZA" verify

echo ""
echo "=== Restore completed successfully ==="
echo "Run 'psql -U nexus -d nexus -c \"SELECT pg_last_xact_replay_timestamp();\"' to verify timeline."
