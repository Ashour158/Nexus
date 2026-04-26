#!/bin/bash
set -e

echo "╔══════════════════════════════════════════════╗"
echo "║     NEXUS — Prisma Migration Runner          ║"
echo "╚══════════════════════════════════════════════╝"

SERVICES=(
  "auth-service"
  "crm-service"
  "finance-service"
  "notification-service"
  "comm-service"
  "storage-service"
  "workflow-service"
  "billing-service"
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
  if (cd "services/$svc" && pnpm prisma migrate deploy 2>&1); then
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
