#!/usr/bin/env bash
#
# Nexus backup — dumps ALL Postgres databases (the system of record) to a
# timestamped gzip, with retention. ClickHouse is a rebuildable analytics
# read-model (POST /api/v1/analytics/admin/rebuild) and is intentionally not
# backed up here.
#
# Usage (on the droplet):   bash /opt/nexus/scripts/backup.sh
# Cron (daily 03:15 UTC):   15 3 * * * bash /opt/nexus/scripts/backup.sh >> /var/log/nexus-backup.log 2>&1
set -euo pipefail

OUT="${BACKUP_DIR:-/opt/nexus/backups}"
RETAIN="${BACKUP_RETAIN:-14}"
PG_CONTAINER="${PG_CONTAINER:-nexus-postgres}"
TS="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$OUT"
DEST="$OUT/pg-$TS.sql.gz"

echo "[backup] $(date -u +%FT%TZ) dumping all Postgres databases -> $DEST"
docker exec "$PG_CONTAINER" pg_dumpall -U nexus | gzip > "$DEST"

if [ ! -s "$DEST" ]; then
  echo "[backup] ERROR: dump is empty" >&2
  exit 1
fi

SIZE="$(du -h "$DEST" | cut -f1)"
echo "[backup] wrote $DEST ($SIZE)"

# Retention: keep the newest $RETAIN dumps.
ls -1t "$OUT"/pg-*.sql.gz 2>/dev/null | tail -n +"$((RETAIN + 1))" | xargs -r rm -f
KEPT="$(ls -1 "$OUT"/pg-*.sql.gz 2>/dev/null | wc -l | tr -d ' ')"
echo "[backup] retention ok — $KEPT dump(s) on disk (keep newest $RETAIN)"
