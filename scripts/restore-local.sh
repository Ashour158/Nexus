#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Local Restore Script
# Usage: ./restore-local.sh <backup-file>

BACKUP_FILE="${1:-}"

if [[ -z "$BACKUP_FILE" ]]; then
  echo "Usage: $0 <backup-file.tar.gz>"
  exit 1
fi

echo "=== Local Restore ==="

# Extract
BACKUP_DIR=$(tar -tzf "$BACKUP_FILE" | head -1 | cut -d/ -f1)
tar -xzf "$BACKUP_FILE" -C backups

# Restore PostgreSQL
echo "[1/2] Restoring PostgreSQL..."
docker compose exec -T postgres psql -U nexus -d nexus < "backups/$BACKUP_DIR/nexus.sql"

# Restore Redis
echo "[2/2] Restoring Redis..."
docker cp "backups/$BACKUP_DIR/redis.rdb" "$(docker compose ps -q redis)":/data/dump.rdb
docker compose restart redis

# Cleanup
rm -rf "backups/$BACKUP_DIR"

echo "✅ Restore complete"
