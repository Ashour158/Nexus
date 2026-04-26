# Prompt 6 — Observability: Prometheus, Grafana, Sentry, .env.prod.example

## Context

NEXUS CRM — pnpm monorepo. Services emit Prometheus metrics via `prom-client` (wired in
`@nexus/service-utils`), but there is no Prometheus or Grafana container in `docker-compose.yml`
to scrape them. Sentry is not installed anywhere. `scripts/.env.prod.example` is missing but
referenced by `scripts/deploy.sh`.

---

## TASK 1 — Add Prometheus + Grafana to `docker-compose.yml`

**File:** `docker-compose.yml`

Append the following two service definitions at the end of the `services:` block, before the
`volumes:` section. Follow the exact indentation and formatting of existing entries.

```yaml
  prometheus:
    image: prom/prometheus:v2.51.0
    container_name: nexus_prometheus
    volumes:
      - ./infrastructure/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/etc/prometheus/console_libraries'
      - '--web.console.templates=/etc/prometheus/consoles'
      - '--storage.tsdb.retention.time=15d'
    ports:
      - '9090:9090'
    networks:
      - nexus-network
    restart: unless-stopped

  grafana:
    image: grafana/grafana:10.4.0
    container_name: nexus_grafana
    environment:
      - GF_SECURITY_ADMIN_USER=${GRAFANA_USER:-admin}
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD:-nexus-admin}
      - GF_USERS_ALLOW_SIGN_UP=false
    volumes:
      - grafana_data:/var/lib/grafana
      - ./infrastructure/grafana/provisioning:/etc/grafana/provisioning:ro
    ports:
      - '3100:3000'
    networks:
      - nexus-network
    depends_on:
      - prometheus
    restart: unless-stopped
```

Also add the two volumes at the end of the `volumes:` block:

```yaml
  prometheus_data:
  grafana_data:
```

---

## TASK 2 — Create `infrastructure/prometheus/prometheus.yml`

Create this file. It scrapes the `/metrics` endpoint from all 25 services every 15 seconds.

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'nexus-auth-service'
    static_configs:
      - targets: ['auth-service:3010']
    metrics_path: /metrics

  - job_name: 'nexus-crm-service'
    static_configs:
      - targets: ['crm-service:3001']
    metrics_path: /metrics

  - job_name: 'nexus-finance-service'
    static_configs:
      - targets: ['finance-service:3002']
    metrics_path: /metrics

  - job_name: 'nexus-notification-service'
    static_configs:
      - targets: ['notification-service:3003']
    metrics_path: /metrics

  - job_name: 'nexus-realtime-service'
    static_configs:
      - targets: ['realtime-service:3005']
    metrics_path: /metrics

  - job_name: 'nexus-search-service'
    static_configs:
      - targets: ['search-service:3006']
    metrics_path: /metrics

  - job_name: 'nexus-workflow-service'
    static_configs:
      - targets: ['workflow-service:3007']
    metrics_path: /metrics

  - job_name: 'nexus-analytics-service'
    static_configs:
      - targets: ['analytics-service:3008']
    metrics_path: /metrics

  - job_name: 'nexus-comm-service'
    static_configs:
      - targets: ['comm-service:3009']
    metrics_path: /metrics

  - job_name: 'nexus-auth-service-port'
    static_configs:
      - targets: ['auth-service:3010']
    metrics_path: /metrics

  - job_name: 'nexus-billing-service'
    static_configs:
      - targets: ['billing-service:3011']
    metrics_path: /metrics

  - job_name: 'nexus-integration-service'
    static_configs:
      - targets: ['integration-service:3012']
    metrics_path: /metrics

  - job_name: 'nexus-blueprint-service'
    static_configs:
      - targets: ['blueprint-service:3013']
    metrics_path: /metrics

  - job_name: 'nexus-approval-service'
    static_configs:
      - targets: ['approval-service:3014']
    metrics_path: /metrics

  - job_name: 'nexus-data-service'
    static_configs:
      - targets: ['data-service:3015']
    metrics_path: /metrics

  - job_name: 'nexus-document-service'
    static_configs:
      - targets: ['document-service:3016']
    metrics_path: /metrics

  - job_name: 'nexus-chatbot-service'
    static_configs:
      - targets: ['chatbot-service:3017']
    metrics_path: /metrics

  - job_name: 'nexus-cadence-service'
    static_configs:
      - targets: ['cadence-service:3018']
    metrics_path: /metrics

  - job_name: 'nexus-territory-service'
    static_configs:
      - targets: ['territory-service:3019']
    metrics_path: /metrics

  - job_name: 'nexus-planning-service'
    static_configs:
      - targets: ['planning-service:3020']
    metrics_path: /metrics

  - job_name: 'nexus-reporting-service'
    static_configs:
      - targets: ['reporting-service:3021']
    metrics_path: /metrics

  - job_name: 'nexus-portal-service'
    static_configs:
      - targets: ['portal-service:3022']
    metrics_path: /metrics

  - job_name: 'nexus-knowledge-service'
    static_configs:
      - targets: ['knowledge-service:3023']
    metrics_path: /metrics

  - job_name: 'nexus-incentive-service'
    static_configs:
      - targets: ['incentive-service:3024']
    metrics_path: /metrics
