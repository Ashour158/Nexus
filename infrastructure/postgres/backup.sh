#!/bin/bash
set -euo pipefail

BACKUP_DIR="/opt/backups/postgres"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-30}
POSTGRES_HOST="${POSTGRES_HOST:-postgres}"
POSTGRES_USER="${POSTGRES_USER:-nexus}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-nexus}"

mkdir -p "$BACKUP_DIR"
export PGPASSWORD="$POSTGRES_PASSWORD"

DATABASES=(
  nexus_crm nexus_auth nexus_finance nexus_notifications
  nexus_workflow nexus_comm nexus_storage nexus_billing
  nexus_integration nexus_blueprint nexus_approval nexus_data
  nexus_document nexus_chatbot nexus_cadence nexus_territory
  nexus_planning nexus_reporting nexus_portal nexus_knowledge nexus_incentive
)

for DB in "${DATABASES[@]}"; do
  echo "Backing up $DB..."
  pg_dump -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -Fc "$DB" > "$BACKUP_DIR/${DB}_${DATE}.dump"
done

find "$BACKUP_DIR" -name "*.dump" -mtime +$RETENTION_DAYS -delete
echo "Backup complete: $DATE"
