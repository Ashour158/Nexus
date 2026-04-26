# CURSOR PROMPT 19 — DevOps Infrastructure (All P0 Infra Blockers)

## Context
NEXUS CRM — pnpm monorepo. All backend services in `services/`, frontend in `apps/web/`.
This prompt fixes 12 DevOps P0 blockers and 9 P1 issues that prevent production deployment.
Write every file COMPLETELY — no truncation.

IMPORTANT: The services folder is `services/` NOT `apps/` for all backend services.

---

## TASK 1 — Fix Docker Compose Port Conflicts

### File: `docker-compose.yml`

Fix these three port conflicts:

**1. auth-service** — change `3010:3010` to `3000:3000`:
```yaml
  auth-service:
    # ... other config unchanged ...
    ports:
      - '3000:3000'
    # Also update env:
    environment:
      PORT: '3000'
```

**2. approval-service** — change `3013:3013` to `3014:3014`:
```yaml
  approval-service:
    # ... other config unchanged ...
    ports:
      - '3014:3014'
    environment:
      PORT: '3014'
```

**3. ClickHouse** — remove the conflicting `9000:9000` port (MinIO uses 9000). Keep only HTTP port:
```yaml
  clickhouse:
    image: clickhouse/clickhouse-server:24.3
    container_name: nexus-clickhouse
    restart: unless-stopped
    ports:
      - '8123:8123'
      # Remove '9000:9000' — conflicts with MinIO
    volumes:
      - clickhouse_data:/var/lib/clickhouse
      - ./services/analytics-service/src/ddl/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    healthcheck:
      test: ['CMD', 'wget', '--no-verbose', '--tries=1', '--spider', 'http://localhost:8123/ping']
      interval: 10s
      timeout: 5s
      retries: 5
```

Also add `AUTH_SERVICE_URL` environment variable to `apps/web/.env.example`:
```
AUTH_SERVICE_URL=http://auth-service:3000
```

---

## TASK 2 — Create Root .dockerignore

### File: `.dockerignore` (at repo root)
```
# Dependencies — never copy, always reinstall in Docker
node_modules
**/node_modules
.pnpm-store

# Build outputs
dist
**/.next
**/dist
**/build
**/out

# Environment files — NEVER bake secrets into images
.env
.env.*
**/.env
**/.env.*
!**/.env.example

# Development tools
.git
.gitignore
**/*.log
npm-debug.log*
pnpm-debug.log*

# OS files
.DS_Store
Thumbs.db

# Editor
.vscode
.idea
**/*.swp

# Test artifacts
coverage
**/*.test.js
**/*.spec.js
**/jest.config.*
**/vitest.config.*

# Documentation
*.md
!README.md
LICENSE
```

---

## TASK 3 — Multi-Stage Dockerfiles for All TypeScript Services

Create the following Dockerfile for EACH of the 24 TypeScript services.
Replace SERVICE_NAME and SERVICE_PORT with the correct values from the table below.

**Port reference:**
crm=3001, finance=3002, notification=3003, realtime=3005, search=3006,
workflow=3007, analytics=3008, comm=3009, storage=3010, billing=3011,
integration=3012, blueprint=3013, approval=3014, data=3015, document=3016,
chatbot=3017, cadence=3018, territory=3019, planning=3020, reporting=3021,
portal=3022, knowledge=3023, incentive=3024

### Template: `services/SERVICE_NAME/Dockerfile`
```dockerfile
# ── Stage 1: Install dependencies ─────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/ ./packages/
COPY services/SERVICE_NAME/package.json ./services/SERVICE_NAME/

RUN pnpm install --frozen-lockfile --filter SERVICE_NAME...

# ── Stage 2: Build ────────────────────────────────────────────────────────
FROM deps AS builder
COPY services/SERVICE_NAME/ ./services/SERVICE_NAME/
COPY packages/ ./packages/

RUN pnpm --filter SERVICE_NAME run build

# ── Stage 3: Production runner ────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 service

# Copy only what's needed to run
COPY --from=builder --chown=service:nodejs /app/services/SERVICE_NAME/dist ./dist
COPY --from=builder --chown=service:nodejs /app/services/SERVICE_NAME/package.json ./package.json
COPY --from=builder --chown=service:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=service:nodejs /app/packages ./packages

USER service
EXPOSE SERVICE_PORT
ENV NODE_ENV=production PORT=SERVICE_PORT

HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
  CMD wget -qO- http://localhost:SERVICE_PORT/health || exit 1

CMD ["node", "dist/index.js"]
```

