#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Local Backup Script

echo "=== Local Backup ==="

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="backups/$TIMESTAMP"
mkdir -p "$BACKUP_DIR"

# Backup PostgreSQL
echo "[1/3] Backing up PostgreSQL..."
docker compose exec -T postgres pg_dump -U nexus -d nexus > "$BACKUP_DIR/nexus.sql"

# Backup Redis
echo "[2/3] Backing up Redis..."
docker compose exec -T redis redis-cli BGSAVE
sleep 2
docker cp "$(docker compose ps -q redis)":/data/dump.rdb "$BACKUP_DIR/redis.rdb"

# Backup Kafka topics (metadata only)
echo "[3/3] Backing up Kafka metadata..."
docker compose exec -T kafka kafka-topics --bootstrap-server localhost:9092 --list > "$BACKUP_DIR/kafka-topics.txt"

# Compress
tar -czf "$BACKUP_DIR.tar.gz" -C backups "$TIMESTAMP"
rm -rf "$BACKUP_DIR"

echo "✅ Backup complete: $BACKUP_DIR.tar.gz"
