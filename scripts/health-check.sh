#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Shell-based health check for deployment verification.
# Usage: ./scripts/health-check.sh

SERVICES=(
  "auth-service:3000"
  "crm-service:3001"
  "finance-service:3002"
  "notification-service:3003"
  "metadata-service:3004"
  "realtime-service:3005"
  "search-service:3006"
  "workflow-service:3007"
  "analytics-service:3008"
  "comm-service:3009"
  "storage-service:3010"
  "integration-service:3012"
  "blueprint-service:3013"
  "approval-service:3014"
  "data-service:3015"
  "document-service:3016"
  "chatbot-service:3017"
  "cadence-service:3018"
  "territory-service:3019"
  "planning-service:3020"
  "reporting-service:3021"
  "portal-service:3022"
  "knowledge-service:3023"
  "incentive-service:3024"
  "email-sync-service:3026"
  "leads-service:3030"
  "accounts-service:3031"
  "notes-service:3032"
  "quotes-service:3033"
  "contacts-service:3041"
  "deals-service:3042"
  "activities-service:3043"
  "graphql-gateway:4000"
  "router-coprocessor:4001"
)

ALL_HEALTHY=true
TIMEOUT_SEC=10

echo "=== Nexus CRM Health Check ==="
for entry in "${SERVICES[@]}"; do
  svc="${entry%%:*}"
  port="${entry##*:}"
  url="http://localhost:${port}/health"

  http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time "${TIMEOUT_SEC}" "${url}" 2>/dev/null || echo "000")
  if [ "${http_code}" = "200" ]; then
    echo "  ✅  ${svc}"
  else
    echo "  ❌  ${svc} — HTTP ${http_code}"
    ALL_HEALTHY=false
  fi
done

if [ "$ALL_HEALTHY" = true ]; then
  echo ""
  echo "✅ All services healthy"
  exit 0
else
  echo ""
  echo "❌ Some services unhealthy"
  exit 1
fi