Create this file 24 times, once per service (crm, finance, notification, realtime, search, workflow, analytics, comm, storage, billing, integration, blueprint, approval, data, document, chatbot, cadence, territory, planning, reporting, portal, knowledge, incentive, auth).

**auth-service** uses port 3000 (not in list above — add it):
```dockerfile
# services/auth-service/Dockerfile — same template, PORT=3000
```

---

## TASK 4 — Fix Next.js Standalone Build

### File: `apps/web/next.config.mjs`
Add `output: 'standalone'` to the Next.js config:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',  // ← ADD THIS LINE
  // ... keep all existing config options
  reactStrictMode: true,
  images: {
    // ... existing image config
  },
  // ... rest of config
};

export default nextConfig;
```

This enables the Docker standalone build where `node apps/web/server.js` starts the app.

---

## TASK 5 — Create GitHub Actions CI/CD Pipeline

### File: `.github/workflows/ci.yml`
```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  # ── Lint & Type Check ────────────────────────────────────────────────────
  quality:
    name: Lint & Typecheck
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Lint
        run: pnpm lint
      - name: Typecheck
        run: pnpm typecheck

  # ── Tests ────────────────────────────────────────────────────────────────
  test:
    name: Tests
    runs-on: ubuntu-latest
    needs: quality
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: nexus
          POSTGRES_PASSWORD: nexus
          POSTGRES_DB: nexus_test
        ports:
          - '5432:5432'
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
      redis:
        image: redis:7-alpine
        ports:
          - '6379:6379'
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Run tests
        run: pnpm test
        env:
          NODE_ENV: test
          DATABASE_URL: postgresql://nexus:nexus@localhost:5432/nexus_test
          REDIS_URL: redis://localhost:6379
          JWT_SECRET: test-jwt-secret-at-least-32-chars-long!!
          KAFKA_BROKERS: ''  # Skip Kafka in CI

  # ── Build ────────────────────────────────────────────────────────────────
  build:
    name: Build
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Build all packages and services
        run: pnpm build
        env:
          NODE_ENV: production
          NEXT_TELEMETRY_DISABLED: 1

  # ── Docker Build (main branch only) ──────────────────────────────────────
  docker:
    name: Build & Push Docker Images
    runs-on: ubuntu-latest
    needs: build
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - name: Build and push web
        uses: docker/build-push-action@v5
        with:
          context: .
          file: ./apps/web/Dockerfile
          push: true
          tags: |
            ghcr.io/${{ github.repository }}/web:latest
            ghcr.io/${{ github.repository }}/web:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

