#!/bin/bash
set -e

echo "╔══════════════════════════════════════════════╗"
echo "║     NEXUS — Prisma Migration Runner          ║"
echo "╚══════════════════════════════════════════════╝"

# Safety: default to deploy mode. Override with MODE=dev only in local development.
MIGRATE_MODE="${MODE:-deploy}"

if [ "$MIGRATE_MODE" = "deploy" ]; then
  echo "ℹ️  Running in DEPLOY mode (prisma migrate deploy)"
elif [ "$MIGRATE_MODE" = "dev" ]; then
  echo "⚠️  Running in DEV mode (prisma migrate dev) — NOT for production"
else
  echo "❌ Unknown MODE='$MIGRATE_MODE'. Use 'deploy' or 'dev'"
  exit 1
fi

SERVICES=(
  "auth-service"
  "crm-service"
  "finance-service"
  "notification-service"
  "comm-service"
  "storage-service"
  "workflow-service"
  "integration-service"
  "blueprint-service"
  "approval-service"
  "cadence-service"
  "territory-service"
  "planning-service"
  "reporting-service"
  "portal-service"
  "knowledge-service"
  "incentive-service"
  "data-service"
  "chatbot-service"
  "document-service"
  "email-sync-service"
  "activities-service"
  "contacts-service"
  "deals-service"
  "metadata-service"
  "leads-service"
  "accounts-service"
  "notes-service"
  "quotes-service"
)

FAILED=()

for svc in "${SERVICES[@]}"; do
  SCHEMA="services/$svc/prisma/schema.prisma"
  if [ ! -f "$SCHEMA" ]; then
    echo "⚠️  No Prisma schema found for $svc — skipping"
    continue
  fi

  echo ""
  echo "→ Migrating $svc..."

  if [ "$MIGRATE_MODE" = "deploy" ]; then
    MIGRATE_CMD="migrate deploy"
  else
    MIGRATE_CMD="migrate dev --name init"
  fi

  if (cd "services/$svc" && pnpm prisma $MIGRATE_CMD 2>&1); then
    echo "  ✓ $svc migrated"
  else
    echo "  ✗ $svc FAILED"
    FAILED+=("$svc")
  fi
done

echo ""
if [ ${#FAILED[@]} -eq 0 ]; then
  echo "✅ All migrations complete."
else
  echo "❌ The following services failed to migrate:"
  for f in "${FAILED[@]}"; do echo "   - $f"; done
  exit 1
fi
