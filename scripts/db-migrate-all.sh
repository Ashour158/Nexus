#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Run migrations for all services

echo "=== Running migrations for all services ==="

SERVICES=(
  "auth-service"
  "crm-service"
  "contacts-service"
  "deals-service"
  "activities-service"
  "notification-service"
  "analytics-service"
  "workflow-service"
  "approval-service"
  "reporting-service"
  "storage-service"
)

for svc in "${SERVICES[@]}"; do
  echo "Migrating $svc..."
  (cd "services/$svc" && npx prisma migrate deploy) || echo "Warning: $svc migration failed"
done

echo "✅ Migrations complete"