### File: `.github/workflows/deploy.yml`
```yaml
name: Deploy to Production

on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      environment:
        description: 'Target environment'
        required: true
        default: 'production'
        type: choice
        options: [production, staging]

jobs:
  deploy:
    name: Deploy
    runs-on: ubuntu-latest
    environment: ${{ github.event.inputs.environment || 'production' }}
    concurrency:
      group: deploy-${{ github.event.inputs.environment || 'production' }}
      cancel-in-progress: false  # Never cancel in-progress deploys
    steps:
      - uses: actions/checkout@v4

      - name: Create deployment
        id: deployment
        uses: actions/github-script@v7
        with:
          script: |
            const deployment = await github.rest.repos.createDeployment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              ref: context.sha,
              environment: '${{ github.event.inputs.environment || "production" }}',
              auto_merge: false,
              required_contexts: [],
            });
            return deployment.data.id;

      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          port: ${{ secrets.DEPLOY_PORT || 22 }}
          script: |
            set -e
            cd /opt/nexus
            echo "Pulling latest code..."
            git fetch origin main
            git reset --hard origin/main
            echo "Pulling Docker images..."
            docker compose pull
            echo "Running migrations..."
            bash scripts/migrate-all.sh
            echo "Starting services..."
            docker compose up -d --remove-orphans --wait
            echo "Cleaning up old images..."
            docker system prune -f --filter "until=24h"
            echo "Deploy complete ✓"

      - name: Update deployment status
        if: always()
        uses: actions/github-script@v7
        with:
          script: |
            await github.rest.repos.createDeploymentStatus({
              owner: context.repo.owner,
              repo: context.repo.repo,
              deployment_id: ${{ steps.deployment.outputs.result }},
              state: '${{ job.status }}' === 'success' ? 'success' : 'failure',
              environment_url: '${{ secrets.APP_URL }}',
            });
```

---

## TASK 6 — Create Nginx Config

### File: `infrastructure/nginx/nginx.conf`
```nginx
user nginx;
worker_processes auto;
pid /var/run/nginx.pid;
error_log /var/log/nginx/error.log warn;

events {
  worker_connections 2048;
  multi_accept on;
}

http {
  include /etc/nginx/mime.types;
  default_type application/octet-stream;

  # Logging
  log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                  '$status $body_bytes_sent "$http_referer" "$http_user_agent"';
  access_log /var/log/nginx/access.log main;

  # Performance
  sendfile on;
  tcp_nopush on;
  tcp_nodelay on;
  keepalive_timeout 65;
  gzip on;
  gzip_vary on;
  gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

  # Rate limiting zones
  limit_req_zone $binary_remote_addr zone=api_limit:10m rate=60r/m;
  limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=10r/m;
  limit_conn_zone $binary_remote_addr zone=conn_limit:10m;

  # Security headers
  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header X-XSS-Protection "1; mode=block" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

  # Upstreams — match docker-compose service names
  upstream web            { server web:3000 max_fails=3 fail_timeout=30s; }
  upstream auth           { server auth-service:3000 max_fails=3 fail_timeout=30s; }
  upstream crm            { server crm-service:3001; }
  upstream finance        { server finance-service:3002; }
  upstream notification   { server notification-service:3003; }
  upstream realtime       { server realtime-service:3005; }
  upstream search         { server search-service:3006; }
  upstream workflow       { server workflow-service:3007; }
  upstream analytics      { server analytics-service:3008; }
  upstream comm           { server comm-service:3009; }
  upstream storage        { server storage-service:3010; }
  upstream billing        { server billing-service:3011; }
  upstream integration    { server integration-service:3012; }
  upstream blueprint      { server blueprint-service:3013; }
  upstream approval       { server approval-service:3014; }
  upstream data           { server data-service:3015; }
  upstream document       { server document-service:3016; }
  upstream chatbot        { server chatbot-service:3017; }
  upstream cadence        { server cadence-service:3018; }
  upstream territory      { server territory-service:3019; }
  upstream planning       { server planning-service:3020; }
  upstream reporting      { server reporting-service:3021; }
  upstream portal         { server portal-service:3022; }
  upstream knowledge      { server knowledge-service:3023; }
  upstream incentive      { server incentive-service:3024; }

  # HTTP → HTTPS redirect
  server {
    listen 80;
    server_name _;
    return 301 https://$host$request_uri;
  }

  # Main HTTPS server
  server {
    listen 443 ssl http2;
    server_name _;

    ssl_certificate     /etc/nginx/certs/nexus.crt;
    ssl_certificate_key /etc/nginx/certs/nexus.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    # File upload limit (storage-service)
    client_max_body_size 100M;

    # Default: proxy to Next.js app
    location / {
      proxy_pass http://web;
      proxy_http_version 1.1;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_read_timeout 60s;
    }

    # WebSocket — Socket.IO
    location /socket.io/ {
      proxy_pass http://realtime;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_read_timeout 3600s;
      proxy_send_timeout 3600s;
    }

    # Auth — strict rate limit
    location /api/v1/auth/ {
      limit_req zone=auth_limit burst=5 nodelay;
      proxy_pass http://auth/;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Service API routes
    location /api/v1/crm/         { limit_req zone=api_limit burst=30 nodelay; proxy_pass http://crm/; }
    location /api/v1/finance/     { limit_req zone=api_limit burst=20 nodelay; proxy_pass http://finance/; }
    location /api/v1/notification/{ proxy_pass http://notification/; }
    location /api/v1/search/      { limit_req zone=api_limit burst=60 nodelay; proxy_pass http://search/; }
    location /api/v1/workflow/    { proxy_pass http://workflow/; }
    location /api/v1/analytics/   { proxy_pass http://analytics/; }
    location /api/v1/comm/        { proxy_pass http://comm/; }
    location /api/v1/storage/     { proxy_pass http://storage/; }
    location /api/v1/billing/     { proxy_pass http://billing/; }
    location /api/v1/integration/ { proxy_pass http://integration/; }
    location /api/v1/blueprint/   { proxy_pass http://blueprint/; }
    location /api/v1/approval/    { proxy_pass http://approval/; }
    location /api/v1/data/        { proxy_pass http://data/; }
    location /api/v1/document/    { proxy_pass http://document/; }
    location /api/v1/chatbot/     { proxy_pass http://chatbot/; }
    location /api/v1/cadence/     { proxy_pass http://cadence/; }
    location /api/v1/territory/   { proxy_pass http://territory/; }
    location /api/v1/planning/    { proxy_pass http://planning/; }
    location /api/v1/reporting/   { proxy_pass http://reporting/; }
    location /api/v1/portal/      { proxy_pass http://portal/; }
    location /api/v1/knowledge/   { proxy_pass http://knowledge/; }
    location /api/v1/incentive/   { proxy_pass http://incentive/; }

    # Health check (no rate limit, no auth)
    location /health {
      proxy_pass http://web/api/health;
      access_log off;
    }
  }
}
```

