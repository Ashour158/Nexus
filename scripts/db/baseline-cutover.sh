#!/usr/bin/env bash
# Migration CUTOVER (baseline): copy each service's migrations next to its generated schema,
# then `migrate resolve --applied` EVERY migration dir (non-destructive — runs no SQL, just
# records them as applied so future `migrate deploy` only runs NEW migrations). Idempotent.
set -uo pipefail
cd /opt/nexus
ALIASES='CRM_DATABASE_URL="$DATABASE_URL" FINANCE_DATABASE_URL="$DATABASE_URL" WORKFLOW_DATABASE_URL="$DATABASE_URL" METADATA_DATABASE_URL="$DATABASE_URL" BLUEPRINT_DATABASE_URL="$DATABASE_URL" APPROVAL_DATABASE_URL="$DATABASE_URL" PLANNING_DATABASE_URL="$DATABASE_URL" TICKET_DATABASE_URL="$DATABASE_URL" COMM_DATABASE_URL="$DATABASE_URL" DATA_DATABASE_URL="$DATABASE_URL" INTEGRATION_DATABASE_URL="$DATABASE_URL" PORTAL_DATABASE_URL="$DATABASE_URL" TERRITORY_DATABASE_URL="$DATABASE_URL" NOTIFICATION_DATABASE_URL="$DATABASE_URL" AUTH_DATABASE_URL="$DATABASE_URL" INCENTIVE_DATABASE_URL="$DATABASE_URL" KNOWLEDGE_DATABASE_URL="$DATABASE_URL" REPORTING_DATABASE_URL="$DATABASE_URL"'

# service -> generated client dir
declare -A CLIENTS=(
  [crm-service]=crm-client [finance-service]=finance-client [workflow-service]=workflow-client
  [metadata-service]=metadata-client [blueprint-service]=blueprint-client [approval-service]=approval-client
  [planning-service]=planning-client [ticket-service]=ticket-client [comm-service]=comm-client
  [data-service]=data-client [integration-service]=integration-client [portal-service]=portal-client
  [territory-service]=territory-client [notification-service]=notification-client [auth-service]=auth-client
  [incentive-service]=incentive-client [knowledge-service]=knowledge-client [reporting-service]=reporting-client
)

baseline_svc(){
  local svc="$1" client="$2"
  local migdir="services/$svc/prisma/migrations"
  [ -d "$migdir" ] || { echo "  SKIP $svc (no migrations)"; return; }
  # is the container up?
  docker compose ps "$svc" 2>/dev/null | grep -q Up || { echo "  SKIP $svc (not running)"; return; }
  docker compose cp "$migdir" "$svc:/app/node_modules/.prisma/$client/migrations" >/dev/null 2>&1
  local n=0 ok=0
  for m in $(ls -1 "$migdir" | grep -v migration_lock.toml); do
    n=$((n+1))
    if docker compose exec -T "$svc" sh -c "$ALIASES npx prisma migrate resolve --applied $m --schema=node_modules/.prisma/$client/schema.prisma 2>&1" | grep -qiE "marked as applied|already recorded|P3008"; then
      ok=$((ok+1))
    fi
  done
  # status
  local st=$(docker compose exec -T "$svc" sh -c "$ALIASES npx prisma migrate status --schema=node_modules/.prisma/$client/schema.prisma 2>&1" | grep -iE "up to date|following migration|not yet been applied" | head -1)
  echo "  $svc: resolved $ok/$n | status: ${st:-?}"
}

echo "=== migration baseline cutover ==="
for svc in "${!CLIENTS[@]}"; do baseline_svc "$svc" "${CLIENTS[$svc]}"; done
echo "=== DONE-BASELINE ==="
