#!/bin/sh
set -eu

# Nexus CRM — host-level health checks for every deployed application service.
# Ports are the published localhost ports declared in docker-compose.yml.

ALL_HEALTHY=true
TIMEOUT_SEC="${TIMEOUT_SEC:-10}"

echo "=== Nexus CRM Health Check ==="
while IFS=: read -r svc port; do
  [ -n "$svc" ] || continue
  url="http://localhost:${port}/health"

  if http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT_SEC" "$url" 2>/dev/null); then
    :
  else
    http_code="000"
  fi

  if [ "$http_code" = "200" ]; then
    echo "  ✅  $svc"
  else
    echo "  ❌  $svc — HTTP $http_code"
    ALL_HEALTHY=false
  fi
done <<'SERVICES'
auth-service:3000
crm-service:3001
finance-service:3002
notification-service:3003
metadata-service:3004
realtime-service:3005
search-service:3006
workflow-service:3007
analytics-service:3008
comm-service:3009
storage-service:3010
billing-service:3011
integration-service:3012
blueprint-service:3013
approval-service:3014
data-service:3015
document-service:3016
chatbot-service:3017
cadence-service:3018
territory-service:3019
planning-service:3020
reporting-service:3021
portal-service:3022
knowledge-service:3023
incentive-service:3024
campaign-service:3025
email-sync-service:3026
outbox-relay:3027
audit-consumer:3028
ticket-service:3029
notes-service:3032
activities-service:3043
web:3100
graphql-gateway:8088
router-coprocessor:4001
SERVICES

echo ""
if [ "$ALL_HEALTHY" = true ]; then
  echo "✅ All services healthy"
  exit 0
fi

echo "❌ Some services unhealthy"
exit 1
