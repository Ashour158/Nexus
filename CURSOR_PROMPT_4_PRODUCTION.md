# Prompt 4 — Production Deployment Setup

## Context

NEXUS CRM is a pnpm monorepo with 25 microservices. Docker Compose is used for container orchestration. The current `docker-compose.yml` is dev-only (plaintext secrets, no image tagging, no prod tuning). GitHub Actions CI exists at `.github/workflows/ci.yml` but the docker-build matrix only covers 11 of 25 services.

This prompt creates everything needed to deploy NEXUS to a production server: prod compose override, Nginx SSL config, deploy script, and a fixed CI pipeline.

---

## TASK 1 — Create `docker-compose.prod.yml`

**File**: `docker-compose.prod.yml`

This is a Docker Compose override file used as: `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`

It overrides the dev compose with production-ready settings: image tags from CI, env var substitution instead of inline secrets, resource limits, and proper restart policies.

```yaml
version: '3.9'

# Production overlay — use with:
#   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
#
# Required environment variables (set in .env.prod or export):
#   IMAGE_TAG       — Docker image tag (e.g. git SHA from CI)
#   POSTGRES_PASSWORD, REDIS_PASSWORD, MINIO_ROOT_PASSWORD
#   JWT_SECRET, KEYCLOAK_ADMIN_PASSWORD

services:
  # ─── Infrastructure ─────────────────────────────────────────────────────
  postgres:
    restart: always
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    restart: always
    command: ['redis-server', '--requirepass', '${REDIS_PASSWORD}']

  minio:
    restart: always
    environment:
      MINIO_ROOT_USER: nexus
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}

  keycloak:
    restart: always
    environment:
      KEYCLOAK_ADMIN_PASSWORD: ${KEYCLOAK_ADMIN_PASSWORD}
      KC_DB_PASSWORD: ${POSTGRES_PASSWORD}
    command: ['start']  # production mode (not start-dev)

  # ─── App Services ────────────────────────────────────────────────────────
  auth-service:
    image: nexus/auth-service:${IMAGE_TAG:-latest}
    restart: always
    deploy:
      resources:
        limits: { cpus: '0.5', memory: 512M }

  crm-service:
    image: nexus/crm-service:${IMAGE_TAG:-latest}
    restart: always
    deploy:
      resources:
        limits: { cpus: '1.0', memory: 1G }

  finance-service:
    image: nexus/finance-service:${IMAGE_TAG:-latest}
    restart: always
    deploy:
      resources:
        limits: { cpus: '0.5', memory: 512M }

  notification-service:
    image: nexus/notification-service:${IMAGE_TAG:-latest}
    restart: always
    deploy:
      resources:
        limits: { cpus: '0.25', memory: 256M }

  realtime-service:
    image: nexus/realtime-service:${IMAGE_TAG:-latest}
    restart: always

  search-service:
    image: nexus/search-service:${IMAGE_TAG:-latest}
    restart: always

  workflow-service:
    image: nexus/workflow-service:${IMAGE_TAG:-latest}
    restart: always
    deploy:
      resources:
        limits: { cpus: '0.5', memory: 512M }

  analytics-service:
    image: nexus/analytics-service:${IMAGE_TAG:-latest}
    restart: always

  comm-service:
    image: nexus/comm-service:${IMAGE_TAG:-latest}
    restart: always

  storage-service:
    image: nexus/storage-service:${IMAGE_TAG:-latest}
    restart: always

  billing-service:
    image: nexus/billing-service:${IMAGE_TAG:-latest}
    restart: always

  integration-service:
    image: nexus/integration-service:${IMAGE_TAG:-latest}
    restart: always

  blueprint-service:
    image: nexus/blueprint-service:${IMAGE_TAG:-latest}
    restart: always

  approval-service:
    image: nexus/approval-service:${IMAGE_TAG:-latest}
    restart: always

  data-service:
    image: nexus/data-service:${IMAGE_TAG:-latest}
    restart: always

  document-service:
    image: nexus/document-service:${IMAGE_TAG:-latest}
    restart: always

  chatbot-service:
    image: nexus/chatbot-service:${IMAGE_TAG:-latest}
    restart: always

  cadence-service:
    image: nexus/cadence-service:${IMAGE_TAG:-latest}
    restart: always

  territory-service:
    image: nexus/territory-service:${IMAGE_TAG:-latest}
    restart: always

  planning-service:
    image: nexus/planning-service:${IMAGE_TAG:-latest}
    restart: always

  reporting-service:
    image: nexus/reporting-service:${IMAGE_TAG:-latest}
    restart: always

  portal-service:
    image: nexus/portal-service:${IMAGE_TAG:-latest}
    restart: always

  knowledge-service:
    image: nexus/knowledge-service:${IMAGE_TAG:-latest}
    restart: always

  incentive-service:
    image: nexus/incentive-service:${IMAGE_TAG:-latest}
    restart: always

  ai-service:
    image: nexus/ai-service:${IMAGE_TAG:-latest}
    restart: always

  web:
    image: nexus/web:${IMAGE_TAG:-latest}
    restart: always
    deploy:
      resources:
        limits: { cpus: '1.0', memory: 1G }
```