```

---

## TASK 3 — Create Grafana Provisioning Directory

Create `infrastructure/grafana/provisioning/datasources/prometheus.yml`:

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

Create `infrastructure/grafana/provisioning/dashboards/dashboard.yml`:

```yaml
apiVersion: 1

providers:
  - name: 'Nexus CRM'
    orgId: 1
    folder: 'Nexus'
    type: file
    disableDeletion: false
    editable: true
    options:
      path: /etc/grafana/provisioning/dashboards
```

---

## TASK 4 — Install Sentry in Frontend

**File:** `apps/web/`

Install the Sentry Next.js SDK:
```bash
pnpm --filter web add @sentry/nextjs
```

Create `apps/web/sentry.client.config.ts`:
```typescript
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  debug: false,
  enabled: process.env.NODE_ENV === 'production',
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.05,
});
```

Create `apps/web/sentry.server.config.ts`:
```typescript
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  debug: false,
  enabled: process.env.NODE_ENV === 'production',
});
```

Update `apps/web/next.config.ts` (or `.js`) to wrap with Sentry:
```typescript
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig = {
  // existing config
};

export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
});
```

Add to `apps/web/.env.example`:
```
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_DSN=
SENTRY_ORG=
SENTRY_PROJECT=
```

---

## TASK 5 — Install Sentry in `@nexus/service-utils`

```bash
pnpm --filter @nexus/service-utils add @sentry/node
```

In `packages/service-utils/src/errors.ts`, add Sentry capture at the top of `globalErrorHandler`:

```typescript
import * as Sentry from '@sentry/node';

export function globalErrorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  // Capture unexpected errors in Sentry (skip 4xx client errors)
  if (!error.statusCode || error.statusCode >= 500) {
    Sentry.captureException(error, {
      extra: {
        url: request.url,
        method: request.method,
        tenantId: (request.user as any)?.tenantId,
      },
    });
  }
  // ... existing error handler logic
}
```

Initialize Sentry in `packages/service-utils/src/server.ts` (inside `createService` or at module
top):

```typescript
import * as Sentry from '@sentry/node';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.05,
    environment: process.env.NODE_ENV ?? 'development',
  });
}
```

Add to each service's `.env.example`:
```
SENTRY_DSN=
```

---

## TASK 6 — Create `scripts/.env.prod.example`

Create `scripts/.env.prod.example` with all production environment variables:

```bash
# ─── Infrastructure ──────────────────────────────────────────────────────────
POSTGRES_USER=nexus
POSTGRES_PASSWORD=CHANGE_ME_STRONG_PASSWORD
POSTGRES_HOST=postgres
POSTGRES_PORT=5432

REDIS_URL=redis://redis:6379
KAFKA_BROKERS=kafka:9092

MEILISEARCH_HOST=http://meilisearch:7700
MEILISEARCH_API_KEY=CHANGE_ME

MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_ACCESS_KEY=CHANGE_ME
MINIO_SECRET_KEY=CHANGE_ME
MINIO_BUCKET=nexus-documents

KEYCLOAK_URL=https://auth.yourdomain.com
KEYCLOAK_REALM=nexus
KEYCLOAK_CLIENT_ID=nexus-app
KEYCLOAK_CLIENT_SECRET=CHANGE_ME

CLICKHOUSE_HOST=http://clickhouse:8123
CLICKHOUSE_DB=nexus_analytics
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=CHANGE_ME

# ─── JWT ─────────────────────────────────────────────────────────────────────
JWT_SECRET=CHANGE_ME_64_CHAR_MINIMUM_RANDOM_STRING

# ─── Image Tags ──────────────────────────────────────────────────────────────
IMAGE_TAG=latest

