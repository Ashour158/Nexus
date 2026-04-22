# NEXUS CRM — Complete Technical Specification
### Version 4.0 | Expert-Panel Validated | April 2026
### Revenue Operating System — 100% Free, Self-Hosted, Enterprise-Grade

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Full Technology Stack](#2-full-technology-stack)
3. [Architecture Overview](#3-architecture-overview)
4. [Monorepo Structure](#4-monorepo-structure)
5. [Infrastructure Setup](#5-infrastructure-setup)
6. [Service Catalog](#6-service-catalog)
7. [Database Schema — All Entities](#7-database-schema--all-entities)
8. [Kafka Event Catalog](#8-kafka-event-catalog)
9. [API Design Standards](#9-api-design-standards)
10. [GraphQL Schema](#10-graphql-schema)
11. [Real-Time Layer (WebSocket / SSE)](#11-real-time-layer)
12. [Module Specifications](#12-module-specifications)
13. [AI & ML Infrastructure](#13-ai--ml-infrastructure)
14. [Security Architecture](#14-security-architecture)
15. [Compliance Framework](#15-compliance-framework)
16. [Integration Specifications](#16-integration-specifications)
17. [File Storage Strategy](#17-file-storage-strategy)
18. [Search Architecture](#18-search-architecture)
19. [Background Job Queue](#19-background-job-queue)
20. [Caching Strategy](#20-caching-strategy)
21. [Mobile Architecture](#21-mobile-architecture)
22. [Testing Strategy](#22-testing-strategy)
23. [Observability & SLOs](#23-observability--slos)
24. [Feature Flags](#24-feature-flags)
25. [Data Migration Tooling](#25-data-migration-tooling)
26. [Environment Variables](#26-environment-variables)
27. [Development Setup](#27-development-setup)
28. [CI/CD Pipeline](#28-cicd-pipeline)
29. [Deployment & Kubernetes](#29-deployment--kubernetes)
30. [Disaster Recovery & Backup](#30-disaster-recovery--backup)

---

## 1. System Overview

**NEXUS CRM** is an enterprise Revenue Operating System built as a microservices platform. It serves sales reps, sales managers, customer success teams, finance, marketing, and operations from a single unified platform — with zero licensing cost, full source access, and complete self-hosting.

### Core Principles
- **Event-Driven**: all cross-service communication via Apache Kafka
- **Domain-Driven Design**: each service owns its bounded context and data store
- **API-First**: every capability exposed via REST + GraphQL before any UI is built
- **AI-Native**: LLM and ML inference built in, not bolted on
- **Privacy-First**: data never leaves your infrastructure; GDPR/CCPA compliant by design
- **Observable**: every request, event, and job is traced, logged, and metered

### System Scope
| Capability Area | Modules |
|---|---|
| Core CRM | Leads, Contacts, Accounts, Deals, Activities, Pipeline |
| Revenue | CPQ, Quoting (RFQ→Order), Contracts, Subscriptions, Commission |
| Automation | Workflow Builder, Blueprint Engine 2.0, Sequences, Journey Orchestrator |
| Intelligence | AI Scoring, Conversation Intelligence, Revenue Forecasting, Churn Prediction |
| Communication | Email, VoIP, WhatsApp, Telegram, SMS, Live Chat, LinkedIn |
| Analytics | ClickHouse OLAP, Management Reports, Wallboard, Revenue Intelligence |
| Sales Management | Playbooks, MEDDIC Enforcement, Coaching, Contests, Onboarding |
| Customer Success | Health Scores, NPS, Account Plans, CLM, Mutual Success Plans |
| Marketing | Campaign Management, ABM, Attribution, Lead Scoring |
| Platform | Low-Code Builder, Integrations Hub, Partner Portal, Security |

---

## 2. Full Technology Stack

### Frontend
| Technology | Version | Purpose |
|---|---|---|
| Next.js | 14.x | Primary web app — SSR + CSR hybrid |
| TypeScript | 5.x | All frontend and backend code |
| React | 18.x | UI component library |
| TailwindCSS | 3.x | Utility-first styling |
| shadcn/ui | latest | Base component library |
| Zustand | 4.x | Client-side state management |
| React Query (TanStack) | 5.x | Server state, caching, and real-time sync |
| Apollo Client | 3.x | GraphQL client |
| Socket.io-client | 4.x | WebSocket real-time features |
| Recharts | 2.x | Dashboard charts |
| React Flow | 11.x | Workflow Builder and Blueprint canvas |
| React Hook Form | 7.x | Form management with Zod validation |
| Zod | 3.x | Schema validation (shared with backend) |
| i18next | 23.x | Internationalisation (12+ languages) |
| date-fns | 3.x | Date utilities |
| Playwright | 1.x | E2E browser testing |

### Backend — Services
| Technology | Version | Purpose |
|---|---|---|
| Node.js | 20 LTS | All backend microservices runtime |
| TypeScript | 5.x | All service code |
| Fastify | 4.x | HTTP framework (REST API per service) |
| Apollo Server | 4.x | GraphQL federation gateway |
| Mercurius | 13.x | GraphQL per service (Fastify plugin) |
| Socket.io | 4.x | WebSocket server (real-time service) |
| BullMQ | 5.x | Background job queue per service |
| Zod | 3.x | Request/response schema validation |
| Prisma | 5.x | ORM for PostgreSQL (type-safe queries) |
| ioredis | 5.x | Redis client |
| kafkajs | 2.x | Kafka producer/consumer |
| Winston | 3.x | Structured logging |
| OpenTelemetry SDK | 1.x | Distributed tracing |

### Data Layer
| Technology | Version | Purpose |
|---|---|---|
| PostgreSQL | 16.x | Primary transactional database (one per service) |
| Redis | 7.x | Cache, session store, BullMQ backend, pub/sub |
| ClickHouse | 24.x | OLAP analytics engine (reports, dashboards) |
| Apache Kafka | 3.7.x | Event bus — all cross-service events |
| Meilisearch | 1.x | Full-text search across all CRM entities |
| MinIO | latest | S3-compatible file/object storage |

### AI / ML
| Technology | Version | Purpose |
|---|---|---|
| Ollama | latest | Local LLM server (Llama 3.1, Mistral, Phi-3) |
| LangChain.js | 0.2.x | LLM orchestration, prompt chains, RAG |
| Python 3.11 | 3.11 | ML model training and inference service |
| scikit-learn | 1.4.x | Lead scoring, churn prediction, win probability |
| XGBoost | 2.x | Gradient boosting for predictive models |
| Whisper (OpenAI) | large-v3 | Self-hosted call transcription |
| PyAnnote | 3.x | Speaker diarisation for calls |
| FastAPI | 0.111.x | AI/ML service HTTP API (Python) |
| Celery | 5.x | Async ML task queue (Python) |

### Infrastructure & DevOps
| Technology | Version | Purpose |
|---|---|---|
| Kubernetes | 1.30.x | Container orchestration |
| Helm | 3.x | K8s package management |
| Docker | 26.x | Containerisation |
| Kong Community | 3.7.x | API Gateway — rate limiting, auth, routing |
| Keycloak | 24.x | Identity Provider — OAuth2, OIDC, SAML2 |
| Nginx Ingress | 1.10.x | K8s ingress controller |
| Cert-Manager | 1.14.x | Automated TLS certificate management |
| HashiCorp Vault | 1.17.x | Secrets management |
| Prometheus | 2.52.x | Metrics collection |
| Grafana | 10.x | Metrics dashboards and alerting |
| Loki | 3.x | Log aggregation |
| Tempo | 2.x | Distributed tracing |
| Unleash | 5.x | Feature flag management |
| Harbor | 2.x | Private container image registry |
| ArgoCD | 2.11.x | GitOps continuous delivery |
| GitHub Actions | — | CI pipeline |

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENTS                                  │
│  Next.js Web App │ React Native Mobile │ Partner Portal         │
└──────────────────┬──────────────────────────────────────────────┘
                   │ HTTPS / WSS
┌──────────────────▼──────────────────────────────────────────────┐
│                    KONG API GATEWAY                              │
│  Rate limiting │ JWT validation │ Routing │ Request logging      │
└──────────────────┬──────────────────────────────────────────────┘
                   │
        ┌──────────▼──────────┐
        │  GraphQL Federation  │  (Apollo Router)
        │  Gateway Service     │
        └──────────┬──────────┘
                   │ REST + GraphQL sub-graphs
    ┌──────────────┼──────────────────────────────┐
    │              │              │                │
┌───▼───┐    ┌────▼────┐   ┌────▼────┐    ┌─────▼────┐
│  CRM  │    │ Finance │   │  AI     │    │  Comms   │
│Service│    │ Service │   │ Service │    │  Service │
│:3001  │    │ :3002   │   │ :3003   │    │  :3004   │
└───┬───┘    └────┬────┘   └────┬────┘    └─────┬────┘
    │              │              │                │
    └──────────────┴──────────────┴────────────────┘
                          │
              ┌───────────▼───────────┐
              │    Apache Kafka        │
              │  (Event Bus)           │
              └───────────┬───────────┘
                          │
    ┌─────────────────────┼──────────────────────┐
    │                     │                      │
┌───▼────┐         ┌──────▼──────┐       ┌──────▼──────┐
│Workflow│         │  Analytics  │       │  Real-Time  │
│Engine  │         │  Service    │       │  Service    │
│:3005   │         │  :3006      │       │  :3007      │
└────────┘         └─────────────┘       └─────────────┘
```

### Multi-Tenancy Strategy
**Decision: Shared Schema + Row-Level Security (RLS)**

Each PostgreSQL database uses a `tenant_id` column on every table. Keycloak JWT tokens carry `tenant_id` as a claim. All Prisma queries are automatically scoped via middleware. PostgreSQL RLS policies enforce isolation at the database level as a second safety net.

Trade-off accepted: simpler ops vs. complete isolation. For regulated industries (healthcare, finance), a **Schema-per-Tenant** deployment option is documented as an override.

```sql
-- Applied to every table
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON deals
  USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

### CQRS + Event Sourcing (Critical Entities)
Applied to: `Deal`, `Quote`, `Subscription`, `Contract`, `CommissionPlan`

- **Command side**: writes go through command handlers that produce domain events
- **Event store**: events appended to a `domain_events` table (immutable, append-only)
- **Read side**: projections built from events into optimised read models
- **Replay**: full entity state can be reconstructed from event history at any point

---

## 4. Monorepo Structure

```
nexus-crm/
├── apps/
│   ├── web/                    # Next.js 14 web application
│   ├── mobile/                 # React Native mobile app
│   ├── partner-portal/         # Next.js partner portal
│   └── wallboard/              # Next.js TV wallboard (full-screen)
│
├── services/
│   ├── api-gateway/            # Kong configuration + custom plugins
│   ├── graphql-gateway/        # Apollo Federation router
│   ├── crm-service/            # Core CRM (leads, contacts, accounts, deals)
│   ├── finance-service/        # Quotes, CPQ, invoices, subscriptions, commission
│   ├── ai-service/             # ML models, LLM orchestration, scoring
│   ├── comms-service/          # Email, VoIP, WhatsApp, SMS, Telegram
│   ├── workflow-engine/        # Automation Studio, Blueprint, Sequences
│   ├── analytics-service/      # ClickHouse queries, reports, dashboards
│   ├── realtime-service/       # WebSocket server, SSE, live updates
│   ├── search-service/         # Meilisearch indexing and query
│   ├── storage-service/        # MinIO file management
│   ├── auth-service/           # Keycloak wrapper + RBAC enforcement
│   ├── notification-service/   # In-app, email, push, Slack notifications
│   ├── integration-service/    # No-code connector engine + integration runners
│   └── ml-service/             # Python FastAPI: model training + inference
│
├── packages/
│   ├── shared-types/           # TypeScript types shared across services
│   ├── shared-schemas/         # Zod schemas shared across services
│   ├── kafka-client/           # Shared Kafka producer/consumer factory
│   ├── prisma-client/          # Generated Prisma clients per service
│   ├── ui-components/          # Shared React component library
│   ├── utils/                  # Shared utility functions
│   └── config/                 # Shared configuration loaders
│
├── infrastructure/
│   ├── helm/                   # Helm charts for all services
│   ├── k8s/                    # Raw Kubernetes manifests
│   ├── terraform/              # Infrastructure as Code
│   ├── vault/                  # HashiCorp Vault policies
│   └── scripts/                # Migration, backup, seed scripts
│
├── docs/
│   ├── architecture/           # ADRs (Architecture Decision Records)
│   ├── api/                    # OpenAPI specs per service
│   ├── runbooks/               # Operational runbooks
│   └── compliance/             # GDPR/SOC2 documentation
│
├── tests/
│   ├── e2e/                    # Playwright E2E tests
│   ├── load/                   # K6 load test scripts
│   └── contracts/              # Pact contract tests
│
├── .github/
│   └── workflows/              # GitHub Actions CI/CD
│
├── docker-compose.yml          # Local development environment
├── docker-compose.test.yml     # Test environment
├── turbo.json                  # Turborepo build orchestration
├── pnpm-workspace.yaml         # pnpm monorepo config
└── package.json
```

---

## 5. Infrastructure Setup

### Local Development (Docker Compose)
```bash
# Prerequisites: Docker Desktop, Node.js 20, pnpm 9

git clone https://github.com/your-org/nexus-crm
cd nexus-crm
pnpm install

# Start all infrastructure services
docker compose up -d

# Run database migrations for all services
pnpm run migrate:all

# Seed development data
pnpm run seed:all

# Start all services in development mode (hot reload)
pnpm run dev
```

### docker-compose.yml (infrastructure services)
```yaml
version: '3.9'
services:
  postgres-crm:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: nexus_crm
      POSTGRES_USER: nexus
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    ports: ["5432:5432"]
    volumes: [postgres_crm_data:/var/lib/postgresql/data]

  postgres-finance:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: nexus_finance
      POSTGRES_USER: nexus
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    ports: ["5433:5432"]

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}
    ports: ["6379:6379"]

  kafka:
    image: confluentinc/cp-kafka:7.6.1
    environment:
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_NODE_ID: 1
      KAFKA_LISTENERS: PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@localhost:9093
      KAFKA_LOG_DIRS: /var/lib/kafka/data
    ports: ["9092:9092"]
    volumes: [kafka_data:/var/lib/kafka/data]

  clickhouse:
    image: clickhouse/clickhouse-server:24-alpine
    ports: ["8123:8123", "9000:9000"]
    volumes: [clickhouse_data:/var/lib/clickhouse]

  meilisearch:
    image: getmeili/meilisearch:v1.8
    environment:
      MEILI_MASTER_KEY: ${MEILI_MASTER_KEY}
    ports: ["7700:7700"]

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_PASSWORD}
    ports: ["9000:9000", "9001:9001"]
    volumes: [minio_data:/data]

  keycloak:
    image: quay.io/keycloak/keycloak:24.0
    command: start-dev --import-realm
    environment:
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: ${KEYCLOAK_ADMIN_PASSWORD}
    ports: ["8080:8080"]
    volumes: [./infrastructure/keycloak:/opt/keycloak/data/import]

  ollama:
    image: ollama/ollama:latest
    ports: ["11434:11434"]
    volumes: [ollama_data:/root/.ollama]
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]

  vault:
    image: hashicorp/vault:1.17
    cap_add: [IPC_LOCK]
    environment:
      VAULT_DEV_ROOT_TOKEN_ID: ${VAULT_DEV_TOKEN}
    ports: ["8200:8200"]

  unleash:
    image: unleashorg/unleash-server:6
    environment:
      DATABASE_URL: postgresql://nexus:${POSTGRES_PASSWORD}@postgres-crm:5432/unleash
    ports: ["4242:4242"]

  prometheus:
    image: prom/prometheus:v2.52.0
    ports: ["9090:9090"]
    volumes: [./infrastructure/prometheus:/etc/prometheus]

  grafana:
    image: grafana/grafana:10.4.0
    ports: ["3000:3000"]
    volumes: [grafana_data:/var/lib/grafana]
```

---

## 6. Service Catalog

| Service | Port | DB | Kafka Topics Owned | Key Responsibilities |
|---|---|---|---|---|
| `crm-service` | 3001 | `nexus_crm` (PG) | `crm.*` | Leads, Contacts, Accounts, Deals, Activities, Pipeline, Territories, Segments |
| `finance-service` | 3002 | `nexus_finance` (PG) | `finance.*` | Quotes, CPQ, Orders, Invoices, Subscriptions, MRR, Commission, Contracts |
| `ai-service` | 3003 | `nexus_ai` (PG) | `ai.*` | Scoring, forecasting, conversation intelligence, co-pilot, recommendations |
| `comms-service` | 3004 | `nexus_comms` (PG) | `comms.*` | Email, VoIP/dialler, WhatsApp, Telegram, SMS, website chat, sequences |
| `workflow-engine` | 3005 | `nexus_workflow` (PG) | `workflow.*` | Workflow Builder, Blueprint Engine, Sequence execution, Journey Orchestrator |
| `analytics-service` | 3006 | ClickHouse | `analytics.*` | OLAP queries, pre-built reports, dashboards, revenue intelligence |
| `realtime-service` | 3007 | Redis only | consumer: all | WebSocket server, SSE, live leaderboard, wallboard, deal-won events |
| `search-service` | 3008 | Meilisearch | consumer: `crm.*` | Full-text search indexing and query across all CRM entities |
| `storage-service` | 3009 | `nexus_storage` (PG) | `storage.*` | File upload/download, MinIO management, CDN URLs, file metadata |
| `auth-service` | 3010 | Keycloak DB | — | RBAC enforcement, token validation, user provisioning, SCIM |
| `notification-service` | 3011 | `nexus_notify` (PG) | consumer: all | In-app bell, push, email digests, Slack/Teams notifications |
| `integration-service` | 3012 | `nexus_integrations` (PG) | `integration.*` | No-code connector engine, OAuth token management, webhook routing |
| `ml-service` | 8000 | `nexus_ml` (PG) | `ml.*` | Python FastAPI: XGBoost, Whisper, PyAnnote, model training (Celery) |
| `partner-service` | 3013 | `nexus_partners` (PG) | `partner.*` | Partner portal, deal registration, partner performance, MDF requests |
| `compliance-service` | 3014 | `nexus_compliance` (PG) | consumer: all | Audit log, GDPR right-to-erasure, data retention, consent tracking |

---

## 7. Database Schema — All Entities

### 7.1 CRM Service (`nexus_crm`)

```sql
-- Tenants
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  plan TEXT DEFAULT 'standard',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  keycloak_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  role TEXT NOT NULL, -- 'admin','manager','ae','sdr','cs','finance','readonly'
  team_id UUID,
  territory_id UUID,
  quota_amount NUMERIC(15,2),
  manager_id UUID REFERENCES users(id),
  onboarding_stage TEXT DEFAULT 'new',
  sales_readiness_score NUMERIC(5,2),
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Leads
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  company TEXT,
  title TEXT,
  source TEXT,
  campaign_id UUID,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  lead_score INTEGER DEFAULT 0,
  ai_score INTEGER,
  ai_score_factors JSONB,
  status TEXT DEFAULT 'new', -- new, contacted, mql, sql, converted, dead
  assigned_to UUID REFERENCES users(id),
  enrichment_data JSONB DEFAULT '{}',
  methodology_score JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  converted_at TIMESTAMPTZ,
  converted_to_contact_id UUID,
  converted_to_deal_id UUID
);

-- Contacts
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT,
  email TEXT[],
  phone TEXT[],
  title TEXT,
  department TEXT,
  account_id UUID REFERENCES accounts(id),
  owner_id UUID REFERENCES users(id),
  lifecycle_stage TEXT DEFAULT 'lead',
  health_score INTEGER,
  rfm_tier TEXT,
  engagement_score INTEGER,
  tags TEXT[],
  enrichment_data JSONB DEFAULT '{}',
  linkedin_url TEXT,
  gdpr_consent JSONB DEFAULT '{}',
  communication_preferences JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Accounts
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  domain TEXT,
  industry TEXT,
  employee_count INTEGER,
  annual_revenue NUMERIC(15,2),
  arr NUMERIC(15,2) DEFAULT 0,
  health_score INTEGER DEFAULT 50,
  churn_risk_score NUMERIC(5,2),
  rfm_tier TEXT,
  tier TEXT DEFAULT 'standard', -- standard, silver, gold, platinum
  owner_id UUID REFERENCES users(id),
  parent_account_id UUID REFERENCES accounts(id),
  subscription_status TEXT DEFAULT 'prospect',
  enrichment_data JSONB DEFAULT '{}',
  abm_tier INTEGER, -- 1=tier1, 2=tier2, 3=tier3
  intent_score INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Deals
CREATE TABLE deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  account_id UUID REFERENCES accounts(id),
  owner_id UUID REFERENCES users(id),
  pipeline_id UUID REFERENCES pipelines(id),
  stage_id UUID REFERENCES pipeline_stages(id),
  amount NUMERIC(15,2),
  currency TEXT DEFAULT 'USD',
  close_date DATE,
  ai_close_date DATE,
  probability INTEGER,
  forecast_category TEXT, -- commit, best_case, pipeline, omitted
  health_score INTEGER,
  deal_type TEXT DEFAULT 'new_business', -- new_business, renewal, expansion, upsell
  competitors TEXT[],
  meddic_score JSONB DEFAULT '{}',
  methodology_scores JSONB DEFAULT '{}',
  deal_room_id UUID,
  blueprint_state_id UUID,
  tags TEXT[],
  win_reason TEXT,
  loss_reason TEXT,
  loss_competitor TEXT,
  post_mortem JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

-- Pipelines
CREATE TABLE pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  team_id UUID,
  is_default BOOLEAN DEFAULT false,
  probability_map JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pipeline Stages
CREATE TABLE pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  pipeline_id UUID REFERENCES pipelines(id),
  name TEXT NOT NULL,
  probability INTEGER DEFAULT 0,
  rotting_days INTEGER DEFAULT 14,
  required_fields TEXT[],
  position INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activities (calls, emails, meetings, tasks, notes)
CREATE TABLE activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  type TEXT NOT NULL, -- call, email, meeting, task, note, visit
  subject TEXT,
  body TEXT,
  outcome TEXT,
  duration_seconds INTEGER,
  contact_id UUID REFERENCES contacts(id),
  deal_id UUID REFERENCES deals(id),
  account_id UUID REFERENCES accounts(id),
  owner_id UUID REFERENCES users(id),
  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  recording_url TEXT,
  transcript_text TEXT,
  transcript_data JSONB, -- speaker segments, timestamps
  sentiment_data JSONB,
  ai_summary TEXT,
  action_items JSONB,
  coaching_flags JSONB,
  talk_ratio NUMERIC(5,2),
  call_disposition TEXT,
  gps_lat NUMERIC(10,7), -- for field check-in
  gps_lng NUMERIC(10,7),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Blueprints
CREATE TABLE blueprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  module TEXT NOT NULL, -- deal, lead, contact
  is_published BOOLEAN DEFAULT false,
  version INTEGER DEFAULT 1,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE blueprint_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_id UUID REFERENCES blueprints(id),
  name TEXT NOT NULL,
  color TEXT,
  sla_hours INTEGER,
  checklist_items JSONB DEFAULT '[]',
  entry_actions JSONB DEFAULT '[]',
  visible_fields TEXT[],
  is_initial BOOLEAN DEFAULT false,
  is_terminal BOOLEAN DEFAULT false,
  position_x INTEGER,
  position_y INTEGER
);

CREATE TABLE blueprint_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_id UUID REFERENCES blueprints(id),
  from_state_id UUID REFERENCES blueprint_states(id),
  to_state_id UUID REFERENCES blueprint_states(id),
  name TEXT,
  conditions JSONB DEFAULT '[]',
  required_fields JSONB DEFAULT '[]',
  allowed_roles TEXT[],
  after_actions JSONB DEFAULT '[]',
  trigger_type TEXT DEFAULT 'manual', -- manual, auto, scheduled
  confirmation_message TEXT
);

-- Sequences
CREATE TABLE sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  enrolment_criteria JSONB,
  stop_conditions JSONB,
  goal TEXT,
  stats JSONB DEFAULT '{}',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sequence_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID REFERENCES sequences(id),
  type TEXT NOT NULL, -- email, call, task, sms, whatsapp, linkedin, wait
  position INTEGER,
  delay_hours INTEGER DEFAULT 0,
  template_id UUID,
  condition JSONB,
  ab_variant TEXT,
  stats JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sequence_enrolments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID REFERENCES sequences(id),
  contact_id UUID REFERENCES contacts(id),
  current_step INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active', -- active, paused, completed, stopped
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  goal_met_at TIMESTAMPTZ
);

-- Territories
CREATE TABLE territories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES territories(id),
  quota_amount NUMERIC(15,2),
  rules JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Segments (dynamic)
CREATE TABLE segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  module TEXT NOT NULL, -- contact, account, deal, lead
  criteria JSONB NOT NULL,
  member_count INTEGER DEFAULT 0,
  last_refreshed_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Deal Rooms
CREATE TABLE deal_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID REFERENCES deals(id),
  access_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  shared_with_external JSONB DEFAULT '[]',
  sections JSONB DEFAULT '[]',
  mutual_action_plan JSONB DEFAULT '[]',
  engagement_score INTEGER DEFAULT 0,
  last_external_view TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Account Plans
CREATE TABLE account_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id),
  tenant_id UUID NOT NULL,
  owner_id UUID REFERENCES users(id),
  strategic_tier TEXT,
  revenue_target NUMERIC(15,2),
  whitespace_data JSONB DEFAULT '{}',
  stakeholder_map JSONB DEFAULT '[]',
  strategic_goals JSONB DEFAULT '[]',
  competitive_threats JSONB DEFAULT '[]',
  action_plan JSONB DEFAULT '[]',
  mutual_success_plan JSONB DEFAULT '{}',
  last_qbr_date DATE,
  next_qbr_date DATE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit Log (immutable)
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID,
  action TEXT NOT NULL, -- create, update, delete, view, export, login
  entity_type TEXT NOT NULL,
  entity_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Audit log is append-only — no UPDATE or DELETE allowed via RLS
```

### 7.2 Finance Service (`nexus_finance`)

```sql
-- Quotes
CREATE TABLE quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  deal_id UUID NOT NULL,
  account_id UUID NOT NULL,
  version INTEGER DEFAULT 1,
  status TEXT DEFAULT 'draft', -- draft, pending_approval, approved, sent, accepted, rejected, expired
  line_items JSONB NOT NULL DEFAULT '[]',
  subtotal NUMERIC(15,2),
  discount_percent NUMERIC(5,2) DEFAULT 0,
  discount_amount NUMERIC(15,2) DEFAULT 0,
  tax_amount NUMERIC(15,2) DEFAULT 0,
  total NUMERIC(15,2),
  currency TEXT DEFAULT 'USD',
  exchange_rate NUMERIC(10,6) DEFAULT 1,
  valid_until DATE,
  payment_terms TEXT DEFAULT 'net30',
  esignature_url TEXT,
  signed_at TIMESTAMPTZ,
  pdf_url TEXT,
  notes TEXT,
  template_id UUID,
  rfq_id UUID,
  created_by UUID,
  approved_by UUID,
  approval_chain JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RFQ (Request for Quotation)
CREATE TABLE rfqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  contact_id UUID,
  account_id UUID,
  source TEXT, -- email, web, whatsapp, telegram, manual
  raw_content TEXT,
  parsed_items JSONB DEFAULT '[]',
  status TEXT DEFAULT 'pending', -- pending, reviewed, quoted, closed
  assigned_to UUID,
  ai_parsed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- CPQ Rules
CREATE TABLE cpq_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- list_price, tier_pricing, volume_discount, bundle, promo, floor, competitive, payment_terms
  conditions JSONB DEFAULT '[]',
  actions JSONB DEFAULT '[]',
  priority INTEGER DEFAULT 50,
  is_active BOOLEAN DEFAULT true,
  valid_from DATE,
  valid_until DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Products
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  sku TEXT,
  description TEXT,
  price_tiers JSONB DEFAULT '[]',
  base_price NUMERIC(15,2),
  currency TEXT DEFAULT 'USD',
  tax_class TEXT DEFAULT 'standard',
  is_recurring BOOLEAN DEFAULT false,
  billing_period TEXT, -- monthly, quarterly, annual
  unit TEXT DEFAULT 'seat',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subscriptions
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  account_id UUID NOT NULL,
  quote_id UUID,
  plan TEXT NOT NULL,
  status TEXT DEFAULT 'active', -- active, trial, paused, cancelled, expired
  mrr NUMERIC(15,2),
  arr NUMERIC(15,2),
  currency TEXT DEFAULT 'USD',
  billing_period TEXT DEFAULT 'monthly',
  start_date DATE,
  end_date DATE,
  renewal_date DATE,
  trial_end_date DATE,
  cancel_at_period_end BOOLEAN DEFAULT false,
  cancellation_reason TEXT,
  churn_reason TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Commission Plans
CREATE TABLE commission_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  user_id UUID,
  team_id UUID,
  components JSONB NOT NULL, -- base rate, accelerators, decelerators, SPIFFs, multipliers
  payment_schedule TEXT DEFAULT 'on_invoice',
  clawback_days INTEGER DEFAULT 90,
  effective_from DATE,
  effective_to DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Commission Transactions
CREATE TABLE commission_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  deal_id UUID,
  quote_id UUID,
  plan_id UUID REFERENCES commission_plans(id),
  type TEXT NOT NULL, -- earned, clawback, spiff, accelerator
  amount NUMERIC(15,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  period_start DATE,
  period_end DATE,
  status TEXT DEFAULT 'pending', -- pending, approved, paid, clawed_back
  calculation_detail JSONB,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contracts (CLM)
CREATE TABLE contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  deal_id UUID,
  account_id UUID NOT NULL,
  quote_id UUID,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'subscription', -- subscription, services, nda, amendment
  status TEXT DEFAULT 'draft', -- draft, legal_review, approved, signed, active, amended, expired, terminated
  version INTEGER DEFAULT 1,
  parent_contract_id UUID REFERENCES contracts(id),
  document_url TEXT,
  signed_document_url TEXT,
  effective_date DATE,
  expiry_date DATE,
  auto_renews BOOLEAN DEFAULT false,
  renewal_notice_days INTEGER DEFAULT 90,
  payment_terms TEXT,
  sla_terms JSONB DEFAULT '{}',
  obligations JSONB DEFAULT '[]',
  esignature_provider TEXT,
  esignature_envelope_id TEXT,
  signed_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Revenue Recognition Schedules
CREATE TABLE rev_rec_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  deal_id UUID,
  contract_id UUID REFERENCES contracts(id),
  total_amount NUMERIC(15,2),
  recognition_method TEXT, -- straight_line, milestone, point_in_time
  performance_obligations JSONB DEFAULT '[]',
  schedule_entries JSONB DEFAULT '[]', -- [{date, amount, status}]
  accounting_standard TEXT DEFAULT 'ASC606',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sales Contests
CREATE TABLE contests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- individual, team, threshold, poker_chip
  metric TEXT NOT NULL, -- calls_made, demos_booked, deals_closed, arr_closed
  target_value NUMERIC(15,2),
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  prize_description TEXT,
  prize_value NUMERIC(15,2),
  eligible_user_ids UUID[],
  eligible_team_ids UUID[],
  status TEXT DEFAULT 'upcoming', -- upcoming, active, ended
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 8. Kafka Event Catalog

All events follow the envelope schema:
```typescript
interface KafkaEvent<T> {
  id: string;              // UUID v4
  tenantId: string;
  timestamp: string;       // ISO 8601
  version: string;         // '1.0'
  source: string;          // service name
  type: string;            // event type (below)
  correlationId?: string;  // for tracing chains
  payload: T;
}
```

### CRM Events (`crm.*`)
| Topic | Event Type | Produced By | Consumers |
|---|---|---|---|
| `crm.leads` | `lead.created` | crm-service | ai-service, comms-service, analytics |
| `crm.leads` | `lead.score_updated` | ai-service | crm-service, workflow-engine |
| `crm.leads` | `lead.converted` | crm-service | analytics, notification |
| `crm.deals` | `deal.created` | crm-service | workflow-engine, analytics, ai-service |
| `crm.deals` | `deal.stage_changed` | crm-service | workflow-engine, analytics, realtime |
| `crm.deals` | `deal.won` | crm-service | finance-service, analytics, realtime, notification |
| `crm.deals` | `deal.lost` | crm-service | analytics, workflow-engine, notification |
| `crm.deals` | `deal.health_updated` | ai-service | crm-service, realtime, notification |
| `crm.activities` | `activity.logged` | crm-service, comms-service | ai-service, analytics, search |
| `crm.activities` | `call.completed` | comms-service | ai-service (transcription) |
| `crm.contacts` | `contact.created` | crm-service | ai-service, search, analytics |
| `crm.accounts` | `account.health_changed` | ai-service | crm-service, notification, analytics |
| `crm.blueprints` | `blueprint.transition` | workflow-engine | crm-service, analytics, notification |

### Finance Events (`finance.*`)
| Topic | Event Type | Produced By | Consumers |
|---|---|---|---|
| `finance.quotes` | `quote.created` | finance-service | workflow-engine, notification |
| `finance.quotes` | `quote.approved` | finance-service | comms-service, workflow-engine |
| `finance.quotes` | `quote.signed` | finance-service | crm-service, analytics, realtime |
| `finance.quotes` | `quote.expired` | finance-service | workflow-engine, notification |
| `finance.subscriptions` | `subscription.created` | finance-service | analytics, crm-service |
| `finance.subscriptions` | `subscription.mrr_changed` | finance-service | analytics, realtime |
| `finance.subscriptions` | `subscription.churned` | finance-service | crm-service, analytics, notification |
| `finance.commission` | `commission.earned` | finance-service | notification, realtime |
| `finance.contracts` | `contract.signed` | finance-service | crm-service, notification, analytics |
| `finance.contracts` | `contract.expiring` | finance-service | notification, workflow-engine |

### AI Events (`ai.*`)
| Topic | Event Type | Produced By | Consumers |
|---|---|---|---|
| `ai.scoring` | `lead_score.updated` | ml-service | crm-service, workflow-engine |
| `ai.scoring` | `deal_health.updated` | ai-service | crm-service, realtime |
| `ai.scoring` | `churn_risk.updated` | ml-service | crm-service, notification |
| `ai.transcription` | `call.transcribed` | ml-service | crm-service (save), analytics |
| `ai.transcription` | `objection.detected` | ml-service | crm-service, realtime (coaching) |
| `ai.forecasting` | `forecast.updated` | ml-service | analytics, realtime |

### Communications Events (`comms.*`)
| Topic | Event Type | Produced By | Consumers |
|---|---|---|---|
| `comms.email` | `email.sent` | comms-service | analytics, crm-service |
| `comms.email` | `email.opened` | comms-service | crm-service, workflow-engine |
| `comms.email` | `email.replied` | comms-service | workflow-engine, crm-service |
| `comms.whatsapp` | `message.received` | comms-service | crm-service, workflow-engine |
| `comms.whatsapp` | `message.sent` | comms-service | analytics, crm-service |
| `comms.calls` | `call.started` | comms-service | crm-service, realtime |
| `comms.calls` | `call.ended` | comms-service | ai-service (transcribe), crm-service |

---

## 9. API Design Standards

### REST API Conventions
```
Base URL: /api/v1/{service}

CRUD:
  GET    /api/v1/crm/deals              # List with pagination + filters
  GET    /api/v1/crm/deals/:id          # Single record
  POST   /api/v1/crm/deals              # Create
  PATCH  /api/v1/crm/deals/:id          # Partial update
  DELETE /api/v1/crm/deals/:id          # Soft delete (sets deleted_at)

Pagination (cursor-based):
  ?limit=50&cursor=<encoded_cursor>&sort=created_at:desc

Filtering:
  ?filter[stage_id]=uuid&filter[amount_gte]=10000&filter[assigned_to]=me

Response envelope:
{
  "data": {...} | [...],
  "meta": { "total": 1234, "cursor": "...", "hasMore": true },
  "errors": []   // only on 4xx/5xx
}

Authentication:
  Authorization: Bearer <keycloak_jwt>
  X-Tenant-ID: <tenant_uuid>   // extracted from JWT but can be explicit

Rate limiting headers:
  X-RateLimit-Limit: 1000
  X-RateLimit-Remaining: 987
  X-RateLimit-Reset: 1714000000
```

### Error Response Format
```json
{
  "errors": [{
    "code": "VALIDATION_ERROR",
    "message": "amount must be a positive number",
    "field": "amount",
    "traceId": "4bf92f3577b34da6a3ce929d0e0e4736"
  }]
}
```

### Standard HTTP Status Codes
| Code | Use |
|---|---|
| 200 | Success (GET, PATCH) |
| 201 | Created (POST) |
| 204 | No Content (DELETE) |
| 400 | Validation error |
| 401 | Not authenticated |
| 403 | Authorised but forbidden (RBAC) |
| 404 | Not found |
| 409 | Conflict (duplicate) |
| 422 | Unprocessable entity |
| 429 | Rate limited |
| 500 | Internal server error |

---

## 10. GraphQL Schema

### Federation Gateway Sub-graphs
Each service exposes a GraphQL sub-graph. The Apollo Router federates them.

```graphql
# crm-service schema (partial)
type Deal @key(fields: "id") {
  id: ID!
  tenantId: ID!
  name: String!
  amount: Float
  closeDate: Date
  aiCloseDate: Date
  probability: Int
  healthScore: Int
  forecastCategory: ForecastCategory
  stage: PipelineStage!
  pipeline: Pipeline!
  account: Account!
  owner: User!
  contacts: [Contact!]!
  activities: [Activity!]!
  dealRoom: DealRoom
  methodologyScore: MethodologyScore
  meddic: MEDDICScore
  competitors: [String!]
  tags: [String!]
  createdAt: DateTime!
  updatedAt: DateTime!
}

type Query {
  deal(id: ID!): Deal
  deals(filter: DealFilter, pagination: PaginationInput): DealConnection!
  pipeline(id: ID!): Pipeline
  pipelineDeals(pipelineId: ID!, filter: DealFilter): [Deal!]!
  myDeals(filter: DealFilter): [Deal!]!
  dealsAtRisk: [Deal!]!
}

type Mutation {
  createDeal(input: CreateDealInput!): Deal!
  updateDeal(id: ID!, input: UpdateDealInput!): Deal!
  moveDealStage(id: ID!, stageId: ID!): Deal!
  closeDeal(id: ID!, outcome: DealOutcome!, input: CloseDealInput!): Deal!
}

type Subscription {
  dealUpdated(pipelineId: ID!): Deal!     # WebSocket
  dealWon(teamId: ID!): DealWonEvent!     # For wallboard
}
```

---

## 11. Real-Time Layer

### Architecture
```
Kafka consumers → realtime-service → Socket.io rooms → Web clients
```

### Room Strategy
```typescript
// Rooms are structured as:
`tenant:${tenantId}`           // all events for tenant
`pipeline:${pipelineId}`       // pipeline kanban updates
`team:${teamId}`               // team wallboard
`user:${userId}`               // personal notifications
`deal:${dealId}`               // deal room collaboration
`contest:${contestId}`         // live contest leaderboard
```

### Events emitted to clients
| Socket Event | Payload | Used By |
|---|---|---|
| `deal:stage_changed` | `{dealId, fromStage, toStage, deal}` | Kanban board |
| `deal:won` | `{dealId, name, amount, repName}` | Wallboard celebration |
| `deal:health_updated` | `{dealId, healthScore, riskFlags}` | Pipeline view |
| `activity:logged` | `{activityId, type, contactId}` | Contact timeline |
| `quota:updated` | `{userId, attainment, target}` | Wallboard progress bar |
| `call:coaching_flag` | `{flag, suggestion}` | Live call coaching |
| `forecast:updated` | `{period, amount, aiAmount}` | Forecast view |
| `contest:score_changed` | `{contestId, userId, score, rank}` | Contest leaderboard |
| `notification:new` | `{id, type, message, link}` | Notification bell |
| `objection:detected` | `{keyword, suggestedResponse}` | In-call coaching panel |

---

## 12. Module Specifications

### 12.1 Lead Scoring Model (XGBoost)
```python
# ml-service/models/lead_scoring.py
FEATURE_COLUMNS = [
    'job_title_seniority',     # 0-4 (IC, Manager, Director, VP, C-Suite)
    'company_employee_count',  # log-scaled
    'industry_match_score',    # 0-1 based on ICP definition
    'source_quality',          # encoded: inbound=1.0, outbound=0.6, partner=0.8
    'email_open_count_7d',
    'website_visits_7d',
    'pages_visited_count',
    'content_downloaded',      # 0/1
    'form_fields_filled_pct',
    'time_since_created_hours',
    'activity_count',
    'enrichment_completeness', # 0-1
]

# Model retraining schedule: weekly (Celery beat)
# Minimum training data: 100 converted leads
# Output: score 0-100 + top 3 SHAP feature contributions
```

### 12.2 Churn Prediction Model
```python
CHURN_FEATURES = [
    'login_frequency_30d',
    'feature_adoption_score',
    'active_user_count_change_pct',
    'support_ticket_count_30d',
    'unresolved_ticket_days',
    'csat_score_avg',
    'invoice_days_overdue',
    'nps_score',
    'email_response_rate_30d',
    'call_answer_rate_30d',
    'key_contact_departed',       # 0/1
    'exec_sponsor_engaged_30d',   # 0/1
    'days_since_last_login',
    'subscription_age_days',
    'arr_change_pct',
]
# Output: 0-100 churn probability score
# Run: weekly per account, immediately on trigger events
```

### 12.3 Conversation Intelligence Pipeline
```python
# ml-service/pipelines/conversation_intelligence.py
def process_call(recording_url: str, call_id: str):
    # 1. Download audio from MinIO
    audio = download_audio(recording_url)

    # 2. Transcribe with Whisper large-v3 (self-hosted)
    transcript = whisper_model.transcribe(audio, language='auto')

    # 3. Speaker diarisation with PyAnnote
    diarization = diarize(audio)
    segments = align_transcript_with_speakers(transcript, diarization)

    # 4. Sentiment per segment (Ollama: mistral)
    sentiment = [analyse_sentiment(seg) for seg in segments]

    # 5. Extract structured data via LLM
    extracted = llm_extract({
        'action_items': True,
        'objections': True,
        'competitors_mentioned': True,
        'next_steps': True,
        'topics': True,
    }, transcript)

    # 6. Coaching metrics
    talk_ratio = calculate_talk_ratio(segments, 'rep')
    monologue_max = max_monologue_length(segments, 'rep')
    question_count = count_questions(segments, 'rep')

    # 7. Coaching flags
    flags = []
    if talk_ratio > 0.65: flags.append({'type': 'high_talk_ratio', 'value': talk_ratio})
    if monologue_max > 180: flags.append({'type': 'long_monologue', 'seconds': monologue_max})
    if question_count < 3: flags.append({'type': 'low_questions', 'count': question_count})

    # 8. Publish to Kafka
    publish_event('ai.transcription', 'call.transcribed', {
        'callId': call_id,
        'transcript': segments,
        'sentiment': sentiment,
        'actionItems': extracted['action_items'],
        'objections': extracted['objections'],
        'competitors': extracted['competitors_mentioned'],
        'talkRatio': talk_ratio,
        'coachingFlags': flags,
    })
```

### 12.4 RBAC Permission Matrix

```typescript
// packages/shared-types/src/rbac.ts
export const PERMISSIONS = {
  // Deals
  'deals:create': ['admin', 'manager', 'ae'],
  'deals:read': ['admin', 'manager', 'ae', 'sdr', 'cs', 'finance'],
  'deals:update': ['admin', 'manager', 'ae'],
  'deals:delete': ['admin', 'manager'],
  'deals:read_all': ['admin', 'manager'],        // see all reps' deals
  'deals:read_team': ['manager'],                 // see team's deals
  'deals:read_own': ['ae', 'sdr'],               // own deals only

  // Commission (sensitive)
  'commission:read_own': ['ae', 'sdr', 'manager'],
  'commission:read_all': ['admin', 'finance'],
  'commission:manage': ['admin', 'finance'],

  // Quotes
  'quotes:create': ['admin', 'manager', 'ae'],
  'quotes:approve_l1': ['manager'],
  'quotes:approve_l2': ['admin', 'director'],
  'quotes:approve_l3': ['finance'],

  // Reports
  'reports:executive': ['admin', 'ceo', 'vp_sales'],
  'reports:manager': ['admin', 'manager', 'vp_sales'],
  'reports:own': ['ae', 'sdr', 'cs'],

  // Admin
  'settings:manage': ['admin'],
  'users:manage': ['admin'],
  'billing:manage': ['admin', 'finance'],
  'audit_log:read': ['admin', 'compliance'],
  'gdpr:manage': ['admin', 'compliance'],
} as const;
```

---

## 13. AI & ML Infrastructure

### Model Registry
| Model | Framework | Input | Output | Refresh |
|---|---|---|---|---|
| Lead Scorer | XGBoost | 12 signals | 0-100 + SHAP explanations | Weekly |
| Deal Win Probability | Random Forest | 15 signals | 0-100 + confidence | Daily |
| Churn Predictor | XGBoost | 15 signals | 0-100 + risk tier | Weekly |
| Upsell Readiness | Gradient Boost | 10 signals | 0-100 | Weekly |
| Close Date Predictor | XGBoost Regressor | 8 signals | days-to-close | Daily |
| Whisper Transcription | Whisper large-v3 | Audio WAV | JSON transcript | On demand |
| Speaker Diarisation | PyAnnote 3.1 | Audio WAV | Speaker segments | On demand |
| Sentiment Analysis | Ollama (Mistral 7B) | Text | Sentiment score | On demand |
| LLM Co-pilot | Ollama (Llama 3.1 8B) | Prompt + context | Text | On demand |
| AI Email Writer | Ollama (Mistral 7B) | Prospect context | Draft email | On demand |
| Intent Classifier | fine-tuned DistilBERT | Call transcript | Topic tags | On demand |
| Objection Detector | fine-tuned DistilBERT | Call segment | Objection type | On demand |

### Ollama Models to Pull
```bash
ollama pull llama3.1:8b      # Co-pilot, email drafts, NLP tasks
ollama pull mistral:7b        # Sentiment, summarisation
ollama pull phi3:mini         # Fast classification tasks
```

### AI Service API (FastAPI)
```
POST /ai/score/lead              { lead_id } → { score, factors }
POST /ai/score/deal              { deal_id } → { win_prob, health, close_date }
POST /ai/score/churn             { account_id } → { churn_risk, tier, signals }
POST /ai/transcribe              { call_id, audio_url } → job_id (async)
GET  /ai/transcription/:job_id   → { status, transcript, insights }
POST /ai/draft/email             { contact_id, context } → { subject, body }
POST /ai/copilot/query           { record_type, record_id, query } → { answer }
POST /ai/forecast/quarter        { period, pipeline } → { forecast, confidence }
POST /ai/enrich/contact          { contact_id } → { enrichment_data }
POST /ai/objection/library       { objection_type } → { responses, win_rates }
```

---

## 14. Security Architecture

### Authentication Flow
```
1. User → Keycloak login (OAuth2 PKCE flow)
2. Keycloak → issues JWT with claims: sub, tenant_id, roles[], email
3. JWT stored in httpOnly secure cookie (not localStorage)
4. Every API request → Kong validates JWT signature
5. Kong extracts tenant_id + roles → forwards as request headers
6. Each service validates claims again (defence in depth)
7. PostgreSQL RLS uses tenant_id from current_setting()
```

### Secrets Management (HashiCorp Vault)
```bash
# All secrets stored in Vault — NEVER in .env files in production
vault kv put secret/nexus-crm/postgres password="..."
vault kv put secret/nexus-crm/kafka ssl_key="..."
vault kv put secret/nexus-crm/integrations/stripe api_key="..."
vault kv put secret/nexus-crm/integrations/docusign client_secret="..."

# Services use Vault Agent Sidecar to inject secrets as env vars
# Secrets auto-rotate every 30 days where supported
```

### Encryption
```
In Transit:   TLS 1.3 minimum (enforced at Kong + Nginx Ingress)
At Rest:      PostgreSQL: pgcrypto for PII columns (email, phone, name)
              MinIO: AES-256-GCM for all stored files
              Redis: TLS connection + AUTH
              Kafka: TLS broker connections + SASL/SCRAM authentication
Field-Level:  email, phone, ssn stored as pgp_sym_encrypt(value, key)
              Key stored in Vault, not in DB
```

### SSRF Protection (Integration Builder)
```typescript
// integration-service/src/middleware/ssrf-protection.ts
const BLOCKED_RANGES = [
  '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16',  // Private ranges
  '127.0.0.0/8',   // Loopback
  '169.254.0.0/16', // Link-local
  '::1/128',        // IPv6 loopback
];

export function validateExternalUrl(url: string): void {
  const parsed = new URL(url);
  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw new SecurityError('Only HTTP/HTTPS protocols allowed');
  }
  const ip = dns.lookup(parsed.hostname); // synchronous lookup
  if (isInBlockedRange(ip, BLOCKED_RANGES)) {
    throw new SecurityError('URL resolves to blocked IP range (SSRF protection)');
  }
}
```

### Session Management
```typescript
// Keycloak session configuration
{
  sessionTimeout: '8h',           // Auto-logout after 8 hours
  idleTimeout: '2h',              // Logout after 2 hours idle
  maxConcurrentSessions: 3,       // Block 4th concurrent session
  rememberMeDuration: '30d',      // Optional remember me
  deviceTracking: true,           // Show active sessions to user
  suspiciousLoginDetection: true, // Alert on new country/device
}
```

---

## 15. Compliance Framework

### GDPR / CCPA Implementation

```typescript
// compliance-service/src/gdpr/right-to-erasure.ts
export async function eraseSubjectData(
  tenantId: string,
  contactId: string,
  requestId: string
): Promise<ErasureReport> {
  // 1. Anonymise PII fields (don't delete for referential integrity)
  await db.contacts.update({
    where: { id: contactId, tenantId },
    data: {
      first_name: 'ERASED',
      last_name: 'ERASED',
      email: [`erased_${contactId}@nexus-erased.local`],
      phone: [],
      enrichment_data: {},
      gdpr_erased_at: new Date(),
    }
  });

  // 2. Delete call recordings and transcripts from MinIO
  await storageService.deleteContactFiles(contactId);

  // 3. Remove from search index
  await searchService.deleteDocument('contacts', contactId);

  // 4. Anonymise in analytics (ClickHouse)
  await analyticsService.anonymiseContact(contactId);

  // 5. Log erasure in compliance audit trail
  await complianceLog.record({ type: 'gdpr_erasure', contactId, requestId });

  return { contactId, erasedAt: new Date(), status: 'completed' };
}
```

### Data Retention Policies
```yaml
# compliance-service/config/retention.yaml
retention_policies:
  call_recordings: 2555  # 7 years (days)
  email_content: 2555    # 7 years
  financial_records: 3650 # 10 years (most jurisdictions)
  personal_data: 1825    # 5 years after last activity
  audit_logs: 2555       # 7 years
  lead_data: 730         # 2 years from creation if never converted
  session_data: 90       # 90 days
  deleted_records: 30    # 30 days in soft-delete before hard purge

# Automated purge job runs nightly via Celery
```

### Consent Tracking
```sql
CREATE TABLE consent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  contact_id UUID REFERENCES contacts(id),
  channel TEXT NOT NULL,    -- email, sms, whatsapp, phone, cookies
  consent_given BOOLEAN NOT NULL,
  consent_method TEXT,      -- web_form, phone, import, api
  ip_address INET,
  consent_text TEXT,        -- exact consent language shown
  source_url TEXT,
  given_at TIMESTAMPTZ,
  withdrawn_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 16. Integration Specifications

### Integration Service Architecture
```
External System → Webhook → integration-service → parse → Kafka event → crm-service

CRM action → integration-service → OAuth token fetch from Vault → REST call → external API
```

### No-Code Connector Engine
```typescript
// integration-service/src/connector/engine.ts
interface ConnectorConfig {
  id: string;
  name: string;
  baseUrl: string;
  authType: 'api_key' | 'oauth2' | 'bearer' | 'basic';
  authConfig: OAuthConfig | ApiKeyConfig;
  endpoints: EndpointConfig[];
  fieldMappings: FieldMapping[];
  retryPolicy: RetryConfig;
}

// OAuth tokens stored encrypted in Vault
// Token rotation handled automatically
// SSRF protection on all outbound requests
```

### Pre-Built Integration Connectors
| Category | Integrations |
|---|---|
| **Email** | Gmail (OAuth2), Outlook (OAuth2), Generic SMTP/IMAP |
| **Calendar** | Google Calendar, Outlook Calendar |
| **Communication** | WhatsApp Business API, Telegram Bot API, Twilio (SMS/VoIP), LinkedIn Sales Navigator |
| **Video** | Google Meet, Zoom, Microsoft Teams |
| **File Storage** | Google Drive, OneDrive, SharePoint, Dropbox |
| **E-Signature** | DocuSign, PandaDoc, HelloSign, Ironclad |
| **Payment** | Stripe, PayPal |
| **Mapping** | Google Maps (Directions, Places, Geocoding APIs) |
| **Enrichment** | Clearbit, ZoomInfo, Apollo.io |
| **Marketing** | HubSpot, Marketo, Pardot, Mailchimp |
| **BI / Analytics** | Power BI (REST API), Tableau (Hyper API), Looker |
| **Commission** | Xactly, Spiff, CaptivateIQ |
| **Sales Enablement** | Seismic, Highspot, Showpad |
| **Intent Data** | Bombora, 6sense |
| **Identity** | Google OAuth2, Microsoft Azure AD, Okta, SAML2 generic |
| **Notifications** | Slack, Microsoft Teams, Discord |
| **Project Mgmt** | Jira, ServiceNow, Linear |
| **ERP** | NEXUS ERP (native Kafka), SAP (REST), Oracle NetSuite |

---

## 17. File Storage Strategy

### MinIO Bucket Structure
```
nexus-crm-{tenant_id}/
├── call-recordings/
│   └── {year}/{month}/{call_id}.wav
├── call-recordings-transcoded/
│   └── {year}/{month}/{call_id}.mp3        # compressed for playback
├── quotes/
│   └── {year}/{month}/{quote_id}_v{n}.pdf
├── contracts/
│   └── {year}/{month}/{contract_id}_v{n}.pdf
├── deal-room/
│   └── {deal_id}/{filename}
├── profile-photos/
│   └── {user_id}/avatar.webp
├── email-attachments/
│   └── {contact_id}/{message_id}/{filename}
└── exports/
    └── {export_id}/{filename}
```

### File Access Control
- All file URLs are **signed MinIO presigned URLs** with 1-hour expiry
- No public buckets; all access via storage-service
- File metadata stored in PostgreSQL (storage-service DB)
- RBAC: only users with access to the parent record can access its files
- Virus scanning: ClamAV scans all uploads before making available

---

## 18. Search Architecture

### Meilisearch Index Configuration
```typescript
// search-service/src/indices.ts
const INDICES = {
  contacts: {
    primaryKey: 'id',
    searchableAttributes: ['first_name', 'last_name', 'email', 'company', 'title'],
    filterableAttributes: ['tenant_id', 'account_id', 'owner_id', 'tags', 'lifecycle_stage'],
    sortableAttributes: ['created_at', 'health_score'],
    rankingRules: ['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness'],
  },
  deals: {
    primaryKey: 'id',
    searchableAttributes: ['name', 'account_name', 'owner_name'],
    filterableAttributes: ['tenant_id', 'pipeline_id', 'stage_id', 'owner_id', 'forecast_category'],
    sortableAttributes: ['amount', 'close_date', 'created_at', 'health_score'],
  },
  accounts: {
    primaryKey: 'id',
    searchableAttributes: ['name', 'domain', 'industry'],
    filterableAttributes: ['tenant_id', 'owner_id', 'tier', 'subscription_status', 'rfm_tier'],
    sortableAttributes: ['arr', 'health_score', 'created_at'],
  },
  activities: {
    primaryKey: 'id',
    searchableAttributes: ['subject', 'body', 'transcript_text', 'ai_summary'],
    filterableAttributes: ['tenant_id', 'type', 'owner_id', 'contact_id', 'deal_id'],
    sortableAttributes: ['created_at'],
  },
};
```

---

## 19. Background Job Queue

### BullMQ Queues (per service)
```typescript
// crm-service queues
const queues = {
  'enrichment':       { concurrency: 10, defaultJobOptions: { attempts: 3, backoff: 'exponential' } },
  'segment-refresh':  { concurrency: 5,  defaultJobOptions: { attempts: 2 } },
  'health-score':     { concurrency: 20, defaultJobOptions: { attempts: 3 } },
};

// comms-service queues
const queues = {
  'email-send':       { concurrency: 50, rateLimit: { max: 100, duration: 1000 } },
  'sequence-step':    { concurrency: 20 },
  'warmup':           { concurrency: 5,  repeat: { cron: '0 9-17 * * 1-5' } },
};

// ml-service queues (Celery)
tasks = {
  'transcribe_call':    { queue: 'gpu',  rate_limit: '10/m' },
  'score_lead':         { queue: 'cpu',  rate_limit: '100/m' },
  'retrain_models':     { queue: 'gpu',  schedule: 'every sunday 2am' },
  'generate_forecast':  { queue: 'cpu',  schedule: 'daily 6am' },
}
```

---

## 20. Caching Strategy

```typescript
// Redis cache key patterns and TTLs
const CACHE = {
  // User/session data - short TTL
  'user:{userId}:profile':        { ttl: 300 },    // 5 min
  'user:{userId}:permissions':    { ttl: 300 },

  // Pipeline data - medium TTL, invalidated on deal change
  'pipeline:{id}:deals':          { ttl: 60 },     // 1 min
  'pipeline:{id}:summary':        { ttl: 60 },

  // Reports - longer TTL, ClickHouse queries are expensive
  'report:{tenantId}:{reportId}': { ttl: 300 },    // 5 min
  'dashboard:{id}:data':          { ttl: 120 },    // 2 min

  // AI scores - cache to avoid repeat inference
  'ai:lead_score:{leadId}':       { ttl: 3600 },   // 1 hour
  'ai:deal_health:{dealId}':      { ttl: 1800 },   // 30 min

  // Search suggestions - very short
  'search:suggest:{term}':        { ttl: 30 },     // 30 sec

  // Product catalogue - long TTL
  'products:{tenantId}':          { ttl: 3600 },   // 1 hour

  // Invalidation: use Redis pub/sub to invalidate on entity update
};
```

---

## 21. Mobile Architecture

**Decision: React Native with Expo**

```
apps/mobile/
├── src/
│   ├── screens/           # All app screens
│   ├── components/        # Shared UI components
│   ├── navigation/        # React Navigation config
│   ├── hooks/             # Custom React hooks
│   ├── stores/            # Zustand stores
│   ├── services/          # API client, socket, storage
│   ├── features/
│   │   ├── voice-to-crm/  # Voice recording + AI parsing
│   │   ├── card-scanner/  # Business card OCR
│   │   ├── check-in/      # GPS check-in
│   │   ├── dialler/       # VoIP calling
│   │   └── offline/       # Offline data sync
│   └── utils/
```

### Key Mobile Features
```typescript
// Voice-to-CRM implementation
import Whisper from '@mlkit/speech-to-text';

async function voiceToCRM(audioBlob: Blob) {
  // 1. Local Whisper transcription (on-device for privacy)
  const transcript = await Whisper.transcribe(audioBlob);

  // 2. Parse with AI service
  const parsed = await aiService.parseMeetingNote(transcript);

  // 3. Preview actions to user
  // 4. On confirmation → batch create CRM records
  await crmService.batchCreate(parsed.actions);
}

// Business card scanner
import MLKitTextRecognition from '@react-native-ml-kit/text-recognition';
async function scanBusinessCard(imageUri: string) {
  const result = await MLKitTextRecognition.recognize(imageUri);
  const contact = parseCardText(result.text); // regex + LLM fallback
  return contact; // prefilled CreateContact form
}

// Offline sync strategy
// - SQLite local DB mirrors critical data (contacts, deals, activities)
// - Mutations queued offline, synced on reconnect (Conflict-free merge)
// - Last-write-wins with conflict notification to user
```

---

## 22. Testing Strategy

### Coverage Targets
| Test Type | Tool | Target |
|---|---|---|
| Unit tests | Vitest | ≥ 80% coverage per service |
| Integration tests | Vitest + testcontainers | All Kafka producers/consumers |
| API contract tests | Pact | All inter-service API calls |
| E2E tests | Playwright | All critical user journeys |
| Load tests | K6 | All defined SLOs (see §23) |
| Security tests | OWASP ZAP (DAST) + Snyk (SAST) | CI/CD gate |
| Accessibility | axe-core | WCAG 2.1 AA |
| Chaos tests | Chaos Monkey / k6 | Monthly chaos days |

### Critical E2E Test Scenarios (Playwright)
```
1. Lead → MQL → SQL → Demo → Quote → Approve → Sign → Won → Order
2. RFQ received → AI parsed → Quote built → L1+L2 approval → sent → accepted
3. Churn risk detected → CS alert → save journey triggered → renewal closed
4. New rep onboards → 8 ramp milestones completed → quota attainment tracked
5. Blueprint state machine: all transitions enforced, SLA timers trigger correctly
6. GDPR erasure: contact erased → verified absent from search + analytics
7. Commission calculation: deal won → commission computed → rep dashboard updated
8. Wallboard: deal won → real-time celebration fires within 2 seconds
```

### Load Test Baselines (K6)
```javascript
// tests/load/pipeline.js
export const options = {
  stages: [
    { duration: '2m', target: 100 },   // Ramp to 100 users
    { duration: '5m', target: 100 },   // Hold
    { duration: '2m', target: 500 },   // Ramp to 500 users
    { duration: '5m', target: 500 },   // Hold
    { duration: '2m', target: 0 },     // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'],  // 95% of requests < 200ms
    http_req_failed: ['rate<0.01'],    // < 1% error rate
  },
};
```

### Browser Compatibility Matrix
| Browser | Min Version | Priority |
|---|---|---|
| Chrome | 120+ | P1 |
| Edge | 120+ | P1 |
| Firefox | 120+ | P1 |
| Safari | 17+ | P1 |
| Mobile Safari (iOS) | 17+ | P1 |
| Chrome Android | 120+ | P1 |

---

## 23. Observability & SLOs

### Service Level Objectives
| SLO | Target | Alert Threshold |
|---|---|---|
| API availability | 99.9% per month | < 99.5% → PagerDuty |
| API P95 response time | < 200ms | > 400ms for 5 min → alert |
| Search response time | < 500ms P95 | > 1000ms → alert |
| Kafka consumer lag | < 1000 messages | > 5000 → alert |
| AI inference (scoring) | < 2s P95 | > 5s → alert |
| Whisper transcription | < 60s per minute of audio | > 120s → alert |
| Report generation | < 5s P95 | > 15s → alert |
| File upload (< 10MB) | < 3s P95 | > 8s → alert |

### Prometheus Metrics (per service)
```typescript
// packages/shared/src/metrics.ts
export const metrics = {
  httpRequestDuration: new Histogram({
    name: 'http_request_duration_seconds',
    labelNames: ['method', 'route', 'status_code', 'tenant_id'],
  }),
  kafkaEventsPublished: new Counter({
    name: 'kafka_events_published_total',
    labelNames: ['topic', 'event_type'],
  }),
  kafkaConsumerLag: new Gauge({
    name: 'kafka_consumer_group_lag',
    labelNames: ['consumer_group', 'topic', 'partition'],
  }),
  activeWebsocketConnections: new Gauge({
    name: 'websocket_connections_active',
    labelNames: ['tenant_id'],
  }),
  aiInferenceLatency: new Histogram({
    name: 'ai_inference_duration_seconds',
    labelNames: ['model', 'operation'],
  }),
};
```

---

## 24. Feature Flags

### Unleash Flag Definitions
```typescript
// Key feature flags managed in Unleash
const FLAGS = {
  // Gradual rollouts
  'crm.ai-copilot':              { rollout: 10 },   // 10% of tenants
  'crm.deal-room':               { rollout: 50 },
  'crm.power-dialler':           { rollout: 25 },
  'crm.voice-to-crm':            { rollout: 5 },

  // Kill switches (can disable instantly)
  'ai.whisper-transcription':    { enabled: true },
  'ai.lead-scoring':             { enabled: true },
  'integrations.whatsapp':       { enabled: true },

  // Beta features (specific tenants only)
  'crm.intent-data':             { tenants: ['tenant_uuid_1', 'tenant_uuid_2'] },
  'crm.battlecard-builder':      { tenants: ['beta_tenants'] },
};

// Usage in service code
import { isEnabled } from '@nexus/feature-flags';
if (await isEnabled('crm.ai-copilot', { tenantId, userId })) {
  // render copilot panel
}
```

---

## 25. Data Migration Tooling

### Migration from Salesforce / HubSpot / Zoho
```bash
# CLI migration tool
npx nexus-migrate \
  --source salesforce \
  --source-token $SF_ACCESS_TOKEN \
  --target-url https://your-nexus-instance.com \
  --target-token $NEXUS_API_KEY \
  --modules contacts,accounts,deals,activities \
  --date-range 2020-01-01:2026-01-01 \
  --dry-run   # preview without importing
```

### Migration Process
1. **Extract**: pull data from source via official APIs with pagination
2. **Transform**: map source fields to NEXUS schema (configurable field mapping file)
3. **Deduplicate**: fuzzy match on email + company name; merge candidates presented for review
4. **Validate**: Zod schema validation on all records before import
5. **Import**: batch insert (1000 records/batch) with progress bar
6. **Verify**: record count comparison + sample spot-check report
7. **Rollback**: staged import — full rollback available for 48 hours post-migration

---

## 26. Environment Variables

```bash
# ═══════════════════════════════════════════════════
# NEXUS CRM — Complete Environment Variables Reference
# ═══════════════════════════════════════════════════
# DO NOT commit .env files to git
# In production: all secrets managed by HashiCorp Vault

# ── NODE ──────────────────────────────────────────
NODE_ENV=development          # development | test | production
LOG_LEVEL=info                # debug | info | warn | error

# ── POSTGRESQL (per service, example for crm-service) ──
CRM_DATABASE_URL=postgresql://nexus:password@localhost:5432/nexus_crm?schema=public
FINANCE_DATABASE_URL=postgresql://nexus:password@localhost:5433/nexus_finance
AI_DATABASE_URL=postgresql://nexus:password@localhost:5434/nexus_ai
COMMS_DATABASE_URL=postgresql://nexus:password@localhost:5435/nexus_comms
WORKFLOW_DATABASE_URL=postgresql://nexus:password@localhost:5436/nexus_workflow

# ── REDIS ─────────────────────────────────────────
REDIS_URL=redis://:password@localhost:6379
REDIS_SESSION_DB=0
REDIS_CACHE_DB=1
REDIS_QUEUE_DB=2

# ── KAFKA ─────────────────────────────────────────
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=nexus-crm
KAFKA_SSL=false                          # true in production
KAFKA_SASL_MECHANISM=SCRAM-SHA-512       # production only
KAFKA_SASL_USERNAME=nexus
KAFKA_SASL_PASSWORD=                     # from Vault in production

# ── CLICKHOUSE ────────────────────────────────────
CLICKHOUSE_HOST=http://localhost:8123
CLICKHOUSE_DATABASE=nexus_analytics
CLICKHOUSE_USER=nexus
CLICKHOUSE_PASSWORD=                     # from Vault

# ── MEILISEARCH ───────────────────────────────────
MEILI_HOST=http://localhost:7700
MEILI_MASTER_KEY=                        # from Vault

# ── MINIO (file storage) ──────────────────────────
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false                      # true in production
MINIO_ACCESS_KEY=                        # from Vault
MINIO_SECRET_KEY=                        # from Vault
MINIO_BUCKET_PREFIX=nexus-crm

# ── KEYCLOAK (Auth) ───────────────────────────────
KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=nexus-crm
KEYCLOAK_CLIENT_ID=nexus-backend
KEYCLOAK_CLIENT_SECRET=                  # from Vault
KEYCLOAK_ADMIN_USER=admin
KEYCLOAK_ADMIN_PASSWORD=                 # from Vault

# ── KONG API GATEWAY ──────────────────────────────
KONG_ADMIN_URL=http://localhost:8001
KONG_PROXY_URL=http://localhost:8000
RATE_LIMIT_REQUESTS_PER_MINUTE=1000

# ── HASHICORP VAULT ───────────────────────────────
VAULT_ADDR=http://localhost:8200
VAULT_TOKEN=                             # Vault AppRole in production
VAULT_ROLE_ID=                           # AppRole role ID
VAULT_SECRET_ID=                         # AppRole secret ID

# ── UNLEASH (Feature Flags) ───────────────────────
UNLEASH_URL=http://localhost:4242
UNLEASH_API_TOKEN=

# ── OLLAMA (Local LLM) ────────────────────────────
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_DEFAULT_MODEL=llama3.1:8b
OLLAMA_FAST_MODEL=phi3:mini
OLLAMA_SENTIMENT_MODEL=mistral:7b

# ── WHISPER (Transcription) ───────────────────────
WHISPER_MODEL=large-v3
WHISPER_LANGUAGE=auto
WHISPER_DEVICE=cuda                      # cuda | cpu

# ── EMAIL (SMTP for system emails) ───────────────
SMTP_HOST=localhost
SMTP_PORT=1025                           # MailHog in dev
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=noreply@your-domain.com
SMTP_SECURE=false                        # true in production

# ── INTEGRATIONS (stored in Vault in production) ──
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
DOCUSIGN_CLIENT_ID=
DOCUSIGN_CLIENT_SECRET=
DOCUSIGN_ACCOUNT_ID=
PANDADOC_API_KEY=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=
TELEGRAM_BOT_TOKEN=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_MAPS_API_KEY=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
CLEARBIT_API_KEY=
ZOOMINFO_CLIENT_ID=
ZOOMINFO_CLIENT_SECRET=
APOLLO_API_KEY=
BOMBORA_API_KEY=
HUBSPOT_APP_ID=
HUBSPOT_CLIENT_SECRET=
SLACK_BOT_TOKEN=
ZOOM_CLIENT_ID=
ZOOM_CLIENT_SECRET=

# ── NEXT.JS (web app) ─────────────────────────────
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_WS_URL=ws://localhost:3007
NEXT_PUBLIC_KEYCLOAK_URL=http://localhost:8080
NEXT_PUBLIC_KEYCLOAK_REALM=nexus-crm
NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=nexus-web
NEXT_PUBLIC_UNLEASH_URL=http://localhost:4242
NEXT_PUBLIC_UNLEASH_CLIENT_KEY=

# ── OBSERVABILITY ─────────────────────────────────
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
OTEL_SERVICE_NAME=nexus-crm-service      # per service
PROMETHEUS_PORT=9464
```

---

## 27. Development Setup

### Prerequisites
```bash
node --version   # 20.x LTS
pnpm --version   # 9.x
docker --version # 26.x
kubectl version  # 1.30.x (for K8s deployment)
helm version     # 3.x
```

### Step-by-Step Local Setup
```bash
# 1. Clone and install dependencies
git clone https://github.com/your-org/nexus-crm
cd nexus-crm
pnpm install

# 2. Copy environment file
cp .env.example .env
# Edit .env with your local values

# 3. Start all infrastructure containers
docker compose up -d
# Wait ~60 seconds for all services to be healthy

# 4. Check all containers are healthy
docker compose ps

# 5. Pull Ollama models (first time only, ~8GB download)
docker exec nexus-ollama ollama pull llama3.1:8b
docker exec nexus-ollama ollama pull mistral:7b
docker exec nexus-ollama ollama pull phi3:mini

# 6. Run database migrations for all services
pnpm run db:migrate:all

# 7. Seed development data (realistic fake data)
pnpm run db:seed:all
# Seeds: 5 tenants, 50 users, 500 leads, 200 accounts, 300 deals,
#        1000 contacts, 2000 activities, 100 quotes, sample blueprints

# 8. Set up Keycloak (first time only)
pnpm run setup:keycloak
# Creates: nexus-crm realm, admin user, service accounts, test users

# 9. Set up Kong routes (first time only)
pnpm run setup:kong

# 10. Set up Meilisearch indices (first time only)
pnpm run setup:search

# 11. Create MinIO buckets (first time only)
pnpm run setup:storage

# 12. Start all services in development mode
pnpm run dev
# Starts: all 15 services with hot reload via Turborepo

# Access points (local):
# Web App:        http://localhost:3001
# Partner Portal: http://localhost:3002
# API Gateway:    http://localhost:8000
# Keycloak:       http://localhost:8080
# Grafana:        http://localhost:3003  admin/admin
# Kafka UI:       http://localhost:9080
# MinIO Console:  http://localhost:9001
# Meilisearch:    http://localhost:7700
# Unleash:        http://localhost:4242
```

### Useful Development Commands
```bash
# Run tests for a specific service
pnpm --filter crm-service test
pnpm --filter crm-service test:watch

# Run E2E tests
pnpm run test:e2e

# Run load tests
pnpm run test:load --scenario pipeline

# Generate Prisma client (after schema changes)
pnpm --filter crm-service db:generate

# Create a new migration
pnpm --filter crm-service db:migrate:new -- --name add_meddic_score

# Lint and type-check all packages
pnpm run lint
pnpm run typecheck

# Build all packages for production
pnpm run build
```

---

## 28. CI/CD Pipeline

### GitHub Actions Workflow
```yaml
# .github/workflows/ci.yml
name: CI
on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main]

jobs:
  lint-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - run: pnpm install --frozen-lockfile
      - run: pnpm run lint
      - run: pnpm run typecheck

  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - run: pnpm install --frozen-lockfile
      - run: pnpm run test:unit --coverage
      - uses: codecov/codecov-action@v4

  integration-tests:
    runs-on: ubuntu-latest
    services:
      postgres: { image: postgres:16 }
      redis: { image: redis:7 }
      kafka: { image: confluentinc/cp-kafka:7.6.1 }
    steps:
      - uses: actions/checkout@v4
      - run: pnpm run test:integration

  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: snyk/actions/node@master           # SAST dependency scan
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
      - uses: aquasecurity/trivy-action@master   # Container scan
        with:
          scan-type: 'fs'
          severity: 'CRITICAL,HIGH'

  e2e-tests:
    runs-on: ubuntu-latest
    needs: [unit-tests, integration-tests]
    steps:
      - uses: actions/checkout@v4
      - run: docker compose -f docker-compose.test.yml up -d
      - run: pnpm run test:e2e
      - uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: tests/e2e/playwright-report/

  build-push:
    runs-on: ubuntu-latest
    needs: [lint-typecheck, unit-tests, integration-tests, security-scan]
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: docker/build-push-action@v5
        with:
          push: true
          tags: harbor.your-domain.com/nexus/${{ matrix.service }}:${{ github.sha }}

  deploy-staging:
    needs: build-push
    runs-on: ubuntu-latest
    steps:
      - uses: azure/k8s-set-context@v3
      - run: helm upgrade nexus-crm ./infrastructure/helm/nexus-crm
          --set image.tag=${{ github.sha }}
          --namespace staging
```

---

## 29. Deployment & Kubernetes

### Helm Chart Structure
```yaml
# infrastructure/helm/nexus-crm/values.yaml
global:
  imageRegistry: harbor.your-domain.com/nexus
  imagePullSecret: harbor-secret
  domain: crm.your-domain.com
  tlsEnabled: true

services:
  crm:
    replicas: 3
    resources:
      requests: { cpu: "500m", memory: "512Mi" }
      limits:   { cpu: "2000m", memory: "2Gi" }
    hpa:
      enabled: true
      minReplicas: 3
      maxReplicas: 20
      targetCPUUtilizationPercentage: 70

  aiService:
    replicas: 2
    resources:
      requests: { cpu: "1000m", memory: "4Gi" }
      limits:   { cpu: "4000m", memory: "8Gi" }
    nodeSelector:
      accelerator: nvidia-gpu

  mlService:
    replicas: 1
    resources:
      requests: { cpu: "2000m", memory: "8Gi" }
      limits:   { cpu: "8000m", memory: "16Gi" }
    nodeSelector:
      accelerator: nvidia-gpu
```

### Kubernetes Namespace Layout
```
nexus-production/
  ├── nexus-core          # API services
  ├── nexus-data          # PostgreSQL, Redis, Kafka, ClickHouse
  ├── nexus-ai            # Ollama, ML service
  ├── nexus-infra         # Kong, Keycloak, Vault, Unleash
  └── nexus-observability # Prometheus, Grafana, Loki, Tempo
```

---

## 30. Disaster Recovery & Backup

### Recovery Objectives
| Component | RPO (Recovery Point) | RTO (Recovery Time) |
|---|---|---|
| PostgreSQL (CRM) | 1 hour | 30 minutes |
| PostgreSQL (Finance) | 15 minutes | 30 minutes |
| ClickHouse | 4 hours | 2 hours |
| MinIO (files) | 24 hours | 4 hours |
| Kafka (messages) | 24 hours (log retention) | 1 hour |
| Redis | 5 minutes (AOF) | 15 minutes |

### Backup Procedures
```bash
# PostgreSQL — continuous WAL archiving to MinIO + daily snapshots
# Managed by pg_basebackup + WAL-G

# ClickHouse — incremental backups nightly
clickhouse-backup create nexus_analytics_$(date +%Y%m%d)
clickhouse-backup upload nexus_analytics_$(date +%Y%m%d)

# MinIO — cross-region replication to secondary MinIO (or S3)
mc mirror --watch nexus-primary/nexus-crm nexus-secondary/nexus-crm

# Test restores — automated monthly restore test in staging
# Documented in: docs/runbooks/restore-procedure.md
```

---

## Appendix A — Sprint Delivery Order

| Sprint | Focus | Deliverable |
|---|---|---|
| S1-2 | Core data model, auth, API gateway, CI/CD | Running K8s cluster, auth, CRUD APIs |
| S3-4 | CRM core: Leads, Contacts, Accounts, Deals, Pipeline | Basic CRM usable |
| S5-6 | Email/Calendar sync, Activity logging, Search | Comms integrated |
| S7-8 | Automation Studio (Workflow Builder + Blueprint) | No-code automation live |
| S9-10 | CPQ + Quoting system (RFQ→Order, approvals) | Full quote flow |
| S11-12 | Power Dialler, Sequences, SDR tools | SDR productivity |
| S13-14 | AI Layer: scoring, deal health, co-pilot | AI-powered CRM |
| S15-16 | WhatsApp, Telegram, VoIP, website chat | Full omnichannel |
| S17-18 | Sales Methodology, Playbooks, Battlecards | Process enforcement |
| S19-20 | Commission, Contests, Wallboard, Revenue Intel | Sales management |
| S21-22 | Account Planning, CLM, Partner Portal | Enterprise features |
| S23-24 | Management Reporting, ClickHouse analytics | Full reporting |
| S25-26 | Customer Journey, Churn Analysis, CS tools | Post-sale success |
| S27-28 | Low-Code Platform (Formula, Module, Integration builders) | Extensibility |
| S29-30 | Mobile app (React Native), Voice-to-CRM, card scanner | Mobile parity |
| S31-32 | Extended integrations (Stripe, DocuSign, BI tools) | Ecosystem |
| S33-34 | GDPR/Compliance framework, Audit log, Security hardening | Enterprise compliance |
| S35-36 | Performance optimisation, load testing, UAT, go-live | Production ready |

---

## Appendix B — Glossary

| Term | Definition |
|---|---|
| ARR | Annual Recurring Revenue |
| MRR | Monthly Recurring Revenue |
| CPQ | Configure-Price-Quote |
| CLM | Contract Lifecycle Management |
| MEDDIC | Sales qualification methodology: Metrics, Economic Buyer, Decision Criteria, Decision Process, Identify Pain, Champion |
| NRR | Net Revenue Retention (ARR + expansion − churn) |
| RFQ | Request for Quotation |
| CQRS | Command Query Responsibility Segregation |
| RLS | Row-Level Security (PostgreSQL) |
| SSRF | Server-Side Request Forgery |
| RBAC | Role-Based Access Control |
| OTE | On-Target Earnings |
| SPIFF | Short-term Performance Incentive Fund |
| ABM | Account-Based Marketing |
| AE | Account Executive |
| SDR | Sales Development Representative |
| CS | Customer Success |
| QBR | Quarterly Business Review |
| SLO | Service Level Objective |
| RPO | Recovery Point Objective |
| RTO | Recovery Time Objective |

---

*NEXUS CRM Technical Specification v4.0 — Expert Panel Validated — April 2026*
*Prepared by: NEXUS Senior Engineering Team*
*Next review: Before Sprint 1 kickoff*

---

## 31. Prisma Schemas — All 15 Services

> Each service has its own `schema.prisma`. All schemas use the shared tenant isolation pattern.
> Tenant ID is always `tenantId String` with a composite unique index.

### 31.1 Auth Service (`services/auth-service/prisma/schema.prisma`)

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../../../node_modules/.prisma/auth-client"
}

datasource db {
  provider = "postgresql"
  url      = env("AUTH_DATABASE_URL")
}

model Tenant {
  id          String   @id @default(cuid())
  slug        String   @unique
  name        String
  plan        String   @default("starter")
  isActive    Boolean  @default(true)
  settings    Json     @default("{}")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  users       User[]
  roles       Role[]
  apiKeys     ApiKey[]
}

model User {
  id              String        @id @default(cuid())
  tenantId        String
  tenant          Tenant        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  email           String
  emailVerified   Boolean       @default(false)
  keycloakId      String        @unique
  firstName       String
  lastName        String
  avatarUrl       String?
  phone           String?
  locale          String        @default("en")
  timezone        String        @default("UTC")
  isActive        Boolean       @default(true)
  lastLoginAt     DateTime?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  userRoles       UserRole[]
  sessions        Session[]
  auditLogs       AuditLog[]
  @@unique([tenantId, email])
  @@index([tenantId])
}

model Role {
  id          String       @id @default(cuid())
  tenantId    String
  tenant      Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  name        String
  description String?
  permissions Json         @default("[]")
  isSystem    Boolean      @default(false)
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  userRoles   UserRole[]
  @@unique([tenantId, name])
}

model UserRole {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  roleId    String
  role      Role     @relation(fields: [roleId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
  @@unique([userId, roleId])
}

model Session {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  refreshToken String   @unique
  userAgent    String?
  ipAddress    String?
  expiresAt    DateTime
  createdAt    DateTime @default(now())
  @@index([userId])
}

model ApiKey {
  id          String    @id @default(cuid())
  tenantId    String
  tenant      Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  name        String
  keyHash     String    @unique
  keyPrefix   String
  scopes      Json      @default("[]")
  lastUsedAt  DateTime?
  expiresAt   DateTime?
  createdAt   DateTime  @default(now())
  @@index([tenantId])
}

model AuditLog {
  id         String   @id @default(cuid())
  tenantId   String
  userId     String?
  user       User?    @relation(fields: [userId], references: [id])
  action     String
  resource   String
  resourceId String?
  oldValue   Json?
  newValue   Json?
  ipAddress  String?
  userAgent  String?
  createdAt  DateTime @default(now())
  @@index([tenantId])
  @@index([tenantId, resource, resourceId])
}
```

### 31.2 CRM Service (`services/crm-service/prisma/schema.prisma`)

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../../../node_modules/.prisma/crm-client"
}

datasource db {
  provider = "postgresql"
  url      = env("CRM_DATABASE_URL")
}

model Lead {
  id               String       @id @default(cuid())
  tenantId         String
  ownerId          String
  firstName        String
  lastName         String
  email            String?
  phone            String?
  company          String?
  jobTitle         String?
  source           LeadSource   @default(MANUAL)
  status           LeadStatus   @default(NEW)
  score            Int          @default(0)
  aiScore          Float?
  aiScoreReason    String?
  rating           LeadRating   @default(COLD)
  industry         String?
  website          String?
  annualRevenue    Decimal?     @db.Decimal(18, 2)
  employeeCount    Int?
  country          String?
  city             String?
  address          String?
  linkedInUrl      String?
  twitterHandle    String?
  utmSource        String?
  utmMedium        String?
  utmCampaign      String?
  utmContent       String?
  utmTerm          String?
  convertedAt      DateTime?
  convertedToId    String?
  customFields     Json         @default("{}")
  tags             String[]
  doNotContact     Boolean      @default(false)
  gdprConsent      Boolean      @default(false)
  gdprConsentAt    DateTime?
  createdAt        DateTime     @default(now())
  updatedAt        DateTime     @updatedAt
  activities       Activity[]
  notes            Note[]
  @@index([tenantId])
  @@index([tenantId, status])
  @@index([tenantId, ownerId])
}

enum LeadSource {
  MANUAL IMPORT WEB_FORM EMAIL_CAMPAIGN SOCIAL_MEDIA
  PAID_ADS REFERRAL PARTNER CHAT EVENT OTHER
}

enum LeadStatus {
  NEW ASSIGNED WORKING QUALIFIED UNQUALIFIED CONVERTED
}

enum LeadRating {
  HOT WARM COLD
}

model Contact {
  id             String       @id @default(cuid())
  tenantId       String
  ownerId        String
  accountId      String?
  account        Account?     @relation(fields: [accountId], references: [id])
  firstName      String
  lastName       String
  email          String?
  phone          String?
  mobile         String?
  jobTitle       String?
  department     String?
  linkedInUrl    String?
  twitterHandle  String?
  country        String?
  city           String?
  address        String?
  timezone       String?
  preferredChannel String?
  doNotEmail     Boolean      @default(false)
  doNotCall      Boolean      @default(false)
  gdprConsent    Boolean      @default(false)
  gdprConsentAt  DateTime?
  lastContactedAt DateTime?
  customFields   Json         @default("{}")
  tags           String[]
  isActive       Boolean      @default(true)
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  deals          DealContact[]
  activities     Activity[]
  notes          Note[]
  @@unique([tenantId, email])
  @@index([tenantId])
  @@index([tenantId, accountId])
  @@index([tenantId, ownerId])
}

model Account {
  id                String        @id @default(cuid())
  tenantId          String
  ownerId           String
  parentAccountId   String?
  parentAccount     Account?      @relation("AccountHierarchy", fields: [parentAccountId], references: [id])
  childAccounts     Account[]     @relation("AccountHierarchy")
  name              String
  website           String?
  phone             String?
  email             String?
  industry          String?
  type              AccountType   @default(PROSPECT)
  tier              AccountTier   @default(SMB)
  status            AccountStatus @default(ACTIVE)
  annualRevenue     Decimal?      @db.Decimal(18, 2)
  employeeCount     Int?
  country           String?
  city              String?
  address           String?
  zipCode           String?
  linkedInUrl       String?
  description       String?
  sicCode           String?
  naicsCode         String?
  healthScore       Int?
  npsScore          Int?
  customFields      Json          @default("{}")
  tags              String[]
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt
  contacts          Contact[]
  deals             Deal[]
  notes             Note[]
  activities        Activity[]
  @@index([tenantId])
  @@index([tenantId, type])
  @@index([tenantId, ownerId])
}

enum AccountType {
  PROSPECT CUSTOMER PARTNER COMPETITOR RESELLER OTHER
}

enum AccountTier {
  STRATEGIC ENTERPRISE MID_MARKET SMB
}

enum AccountStatus {
  ACTIVE INACTIVE AT_RISK CHURNED
}

model Deal {
  id               String       @id @default(cuid())
  tenantId         String
  ownerId          String
  accountId        String
  account          Account      @relation(fields: [accountId], references: [id])
  pipelineId       String
  pipeline         Pipeline     @relation(fields: [pipelineId], references: [id])
  stageId          String
  stage            Stage        @relation(fields: [stageId], references: [id])
  name             String
  amount           Decimal      @default(0) @db.Decimal(18, 2)
  currency         String       @default("USD")
  probability      Int          @default(0)
  expectedCloseDate DateTime?
  actualCloseDate  DateTime?
  status           DealStatus   @default(OPEN)
  lostReason       String?
  lostDetail       String?
  forecastCategory ForecastCategory @default(PIPELINE)
  meddicicScore    Int          @default(0)
  meddicicData     Json         @default("{}")
  aiWinProbability Float?
  aiInsights       Json         @default("{}")
  competitors      String[]
  source           String?
  campaignId       String?
  customFields     Json         @default("{}")
  tags             String[]
  version          Int          @default(1)
  createdAt        DateTime     @default(now())
  updatedAt        DateTime     @updatedAt
  contacts         DealContact[]
  activities       Activity[]
  notes            Note[]
  quotes           Quote[]
  @@index([tenantId])
  @@index([tenantId, pipelineId, stageId])
  @@index([tenantId, ownerId])
  @@index([tenantId, status])
}

enum DealStatus {
  OPEN WON LOST DORMANT
}

enum ForecastCategory {
  PIPELINE BEST_CASE COMMIT CLOSED OMITTED
}

model DealContact {
  id        String  @id @default(cuid())
  dealId    String
  deal      Deal    @relation(fields: [dealId], references: [id], onDelete: Cascade)
  contactId String
  contact   Contact @relation(fields: [contactId], references: [id], onDelete: Cascade)
  role      String?
  isPrimary Boolean @default(false)
  @@unique([dealId, contactId])
}

model Pipeline {
  id         String   @id @default(cuid())
  tenantId   String
  name       String
  currency   String   @default("USD")
  isDefault  Boolean  @default(false)
  isActive   Boolean  @default(true)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  stages     Stage[]
  deals      Deal[]
  @@unique([tenantId, name])
  @@index([tenantId])
}

model Stage {
  id              String   @id @default(cuid())
  tenantId        String
  pipelineId      String
  pipeline        Pipeline @relation(fields: [pipelineId], references: [id], onDelete: Cascade)
  name            String
  order           Int
  probability     Int      @default(0)
  rottenDays      Int      @default(30)
  requiredFields  Json     @default("[]")
  entryConditions Json     @default("[]")
  color           String   @default("#6B7280")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  deals           Deal[]
  @@unique([pipelineId, name])
  @@index([tenantId, pipelineId])
}

model Activity {
  id           String         @id @default(cuid())
  tenantId     String
  ownerId      String
  type         ActivityType
  subject      String
  description  String?
  status       ActivityStatus @default(PLANNED)
  priority     ActivityPriority @default(NORMAL)
  dueDate      DateTime?
  startDate    DateTime?
  endDate      DateTime?
  duration     Int?
  outcome      String?
  leadId       String?
  lead         Lead?          @relation(fields: [leadId], references: [id])
  contactId    String?
  contact      Contact?       @relation(fields: [contactId], references: [id])
  accountId    String?
  account      Account?       @relation(fields: [accountId], references: [id])
  dealId       String?
  deal         Deal?          @relation(fields: [dealId], references: [id])
  customFields Json           @default("{}")
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt
  @@index([tenantId])
  @@index([tenantId, ownerId])
  @@index([tenantId, dealId])
  @@index([tenantId, dueDate])
}

enum ActivityType {
  CALL EMAIL MEETING TASK DEMO LUNCH CONFERENCE
  FOLLOW_UP PROPOSAL NEGOTIATION NOTE
}

enum ActivityStatus {
  PLANNED IN_PROGRESS COMPLETED CANCELLED DEFERRED
}

enum ActivityPriority {
  LOW NORMAL HIGH URGENT
}

model Note {
  id         String   @id @default(cuid())
  tenantId   String
  authorId   String
  content    String
  isPinned   Boolean  @default(false)
  leadId     String?
  lead       Lead?    @relation(fields: [leadId], references: [id])
  contactId  String?
  contact    Contact? @relation(fields: [contactId], references: [id])
  accountId  String?
  account    Account? @relation(fields: [accountId], references: [id])
  dealId     String?
  deal       Deal?    @relation(fields: [dealId], references: [id])
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  @@index([tenantId])
  @@index([tenantId, dealId])
}

model Quote {
  id              String      @id @default(cuid())
  tenantId        String
  dealId          String
  deal            Deal        @relation(fields: [dealId], references: [id])
  ownerId         String
  quoteNumber     String
  name            String
  status          QuoteStatus @default(DRAFT)
  validUntil      DateTime?
  currency        String      @default("USD")
  subtotal        Decimal     @default(0) @db.Decimal(18, 2)
  discountAmount  Decimal     @default(0) @db.Decimal(18, 2)
  taxAmount       Decimal     @default(0) @db.Decimal(18, 2)
  total           Decimal     @default(0) @db.Decimal(18, 2)
  approvalStatus  String?
  approvedById    String?
  approvedAt      DateTime?
  sentAt          DateTime?
  viewedAt        DateTime?
  acceptedAt      DateTime?
  terms           String?
  notes           String?
  lineItems       Json        @default("[]")
  customFields    Json        @default("{}")
  version         Int         @default(1)
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
  @@unique([tenantId, quoteNumber])
  @@index([tenantId, dealId])
}

enum QuoteStatus {
  DRAFT PENDING_APPROVAL APPROVED SENT VIEWED ACCEPTED
  REJECTED EXPIRED CONVERTED
}
```

### 31.3 Finance Service (`services/finance-service/prisma/schema.prisma`)

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../../../node_modules/.prisma/finance-client"
}

datasource db {
  provider = "postgresql"
  url      = env("FINANCE_DATABASE_URL")
}

model Product {
  id             String        @id @default(cuid())
  tenantId       String
  sku            String
  name           String
  description    String?
  type           ProductType   @default(SERVICE)
  category       String?
  currency       String        @default("USD")
  listPrice      Decimal       @db.Decimal(18, 2)
  cost           Decimal?      @db.Decimal(18, 2)
  billingType    BillingType   @default(ONE_TIME)
  billingPeriod  String?
  taxable        Boolean       @default(true)
  taxCode        String?
  isActive       Boolean       @default(true)
  pricingRules   Json          @default("[]")
  customFields   Json          @default("{}")
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt
  @@unique([tenantId, sku])
  @@index([tenantId])
}

enum ProductType {
  PHYSICAL SERVICE DIGITAL BUNDLE SUBSCRIPTION
}

enum BillingType {
  ONE_TIME RECURRING USAGE MILESTONE
}

model PriceTier {
  id         String   @id @default(cuid())
  tenantId   String
  productId  String
  name       String
  minQty     Int      @default(1)
  maxQty     Int?
  unitPrice  Decimal  @db.Decimal(18, 2)
  createdAt  DateTime @default(now())
  @@index([tenantId, productId])
}

model Contract {
  id              String         @id @default(cuid())
  tenantId        String
  accountId       String
  ownerId         String
  contractNumber  String
  name            String
  status          ContractStatus @default(DRAFT)
  startDate       DateTime?
  endDate         DateTime?
  autoRenew       Boolean        @default(false)
  renewalTermDays Int            @default(30)
  currency        String         @default("USD")
  totalValue      Decimal        @db.Decimal(18, 2)
  signedAt        DateTime?
  signedById      String?
  signatureData   Json?
  terms           String?
  lineItems       Json           @default("[]")
  customFields    Json           @default("{}")
  version         Int            @default(1)
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt
  subscriptions   Subscription[]
  invoices        Invoice[]
  @@unique([tenantId, contractNumber])
  @@index([tenantId, accountId])
}

enum ContractStatus {
  DRAFT PENDING_SIGNATURE ACTIVE EXPIRED TERMINATED RENEWED
}

model Subscription {
  id              String             @id @default(cuid())
  tenantId        String
  accountId       String
  contractId      String?
  contract        Contract?          @relation(fields: [contractId], references: [id])
  productId       String
  planName        String
  status          SubscriptionStatus @default(ACTIVE)
  quantity        Int                @default(1)
  unitPrice       Decimal            @db.Decimal(18, 2)
  currency        String             @default("USD")
  billingPeriod   String             @default("MONTHLY")
  billingDay      Int                @default(1)
  startDate       DateTime
  endDate         DateTime?
  trialEndDate    DateTime?
  cancelledAt     DateTime?
  cancelReason    String?
  mrr             Decimal            @db.Decimal(18, 2)
  arr             Decimal            @db.Decimal(18, 2)
  nextBillingDate DateTime?
  customFields    Json               @default("{}")
  createdAt       DateTime           @default(now())
  updatedAt       DateTime           @updatedAt
  invoices        Invoice[]
  usageRecords    UsageRecord[]
  @@index([tenantId, accountId])
  @@index([tenantId, status])
}

enum SubscriptionStatus {
  TRIALING ACTIVE PAST_DUE PAUSED CANCELLED EXPIRED
}

model Invoice {
  id             String        @id @default(cuid())
  tenantId       String
  accountId      String
  subscriptionId String?
  subscription   Subscription? @relation(fields: [subscriptionId], references: [id])
  contractId     String?
  contract       Contract?     @relation(fields: [contractId], references: [id])
  invoiceNumber  String
  status         InvoiceStatus @default(DRAFT)
  currency       String        @default("USD")
  subtotal       Decimal       @db.Decimal(18, 2)
  taxAmount      Decimal       @default(0) @db.Decimal(18, 2)
  discountAmount Decimal       @default(0) @db.Decimal(18, 2)
  total          Decimal       @db.Decimal(18, 2)
  dueDate        DateTime?
  paidAt         DateTime?
  paidAmount     Decimal?      @db.Decimal(18, 2)
  lineItems      Json          @default("[]")
  notes          String?
  customFields   Json          @default("{}")
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt
  payments       Payment[]
  @@unique([tenantId, invoiceNumber])
  @@index([tenantId, accountId])
  @@index([tenantId, status])
}

enum InvoiceStatus {
  DRAFT SENT PARTIAL PAID OVERDUE VOID UNCOLLECTIBLE
}

model Payment {
  id            String        @id @default(cuid())
  tenantId      String
  invoiceId     String
  invoice       Invoice       @relation(fields: [invoiceId], references: [id])
  amount        Decimal       @db.Decimal(18, 2)
  currency      String        @default("USD")
  method        PaymentMethod
  status        PaymentStatus @default(PENDING)
  reference     String?
  gateway       String?
  gatewayRef    String?
  notes         String?
  paidAt        DateTime?
  failedAt      DateTime?
  failureReason String?
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt
  @@index([tenantId, invoiceId])
}

enum PaymentMethod {
  BANK_TRANSFER CREDIT_CARD ACH CHECK WIRE CRYPTO OTHER
}

enum PaymentStatus {
  PENDING PROCESSING COMPLETED FAILED REFUNDED PARTIALLY_REFUNDED
}

model CommissionPlan {
  id           String   @id @default(cuid())
  tenantId     String
  name         String
  description  String?
  isActive     Boolean  @default(true)
  currency     String   @default("USD")
  period       String   @default("QUARTERLY")
  rules        Json     @default("[]")
  accelerators Json     @default("[]")
  decelerators Json     @default("[]")
  spiffs       Json     @default("[]")
  clawbackDays Int      @default(90)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  assignments  CommissionAssignment[]
  @@unique([tenantId, name])
  @@index([tenantId])
}

model CommissionAssignment {
  id        String         @id @default(cuid())
  tenantId  String
  planId    String
  plan      CommissionPlan @relation(fields: [planId], references: [id])
  userId    String
  startDate DateTime
  endDate   DateTime?
  quota     Decimal?       @db.Decimal(18, 2)
  createdAt DateTime       @default(now())
  @@index([tenantId, userId])
}

model CommissionRecord {
  id           String            @id @default(cuid())
  tenantId     String
  userId       String
  planId       String
  dealId       String?
  invoiceId    String?
  type         CommissionType
  status       CommissionStatus  @default(PENDING)
  baseAmount   Decimal           @db.Decimal(18, 2)
  rate         Float
  amount       Decimal           @db.Decimal(18, 2)
  multiplier   Float             @default(1)
  finalAmount  Decimal           @db.Decimal(18, 2)
  period       String
  notes        String?
  clawbackOf   String?
  paidAt       DateTime?
  createdAt    DateTime          @default(now())
  updatedAt    DateTime          @updatedAt
  @@index([tenantId, userId])
  @@index([tenantId, period])
}

enum CommissionType {
  DEAL_CLOSED RECURRING SPIFF BONUS CLAWBACK ADJUSTMENT
}

enum CommissionStatus {
  PENDING APPROVED PAID DISPUTED CLAWED_BACK
}

model UsageRecord {
  id             String       @id @default(cuid())
  tenantId       String
  subscriptionId String
  subscription   Subscription @relation(fields: [subscriptionId], references: [id])
  metricName     String
  quantity       Decimal      @db.Decimal(18, 6)
  unitPrice      Decimal?     @db.Decimal(18, 6)
  recordedAt     DateTime
  billedAt       DateTime?
  @@index([tenantId, subscriptionId])
  @@index([tenantId, recordedAt])
}
```

### 31.4 Workflow Engine (`services/workflow-engine/prisma/schema.prisma`)

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../../../node_modules/.prisma/workflow-client"
}

datasource db {
  provider = "postgresql"
  url      = env("WORKFLOW_DATABASE_URL")
}

model WorkflowDefinition {
  id          String           @id @default(cuid())
  tenantId    String
  name        String
  description String?
  trigger     Json
  nodes       Json             @default("[]")
  edges       Json             @default("[]")
  variables   Json             @default("{}")
  isActive    Boolean          @default(false)
  version     Int              @default(1)
  createdById String
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt
  executions  WorkflowExecution[]
  @@unique([tenantId, name])
  @@index([tenantId])
}

model WorkflowExecution {
  id           String            @id @default(cuid())
  tenantId     String
  workflowId   String
  workflow     WorkflowDefinition @relation(fields: [workflowId], references: [id])
  status       ExecutionStatus   @default(RUNNING)
  triggerData  Json              @default("{}")
  context      Json              @default("{}")
  currentNode  String?
  startedAt    DateTime          @default(now())
  completedAt  DateTime?
  failedAt     DateTime?
  errorMessage String?
  logs         WorkflowLog[]
  @@index([tenantId, workflowId])
  @@index([tenantId, status])
}

enum ExecutionStatus {
  RUNNING PAUSED COMPLETED FAILED CANCELLED TIMED_OUT
}

model WorkflowLog {
  id          String            @id @default(cuid())
  executionId String
  execution   WorkflowExecution @relation(fields: [executionId], references: [id], onDelete: Cascade)
  nodeId      String
  nodeName    String
  status      String
  input       Json?
  output      Json?
  error       String?
  duration    Int?
  timestamp   DateTime          @default(now())
  @@index([executionId])
}

model Blueprint {
  id          String        @id @default(cuid())
  tenantId    String
  entityType  String
  name        String
  description String?
  states      Json          @default("[]")
  transitions Json          @default("[]")
  slaTimers   Json          @default("[]")
  checklists  Json          @default("[]")
  isActive    Boolean       @default(false)
  version     Int           @default(1)
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  instances   BlueprintInstance[]
  @@unique([tenantId, entityType, name])
  @@index([tenantId, entityType])
}

model BlueprintInstance {
  id           String     @id @default(cuid())
  tenantId     String
  blueprintId  String
  blueprint    Blueprint  @relation(fields: [blueprintId], references: [id])
  entityId     String
  entityType   String
  currentState String
  history      Json       @default("[]")
  checklistData Json      @default("{}")
  slaData      Json       @default("{}")
  completedAt  DateTime?
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
  @@unique([blueprintId, entityId])
  @@index([tenantId, entityId])
}

model Sequence {
  id          String          @id @default(cuid())
  tenantId    String
  name        String
  description String?
  steps       Json            @default("[]")
  exitConditions Json         @default("[]")
  isActive    Boolean         @default(true)
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt
  enrollments SequenceEnrollment[]
  @@index([tenantId])
}

model SequenceEnrollment {
  id            String    @id @default(cuid())
  tenantId      String
  sequenceId    String
  sequence      Sequence  @relation(fields: [sequenceId], references: [id])
  contactId     String
  currentStep   Int       @default(0)
  status        String    @default("ACTIVE")
  enrolledAt    DateTime  @default(now())
  completedAt   DateTime?
  exitedAt      DateTime?
  exitReason    String?
  nextActionAt  DateTime?
  @@unique([sequenceId, contactId])
  @@index([tenantId, contactId])
}
```

### 31.5 Comms Service (`services/comms-service/prisma/schema.prisma`)

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../../../node_modules/.prisma/comms-client"
}

datasource db {
  provider = "postgresql"
  url      = env("COMMS_DATABASE_URL")
}

model EmailAccount {
  id           String    @id @default(cuid())
  tenantId     String
  userId       String
  provider     String
  email        String
  displayName  String?
  accessToken  String?
  refreshToken String?
  tokenExpiry  DateTime?
  isActive     Boolean   @default(true)
  syncFrom     DateTime?
  lastSyncAt   DateTime?
  createdAt    DateTime  @default(now())
  emails       Email[]
  @@unique([tenantId, email])
  @@index([tenantId, userId])
}

model Email {
  id             String       @id @default(cuid())
  tenantId       String
  accountId      String
  account        EmailAccount @relation(fields: [accountId], references: [id])
  messageId      String
  threadId       String?
  subject        String?
  fromAddress    String
  fromName       String?
  toAddresses    Json         @default("[]")
  ccAddresses    Json         @default("[]")
  bccAddresses   Json         @default("[]")
  bodyText       String?
  bodyHtml       String?
  snippet        String?
  isRead         Boolean      @default(false)
  isStarred      Boolean      @default(false)
  isSent         Boolean      @default(false)
  isDraft        Boolean      @default(false)
  hasAttachments Boolean      @default(false)
  sentAt         DateTime?
  receivedAt     DateTime?
  linkedContactId String?
  linkedDealId    String?
  linkedAccountId String?
  aiSummary       String?
  aiSentiment     String?
  createdAt      DateTime     @default(now())
  @@unique([tenantId, messageId])
  @@index([tenantId, accountId])
  @@index([tenantId, threadId])
}

model CallRecord {
  id               String     @id @default(cuid())
  tenantId         String
  userId           String
  direction        String
  status           CallStatus
  fromNumber       String
  toNumber         String
  duration         Int?
  recordingUrl     String?
  transcriptText   String?
  transcriptData   Json?
  aiSummary        String?
  aiSentiment      String?
  aiKeyTopics      String[]
  aiNextAction     String?
  speakerMap       Json?
  linkedContactId  String?
  linkedDealId     String?
  linkedAccountId  String?
  startedAt        DateTime
  endedAt          DateTime?
  createdAt        DateTime   @default(now())
  @@index([tenantId, userId])
  @@index([tenantId, linkedDealId])
}

enum CallStatus {
  QUEUED RINGING IN_PROGRESS COMPLETED FAILED NO_ANSWER BUSY CANCELLED
}

model Conversation {
  id           String    @id @default(cuid())
  tenantId     String
  channel      String
  status       String    @default("OPEN")
  assignedTo   String?
  contactId    String?
  accountId    String?
  dealId       String?
  subject      String?
  externalId   String?
  lastMessageAt DateTime?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  messages     Message[]
  @@index([tenantId])
  @@index([tenantId, channel, status])
}

model Message {
  id             String       @id @default(cuid())
  tenantId       String
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  direction      String
  channel        String
  senderId       String?
  senderName     String?
  content        String?
  contentType    String       @default("TEXT")
  metadata       Json         @default("{}")
  isRead         Boolean      @default(false)
  sentAt         DateTime?
  deliveredAt    DateTime?
  readAt         DateTime?
  failedAt       DateTime?
  failureReason  String?
  createdAt      DateTime     @default(now())
  @@index([tenantId, conversationId])
}

model EmailTemplate {
  id          String   @id @default(cuid())
  tenantId    String
  name        String
  subject     String
  bodyHtml    String
  bodyText    String?
  category    String?
  variables   Json     @default("[]")
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@unique([tenantId, name])
  @@index([tenantId])
}
```

### 31.6 Notification Service (`services/notification-service/prisma/schema.prisma`)

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../../../node_modules/.prisma/notification-client"
}

datasource db {
  provider = "postgresql"
  url      = env("NOTIFICATION_DATABASE_URL")
}

model Notification {
  id         String             @id @default(cuid())
  tenantId   String
  userId     String
  type       String
  title      String
  body       String?
  data       Json               @default("{}")
  isRead     Boolean            @default(false)
  readAt     DateTime?
  channels   String[]
  deliveries NotificationDelivery[]
  createdAt  DateTime           @default(now())
  @@index([tenantId, userId])
  @@index([tenantId, userId, isRead])
}

model NotificationDelivery {
  id             String       @id @default(cuid())
  notificationId String
  notification   Notification @relation(fields: [notificationId], references: [id], onDelete: Cascade)
  channel        String
  status         String       @default("PENDING")
  externalId     String?
  sentAt         DateTime?
  failedAt       DateTime?
  failureReason  String?
  @@index([notificationId])
}

model NotificationPreference {
  id         String   @id @default(cuid())
  tenantId   String
  userId     String
  type       String
  channels   Json     @default("{\"email\":true,\"push\":true,\"inApp\":true}")
  updatedAt  DateTime @updatedAt
  @@unique([tenantId, userId, type])
}

model PushToken {
  id        String   @id @default(cuid())
  tenantId  String
  userId    String
  token     String   @unique
  platform  String
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  @@index([tenantId, userId])
}
```

### 31.7 Integration Service (`services/integration-service/prisma/schema.prisma`)

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../../../node_modules/.prisma/integration-client"
}

datasource db {
  provider = "postgresql"
  url      = env("INTEGRATION_DATABASE_URL")
}

model Integration {
  id           String           @id @default(cuid())
  tenantId     String
  type         String
  name         String
  status       IntegrationStatus @default(DISCONNECTED)
  config       Json             @default("{}")
  credentials  Json             @default("{}")
  lastSyncAt   DateTime?
  syncStatus   String?
  errorMessage String?
  webhookUrl   String?
  webhookSecret String?
  createdAt    DateTime         @default(now())
  updatedAt    DateTime         @updatedAt
  syncJobs     IntegrationSyncJob[]
  @@unique([tenantId, type])
  @@index([tenantId])
}

enum IntegrationStatus {
  CONNECTED DISCONNECTED ERROR SYNCING
}

model IntegrationSyncJob {
  id            String      @id @default(cuid())
  integrationId String
  integration   Integration @relation(fields: [integrationId], references: [id], onDelete: Cascade)
  type          String
  status        String      @default("PENDING")
  direction     String      @default("INBOUND")
  recordsTotal  Int         @default(0)
  recordsSynced Int         @default(0)
  recordsFailed Int         @default(0)
  errors        Json        @default("[]")
  startedAt     DateTime?
  completedAt   DateTime?
  createdAt     DateTime    @default(now())
  @@index([integrationId])
}

model WebhookEndpoint {
  id          String    @id @default(cuid())
  tenantId    String
  url         String
  secret      String
  events      String[]
  isActive    Boolean   @default(true)
  failureCount Int      @default(0)
  lastFailedAt DateTime?
  createdAt   DateTime  @default(now())
  deliveries  WebhookDelivery[]
  @@index([tenantId])
}

model WebhookDelivery {
  id           String          @id @default(cuid())
  endpointId   String
  endpoint     WebhookEndpoint @relation(fields: [endpointId], references: [id], onDelete: Cascade)
  event        String
  payload      Json
  statusCode   Int?
  response     String?
  attempt      Int             @default(1)
  sentAt       DateTime?
  failedAt     DateTime?
  createdAt    DateTime        @default(now())
  @@index([endpointId])
}
```

### 31.8 Partner Service (`services/partner-service/prisma/schema.prisma`)

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../../../node_modules/.prisma/partner-client"
}

datasource db {
  provider = "postgresql"
  url      = env("PARTNER_DATABASE_URL")
}

model PartnerOrg {
  id           String        @id @default(cuid())
  tenantId     String
  name         String
  type         PartnerType
  status       PartnerStatus @default(PENDING)
  tier         String        @default("SILVER")
  contactEmail String
  website      String?
  country      String?
  commissionRate Float       @default(0.1)
  customFields Json          @default("{}")
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt
  users        PartnerUser[]
  deals        PartnerDeal[]
  @@index([tenantId])
}

enum PartnerType {
  RESELLER REFERRAL TECHNOLOGY OEM DISTRIBUTOR
}

enum PartnerStatus {
  PENDING ACTIVE SUSPENDED TERMINATED
}

model PartnerUser {
  id          String     @id @default(cuid())
  partnerId   String
  partner     PartnerOrg @relation(fields: [partnerId], references: [id])
  userId      String
  role        String     @default("MEMBER")
  isActive    Boolean    @default(true)
  createdAt   DateTime   @default(now())
  @@unique([partnerId, userId])
}

model PartnerDeal {
  id           String     @id @default(cuid())
  tenantId     String
  partnerId    String
  partner      PartnerOrg @relation(fields: [partnerId], references: [id])
  dealId       String
  registeredAt DateTime   @default(now())
  status       String     @default("PENDING")
  commissionAmount Decimal? @db.Decimal(18, 2)
  paidAt       DateTime?
  @@unique([partnerId, dealId])
  @@index([tenantId, partnerId])
}
```

### 31.9 Compliance Service (`services/compliance-service/prisma/schema.prisma`)

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../../../node_modules/.prisma/compliance-client"
}

datasource db {
  provider = "postgresql"
  url      = env("COMPLIANCE_DATABASE_URL")
}

model DataRetentionPolicy {
  id            String   @id @default(cuid())
  tenantId      String
  entityType    String
  retentionDays Int
  archiveDays   Int?
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@unique([tenantId, entityType])
}

model ConsentRecord {
  id          String   @id @default(cuid())
  tenantId    String
  subjectId   String
  subjectType String
  purpose     String
  granted     Boolean
  channel     String?
  ipAddress   String?
  grantedAt   DateTime
  revokedAt   DateTime?
  expiresAt   DateTime?
  metadata    Json     @default("{}")
  createdAt   DateTime @default(now())
  @@index([tenantId, subjectId])
  @@index([tenantId, purpose])
}

model ErasureRequest {
  id           String        @id @default(cuid())
  tenantId     String
  subjectId    String
  subjectType  String
  subjectEmail String
  status       ErasureStatus @default(PENDING)
  requestedAt  DateTime      @default(now())
  completedAt  DateTime?
  affectedEntities Json      @default("[]")
  notes        String?
  @@index([tenantId, subjectEmail])
}

enum ErasureStatus {
  PENDING IN_PROGRESS COMPLETED FAILED REJECTED
}

model ImmutableAuditLog {
  id         String   @id @default(cuid())
  tenantId   String
  userId     String?
  action     String
  resource   String
  resourceId String?
  oldValue   Json?
  newValue   Json?
  ipAddress  String?
  userAgent  String?
  hash       String
  prevHash   String?
  createdAt  DateTime @default(now())
  @@index([tenantId])
  @@index([tenantId, resource, resourceId])
  @@index([tenantId, createdAt])
}
```

---

## 32. TypeScript Shared Types (`packages/shared-types/src/index.ts`)

```typescript
// ─── Tenant & Auth ─────────────────────────────────────────────────────────

export interface TenantContext {
  tenantId: string;
  userId: string;
  email: string;
  roles: string[];
  permissions: string[];
  plan: string;
}

export interface JwtPayload {
  sub: string;
  tenantId: string;
  email: string;
  roles: string[];
  iat: number;
  exp: number;
}

// ─── Pagination ─────────────────────────────────────────────────────────────

export interface PaginationInput {
  page?: number;
  limit?: number;
  cursor?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface CursorPaginatedResult<T> {
  data: T[];
  nextCursor: string | null;
  prevCursor: string | null;
  hasMore: boolean;
}

// ─── API Responses ──────────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ─── Kafka Events ───────────────────────────────────────────────────────────

export interface KafkaEventBase {
  eventId: string;
  tenantId: string;
  timestamp: string;
  version: number;
  source: string;
  correlationId?: string;
}

export interface LeadCreatedEvent extends KafkaEventBase {
  type: 'lead.created';
  payload: {
    leadId: string;
    ownerId: string;
    email?: string;
    source: string;
  };
}

export interface DealCreatedEvent extends KafkaEventBase {
  type: 'deal.created';
  payload: {
    dealId: string;
    ownerId: string;
    accountId: string;
    amount: number;
    currency: string;
    pipelineId: string;
    stageId: string;
  };
}

export interface DealStageChangedEvent extends KafkaEventBase {
  type: 'deal.stage_changed';
  payload: {
    dealId: string;
    previousStageId: string;
    newStageId: string;
    ownerId: string;
    amount: number;
  };
}

export interface DealWonEvent extends KafkaEventBase {
  type: 'deal.won';
  payload: {
    dealId: string;
    ownerId: string;
    accountId: string;
    amount: number;
    currency: string;
  };
}

export interface DealLostEvent extends KafkaEventBase {
  type: 'deal.lost';
  payload: {
    dealId: string;
    ownerId: string;
    reason: string;
    amount: number;
  };
}

export interface ContactCreatedEvent extends KafkaEventBase {
  type: 'contact.created';
  payload: { contactId: string; email?: string; accountId?: string };
}

export interface ActivityCompletedEvent extends KafkaEventBase {
  type: 'activity.completed';
  payload: {
    activityId: string;
    type: string;
    ownerId: string;
    dealId?: string;
    contactId?: string;
    outcome?: string;
  };
}

export interface QuoteAcceptedEvent extends KafkaEventBase {
  type: 'quote.accepted';
  payload: {
    quoteId: string;
    dealId: string;
    total: number;
    currency: string;
  };
}

export interface InvoiceCreatedEvent extends KafkaEventBase {
  type: 'invoice.created';
  payload: { invoiceId: string; accountId: string; total: number; dueDate: string };
}

export interface InvoicePaidEvent extends KafkaEventBase {
  type: 'invoice.paid';
  payload: { invoiceId: string; accountId: string; amount: number };
}

export interface SubscriptionCreatedEvent extends KafkaEventBase {
  type: 'subscription.created';
  payload: { subscriptionId: string; accountId: string; mrr: number };
}

export interface SubscriptionCancelledEvent extends KafkaEventBase {
  type: 'subscription.cancelled';
  payload: { subscriptionId: string; accountId: string; mrr: number; reason?: string };
}

export type NexusKafkaEvent =
  | LeadCreatedEvent
  | DealCreatedEvent
  | DealStageChangedEvent
  | DealWonEvent
  | DealLostEvent
  | ContactCreatedEvent
  | ActivityCompletedEvent
  | QuoteAcceptedEvent
  | InvoiceCreatedEvent
  | InvoicePaidEvent
  | SubscriptionCreatedEvent
  | SubscriptionCancelledEvent;

// ─── CRM Domain Types ────────────────────────────────────────────────────────

export type LeadStatus = 'NEW' | 'ASSIGNED' | 'WORKING' | 'QUALIFIED' | 'UNQUALIFIED' | 'CONVERTED';
export type DealStatus = 'OPEN' | 'WON' | 'LOST' | 'DORMANT';
export type ForecastCategory = 'PIPELINE' | 'BEST_CASE' | 'COMMIT' | 'CLOSED' | 'OMITTED';
export type ActivityType = 'CALL' | 'EMAIL' | 'MEETING' | 'TASK' | 'DEMO' | 'LUNCH' | 'NOTE';

export interface MeddicicData {
  metrics: { score: number; notes: string };
  economicBuyer: { identified: boolean; name?: string; notes: string };
  decisionCriteria: { score: number; notes: string };
  decisionProcess: { score: number; notes: string };
  paperProcess: { score: number; notes: string };
  identifyPain: { score: number; notes: string };
  champion: { identified: boolean; name?: string; notes: string };
  competition: { identified: boolean; competitors: string[]; notes: string };
  totalScore: number;
}

export interface CpqLineItem {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  listPrice: number;
  unitPrice: number;
  discountPercent: number;
  discountAmount: number;
  total: number;
  billingType: string;
  notes?: string;
}

export interface CpqPricingRequest {
  tenantId: string;
  dealId?: string;
  accountId: string;
  items: Array<{ productId: string; quantity: number }>;
  appliedPromos?: string[];
  paymentTerms?: string;
  currency: string;
}

export interface CpqPricingResult {
  items: CpqLineItem[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  appliedRules: string[];
  floorPriceWarnings: string[];
  approvalRequired: boolean;
  approvalReasons: string[];
}

// ─── Commission Types ─────────────────────────────────────────────────────────

export interface CommissionRule {
  id: string;
  name: string;
  type: 'PERCENTAGE' | 'FLAT' | 'TIERED';
  rate?: number;
  flatAmount?: number;
  tiers?: Array<{ minAmount: number; maxAmount?: number; rate: number }>;
  conditions: Array<{ field: string; operator: string; value: unknown }>;
  priority: number;
}

export interface CommissionAccelerator {
  id: string;
  name: string;
  minQuotaPercent: number;
  maxQuotaPercent?: number;
  multiplier: number;
}

export interface CommissionCalculationResult {
  userId: string;
  period: string;
  baseAmount: number;
  rate: number;
  baseCommission: number;
  multiplier: number;
  finalCommission: number;
  appliedRules: string[];
  acceleratorApplied?: string;
  spiffs: Array<{ name: string; amount: number }>;
  totalSpiffs: number;
  grandTotal: number;
}

// ─── Analytics / ClickHouse Types ────────────────────────────────────────────

export interface PipelineMetrics {
  pipelineId: string;
  totalDeals: number;
  totalValue: number;
  avgDealSize: number;
  avgCycleLength: number;
  winRate: number;
  byStage: Array<{
    stageId: string;
    stageName: string;
    dealCount: number;
    totalValue: number;
    conversionRate: number;
  }>;
}

export interface ForecastData {
  period: string;
  commit: number;
  bestCase: number;
  pipeline: number;
  aiPredicted: number;
  closed: number;
  quota: number;
  byRep: Array<{
    userId: string;
    name: string;
    commit: number;
    bestCase: number;
    quota: number;
    attainment: number;
  }>;
}

export interface RevenueMetrics {
  mrr: number;
  arr: number;
  mrrGrowth: number;
  newMrr: number;
  expansionMrr: number;
  contractionMrr: number;
  churnMrr: number;
  netMrrMovement: number;
  ltv: number;
  cac: number;
  nrr: number;
}
```

---

## 33. Zod Validation Schemas (`packages/validation/src/index.ts`)

```typescript
import { z } from 'zod';

// ─── Common ──────────────────────────────────────────────────────────────────

export const PaginationSchema = z.object({
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export const IdParamSchema = z.object({ id: z.string().cuid() });

// ─── Lead ────────────────────────────────────────────────────────────────────

export const CreateLeadSchema = z.object({
  firstName:    z.string().min(1).max(100),
  lastName:     z.string().min(1).max(100),
  email:        z.string().email().optional(),
  phone:        z.string().max(30).optional(),
  company:      z.string().max(200).optional(),
  jobTitle:     z.string().max(100).optional(),
  source:       z.enum(['MANUAL','IMPORT','WEB_FORM','EMAIL_CAMPAIGN','SOCIAL_MEDIA',
                         'PAID_ADS','REFERRAL','PARTNER','CHAT','EVENT','OTHER']).default('MANUAL'),
  industry:     z.string().optional(),
  website:      z.string().url().optional().or(z.literal('')),
  annualRevenue: z.number().min(0).optional(),
  employeeCount: z.number().int().min(0).optional(),
  country:      z.string().length(2).optional(),
  city:         z.string().optional(),
  ownerId:      z.string().cuid(),
  customFields: z.record(z.unknown()).default({}),
  tags:         z.array(z.string()).default([]),
});

export const UpdateLeadSchema = CreateLeadSchema.partial().extend({
  status: z.enum(['NEW','ASSIGNED','WORKING','QUALIFIED','UNQUALIFIED','CONVERTED']).optional(),
  rating: z.enum(['HOT','WARM','COLD']).optional(),
  score:  z.number().int().min(0).max(100).optional(),
});

// ─── Contact ─────────────────────────────────────────────────────────────────

export const CreateContactSchema = z.object({
  firstName:    z.string().min(1).max(100),
  lastName:     z.string().min(1).max(100),
  email:        z.string().email().optional(),
  phone:        z.string().max(30).optional(),
  mobile:       z.string().max(30).optional(),
  jobTitle:     z.string().max(100).optional(),
  department:   z.string().max(100).optional(),
  accountId:    z.string().cuid().optional(),
  ownerId:      z.string().cuid(),
  country:      z.string().length(2).optional(),
  city:         z.string().optional(),
  timezone:     z.string().optional(),
  linkedInUrl:  z.string().url().optional().or(z.literal('')),
  doNotEmail:   z.boolean().default(false),
  doNotCall:    z.boolean().default(false),
  gdprConsent:  z.boolean().default(false),
  customFields: z.record(z.unknown()).default({}),
  tags:         z.array(z.string()).default([]),
});

export const UpdateContactSchema = CreateContactSchema.partial();

// ─── Account ─────────────────────────────────────────────────────────────────

export const CreateAccountSchema = z.object({
  name:          z.string().min(1).max(200),
  website:       z.string().url().optional().or(z.literal('')),
  phone:         z.string().max(30).optional(),
  email:         z.string().email().optional(),
  industry:      z.string().optional(),
  type:          z.enum(['PROSPECT','CUSTOMER','PARTNER','COMPETITOR','RESELLER','OTHER']).default('PROSPECT'),
  tier:          z.enum(['STRATEGIC','ENTERPRISE','MID_MARKET','SMB']).default('SMB'),
  annualRevenue: z.number().min(0).optional(),
  employeeCount: z.number().int().min(0).optional(),
  country:       z.string().length(2).optional(),
  city:          z.string().optional(),
  address:       z.string().optional(),
  ownerId:       z.string().cuid(),
  parentAccountId: z.string().cuid().optional(),
  customFields:  z.record(z.unknown()).default({}),
  tags:          z.array(z.string()).default([]),
});

export const UpdateAccountSchema = CreateAccountSchema.partial();

// ─── Deal ─────────────────────────────────────────────────────────────────────

export const CreateDealSchema = z.object({
  name:              z.string().min(1).max(200),
  accountId:         z.string().cuid(),
  pipelineId:        z.string().cuid(),
  stageId:           z.string().cuid(),
  ownerId:           z.string().cuid(),
  amount:            z.number().min(0).default(0),
  currency:          z.string().length(3).default('USD'),
  probability:       z.number().int().min(0).max(100).optional(),
  expectedCloseDate: z.string().datetime().optional(),
  source:            z.string().optional(),
  campaignId:        z.string().cuid().optional(),
  contactIds:        z.array(z.string().cuid()).default([]),
  customFields:      z.record(z.unknown()).default({}),
  tags:              z.array(z.string()).default([]),
});

export const UpdateDealSchema = CreateDealSchema.partial().extend({
  status:          z.enum(['OPEN','WON','LOST','DORMANT']).optional(),
  lostReason:      z.string().optional(),
  forecastCategory: z.enum(['PIPELINE','BEST_CASE','COMMIT','CLOSED','OMITTED']).optional(),
  meddicicData:    z.record(z.unknown()).optional(),
});

// ─── Quote ────────────────────────────────────────────────────────────────────

export const CpqLineItemSchema = z.object({
  productId:      z.string().cuid(),
  quantity:       z.number().int().min(1),
  unitPrice:      z.number().min(0).optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  notes:          z.string().optional(),
});

export const CreateQuoteSchema = z.object({
  dealId:     z.string().cuid(),
  name:       z.string().min(1).max(200),
  validUntil: z.string().datetime().optional(),
  currency:   z.string().length(3).default('USD'),
  lineItems:  z.array(CpqLineItemSchema).min(1),
  terms:      z.string().optional(),
  notes:      z.string().optional(),
});

// ─── Activity ─────────────────────────────────────────────────────────────────

export const CreateActivitySchema = z.object({
  type:        z.enum(['CALL','EMAIL','MEETING','TASK','DEMO','LUNCH','CONFERENCE',
                        'FOLLOW_UP','PROPOSAL','NEGOTIATION','NOTE']),
  subject:     z.string().min(1).max(300),
  description: z.string().optional(),
  dueDate:     z.string().datetime().optional(),
  duration:    z.number().int().min(0).optional(),
  ownerId:     z.string().cuid(),
  leadId:      z.string().cuid().optional(),
  contactId:   z.string().cuid().optional(),
  accountId:   z.string().cuid().optional(),
  dealId:      z.string().cuid().optional(),
  customFields: z.record(z.unknown()).default({}),
});

// ─── Finance ──────────────────────────────────────────────────────────────────

export const CreateProductSchema = z.object({
  sku:          z.string().min(1).max(100),
  name:         z.string().min(1).max(200),
  description:  z.string().optional(),
  type:         z.enum(['PHYSICAL','SERVICE','DIGITAL','BUNDLE','SUBSCRIPTION']),
  listPrice:    z.number().min(0),
  cost:         z.number().min(0).optional(),
  currency:     z.string().length(3).default('USD'),
  billingType:  z.enum(['ONE_TIME','RECURRING','USAGE','MILESTONE']).default('ONE_TIME'),
  billingPeriod: z.string().optional(),
  taxable:      z.boolean().default(true),
  taxCode:      z.string().optional(),
  category:     z.string().optional(),
});

export const CreateInvoiceSchema = z.object({
  accountId:     z.string().cuid(),
  subscriptionId: z.string().cuid().optional(),
  contractId:    z.string().cuid().optional(),
  currency:      z.string().length(3).default('USD'),
  dueDate:       z.string().datetime().optional(),
  lineItems:     z.array(z.object({
    productId:  z.string().cuid(),
    description: z.string().optional(),
    quantity:   z.number().min(0),
    unitPrice:  z.number().min(0),
    taxRate:    z.number().min(0).max(100).default(0),
  })).min(1),
  notes:         z.string().optional(),
});

// ─── Workflow ─────────────────────────────────────────────────────────────────

export const WorkflowTriggerSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('ENTITY_CREATED'),
    entity: z.enum(['LEAD','CONTACT','DEAL','ACCOUNT','ACTIVITY']),
    conditions: z.array(z.record(z.unknown())).default([]),
  }),
  z.object({
    type: z.literal('ENTITY_UPDATED'),
    entity: z.enum(['LEAD','CONTACT','DEAL','ACCOUNT','ACTIVITY']),
    fields: z.array(z.string()).default([]),
    conditions: z.array(z.record(z.unknown())).default([]),
  }),
  z.object({
    type: z.literal('SCHEDULE'),
    cron: z.string(),
    timezone: z.string().default('UTC'),
  }),
  z.object({
    type: z.literal('WEBHOOK'),
    path: z.string(),
  }),
  z.object({
    type: z.literal('MANUAL'),
    entity: z.enum(['LEAD','CONTACT','DEAL','ACCOUNT']).optional(),
  }),
]);

export const CreateWorkflowSchema = z.object({
  name:        z.string().min(1).max(200),
  description: z.string().optional(),
  trigger:     WorkflowTriggerSchema,
  nodes:       z.array(z.record(z.unknown())).default([]),
  edges:       z.array(z.record(z.unknown())).default([]),
  variables:   z.record(z.unknown()).default({}),
});

// ─── Auth / User ──────────────────────────────────────────────────────────────

export const InviteUserSchema = z.object({
  email:     z.string().email(),
  firstName: z.string().min(1).max(100),
  lastName:  z.string().min(1).max(100),
  roleIds:   z.array(z.string().cuid()).min(1),
});

export const UpdateUserSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName:  z.string().min(1).max(100).optional(),
  phone:     z.string().max(30).optional(),
  timezone:  z.string().optional(),
  locale:    z.string().optional(),
  avatarUrl: z.string().url().optional(),
});

export const CreateRoleSchema = z.object({
  name:        z.string().min(1).max(100),
  description: z.string().optional(),
  permissions: z.array(z.string()),
});

// Type inference exports
export type CreateLeadInput      = z.infer<typeof CreateLeadSchema>;
export type UpdateLeadInput      = z.infer<typeof UpdateLeadSchema>;
export type CreateContactInput   = z.infer<typeof CreateContactSchema>;
export type UpdateContactInput   = z.infer<typeof UpdateContactSchema>;
export type CreateAccountInput   = z.infer<typeof CreateAccountSchema>;
export type UpdateAccountInput   = z.infer<typeof UpdateAccountSchema>;
export type CreateDealInput      = z.infer<typeof CreateDealSchema>;
export type UpdateDealInput      = z.infer<typeof UpdateDealSchema>;
export type CreateQuoteInput     = z.infer<typeof CreateQuoteSchema>;
export type CreateActivityInput  = z.infer<typeof CreateActivitySchema>;
export type CreateProductInput   = z.infer<typeof CreateProductSchema>;
export type CreateInvoiceInput   = z.infer<typeof CreateInvoiceSchema>;
export type CreateWorkflowInput  = z.infer<typeof CreateWorkflowSchema>;
export type InviteUserInput      = z.infer<typeof InviteUserSchema>;
export type PaginationInput      = z.infer<typeof PaginationSchema>;
```


---

## 34. Complete REST Endpoints — All Services

### 34.1 Auth Service (port 3010) — `/api/v1/auth`

```
POST   /api/v1/auth/login                    # Exchange Keycloak token
POST   /api/v1/auth/refresh                  # Refresh access token
POST   /api/v1/auth/logout                   # Revoke session
POST   /api/v1/auth/forgot-password          # Trigger reset email
POST   /api/v1/auth/reset-password           # Complete reset

GET    /api/v1/users                         # List users (paginated)
GET    /api/v1/users/:id                     # Get user
POST   /api/v1/users/invite                  # Invite new user
PATCH  /api/v1/users/:id                     # Update user profile
DELETE /api/v1/users/:id                     # Deactivate user
PATCH  /api/v1/users/:id/roles               # Assign roles
GET    /api/v1/users/:id/permissions         # Get resolved permissions

GET    /api/v1/roles                         # List roles
POST   /api/v1/roles                         # Create role
GET    /api/v1/roles/:id                     # Get role
PATCH  /api/v1/roles/:id                     # Update role
DELETE /api/v1/roles/:id                     # Delete role
GET    /api/v1/roles/permissions/matrix      # All available permissions

GET    /api/v1/api-keys                      # List API keys
POST   /api/v1/api-keys                      # Create API key → returns key ONCE
DELETE /api/v1/api-keys/:id                  # Revoke API key

GET    /api/v1/audit-logs                    # List audit logs (filter/paginate)
GET    /api/v1/audit-logs/:id                # Get single log entry

GET    /api/v1/tenants/me                    # Current tenant info
PATCH  /api/v1/tenants/me                    # Update tenant settings

GET    /health                               # Liveness probe
GET    /ready                                # Readiness probe
GET    /metrics                              # Prometheus metrics
```

### 34.2 CRM Service (port 3001) — `/api/v1`

```
# ── Leads ────────────────────────────────────────────────────────────────
GET    /api/v1/leads                         # ?page&limit&status&ownerId&source&search
POST   /api/v1/leads                         # Create lead
GET    /api/v1/leads/:id                     # Get lead detail
PATCH  /api/v1/leads/:id                     # Update lead
DELETE /api/v1/leads/:id                     # Soft-delete lead
POST   /api/v1/leads/:id/convert             # Convert to Contact+Account+Deal
POST   /api/v1/leads/import                  # Bulk import CSV
GET    /api/v1/leads/:id/timeline            # Activity timeline
PATCH  /api/v1/leads/:id/assign              # Reassign lead

# ── Contacts ─────────────────────────────────────────────────────────────
GET    /api/v1/contacts                      # ?page&limit&accountId&ownerId&search
POST   /api/v1/contacts                      # Create contact
GET    /api/v1/contacts/:id                  # Get contact detail + relationships
PATCH  /api/v1/contacts/:id                  # Update contact
DELETE /api/v1/contacts/:id                  # Soft-delete
POST   /api/v1/contacts/import               # Bulk import
GET    /api/v1/contacts/:id/timeline         # Activity timeline
GET    /api/v1/contacts/:id/deals            # All deals linked to contact
PATCH  /api/v1/contacts/:id/gdpr             # Update GDPR consent

# ── Accounts ─────────────────────────────────────────────────────────────
GET    /api/v1/accounts                      # ?page&limit&type&tier&ownerId&search
POST   /api/v1/accounts                      # Create account
GET    /api/v1/accounts/:id                  # Account detail + 360 view
PATCH  /api/v1/accounts/:id                  # Update account
DELETE /api/v1/accounts/:id                  # Soft-delete
GET    /api/v1/accounts/:id/contacts         # Account contacts
GET    /api/v1/accounts/:id/deals            # Account deals
GET    /api/v1/accounts/:id/timeline         # Unified timeline
GET    /api/v1/accounts/:id/health           # Health score breakdown
POST   /api/v1/accounts/import               # Bulk import

# ── Deals ─────────────────────────────────────────────────────────────────
GET    /api/v1/deals                         # ?page&limit&pipelineId&stageId&ownerId&status
POST   /api/v1/deals                         # Create deal
GET    /api/v1/deals/:id                     # Deal detail + enrichment
PATCH  /api/v1/deals/:id                     # Update deal fields
DELETE /api/v1/deals/:id                     # Soft-delete
POST   /api/v1/deals/:id/won                 # Mark won
POST   /api/v1/deals/:id/lost                # Mark lost (body: reason)
PATCH  /api/v1/deals/:id/stage               # Move to stage (body: stageId)
PATCH  /api/v1/deals/:id/meddic              # Update MEDDIC data
GET    /api/v1/deals/:id/timeline            # Chronological event history
GET    /api/v1/deals/:id/contacts            # Deal stakeholders
POST   /api/v1/deals/:id/contacts            # Add contact to deal
DELETE /api/v1/deals/:id/contacts/:contactId # Remove contact
GET    /api/v1/deals/:id/quotes              # Deal quotes
GET    /api/v1/deals/:id/ai-insights         # AI win probability + recommendations

# ── Pipelines ─────────────────────────────────────────────────────────────
GET    /api/v1/pipelines                     # List pipelines
POST   /api/v1/pipelines                     # Create pipeline
GET    /api/v1/pipelines/:id                 # Get pipeline + stages
PATCH  /api/v1/pipelines/:id                 # Update pipeline
DELETE /api/v1/pipelines/:id                 # Delete (must have no deals)
POST   /api/v1/pipelines/:id/stages          # Add stage
PATCH  /api/v1/pipelines/:id/stages/:stageId # Update stage
DELETE /api/v1/pipelines/:id/stages/:stageId # Remove stage
POST   /api/v1/pipelines/:id/stages/reorder  # Reorder stages

# ── Activities ────────────────────────────────────────────────────────────
GET    /api/v1/activities                    # ?type&status&dueDate&ownerId&dealId
POST   /api/v1/activities                    # Create activity
GET    /api/v1/activities/:id                # Get activity
PATCH  /api/v1/activities/:id                # Update activity
DELETE /api/v1/activities/:id                # Delete
POST   /api/v1/activities/:id/complete       # Mark completed (body: outcome)
GET    /api/v1/activities/my/upcoming        # Current user's upcoming activities

# ── Notes ─────────────────────────────────────────────────────────────────
GET    /api/v1/notes                         # ?leadId&contactId&accountId&dealId
POST   /api/v1/notes                         # Create note
PATCH  /api/v1/notes/:id                     # Edit note
DELETE /api/v1/notes/:id                     # Delete note
PATCH  /api/v1/notes/:id/pin                 # Toggle pin

# ── Quotes (CPQ) ──────────────────────────────────────────────────────────
GET    /api/v1/quotes                        # ?dealId&status
POST   /api/v1/quotes                        # Create quote (triggers CPQ pricing)
GET    /api/v1/quotes/:id                    # Quote detail + line items
PATCH  /api/v1/quotes/:id                    # Update quote
DELETE /api/v1/quotes/:id                    # Delete draft
POST   /api/v1/quotes/:id/send               # Send to contact email
POST   /api/v1/quotes/:id/approve            # Manager approval
POST   /api/v1/quotes/:id/accept             # Customer acceptance
GET    /api/v1/quotes/:id/pdf                # Generate PDF
POST   /api/v1/quotes/price                  # CPQ price-only (no quote created)

# ── Custom Fields ─────────────────────────────────────────────────────────
GET    /api/v1/custom-fields/:entity         # List custom fields for entity
POST   /api/v1/custom-fields/:entity         # Add custom field definition
PATCH  /api/v1/custom-fields/:entity/:id     # Update field definition
DELETE /api/v1/custom-fields/:entity/:id     # Remove field
```

### 34.3 Finance Service (port 3002) — `/api/v1`

```
# ── Products & Catalog ────────────────────────────────────────────────────
GET    /api/v1/products                      # ?category&type&isActive
POST   /api/v1/products                      # Create product
GET    /api/v1/products/:id                  # Product detail + price tiers
PATCH  /api/v1/products/:id                  # Update product
DELETE /api/v1/products/:id                  # Deactivate
POST   /api/v1/products/:id/price-tiers      # Add price tier
DELETE /api/v1/products/:id/price-tiers/:tierId

# ── Contracts ─────────────────────────────────────────────────────────────
GET    /api/v1/contracts                     # ?accountId&status
POST   /api/v1/contracts                     # Create contract
GET    /api/v1/contracts/:id                 # Contract detail
PATCH  /api/v1/contracts/:id                 # Update contract
DELETE /api/v1/contracts/:id                 # Delete draft
POST   /api/v1/contracts/:id/send-for-signature
POST   /api/v1/contracts/:id/sign            # Record signature
POST   /api/v1/contracts/:id/activate
POST   /api/v1/contracts/:id/terminate       # body: reason
GET    /api/v1/contracts/:id/pdf             # Generate contract PDF

# ── Subscriptions ─────────────────────────────────────────────────────────
GET    /api/v1/subscriptions                 # ?accountId&status&billingPeriod
POST   /api/v1/subscriptions                 # Create subscription
GET    /api/v1/subscriptions/:id             # Detail + MRR/ARR
PATCH  /api/v1/subscriptions/:id             # Update plan/quantity
POST   /api/v1/subscriptions/:id/pause
POST   /api/v1/subscriptions/:id/resume
POST   /api/v1/subscriptions/:id/cancel      # body: reason, effectiveDate
POST   /api/v1/subscriptions/:id/usage       # Record usage metric

# ── Invoices ──────────────────────────────────────────────────────────────
GET    /api/v1/invoices                      # ?accountId&status&from&to
POST   /api/v1/invoices                      # Create manual invoice
GET    /api/v1/invoices/:id                  # Invoice detail
PATCH  /api/v1/invoices/:id                  # Update draft
POST   /api/v1/invoices/:id/send             # Email to account
POST   /api/v1/invoices/:id/void             # Void invoice
GET    /api/v1/invoices/:id/pdf              # Generate PDF
POST   /api/v1/invoices/:id/payments         # Record payment
GET    /api/v1/invoices/overdue              # Overdue invoices for dunning

# ── Payments ──────────────────────────────────────────────────────────────
GET    /api/v1/payments                      # ?invoiceId&method&status
POST   /api/v1/payments                      # Record payment
POST   /api/v1/payments/:id/refund           # Process refund

# ── Commission ────────────────────────────────────────────────────────────
GET    /api/v1/commission-plans              # List plans
POST   /api/v1/commission-plans             # Create plan
GET    /api/v1/commission-plans/:id          # Plan detail + rules
PATCH  /api/v1/commission-plans/:id          # Update plan
POST   /api/v1/commission-plans/:id/assign   # Assign to user(s)
POST   /api/v1/commission-plans/:id/calculate # Calculate commission preview

GET    /api/v1/commissions                   # ?userId&period&status
GET    /api/v1/commissions/statement/:userId # Commission statement for period
POST   /api/v1/commissions/:id/approve       # Approve commission record
POST   /api/v1/commissions/:id/pay           # Mark as paid
POST   /api/v1/commissions/clawback          # Process clawback

# ── Revenue Analytics ─────────────────────────────────────────────────────
GET    /api/v1/revenue/mrr                   # MRR breakdown ?from&to
GET    /api/v1/revenue/arr                   # ARR ?accountId
GET    /api/v1/revenue/forecast              # Revenue forecast ?period
GET    /api/v1/revenue/cohorts               # Cohort analysis
GET    /api/v1/revenue/churn                 # Churn metrics ?from&to
GET    /api/v1/revenue/ltv                   # LTV by cohort
```

### 34.4 AI Service (port 3003) — `/api/v1/ai`

```
POST   /api/v1/ai/lead/score                 # Score single lead
POST   /api/v1/ai/leads/score-batch          # Batch score leads
POST   /api/v1/ai/deal/win-probability       # Win probability for deal
POST   /api/v1/ai/deal/insights              # AI deal insights + recommendations
POST   /api/v1/ai/deal/next-best-action      # Recommended next action

POST   /api/v1/ai/call/transcribe            # Transcribe audio file → job
GET    /api/v1/ai/call/transcribe/:jobId     # Poll transcription job status
POST   /api/v1/ai/call/analyze               # Analyze call recording
POST   /api/v1/ai/email/summarize            # Summarize email thread
POST   /api/v1/ai/email/compose              # AI-assisted email composition

POST   /api/v1/ai/forecast/generate          # Generate revenue forecast
POST   /api/v1/ai/churn/predict              # Churn risk prediction
POST   /api/v1/ai/account/health             # AI health score

POST   /api/v1/ai/chat                       # General AI chat (deal coaching)
POST   /api/v1/ai/search                     # Natural language search
```

### 34.5 Comms Service (port 3004) — `/api/v1`

```
# ── Email Accounts ────────────────────────────────────────────────────────
GET    /api/v1/email-accounts                # List connected email accounts
POST   /api/v1/email-accounts/connect        # Start OAuth flow
DELETE /api/v1/email-accounts/:id            # Disconnect account
POST   /api/v1/email-accounts/:id/sync       # Force sync

# ── Emails ────────────────────────────────────────────────────────────────
GET    /api/v1/emails                        # ?accountId&contactId&dealId&search
GET    /api/v1/emails/:id                    # Email detail
POST   /api/v1/emails/send                   # Send email
POST   /api/v1/emails/:id/reply              # Reply to email
POST   /api/v1/emails/:id/forward            # Forward
PATCH  /api/v1/emails/:id/read               # Mark read/unread

# ── Email Templates ───────────────────────────────────────────────────────
GET    /api/v1/email-templates               # ?category
POST   /api/v1/email-templates               # Create template
GET    /api/v1/email-templates/:id           # Get template
PATCH  /api/v1/email-templates/:id           # Update template
DELETE /api/v1/email-templates/:id           # Delete template
POST   /api/v1/email-templates/:id/preview   # Preview with variables

# ── Calls (VoIP) ──────────────────────────────────────────────────────────
POST   /api/v1/calls/initiate                # Initiate outbound call
GET    /api/v1/calls                         # ?userId&contactId&dealId
GET    /api/v1/calls/:id                     # Call record + transcript
GET    /api/v1/calls/:id/recording           # Get signed recording URL
POST   /api/v1/calls/:id/transcript/correct  # Human correction to transcript

# ── Conversations (Chat / WhatsApp / SMS) ─────────────────────────────────
GET    /api/v1/conversations                 # ?channel&status&assignedTo
POST   /api/v1/conversations                 # Create conversation
GET    /api/v1/conversations/:id             # Conversation + messages
POST   /api/v1/conversations/:id/messages    # Send message in conversation
PATCH  /api/v1/conversations/:id/assign      # Reassign
POST   /api/v1/conversations/:id/close       # Close conversation
POST   /api/v1/conversations/:id/transfer    # Transfer to agent/team

# ── Webhooks (inbound channels) ───────────────────────────────────────────
POST   /webhooks/whatsapp                    # WhatsApp webhook
POST   /webhooks/telegram                    # Telegram webhook
POST   /webhooks/twilio                      # Twilio SMS/Voice
POST   /webhooks/sendgrid                    # SendGrid events
```

### 34.6 Workflow Engine (port 3005) — `/api/v1`

```
GET    /api/v1/workflows                     # ?isActive&search
POST   /api/v1/workflows                     # Create workflow
GET    /api/v1/workflows/:id                 # Workflow detail + nodes
PATCH  /api/v1/workflows/:id                 # Update workflow
DELETE /api/v1/workflows/:id                 # Delete workflow
POST   /api/v1/workflows/:id/activate        # Enable workflow
POST   /api/v1/workflows/:id/deactivate      # Disable workflow
POST   /api/v1/workflows/:id/test            # Test with sample data
POST   /api/v1/workflows/:id/execute         # Manual trigger

GET    /api/v1/workflows/:id/executions      # Execution history
GET    /api/v1/executions/:id                # Execution detail + logs
POST   /api/v1/executions/:id/cancel         # Cancel running execution

GET    /api/v1/blueprints                    # ?entityType
POST   /api/v1/blueprints                    # Create blueprint
GET    /api/v1/blueprints/:id                # Blueprint detail
PATCH  /api/v1/blueprints/:id                # Update blueprint
POST   /api/v1/blueprints/:id/activate
GET    /api/v1/blueprints/:id/instances      # All entity instances
GET    /api/v1/blueprints/instances/:id      # Single blueprint instance
POST   /api/v1/blueprints/instances/:id/transition # Trigger state transition

GET    /api/v1/sequences                     # ?isActive
POST   /api/v1/sequences                     # Create sequence
GET    /api/v1/sequences/:id                 # Sequence + steps
PATCH  /api/v1/sequences/:id                 # Update sequence
POST   /api/v1/sequences/:id/enroll          # Enroll contact(s)
POST   /api/v1/sequences/enrollments/:id/unenroll
```

### 34.7 Analytics Service (port 3006) — `/api/v1/analytics`

```
GET    /api/v1/analytics/pipeline            # Pipeline metrics ?pipelineId&from&to
GET    /api/v1/analytics/forecast            # Forecast data ?period&userId
GET    /api/v1/analytics/activities          # Activity report ?from&to&type
GET    /api/v1/analytics/leaderboard         # Sales leaderboard ?period
GET    /api/v1/analytics/win-loss            # Win/loss analysis ?from&to
GET    /api/v1/analytics/conversion          # Conversion rates by stage
GET    /api/v1/analytics/velocity            # Deal velocity ?pipelineId
GET    /api/v1/analytics/revenue             # Revenue metrics ?from&to
GET    /api/v1/analytics/cohorts             # Cohort retention ?from&to
GET    /api/v1/analytics/goals               # Goal tracking ?userId&period

POST   /api/v1/analytics/reports             # Create custom report
GET    /api/v1/analytics/reports             # List saved reports
GET    /api/v1/analytics/reports/:id/run     # Run report
GET    /api/v1/analytics/reports/:id/export  # Export to CSV/XLSX

GET    /api/v1/analytics/wallboard           # Wallboard metrics (real-time)
GET    /api/v1/analytics/wallboard/config    # Wallboard configuration
PATCH  /api/v1/analytics/wallboard/config    # Update config
```

### 34.8 Search Service (port 3008) — `/api/v1/search`

```
GET    /api/v1/search                        # ?q&entities&page&limit (global search)
GET    /api/v1/search/leads                  # ?q (+ all filters)
GET    /api/v1/search/contacts               # ?q (+ all filters)
GET    /api/v1/search/accounts               # ?q (+ all filters)
GET    /api/v1/search/deals                  # ?q (+ all filters)
POST   /api/v1/search/index/:entity          # Admin: trigger re-index
GET    /api/v1/search/suggest                # Autocomplete suggestions ?q&entity
```

### 34.9 Storage Service (port 3009) — `/api/v1/storage`

```
POST   /api/v1/storage/upload                # Upload file (multipart/form-data)
POST   /api/v1/storage/upload/url            # Get presigned upload URL
GET    /api/v1/storage/files                 # ?entityType&entityId&category
GET    /api/v1/storage/files/:id             # File metadata
GET    /api/v1/storage/files/:id/download    # Get signed download URL
DELETE /api/v1/storage/files/:id             # Delete file
PATCH  /api/v1/storage/files/:id             # Rename/re-categorize
```

### 34.10 Notification Service (port 3011) — `/api/v1`

```
GET    /api/v1/notifications                 # ?isRead&page&limit
PATCH  /api/v1/notifications/:id/read        # Mark single read
POST   /api/v1/notifications/read-all        # Mark all read
DELETE /api/v1/notifications/:id             # Delete notification
GET    /api/v1/notifications/preferences     # Get delivery preferences
PATCH  /api/v1/notifications/preferences     # Update preferences
POST   /api/v1/notifications/push/register   # Register push token
DELETE /api/v1/notifications/push/:tokenId   # Unregister push token
```

---

## 35. Fastify Service Bootstrap (`packages/service-utils/src/server.ts`)

```typescript
import Fastify, { FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyMultipart from '@fastify/multipart';
import { fastifyRequestContext } from '@fastify/request-context';
import { register as promRegister } from 'prom-client';
import pino from 'pino';

export interface ServiceConfig {
  name: string;
  port: number;
  jwtSecret: string;
  corsOrigins: string[];
  rateLimitMax?: number;
  rateLimitWindow?: number;
  enableMultipart?: boolean;
}

export async function createService(config: ServiceConfig): Promise<FastifyInstance> {
  const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  });

  const app = Fastify({
    logger,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
    trustProxy: true,
    genReqId: () => crypto.randomUUID(),
  });

  // ── Plugins ──────────────────────────────────────────────────────────────

  await app.register(fastifyHelmet, {
    contentSecurityPolicy: process.env.NODE_ENV === 'production',
  });

  await app.register(fastifyCors, {
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Id'],
  });

  await app.register(fastifyJwt, {
    secret: config.jwtSecret,
    sign: { algorithm: 'HS256' },
  });

  await app.register(fastifyRateLimit, {
    global: true,
    max: config.rateLimitMax ?? 200,
    timeWindow: config.rateLimitWindow ?? 60_000,
    keyGenerator: (req) => `${req.jwtPayload?.tenantId ?? 'anon'}:${req.ip}`,
  });

  if (config.enableMultipart) {
    await app.register(fastifyMultipart, {
      limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
    });
  }

  await app.register(fastifyRequestContext, {
    defaultStoreValues: () => ({ tenantId: '', userId: '', requestId: '' }),
  });

  // ── Global Hooks ─────────────────────────────────────────────────────────

  app.addHook('onRequest', async (request) => {
    request.requestContext.set('requestId', request.id);
  });

  app.addHook('preHandler', async (request, reply) => {
    // Skip auth for health/metrics endpoints
    if (request.url.startsWith('/health') || request.url.startsWith('/metrics')) return;

    try {
      await request.jwtVerify();
      const payload = request.user as import('./types').JwtPayload;
      request.requestContext.set('tenantId', payload.tenantId);
      request.requestContext.set('userId', payload.sub);
    } catch (err) {
      reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } });
    }
  });

  // ── Health Endpoints ─────────────────────────────────────────────────────

  app.get('/health', async () => ({ status: 'ok', service: config.name, ts: new Date().toISOString() }));

  app.get('/ready', async (_req, reply) => {
    const checks = await runReadinessChecks();
    const allOk = checks.every((c) => c.ok);
    reply.code(allOk ? 200 : 503).send({ status: allOk ? 'ready' : 'not ready', checks });
  });

  app.get('/metrics', async (_req, reply) => {
    reply.header('Content-Type', promRegister.contentType);
    return promRegister.metrics();
  });

  // ── Error Handler ────────────────────────────────────────────────────────

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error, requestId: request.id }, 'Request error');

    if (error.validation) {
      return reply.code(422).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: error.validation,
          requestId: request.id,
        },
      });
    }

    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 500) {
      return reply.code(500).send({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
          requestId: request.id,
        },
      });
    }

    reply.code(statusCode).send({
      success: false,
      error: {
        code: error.code ?? 'ERROR',
        message: error.message,
        requestId: request.id,
      },
    });
  });

  return app;
}

// ─── Standard entry point ─────────────────────────────────────────────────────

export async function startService(
  app: FastifyInstance,
  port: number,
  registerRoutes: (app: FastifyInstance) => Promise<void>
): Promise<void> {
  await registerRoutes(app);
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Service listening on port ${port}`);

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, async () => {
      app.log.info(`${signal} received, shutting down`);
      await app.close();
      process.exit(0);
    });
  }
}

async function runReadinessChecks(): Promise<Array<{ name: string; ok: boolean; message?: string }>> {
  // Override per service — e.g. check DB connection, Redis, Kafka
  return [{ name: 'default', ok: true }];
}
```

### 35.1 Tenant Isolation Middleware (`packages/service-utils/src/prisma-tenant.ts`)

```typescript
import { Prisma } from '@prisma/client';
import { getRequestContext } from '@fastify/request-context';

/**
 * Prisma middleware that automatically injects tenantId into all
 * create/update/findMany/findFirst/count/aggregate/delete operations.
 *
 * Usage: prisma.$use(tenantIsolationMiddleware)
 */
export const tenantIsolationMiddleware: Prisma.Middleware = async (params, next) => {
  const tenantId = getRequestContext()?.get('tenantId');
  if (!tenantId) return next(params);

  // Models that do NOT have tenantId (global tables)
  const globalModels = new Set(['Tenant', 'GlobalConfig']);
  if (globalModels.has(params.model ?? '')) return next(params);

  switch (params.action) {
    case 'create':
      params.args.data = { ...params.args.data, tenantId };
      break;

    case 'createMany':
      if (Array.isArray(params.args.data)) {
        params.args.data = params.args.data.map((d: Record<string, unknown>) => ({ ...d, tenantId }));
      }
      break;

    case 'update':
    case 'updateMany':
    case 'delete':
    case 'deleteMany':
    case 'findMany':
    case 'findFirst':
    case 'findFirstOrThrow':
    case 'count':
    case 'aggregate':
    case 'groupBy':
      params.args = params.args ?? {};
      params.args.where = { ...params.args.where, tenantId };
      break;

    case 'findUnique':
    case 'findUniqueOrThrow':
      // Convert to findFirst to allow tenantId filter
      params.action = params.action === 'findUnique' ? 'findFirst' : 'findFirstOrThrow';
      params.args.where = { ...params.args.where, tenantId };
      break;
  }

  return next(params);
};
```

### 35.2 RBAC Middleware (`packages/service-utils/src/rbac.ts`)

```typescript
import { FastifyRequest, FastifyReply } from 'fastify';

// ─── Permission Matrix ───────────────────────────────────────────────────────

export const PERMISSIONS = {
  LEADS:    { READ: 'leads:read', CREATE: 'leads:create', UPDATE: 'leads:update', DELETE: 'leads:delete', ASSIGN: 'leads:assign', CONVERT: 'leads:convert' },
  CONTACTS: { READ: 'contacts:read', CREATE: 'contacts:create', UPDATE: 'contacts:update', DELETE: 'contacts:delete' },
  ACCOUNTS: { READ: 'accounts:read', CREATE: 'accounts:create', UPDATE: 'accounts:update', DELETE: 'accounts:delete' },
  DEALS:    { READ: 'deals:read', CREATE: 'deals:create', UPDATE: 'deals:update', DELETE: 'deals:delete', WIN: 'deals:win_loss', ASSIGN: 'deals:assign' },
  QUOTES:   { READ: 'quotes:read', CREATE: 'quotes:create', UPDATE: 'quotes:update', APPROVE: 'quotes:approve', SEND: 'quotes:send' },
  ACTIVITIES: { READ: 'activities:read', CREATE: 'activities:create', UPDATE: 'activities:update', DELETE: 'activities:delete' },
  PRODUCTS: { READ: 'products:read', CREATE: 'products:create', UPDATE: 'products:update', DELETE: 'products:delete' },
  INVOICES: { READ: 'invoices:read', CREATE: 'invoices:create', UPDATE: 'invoices:update', VOID: 'invoices:void' },
  CONTRACTS:{ READ: 'contracts:read', CREATE: 'contracts:create', SIGN: 'contracts:sign' },
  SUBSCRIPTIONS: { READ: 'subscriptions:read', CREATE: 'subscriptions:create', UPDATE: 'subscriptions:update', CANCEL: 'subscriptions:cancel' },
  COMMISSION: { READ: 'commission:read', MANAGE: 'commission:manage', APPROVE: 'commission:approve' },
  WORKFLOWS:{ READ: 'workflows:read', CREATE: 'workflows:create', UPDATE: 'workflows:update', DELETE: 'workflows:delete', EXECUTE: 'workflows:execute' },
  ANALYTICS:{ READ: 'analytics:read', EXPORT: 'analytics:export' },
  USERS:    { READ: 'users:read', INVITE: 'users:invite', UPDATE: 'users:update', DELETE: 'users:delete', MANAGE_ROLES: 'users:manage_roles' },
  SETTINGS: { READ: 'settings:read', UPDATE: 'settings:update' },
  INTEGRATIONS: { READ: 'integrations:read', MANAGE: 'integrations:manage' },
} as const;

// ─── Built-in Roles ──────────────────────────────────────────────────────────

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: ['*'],
  ADMIN: [
    'users:*', 'settings:*', 'integrations:*', 'roles:*',
    'leads:*', 'contacts:*', 'accounts:*', 'deals:*', 'quotes:*',
    'activities:*', 'products:*', 'invoices:*', 'contracts:*',
    'subscriptions:*', 'commission:*', 'workflows:*', 'analytics:*',
  ],
  SALES_MANAGER: [
    'leads:*', 'contacts:*', 'accounts:*', 'deals:*', 'quotes:*',
    'activities:*', 'commission:read', 'workflows:read', 'analytics:*',
    'users:read', 'products:read',
  ],
  SALES_REP: [
    'leads:read', 'leads:create', 'leads:update', 'leads:convert',
    'contacts:read', 'contacts:create', 'contacts:update',
    'accounts:read', 'accounts:create', 'accounts:update',
    'deals:read', 'deals:create', 'deals:update', 'deals:win_loss',
    'quotes:read', 'quotes:create', 'quotes:update', 'quotes:send',
    'activities:*', 'products:read', 'analytics:read',
  ],
  FINANCE: [
    'invoices:*', 'contracts:*', 'subscriptions:*',
    'commission:read', 'commission:approve', 'products:*',
    'accounts:read', 'deals:read', 'analytics:read', 'analytics:export',
  ],
  CUSTOMER_SUCCESS: [
    'contacts:read', 'contacts:update',
    'accounts:read', 'accounts:update',
    'deals:read', 'activities:*', 'analytics:read',
  ],
  MARKETING: [
    'leads:read', 'leads:create', 'leads:update',
    'contacts:read', 'accounts:read', 'analytics:read',
  ],
  READ_ONLY: [
    'leads:read', 'contacts:read', 'accounts:read', 'deals:read',
    'quotes:read', 'activities:read', 'analytics:read',
  ],
};

// ─── Permission Guard ─────────────────────────────────────────────────────────

export function requirePermission(permission: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as import('./types').JwtPayload;
    if (!user) {
      return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
    }

    const hasPermission = checkPermission(user.permissions ?? [], permission);
    if (!hasPermission) {
      return reply.code(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: `Permission required: ${permission}` },
      });
    }
  };
}

export function checkPermission(userPermissions: string[], required: string): boolean {
  if (userPermissions.includes('*')) return true;
  if (userPermissions.includes(required)) return true;

  // Wildcard check: if user has "deals:*" and required is "deals:read"
  const [resource] = required.split(':');
  if (userPermissions.includes(`${resource}:*`)) return true;

  return false;
}

// ─── Ownership Guard ──────────────────────────────────────────────────────────

export function requireOwnership(resourceField: string = 'ownerId') {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as import('./types').JwtPayload;
    const isAdmin = checkPermission(user.permissions ?? [], '*') ||
                    user.roles?.includes('ADMIN') ||
                    user.roles?.includes('SALES_MANAGER');
    if (isAdmin) return; // managers can access all records

    const resource = (request as Record<string, unknown>).loadedResource as Record<string, string> | undefined;
    if (!resource) return;

    if (resource[resourceField] !== user.sub) {
      return reply.code(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You do not own this resource' },
      });
    }
  };
}
```

---

## 36. Kafka Producer/Consumer Factory (`packages/kafka/src/index.ts`)

```typescript
import {
  Kafka, Producer, Consumer, KafkaMessage,
  CompressionTypes, logLevel,
} from 'kafkajs';
import { NexusKafkaEvent, KafkaEventBase } from '@nexus/shared-types';
import { randomUUID } from 'crypto';

// ─── Client Factory ───────────────────────────────────────────────────────────

let kafka: Kafka | null = null;

export function getKafkaClient(): Kafka {
  if (!kafka) {
    kafka = new Kafka({
      clientId: process.env.KAFKA_CLIENT_ID ?? 'nexus-service',
      brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
      ssl: process.env.KAFKA_SSL === 'true' ? {} : false,
      sasl: process.env.KAFKA_SASL_USERNAME
        ? {
            mechanism: 'plain',
            username: process.env.KAFKA_SASL_USERNAME,
            password: process.env.KAFKA_SASL_PASSWORD ?? '',
          }
        : undefined,
      logLevel: logLevel.WARN,
      retry: { initialRetryTime: 100, retries: 8 },
    });
  }
  return kafka;
}

// ─── Topic Definitions ────────────────────────────────────────────────────────

export const TOPICS = {
  LEADS:         'nexus.crm.leads',
  CONTACTS:      'nexus.crm.contacts',
  ACCOUNTS:      'nexus.crm.accounts',
  DEALS:         'nexus.crm.deals',
  ACTIVITIES:    'nexus.crm.activities',
  QUOTES:        'nexus.finance.quotes',
  INVOICES:      'nexus.finance.invoices',
  PAYMENTS:      'nexus.finance.payments',
  SUBSCRIPTIONS: 'nexus.finance.subscriptions',
  CONTRACTS:     'nexus.finance.contracts',
  COMMISSIONS:   'nexus.finance.commissions',
  WORKFLOWS:     'nexus.automation.workflows',
  AI_JOBS:       'nexus.ai.jobs',
  NOTIFICATIONS: 'nexus.platform.notifications',
  EMAILS:        'nexus.comms.emails',
  CALLS:         'nexus.comms.calls',
  ANALYTICS:     'nexus.analytics.events',
  AUDIT:         'nexus.compliance.audit',
} as const;

// ─── Typed Producer ───────────────────────────────────────────────────────────

export class NexusProducer {
  private producer: Producer;
  private connected = false;

  constructor(private readonly serviceName: string) {
    this.producer = getKafkaClient().producer({
      idempotent: true,
      transactionTimeout: 30_000,
    });
  }

  async connect(): Promise<void> {
    await this.producer.connect();
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    await this.producer.disconnect();
    this.connected = false;
  }

  async publish<T extends NexusKafkaEvent>(
    topic: string,
    event: Omit<T, keyof KafkaEventBase> & { type: T['type']; tenantId: string }
  ): Promise<void> {
    const fullEvent: T = {
      ...event,
      eventId: randomUUID(),
      timestamp: new Date().toISOString(),
      version: 1,
      source: this.serviceName,
    } as unknown as T;

    await this.producer.send({
      topic,
      compression: CompressionTypes.Snappy,
      messages: [
        {
          key:   fullEvent.tenantId,           // partition by tenant
          value: JSON.stringify(fullEvent),
          headers: {
            eventType:     fullEvent.type,
            tenantId:      fullEvent.tenantId,
            correlationId: fullEvent.correlationId ?? fullEvent.eventId,
            source:        this.serviceName,
          },
        },
      ],
    });
  }

  async publishBatch(
    topic: string,
    events: NexusKafkaEvent[]
  ): Promise<void> {
    await this.producer.send({
      topic,
      compression: CompressionTypes.Snappy,
      messages: events.map((event) => ({
        key:   event.tenantId,
        value: JSON.stringify(event),
      })),
    });
  }
}

// ─── Typed Consumer ───────────────────────────────────────────────────────────

export type EventHandler<T extends NexusKafkaEvent = NexusKafkaEvent> = (
  event: T,
  rawMessage: KafkaMessage
) => Promise<void>;

export class NexusConsumer {
  private consumer: Consumer;
  private handlers = new Map<string, EventHandler[]>();

  constructor(groupId: string) {
    this.consumer = getKafkaClient().consumer({
      groupId,
      sessionTimeout: 30_000,
      heartbeatInterval: 3_000,
    });
  }

  on<T extends NexusKafkaEvent>(eventType: T['type'], handler: EventHandler<T>): this {
    const handlers = this.handlers.get(eventType) ?? [];
    handlers.push(handler as EventHandler);
    this.handlers.set(eventType, handlers);
    return this;
  }

  async subscribe(topics: string[]): Promise<void> {
    await this.consumer.connect();
    for (const topic of topics) {
      await this.consumer.subscribe({ topic, fromBeginning: false });
    }
  }

  async start(): Promise<void> {
    await this.consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;

        let event: NexusKafkaEvent;
        try {
          event = JSON.parse(message.value.toString()) as NexusKafkaEvent;
        } catch {
          console.error('Failed to parse Kafka message', message.value.toString());
          return;
        }

        const handlers = this.handlers.get(event.type) ?? [];
        for (const handler of handlers) {
          try {
            await handler(event, message);
          } catch (err) {
            console.error(`Handler error for event ${event.type}:`, err);
            // In production: send to dead-letter topic
          }
        }
      },
    });
  }

  async disconnect(): Promise<void> {
    await this.consumer.disconnect();
  }
}

// ─── Usage Example (in a service) ────────────────────────────────────────────
/*
const producer = new NexusProducer('crm-service');
await producer.connect();

await producer.publish(TOPICS.DEALS, {
  type: 'deal.won',
  tenantId: ctx.tenantId,
  payload: { dealId, ownerId, accountId, amount, currency },
});

const consumer = new NexusConsumer('finance-service-deals');
await consumer.subscribe([TOPICS.DEALS]);

consumer.on('deal.won', async (event) => {
  await commissionService.calculateForDeal(event.payload.dealId);
});

await consumer.start();
*/
```

---

## 37. Next.js App Router Structure (`apps/web/src/app/`)

```
app/
├── (auth)/
│   ├── login/page.tsx              # Keycloak redirect login
│   ├── callback/page.tsx           # OAuth callback handler
│   └── logout/page.tsx
│
├── (dashboard)/
│   ├── layout.tsx                  # Shell: sidebar + header + notifications
│   │
│   ├── page.tsx                    # Home dashboard (redirect to /deals)
│   │
│   ├── leads/
│   │   ├── page.tsx                # Lead list — table + kanban toggle
│   │   ├── [id]/page.tsx           # Lead detail + timeline
│   │   └── import/page.tsx         # CSV import wizard
│   │
│   ├── contacts/
│   │   ├── page.tsx                # Contact list
│   │   └── [id]/page.tsx           # Contact 360 view
│   │
│   ├── accounts/
│   │   ├── page.tsx                # Account list
│   │   └── [id]/
│   │       ├── page.tsx            # Account 360
│   │       ├── contacts/page.tsx
│   │       ├── deals/page.tsx
│   │       ├── activities/page.tsx
│   │       └── health/page.tsx
│   │
│   ├── deals/
│   │   ├── page.tsx                # Pipeline Kanban board (default)
│   │   ├── list/page.tsx           # Deal list table
│   │   ├── forecast/page.tsx       # Forecast view
│   │   └── [id]/
│   │       ├── page.tsx            # Deal detail page
│   │       ├── quotes/page.tsx
│   │       ├── activities/page.tsx
│   │       └── meddic/page.tsx
│   │
│   ├── activities/
│   │   ├── page.tsx                # My activities (calendar + list)
│   │   └── [id]/page.tsx
│   │
│   ├── quotes/
│   │   ├── page.tsx                # All quotes
│   │   └── [id]/page.tsx           # Quote editor + line items (CPQ)
│   │
│   ├── finance/
│   │   ├── page.tsx                # Finance dashboard
│   │   ├── products/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── contracts/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── subscriptions/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── invoices/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   └── commissions/
│   │       ├── page.tsx
│   │       └── statement/[userId]/page.tsx
│   │
│   ├── comms/
│   │   ├── page.tsx                # Unified inbox
│   │   ├── email/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   └── calls/
│   │       ├── page.tsx
│   │       └── [id]/page.tsx       # Call detail + transcript
│   │
│   ├── automation/
│   │   ├── page.tsx
│   │   ├── workflows/
│   │   │   ├── page.tsx            # Workflow list
│   │   │   └── [id]/page.tsx       # Visual flow builder
│   │   ├── blueprints/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx       # State machine editor
│   │   └── sequences/
│   │       ├── page.tsx
│   │       └── [id]/page.tsx
│   │
│   ├── analytics/
│   │   ├── page.tsx                # Analytics home
│   │   ├── pipeline/page.tsx
│   │   ├── forecast/page.tsx
│   │   ├── revenue/page.tsx
│   │   ├── activities/page.tsx
│   │   ├── win-loss/page.tsx
│   │   └── reports/
│   │       ├── page.tsx
│   │       └── [id]/page.tsx
│   │
│   ├── wallboard/page.tsx          # Full-screen wallboard
│   │
│   ├── partners/
│   │   ├── page.tsx
│   │   └── [id]/page.tsx
│   │
│   └── settings/
│       ├── page.tsx                # Settings home
│       ├── profile/page.tsx
│       ├── users/page.tsx
│       ├── roles/page.tsx
│       ├── pipelines/page.tsx
│       ├── custom-fields/page.tsx
│       ├── integrations/
│       │   ├── page.tsx
│       │   └── [type]/page.tsx
│       ├── email/page.tsx
│       ├── notifications/page.tsx
│       ├── api-keys/page.tsx
│       └── billing/page.tsx
│
├── api/                            # Next.js API routes (thin proxy to services)
│   ├── auth/[...nextauth]/route.ts
│   └── [service]/[...path]/route.ts # Proxy handler
│
├── layout.tsx                      # Root layout (providers)
├── not-found.tsx
└── error.tsx
```

---

## 38. Zustand Store Definitions (`apps/web/src/stores/`)

### 38.1 Auth Store (`stores/auth.store.ts`)

```typescript
import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';
import type { TenantContext } from '@nexus/shared-types';

interface AuthState {
  user: TenantContext | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  // Actions
  setAuth: (user: TenantContext, token: string) => void;
  clearAuth: () => void;
  hasPermission: (permission: string) => boolean;
}

export const useAuthStore = create<AuthState>()(
  devtools(
    persist(
      (set, get) => ({
        user: null,
        accessToken: null,
        isAuthenticated: false,

        setAuth: (user, accessToken) =>
          set({ user, accessToken, isAuthenticated: true }),

        clearAuth: () =>
          set({ user: null, accessToken: null, isAuthenticated: false }),

        hasPermission: (permission) => {
          const { user } = get();
          if (!user) return false;
          if (user.permissions.includes('*')) return true;
          if (user.permissions.includes(permission)) return true;
          const [resource] = permission.split(':');
          return user.permissions.includes(`${resource}:*`);
        },
      }),
      { name: 'nexus-auth', partialize: (s) => ({ accessToken: s.accessToken }) }
    )
  )
);
```

### 38.2 UI Store (`stores/ui.store.ts`)

```typescript
import { create } from 'zustand';

type Theme = 'light' | 'dark' | 'system';
type SidebarMode = 'expanded' | 'collapsed' | 'hidden';

interface UiState {
  theme: Theme;
  sidebar: SidebarMode;
  commandPaletteOpen: boolean;
  activeModal: string | null;
  modalData: unknown;
  notifications: AppNotification[];
  // Actions
  setTheme: (t: Theme) => void;
  toggleSidebar: () => void;
  openModal: (name: string, data?: unknown) => void;
  closeModal: () => void;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  addNotification: (n: Omit<AppNotification, 'id'>) => void;
  removeNotification: (id: string) => void;
}

interface AppNotification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
}

export const useUiStore = create<UiState>()((set) => ({
  theme: 'system',
  sidebar: 'expanded',
  commandPaletteOpen: false,
  activeModal: null,
  modalData: null,
  notifications: [],

  setTheme: (theme) => set({ theme }),
  toggleSidebar: () =>
    set((s) => ({ sidebar: s.sidebar === 'expanded' ? 'collapsed' : 'expanded' })),
  openModal: (name, data) => set({ activeModal: name, modalData: data }),
  closeModal: () => set({ activeModal: null, modalData: null }),
  openCommandPalette: () => set({ commandPaletteOpen: true }),
  closeCommandPalette: () => set({ commandPaletteOpen: false }),
  addNotification: (n) =>
    set((s) => ({ notifications: [...s.notifications, { ...n, id: crypto.randomUUID() }] })),
  removeNotification: (id) =>
    set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),
}));
```

### 38.3 Pipeline Store (`stores/pipeline.store.ts`)

```typescript
import { create } from 'zustand';

interface PipelineState {
  selectedPipelineId: string | null;
  viewMode: 'kanban' | 'list';
  filters: DealFilters;
  groupBy: string;
  // Actions
  selectPipeline: (id: string) => void;
  setViewMode: (mode: 'kanban' | 'list') => void;
  setFilters: (f: Partial<DealFilters>) => void;
  clearFilters: () => void;
}

interface DealFilters {
  ownerId?: string;
  search?: string;
  forecastCategory?: string;
  tags?: string[];
  amountMin?: number;
  amountMax?: number;
  closeDateFrom?: string;
  closeDateTo?: string;
}

export const usePipelineStore = create<PipelineState>()((set) => ({
  selectedPipelineId: null,
  viewMode: 'kanban',
  filters: {},
  groupBy: 'stage',

  selectPipeline: (id) => set({ selectedPipelineId: id }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
  clearFilters: () => set({ filters: {} }),
}));
```

---

## 39. React Query Hooks (`apps/web/src/hooks/`)

### 39.1 Leads Hooks (`hooks/use-leads.ts`)

```typescript
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { CreateLeadInput, UpdateLeadInput } from '@nexus/validation';

export const leadKeys = {
  all:     ['leads'] as const,
  lists:   () => [...leadKeys.all, 'list'] as const,
  list:    (f: Record<string, unknown>) => [...leadKeys.lists(), f] as const,
  details: () => [...leadKeys.all, 'detail'] as const,
  detail:  (id: string) => [...leadKeys.details(), id] as const,
  timeline:(id: string) => [...leadKeys.detail(id), 'timeline'] as const,
};

export function useLeads(filters: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: leadKeys.list(filters),
    queryFn:  () => api.get('/leads', { params: filters }),
    staleTime: 30_000,
  });
}

export function useLead(id: string) {
  return useQuery({
    queryKey: leadKeys.detail(id),
    queryFn:  () => api.get(`/leads/${id}`),
    enabled:  !!id,
  });
}

export function useLeadTimeline(id: string) {
  return useInfiniteQuery({
    queryKey: leadKeys.timeline(id),
    queryFn:  ({ pageParam = 1 }) =>
      api.get(`/leads/${id}/timeline`, { params: { page: pageParam, limit: 20 } }),
    getNextPageParam: (last) => last.hasNextPage ? last.page + 1 : undefined,
    enabled: !!id,
  });
}

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateLeadInput) => api.post('/leads', data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: leadKeys.lists() }),
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateLeadInput }) =>
      api.patch(`/leads/${id}`, data),
    onMutate: async ({ id, data }) => {
      await qc.cancelQueries({ queryKey: leadKeys.detail(id) });
      const prev = qc.getQueryData(leadKeys.detail(id));
      qc.setQueryData(leadKeys.detail(id), (old: Record<string, unknown>) => ({ ...old, ...data }));
      return { prev };
    },
    onError: (_e, { id }, ctx) => {
      qc.setQueryData(leadKeys.detail(id), ctx?.prev);
    },
    onSettled: (_d, _e, { id }) => {
      qc.invalidateQueries({ queryKey: leadKeys.detail(id) });
      qc.invalidateQueries({ queryKey: leadKeys.lists() });
    },
  });
}

export function useConvertLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/leads/${id}/convert`),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: leadKeys.lists() });
      qc.invalidateQueries({ queryKey: ['contacts', 'list'] });
      qc.invalidateQueries({ queryKey: ['accounts', 'list'] });
      qc.invalidateQueries({ queryKey: ['deals', 'list'] });
    },
  });
}
```

### 39.2 Deals Hooks (`hooks/use-deals.ts`)

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { CreateDealInput, UpdateDealInput } from '@nexus/validation';

export const dealKeys = {
  all:       ['deals'] as const,
  lists:     () => [...dealKeys.all, 'list'] as const,
  list:      (f: Record<string, unknown>) => [...dealKeys.lists(), f] as const,
  details:   () => [...dealKeys.all, 'detail'] as const,
  detail:    (id: string) => [...dealKeys.details(), id] as const,
  pipeline:  (pid: string) => [...dealKeys.all, 'pipeline', pid] as const,
  insights:  (id: string) => [...dealKeys.detail(id), 'insights'] as const,
};

export function usePipelineDeals(pipelineId: string, filters = {}) {
  return useQuery({
    queryKey: dealKeys.pipeline(pipelineId),
    queryFn:  () => api.get('/deals', { params: { pipelineId, limit: 500, ...filters } }),
    staleTime: 30_000,
    enabled: !!pipelineId,
  });
}

export function useDeal(id: string) {
  return useQuery({
    queryKey: dealKeys.detail(id),
    queryFn:  () => api.get(`/deals/${id}`),
    enabled:  !!id,
  });
}

export function useDealAiInsights(id: string) {
  return useQuery({
    queryKey: dealKeys.insights(id),
    queryFn:  () => api.get(`/deals/${id}/ai-insights`),
    enabled:  !!id,
    staleTime: 5 * 60_000, // 5 min
  });
}

export function useCreateDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateDealInput) => api.post('/deals', data),
    onSuccess:  (_d, v) => {
      qc.invalidateQueries({ queryKey: dealKeys.pipeline(v.pipelineId) });
      qc.invalidateQueries({ queryKey: dealKeys.lists() });
    },
  });
}

export function useUpdateDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateDealInput }) =>
      api.patch(`/deals/${id}`, data),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: dealKeys.detail(id) });
      qc.invalidateQueries({ queryKey: dealKeys.lists() });
    },
  });
}

export function useMoveDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, stageId }: { id: string; stageId: string }) =>
      api.patch(`/deals/${id}/stage`, { stageId }),
    onMutate: async ({ id, stageId }) => {
      // Optimistic update for Kanban DnD
      await qc.cancelQueries({ queryKey: dealKeys.lists() });
      // Store previous data for rollback
      const previousData = qc.getQueriesData({ queryKey: dealKeys.lists() });
      // Update all list queries optimistically
      qc.setQueriesData({ queryKey: dealKeys.lists() }, (old: Record<string, unknown> | undefined) => {
        if (!old) return old;
        return {
          ...old,
          data: (old.data as Array<Record<string, unknown>>)?.map((d) =>
            d.id === id ? { ...d, stageId } : d
          ),
        };
      });
      return { previousData };
    },
    onError: (_e, _v, ctx) => {
      ctx?.previousData?.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: (_d, _e, { id }) => {
      qc.invalidateQueries({ queryKey: dealKeys.detail(id) });
      qc.invalidateQueries({ queryKey: dealKeys.lists() });
    },
  });
}

export function useMarkDealWon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/deals/${id}/won`),
    onSuccess:  (_d, id) => {
      qc.invalidateQueries({ queryKey: dealKeys.detail(id) });
      qc.invalidateQueries({ queryKey: dealKeys.lists() });
    },
  });
}
```

### 39.3 API Client (`lib/api-client.ts`)

```typescript
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';

const BASE_URLS: Record<string, string> = {
  crm:          process.env.NEXT_PUBLIC_CRM_URL     ?? 'http://localhost:3001/api/v1',
  finance:      process.env.NEXT_PUBLIC_FINANCE_URL ?? 'http://localhost:3002/api/v1',
  ai:           process.env.NEXT_PUBLIC_AI_URL      ?? 'http://localhost:3003/api/v1/ai',
  comms:        process.env.NEXT_PUBLIC_COMMS_URL   ?? 'http://localhost:3004/api/v1',
  workflow:     process.env.NEXT_PUBLIC_WF_URL      ?? 'http://localhost:3005/api/v1',
  analytics:    process.env.NEXT_PUBLIC_ANALYTICS_URL ?? 'http://localhost:3006/api/v1/analytics',
  auth:         process.env.NEXT_PUBLIC_AUTH_URL    ?? 'http://localhost:3010/api/v1',
  notification: process.env.NEXT_PUBLIC_NOTIF_URL   ?? 'http://localhost:3011/api/v1',
  search:       process.env.NEXT_PUBLIC_SEARCH_URL  ?? 'http://localhost:3008/api/v1/search',
  storage:      process.env.NEXT_PUBLIC_STORAGE_URL ?? 'http://localhost:3009/api/v1/storage',
};

function createApiClient(baseURL: string): AxiosInstance {
  const client = axios.create({ baseURL, timeout: 30_000 });

  client.interceptors.request.use((config) => {
    const token = useAuthStore.getState().accessToken;
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });

  client.interceptors.response.use(
    (response) => response.data,
    (error) => {
      const msg = error.response?.data?.error?.message ?? error.message;

      if (error.response?.status === 401) {
        useAuthStore.getState().clearAuth();
        window.location.href = '/login';
      } else {
        useUiStore.getState().addNotification({
          type: 'error',
          title: 'Request Failed',
          message: msg,
          duration: 5000,
        });
      }
      return Promise.reject(error);
    }
  );

  return client;
}

// Named clients per service
export const clients = Object.fromEntries(
  Object.entries(BASE_URLS).map(([k, v]) => [k, createApiClient(v)])
) as Record<keyof typeof BASE_URLS, AxiosInstance>;

// Default client (CRM service)
export const api = clients.crm;
```


---

## 40. CPQ Pricing Engine (`services/finance-service/src/cpq/pricing-engine.ts`)

```typescript
import { PrismaClient } from '@prisma/client';
import type { CpqPricingRequest, CpqPricingResult, CpqLineItem } from '@nexus/shared-types';
import Decimal from 'decimal.js';

interface ProductWithTiers {
  id: string;
  sku: string;
  name: string;
  listPrice: Decimal;
  billingType: string;
  taxable: boolean;
  pricingRules: PricingRule[];
  priceTiers: PriceTier[];
}

interface PricingRule {
  type: string;
  discountPercent?: number;
  discountFlat?: number;
  conditions?: Array<{ field: string; operator: string; value: unknown }>;
}

interface PriceTier {
  minQty: number;
  maxQty: number | null;
  unitPrice: Decimal;
}

interface AccountPricingContext {
  tier: string;       // STRATEGIC | ENTERPRISE | MID_MARKET | SMB
  totalRevenue: Decimal;
  negotiatedRates: Record<string, number>; // productId → discount %
}

/**
 * CPQ Pricing Waterfall — 10 rule types applied in strict priority order:
 *
 *  1. List Price          — base price from product catalog
 *  2. Customer Tier       — account tier discount (STRATEGIC=25%, ENTERPRISE=15%, MID_MARKET=10%, SMB=5%)
 *  3. Volume Discount     — quantity-based price tiers
 *  4. Bundle Discount     — discount when specific products are bought together
 *  5. Promotional Code    — promo code discount
 *  6. Competitive         — competitive override pricing
 *  7. Floor Price         — hard minimum — no rule can go below this
 *  8. Non-Standard        — manually entered override (requires manager approval)
 *  9. Payment Terms       — discount for early payment terms
 * 10. Free Items          — BOGO / add-on free items
 */
export class CpqPricingEngine {
  constructor(private readonly prisma: PrismaClient) {}

  async calculate(req: CpqPricingRequest): Promise<CpqPricingResult> {
    // Load products + tiers in one query
    const productIds = req.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, tenantId: req.tenantId, isActive: true },
      include: { priceTiers: true },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    // Load account context
    const account = await this.prisma.account.findFirst({
      where: { id: req.accountId, tenantId: req.tenantId },
    });
    const accountCtx: AccountPricingContext = {
      tier:             account?.tier ?? 'SMB',
      totalRevenue:     new Decimal(account?.annualRevenue ?? 0),
      negotiatedRates:  {},
    };

    const lineItems: CpqLineItem[] = [];
    const appliedRules: string[] = [];
    const floorWarnings: string[] = [];
    let approvalRequired = false;
    const approvalReasons: string[] = [];

    for (const reqItem of req.items) {
      const product = productMap.get(reqItem.productId);
      if (!product) throw new Error(`Product not found: ${reqItem.productId}`);

      let unitPrice = new Decimal(product.listPrice);
      const qty = reqItem.quantity;
      let discountPercent = new Decimal(0);

      // ── Rule 1: List Price (baseline) ──────────────────────────────────────
      const listPrice = unitPrice;

      // ── Rule 2: Customer Tier Discount ─────────────────────────────────────
      const tierDiscounts: Record<string, number> = {
        STRATEGIC: 25, ENTERPRISE: 15, MID_MARKET: 10, SMB: 5,
      };
      const tierDiscount = new Decimal(tierDiscounts[accountCtx.tier] ?? 0);
      if (tierDiscount.gt(0)) {
        discountPercent = discountPercent.plus(tierDiscount);
        appliedRules.push(`Tier discount (${accountCtx.tier}): -${tierDiscount}%`);
      }

      // ── Rule 3: Volume / Price Tier ────────────────────────────────────────
      const tierPrice = this.getVolumeTierPrice(product.priceTiers, qty);
      if (tierPrice && tierPrice.lt(unitPrice)) {
        const volDiscount = listPrice.minus(tierPrice).div(listPrice).times(100);
        discountPercent = discountPercent.plus(volDiscount);
        appliedRules.push(`Volume tier (qty ${qty}): -${volDiscount.toFixed(2)}%`);
      }

      // ── Rule 4: Bundle Discount ─────────────────────────────────────────────
      const bundleDiscount = this.checkBundleDiscount(product.id, productIds, product.pricingRules);
      if (bundleDiscount > 0) {
        discountPercent = discountPercent.plus(bundleDiscount);
        appliedRules.push(`Bundle discount: -${bundleDiscount}%`);
      }

      // ── Rule 5: Promotional Code ───────────────────────────────────────────
      if (req.appliedPromos && req.appliedPromos.length > 0) {
        const promoDiscount = await this.getPromoDiscount(req.tenantId, req.appliedPromos, product.id);
        if (promoDiscount > 0) {
          discountPercent = discountPercent.plus(promoDiscount);
          appliedRules.push(`Promo code: -${promoDiscount}%`);
        }
      }

      // ── Rule 6: Competitive Pricing ────────────────────────────────────────
      // Competitive override is set on the line item request
      if (reqItem.competitiveOverridePrice) {
        const compPrice = new Decimal(reqItem.competitiveOverridePrice);
        if (compPrice.lt(unitPrice)) {
          const compDiscount = unitPrice.minus(compPrice).div(unitPrice).times(100);
          discountPercent = discountPercent.plus(compDiscount);
          appliedRules.push(`Competitive pricing: -${compDiscount.toFixed(2)}%`);
        }
      }

      // Apply accumulated discount to get working price
      let workingPrice = listPrice.times(new Decimal(1).minus(discountPercent.div(100)));

      // ── Rule 7: Floor Price Enforcement ───────────────────────────────────
      const floorPrice = this.getFloorPrice(product, accountCtx.tier);
      if (floorPrice && workingPrice.lt(floorPrice)) {
        floorWarnings.push(`${product.name}: price floored at ${req.currency} ${floorPrice}`);
        workingPrice = floorPrice;
        // Recalculate effective discount
        discountPercent = listPrice.minus(workingPrice).div(listPrice).times(100);
      }

      // ── Rule 8: Non-Standard Approval ─────────────────────────────────────
      if (reqItem.manualOverridePrice !== undefined) {
        const overridePrice = new Decimal(reqItem.manualOverridePrice);
        if (overridePrice.lt(workingPrice)) {
          workingPrice = overridePrice;
          approvalRequired = true;
          approvalReasons.push(`Non-standard price override on ${product.name}`);
          appliedRules.push(`Manual override: ${req.currency} ${overridePrice}`);
        }
      }

      // ── Rule 9: Payment Terms Discount ────────────────────────────────────
      if (req.paymentTerms === 'NET_0' || req.paymentTerms === 'PREPAID') {
        const payDiscount = new Decimal(2); // 2% early payment
        workingPrice = workingPrice.times(new Decimal(1).minus(payDiscount.div(100)));
        appliedRules.push(`Early payment (${req.paymentTerms}): -${payDiscount}%`);
      }

      const discountAmount = listPrice.minus(workingPrice);
      const total = workingPrice.times(qty);

      lineItems.push({
        productId:      product.id,
        productName:    product.name,
        sku:            product.sku,
        quantity:       qty,
        listPrice:      listPrice.toNumber(),
        unitPrice:      workingPrice.toNumber(),
        discountPercent: discountPercent.toNumber(),
        discountAmount:  discountAmount.toNumber(),
        total:           total.toNumber(),
        billingType:    product.billingType,
      });
    }

    // ── Rule 10: Free Items ────────────────────────────────────────────────
    const freeItems = this.computeFreeItems(req.items, lineItems, productMap);
    lineItems.push(...freeItems);
    if (freeItems.length > 0) {
      appliedRules.push(`Free items added: ${freeItems.map((f) => f.productName).join(', ')}`);
    }

    // ── Totals ─────────────────────────────────────────────────────────────
    const subtotal      = lineItems.reduce((sum, i) => sum + i.total, 0);
    const discountTotal = lineItems.reduce((sum, i) => sum + i.discountAmount * i.quantity, 0);
    const taxTotal      = lineItems
      .filter((i) => productMap.get(i.productId)?.taxable)
      .reduce((sum, i) => sum + i.total * 0.1, 0); // simplified 10% — use real tax engine in prod

    return {
      items: lineItems,
      subtotal,
      discountTotal,
      taxTotal,
      total: subtotal + taxTotal,
      appliedRules: [...new Set(appliedRules)],
      floorPriceWarnings: floorWarnings,
      approvalRequired,
      approvalReasons,
    };
  }

  private getVolumeTierPrice(tiers: PriceTier[], qty: number): Decimal | null {
    const matching = tiers
      .filter((t) => qty >= t.minQty && (t.maxQty === null || qty <= t.maxQty))
      .sort((a, b) => b.minQty - a.minQty);
    return matching.length > 0 ? new Decimal(matching[0].unitPrice) : null;
  }

  private checkBundleDiscount(
    productId: string,
    allProductIds: string[],
    rules: PricingRule[]
  ): number {
    for (const rule of rules) {
      if (rule.type !== 'BUNDLE') continue;
      const required: string[] = (rule as { requiredProducts?: string[] }).requiredProducts ?? [];
      if (required.every((rId) => allProductIds.includes(rId))) {
        return rule.discountPercent ?? 0;
      }
    }
    return 0;
  }

  private async getPromoDiscount(
    tenantId: string,
    promoCodes: string[],
    productId: string
  ): Promise<number> {
    // Load promo from Redis cache or DB
    // Simplified — in production query PromoCode table
    return 0;
  }

  private getFloorPrice(product: ProductWithTiers, tier: string): Decimal | null {
    const floorRule = product.pricingRules.find((r) => r.type === 'FLOOR');
    if (!floorRule) return null;
    const floors: Record<string, number | undefined> = (floorRule as Record<string, unknown>) as Record<string, number | undefined>;
    const floorValue = floors[tier] ?? floors.DEFAULT;
    return floorValue ? new Decimal(floorValue) : null;
  }

  private computeFreeItems(
    reqItems: CpqPricingRequest['items'],
    lineItems: CpqLineItem[],
    productMap: Map<string, ProductWithTiers>
  ): CpqLineItem[] {
    const freeItems: CpqLineItem[] = [];
    for (const item of lineItems) {
      const product = productMap.get(item.productId);
      if (!product) continue;
      const bogoRule = product.pricingRules.find((r) => r.type === 'BOGO');
      if (bogoRule) {
        const freeQty = Math.floor(item.quantity / 2);
        if (freeQty > 0) {
          freeItems.push({ ...item, quantity: freeQty, unitPrice: 0, total: 0, discountPercent: 100 });
        }
      }
    }
    return freeItems;
  }
}
```

---

## 41. Commission Calculation Engine (`services/finance-service/src/commission/commission-engine.ts`)

```typescript
import { PrismaClient } from '@prisma/client';
import type { CommissionCalculationResult, CommissionRule, CommissionAccelerator } from '@nexus/shared-types';
import Decimal from 'decimal.js';

export class CommissionEngine {
  constructor(private readonly prisma: PrismaClient) {}

  async calculateForDeal(
    tenantId: string,
    userId: string,
    dealId: string,
    dealAmount: number
  ): Promise<CommissionCalculationResult> {
    // 1. Find active plan assignment for user
    const assignment = await this.prisma.commissionAssignment.findFirst({
      where: {
        tenantId,
        userId,
        startDate: { lte: new Date() },
        OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
      },
      include: { plan: true },
      orderBy: { startDate: 'desc' },
    });

    if (!assignment) {
      return this.noCommissionResult(userId);
    }

    const plan = assignment.plan;
    const rules: CommissionRule[]           = plan.rules as unknown as CommissionRule[];
    const accelerators: CommissionAccelerator[] = plan.accelerators as unknown as CommissionAccelerator[];
    const quota = assignment.quota ? new Decimal(assignment.quota) : null;

    // 2. Get YTD/period attainment for accelerator calculation
    const period = this.getCurrentPeriod(plan.period);
    const attainment = await this.getPeriodAttainment(tenantId, userId, period);

    // 3. Apply rules in priority order
    const matchingRule = this.findMatchingRule(rules, dealAmount);
    if (!matchingRule) {
      return this.noCommissionResult(userId);
    }

    const baseAmount   = new Decimal(dealAmount);
    const rate         = this.getRuleRate(matchingRule, dealAmount);
    const baseCommission = baseAmount.times(rate / 100);

    // 4. Apply accelerator if quota is set
    let multiplier = new Decimal(1);
    let acceleratorApplied: string | undefined;

    if (quota && quota.gt(0)) {
      const attainmentPct = attainment.plus(baseAmount).div(quota).times(100).toNumber();
      const acc = this.findAccelerator(accelerators, attainmentPct);
      if (acc) {
        multiplier = new Decimal(acc.multiplier);
        acceleratorApplied = acc.name;
      }
    }

    const finalCommission = baseCommission.times(multiplier);

    // 5. Calculate SPIFFs
    const spiffs = await this.calculateSpiffs(tenantId, plan, dealId, dealAmount);
    const totalSpiffs = spiffs.reduce((s, sp) => s + sp.amount, 0);

    // 6. Persist record
    await this.prisma.commissionRecord.create({
      data: {
        tenantId,
        userId,
        planId:       plan.id,
        dealId,
        type:         'DEAL_CLOSED',
        status:       'PENDING',
        baseAmount:   dealAmount,
        rate,
        amount:       baseCommission.toNumber(),
        multiplier:   multiplier.toNumber(),
        finalAmount:  finalCommission.toNumber(),
        period,
        notes:        acceleratorApplied ? `Accelerator: ${acceleratorApplied}` : undefined,
      },
    });

    return {
      userId,
      period,
      baseAmount:        dealAmount,
      rate,
      baseCommission:    baseCommission.toNumber(),
      multiplier:        multiplier.toNumber(),
      finalCommission:   finalCommission.toNumber(),
      appliedRules:      [matchingRule.name],
      acceleratorApplied,
      spiffs,
      totalSpiffs,
      grandTotal:        finalCommission.toNumber() + totalSpiffs,
    };
  }

  async processClawback(
    tenantId: string,
    originalRecordId: string,
    reason: string
  ): Promise<void> {
    const original = await this.prisma.commissionRecord.findFirst({
      where: { id: originalRecordId, tenantId },
    });
    if (!original) throw new Error('Commission record not found');
    if (original.status === 'CLAWED_BACK') throw new Error('Already clawed back');

    // Check clawback window
    const plan = await this.prisma.commissionPlan.findUnique({ where: { id: original.planId } });
    const clawbackDays = plan?.clawbackDays ?? 90;
    const daysSince = Math.floor(
      (Date.now() - original.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSince > clawbackDays) {
      throw new Error(`Clawback window expired (${clawbackDays} days)`);
    }

    await this.prisma.$transaction([
      this.prisma.commissionRecord.update({
        where: { id: originalRecordId },
        data: { status: 'CLAWED_BACK' },
      }),
      this.prisma.commissionRecord.create({
        data: {
          tenantId,
          userId:      original.userId,
          planId:      original.planId,
          dealId:      original.dealId,
          type:        'CLAWBACK',
          status:      'APPROVED',
          baseAmount:  original.finalAmount,
          rate:        original.rate,
          amount:      -original.finalAmount,
          multiplier:  1,
          finalAmount: -original.finalAmount,
          period:      this.getCurrentPeriod('MONTHLY'),
          notes:       reason,
          clawbackOf:  originalRecordId,
        },
      }),
    ]);
  }

  private findMatchingRule(rules: CommissionRule[], amount: number): CommissionRule | null {
    const sorted = [...rules].sort((a, b) => a.priority - b.priority);
    for (const rule of sorted) {
      if (this.ruleConditionsMatch(rule, amount)) return rule;
    }
    return sorted[sorted.length - 1] ?? null;
  }

  private ruleConditionsMatch(rule: CommissionRule, amount: number): boolean {
    if (!rule.conditions || rule.conditions.length === 0) return true;
    return rule.conditions.every((c) => {
      if (c.field === 'amount') {
        if (c.operator === 'gte') return amount >= Number(c.value);
        if (c.operator === 'lte') return amount <= Number(c.value);
        if (c.operator === 'gt')  return amount >  Number(c.value);
        if (c.operator === 'lt')  return amount <  Number(c.value);
      }
      return true;
    });
  }

  private getRuleRate(rule: CommissionRule, amount: number): number {
    if (rule.type === 'PERCENTAGE') return rule.rate ?? 0;
    if (rule.type === 'TIERED' && rule.tiers) {
      const tier = rule.tiers.find(
        (t) => amount >= t.minAmount && (t.maxAmount === undefined || amount < t.maxAmount)
      );
      return tier?.rate ?? 0;
    }
    return rule.rate ?? 0;
  }

  private findAccelerator(
    accelerators: CommissionAccelerator[],
    attainmentPct: number
  ): CommissionAccelerator | null {
    const sorted = [...accelerators].sort((a, b) => b.minQuotaPercent - a.minQuotaPercent);
    return sorted.find(
      (a) => attainmentPct >= a.minQuotaPercent && (!a.maxQuotaPercent || attainmentPct < a.maxQuotaPercent)
    ) ?? null;
  }

  private async getPeriodAttainment(
    tenantId: string,
    userId: string,
    period: string
  ): Promise<Decimal> {
    const records = await this.prisma.commissionRecord.aggregate({
      where: { tenantId, userId, period, status: { in: ['PENDING', 'APPROVED', 'PAID'] }, type: 'DEAL_CLOSED' },
      _sum: { baseAmount: true },
    });
    return new Decimal(records._sum.baseAmount ?? 0);
  }

  private async calculateSpiffs(
    tenantId: string,
    plan: { spiffs: unknown },
    dealId: string,
    amount: number
  ): Promise<Array<{ name: string; amount: number }>> {
    const spiffs = (plan.spiffs as Array<{ name: string; condition: string; reward: number }>) ?? [];
    const results = [];
    for (const spiff of spiffs) {
      // Evaluate spiff conditions — simplified
      if (spiff.condition === 'ANY_DEAL') {
        results.push({ name: spiff.name, amount: spiff.reward });
      } else if (spiff.condition === 'NEW_LOGO') {
        // Check if this account has had prior deals
        results.push({ name: spiff.name, amount: spiff.reward });
      }
    }
    return results;
  }

  private getCurrentPeriod(planPeriod: string): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const q = Math.ceil((now.getMonth() + 1) / 3);
    if (planPeriod === 'MONTHLY')   return `${y}-${m}`;
    if (planPeriod === 'QUARTERLY') return `${y}-Q${q}`;
    if (planPeriod === 'ANNUAL')    return `${y}`;
    return `${y}-${m}`;
  }

  private noCommissionResult(userId: string): CommissionCalculationResult {
    return {
      userId, period: '', baseAmount: 0, rate: 0,
      baseCommission: 0, multiplier: 1, finalCommission: 0,
      appliedRules: [], spiffs: [], totalSpiffs: 0, grandTotal: 0,
    };
  }
}
```

---

## 42. Workflow Engine Execution Logic (`services/workflow-engine/src/executor/workflow-executor.ts`)

```typescript
import { PrismaClient } from '@prisma/client';
import type { WorkflowDefinition, WorkflowExecution } from '@prisma/client';
import { NexusProducer, TOPICS } from '@nexus/kafka';

// ─── Node Types ────────────────────────────────────────────────────────────────

type NodeType =
  | 'TRIGGER' | 'CONDITION' | 'BRANCH' | 'WAIT'
  | 'SEND_EMAIL' | 'SEND_SMS' | 'SEND_WEBHOOK'
  | 'CREATE_TASK' | 'UPDATE_FIELD' | 'ASSIGN_OWNER'
  | 'ADD_TAG' | 'REMOVE_TAG' | 'SCORE_LEAD'
  | 'CREATE_DEAL' | 'CREATE_ACTIVITY'
  | 'ENROLL_SEQUENCE' | 'UNENROLL_SEQUENCE'
  | 'AI_SCORE' | 'DELAY' | 'END';

interface WorkflowNode {
  id: string;
  type: NodeType;
  name: string;
  config: Record<string, unknown>;
  next?: string;          // default next node id
  branches?: Array<{ condition: string; next: string }>;
}

interface WorkflowContext {
  tenantId: string;
  triggerData: Record<string, unknown>;
  variables:   Record<string, unknown>;
  entityId?:   string;
  entityType?: string;
}

// ─── Executor ─────────────────────────────────────────────────────────────────

export class WorkflowExecutor {
  private nodeHandlers: Map<NodeType, NodeHandler>;

  constructor(
    private readonly prisma:   PrismaClient,
    private readonly producer: NexusProducer
  ) {
    this.nodeHandlers = new Map<NodeType, NodeHandler>([
      ['SEND_EMAIL',      new SendEmailHandler()],
      ['SEND_WEBHOOK',    new SendWebhookHandler()],
      ['CONDITION',       new ConditionHandler()],
      ['BRANCH',          new BranchHandler()],
      ['WAIT',            new WaitHandler(prisma)],
      ['DELAY',           new DelayHandler(prisma)],
      ['UPDATE_FIELD',    new UpdateFieldHandler()],
      ['ASSIGN_OWNER',    new AssignOwnerHandler()],
      ['ADD_TAG',         new TagHandler('add')],
      ['REMOVE_TAG',      new TagHandler('remove')],
      ['CREATE_TASK',     new CreateTaskHandler()],
      ['CREATE_ACTIVITY', new CreateActivityHandler()],
      ['SCORE_LEAD',      new ScoreLeadHandler()],
      ['AI_SCORE',        new AiScoreHandler()],
      ['END',             new EndHandler()],
    ]);
  }

  async execute(
    definition: WorkflowDefinition,
    triggerData: Record<string, unknown>
  ): Promise<string> {
    const nodes: WorkflowNode[] = definition.nodes as unknown as WorkflowNode[];
    const execution = await this.prisma.workflowExecution.create({
      data: {
        tenantId:    definition.tenantId,
        workflowId:  definition.id,
        status:      'RUNNING',
        triggerData,
        context:     { variables: definition.variables, ...triggerData },
      },
    });

    const ctx: WorkflowContext = {
      tenantId:   definition.tenantId,
      triggerData,
      variables:  definition.variables as Record<string, unknown>,
      entityId:   triggerData.entityId as string,
      entityType: triggerData.entityType as string,
    };

    // Find start node (trigger node or first node)
    const startNode = nodes.find((n) => n.type === 'TRIGGER') ?? nodes[0];
    if (!startNode) {
      await this.markFailed(execution.id, 'No start node found');
      return execution.id;
    }

    try {
      await this.runFromNode(execution.id, startNode, nodes, ctx);
      await this.prisma.workflowExecution.update({
        where: { id: execution.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      await this.markFailed(execution.id, msg);
    }

    return execution.id;
  }

  private async runFromNode(
    executionId: string,
    node: WorkflowNode,
    allNodes: WorkflowNode[],
    ctx: WorkflowContext,
    depth = 0
  ): Promise<void> {
    if (depth > 100) throw new Error('Max execution depth exceeded — possible loop');

    const handler = this.nodeHandlers.get(node.type);
    const startedAt = Date.now();
    let output: NodeOutput = { nextNodeId: node.next };

    await this.prisma.workflowExecution.update({
      where: { id: executionId },
      data: { currentNode: node.id },
    });

    try {
      if (handler) {
        output = await handler.execute(node, ctx, executionId);
        Object.assign(ctx.variables, output.contextUpdates ?? {});
      }
      await this.logNodeResult(executionId, node, 'COMPLETED', null, output, Date.now() - startedAt);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Node execution failed';
      await this.logNodeResult(executionId, node, 'FAILED', msg, null, Date.now() - startedAt);
      throw err;
    }

    // Determine next node
    const nextId = output.nextNodeId;
    if (!nextId || node.type === 'END') return;

    const nextNode = allNodes.find((n) => n.id === nextId);
    if (nextNode) {
      await this.runFromNode(executionId, nextNode, allNodes, ctx, depth + 1);
    }
  }

  private async logNodeResult(
    executionId: string,
    node: WorkflowNode,
    status: string,
    error: string | null,
    output: unknown,
    duration: number
  ): Promise<void> {
    await this.prisma.workflowLog.create({
      data: {
        executionId,
        nodeId:   node.id,
        nodeName: node.name,
        status,
        output:   output as Record<string, unknown>,
        error:    error ?? undefined,
        duration,
      },
    });
  }

  private async markFailed(executionId: string, message: string): Promise<void> {
    await this.prisma.workflowExecution.update({
      where: { id: executionId },
      data: { status: 'FAILED', failedAt: new Date(), errorMessage: message },
    });
  }
}

// ─── Node Handler Interface ───────────────────────────────────────────────────

interface NodeOutput {
  nextNodeId?: string;
  contextUpdates?: Record<string, unknown>;
}

interface NodeHandler {
  execute(node: WorkflowNode, ctx: WorkflowContext, execId: string): Promise<NodeOutput>;
}

// ─── Sample Node Handlers ─────────────────────────────────────────────────────

class ConditionHandler implements NodeHandler {
  async execute(node: WorkflowNode, ctx: WorkflowContext): Promise<NodeOutput> {
    const { field, operator, value, trueNext, falseNext } = node.config as {
      field: string; operator: string; value: unknown; trueNext: string; falseNext: string;
    };

    const actual = this.resolveField(field, ctx);
    const result = this.evaluate(actual, operator, value);
    return { nextNodeId: result ? trueNext : falseNext };
  }

  private resolveField(field: string, ctx: WorkflowContext): unknown {
    const parts = field.split('.');
    let obj: unknown = { ...ctx.triggerData, ...ctx.variables };
    for (const part of parts) {
      if (obj && typeof obj === 'object') {
        obj = (obj as Record<string, unknown>)[part];
      }
    }
    return obj;
  }

  private evaluate(actual: unknown, operator: string, expected: unknown): boolean {
    switch (operator) {
      case 'eq':         return actual === expected;
      case 'ne':         return actual !== expected;
      case 'gt':         return Number(actual) > Number(expected);
      case 'gte':        return Number(actual) >= Number(expected);
      case 'lt':         return Number(actual) < Number(expected);
      case 'lte':        return Number(actual) <= Number(expected);
      case 'contains':   return String(actual).toLowerCase().includes(String(expected).toLowerCase());
      case 'startsWith': return String(actual).startsWith(String(expected));
      case 'isEmpty':    return !actual || actual === '';
      case 'isNotEmpty': return !!actual && actual !== '';
      case 'in':         return Array.isArray(expected) && expected.includes(actual);
      default:           return false;
    }
  }
}

class SendEmailHandler implements NodeHandler {
  async execute(node: WorkflowNode, ctx: WorkflowContext): Promise<NodeOutput> {
    const { templateId, to, subject, variables } = node.config as {
      templateId: string; to: string; subject: string; variables: Record<string, string>;
    };

    // Resolve template variables from context
    const resolvedTo      = this.interpolate(to, ctx);
    const resolvedVars    = Object.fromEntries(
      Object.entries(variables ?? {}).map(([k, v]) => [k, this.interpolate(v, ctx)])
    );

    // Publish to comms service via Kafka
    // producer.publish(TOPICS.EMAILS, { type: 'email.send', ... })
    // For now, HTTP call to comms service
    await fetch(`${process.env.COMMS_SERVICE_URL}/api/v1/emails/send`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'X-Service-Key': process.env.INTERNAL_SERVICE_KEY! },
      body: JSON.stringify({ tenantId: ctx.tenantId, templateId, to: resolvedTo, variables: resolvedVars }),
    });

    return { nextNodeId: node.next };
  }

  private interpolate(template: string, ctx: WorkflowContext): string {
    return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, key) => {
      const parts = key.split('.');
      let val: unknown = { ...ctx.triggerData, ...ctx.variables };
      for (const p of parts) val = (val as Record<string, unknown>)?.[p];
      return val !== undefined ? String(val) : `{{${key}}}`;
    });
  }
}

class SendWebhookHandler implements NodeHandler {
  async execute(node: WorkflowNode, ctx: WorkflowContext): Promise<NodeOutput> {
    const { url, method = 'POST', headers = {}, body } = node.config as {
      url: string; method: string; headers: Record<string, string>; body: unknown;
    };

    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body ?? ctx),
      signal: AbortSignal.timeout(10_000),
    });

    return { nextNodeId: node.next };
  }
}

class UpdateFieldHandler implements NodeHandler {
  async execute(node: WorkflowNode, ctx: WorkflowContext): Promise<NodeOutput> {
    const { entity, entityId, field, value } = node.config as {
      entity: string; entityId: string; field: string; value: unknown;
    };

    const resolvedId = (entityId === '$trigger' ? ctx.entityId : entityId) ?? ctx.entityId;

    await fetch(`${process.env.CRM_SERVICE_URL}/api/v1/${entity.toLowerCase()}s/${resolvedId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Service-Key': process.env.INTERNAL_SERVICE_KEY! },
      body: JSON.stringify({ tenantId: ctx.tenantId, [field]: value }),
    });

    return { nextNodeId: node.next };
  }
}

class AssignOwnerHandler implements NodeHandler {
  async execute(node: WorkflowNode, ctx: WorkflowContext): Promise<NodeOutput> {
    const { ownerId, entity, roundRobin } = node.config as {
      ownerId?: string; entity: string; roundRobin?: string[];
    };

    const assignTo = roundRobin
      ? roundRobin[Math.floor(Math.random() * roundRobin.length)]
      : ownerId;

    await fetch(`${process.env.CRM_SERVICE_URL}/api/v1/${entity.toLowerCase()}s/${ctx.entityId}/assign`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Service-Key': process.env.INTERNAL_SERVICE_KEY! },
      body: JSON.stringify({ ownerId: assignTo }),
    });

    return { nextNodeId: node.next, contextUpdates: { assignedOwnerId: assignTo } };
  }
}

class TagHandler implements NodeHandler {
  constructor(private readonly action: 'add' | 'remove') {}
  async execute(node: WorkflowNode, ctx: WorkflowContext): Promise<NodeOutput> {
    // Call CRM service to add/remove tag
    return { nextNodeId: node.next };
  }
}

class ScoreLeadHandler implements NodeHandler {
  async execute(node: WorkflowNode, ctx: WorkflowContext): Promise<NodeOutput> {
    const { delta } = node.config as { delta: number };
    // POST to CRM service to update lead score
    return { nextNodeId: node.next, contextUpdates: { scoreAdjusted: true } };
  }
}

class AiScoreHandler implements NodeHandler {
  async execute(node: WorkflowNode, ctx: WorkflowContext): Promise<NodeOutput> {
    const resp = await fetch(`${process.env.AI_SERVICE_URL}/api/v1/ai/lead/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Service-Key': process.env.INTERNAL_SERVICE_KEY! },
      body: JSON.stringify({ tenantId: ctx.tenantId, leadId: ctx.entityId }),
    });
    const data = (await resp.json()) as { score: number };
    return { nextNodeId: node.next, contextUpdates: { aiScore: data.score } };
  }
}

class DelayHandler implements NodeHandler {
  constructor(private readonly prisma: PrismaClient) {}
  async execute(node: WorkflowNode, _ctx: WorkflowContext, execId: string): Promise<NodeOutput> {
    const { delayMinutes } = node.config as { delayMinutes: number };
    const resumeAt = new Date(Date.now() + delayMinutes * 60_000);
    // Pause execution — a scheduler will resume it via POST /executions/:id/resume
    await this.prisma.workflowExecution.update({
      where: { id: execId },
      data: { status: 'PAUSED' }, // store resumeAt in context
    });
    // Return END to stop current execution chain — scheduler will resume
    return { nextNodeId: 'END' };
  }
}

class WaitHandler implements NodeHandler {
  constructor(private readonly prisma: PrismaClient) {}
  async execute(node: WorkflowNode, _ctx: WorkflowContext, execId: string): Promise<NodeOutput> {
    // Wait for event condition — same pause mechanism
    return { nextNodeId: 'END' };
  }
}

class CreateTaskHandler implements NodeHandler {
  async execute(node: WorkflowNode, ctx: WorkflowContext): Promise<NodeOutput> {
    const { subject, assignTo, dueInDays } = node.config as {
      subject: string; assignTo: string; dueInDays: number;
    };
    const dueDate = new Date(Date.now() + dueInDays * 86_400_000).toISOString();
    await fetch(`${process.env.CRM_SERVICE_URL}/api/v1/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Service-Key': process.env.INTERNAL_SERVICE_KEY! },
      body: JSON.stringify({
        tenantId: ctx.tenantId,
        type: 'TASK', subject, dueDate,
        ownerId: assignTo,
        [ctx.entityType?.toLowerCase() + 'Id']: ctx.entityId,
      }),
    });
    return { nextNodeId: node.next };
  }
}

class CreateActivityHandler extends CreateTaskHandler {}

class BranchHandler implements NodeHandler {
  async execute(node: WorkflowNode, ctx: WorkflowContext): Promise<NodeOutput> {
    const { branches } = node as { branches: Array<{ condition: string; next: string }> };
    // Evaluate each branch condition in order
    for (const branch of branches ?? []) {
      if (this.evalCondition(branch.condition, ctx)) {
        return { nextNodeId: branch.next };
      }
    }
    return { nextNodeId: node.next }; // default
  }
  private evalCondition(condition: string, ctx: WorkflowContext): boolean {
    // Simple expression evaluator — in production use safe-eval or jsonata
    try {
      return new Function('ctx', `with(ctx) { return ${condition}; }`)(ctx.variables);
    } catch { return false; }
  }
}

class EndHandler implements NodeHandler {
  async execute(): Promise<NodeOutput> {
    return { nextNodeId: undefined };
  }
}
```

---

## 43. Blueprint Engine — State Machine (`services/workflow-engine/src/blueprint/blueprint-engine.ts`)

```typescript
import { PrismaClient } from '@prisma/client';

interface BlueprintState {
  id: string;
  name: string;
  isInitial:   boolean;
  isFinal:     boolean;
  color:       string;
  checklist:   string[];
  slaHours?:   number;
  entryActions: BlueprintAction[];
  exitActions:  BlueprintAction[];
}

interface BlueprintTransition {
  id:         string;
  from:       string;     // state id
  to:         string;     // state id
  name:       string;
  conditions: Array<{ field: string; operator: string; value: unknown }>;
  requiredFields: string[];
  requiredChecklist: string[];
  approvalRequired: boolean;
}

interface BlueprintAction {
  type: 'SEND_EMAIL' | 'CREATE_TASK' | 'NOTIFY' | 'WEBHOOK' | 'UPDATE_FIELD';
  config: Record<string, unknown>;
}

export class BlueprintEngine {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Transition an entity to a new blueprint state.
   * Validates conditions, required fields, and checklist completion.
   */
  async transition(
    tenantId:     string,
    instanceId:   string,
    transitionId: string,
    triggeredBy:  string,
    entityData:   Record<string, unknown>
  ): Promise<{ success: boolean; newState: string; errors: string[] }> {
    const instance = await this.prisma.blueprintInstance.findFirst({
      where: { id: instanceId, tenantId },
      include: { blueprint: true },
    });
    if (!instance) throw new Error('Blueprint instance not found');

    const states:      BlueprintState[]      = instance.blueprint.states      as unknown as BlueprintState[];
    const transitions: BlueprintTransition[] = instance.blueprint.transitions as unknown as BlueprintTransition[];

    const transition = transitions.find((t) => t.id === transitionId);
    if (!transition) throw new Error(`Transition ${transitionId} not found`);

    // ── Validate source state ──
    if (transition.from !== instance.currentState) {
      return {
        success: false,
        newState: instance.currentState,
        errors: [`Cannot transition: current state is '${instance.currentState}', expected '${transition.from}'`],
      };
    }

    const errors: string[] = [];

    // ── Validate conditions ──
    for (const cond of transition.conditions) {
      if (!this.evaluateCondition(entityData, cond)) {
        errors.push(`Condition not met: ${cond.field} ${cond.operator} ${cond.value}`);
      }
    }

    // ── Validate required fields ──
    for (const field of transition.requiredFields) {
      const val = entityData[field];
      if (val === null || val === undefined || val === '') {
        errors.push(`Required field missing: ${field}`);
      }
    }

    // ── Validate checklist completion ──
    const checklistData = instance.checklistData as Record<string, boolean>;
    for (const item of transition.requiredChecklist) {
      if (!checklistData[item]) {
        errors.push(`Checklist item not completed: ${item}`);
      }
    }

    if (errors.length > 0) {
      return { success: false, newState: instance.currentState, errors };
    }

    // ── Execute exit actions from current state ──
    const fromState = states.find((s) => s.id === transition.from);
    if (fromState) {
      for (const action of fromState.exitActions) {
        await this.executeAction(action, tenantId, instance.entityId, instance.entityType);
      }
    }

    // ── Record history ──
    const history = instance.history as Array<{
      fromState: string; toState: string; transition: string;
      triggeredBy: string; timestamp: string;
    }>;
    history.push({
      fromState:   transition.from,
      toState:     transition.to,
      transition:  transition.name,
      triggeredBy,
      timestamp:   new Date().toISOString(),
    });

    // ── Compute SLA data for new state ──
    const toState = states.find((s) => s.id === transition.to);
    const slaData  = instance.slaData as Record<string, string>;
    if (toState?.slaHours) {
      slaData[transition.to] = new Date(Date.now() + toState.slaHours * 3_600_000).toISOString();
    }

    await this.prisma.blueprintInstance.update({
      where: { id: instanceId },
      data: {
        currentState: transition.to,
        history,
        slaData,
        completedAt:  toState?.isFinal ? new Date() : undefined,
      },
    });

    // ── Execute entry actions for new state ──
    if (toState) {
      for (const action of toState.entryActions) {
        await this.executeAction(action, tenantId, instance.entityId, instance.entityType);
      }
    }

    return { success: true, newState: transition.to, errors: [] };
  }

  async getAvailableTransitions(
    tenantId:   string,
    instanceId: string,
    entityData: Record<string, unknown>
  ): Promise<BlueprintTransition[]> {
    const instance = await this.prisma.blueprintInstance.findFirst({
      where: { id: instanceId, tenantId },
      include: { blueprint: true },
    });
    if (!instance) return [];

    const transitions = instance.blueprint.transitions as unknown as BlueprintTransition[];
    return transitions.filter(
      (t) =>
        t.from === instance.currentState &&
        t.conditions.every((c) => this.evaluateCondition(entityData, c))
    );
  }

  async checkSlaBreaches(tenantId: string): Promise<void> {
    const now = new Date().toISOString();
    const instances = await this.prisma.blueprintInstance.findMany({
      where: { tenantId, completedAt: null },
    });

    for (const instance of instances) {
      const slaData = instance.slaData as Record<string, string>;
      const slaDeadline = slaData[instance.currentState];
      if (slaDeadline && slaDeadline < now) {
        // Trigger SLA breach notification
        await fetch(`${process.env.NOTIFICATION_SERVICE_URL}/api/v1/notifications`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Service-Key': process.env.INTERNAL_SERVICE_KEY! },
          body: JSON.stringify({
            tenantId,
            type: 'SLA_BREACH',
            title: `SLA Breach: ${instance.entityType} ${instance.entityId}`,
            data:  { instanceId: instance.id, state: instance.currentState },
          }),
        });
      }
    }
  }

  private evaluateCondition(data: Record<string, unknown>, cond: BlueprintTransition['conditions'][0]): boolean {
    const val = data[cond.field];
    switch (cond.operator) {
      case 'eq':        return val === cond.value;
      case 'ne':        return val !== cond.value;
      case 'isSet':     return val !== null && val !== undefined && val !== '';
      case 'isNotSet':  return !val;
      case 'gt':        return Number(val) > Number(cond.value);
      case 'gte':       return Number(val) >= Number(cond.value);
      default:          return true;
    }
  }

  private async executeAction(
    action: BlueprintAction,
    tenantId: string,
    entityId: string,
    entityType: string
  ): Promise<void> {
    // Dispatch to appropriate service based on action type
    switch (action.type) {
      case 'NOTIFY':
        await fetch(`${process.env.NOTIFICATION_SERVICE_URL}/api/v1/notifications`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Service-Key': process.env.INTERNAL_SERVICE_KEY! },
          body: JSON.stringify({ tenantId, ...action.config }),
        });
        break;
      case 'CREATE_TASK':
        // POST to CRM service
        break;
      case 'WEBHOOK':
        await fetch(action.config.url as string, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenantId, entityId, entityType, action }),
        });
        break;
    }
  }
}
```

---

## 44. ClickHouse Analytics DDL (`services/analytics-service/migrations/clickhouse/`)

### 44.1 Core Tables

```sql
-- ── Fact: CRM Events (all activity across leads, deals, contacts) ──────────

CREATE TABLE IF NOT EXISTS nexus.crm_events
(
    event_id         UUID,
    tenant_id        String,
    event_type       LowCardinality(String),  -- lead.created, deal.won, activity.completed, etc.
    entity_type      LowCardinality(String),
    entity_id        String,
    owner_id         String,
    account_id       String,
    deal_id          String,
    pipeline_id      String,
    stage_id         String,
    amount           Decimal64(2),
    currency         LowCardinality(String),
    source           LowCardinality(String),
    properties       String,                   -- JSON
    timestamp        DateTime64(3),
    date             Date MATERIALIZED toDate(timestamp),
    year             UInt16 MATERIALIZED toYear(timestamp),
    month            UInt8 MATERIALIZED toMonth(timestamp),
    week             UInt8 MATERIALIZED toWeek(timestamp),
    hour             UInt8 MATERIALIZED toHour(timestamp)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (tenant_id, event_type, timestamp)
TTL timestamp + INTERVAL 5 YEAR
SETTINGS index_granularity = 8192;

-- ── Fact: Deal Snapshots (daily) ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS nexus.deal_snapshots
(
    snapshot_date    Date,
    tenant_id        String,
    deal_id          String,
    owner_id         String,
    account_id       String,
    pipeline_id      String,
    stage_id         String,
    stage_name       LowCardinality(String),
    amount           Decimal64(2),
    currency         LowCardinality(String),
    probability      UInt8,
    status           LowCardinality(String),
    forecast_category LowCardinality(String),
    ai_win_probability Float32,
    days_in_stage    UInt16,
    days_since_activity UInt16,
    close_date       Date,
    created_date     Date
)
ENGINE = ReplacingMergeTree()
PARTITION BY toYYYYMM(snapshot_date)
ORDER BY (tenant_id, snapshot_date, deal_id)
SETTINGS index_granularity = 8192;

-- ── Fact: Revenue Events (MRR changes) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS nexus.revenue_events
(
    event_id         UUID,
    tenant_id        String,
    account_id       String,
    subscription_id  String,
    event_type       LowCardinality(String),  -- new, expansion, contraction, churn, reactivation
    mrr_before       Decimal64(2),
    mrr_after        Decimal64(2),
    mrr_delta        Decimal64(2),
    currency         LowCardinality(String),
    timestamp        DateTime64(3),
    date             Date MATERIALIZED toDate(timestamp)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (tenant_id, timestamp, account_id)
SETTINGS index_granularity = 8192;

-- ── Fact: Activity Stats ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS nexus.activity_stats
(
    date             Date,
    tenant_id        String,
    owner_id         String,
    activity_type    LowCardinality(String),
    status           LowCardinality(String),
    count            UInt32,
    total_duration   UInt32  -- minutes
)
ENGINE = SummingMergeTree((count, total_duration))
PARTITION BY toYYYYMM(date)
ORDER BY (tenant_id, date, owner_id, activity_type, status)
SETTINGS index_granularity = 8192;

-- ── Fact: Email Metrics ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS nexus.email_metrics
(
    event_id     UUID,
    tenant_id    String,
    campaign_id  String,
    contact_id   String,
    event_type   LowCardinality(String),  -- sent, delivered, opened, clicked, bounced, unsubscribed
    timestamp    DateTime64(3),
    date         Date MATERIALIZED toDate(timestamp)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (tenant_id, campaign_id, event_type, timestamp)
SETTINGS index_granularity = 8192;

-- ── Materialized View: Daily Pipeline Summary ─────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS nexus.mv_pipeline_daily
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (tenant_id, date, pipeline_id, stage_id)
AS SELECT
    toDate(timestamp)        AS date,
    tenant_id,
    pipeline_id,
    stage_id,
    countIf(event_type = 'deal.created')   AS deals_created,
    countIf(event_type = 'deal.won')       AS deals_won,
    countIf(event_type = 'deal.lost')      AS deals_lost,
    sumIf(amount, event_type = 'deal.won') AS won_revenue,
    sumIf(amount, event_type = 'deal.created') AS pipeline_added
FROM nexus.crm_events
GROUP BY date, tenant_id, pipeline_id, stage_id;

-- ── Materialized View: Rep Performance ───────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS nexus.mv_rep_performance
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (tenant_id, date, owner_id)
AS SELECT
    toDate(timestamp)              AS date,
    tenant_id,
    owner_id,
    countIf(event_type = 'deal.created') AS deals_opened,
    countIf(event_type = 'deal.won')     AS deals_won,
    countIf(event_type = 'deal.lost')    AS deals_lost,
    sumIf(amount, event_type = 'deal.won') AS revenue_closed,
    countIf(event_type = 'activity.completed') AS activities_done
FROM nexus.crm_events
GROUP BY date, tenant_id, owner_id;

-- ── Materialized View: MRR by Month ──────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS nexus.mv_mrr_monthly
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(toStartOfMonth(date))
ORDER BY (tenant_id, month_start)
AS SELECT
    toStartOfMonth(date)  AS month_start,
    tenant_id,
    sumIf(mrr_delta, event_type = 'new')         AS new_mrr,
    sumIf(mrr_delta, event_type = 'expansion')   AS expansion_mrr,
    sumIf(mrr_delta, event_type = 'contraction') AS contraction_mrr,
    sumIf(mrr_delta, event_type = 'churn')       AS churn_mrr,
    sum(mrr_delta)                               AS net_mrr
FROM nexus.revenue_events
GROUP BY month_start, tenant_id;
```

---

## 45. Package.json Templates

### 45.1 Microservice (`services/crm-service/package.json`)

```json
{
  "name": "@nexus/crm-service",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev":     "tsx watch src/index.ts",
    "build":   "tsc --project tsconfig.build.json",
    "start":   "node dist/index.js",
    "test":    "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "lint":    "eslint src --ext .ts",
    "db:generate": "prisma generate",
    "db:migrate":  "prisma migrate deploy",
    "db:studio":   "prisma studio",
    "db:seed":     "tsx src/seed.ts"
  },
  "dependencies": {
    "@nexus/kafka":        "workspace:*",
    "@nexus/shared-types": "workspace:*",
    "@nexus/validation":   "workspace:*",
    "@nexus/service-utils":"workspace:*",
    "@fastify/cors":       "^9.0.1",
    "@fastify/helmet":     "^11.1.1",
    "@fastify/jwt":        "^8.0.1",
    "@fastify/multipart":  "^8.1.0",
    "@fastify/rate-limit":  "^9.1.0",
    "@fastify/request-context": "^5.1.0",
    "@prisma/client":      "^5.15.0",
    "decimal.js":          "^10.4.3",
    "fastify":             "^4.28.1",
    "ioredis":             "^5.4.1",
    "kafkajs":             "^2.2.4",
    "meilisearch":         "^0.38.0",
    "pino":                "^9.3.2",
    "zod":                 "^3.23.8"
  },
  "devDependencies": {
    "@types/node":   "^20.14.9",
    "prisma":        "^5.15.0",
    "tsx":           "^4.16.0",
    "typescript":    "^5.5.3",
    "vitest":        "^1.6.0",
    "eslint":        "^9.5.0"
  }
}
```

### 45.2 Shared Package (`packages/shared-types/package.json`)

```json
{
  "name": "@nexus/shared-types",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main":    "./dist/index.js",
  "types":   "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types":  "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build":     "tsc --project tsconfig.json",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.5.3"
  }
}
```

### 45.3 Root `pnpm-workspace.yaml`

```yaml
packages:
  - 'apps/*'
  - 'services/*'
  - 'packages/*'
```

### 45.4 Root `package.json`

```json
{
  "name": "nexus-crm",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev":        "turbo dev",
    "build":      "turbo build",
    "test":       "turbo test",
    "lint":       "turbo lint",
    "typecheck":  "turbo typecheck",
    "db:generate":"turbo db:generate",
    "db:migrate": "turbo db:migrate"
  },
  "devDependencies": {
    "turbo":      "^2.0.9",
    "typescript": "^5.5.3",
    "eslint":     "^9.5.0"
  },
  "engines": {
    "node": ">=20",
    "pnpm": ">=9"
  },
  "packageManager": "pnpm@9.1.0"
}
```

### 45.5 `turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "lint": {},
    "db:generate": {
      "cache": false
    },
    "db:migrate": {
      "cache": false
    }
  }
}
```

---

## 46. Multi-Stage Dockerfile (`services/crm-service/Dockerfile`)

```dockerfile
# ── Stage 1: Base ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate
WORKDIR /app

# ── Stage 2: Dependencies ─────────────────────────────────────────────────────
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json ./
COPY packages/shared-types/package.json   ./packages/shared-types/
COPY packages/validation/package.json      ./packages/validation/
COPY packages/kafka/package.json           ./packages/kafka/
COPY packages/service-utils/package.json   ./packages/service-utils/
COPY services/crm-service/package.json     ./services/crm-service/

RUN pnpm install --frozen-lockfile --filter @nexus/crm-service...

# ── Stage 3: Builder ──────────────────────────────────────────────────────────
FROM deps AS builder
COPY packages/shared-types/   ./packages/shared-types/
COPY packages/validation/      ./packages/validation/
COPY packages/kafka/           ./packages/kafka/
COPY packages/service-utils/   ./packages/service-utils/
COPY services/crm-service/     ./services/crm-service/

# Generate Prisma client
RUN pnpm --filter @nexus/crm-service db:generate

# Build all packages
RUN pnpm turbo build --filter @nexus/crm-service

# ── Stage 4: Production Image ─────────────────────────────────────────────────
FROM node:20-alpine AS production
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate
RUN addgroup -S nexus && adduser -S nexus -G nexus

WORKDIR /app

# Copy only production artifacts
COPY --from=builder /app/services/crm-service/dist             ./dist
COPY --from=builder /app/services/crm-service/prisma           ./prisma
COPY --from=builder /app/node_modules/.prisma                   ./node_modules/.prisma
COPY --from=builder /app/node_modules                           ./node_modules
COPY --from=builder /app/services/crm-service/package.json     ./package.json

USER nexus
EXPOSE 3001

ENV NODE_ENV=production
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "dist/index.js"]
```

---

## 47. Error Handling Patterns

### 47.1 Domain Error Classes (`packages/service-utils/src/errors.ts`)

```typescript
export class NexusError extends Error {
  constructor(
    public readonly code:       string,
    message:                    string,
    public readonly statusCode: number = 500,
    public readonly details?:   unknown
  ) {
    super(message);
    this.name = 'NexusError';
  }
}

export class NotFoundError extends NexusError {
  constructor(resource: string, id: string) {
    super('NOT_FOUND', `${resource} '${id}' not found`, 404);
  }
}

export class ValidationError extends NexusError {
  constructor(message: string, details?: unknown) {
    super('VALIDATION_ERROR', message, 422, details);
  }
}

export class UnauthorizedError extends NexusError {
  constructor(message = 'Not authenticated') {
    super('UNAUTHORIZED', message, 401);
  }
}

export class ForbiddenError extends NexusError {
  constructor(permission?: string) {
    super('FORBIDDEN', permission ? `Missing permission: ${permission}` : 'Forbidden', 403);
  }
}

export class ConflictError extends NexusError {
  constructor(resource: string, field: string) {
    super('CONFLICT', `${resource} with this ${field} already exists`, 409);
  }
}

export class ServiceUnavailableError extends NexusError {
  constructor(service: string) {
    super('SERVICE_UNAVAILABLE', `${service} is temporarily unavailable`, 503);
  }
}

export class BusinessRuleError extends NexusError {
  constructor(message: string, details?: unknown) {
    super('BUSINESS_RULE_VIOLATION', message, 422, details);
  }
}

// ── Error handler for Fastify ──────────────────────────────────────────────

import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

export function globalErrorHandler(error: FastifyError | NexusError, request: FastifyRequest, reply: FastifyReply): void {
  request.log.error({ err: error, requestId: request.id });

  if (error instanceof NexusError) {
    reply.code(error.statusCode).send({
      success: false,
      error: {
        code:      error.code,
        message:   error.message,
        details:   error.details,
        requestId: request.id,
      },
    });
    return;
  }

  // Prisma unique constraint
  if ((error as { code?: string }).code === 'P2002') {
    reply.code(409).send({
      success: false,
      error: { code: 'CONFLICT', message: 'Resource already exists', requestId: request.id },
    });
    return;
  }

  // Prisma record not found
  if ((error as { code?: string }).code === 'P2025') {
    reply.code(404).send({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Record not found', requestId: request.id },
    });
    return;
  }

  // Zod validation via Fastify schema
  if (error.validation) {
    reply.code(422).send({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: error.validation, requestId: request.id },
    });
    return;
  }

  // Generic 500
  reply.code(500).send({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred', requestId: request.id },
  });
}
```

---

## 48. Health Check Endpoints (`packages/service-utils/src/health.ts`)

```typescript
import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { Kafka } from 'kafkajs';
import { register as promRegister, collectDefaultMetrics, Counter, Histogram } from 'prom-client';

collectDefaultMetrics({ prefix: 'nexus_' });

// ── Prometheus metrics ─────────────────────────────────────────────────────

export const httpRequestsTotal = new Counter({
  name: 'nexus_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code', 'service'],
});

export const httpRequestDuration = new Histogram({
  name: 'nexus_http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route', 'status_code', 'service'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

export const dbQueryDuration = new Histogram({
  name: 'nexus_db_query_duration_seconds',
  help: 'Database query duration',
  labelNames: ['operation', 'model'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
});

// ── Health check functions ─────────────────────────────────────────────────

interface HealthCheck {
  name: string;
  ok: boolean;
  latencyMs?: number;
  message?: string;
}

export async function checkDatabase(prisma: PrismaClient): Promise<HealthCheck> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { name: 'database', ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { name: 'database', ok: false, message: String(err) };
  }
}

export async function checkRedis(redis: Redis): Promise<HealthCheck> {
  const start = Date.now();
  try {
    await redis.ping();
    return { name: 'redis', ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { name: 'redis', ok: false, message: String(err) };
  }
}

export async function checkKafka(kafka: Kafka): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const admin = kafka.admin();
    await admin.connect();
    await admin.listTopics();
    await admin.disconnect();
    return { name: 'kafka', ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { name: 'kafka', ok: false, message: String(err) };
  }
}

export function registerHealthRoutes(
  app: FastifyInstance,
  serviceName: string,
  checkFns: Array<() => Promise<HealthCheck>>
): void {
  // Liveness: just means the process is alive
  app.get('/health', async (_req, reply) => {
    reply.send({ status: 'ok', service: serviceName, ts: new Date().toISOString() });
  });

  // Readiness: checks all dependencies
  app.get('/ready', async (_req, reply) => {
    const checks = await Promise.all(checkFns.map((fn) => fn()));
    const allOk  = checks.every((c) => c.ok);
    reply.code(allOk ? 200 : 503).send({
      status:  allOk ? 'ready' : 'degraded',
      service: serviceName,
      checks,
      ts: new Date().toISOString(),
    });
  });

  // Metrics endpoint for Prometheus scraping
  app.get('/metrics', async (_req, reply) => {
    reply.header('Content-Type', promRegister.contentType);
    return promRegister.metrics();
  });
}
```

---

## 49. Seed Data Generator (`services/crm-service/src/seed.ts`)

```typescript
import { PrismaClient } from '@prisma/client';
import { faker } from '@faker-js/faker';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding NEXUS CRM...');

  const TENANT_ID = process.env.SEED_TENANT_ID ?? 'seed-tenant-001';
  const ADMIN_ID  = process.env.SEED_ADMIN_ID  ?? 'seed-user-admin';
  const REPS = ['seed-user-rep1', 'seed-user-rep2', 'seed-user-rep3'];

  // ── Pipeline & Stages ──────────────────────────────────────────────────

  const pipeline = await prisma.pipeline.upsert({
    where: { tenantId_name: { tenantId: TENANT_ID, name: 'B2B Sales' } },
    update: {},
    create: {
      tenantId:  TENANT_ID,
      name:      'B2B Sales',
      isDefault: true,
      stages: {
        create: [
          { name: 'Lead In',        order: 1, probability: 10, rottenDays: 14 },
          { name: 'Discovery',      order: 2, probability: 25, rottenDays: 21 },
          { name: 'Demo',           order: 3, probability: 40, rottenDays: 21 },
          { name: 'Proposal',       order: 4, probability: 60, rottenDays: 30 },
          { name: 'Negotiation',    order: 5, probability: 80, rottenDays: 14 },
          { name: 'Closed Won',     order: 6, probability: 100 },
          { name: 'Closed Lost',    order: 7, probability: 0 },
        ],
      },
    },
    include: { stages: true },
  });

  console.log(`✓ Pipeline: ${pipeline.name} (${pipeline.stages.length} stages)`);

  // ── Accounts ──────────────────────────────────────────────────────────

  const industries = ['SaaS', 'FinTech', 'Healthcare', 'Retail', 'Manufacturing', 'Consulting'];
  const tiers: Array<'STRATEGIC' | 'ENTERPRISE' | 'MID_MARKET' | 'SMB'> = ['STRATEGIC', 'ENTERPRISE', 'MID_MARKET', 'SMB'];

  const accounts = await Promise.all(
    Array.from({ length: 30 }).map((_, i) =>
      prisma.account.upsert({
        where: { id: `seed-account-${i + 1}` },
        update: {},
        create: {
          id:            `seed-account-${i + 1}`,
          tenantId:      TENANT_ID,
          ownerId:       REPS[i % REPS.length],
          name:          faker.company.name(),
          website:       faker.internet.url(),
          industry:      industries[i % industries.length],
          type:          i < 15 ? 'CUSTOMER' : 'PROSPECT',
          tier:          tiers[i % tiers.length],
          annualRevenue: faker.number.int({ min: 100_000, max: 50_000_000 }),
          employeeCount: faker.number.int({ min: 10, max: 5000 }),
          country:       faker.location.countryCode(),
          city:          faker.location.city(),
        },
      })
    )
  );

  console.log(`✓ Accounts: ${accounts.length}`);

  // ── Contacts ──────────────────────────────────────────────────────────

  const contacts = await Promise.all(
    accounts.flatMap((account, ai) =>
      Array.from({ length: faker.number.int({ min: 1, max: 5 }) }).map((_, ci) =>
        prisma.contact.create({
          data: {
            tenantId:   TENANT_ID,
            ownerId:    REPS[ai % REPS.length],
            accountId:  account.id,
            firstName:  faker.person.firstName(),
            lastName:   faker.person.lastName(),
            email:      faker.internet.email(),
            phone:      faker.phone.number(),
            jobTitle:   faker.person.jobTitle(),
            department: faker.commerce.department(),
            country:    account.country ?? 'US',
            gdprConsent: true,
          },
        })
      )
    )
  );

  console.log(`✓ Contacts: ${contacts.length}`);

  // ── Deals ─────────────────────────────────────────────────────────────

  const stageIds = pipeline.stages.map((s) => s.id);
  const deals = await Promise.all(
    Array.from({ length: 50 }).map((_, i) => {
      const account = accounts[i % accounts.length];
      const stageIndex = Math.min(Math.floor(i / 10), stageIds.length - 3);
      return prisma.deal.create({
        data: {
          tenantId:          TENANT_ID,
          ownerId:           REPS[i % REPS.length],
          accountId:         account.id,
          pipelineId:        pipeline.id,
          stageId:           stageIds[stageIndex],
          name:              `${account.name} — ${faker.commerce.productName()} Deal`,
          amount:            faker.number.int({ min: 5_000, max: 500_000 }),
          currency:          'USD',
          probability:       pipeline.stages[stageIndex]?.probability ?? 20,
          expectedCloseDate: faker.date.future({ years: 0.5 }),
          status:            'OPEN',
          forecastCategory:  'PIPELINE',
        },
      });
    })
  );

  console.log(`✓ Deals: ${deals.length}`);

  // ── Activities ────────────────────────────────────────────────────────

  const activityTypes = ['CALL', 'EMAIL', 'MEETING', 'TASK'];
  await Promise.all(
    deals.slice(0, 20).flatMap((deal) =>
      Array.from({ length: faker.number.int({ min: 2, max: 8 }) }).map(() =>
        prisma.activity.create({
          data: {
            tenantId:  TENANT_ID,
            ownerId:   deal.ownerId,
            dealId:    deal.id,
            accountId: deal.accountId,
            type:      activityTypes[Math.floor(Math.random() * activityTypes.length)] as 'CALL',
            subject:   faker.lorem.sentence({ min: 5, max: 10 }),
            status:    Math.random() > 0.3 ? 'COMPLETED' : 'PLANNED',
            dueDate:   faker.date.soon({ days: 30 }),
          },
        })
      )
    )
  );

  console.log('✓ Activities: created');
  console.log('✅ Seed complete!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

---

## 50. Complete Environment Variables Reference

> All variables grouped by service. Copy `.env.example` in each service directory.

### `services/crm-service/.env`
```bash
# Server
PORT=3001
NODE_ENV=development
LOG_LEVEL=info

# JWT (must match auth-service)
JWT_SECRET=change_me_minimum_32_chars

# Database
CRM_DATABASE_URL=postgresql://nexus:nexus@localhost:5432/nexus_crm?schema=public

# Redis
REDIS_URL=redis://localhost:6379
REDIS_PREFIX=crm:

# Kafka
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=crm-service

# Meilisearch
MEILISEARCH_URL=http://localhost:7700
MEILISEARCH_API_KEY=meilisearch-master-key

# Internal service keys
INTERNAL_SERVICE_KEY=nexus-internal-secret
AI_SERVICE_URL=http://localhost:3003
COMMS_SERVICE_URL=http://localhost:3004
NOTIFICATION_SERVICE_URL=http://localhost:3011
STORAGE_SERVICE_URL=http://localhost:3009

# CORS
CORS_ORIGINS=http://localhost:3000,https://app.nexus.com
```

### `services/finance-service/.env`
```bash
PORT=3002
FINANCE_DATABASE_URL=postgresql://nexus:nexus@localhost:5432/nexus_finance?schema=public
REDIS_URL=redis://localhost:6379
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=finance-service
JWT_SECRET=change_me_minimum_32_chars
INTERNAL_SERVICE_KEY=nexus-internal-secret
CRM_SERVICE_URL=http://localhost:3001
NOTIFICATION_SERVICE_URL=http://localhost:3011
```

### `services/ai-service/.env`
```bash
PORT=3003
REDIS_URL=redis://localhost:6379
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=ai-service
JWT_SECRET=change_me_minimum_32_chars
INTERNAL_SERVICE_KEY=nexus-internal-secret

# Ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL_DEFAULT=llama3.1

# ML service
ML_SERVICE_URL=http://localhost:8000

# MinIO (for audio/model storage)
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET_AUDIO=nexus-audio
MINIO_BUCKET_MODELS=nexus-models
```

### `services/auth-service/.env`
```bash
PORT=3010
AUTH_DATABASE_URL=postgresql://nexus:nexus@localhost:5432/nexus_auth?schema=public
REDIS_URL=redis://localhost:6379
JWT_SECRET=change_me_minimum_32_chars
JWT_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d

# Keycloak
KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=nexus
KEYCLOAK_CLIENT_ID=nexus-api
KEYCLOAK_CLIENT_SECRET=keycloak-client-secret

# Vault
VAULT_ADDR=http://localhost:8200
VAULT_TOKEN=vault-dev-token
```

### `services/workflow-engine/.env`
```bash
PORT=3005
WORKFLOW_DATABASE_URL=postgresql://nexus:nexus@localhost:5432/nexus_workflow?schema=public
REDIS_URL=redis://localhost:6379
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=workflow-engine
JWT_SECRET=change_me_minimum_32_chars
INTERNAL_SERVICE_KEY=nexus-internal-secret
CRM_SERVICE_URL=http://localhost:3001
COMMS_SERVICE_URL=http://localhost:3004
NOTIFICATION_SERVICE_URL=http://localhost:3011
AI_SERVICE_URL=http://localhost:3003
```

### `apps/web/.env.local`
```bash
# Next.js
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=nextauth-secret-32-chars

# Keycloak (NextAuth provider)
KEYCLOAK_ID=nexus-web
KEYCLOAK_SECRET=keycloak-web-secret
KEYCLOAK_ISSUER=http://localhost:8080/realms/nexus

# Service URLs (used by Next.js API proxy or direct browser fetch)
NEXT_PUBLIC_CRM_URL=http://localhost:3001/api/v1
NEXT_PUBLIC_FINANCE_URL=http://localhost:3002/api/v1
NEXT_PUBLIC_AI_URL=http://localhost:3003/api/v1
NEXT_PUBLIC_COMMS_URL=http://localhost:3004/api/v1
NEXT_PUBLIC_WF_URL=http://localhost:3005/api/v1
NEXT_PUBLIC_ANALYTICS_URL=http://localhost:3006/api/v1
NEXT_PUBLIC_AUTH_URL=http://localhost:3010/api/v1
NEXT_PUBLIC_NOTIF_URL=http://localhost:3011/api/v1
NEXT_PUBLIC_SEARCH_URL=http://localhost:3008/api/v1
NEXT_PUBLIC_STORAGE_URL=http://localhost:3009/api/v1
NEXT_PUBLIC_REALTIME_URL=http://localhost:3007

# Feature flags
NEXT_PUBLIC_UNLEASH_URL=http://localhost:4242/api
NEXT_PUBLIC_UNLEASH_CLIENT_KEY=unleash-client-key
```

---

## 51. AI Service — Model Registry & Inference (`services/ai-service/src/`)

### 51.1 Lead Scoring Model (`src/models/lead-scorer.ts`)

```typescript
import axios from 'axios';

interface LeadFeatures {
  company:          string | null;
  jobTitle:         string | null;
  industry:         string | null;
  annualRevenue:    number;
  employeeCount:    number;
  source:           string;
  emailProvided:    boolean;
  phoneProvided:    boolean;
  linkedInProvided: boolean;
  websiteProvided:  boolean;
  activitiesCount:  number;
  lastActivityDays: number;
  utmSource:        string | null;
  country:          string | null;
}

interface ScoreResult {
  score:       number;   // 0–100
  probability: number;   // 0.0–1.0
  reasons:     string[];
  tier:        'HOT' | 'WARM' | 'COLD';
}

const ML_SERVICE_URL = process.env.ML_SERVICE_URL ?? 'http://localhost:8000';

export async function scoreLeadWithML(features: LeadFeatures): Promise<ScoreResult> {
  try {
    const resp = await axios.post<{ score: number; probability: number; shap: Record<string, number> }>(
      `${ML_SERVICE_URL}/predict/lead-score`,
      { features },
      { timeout: 5000 }
    );

    const { score, probability, shap } = resp.data;

    // Generate human-readable reasons from SHAP values
    const reasons = Object.entries(shap)
      .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))
      .slice(0, 3)
      .map(([feature, value]) => {
        const impact = value > 0 ? 'positive' : 'negative';
        return `${feature.replace(/_/g, ' ')} has ${impact} impact`;
      });

    return {
      score:       Math.round(score),
      probability,
      reasons,
      tier: score >= 70 ? 'HOT' : score >= 40 ? 'WARM' : 'COLD',
    };
  } catch {
    // Fallback: rule-based scoring when ML service is unavailable
    return ruleBasedScore(features);
  }
}

function ruleBasedScore(f: LeadFeatures): ScoreResult {
  let score = 20; // base
  const reasons: string[] = [];

  if (f.emailProvided)    { score += 15; reasons.push('Email provided'); }
  if (f.phoneProvided)    { score += 10; reasons.push('Phone provided'); }
  if (f.company)          { score += 10; reasons.push('Company identified'); }
  if (f.annualRevenue > 1_000_000)  { score += 15; reasons.push('Large company revenue'); }
  if (f.employeeCount > 100)        { score += 10; reasons.push('Significant company size'); }
  if (f.activitiesCount > 3)        { score += 10; reasons.push('High engagement'); }
  if (f.lastActivityDays < 7)       { score += 10; reasons.push('Recent activity'); }
  if (f.source === 'REFERRAL')      { score += 10; reasons.push('Referral source'); }
  if (f.linkedInProvided)           { score += 5;  reasons.push('LinkedIn profile'); }

  score = Math.min(100, score);
  return {
    score,
    probability: score / 100,
    reasons,
    tier: score >= 70 ? 'HOT' : score >= 40 ? 'WARM' : 'COLD',
  };
}
```

### 51.2 FastAPI ML Service (`services/ml-service/main.py`)

```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
import numpy as np
import joblib
import os
import logging

app = FastAPI(title="NEXUS ML Service", version="1.0.0")
logger = logging.getLogger("ml_service")

# ── Model Registry ─────────────────────────────────────────────────────────────

MODELS: Dict[str, Any] = {}
MODELS_DIR = os.getenv("MODELS_DIR", "./models")

@app.on_event("startup")
async def load_models():
    """Load all trained models on startup."""
    model_files = {
        "lead_score":     "lead_scorer_xgboost.joblib",
        "win_probability":"win_prob_rf.joblib",
        "churn_risk":     "churn_predictor_lgbm.joblib",
    }
    for name, filename in model_files.items():
        path = os.path.join(MODELS_DIR, filename)
        if os.path.exists(path):
            MODELS[name] = joblib.load(path)
            logger.info(f"Loaded model: {name}")
        else:
            logger.warning(f"Model not found: {path} — will use fallback")

# ── Lead Scoring ───────────────────────────────────────────────────────────────

class LeadFeatures(BaseModel):
    company:          Optional[str] = None
    job_title:        Optional[str] = None
    industry:         Optional[str] = None
    annual_revenue:   float = 0.0
    employee_count:   int = 0
    source:           str = "MANUAL"
    email_provided:   bool = False
    phone_provided:   bool = False
    linkedin_provided:bool = False
    website_provided: bool = False
    activities_count: int = 0
    last_activity_days: int = 999
    utm_source:       Optional[str] = None
    country:          Optional[str] = None

class ScoreResponse(BaseModel):
    score:       float
    probability: float
    shap:        Dict[str, float]

FEATURE_NAMES = [
    "annual_revenue", "employee_count", "email_provided", "phone_provided",
    "linkedin_provided", "activities_count", "last_activity_days",
    "is_referral", "has_company",
]

def features_to_vector(f: LeadFeatures) -> np.ndarray:
    return np.array([[
        f.annual_revenue / 1_000_000,
        f.employee_count / 100,
        int(f.email_provided),
        int(f.phone_provided),
        int(f.linkedin_provided),
        min(f.activities_count, 20),
        min(f.last_activity_days, 365),
        int(f.source == "REFERRAL"),
        int(bool(f.company)),
    ]])

@app.post("/predict/lead-score", response_model=ScoreResponse)
async def predict_lead_score(features: LeadFeatures):
    model = MODELS.get("lead_score")
    if model is None:
        raise HTTPException(status_code=503, detail="Lead scoring model not loaded")

    X = features_to_vector(features)
    probability = float(model.predict_proba(X)[0][1])
    score = probability * 100

    # SHAP values for explainability
    try:
        import shap
        explainer = shap.TreeExplainer(model)
        shap_vals = explainer.shap_values(X)[1][0]
        shap_dict = dict(zip(FEATURE_NAMES, [float(v) for v in shap_vals]))
    except Exception:
        shap_dict = {}

    return ScoreResponse(score=score, probability=probability, shap=shap_dict)

# ── Win Probability ────────────────────────────────────────────────────────────

class DealFeatures(BaseModel):
    amount:             float
    days_in_stage:      int
    activities_count:   int
    email_count:        int
    call_count:         int
    days_to_close:      int
    stage_probability:  float
    meddic_score:       int
    has_champion:       bool
    has_economic_buyer: bool
    competitor_count:   int

class WinProbResponse(BaseModel):
    probability: float
    confidence:  str
    risk_factors: List[str]

@app.post("/predict/win-probability", response_model=WinProbResponse)
async def predict_win_probability(features: DealFeatures):
    model = MODELS.get("win_probability")
    if model is None:
        raise HTTPException(status_code=503, detail="Win probability model not loaded")

    X = np.array([[
        features.amount / 100_000,
        features.days_in_stage,
        features.activities_count,
        features.email_count + features.call_count,
        features.days_to_close,
        features.stage_probability / 100,
        features.meddic_score / 100,
        int(features.has_champion),
        int(features.has_economic_buyer),
        features.competitor_count,
    ]])

    probability = float(model.predict_proba(X)[0][1])

    risk_factors = []
    if not features.has_champion:
        risk_factors.append("No champion identified")
    if not features.has_economic_buyer:
        risk_factors.append("Economic buyer not engaged")
    if features.days_in_stage > 30:
        risk_factors.append("Deal is stagnating in current stage")
    if features.activities_count < 3:
        risk_factors.append("Low engagement / activity count")
    if features.competitor_count > 1:
        risk_factors.append("Competitive deal with multiple competitors")

    confidence = "HIGH" if abs(probability - 0.5) > 0.3 else "MEDIUM" if abs(probability - 0.5) > 0.15 else "LOW"

    return WinProbResponse(probability=probability, confidence=confidence, risk_factors=risk_factors)

# ── Health ─────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "models_loaded": list(MODELS.keys())}

@app.get("/ready")
async def ready():
    if not MODELS:
        raise HTTPException(status_code=503, detail="No models loaded")
    return {"status": "ready", "models": list(MODELS.keys())}
```


---

## 52. Remaining Service Prisma Schemas

### 52.1 Analytics Service (`services/analytics-service/prisma/schema.prisma`)

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../../../node_modules/.prisma/analytics-client"
}

datasource db {
  provider = "postgresql"
  url      = env("ANALYTICS_DATABASE_URL")
}

model Report {
  id          String   @id @default(cuid())
  tenantId    String
  createdById String
  name        String
  description String?
  type        String   @default("CUSTOM")
  config      Json     @default("{}")
  schedule    String?
  isPublic    Boolean  @default(false)
  lastRunAt   DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@unique([tenantId, name])
  @@index([tenantId])
}

model Goal {
  id         String   @id @default(cuid())
  tenantId   String
  userId     String?
  teamId     String?
  name       String
  type       String
  targetValue Decimal @db.Decimal(18, 2)
  currentValue Decimal @default(0) @db.Decimal(18, 2)
  period     String
  startDate  DateTime
  endDate    DateTime
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  @@index([tenantId, userId])
  @@index([tenantId, period])
}

model Forecast {
  id           String   @id @default(cuid())
  tenantId     String
  period       String
  type         String   @default("REVENUE")
  commitAmount Decimal  @db.Decimal(18, 2)
  bestCase     Decimal  @db.Decimal(18, 2)
  pipeline     Decimal  @db.Decimal(18, 2)
  aiPredicted  Decimal? @db.Decimal(18, 2)
  quota        Decimal? @db.Decimal(18, 2)
  submittedById String?
  submittedAt  DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  @@unique([tenantId, period, type])
  @@index([tenantId])
}
```

### 52.2 Realtime Service (`services/realtime-service/prisma/schema.prisma`)

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../../../node_modules/.prisma/realtime-client"
}

datasource db {
  provider = "postgresql"
  url      = env("REALTIME_DATABASE_URL")
}

model Presence {
  id         String   @id @default(cuid())
  tenantId   String
  userId     String
  socketId   String
  page       String?
  entityType String?
  entityId   String?
  lastSeenAt DateTime @default(now())
  @@unique([tenantId, socketId])
  @@index([tenantId, userId])
  @@index([tenantId, entityType, entityId])
}

model TypingIndicator {
  id         String   @id @default(cuid())
  tenantId   String
  userId     String
  entityType String
  entityId   String
  startedAt  DateTime @default(now())
  @@unique([tenantId, userId, entityType, entityId])
}
```

### 52.3 Search Service (`services/search-service/prisma/schema.prisma`)

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../../../node_modules/.prisma/search-client"
}

datasource db {
  provider = "postgresql"
  url      = env("SEARCH_DATABASE_URL")
}

model SearchIndex {
  id          String   @id @default(cuid())
  tenantId    String
  entityType  String
  lastIndexedAt DateTime?
  totalRecords Int      @default(0)
  status      String   @default("IDLE")
  errorMessage String?
  @@unique([tenantId, entityType])
}

model SavedSearch {
  id         String   @id @default(cuid())
  tenantId   String
  userId     String
  name       String
  entity     String
  filters    Json     @default("{}")
  isDefault  Boolean  @default(false)
  createdAt  DateTime @default(now())
  @@index([tenantId, userId])
}
```

### 52.4 Storage Service (`services/storage-service/prisma/schema.prisma`)

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../../../node_modules/.prisma/storage-client"
}

datasource db {
  provider = "postgresql"
  url      = env("STORAGE_DATABASE_URL")
}

model FileRecord {
  id           String   @id @default(cuid())
  tenantId     String
  uploadedById String
  name         String
  originalName String
  mimeType     String
  sizeBytes    BigInt
  bucket       String
  objectKey    String
  checksum     String?
  category     String?
  entityType   String?
  entityId     String?
  isPublic     Boolean  @default(false)
  expiresAt    DateTime?
  metadata     Json     @default("{}")
  createdAt    DateTime @default(now())
  @@index([tenantId])
  @@index([tenantId, entityType, entityId])
  @@index([tenantId, uploadedById])
}

model FileVersion {
  id         String     @id @default(cuid())
  fileId     String
  file       FileRecord @relation(fields: [fileId], references: [id], onDelete: Cascade)
  version    Int
  objectKey  String
  sizeBytes  BigInt
  createdAt  DateTime   @default(now())
  @@unique([fileId, version])
}
```

---

## 53. Frontend Component Library (`apps/web/src/components/`)

```
components/
├── ui/                             # Base shadcn/ui wrappers + extensions
│   ├── button.tsx
│   ├── input.tsx
│   ├── select.tsx
│   ├── combobox.tsx
│   ├── date-picker.tsx
│   ├── data-table.tsx              # Tanstack Table with sorting/filtering
│   ├── dialog.tsx
│   ├── drawer.tsx
│   ├── command.tsx                 # Command palette base
│   ├── badge.tsx
│   ├── avatar.tsx
│   ├── card.tsx
│   ├── tabs.tsx
│   ├── timeline.tsx                # Activity timeline UI
│   ├── currency-input.tsx
│   ├── percentage-input.tsx
│   ├── phone-input.tsx
│   ├── rich-text-editor.tsx        # Tiptap-based
│   ├── file-upload.tsx
│   └── empty-state.tsx
│
├── layout/
│   ├── app-shell.tsx               # Main layout: sidebar + topbar
│   ├── sidebar.tsx                 # Navigation sidebar with sections
│   ├── topbar.tsx                  # Header: search, notifications, user menu
│   ├── page-header.tsx             # Page title + actions bar
│   └── command-palette.tsx         # Global ⌘K search
│
├── leads/
│   ├── lead-table.tsx              # Full leads data table
│   ├── lead-kanban.tsx             # Kanban board view
│   ├── lead-card.tsx               # Kanban card
│   ├── lead-form.tsx               # Create/edit form (React Hook Form + Zod)
│   ├── lead-detail-header.tsx      # Lead page header with key info
│   ├── lead-convert-dialog.tsx     # Convert to contact/account/deal
│   ├── lead-score-badge.tsx        # AI score display
│   └── lead-import-wizard.tsx      # Multi-step CSV import
│
├── contacts/
│   ├── contact-table.tsx
│   ├── contact-form.tsx
│   ├── contact-card.tsx            # Compact card for lists
│   ├── contact-360.tsx             # 360° view panel
│   ├── contact-timeline.tsx
│   └── contact-merge-dialog.tsx
│
├── accounts/
│   ├── account-table.tsx
│   ├── account-form.tsx
│   ├── account-360.tsx             # Full 360 view with all related entities
│   ├── account-hierarchy.tsx       # Parent/child account tree
│   ├── account-health-card.tsx     # Health score widget
│   └── account-import-wizard.tsx
│
├── deals/
│   ├── pipeline-board.tsx          # Main Kanban pipeline (DnD Kit)
│   ├── pipeline-column.tsx         # Single stage column
│   ├── deal-card.tsx               # Kanban deal card
│   ├── deal-table.tsx
│   ├── deal-form.tsx
│   ├── deal-detail-panel.tsx       # Right-side detail panel
│   ├── deal-stage-move.tsx         # Stage change dialog with validations
│   ├── deal-won-dialog.tsx
│   ├── deal-lost-dialog.tsx
│   ├── deal-meddic-form.tsx        # MEDDIC/MEDDPICC scorecard
│   ├── deal-ai-insights.tsx        # AI win probability + recommendations
│   ├── deal-forecast-tag.tsx       # Forecast category selector
│   └── deal-contacts.tsx           # Stakeholder management
│
├── quotes/
│   ├── quote-list.tsx
│   ├── quote-editor.tsx            # Full CPQ editor with line items
│   ├── quote-line-item.tsx         # Single line item row
│   ├── quote-pricing-summary.tsx   # Subtotal / discount / tax / total
│   ├── quote-pdf-preview.tsx       # PDF preview modal
│   ├── quote-approval-dialog.tsx
│   └── quote-accept-page.tsx       # Public page for customer acceptance
│
├── finance/
│   ├── invoice-table.tsx
│   ├── invoice-form.tsx
│   ├── invoice-line-item.tsx
│   ├── payment-record-dialog.tsx
│   ├── contract-form.tsx
│   ├── contract-timeline.tsx
│   ├── subscription-form.tsx
│   ├── subscription-card.tsx
│   ├── product-catalog-table.tsx
│   ├── commission-statement.tsx
│   └── revenue-dashboard.tsx
│
├── activities/
│   ├── activity-list.tsx
│   ├── activity-calendar.tsx       # FullCalendar integration
│   ├── activity-form.tsx
│   ├── activity-complete-dialog.tsx
│   └── activity-feed.tsx           # Compact feed for entity views
│
├── comms/
│   ├── inbox.tsx                   # Unified inbox
│   ├── email-thread.tsx
│   ├── email-compose.tsx           # Rich email composer
│   ├── call-player.tsx             # Audio player + transcript
│   ├── call-transcript.tsx         # Speaker-labelled transcript
│   ├── conversation-view.tsx       # Chat/WhatsApp view
│   └── message-bubble.tsx
│
├── automation/
│   ├── workflow-builder.tsx        # Visual flow builder (React Flow)
│   ├── workflow-node.tsx           # Custom node component
│   ├── workflow-node-config.tsx    # Node config panel
│   ├── blueprint-editor.tsx        # State machine visual editor
│   ├── blueprint-state.tsx
│   ├── sequence-editor.tsx
│   └── sequence-step.tsx
│
├── analytics/
│   ├── pipeline-chart.tsx          # Funnel/bar chart
│   ├── forecast-table.tsx          # Forecast by rep
│   ├── leaderboard-table.tsx
│   ├── revenue-chart.tsx           # MRR/ARR line chart
│   ├── win-loss-chart.tsx
│   ├── activity-heatmap.tsx
│   ├── cohort-table.tsx
│   ├── kpi-card.tsx                # Single metric card
│   └── wallboard.tsx               # Full-screen display board
│
├── ai/
│   ├── ai-chat.tsx                 # Sidebar AI chat panel
│   ├── ai-score-pill.tsx           # Inline score badge
│   ├── ai-insight-card.tsx         # Deal/account insight card
│   └── ai-next-action.tsx          # Recommended next action widget
│
└── shared/
    ├── owner-select.tsx            # User picker with avatar
    ├── tag-input.tsx               # Multi-tag input
    ├── custom-fields-renderer.tsx  # Dynamic custom field display/edit
    ├── record-link.tsx             # Clickable entity chip
    ├── currency-display.tsx        # Format currency with locale
    ├── relative-time.tsx           # "3 days ago" display
    ├── status-badge.tsx            # Coloured status pill
    ├── permission-gate.tsx         # Render children only if has permission
    └── loading-skeleton.tsx        # Page-level loading state
```

### 53.1 Key Component: Pipeline Board (`components/deals/pipeline-board.tsx`)

```typescript
'use client';

import { useState, useCallback } from 'react';
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors, closestCorners,
} from '@dnd-kit/core';
import { usePipelineDeals } from '@/hooks/use-deals';
import { usePipelineStore } from '@/stores/pipeline.store';
import { PipelineColumn } from './pipeline-column';
import { DealCard } from './deal-card';
import { useMoveDeal } from '@/hooks/use-deals';
import type { Deal, Stage } from '@nexus/shared-types';

interface PipelineBoardProps {
  pipelineId: string;
  stages:     Stage[];
}

export function PipelineBoard({ pipelineId, stages }: PipelineBoardProps) {
  const { data }    = usePipelineDeals(pipelineId);
  const moveDeal    = useMoveDeal();
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const deals = data?.data ?? [];

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const deal = deals.find((d) => d.id === event.active.id);
    setActiveDeal(deal ?? null);
  }, [deals]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDeal(null);

    if (!over || active.id === over.id) return;

    const deal    = deals.find((d) => d.id === active.id);
    const stageId = over.data.current?.stageId ?? over.id;

    if (deal && deal.stageId !== stageId) {
      moveDeal.mutate({ id: deal.id, stageId: String(stageId) });
    }
  }, [deals, moveDeal]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto h-full pb-4">
        {stages.map((stage) => (
          <PipelineColumn
            key={stage.id}
            stage={stage}
            deals={deals.filter((d) => d.stageId === stage.id)}
          />
        ))}
      </div>

      <DragOverlay>
        {activeDeal && <DealCard deal={activeDeal} isDragging />}
      </DragOverlay>
    </DndContext>
  );
}
```

### 53.2 Key Component: MEDDIC Form (`components/deals/deal-meddic-form.tsx`)

```typescript
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useUpdateDeal } from '@/hooks/use-deals';
import { Button } from '@/components/ui/button';
import type { MeddicicData } from '@nexus/shared-types';

const MeddicicSchema = z.object({
  metrics:        z.object({ score: z.number().min(0).max(10), notes: z.string() }),
  economicBuyer:  z.object({ identified: z.boolean(), name: z.string().optional(), notes: z.string() }),
  decisionCriteria: z.object({ score: z.number().min(0).max(10), notes: z.string() }),
  decisionProcess:  z.object({ score: z.number().min(0).max(10), notes: z.string() }),
  paperProcess:     z.object({ score: z.number().min(0).max(10), notes: z.string() }),
  identifyPain:     z.object({ score: z.number().min(0).max(10), notes: z.string() }),
  champion:         z.object({ identified: z.boolean(), name: z.string().optional(), notes: z.string() }),
  competition:      z.object({ identified: z.boolean(), competitors: z.array(z.string()), notes: z.string() }),
});

interface DealMeddicicFormProps {
  dealId: string;
  initialData?: MeddicicData;
  onSaved?: () => void;
}

export function DealMeddicicForm({ dealId, initialData, onSaved }: DealMeddicicFormProps) {
  const update = useUpdateDeal();

  const form = useForm<MeddicicData>({
    resolver: zodResolver(MeddicicSchema),
    defaultValues: initialData ?? {
      metrics:          { score: 0, notes: '' },
      economicBuyer:    { identified: false, notes: '' },
      decisionCriteria: { score: 0, notes: '' },
      decisionProcess:  { score: 0, notes: '' },
      paperProcess:     { score: 0, notes: '' },
      identifyPain:     { score: 0, notes: '' },
      champion:         { identified: false, notes: '' },
      competition:      { identified: false, competitors: [], notes: '' },
    },
  });

  const totalScore = Object.values(form.watch()).reduce((sum, field) => {
    if (typeof field === 'object' && 'score' in field) return sum + (field.score ?? 0);
    if (typeof field === 'object' && 'identified' in field) return sum + (field.identified ? 10 : 0);
    return sum;
  }, 0);

  const handleSubmit = form.handleSubmit(async (data) => {
    await update.mutateAsync({
      id: dealId,
      data: {
        meddicicData: data,
        meddicicScore: Math.round(totalScore),
      },
    });
    onSaved?.();
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">MEDDIC / MEDDPICC Scorecard</h3>
        <div className="text-2xl font-bold text-blue-600">
          {totalScore}<span className="text-sm text-gray-500 ml-1">/ 80</span>
        </div>
      </div>
      {/* Individual MEDDIC field sections rendered here */}
      <Button type="submit" loading={update.isPending}>Save MEDDIC Data</Button>
    </form>
  );
}
```

---

## 54. Real-Time Layer (`services/realtime-service/src/`)

### 54.1 Server Bootstrap (`src/index.ts`)

```typescript
import { createServer } from 'http';
import { Server as SocketIoServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { verifyToken } from './auth';
import { registerHandlers } from './handlers';

const httpServer = createServer();
const io = new SocketIoServer(httpServer, {
  cors: {
    origin: (process.env.CORS_ORIGINS ?? '').split(','),
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 20_000,
  pingInterval: 10_000,
});

// Redis adapter for horizontal scaling
const pubClient  = createClient({ url: process.env.REDIS_URL });
const subClient  = pubClient.duplicate();
await Promise.all([pubClient.connect(), subClient.connect()]);
io.adapter(createAdapter(pubClient, subClient));

// ── Authentication middleware ──────────────────────────────────────────────

io.use(async (socket, next) => {
  const token = socket.handshake.auth.token as string | undefined;
  if (!token) return next(new Error('UNAUTHORIZED'));

  const payload = await verifyToken(token).catch(() => null);
  if (!payload) return next(new Error('UNAUTHORIZED'));

  socket.data.tenantId = payload.tenantId;
  socket.data.userId   = payload.sub;
  socket.data.roles    = payload.roles;
  next();
});

// ── Connection handler ─────────────────────────────────────────────────────

io.on('connection', (socket) => {
  const { tenantId, userId } = socket.data as { tenantId: string; userId: string };

  // Join tenant room for broadcasts
  socket.join(`tenant:${tenantId}`);
  socket.join(`user:${tenantId}:${userId}`);

  registerHandlers(io, socket);

  socket.on('disconnect', () => {
    // Clean up presence
    pubClient.publish('presence:left', JSON.stringify({ tenantId, userId, socketId: socket.id }));
  });
});

httpServer.listen(Number(process.env.PORT ?? 3007), '0.0.0.0');
console.log(`Realtime service listening on port ${process.env.PORT ?? 3007}`);
```

### 54.2 Event Handlers (`src/handlers/index.ts`)

```typescript
import { Server, Socket } from 'socket.io';

export function registerHandlers(io: Server, socket: Socket): void {
  const { tenantId, userId } = socket.data as { tenantId: string; userId: string };

  // ── Presence ────────────────────────────────────────────────────────────

  socket.on('presence:join', (data: { page: string; entityType?: string; entityId?: string }) => {
    if (data.entityType && data.entityId) {
      socket.join(`${data.entityType}:${tenantId}:${data.entityId}`);
      socket.to(`${data.entityType}:${tenantId}:${data.entityId}`).emit('presence:user_viewing', {
        userId,
        page:       data.page,
        entityType: data.entityType,
        entityId:   data.entityId,
      });
    }
  });

  socket.on('presence:leave', (data: { entityType?: string; entityId?: string }) => {
    if (data.entityType && data.entityId) {
      socket.leave(`${data.entityType}:${tenantId}:${data.entityId}`);
      socket.to(`${data.entityType}:${tenantId}:${data.entityId}`).emit('presence:user_left', { userId });
    }
  });

  // ── Typing indicators ────────────────────────────────────────────────────

  socket.on('typing:start', (data: { entityType: string; entityId: string }) => {
    socket.to(`${data.entityType}:${tenantId}:${data.entityId}`)
          .emit('typing:user_started', { userId });
  });

  socket.on('typing:stop', (data: { entityType: string; entityId: string }) => {
    socket.to(`${data.entityType}:${tenantId}:${data.entityId}`)
          .emit('typing:user_stopped', { userId });
  });

  // ── Live pipeline board ──────────────────────────────────────────────────

  socket.on('pipeline:subscribe', (pipelineId: string) => {
    socket.join(`pipeline:${tenantId}:${pipelineId}`);
  });

  socket.on('pipeline:unsubscribe', (pipelineId: string) => {
    socket.leave(`pipeline:${tenantId}:${pipelineId}`);
  });
}

// ── Server-side event broadcaster (called from other services via Redis pub/sub) ──

export function broadcastToTenant(
  io: Server,
  tenantId: string,
  event: string,
  data: unknown
): void {
  io.to(`tenant:${tenantId}`).emit(event, data);
}

export function broadcastToUser(
  io: Server,
  tenantId: string,
  userId: string,
  event: string,
  data: unknown
): void {
  io.to(`user:${tenantId}:${userId}`).emit(event, data);
}

export function broadcastToEntity(
  io: Server,
  tenantId: string,
  entityType: string,
  entityId: string,
  event: string,
  data: unknown
): void {
  io.to(`${entityType}:${tenantId}:${entityId}`).emit(event, data);
}
```

### 54.3 Frontend Socket Client (`apps/web/src/lib/socket.ts`)

```typescript
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/stores/auth.store';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const token = useAuthStore.getState().accessToken;
    socket = io(process.env.NEXT_PUBLIC_REALTIME_URL ?? 'http://localhost:3007', {
      auth: { token },
      transports: ['websocket'],
      autoConnect: false,
    });

    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
    });
  }
  return socket;
}

export function connectSocket(): void {
  const s = getSocket();
  if (!s.connected) s.connect();
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
```

### 54.4 React Hook for Real-Time (`apps/web/src/hooks/use-realtime.ts`)

```typescript
import { useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket, connectSocket } from '@/lib/socket';
import { dealKeys } from './use-deals';
import { leadKeys } from './use-leads';

export function useRealtimeSetup(tenantId: string): void {
  const qc = useQueryClient();

  useEffect(() => {
    connectSocket();
    const socket = getSocket();

    // ── Deal events ──────────────────────────────────────────────────────
    socket.on('deal.created',       () => qc.invalidateQueries({ queryKey: dealKeys.lists() }));
    socket.on('deal.updated',       (d: { id: string }) => {
      qc.invalidateQueries({ queryKey: dealKeys.detail(d.id) });
      qc.invalidateQueries({ queryKey: dealKeys.lists() });
    });
    socket.on('deal.stage_changed', () => qc.invalidateQueries({ queryKey: dealKeys.lists() }));
    socket.on('deal.won',           () => qc.invalidateQueries({ queryKey: dealKeys.lists() }));
    socket.on('deal.lost',          () => qc.invalidateQueries({ queryKey: dealKeys.lists() }));

    // ── Lead events ──────────────────────────────────────────────────────
    socket.on('lead.created', () => qc.invalidateQueries({ queryKey: leadKeys.lists() }));
    socket.on('lead.updated', (d: { id: string }) => {
      qc.invalidateQueries({ queryKey: leadKeys.detail(d.id) });
    });

    // ── Notification events ──────────────────────────────────────────────
    socket.on('notification.new', () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    });

    return () => {
      socket.off('deal.created');
      socket.off('deal.updated');
      socket.off('deal.stage_changed');
      socket.off('deal.won');
      socket.off('deal.lost');
      socket.off('lead.created');
      socket.off('lead.updated');
      socket.off('notification.new');
    };
  }, [qc, tenantId]);
}

export function useEntityPresence(entityType: string, entityId: string) {
  useEffect(() => {
    if (!entityId) return;
    const socket = getSocket();
    socket.emit('presence:join', { entityType, entityId });
    return () => {
      socket.emit('presence:leave', { entityType, entityId });
    };
  }, [entityType, entityId]);
}
```

---

## 55. Kong API Gateway Config (`infrastructure/kong/kong.yml`)

```yaml
_format_version: "3.0"
_transform: true

services:
  - name: auth-service
    url: http://auth-service:3010
    routes:
      - name: auth-routes
        paths: ["/api/v1/auth", "/api/v1/users", "/api/v1/roles", "/api/v1/api-keys", "/api/v1/audit-logs", "/api/v1/tenants"]
        strip_path: false
    plugins:
      - name: rate-limiting
        config:
          minute: 60
          policy: redis
          redis_host: redis
          redis_port: 6379

  - name: crm-service
    url: http://crm-service:3001
    routes:
      - name: crm-routes
        paths: ["/api/v1/leads", "/api/v1/contacts", "/api/v1/accounts", "/api/v1/deals", "/api/v1/activities", "/api/v1/notes", "/api/v1/quotes", "/api/v1/pipelines", "/api/v1/custom-fields"]
        strip_path: false
    plugins:
      - name: rate-limiting
        config:
          minute: 300
          policy: redis
          redis_host: redis
          redis_port: 6379
      - name: request-size-limiting
        config:
          allowed_payload_size: 10

  - name: finance-service
    url: http://finance-service:3002
    routes:
      - name: finance-routes
        paths: ["/api/v1/products", "/api/v1/contracts", "/api/v1/subscriptions", "/api/v1/invoices", "/api/v1/payments", "/api/v1/commission-plans", "/api/v1/commissions", "/api/v1/revenue"]
        strip_path: false

  - name: ai-service
    url: http://ai-service:3003
    routes:
      - name: ai-routes
        paths: ["/api/v1/ai"]
        strip_path: false
    plugins:
      - name: rate-limiting
        config:
          minute: 30
          policy: redis
          redis_host: redis
          redis_port: 6379

  - name: comms-service
    url: http://comms-service:3004
    routes:
      - name: comms-routes
        paths: ["/api/v1/email-accounts", "/api/v1/emails", "/api/v1/email-templates", "/api/v1/calls", "/api/v1/conversations"]
        strip_path: false
      - name: comms-webhooks
        paths: ["/webhooks"]
        strip_path: false

  - name: workflow-engine
    url: http://workflow-engine:3005
    routes:
      - name: workflow-routes
        paths: ["/api/v1/workflows", "/api/v1/executions", "/api/v1/blueprints", "/api/v1/sequences"]
        strip_path: false

  - name: analytics-service
    url: http://analytics-service:3006
    routes:
      - name: analytics-routes
        paths: ["/api/v1/analytics"]
        strip_path: false

  - name: search-service
    url: http://search-service:3008
    routes:
      - name: search-routes
        paths: ["/api/v1/search"]
        strip_path: false

  - name: storage-service
    url: http://storage-service:3009
    routes:
      - name: storage-routes
        paths: ["/api/v1/storage"]
        strip_path: false
    plugins:
      - name: request-size-limiting
        config:
          allowed_payload_size: 100

  - name: notification-service
    url: http://notification-service:3011
    routes:
      - name: notification-routes
        paths: ["/api/v1/notifications"]
        strip_path: false

  - name: integration-service
    url: http://integration-service:3012
    routes:
      - name: integration-routes
        paths: ["/api/v1/integrations", "/api/v1/webhooks"]
        strip_path: false

  - name: partner-service
    url: http://partner-service:3013
    routes:
      - name: partner-routes
        paths: ["/api/v1/partners"]
        strip_path: false

plugins:
  - name: correlation-id
    config:
      header_name: X-Request-ID
      generator: uuid
      echo_downstream: true

  - name: prometheus
    config:
      status_code_metrics: true
      latency_metrics: true
      bandwidth_metrics: true

  - name: request-transformer
    config:
      add:
        headers:
          - "X-Forwarded-By:kong"
```

---

## 56. Kubernetes Deployment Manifests

### 56.1 CRM Service Deployment (`infrastructure/k8s/services/crm-service.yaml`)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: crm-service
  namespace: nexus
  labels:
    app: crm-service
    version: v1
spec:
  replicas: 3
  selector:
    matchLabels:
      app: crm-service
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    metadata:
      labels:
        app: crm-service
        version: v1
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port:   "3001"
        prometheus.io/path:   "/metrics"
    spec:
      serviceAccountName: nexus-service-account
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        fsGroup: 1000
      containers:
        - name: crm-service
          image: nexus/crm-service:latest
          imagePullPolicy: Always
          ports:
            - containerPort: 3001
              name: http
          env:
            - name: NODE_ENV
              value: "production"
            - name: PORT
              value: "3001"
            - name: CRM_DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: nexus-secrets
                  key: crm-database-url
            - name: JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: nexus-secrets
                  key: jwt-secret
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: nexus-secrets
                  key: redis-url
            - name: KAFKA_BROKERS
              valueFrom:
                configMapKeyRef:
                  name: nexus-config
                  key: kafka-brokers
            - name: INTERNAL_SERVICE_KEY
              valueFrom:
                secretKeyRef:
                  name: nexus-secrets
                  key: internal-service-key
          resources:
            requests:
              cpu:    "100m"
              memory: "256Mi"
            limits:
              cpu:    "500m"
              memory: "512Mi"
          livenessProbe:
            httpGet:
              path: /health
              port: 3001
            initialDelaySeconds: 15
            periodSeconds: 30
            timeoutSeconds: 5
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /ready
              port: 3001
            initialDelaySeconds: 10
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 3
          volumeMounts:
            - name: tmp
              mountPath: /tmp
      volumes:
        - name: tmp
          emptyDir: {}
      topologySpreadConstraints:
        - maxSkew: 1
          topologyKey: kubernetes.io/hostname
          whenUnsatisfiable: DoNotSchedule
          labelSelector:
            matchLabels:
              app: crm-service
---
apiVersion: v1
kind: Service
metadata:
  name: crm-service
  namespace: nexus
spec:
  selector:
    app: crm-service
  ports:
    - port: 3001
      targetPort: 3001
      name: http
  type: ClusterIP
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: crm-service-hpa
  namespace: nexus
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: crm-service
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

### 56.2 Namespace & RBAC (`infrastructure/k8s/base/namespace.yaml`)

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: nexus
  labels:
    app: nexus-crm
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: nexus-service-account
  namespace: nexus
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: nexus-pod-reader
  namespace: nexus
rules:
  - apiGroups: [""]
    resources: ["pods", "services", "configmaps"]
    verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: nexus-pod-reader-binding
  namespace: nexus
subjects:
  - kind: ServiceAccount
    name: nexus-service-account
    namespace: nexus
roleRef:
  kind: Role
  name: nexus-pod-reader
  apiGroup: rbac.authorization.k8s.io
```

### 56.3 ConfigMap (`infrastructure/k8s/base/configmap.yaml`)

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: nexus-config
  namespace: nexus
data:
  kafka-brokers:       "kafka-0.kafka-headless:9092,kafka-1.kafka-headless:9092,kafka-2.kafka-headless:9092"
  meilisearch-url:     "http://meilisearch:7700"
  keycloak-url:        "http://keycloak:8080"
  keycloak-realm:      "nexus"
  ollama-url:          "http://ollama:11434"
  cors-origins:        "https://app.nexus.internal"
  log-level:           "info"
```

---

## 57. GitHub Actions CI/CD (`.github/workflows/ci.yml`)

```yaml
name: CI/CD

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

env:
  REGISTRY:    ghcr.io
  IMAGE_NAME:  ${{ github.repository }}

jobs:
  # ── Lint & Type-check ────────────────────────────────────────────────────

  lint-typecheck:
    name: Lint & Typecheck
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo typecheck
      - run: pnpm turbo lint

  # ── Tests ─────────────────────────────────────────────────────────────────

  test:
    name: Tests
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER:     nexus
          POSTGRES_PASSWORD: nexus
          POSTGRES_DB:       nexus_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7-alpine
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo db:generate
      - run: pnpm turbo test
        env:
          CRM_DATABASE_URL:      postgresql://nexus:nexus@localhost:5432/nexus_test
          FINANCE_DATABASE_URL:  postgresql://nexus:nexus@localhost:5432/nexus_test
          REDIS_URL:             redis://localhost:6379
          JWT_SECRET:            test-secret-minimum-32-characters-long

  # ── Build & Push Docker Images ────────────────────────────────────────────

  build:
    name: Build (${{ matrix.service }})
    runs-on: ubuntu-latest
    needs: [lint-typecheck, test]
    if: github.ref == 'refs/heads/main'
    strategy:
      matrix:
        service:
          - crm-service
          - finance-service
          - ai-service
          - comms-service
          - workflow-engine
          - analytics-service
          - realtime-service
          - search-service
          - storage-service
          - auth-service
          - notification-service
          - integration-service
          - partner-service
          - compliance-service
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          context:    .
          file:       services/${{ matrix.service }}/Dockerfile
          push:       true
          tags:       ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}/${{ matrix.service }}:${{ github.sha }},${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}/${{ matrix.service }}:latest
          cache-from: type=gha
          cache-to:   type=gha,mode=max
          build-args: |
            SERVICE=${{ matrix.service }}

  # ── Deploy to Staging ─────────────────────────────────────────────────────

  deploy-staging:
    name: Deploy to Staging
    runs-on: ubuntu-latest
    needs: [build]
    environment: staging
    steps:
      - uses: actions/checkout@v4
      - name: Update K8s image tags
        run: |
          for service in crm-service finance-service ai-service comms-service \
                         workflow-engine analytics-service realtime-service \
                         search-service storage-service auth-service \
                         notification-service integration-service; do
            kubectl set image deployment/$service \
              $service=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}/$service:${{ github.sha }} \
              -n nexus-staging
          done
        env:
          KUBECONFIG: ${{ secrets.KUBECONFIG_STAGING }}

  # ── Deploy to Production (manual approval) ────────────────────────────────

  deploy-production:
    name: Deploy to Production
    runs-on: ubuntu-latest
    needs: [deploy-staging]
    environment:
      name: production
      url: https://app.nexus.com
    steps:
      - uses: actions/checkout@v4
      - name: ArgoCD sync
        run: |
          argocd app sync nexus-crm \
            --revision ${{ github.sha }} \
            --server ${{ secrets.ARGOCD_SERVER }} \
            --auth-token ${{ secrets.ARGOCD_TOKEN }}
```

---

## 58. Testing Patterns

### 58.1 Unit Test — CPQ Engine (`services/finance-service/src/cpq/__tests__/pricing-engine.test.ts`)

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CpqPricingEngine } from '../pricing-engine';
import type { PrismaClient } from '@prisma/client';

const mockPrisma = {
  product: {
    findMany: vi.fn(),
  },
  account: {
    findFirst: vi.fn(),
  },
} as unknown as PrismaClient;

const sampleProducts = [
  {
    id: 'prod-1',
    sku: 'CRM-PRO',
    name: 'CRM Pro',
    listPrice: '1000.00',
    billingType: 'RECURRING',
    taxable: true,
    pricingRules: [],
    priceTiers: [
      { minQty: 1,  maxQty: 9,  unitPrice: '1000.00' },
      { minQty: 10, maxQty: 49, unitPrice: '900.00'  },
      { minQty: 50, maxQty: null, unitPrice: '800.00' },
    ],
  },
];

describe('CpqPricingEngine', () => {
  let engine: CpqPricingEngine;

  beforeEach(() => {
    engine = new CpqPricingEngine(mockPrisma);
    vi.mocked(mockPrisma.product.findMany).mockResolvedValue(sampleProducts as never);
  });

  it('applies tier 1 discount for qty 1', async () => {
    vi.mocked(mockPrisma.account.findFirst).mockResolvedValue({ tier: 'SMB' } as never);

    const result = await engine.calculate({
      tenantId:  'tenant-1',
      accountId: 'acc-1',
      currency:  'USD',
      items:     [{ productId: 'prod-1', quantity: 1 }],
    });

    expect(result.items[0].unitPrice).toBeLessThan(1000); // SMB 5% discount
    expect(result.items[0].quantity).toBe(1);
  });

  it('applies volume tier price for qty >= 10', async () => {
    vi.mocked(mockPrisma.account.findFirst).mockResolvedValue({ tier: 'SMB' } as never);

    const result = await engine.calculate({
      tenantId:  'tenant-1',
      accountId: 'acc-1',
      currency:  'USD',
      items:     [{ productId: 'prod-1', quantity: 10 }],
    });

    // Volume tier: 900 baseline, then 5% SMB discount
    expect(result.items[0].unitPrice).toBeLessThanOrEqual(900);
  });

  it('applies ENTERPRISE 15% tier discount', async () => {
    vi.mocked(mockPrisma.account.findFirst).mockResolvedValue({ tier: 'ENTERPRISE' } as never);

    const result = await engine.calculate({
      tenantId:  'tenant-1',
      accountId: 'acc-1',
      currency:  'USD',
      items:     [{ productId: 'prod-1', quantity: 1 }],
    });

    expect(result.items[0].discountPercent).toBeGreaterThanOrEqual(15);
    expect(result.appliedRules.some((r) => r.includes('ENTERPRISE'))).toBe(true);
  });

  it('flags approval_required for manual override below floor', async () => {
    vi.mocked(mockPrisma.account.findFirst).mockResolvedValue({ tier: 'SMB' } as never);

    const result = await engine.calculate({
      tenantId:  'tenant-1',
      accountId: 'acc-1',
      currency:  'USD',
      items:     [{ productId: 'prod-1', quantity: 1, manualOverridePrice: 100 }],
    });

    expect(result.approvalRequired).toBe(true);
    expect(result.approvalReasons.length).toBeGreaterThan(0);
  });

  it('calculates totals correctly', async () => {
    vi.mocked(mockPrisma.account.findFirst).mockResolvedValue({ tier: 'SMB' } as never);

    const result = await engine.calculate({
      tenantId:  'tenant-1',
      accountId: 'acc-1',
      currency:  'USD',
      items:     [{ productId: 'prod-1', quantity: 5 }],
    });

    const expectedSubtotal = result.items.reduce((s, i) => s + i.total, 0);
    expect(result.subtotal).toBeCloseTo(expectedSubtotal, 2);
  });
});
```

### 58.2 Integration Test — Deal API (`services/crm-service/src/__tests__/deals.test.ts`)

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from '../app';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiJ9...'; // pre-signed test token

beforeAll(async () => {
  app = await build({ testing: true });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('POST /api/v1/deals', () => {
  it('creates a deal and returns 201', async () => {
    const response = await app.inject({
      method:  'POST',
      url:     '/api/v1/deals',
      headers: { authorization: `Bearer ${TEST_TOKEN}` },
      payload: {
        name:     'Test Deal',
        accountId: 'test-account-id',
        pipelineId: 'test-pipeline-id',
        stageId:   'test-stage-id',
        ownerId:   'test-user-id',
        amount:    50000,
        currency:  'USD',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.id).toBeDefined();
    expect(body.data.name).toBe('Test Deal');
  });

  it('returns 422 for missing required fields', async () => {
    const response = await app.inject({
      method:  'POST',
      url:     '/api/v1/deals',
      headers: { authorization: `Bearer ${TEST_TOKEN}` },
      payload: { name: 'Incomplete Deal' }, // missing accountId, pipelineId, stageId, ownerId
    });

    expect(response.statusCode).toBe(422);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 401 without token', async () => {
    const response = await app.inject({
      method: 'POST',
      url:    '/api/v1/deals',
      payload: { name: 'Unauthorized Deal' },
    });

    expect(response.statusCode).toBe(401);
  });
});

describe('PATCH /api/v1/deals/:id/stage', () => {
  it('moves a deal to a new stage', async () => {
    const response = await app.inject({
      method:  'PATCH',
      url:     '/api/v1/deals/test-deal-id/stage',
      headers: { authorization: `Bearer ${TEST_TOKEN}` },
      payload: { stageId: 'test-stage-2-id' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.stageId).toBe('test-stage-2-id');
  });
});
```

### 58.3 E2E Test (`apps/web/e2e/deals.spec.ts`)

```typescript
import { test, expect } from '@playwright/test';

test.describe('Deal Pipeline', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.getByLabel('Email').fill('admin@nexus-test.com');
    await page.getByLabel('Password').fill('testpassword123');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForURL('/deals');
  });

  test('displays pipeline kanban board', async ({ page }) => {
    await expect(page.getByTestId('pipeline-board')).toBeVisible();
    await expect(page.getByTestId('pipeline-column')).toHaveCount.greaterThan(3);
  });

  test('creates a new deal', async ({ page }) => {
    await page.getByRole('button', { name: 'New Deal' }).click();
    await page.getByLabel('Deal Name').fill('E2E Test Deal');
    await page.getByLabel('Account').click();
    await page.getByRole('option').first().click();
    await page.getByLabel('Amount').fill('25000');
    await page.getByRole('button', { name: 'Create Deal' }).click();

    await expect(page.getByText('E2E Test Deal')).toBeVisible();
  });

  test('drags a deal card between stages', async ({ page }) => {
    const dealCard   = page.getByTestId('deal-card').first();
    const nextColumn = page.getByTestId('pipeline-column').nth(1);

    await dealCard.dragTo(nextColumn);
    await expect(nextColumn).toContainText(await dealCard.textContent() ?? '');
  });

  test('marks deal as won', async ({ page }) => {
    await page.getByTestId('deal-card').first().click();
    await page.getByRole('button', { name: 'Mark as Won' }).click();
    await page.getByRole('button', { name: 'Confirm' }).click();

    await expect(page.getByText('Deal Won')).toBeVisible();
  });
});
```

---

## 59. Mobile Architecture (`apps/mobile/`)

```
apps/mobile/
├── app.json                        # Expo config
├── App.tsx                         # Root component + Navigation
│
├── src/
│   ├── navigation/
│   │   ├── RootNavigator.tsx       # Auth / App stack split
│   │   ├── AppNavigator.tsx        # Bottom tabs + stack
│   │   └── types.ts                # Navigator param types
│   │
│   ├── screens/
│   │   ├── auth/
│   │   │   ├── LoginScreen.tsx
│   │   │   └── SSOScreen.tsx
│   │   ├── dashboard/
│   │   │   └── DashboardScreen.tsx
│   │   ├── leads/
│   │   │   ├── LeadsScreen.tsx
│   │   │   └── LeadDetailScreen.tsx
│   │   ├── deals/
│   │   │   ├── DealsScreen.tsx
│   │   │   └── DealDetailScreen.tsx
│   │   ├── contacts/
│   │   │   ├── ContactsScreen.tsx
│   │   │   └── ContactDetailScreen.tsx
│   │   ├── activities/
│   │   │   ├── ActivitiesScreen.tsx
│   │   │   └── ActivityDetailScreen.tsx
│   │   ├── calls/
│   │   │   ├── CallDialerScreen.tsx
│   │   │   └── CallRecordScreen.tsx
│   │   └── notifications/
│   │       └── NotificationsScreen.tsx
│   │
│   ├── components/
│   │   ├── deal-card.tsx
│   │   ├── contact-card.tsx
│   │   ├── activity-item.tsx
│   │   ├── metric-card.tsx
│   │   └── call-timer.tsx
│   │
│   ├── hooks/                      # Shared React Query hooks (same as web)
│   │   ├── use-deals.ts
│   │   ├── use-leads.ts
│   │   └── use-activities.ts
│   │
│   ├── lib/
│   │   ├── api-client.ts           # Axios client (same pattern, different base URL)
│   │   ├── auth.ts                 # Expo SecureStore token management
│   │   └── push-notifications.ts   # Expo Push Notifications setup
│   │
│   └── stores/                     # Same Zustand pattern
│       ├── auth.store.ts
│       └── ui.store.ts
│
├── app.config.ts                   # Expo config with EAS
└── eas.json                        # EAS Build profiles
```

### 59.1 Mobile Entry (`App.tsx`)

```typescript
import { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { RootNavigator } from './src/navigation/RootNavigator';
import { registerPushToken } from './src/lib/push-notifications';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
    },
  },
});

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  true,
  }),
});

export default function App() {
  useEffect(() => {
    registerPushToken();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    </QueryClientProvider>
  );
}
```

---

## 60. Docker Compose — Full Local Development (`docker-compose.yml`)

```yaml
version: "3.9"

services:
  # ── Databases ──────────────────────────────────────────────────────────────

  postgres:
    image: postgres:16-alpine
    container_name: nexus-postgres
    environment:
      POSTGRES_USER:     nexus
      POSTGRES_PASSWORD: nexus
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./infrastructure/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U nexus"]
      interval: 10s
      timeout:  5s
      retries:  5

  redis:
    image: redis:7-alpine
    container_name: nexus-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes

  clickhouse:
    image: clickhouse/clickhouse-server:24-alpine
    container_name: nexus-clickhouse
    ports:
      - "8123:8123"
      - "9000:9000"
    volumes:
      - clickhouse_data:/var/lib/clickhouse
      - ./infrastructure/clickhouse/init:/docker-entrypoint-initdb.d

  # ── Messaging ──────────────────────────────────────────────────────────────

  zookeeper:
    image: confluentinc/cp-zookeeper:7.6.1
    container_name: nexus-zookeeper
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
      ZOOKEEPER_TICK_TIME: 2000

  kafka:
    image: confluentinc/cp-kafka:7.6.1
    container_name: nexus-kafka
    depends_on: [zookeeper]
    ports:
      - "9092:9092"
    environment:
      KAFKA_BROKER_ID:                        1
      KAFKA_ZOOKEEPER_CONNECT:                zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS:             PLAINTEXT://localhost:9092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_AUTO_CREATE_TOPICS_ENABLE:        "true"
      KAFKA_LOG_RETENTION_HOURS:              168
    volumes:
      - kafka_data:/var/lib/kafka/data

  # ── Search ─────────────────────────────────────────────────────────────────

  meilisearch:
    image: getmeili/meilisearch:v1.9
    container_name: nexus-meilisearch
    ports:
      - "7700:7700"
    environment:
      MEILI_MASTER_KEY:  meilisearch-master-key
      MEILI_ENV:         development
    volumes:
      - meilisearch_data:/meili_data

  # ── Storage ────────────────────────────────────────────────────────────────

  minio:
    image: minio/minio:latest
    container_name: nexus-minio
    ports:
      - "9001:9001"
      - "9002:9002"
    environment:
      MINIO_ROOT_USER:     minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes:
      - minio_data:/data
    command: server /data --console-address ":9002"

  # ── Auth ───────────────────────────────────────────────────────────────────

  keycloak:
    image: quay.io/keycloak/keycloak:24.0.5
    container_name: nexus-keycloak
    ports:
      - "8080:8080"
    environment:
      KEYCLOAK_ADMIN:          admin
      KEYCLOAK_ADMIN_PASSWORD: admin
      KC_DB:                   postgres
      KC_DB_URL:               jdbc:postgresql://postgres:5432/keycloak
      KC_DB_USERNAME:          nexus
      KC_DB_PASSWORD:          nexus
    command: start-dev
    depends_on: [postgres]

  # ── Secrets ────────────────────────────────────────────────────────────────

  vault:
    image: hashicorp/vault:1.17
    container_name: nexus-vault
    ports:
      - "8200:8200"
    environment:
      VAULT_DEV_ROOT_TOKEN_ID: vault-dev-token
      VAULT_DEV_LISTEN_ADDRESS: 0.0.0.0:8200
    cap_add: [IPC_LOCK]

  # ── Feature Flags ──────────────────────────────────────────────────────────

  unleash:
    image: unleashorg/unleash-server:5
    container_name: nexus-unleash
    ports:
      - "4242:4242"
    environment:
      DATABASE_URL:  postgresql://nexus:nexus@postgres:5432/unleash
      INIT_ADMIN_API_TOKENS: unleash-admin-token
    depends_on: [postgres]

  # ── AI ─────────────────────────────────────────────────────────────────────

  ollama:
    image: ollama/ollama:latest
    container_name: nexus-ollama
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
    # GPU support: uncomment if CUDA available
    # deploy:
    #   resources:
    #     reservations:
    #       devices:
    #         - driver: nvidia
    #           count: 1
    #           capabilities: [gpu]

  # ── Observability ──────────────────────────────────────────────────────────

  prometheus:
    image: prom/prometheus:v2.53.1
    container_name: nexus-prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./infrastructure/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus

  grafana:
    image: grafana/grafana:11.1.0
    container_name: nexus-grafana
    ports:
      - "3030:3000"
    environment:
      GF_SECURITY_ADMIN_PASSWORD: admin
      GF_AUTH_ANONYMOUS_ENABLED:  "false"
    volumes:
      - grafana_data:/var/lib/grafana
      - ./infrastructure/grafana/dashboards:/etc/grafana/provisioning/dashboards
      - ./infrastructure/grafana/datasources:/etc/grafana/provisioning/datasources

  loki:
    image: grafana/loki:3.1.0
    container_name: nexus-loki
    ports:
      - "3100:3100"
    volumes:
      - loki_data:/loki
      - ./infrastructure/loki/loki-config.yml:/etc/loki/config.yml
    command: -config.file=/etc/loki/config.yml

  tempo:
    image: grafana/tempo:2.5.0
    container_name: nexus-tempo
    ports:
      - "3200:3200"
      - "4317:4317"
    volumes:
      - tempo_data:/tmp/tempo
      - ./infrastructure/tempo/tempo-config.yml:/etc/tempo/config.yml

  # ── Gateway ────────────────────────────────────────────────────────────────

  kong:
    image: kong:3.7-ubuntu
    container_name: nexus-kong
    ports:
      - "8000:8000"
      - "8443:8443"
      - "8001:8001"
    environment:
      KONG_DATABASE:       "off"
      KONG_DECLARATIVE_CONFIG: /kong/declarative/kong.yml
      KONG_PROXY_ACCESS_LOG:   /dev/stdout
      KONG_ADMIN_ACCESS_LOG:   /dev/stdout
      KONG_PROXY_ERROR_LOG:    /dev/stderr
      KONG_ADMIN_ERROR_LOG:    /dev/stderr
      KONG_ADMIN_LISTEN:       0.0.0.0:8001
    volumes:
      - ./infrastructure/kong/kong.yml:/kong/declarative/kong.yml

volumes:
  postgres_data:
  redis_data:
  clickhouse_data:
  kafka_data:
  meilisearch_data:
  minio_data:
  ollama_data:
  prometheus_data:
  grafana_data:
  loki_data:
  tempo_data:
```

### 60.1 Postgres Init Script (`infrastructure/postgres/init.sql`)

```sql
-- Create all service databases
CREATE DATABASE nexus_auth;
CREATE DATABASE nexus_crm;
CREATE DATABASE nexus_finance;
CREATE DATABASE nexus_workflow;
CREATE DATABASE nexus_comms;
CREATE DATABASE nexus_notification;
CREATE DATABASE nexus_integration;
CREATE DATABASE nexus_partner;
CREATE DATABASE nexus_compliance;
CREATE DATABASE nexus_analytics;
CREATE DATABASE nexus_realtime;
CREATE DATABASE nexus_search;
CREATE DATABASE nexus_storage;
CREATE DATABASE keycloak;
CREATE DATABASE unleash;

-- Grant access
GRANT ALL PRIVILEGES ON DATABASE nexus_auth TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_crm TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_finance TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_workflow TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_comms TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_notification TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_integration TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_partner TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_compliance TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_analytics TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_realtime TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_search TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_storage TO nexus;
GRANT ALL PRIVILEGES ON DATABASE keycloak TO nexus;
GRANT ALL PRIVILEGES ON DATABASE unleash TO nexus;

-- Enable pgcrypto for field-level encryption
\c nexus_crm
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- for LIKE-based text search

\c nexus_finance
CREATE EXTENSION IF NOT EXISTS pgcrypto;

\c nexus_auth
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

---

## 61. Cursor Project Instructions (`.cursorrules` / `CLAUDE.md`)

> Place this file at the repo root. Cursor will read it before every code generation.

```markdown
# NEXUS CRM — Cursor Coding Rules

## Project
Monorepo: pnpm workspaces + Turborepo.
15 Fastify microservices (TypeScript), 1 FastAPI ML service (Python),
1 Next.js 14 frontend, 1 React Native mobile app.

## Code Style
- TypeScript strict mode everywhere
- No `any` types — use `unknown` + type guards
- All functions must have explicit return types
- Prefer `const` over `let`, never `var`
- Use named exports only (no default exports in services)
- Arrow functions for handlers; class-based for engines/services

## File Conventions
- Service entry point: `src/index.ts`
- Route handlers: `src/routes/<entity>.routes.ts`
- Business logic: `src/services/<entity>.service.ts`
- Domain errors: throw `NexusError` subclasses from `@nexus/service-utils`
- Database queries: always via Prisma client, never raw SQL (except ClickHouse)
- Multi-tenancy: always pass `tenantId` from `request.requestContext` — NEVER from body/params

## API Response Format
Always return:
- Success: `{ success: true, data: T, meta?: {...} }`
- Error:   `{ success: false, error: { code, message, details?, requestId } }`
- Paginated: `{ success: true, data: T[], total, page, limit, totalPages }`

## Database
- Prisma 5 for all PostgreSQL services
- ClickHouse SQL for analytics (no ORM)
- Redis via ioredis for caching (TTL always required, never cache without TTL)
- All queries MUST include `tenantId` in WHERE clause
- Use Prisma transactions for multi-step writes

## Kafka
- Publish events after successful DB writes, not before
- Use `NexusProducer.publish()` from `@nexus/kafka`
- Consumer group IDs: `<service-name>-<topic-domain>` e.g. `finance-service-deals`

## Security
- JWT validation in Fastify preHandler hook — never skip
- Permission checks via `requirePermission()` before handler
- No secrets in code — use `process.env.*` only
- Sanitize all user input via Zod schemas before use

## Testing
- Unit tests: Vitest with mock Prisma
- Integration tests: Fastify inject with real DB (test schema)
- No `it.only` or `describe.only` in committed code
- Test file naming: `<name>.test.ts` co-located with source
```

---

## 62. Quick-Start Development Guide

```bash
# 1. Clone and install
git clone https://github.com/your-org/nexus-crm.git
cd nexus-crm
pnpm install

# 2. Start infrastructure (Postgres, Redis, Kafka, etc.)
docker-compose up -d postgres redis kafka meilisearch minio keycloak vault

# 3. Wait for Postgres to be ready, then create all databases
docker-compose exec postgres psql -U nexus -f /docker-entrypoint-initdb.d/init.sql

# 4. Generate Prisma clients for all services
pnpm turbo db:generate

# 5. Run database migrations for all services
pnpm turbo db:migrate

# 6. Seed initial data
pnpm --filter @nexus/crm-service db:seed
pnpm --filter @nexus/finance-service db:seed

# 7. Configure Keycloak
# - Navigate to http://localhost:8080
# - Create realm: nexus
# - Create client: nexus-api (confidential, service-account enabled)
# - Create client: nexus-web (public, PKCE)

# 8. Copy environment files
cp services/crm-service/.env.example services/crm-service/.env
cp services/finance-service/.env.example services/finance-service/.env
cp services/auth-service/.env.example services/auth-service/.env
# ... repeat for all services

# 9. Pull Ollama models (optional — needed for AI features)
docker-compose up -d ollama
docker-compose exec ollama ollama pull llama3.1
docker-compose exec ollama ollama pull mistral

# 10. Start all services in development mode
pnpm turbo dev

# Services available at:
#   Web App:          http://localhost:3000
#   CRM Service:      http://localhost:3001
#   Finance Service:  http://localhost:3002
#   AI Service:       http://localhost:3003
#   Comms Service:    http://localhost:3004
#   Workflow Engine:  http://localhost:3005
#   Analytics:        http://localhost:3006
#   Realtime:         http://localhost:3007
#   Search:           http://localhost:3008
#   Storage:          http://localhost:3009
#   Auth Service:     http://localhost:3010
#   Notifications:    http://localhost:3011
#   Integration:      http://localhost:3012
#   Partner:          http://localhost:3013
#   Compliance:       http://localhost:3014
#   ML Service:       http://localhost:8000
#   Kong Gateway:     http://localhost:8000 (routes all of the above)
#   Keycloak:         http://localhost:8080
#   Meilisearch:      http://localhost:7700
#   MinIO Console:    http://localhost:9002
#   Grafana:          http://localhost:3030
#   Prometheus:       http://localhost:9090
#   Unleash:          http://localhost:4242
#   Vault:            http://localhost:8200
```


---

## 63. Build Phases & MVP Scope (Cursor Execution Order)

> **IMPORTANT FOR CURSOR:** Build this system in phases. Do NOT attempt to scaffold all 15 services at once.
> Each phase must be fully working, tested, and deployable before moving to the next.
> The full technical specification above defines all schemas, endpoints, and patterns — use it as your reference.
> The phases below define what to build and in what order.

---

### Phase 1 — MVP Core (Weeks 1–3)

**Goal:** A working CRM that sales reps can use to manage leads, accounts, contacts, and deals.

#### Services to build:
| Service | Port | Priority |
|---|---|---|
| `auth-service` | 3010 | FIRST — all other services depend on JWT |
| `crm-service` | 3001 | Core entities |
| `apps/web` (Next.js) | 3000 | Basic UI |

#### Modules included in Phase 1:
- **Auth:** JWT login via Keycloak, user management, role assignment, API keys (Section 34.1 + Section 31.1)
- **CRM:** Leads, Contacts, Accounts, Deals, Pipelines, Stages, Activities, Notes (Section 34.2 + Section 31.2)
- **Frontend:** Dashboard, Pipeline Kanban board, Deal detail, Account 360, Contact view, Activity list (Section 37)
- **Multi-tenancy:** Row-level security via Prisma tenant middleware (Section 35.1)
- **RBAC:** Full permission matrix enforced on all routes (Section 35.2)

#### Modules EXCLUDED from Phase 1:
- AI/ML scoring
- Kafka event streaming (use direct REST between services)
- CPQ / Quote engine
- Commission system
- Workflow/Blueprint automation
- Communications (email, calls)
- Analytics dashboards
- Partner portal
- Compliance module

#### Infrastructure for Phase 1 (docker-compose only, no K8s yet):
- PostgreSQL (databases: `nexus_auth`, `nexus_crm`)
- Redis (session cache + rate limiting)
- Keycloak (auth)
- Kong (API gateway — optional in Phase 1, can skip)

#### Definition of Done — Phase 1:
- [ ] User can log in and be assigned a role
- [ ] CRUD working for Lead, Contact, Account, Deal, Activity, Note
- [ ] Pipeline Kanban board renders deals by stage with drag-and-drop
- [ ] Deal can be moved between stages, marked Won/Lost
- [ ] All endpoints enforce `tenantId` isolation
- [ ] All endpoints enforce RBAC permissions
- [ ] API returns standard `{ success, data }` format on all routes
- [ ] Audit log records all create/update/delete actions
- [ ] Unit tests pass for service layer
- [ ] Integration tests pass for all REST endpoints

---

### Phase 2 — Revenue Layer (Weeks 4–6)

**Goal:** Sales reps can create quotes, get them approved, and convert to orders.

#### Services to add:
| Service | Port |
|---|---|
| `finance-service` | 3002 |

#### Modules included in Phase 2:
- **Products & Catalog:** Product CRUD, price tiers (Section 34.3)
- **Quotes (Basic CPQ):** Create quote from deal, add line items, calculate total, send to contact (Section 34.2 — quotes endpoints)
- **Manual Approval:** Quote approval workflow (no automation engine yet — manual button)
- **Contracts:** Create, sign, activate (Section 34.3 — contracts endpoints)
- **Subscriptions:** Create subscription from contract (Section 34.3)
- **Invoices:** Manual invoice creation, send, record payment (Section 34.3)
- **Frontend:** Quote editor, product catalog, invoice list, contract view (Section 37 — finance routes)

#### Infrastructure additions for Phase 2:
- Add `nexus_finance` database to PostgreSQL
- Introduce Kafka (just the broker — publish `deal.won` → triggers commission placeholder)

#### Definition of Done — Phase 2:
- [ ] Quote can be created from a deal with line items
- [ ] CPQ pricing waterfall applies tier discounts (Sections 40)
- [ ] Quote approval flow works (pending → approved → sent → accepted)
- [ ] Contract can be generated from accepted quote
- [ ] Invoice generated from contract/subscription
- [ ] Payment recorded against invoice
- [ ] MRR/ARR tracked on subscriptions

---

### Phase 3 — Communications & Activities (Weeks 7–8)

**Goal:** All customer communication is logged and searchable inside the CRM.

#### Services to add:
| Service | Port |
|---|---|
| `comms-service` | 3004 |
| `notification-service` | 3011 |
| `realtime-service` | 3007 |

#### Modules included in Phase 3:
- **Email sync:** Connect Gmail/Outlook via OAuth, auto-link to contacts/deals
- **Email compose:** Send emails from within the CRM, use templates
- **Call logging:** Manual call log + basic VoIP (Twilio integration)
- **Conversations:** Live chat / WhatsApp channel (Section 34.5)
- **In-app notifications:** Bell icon, unread count, mark-as-read (Section 34.10)
- **Real-time:** WebSocket for deal updates, notification badge updates (Section 54)

#### Infrastructure additions for Phase 3:
- Add `nexus_comms`, `nexus_notification` databases
- Redis pub/sub for Socket.io adapter

---

### Phase 4 — Automation & Intelligence (Weeks 9–10)

**Goal:** The system automates repetitive tasks and surfaces AI-driven insights.

#### Services to add:
| Service | Port |
|---|---|
| `workflow-engine` | 3005 |
| `ai-service` | 3003 |
| `ml-service` (Python) | 8000 |

#### Modules included in Phase 4:
- **Workflow Builder:** Visual automation builder, 14 node types (Section 42)
- **Blueprint Engine:** State machine for deals/accounts (Section 43)
- **Sequences:** Automated contact outreach sequences
- **Lead AI Scoring:** XGBoost model via ML service (Section 51)
- **Deal Win Probability:** Random Forest via ML service
- **Call Transcription:** Whisper via AI service
- **Email AI Summary:** Ollama LLM summaries
- **Frontend:** Workflow visual editor (React Flow), Blueprint state machine editor

#### Infrastructure additions for Phase 4:
- Add `nexus_workflow` database
- Ollama service (pull llama3.1, mistral models)
- ML service Docker container

---

### Phase 5 — Analytics & Search (Weeks 11–12)

**Goal:** Full reporting, forecasting, and global search.

#### Services to add:
| Service | Port |
|---|---|
| `analytics-service` | 3006 |
| `search-service` | 3008 |

#### Modules included in Phase 5:
- **ClickHouse:** All analytics tables + materialized views (Section 44)
- **Pipeline metrics:** Win rates, velocity, conversion by stage
- **Forecast:** Rep-level commit/best-case/pipeline forecast
- **Revenue metrics:** MRR/ARR/churn/NRR
- **Leaderboard & Wallboard:** Real-time sales board
- **Global Search:** Meilisearch full-text across all entities (Section 34.8)
- **Saved searches & filters**

#### Infrastructure additions for Phase 5:
- ClickHouse container
- Meilisearch container
- Kafka consumers publishing events to ClickHouse

---

### Phase 6 — Platform & Integrations (Weeks 13–14)

**Goal:** Connect the CRM to the tools the business already uses.

#### Services to add:
| Service | Port |
|---|---|
| `integration-service` | 3012 |
| `storage-service` | 3009 |
| `partner-service` | 3013 |
| `compliance-service` | 3014 |

#### Modules included in Phase 6:
- **Integration Hub:** Salesforce, HubSpot, Slack, Jira, Google Calendar sync (Section 34 — integrations)
- **Webhook Engine:** Outbound webhooks on any event
- **File Storage:** Attach files to deals/contacts/accounts via MinIO (Section 34.9)
- **Partner Portal:** Deal registration, partner users, co-sell (Section 34)
- **GDPR Compliance:** Consent management, Right to Erasure, immutable audit log (Section 31.9)

#### Infrastructure additions for Phase 6:
- MinIO container
- Add `nexus_integration`, `nexus_storage`, `nexus_partner`, `nexus_compliance` databases

---

### Phase 7 — Hardening & Production (Weeks 15–16)

**Goal:** The system is production-ready, secure, observable, and deployable to Kubernetes.

#### Tasks:
- [ ] All services have `/health` and `/ready` endpoints with real dependency checks (Section 48)
- [ ] Prometheus metrics scraped from all services (Section 48)
- [ ] Grafana dashboards configured (Section 60 — docker-compose observability)
- [ ] Vault secrets management wired (replace `.env` secrets)
- [ ] K8s deployment manifests for all services (Section 56)
- [ ] HPA configured for crm-service, finance-service, ai-service
- [ ] ArgoCD GitOps deployment pipeline (Section 57)
- [ ] Load testing (k6) — target: 500 concurrent users, p99 < 500ms
- [ ] Penetration testing pass
- [ ] GDPR compliance audit

---

### Architecture Rules (LOCKED — do not violate)

1. **No cross-service database access** — each service owns its own PostgreSQL database
2. **Sync communication = REST** — direct HTTP calls between services for synchronous needs
3. **Async communication = Kafka** — all events published to Kafka topics defined in Section 36
4. **Multi-tenancy = always** — every table has `tenantId`, every query filters by it (Section 35.1)
5. **API versioning** — all routes prefixed `/api/v1/`
6. **Standard response format** — always `{ success, data }` or `{ success: false, error }` (Section 9)
7. **JWT on every request** — validated in Fastify preHandler, never skipped (Section 35)
8. **Permissions before handlers** — `requirePermission()` guard on every mutating route (Section 35.2)
9. **No secrets in code** — all from `process.env`, loaded via Vault in production
10. **Build phase-by-phase** — do not scaffold Phase 4+ services until Phase 1–3 are working

---

### Risks to Avoid

| Risk | Mitigation |
|---|---|
| Over-engineering Phase 1 | Build only what's in the Phase 1 scope list above |
| Inventing schemas | Use Prisma schemas in Section 31 exactly as defined |
| Mixing service concerns | Never query another service's database — use REST or Kafka |
| Hardcoding tenant IDs | Always read from JWT payload via `request.requestContext` |
| Skipping validation | All inputs pass through Zod schemas in Section 33 before use |
| Inconsistent error format | Always use `NexusError` subclasses from Section 47 |