---

## TASK 2 — Create `infrastructure/nginx/nginx.conf`

**File**: `infrastructure/nginx/nginx.conf`

Nginx acts as the SSL-terminating reverse proxy in front of Kong. Replace `your-domain.com` placeholder with the actual domain at deploy time.

```nginx
worker_processes auto;
events { worker_connections 1024; }

http {
  # ── Logging ──────────────────────────────────────────────────────────────
  log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                  '$status $body_bytes_sent "$http_referer" "$http_user_agent"';
  access_log /var/log/nginx/access.log main;
  error_log  /var/log/nginx/error.log warn;

  # ── Security headers ─────────────────────────────────────────────────────
  add_header X-Frame-Options           SAMEORIGIN;
  add_header X-Content-Type-Options    nosniff;
  add_header X-XSS-Protection          "1; mode=block";
  add_header Referrer-Policy           "strict-origin-when-cross-origin";
  add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload";

  # ── Gzip ─────────────────────────────────────────────────────────────────
  gzip on;
  gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
  gzip_min_length 1000;

  # ── Redirect HTTP → HTTPS ─────────────────────────────────────────────────
  server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
  }

  # ── Main HTTPS server ─────────────────────────────────────────────────────
  server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_session_cache   shared:SSL:10m;

    client_max_body_size 50M;

    # ── Web app (Next.js) ──────────────────────────────────────────────────
    location / {
      proxy_pass         http://localhost:3100;
      proxy_http_version 1.1;
      proxy_set_header   Upgrade $http_upgrade;
      proxy_set_header   Connection 'upgrade';
      proxy_set_header   Host $host;
      proxy_set_header   X-Real-IP $remote_addr;
      proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header   X-Forwarded-Proto $scheme;
      proxy_cache_bypass $http_upgrade;
    }

    # ── API gateway (Kong) ─────────────────────────────────────────────────
    location /api/ {
      proxy_pass         http://localhost:8000;
      proxy_http_version 1.1;
      proxy_set_header   Host $host;
      proxy_set_header   X-Real-IP $remote_addr;
      proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header   X-Forwarded-Proto $scheme;
    }

    # ── WebSocket (realtime-service) ───────────────────────────────────────
    location /socket.io/ {
      proxy_pass         http://localhost:3005;
      proxy_http_version 1.1;
      proxy_set_header   Upgrade $http_upgrade;
      proxy_set_header   Connection "upgrade";
      proxy_set_header   Host $host;
      proxy_set_header   X-Real-IP $remote_addr;
    }

    # ── Auth (Keycloak) ────────────────────────────────────────────────────
    location /auth/ {
      proxy_pass         http://localhost:8080;
      proxy_set_header   Host $host;
      proxy_set_header   X-Real-IP $remote_addr;
      proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header   X-Forwarded-Proto $scheme;
    }
  }
}
```