# ─── Service Database URLs ───────────────────────────────────────────────────
AUTH_DATABASE_URL=postgresql://nexus:CHANGE_ME@postgres:5432/nexus_auth
CRM_DATABASE_URL=postgresql://nexus:CHANGE_ME@postgres:5432/nexus_crm
FINANCE_DATABASE_URL=postgresql://nexus:CHANGE_ME@postgres:5432/nexus_finance
NOTIFICATION_DATABASE_URL=postgresql://nexus:CHANGE_ME@postgres:5432/nexus_notifications
COMM_DATABASE_URL=postgresql://nexus:CHANGE_ME@postgres:5432/nexus_comm
WORKFLOW_DATABASE_URL=postgresql://nexus:CHANGE_ME@postgres:5432/nexus_workflow
BILLING_DATABASE_URL=postgresql://nexus:CHANGE_ME@postgres:5432/nexus_billing
INTEGRATION_DATABASE_URL=postgresql://nexus:CHANGE_ME@postgres:5432/nexus_integration
BLUEPRINT_DATABASE_URL=postgresql://nexus:CHANGE_ME@postgres:5432/nexus_blueprint
APPROVAL_DATABASE_URL=postgresql://nexus:CHANGE_ME@postgres:5432/nexus_approval
DATA_DATABASE_URL=postgresql://nexus:CHANGE_ME@postgres:5432/nexus_data
DOCUMENT_DATABASE_URL=postgresql://nexus:CHANGE_ME@postgres:5432/nexus_document
CHATBOT_DATABASE_URL=postgresql://nexus:CHANGE_ME@postgres:5432/nexus_chatbot
CADENCE_DATABASE_URL=postgresql://nexus:CHANGE_ME@postgres:5432/nexus_cadence
TERRITORY_DATABASE_URL=postgresql://nexus:CHANGE_ME@postgres:5432/nexus_territory
PLANNING_DATABASE_URL=postgresql://nexus:CHANGE_ME@postgres:5432/nexus_planning
REPORTING_DATABASE_URL=postgresql://nexus:CHANGE_ME@postgres:5432/nexus_reporting
PORTAL_DATABASE_URL=postgresql://nexus:CHANGE_ME@postgres:5432/nexus_portal
KNOWLEDGE_DATABASE_URL=postgresql://nexus:CHANGE_ME@postgres:5432/nexus_knowledge
INCENTIVE_DATABASE_URL=postgresql://nexus:CHANGE_ME@postgres:5432/nexus_incentive

# ─── External Integrations ───────────────────────────────────────────────────
GOOGLE_CLIENT_ID=CHANGE_ME
GOOGLE_CLIENT_SECRET=CHANGE_ME
MICROSOFT_CLIENT_ID=CHANGE_ME
MICROSOFT_CLIENT_SECRET=CHANGE_ME

STRIPE_SECRET_KEY=sk_live_CHANGE_ME
STRIPE_WEBHOOK_SECRET=whsec_CHANGE_ME

SENDGRID_API_KEY=SG.CHANGE_ME
TWILIO_ACCOUNT_SID=CHANGE_ME
TWILIO_AUTH_TOKEN=CHANGE_ME
TWILIO_FROM_NUMBER=+1XXXXXXXXXX

OPENAI_API_KEY=sk-CHANGE_ME

# ─── Observability ───────────────────────────────────────────────────────────
SENTRY_DSN=https://CHANGE_ME@sentry.io/CHANGE_ME
GRAFANA_USER=admin
GRAFANA_PASSWORD=CHANGE_ME

# ─── App ─────────────────────────────────────────────────────────────────────
NEXTAUTH_SECRET=CHANGE_ME_64_CHAR_MINIMUM
NEXTAUTH_URL=https://app.yourdomain.com
NEXT_PUBLIC_APP_URL=https://app.yourdomain.com
NEXT_PUBLIC_SENTRY_DSN=https://CHANGE_ME@sentry.io/CHANGE_ME

# ─── Deployment ──────────────────────────────────────────────────────────────
DEPLOY_HOST=your-server-ip
DEPLOY_USER=deploy
SSH_KEY_PATH=~/.ssh/nexus_deploy
```

---

## Verification Checklist

- [ ] `docker-compose.yml` has `prometheus` and `grafana` services
- [ ] `docker-compose.yml` `volumes:` block has `prometheus_data` and `grafana_data`
- [ ] `infrastructure/prometheus/prometheus.yml` exists with 24 scrape targets
- [ ] `infrastructure/grafana/provisioning/datasources/prometheus.yml` exists
- [ ] `infrastructure/grafana/provisioning/dashboards/dashboard.yml` exists
- [ ] `apps/web/sentry.client.config.ts` and `sentry.server.config.ts` exist
- [ ] `apps/web/next.config.ts` wraps with `withSentryConfig`
- [ ] `packages/service-utils/src/errors.ts` captures 5xx errors via Sentry
- [ ] `scripts/.env.prod.example` exists with all 20 DATABASE_URLs
- [ ] `pnpm --filter web add @sentry/nextjs` completed
- [ ] `pnpm --filter @nexus/service-utils add @sentry/node` completed
