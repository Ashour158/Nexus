#!/bin/bash
# Roll the service-utils 429-labelling fix into every service image.
#
# WHY A REBUILD IS NEEDED: the fix lives in @nexus/service-utils
# (errorResponseBuilder now returns a top-level statusCode/code/message, so a
# rate-limit rejection is reported as 429 instead of falling through to a
# generic 500). That package is compiled INTO each service image at build time,
# so a restart cannot pick it up.
#
# 31 services were verified STALE by grepping the RUNNING images for
# "statusCode: 429" in node_modules/@nexus/service-utils/dist/server.js.
# crm-service and chatbot-service already have it and are skipped.
#
# Builds in PAIRS: the droplet is load-fragile (documented history of transient
# OOM when more run concurrently). Each pair is verified immediately after it is
# brought up, so a failure surfaces at the pair that caused it rather than at the
# end of a 30-service run.
set -uo pipefail   # NOT -e: one bad service must not abandon the other 30.
cd /opt/nexus

git pull --ff-only origin fix/local-boot
echo "building from $(git rev-parse --short HEAD)"

# compose service name : container name
PAIRS="
auth-service:nexus-auth
finance-service:nexus-finance
notification-service:nexus-notifications
search-service:nexus-search
metadata-service:nexus-metadata
workflow-service:nexus-workflow
analytics-service:nexus-analytics
reporting-service:nexus-reporting
billing-service:nexus-billing
activities-service:nexus-activities
notes-service:nexus-notes
realtime-service:nexus-realtime
integration-service:nexus-integration
blueprint-service:nexus-blueprint
comm-service:nexus-comm
storage-service:nexus-storage
approval-service:nexus-approval
data-service:nexus-data
document-service:nexus-document
cadence-service:nexus-cadence
territory-service:nexus-territory
planning-service:nexus-planning
portal-service:nexus-portal
knowledge-service:nexus-knowledge
incentive-service:nexus-incentive
email-sync-service:nexus-email-sync
ticket-service:nexus-ticket
campaign-service:nexus-campaign
audit-consumer:nexus-audit-consumer
outbox-relay:nexus-outbox-relay
"

OK=0; FAILED=""
SVCS=(); CTRS=()
for entry in $PAIRS; do
  SVCS+=("${entry%%:*}")
  CTRS+=("${entry##*:}")
done

TOTAL=${#SVCS[@]}
i=0
while [ $i -lt $TOTAL ]; do
  s1=${SVCS[$i]}; c1=${CTRS[$i]}
  s2=${SVCS[$((i+1))]:-}; c2=${CTRS[$((i+1))]:-}

  echo "##### wave $((i/2+1)): ${s1} ${s2}"
  if [ -n "$s2" ]; then
    docker compose build "$s1" "$s2" && docker compose up -d --no-deps "$s1" "$s2"
  else
    docker compose build "$s1" && docker compose up -d --no-deps "$s1"
  fi

  sleep 12
  for c in "$c1" ${c2:+$c2}; do
    n=$(docker exec "$c" sh -c 'grep -c "statusCode: 429" node_modules/@nexus/service-utils/dist/server.js 2>/dev/null' 2>/dev/null)
    if [ "${n:-0}" -ge 1 ] 2>/dev/null; then
      echo "  VERIFIED $c"
      OK=$((OK+1))
    else
      echo "  STILL-STALE $c"
      FAILED="$FAILED $c"
    fi
  done
  i=$((i+2))
done

echo "##### 429 ROLLOUT DONE — verified ${OK}/${TOTAL}"
[ -n "$FAILED" ] && echo "NOT VERIFIED:$FAILED"
echo "=== unhealthy containers after rollout ==="
docker ps --filter health=unhealthy --format "{{.Names}}" | head -20
echo "(none listed above = all healthy)"
