#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# NEXUS CRM — Production Deployment Script
#
# Usage:
#   ./scripts/deploy.sh [IMAGE_TAG]
#
# Prerequisites:
#   - Docker + Docker Compose v2 installed on the server
#   - .env.prod file in project root with all required secrets
#   - SSL certificates at /etc/letsencrypt/live/your-domain.com/
# ─────────────────────────────────────────────────────────────────────────────

IMAGE_TAG="${1:-latest}"
COMPOSE_FILE="-f docker-compose.yml -f docker-compose.prod.yml"
ENV_FILE=".env.prod"

echo "🚀  NEXUS CRM Deploy — image tag: ${IMAGE_TAG}"

# ── Validate prerequisites ────────────────────────────────────────────────────
if [ ! -f "${ENV_FILE}" ]; then
  echo "❌  ${ENV_FILE} not found. Copy .env.prod.example and fill in secrets."
  exit 1
fi

export IMAGE_TAG

# ── Pull latest images ────────────────────────────────────────────────────────
echo "📦  Pulling images..."
docker compose ${COMPOSE_FILE} --env-file "${ENV_FILE}" pull --ignore-pull-failures 2>/dev/null || true

# ── Run DB migrations ─────────────────────────────────────────────────────────
echo "🗄️  Running database migrations..."
for svc in auth-service crm-service finance-service workflow-service billing-service \
           integration-service blueprint-service approval-service cadence-service \
           territory-service planning-service reporting-service portal-service \
           knowledge-service incentive-service data-service chatbot-service; do
  echo "  → Migrating ${svc}..."
  docker compose ${COMPOSE_FILE} --env-file "${ENV_FILE}" \
    run --rm --no-deps "${svc}" \
    sh -c "npx prisma migrate deploy 2>/dev/null || true" || true
done

# ── Rolling restart — infra first, then services ──────────────────────────────
echo "🔄  Starting infrastructure..."
docker compose ${COMPOSE_FILE} --env-file "${ENV_FILE}" up -d \
  postgres redis kafka zookeeper meilisearch minio keycloak clickhouse

echo "⏳  Waiting for Postgres to be ready..."
until docker compose ${COMPOSE_FILE} --env-file "${ENV_FILE}" exec -T postgres \
  pg_isready -U nexus -d nexus > /dev/null 2>&1; do
  sleep 2
done

echo "🔄  Starting application services..."
docker compose ${COMPOSE_FILE} --env-file "${ENV_FILE}" up -d \
  auth-service crm-service finance-service notification-service realtime-service \
  search-service workflow-service analytics-service comm-service storage-service \
  billing-service integration-service blueprint-service approval-service data-service \
  document-service chatbot-service cadence-service territory-service planning-service \
  reporting-service portal-service knowledge-service incentive-service ai-service

echo "🔄  Starting web frontend..."
docker compose ${COMPOSE_FILE} --env-file "${ENV_FILE}" up -d web

# ── Health check ──────────────────────────────────────────────────────────────
echo "🏥  Checking service health..."
sleep 10
FAILED=0
for svc_port in "auth-service:3010" "crm-service:3001" "finance-service:3002" \
                "workflow-service:3007" "notification-service:3003"; do
  svc="${svc_port%%:*}"
  port="${svc_port##*:}"
  status=$(curl -sf "http://localhost:${port}/health" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo "unreachable")
  if [ "${status}" = "ok" ]; then
    echo "  ✅  ${svc}"
  else
    echo "  ❌  ${svc} — ${status}"
    FAILED=$((FAILED + 1))
  fi
done

if [ $FAILED -gt 0 ]; then
  echo ""
  echo "⚠️  ${FAILED} service(s) failed health check. Check logs with:"
  echo "     docker compose ${COMPOSE_FILE} logs --tail=50 <service-name>"
  exit 1
fi

echo ""
echo "✅  Deploy complete — image: ${IMAGE_TAG}"
echo "    Web: https://your-domain.com"
echo "    Kong admin: http://localhost:8001"
echo "    Keycloak:   http://localhost:8080"