### File: `infrastructure/nginx/generate-certs.sh`
```bash
#!/bin/bash
set -e
mkdir -p infrastructure/nginx/certs
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout infrastructure/nginx/certs/nexus.key \
  -out infrastructure/nginx/certs/nexus.crt \
  -subj "/C=US/ST=Dev/L=Dev/O=NEXUS/CN=localhost"
echo "✓ Self-signed certificate generated at infrastructure/nginx/certs/"
echo "  Replace with Let's Encrypt for production."
```

Add to `docker-compose.yml`:
```yaml
  nginx:
    image: nginx:1.25-alpine
    container_name: nexus-nginx
    restart: unless-stopped
    ports:
      - '80:80'
      - '443:443'
    volumes:
      - ./infrastructure/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./infrastructure/nginx/certs:/etc/nginx/certs:ro
    depends_on:
      - web
      - auth-service
      - crm-service
```

---

## TASK 7 — Create Prometheus Config

### File: `infrastructure/prometheus/prometheus.yml`
```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  scrape_timeout: 10s

# Alert manager (optional, uncomment if you have one)
# alerting:
#   alertmanagers:
#     - static_configs:
#         - targets: ['alertmanager:9093']

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'nexus-auth'
    static_configs:
      - targets: ['auth-service:3000']
    metrics_path: '/metrics'
    scrape_interval: 30s

  - job_name: 'nexus-services'
    static_configs:
      - targets:
          - 'crm-service:3001'
          - 'finance-service:3002'
          - 'notification-service:3003'
          - 'realtime-service:3005'
          - 'search-service:3006'
          - 'workflow-service:3007'
          - 'analytics-service:3008'
          - 'comm-service:3009'
          - 'storage-service:3010'
          - 'billing-service:3011'
          - 'integration-service:3012'
          - 'blueprint-service:3013'
          - 'approval-service:3014'
          - 'data-service:3015'
          - 'document-service:3016'
          - 'chatbot-service:3017'
          - 'cadence-service:3018'
          - 'territory-service:3019'
          - 'planning-service:3020'
          - 'reporting-service:3021'
          - 'portal-service:3022'
          - 'knowledge-service:3023'
          - 'incentive-service:3024'
    metrics_path: '/metrics'
    scrape_interval: 30s

  - job_name: 'nexus-web'
    static_configs:
      - targets: ['web:3000']
    metrics_path: '/api/metrics'
    scrape_interval: 30s
```

