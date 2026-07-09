# Nexus CRM Developer Portal

## Quick Start

```bash
# Clone the repo
git clone https://github.com/nexus-crm/nexus-crm.git
cd nexus-crm

# Install dependencies
pnpm install

# Start local development
pnpm dev
```

## Architecture

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────┐
│   Web App   │────▶│ GraphQL Gateway │────▶│  Services   │
│  (Next.js)  │     │   (Federation)  │     │  (Fastify)  │
└─────────────┘     └─────────────────┘     └─────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
    ┌─────────┐       ┌──────────┐       ┌──────────┐
    │ Postgres│       │  Redis   │       │  Kafka   │
    │   (RLS) │       │  (Cache) │       │ (Events) │
    └─────────┘       └──────────┘       └──────────┘
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| auth-service | 3000 | Authentication & authorization |
| crm-service | 3001 | Core CRM (contacts, deals) |
| contacts-service | 3003 | Contact management |
| deals-service | 3002 | Deal pipeline |
| analytics-service | 3005 | Analytics & reporting |
| realtime-service | 3006 | WebSocket events |

## API Documentation

- **GraphQL Playground**: http://localhost:4000/graphql
- **OpenAPI Docs**: Each service exposes `/docs`

## Testing

```bash
# Unit tests
pnpm test

# Integration tests
pnpm test:integration

# E2E tests
cd apps/web && npx playwright test
```

## Deployment

```bash
# Deploy to staging
./scripts/helm-deploy.sh staging

# Deploy to production
./scripts/helm-deploy.sh production
```

## Monitoring

- **Grafana**: https://grafana.nexus-crm.io
- **Jaeger**: https://jaeger.nexus-crm.io
- **Alertmanager**: https://alerts.nexus-crm.io

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md)
