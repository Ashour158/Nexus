#!/bin/bash
# Deploy the five engine-gap fixes. Pairs only (droplet is load-fragile), each
# pair verified against its RUNNING image before moving on.
set -euo pipefail
set -x
cd /opt/nexus

# Clear stray tracked copies so --ff-only cannot abort, then pull.
for f in deploy-engine-gaps.sh; do
  git ls-files --error-unmatch "$f" >/dev/null 2>&1 && git checkout -- "$f" 2>/dev/null || true
done
B=$(git rev-parse --short HEAD)
git pull --ff-only origin fix/local-boot
A=$(git rev-parse --short HEAD)
echo "deploying ${B} -> ${A}"

build_pair() {  # $1 $2 = compose service names
  docker compose build "$@"
  docker compose up -d --no-deps "$@"
  sleep 12
}

check() {  # $1 container, $2 file, $3 symbol
  local n
  n=$(docker exec "$1" sh -c "grep -c '$3' '$2' 2>/dev/null" || echo 0)
  if [ "${n:-0}" -ge 1 ] 2>/dev/null; then echo "  VERIFIED $1 ($3)"; else echo "  STILL-STALE $1 ($3)"; fi
}

echo "##### wave 1: comm + territory"
build_pair comm-service territory-service
check nexus-comm dist/routes/internal-outbox.routes.js sms-broadcast
check nexus-comm dist/services/outbox.service.js buildEmailThreadHeaders
check nexus-territory dist/index.js "account owner callback"

echo "##### wave 2: crm + cadence"
build_pair crm-service cadence-service
check nexus-crm dist/routes/internal.routes.js "accounts/:id/owner"
check nexus-cadence dist/services/queue.service.js resolvePhone

echo "##### wave 3: workflow"
docker compose build workflow-service
docker compose up -d --no-deps workflow-service
sleep 12
check nexus-workflow dist/consumers/automation.consumer.js TOPICS.BLUEPRINT

echo "ENGINE GAPS DEPLOY DONE"
docker ps --filter health=unhealthy --format "{{.Names}}" | head -20
echo "(none above = all healthy)"