### File: `infrastructure/grafana/provisioning/datasources/prometheus.yml`
```yaml
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false
    jsonData:
      timeInterval: '15s'
      queryTimeout: '60s'
      httpMethod: 'POST'
```

### File: `infrastructure/grafana/provisioning/dashboards/dashboard.yml`
```yaml
apiVersion: 1

providers:
  - name: 'NEXUS Dashboards'
    orgId: 1
    type: file
    disableDeletion: false
    updateIntervalSeconds: 30
    allowUiUpdates: true
    options:
      path: /etc/grafana/provisioning/dashboards
      foldersFromFilesStructure: true
```

---

## TASK 8 — Create Migration Script

### File: `scripts/migrate-all.sh`
```bash
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
```

```bash
chmod +x scripts/migrate-all.sh
```

### File: `scripts/seed-dev.sh`
```bash
#!/bin/bash
set -e
echo "Seeding development data..."
if [ -f "services/auth-service/prisma/seed.ts" ]; then
  cd services/auth-service && pnpm prisma db seed && cd ../..
  echo "✓ auth-service seeded"
fi
if [ -f "services/crm-service/prisma/seed.ts" ]; then
  cd services/crm-service && pnpm prisma db seed && cd ../..
  echo "✓ crm-service seeded"
fi
echo "✅ Dev seed complete."
```

---

## TASK 9 — Fix Redis Password in All Service Env Files

For every service that uses Redis, update its `.env.example` to include the Redis password.
Services that use Redis: `notification-service`, `auth-service`, `realtime-service`, `comm-service`.

Add to each of their `.env.example` files:
```bash
# Redis — must include password if Redis is configured with requirepass
REDIS_URL=redis://:nexus@redis:6379
# Or equivalently:
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=nexus
```

Also update the service connection code. For any service using `ioredis` or `redis`:
```typescript
// OLD (no auth):
const redis = new Redis({ host: process.env.REDIS_HOST, port: 6379 });

// NEW (with auth):
const redis = new Redis({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD,
});
```

---

## TASK 10 — Security Hardening

### Fix auth rate limiting — `services/auth-service/src/index.ts`
Find the rateLimit registration. Add a stricter limit for auth routes:

```typescript
// After the global rateLimit registration, add auth-specific limit:
await app.register(rateLimit, {
  global: false,  // Don't override the global limit
  max: 10,        // Only 10 attempts per minute per IP
  timeWindow: '1 minute',
  keyGenerator: (req) => req.ip,
  errorResponseBuilder: (_req, context) => ({
    success: false,
    error: 'TOO_MANY_ATTEMPTS',
    message: `Too many login attempts. Please wait ${context.after} before trying again.`,
    retryAfter: context.after,
  }),
}, async (fastify) => {
  // Apply to login and password reset routes only
  fastify.addHook('onRoute', (routeOptions) => {
    if (routeOptions.url.includes('/login') || routeOptions.url.includes('/forgot-password')) {
      routeOptions.config = { ...routeOptions.config, rateLimit: { max: 10, timeWindow: '1 minute' } };
    }
  });
});
```

### Fix CSP in Next.js — `apps/web/next.config.mjs`
Add security headers:

```javascript
const nextConfig = {
  output: 'standalone',
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",  // unsafe-eval needed for Next.js dev
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self'",
              "connect-src 'self' wss: https:",
              "frame-ancestors 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },
  // ... rest of config
};
```