---

## TASK 3 — Create `scripts/deploy.sh`

**File**: `scripts/deploy.sh`

```bash
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
```

Make it executable: the CI pipeline should run `chmod +x scripts/deploy.sh`.

---

## TASK 4 — Create `scripts/.env.prod.example`

**File**: `scripts/.env.prod.example`

```env
# ─── Production Environment — copy to .env.prod and fill in all values ───────

# Image tag (set by CI to git SHA)
IMAGE_TAG=latest

# ─── Database ─────────────────────────────────────────────────────────────────
POSTGRES_USER=nexus
POSTGRES_PASSWORD=CHANGE_ME_STRONG_PASSWORD
POSTGRES_DB=nexus

# ─── Redis ────────────────────────────────────────────────────────────────────
REDIS_PASSWORD=CHANGE_ME_REDIS_PASSWORD

# ─── MinIO ────────────────────────────────────────────────────────────────────
MINIO_ROOT_USER=nexus
MINIO_ROOT_PASSWORD=CHANGE_ME_MINIO_PASSWORD

# ─── Keycloak ─────────────────────────────────────────────────────────────────
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=CHANGE_ME_KC_PASSWORD

# ─── JWT (must match across all services) ─────────────────────────────────────
JWT_SECRET=CHANGE_ME_AT_LEAST_32_CHARS_LONG_RANDOM_STRING

# ─── Integration OAuth ────────────────────────────────────────────────────────
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
INTEGRATION_ENCRYPTION_KEY=CHANGE_ME_32_CHAR_ENCRYPTION_KEY

# ─── Email (for notification-service) ────────────────────────────────────────
SMTP_HOST=smtp.yourdomain.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=

# ─── Domain ───────────────────────────────────────────────────────────────────
APP_URL=https://your-domain.com
CORS_ORIGINS=https://your-domain.com
```

---

## TASK 5 — Fix `.github/workflows/ci.yml` Docker Build Matrix

**File**: `.github/workflows/ci.yml`

The `docker-build` job matrix currently only includes 11 services. Replace the `matrix.service` list with the complete list of all 25 services:

```yaml
        service:
          - auth-service
          - crm-service
          - finance-service
          - notification-service
          - realtime-service
          - search-service
          - workflow-service
          - analytics-service
          - comm-service
          - storage-service
          - billing-service
          - integration-service
          - blueprint-service
          - approval-service
          - data-service
          - document-service
          - chatbot-service
          - cadence-service
          - territory-service
          - planning-service
          - reporting-service
          - portal-service
          - knowledge-service
          - incentive-service
          - ai-service
```

Also add a **deploy job** at the end of the workflow that runs on `main` branch after docker-build succeeds:

```yaml
  deploy:
    name: Deploy to production
    runs-on: ubuntu-latest
    needs: docker-build
    if: github.ref == 'refs/heads/main'
    environment: production
    steps:
      - uses: actions/checkout@v4
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.PROD_HOST }}
          username: ${{ secrets.PROD_USER }}
          key: ${{ secrets.PROD_SSH_KEY }}
          script: |
            cd /opt/nexus
            git pull origin main
            chmod +x scripts/deploy.sh
            ./scripts/deploy.sh ${{ github.sha }}
```

---

## Verification Checklist

- [ ] `docker-compose.prod.yml` exists and references `${IMAGE_TAG}` for all 25 app services
- [ ] `infrastructure/nginx/nginx.conf` exists with HTTP→HTTPS redirect + WebSocket + API proxy blocks
- [ ] `scripts/deploy.sh` exists, has health checks for 5 core services, exits non-zero on failure
- [ ] `scripts/.env.prod.example` exists with all required variables documented
- [ ] `.github/workflows/ci.yml` docker-build matrix has all 25 services
- [ ] `.github/workflows/ci.yml` has `deploy` job wired to SSH deploy
- [ ] No file ends mid-token or mid-block
