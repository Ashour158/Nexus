#!/bin/sh
set -eu

echo "╔══════════════════════════════════════════════╗"
echo "║     NEXUS — Prisma Migration Runner          ║"
echo "╚══════════════════════════════════════════════╝"

# Safety: default to deploy mode. Override with MODE=dev only in local development.
MIGRATE_MODE="${MODE:-deploy}"

case "$MIGRATE_MODE" in
  deploy)
    echo "ℹ️  Running in DEPLOY mode (prisma migrate deploy)"
    ;;
  dev)
    echo "⚠️  Running in DEV mode (prisma migrate dev) — NOT for production"
    ;;
  *)
    echo "❌ Unknown MODE='$MIGRATE_MODE'. Use 'deploy' or 'dev'"
    exit 1
    ;;
esac

# Deployed services that own a Prisma schema. Keep this in sync with
# docker-compose.yml; intentionally decommissioned split services are excluded.
SERVICES="
auth-service
crm-service
finance-service
billing-service
notification-service
comm-service
storage-service
workflow-service
integration-service
blueprint-service
approval-service
cadence-service
campaign-service
territory-service
planning-service
reporting-service
portal-service
knowledge-service
incentive-service
data-service
chatbot-service
document-service
email-sync-service
activities-service
metadata-service
notes-service
audit-consumer
outbox-relay
search-service
ticket-service
"

FAILED=""

for svc in $SERVICES; do
  SCHEMA="services/$svc/prisma/schema.prisma"
  if [ ! -f "$SCHEMA" ]; then
    echo "❌ Expected Prisma schema missing for deployed service $svc"
    FAILED="$FAILED $svc"
    continue
  fi

  echo ""
  echo "→ Migrating $svc..."

  if [ "$MIGRATE_MODE" = "deploy" ]; then
    if (cd "services/$svc" && pnpm prisma migrate deploy 2>&1); then
      echo "  ✓ $svc migrated"
    else
      echo "  ✗ $svc FAILED"
      FAILED="$FAILED $svc"
    fi
  elif (cd "services/$svc" && pnpm prisma migrate dev --name init 2>&1); then
    echo "  ✓ $svc migrated"
  else
    echo "  ✗ $svc FAILED"
    FAILED="$FAILED $svc"
  fi
done

echo ""
if [ -z "$FAILED" ]; then
  echo "✅ All migrations complete."
else
  echo "❌ The following services failed to migrate:"
  for svc in $FAILED; do
    echo "   - $svc"
  done
  exit 1
fi