### Fix .gitignore — ensure .env.local is excluded
```bash
# Append to .gitignore if not already present:
echo "\n# Local environment files — NEVER commit\n.env.local\n**/.env.local\n.env*.local\n**/.env*.local" >> .gitignore
```

If `.env.local` is already tracked by git, remove it:
```bash
git rm --cached apps/web/.env.local 2>/dev/null || true
git rm --cached "**/.env.local" 2>/dev/null || true
```

---

## TASK 11 — Add Makefile

### File: `Makefile`
```makefile
.PHONY: dev infra prod stop build test lint typecheck db-migrate db-seed certs clean logs

# ── Development ────────────────────────────────────────────────────────────
dev: infra
	pnpm dev

infra:
	docker compose up -d postgres redis kafka zookeeper meilisearch minio clickhouse
	@echo "⏳ Waiting for infrastructure..."
	@sleep 5
	@echo "✅ Infrastructure ready"

# ── Production ─────────────────────────────────────────────────────────────
prod: certs
	docker compose up -d --build --wait
	@echo "✅ NEXUS running at https://localhost"

stop:
	docker compose down

# ── Build ──────────────────────────────────────────────────────────────────
build:
	pnpm build

# ── Quality ────────────────────────────────────────────────────────────────
test:
	pnpm test

test-watch:
	pnpm test --watch

lint:
	pnpm lint

typecheck:
	pnpm typecheck

# ── Database ───────────────────────────────────────────────────────────────
db-migrate:
	@bash scripts/migrate-all.sh

db-seed:
	@bash scripts/seed-dev.sh

# ── Infrastructure ─────────────────────────────────────────────────────────
certs:
	@if [ ! -f infrastructure/nginx/certs/nexus.crt ]; then \
		bash infrastructure/nginx/generate-certs.sh; \
	else \
		echo "Certs already exist — skipping"; \
	fi

# ── Logs ───────────────────────────────────────────────────────────────────
logs:
	docker compose logs -f --tail=100

logs-%:
	docker compose logs -f --tail=100 nexus-$*

# ── Cleanup ────────────────────────────────────────────────────────────────
clean:
	docker compose down -v --remove-orphans
	pnpm clean
	@echo "✅ Clean complete. Run 'make dev' to start fresh."
```

---

## Verification Checklist
- [ ] `docker compose config` exits with no errors (no port conflicts)
- [ ] auth-service port is 3000, storage-service port is 3010 (no conflict)
- [ ] approval-service port is 3014, blueprint-service is 3013 (no conflict)
- [ ] ClickHouse has only port 8123 (9000 removed, no conflict with MinIO)
- [ ] `.dockerignore` exists at repo root excluding node_modules and .env files
- [ ] `services/crm-service/Dockerfile` has 3 stages (deps, builder, runner)
- [ ] `apps/web/next.config.mjs` has `output: 'standalone'`
- [ ] `.github/workflows/ci.yml` exists with lint + test + build + docker jobs
- [ ] `.github/workflows/deploy.yml` exists with SSH deploy step
- [ ] `infrastructure/nginx/nginx.conf` exists with all 24 upstream blocks
- [ ] `infrastructure/prometheus/prometheus.yml` lists all 24 service targets
- [ ] `infrastructure/grafana/provisioning/datasources/prometheus.yml` exists
- [ ] `infrastructure/grafana/provisioning/dashboards/dashboard.yml` exists
- [ ] `scripts/migrate-all.sh` is executable and lists 21 Prisma services
- [ ] Auth service rateLimit is 10/min for login routes
- [ ] `apps/web/next.config.mjs` has security headers including X-Frame-Options and CSP
- [ ] `.gitignore` includes `.env.local` and `**/.env.local`
- [ ] `Makefile` has dev, prod, build, test, lint, db-migrate, certs targets
- [ ] Redis password is set in env files for notification, auth, realtime, comm services
