# CURSOR PROMPT 16 — Production Readiness

## Context
NEXUS CRM — pnpm monorepo. All backend services in `services/`, frontend in `apps/web/`.
This prompt prepares the entire system for production deployment:
env validation, multi-stage Dockerfiles, Nginx gateway, CI/CD, error budgets, rate limiting, secrets, SSL.

---

## TASK 1 — Environment Variable Validation (All Services)

Every service must crash fast with a clear error if required env vars are missing.
Create a shared utility, then use it in every service.

### File: `packages/service-utils/src/env.ts`
```typescript
export function requireEnv(vars: string[]): Record<string, string> {
  const missing: string[] = [];
  const result: Record<string, string> = {};
  for (const key of vars) {
    const val = process.env[key];
    if (!val) missing.push(key);
    else result[key] = val;
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n${missing.map(k => `  • ${k}`).join('\n')}\n\nCheck your .env file.`
    );
  }
  return result;
}

export function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}
```

Export `requireEnv` and `optionalEnv` from `packages/service-utils/src/index.ts`.

### For each service `index.ts`, wrap config:
Replace ad-hoc `process.env.X ?? 'default'` with `requireEnv([...])`.
Example (crm-service):
```typescript
const env = requireEnv(['DATABASE_URL', 'JWT_SECRET', 'KAFKA_BROKERS']);
const port = Number(optionalEnv('PORT', '3001'));
```

---

## TASK 2 — Multi-Stage Dockerfiles

Each service currently has a basic Dockerfile. Replace every `services/*/Dockerfile` with an optimised multi-stage build.

### Template for all TypeScript services:
```dockerfile
# ── Stage 1: deps ──────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/ ./packages/
COPY services/SERVICE_NAME/package.json ./services/SERVICE_NAME/
RUN corepack enable && pnpm install --frozen-lockfile --filter SERVICE_NAME...

# ── Stage 2: builder ───────────────────────────────────────────────────────
FROM deps AS builder
COPY services/SERVICE_NAME/ ./services/SERVICE_NAME/
COPY packages/ ./packages/
RUN pnpm --filter SERVICE_NAME build

# ── Stage 3: runner ────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/services/SERVICE_NAME/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
USER nextjs
EXPOSE SERVICE_PORT
ENV NODE_ENV=production
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:SERVICE_PORT/health || exit 1
CMD ["node", "dist/index.js"]
```

Create this Dockerfile for every service in `services/`. Replace SERVICE_NAME and SERVICE_PORT with the correct values.

Services and ports:
crm (3001), finance (3002), notification (3003), realtime (3005), search (3006),
workflow (3007), analytics (3008), comm (3009), storage (3010), billing (3011),
integration (3012), blueprint (3013), approval (3014), data (3015), document (3016),
chatbot (3017), cadence (3018), territory (3019), planning (3020), reporting (3021),
portal (3022), knowledge (3023), incentive (3024)

### File: `apps/web/Dockerfile`
```dockerfile
FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/ ./packages/
RUN pnpm install --frozen-lockfile --filter web...

FROM deps AS builder
COPY apps/web/ ./apps/web/
COPY packages/ ./packages/
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter web build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s CMD wget -qO- http://localhost:3000/api/health || exit 1
CMD ["node", "apps/web/server.js"]
```

Also ensure `apps/web/next.config.mjs` has `output: 'standalone'`.

---

## TASK 3 — Nginx API Gateway

### File: `infrastructure/nginx/nginx.conf`
Production-grade Nginx config that:
- Terminates SSL (self-signed cert for dev, replace with Let's Encrypt in prod)
- Routes by path prefix to backend services
- Sets security headers
- Handles CORS at gateway level
- Rate limits by IP

```nginx
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;

events {
  worker_connections 1024;
}

http {
  # Rate limiting zones
  limit_req_zone $binary_remote_addr zone=api:10m rate=60r/m;
  limit_req_zone $binary_remote_addr zone=auth:10m rate=10r/m;

  # Security headers
  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "no-referrer-when-downgrade" always;
  add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

  # Upstreams — match docker-compose service names
  upstream web         { server web:3000; }
  upstream auth        { server auth-service:3000; }
  upstream crm         { server crm-service:3001; }
  upstream finance     { server finance-service:3002; }
  upstream notification { server notification-service:3003; }
  upstream realtime    { server realtime-service:3005; }
  upstream search      { server search-service:3006; }
  upstream workflow    { server workflow-service:3007; }
  upstream analytics   { server analytics-service:3008; }
  upstream comm        { server comm-service:3009; }
  upstream storage     { server storage-service:3010; }
  upstream billing     { server billing-service:3011; }
  upstream integration { server integration-service:3012; }
  upstream blueprint   { server blueprint-service:3013; }
  upstream approval    { server approval-service:3014; }
  upstream data        { server data-service:3015; }
  upstream document    { server document-service:3016; }
  upstream chatbot     { server chatbot-service:3017; }
  upstream cadence     { server cadence-service:3018; }
  upstream territory   { server territory-service:3019; }
  upstream planning    { server planning-service:3020; }
  upstream reporting   { server reporting-service:3021; }
  upstream portal      { server portal-service:3022; }
  upstream knowledge   { server knowledge-service:3023; }
  upstream incentive   { server incentive-service:3024; }

  server {
    listen 80;
    server_name _;
    return 301 https://$host$request_uri;
  }

  server {
    listen 443 ssl http2;
    server_name _;

    ssl_certificate     /etc/nginx/certs/nexus.crt;
    ssl_certificate_key /etc/nginx/certs/nexus.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Main web app
    location / {
      proxy_pass http://web;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Auth service — stricter rate limit
    location /api/auth/ {
      limit_req zone=auth burst=5 nodelay;
      proxy_pass http://auth/;
      proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket (Socket.IO realtime)
    location /socket.io/ {
      proxy_pass http://realtime;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_read_timeout 3600s;
    }

    # Service routes
    location /api/crm/         { limit_req zone=api burst=20; proxy_pass http://crm/; }
    location /api/finance/     { limit_req zone=api burst=20; proxy_pass http://finance/; }
    location /api/notifications/ { proxy_pass http://notification/; }
    location /api/search/      { proxy_pass http://search/; }
    location /api/workflow/    { proxy_pass http://workflow/; }
    location /api/analytics/   { proxy_pass http://analytics/; }
    location /api/comm/        { proxy_pass http://comm/; }
    location /api/storage/     { client_max_body_size 100M; proxy_pass http://storage/; }
    location /api/billing/     { proxy_pass http://billing/; }
    location /api/integration/ { proxy_pass http://integration/; }
    location /api/blueprint/   { proxy_pass http://blueprint/; }
    location /api/approval/    { proxy_pass http://approval/; }
    location /api/data/        { proxy_pass http://data/; }
    location /api/document/    { proxy_pass http://document/; }
    location /api/chatbot/     { proxy_pass http://chatbot/; }
    location /api/cadence/     { proxy_pass http://cadence/; }
    location /api/territory/   { proxy_pass http://territory/; }
    location /api/planning/    { proxy_pass http://planning/; }
    location /api/reporting/   { proxy_pass http://reporting/; }
    location /api/portal/      { proxy_pass http://portal/; }
    location /api/knowledge/   { proxy_pass http://knowledge/; }
    location /api/incentive/   { proxy_pass http://incentive/; }
  }
}
```

### Add to `docker-compose.yml`:
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

### File: `infrastructure/nginx/generate-certs.sh`
```bash
#!/bin/bash
mkdir -p infrastructure/nginx/certs
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout infrastructure/nginx/certs/nexus.key \
  -out infrastructure/nginx/certs/nexus.crt \
  -subj "/C=US/ST=Dev/L=Dev/O=NEXUS/CN=localhost"
echo "Self-signed cert generated. Replace with Let's Encrypt for production."
```

---

## TASK 4 — GitHub Actions CI/CD Pipeline

### File: `.github/workflows/ci.yml`
```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  lint-and-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck

  test:
    runs-on: ubuntu-latest
    needs: lint-and-typecheck
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: nexus
          POSTGRES_PASSWORD: nexus
          POSTGRES_DB: nexus_test
        ports: ['5432:5432']
        options: --health-cmd pg_isready --health-interval 5s --health-timeout 5s --health-retries 10
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm test
        env:
          DATABASE_URL: postgresql://nexus:nexus@localhost:5432/nexus_test
          JWT_SECRET: test-jwt-secret-that-is-at-least-32-chars

  build:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm build

  docker-build:
    runs-on: ubuntu-latest
    needs: build
    if: github.ref == 'refs/heads/main'
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
          file: apps/web/Dockerfile
          push: true
          tags: ghcr.io/${{ github.repository }}/web:latest
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

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            cd /opt/nexus
            git pull origin main
            docker compose pull
            docker compose up -d --remove-orphans
            docker system prune -f
```

---

## TASK 5 — Health Check Standardisation

### File: `packages/service-utils/src/health.ts`
All services should expose a consistent `/health` response:
```typescript
export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  service: string;
  version: string;
  uptime: number;
  timestamp: string;
  checks: {
    name: string;
    status: 'pass' | 'warn' | 'fail';
    responseTime?: number;
    message?: string;
  }[];
}
```

Update `registerHealthRoutes` in service-utils to return this format.
Add `version: process.env.npm_package_version ?? '0.0.0'` to the response.

---

## TASK 6 — .env Files for All Services

Create a `.env.example` file for every service that doesn't have one, listing ALL required variables with placeholder values and comments.

### Template: `services/SERVICE_NAME/.env.example`
```bash
# ── Required ──────────────────────────────────────────────────────────────
PORT=SERVICE_PORT
NODE_ENV=development
DATABASE_URL=postgresql://nexus:nexus@localhost:5432/nexus_SERVICE_NAME
JWT_SECRET=your-jwt-secret-minimum-32-characters-long

# ── Kafka ──────────────────────────────────────────────────────────────────
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=SERVICE_NAME

# ── CORS ───────────────────────────────────────────────────────────────────
CORS_ORIGINS=http://localhost:3000

# ── Optional ───────────────────────────────────────────────────────────────
LOG_LEVEL=info
SENTRY_DSN=   # Leave empty to disable Sentry
```

Create `.env.example` for all 24 TypeScript services. Storage-service additionally needs:
```bash
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=nexus
MINIO_SECRET_KEY=nexus-minio
MINIO_BUCKET=nexus-files
MINIO_USE_SSL=false
```

Also create `apps/web/.env.example`:
```bash
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-nextauth-secret-32-chars-minimum
NEXT_PUBLIC_API_URL=http://localhost:3000/api
NEXT_PUBLIC_REALTIME_URL=http://localhost:3005
NEXT_PUBLIC_POSTHOG_KEY=  # Optional analytics
NEXT_PUBLIC_SENTRY_DSN=   # Optional error tracking
```

---

## TASK 7 — Prometheus Scrape Config

### File: `infrastructure/prometheus/prometheus.yml`
```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

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
    metrics_path: /metrics
    scrape_interval: 30s

  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres-exporter:9187']

  - job_name: 'redis'
    static_configs:
      - targets: ['redis-exporter:9121']
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
```

### File: `infrastructure/grafana/provisioning/dashboards/dashboard.yml`
```yaml
apiVersion: 1
providers:
  - name: 'NEXUS Dashboards'
    type: file
    options:
      path: /etc/grafana/provisioning/dashboards
```

---

## TASK 8 — Database Migration Safety

### File: `scripts/migrate-all.sh`
```bash
#!/bin/bash
set -e
echo "Running Prisma migrations for all services..."

services=(
  "crm-service"
  "auth-service"
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

for svc in "${services[@]}"; do
  echo "→ Migrating $svc..."
  cd "services/$svc"
  pnpm prisma migrate deploy
  cd ../..
done

echo "✓ All migrations complete."
```

### File: `scripts/seed-all.sh`
```bash
#!/bin/bash
set -e
echo "Seeding development data..."
cd services/crm-service && pnpm prisma db seed && cd ../..
cd services/auth-service && pnpm prisma db seed && cd ../..
echo "✓ Seed complete."
```

---

## TASK 9 — Security Hardening

### File: `packages/service-utils/src/security.ts`
Add to every service's Fastify instance:

```typescript
import fp from 'fastify-plugin';
import helmet from '@fastify/helmet';

export const securityPlugin = fp(async (app) => {
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    crossOriginEmbedderPolicy: false,
  });
});
```

Add `@fastify/helmet` to `packages/service-utils/package.json` dependencies.

### Also ensure in every service:
- JWT tokens expire in `15m` (access) and `7d` (refresh)
- Passwords hashed with bcrypt cost factor ≥ 12
- SQL queries use parameterised statements (Prisma handles this)
- File upload: validate MIME type on server side (not just extension)
- Sensitive fields (`password`, `refreshToken`) excluded from all `SELECT *` queries

---

## TASK 10 — Production Makefile / Scripts

### File: `Makefile`
```makefile
.PHONY: dev prod build test lint clean db-migrate db-seed certs

# ── Development ────────────────────────────────────────────────────────────
dev:
	docker compose -f docker-compose.yml up -d postgres redis kafka meilisearch minio
	pnpm dev

# ── Production ─────────────────────────────────────────────────────────────
prod:
	docker compose up -d --build

prod-down:
	docker compose down

# ── Build ──────────────────────────────────────────────────────────────────
build:
	pnpm build

# ── Testing ────────────────────────────────────────────────────────────────
test:
	pnpm test

test-watch:
	pnpm test --watch

# ── Quality ────────────────────────────────────────────────────────────────
lint:
	pnpm lint

typecheck:
	pnpm typecheck

# ── Database ───────────────────────────────────────────────────────────────
db-migrate:
	bash scripts/migrate-all.sh

db-seed:
	bash scripts/seed-all.sh

# ── Infrastructure ─────────────────────────────────────────────────────────
certs:
	bash infrastructure/nginx/generate-certs.sh

# ── Cleanup ────────────────────────────────────────────────────────────────
clean:
	docker compose down -v
	pnpm clean
```

---

## TASK 11 — README Update

### File: `README.md` — REWRITE as comprehensive setup guide:

Sections:
1. **NEXUS CRM** — one-paragraph intro, architecture overview diagram (ASCII)
2. **Prerequisites** — Node 20, pnpm 9, Docker & Docker Compose, 8GB RAM minimum
3. **Quick Start (Development)**
   ```bash
   git clone https://github.com/org/nexus.git
   cd nexus
   cp apps/web/.env.example apps/web/.env.local
   # Copy .env.example for each service you need
   make certs          # Generate dev SSL certificates
   make dev            # Start infra containers
   pnpm install        # Install all dependencies
   make db-migrate     # Run Prisma migrations
   make db-seed        # Seed demo data
   pnpm dev            # Start all services in dev mode
   # App available at http://localhost:3000
   ```
4. **Architecture** — table of all 25 services with port and responsibility
5. **Environment Variables** — link to each service's `.env.example`
6. **Running in Production** — `make prod` with pre-flight checklist
7. **Testing** — `make test`, how smoke tests work
8. **Monitoring** — Prometheus at :9090, Grafana at :3200 (admin/nexus-grafana)
9. **Contributing** — branch naming, PR checklist, commit format

---

## Verification Checklist
- [ ] `requireEnv()` exported from service-utils and used in at least 5 services
- [ ] Multi-stage Dockerfile created for all 24 TypeScript services
- [ ] `apps/web/next.config.mjs` has `output: 'standalone'`
- [ ] `infrastructure/nginx/nginx.conf` routes all 24 service prefixes
- [ ] `.github/workflows/ci.yml` has lint + test + build jobs
- [ ] `.github/workflows/deploy.yml` has SSH deploy step
- [ ] `infrastructure/prometheus/prometheus.yml` lists all 24 service targets
- [ ] `infrastructure/grafana/provisioning/` has datasource and dashboard YAMLs
- [ ] `.env.example` exists for all 24 services and apps/web
- [ ] `scripts/migrate-all.sh` lists all services with Prisma schemas
- [ ] `Makefile` has dev, prod, build, test, lint, db-migrate, db-seed, certs targets
- [ ] README.md has Quick Start, Architecture table, and Monitoring sections
- [ ] `@fastify/helmet` security plugin added to service-utils
- [ ] Nginx added to docker-compose.yml with correct upstream names
