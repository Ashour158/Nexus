# NEXUS CRM

NEXUS CRM is a microservices-first sales platform built as a pnpm monorepo with a Next.js frontend and TypeScript Fastify backend services. It includes CRM core flows, quoting/billing, cadences, approvals, analytics, reporting, portal, and operational tooling for production readiness.

## Architecture Overview

`
[ Browser ]
    |
 [ Nginx Gateway ]
    |
 [ Next.js Web ] -----> [ Auth Service ]
    |
    +--> [ CRM ] [ Finance ] [ Billing ] [ Workflow ] [ Reporting ]
    +--> [ Cadence ] [ Approval ] [ Knowledge ] [ Portal ] [ Document ]
    +--> [ Integration ] [ Storage ] [ Notification ] [ Realtime ]
                 |
      [ Postgres / Redis / Kafka / MinIO / Meilisearch ]
                 |
          [ Prometheus + Grafana ]
`

## Prerequisites

- Node.js 20+
- pnpm 9+
- Docker + Docker Compose
- 8 GB RAM minimum for full local stack

## Quick Start (Development)

`ash
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
`

## Architecture (Services)

| Service | Port | Responsibility |
|---|---:|---|
| web | 3000 | Next.js frontend |
| auth-service | 3010 | Auth, identity, token workflows |
| crm-service | 3001 | Accounts, contacts, deals, activities |
| finance-service | 3002 | Quotes, pricing, product catalog |
| notification-service | 3003 | Notification fanout |
| realtime-service | 3005 | Socket transport |
| search-service | 3006 | Search indexing/query |
| workflow-service | 3007 | Automations/executions |
| analytics-service | 3008 | KPI and forecast analytics |
| comm-service | 3009 | Outbound/inbound comm channels |
| storage-service | 3010 | Object upload/download |
| billing-service | 3011 | Plans, invoices, subscriptions |
| integration-service | 3012 | OAuth/sync/calendar integrations |
| blueprint-service | 3013 | Validation/playbooks |
| approval-service | 3014 | Discount/policy approvals |
| data-service | 3015 | Data import/export services |
| document-service | 3016 | PDF/document generation |
| chatbot-service | 3017 | Messaging bot automation |
| cadence-service | 3018 | Sequencing/enrollment |
| territory-service | 3019 | Territory planning |
| planning-service | 3020 | Capacity/planning tools |
| reporting-service | 3021 | Report templates, schedules, exports |
| portal-service | 3022 | External customer portal |
| knowledge-service | 3023 | Knowledge base |
| incentive-service | 3024 | Incentives/comp plans |

## Environment Variables

- Frontend: pps/web/.env.example
- Backend: services/*/.env.example (one file per service)

## Running in Production

`ash
make certs
make prod
`

Pre-flight checklist:
- .env files populated for target environment
- DB migrations applied (make db-migrate)
- TLS certs replaced with managed certificates
- Monitoring stack reachable

## Testing

`ash
make test
`

Smoke tests live with services and run in CI.

## Monitoring

- Prometheus: http://localhost:9090
- Grafana: http://localhost:3200 (admin / nexus-grafana)

## Contributing

- Branch naming: eature/*, ix/*, chore/*
- Commit style: imperative (eat: add ..., ix: ...)
- PR checklist:
  - Tests pass
  - Lint/typecheck pass
  - Migrations included if schema changed
  - .env.example updated for new env vars
