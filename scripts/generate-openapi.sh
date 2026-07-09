#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Generate OpenAPI specs for all services

echo "=== Generating OpenAPI specs ==="

SERVICES=(
  "auth-service"
  "crm-service"
  "contacts-service"
  "deals-service"
  "notification-service"
  "analytics-service"
  "realtime-service"
  "workflow-service"
  "approval-service"
  "reporting-service"
  "storage-service"
  "integration-service"
  "blueprint-service"
  "cadence-service"
  "territory-service"
  "chatbot-service"
  "data-service"
  "document-service"
  "incentive-service"
  "knowledge-service"
  "planning-service"
  "portal-service"
  "search-service"
  "email-sync-service"
  "finance-service"
)

mkdir -p docs/openapi

for svc in "${SERVICES[@]}"; do
  echo "Generating spec for $svc..."
  # Start service in background and fetch OpenAPI spec
  (cd "services/$svc" && pnpm build && node dist/index.js &) || true
  sleep 5
  curl -s "http://localhost:3000/documentation/json" > "docs/openapi/$svc.json" 2>/dev/null || echo "Warning: Could not generate spec for $svc"
  pkill -f "node dist/index.js" || true
done

echo "✅ OpenAPI specs generated in docs/openapi/"
