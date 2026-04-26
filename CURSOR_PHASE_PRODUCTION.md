# NEXUS CRM — Phase: Production Hardening

## Context

You are working on **NEXUS CRM**, a self-hosted Revenue Operating System built as a pnpm monorepo with Turborepo. The stack is:

- **Frontend**: Next.js 14 App Router, TypeScript 5, Tailwind CSS, TanStack Query v5, Zustand
- **Backend**: Fastify 4 microservices with Prisma 5 + PostgreSQL 16
- **Infra**: Redis 7, Kafka (Confluent), ClickHouse 24, Meilisearch, MinIO, Keycloak 24
- **Monorepo packages**: `@nexus/shared-types`, `@nexus/service-utils`, `@nexus/kafka`, `@nexus/validation`

All services authenticate via JWT (`requirePermission(PERMISSIONS.X.Y)` preHandler from `@nexus/service-utils`). The frontend uses `apiClients.X.get/post/patch/delete` from `@/lib/api-client` with TanStack Query.

This phase closes all remaining gaps before production launch. It does **not** add new features — it finishes what is already partially built.

---

## TASK 1 — Missing Frontend Pages (P0)

Four routes are registered in the backend but have no frontend page. Create all four. Each page must follow the exact patterns already used in the codebase (see `apps/web/src/app/(dashboard)/invoices/page.tsx` and `apps/web/src/app/(dashboard)/quotes/page.tsx` as canonical references).

### 1a. `/workflows/page.tsx`

**File**: `apps/web/src/app/(dashboard)/workflows/page.tsx`

**Data sources**:
- `GET /api/v1/workflows` via `apiClients.workflow`
- `GET /api/v1/workflows/executions` via `apiClients.workflow`
- `POST /api/v1/workflows/:id/test-run` via `apiClients.workflow`
- `PATCH /api/v1/workflows/:id` (set `{ isActive: true/false }`) via `apiClients.workflow`

**Required UI**:
- Tab switcher: **Workflows** | **Executions**
- **Workflows tab**: Table with columns `Name`, `Trigger`, `Status` (Active badge / Inactive), `Created`. Action buttons: **Activate** (if inactive) / **Deactivate** (if active) using `PATCH` toggle, plus **Test Run** button (fires test-run mutation, shows toast result).
- **Executions tab**: Table with columns `Workflow`, `Status` (`PENDING / RUNNING / COMPLETED / FAILED`), `Started At`, `Duration`. Status badge colors: RUNNING=blue, COMPLETED=emerald, FAILED=red, PENDING=slate.
- Loading skeleton and empty state for both tabs.
- No create form — workflows are defined by backend config.

**Interface types to define locally**:
```typescript
interface Workflow {
  id: string;
  name: string;
  trigger: string;
  isActive: boolean;
  createdAt: string;
}
interface Execution {
  id: string;
  workflowId: string;
  workflowName?: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  startedAt: string;
  completedAt: string | null;
}
```

---

### 1b. `/contracts/page.tsx`

**File**: `apps/web/src/app/(dashboard)/contracts/page.tsx`

**Data sources**:
- `GET /api/v1/contracts` (supports `?status=` query param) via `apiClients.finance`
- `POST /api/v1/contracts` via `apiClients.finance`
- `POST /api/v1/contracts/:id/sign` via `apiClients.finance`

**Required UI**:
- Status filter pills: `ALL | DRAFT | ACTIVE | EXPIRED | VOID | CANCELLED` (same pill pattern as `/invoices`)
- Summary metrics row (3 cards): **Active Contracts** (count), **Total Value** (sum of `value` field for ACTIVE contracts), **Expiring Soon** (count where `endDate` is within 30 days and status is ACTIVE)
- Table columns: `Title`, `Account`, `Status` (badge), `Value`, `Start Date`, `End Date`, `Actions`
- Status badge colors: `DRAFT=slate`, `ACTIVE=emerald`, `EXPIRED=slate/muted`, `VOID=slate/line-through`, `CANCELLED=red`
- Action: **Sign** button for DRAFT contracts (calls `/sign` endpoint, confirms with toast)
- Create form (collapsible section or modal-free inline panel): fields `title` (text input), `accountId` (text input), `value` (number input), `currency` (text, default `USD`), `startDate` (date input), `endDate` (date input)

**Interface types**:
```typescript
interface Contract {
  id: string;
  title: string;
  accountId: string;
  status: 'DRAFT' | 'ACTIVE' | 'EXPIRED' | 'VOID' | 'CANCELLED';
  value: string;
  currency: string;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
}
```

---

### 1c. `/products/page.tsx`

**File**: `apps/web/src/app/(dashboard)/products/page.tsx`

**Data sources**:
- `GET /api/v1/products` (supports `?isActive=true&search=` query params) via `apiClients.finance`
- `POST /api/v1/products` via `apiClients.finance`
- `PATCH /api/v1/products/:id` via `apiClients.finance`

**Required UI**:
- Search input (debounced 300ms with `useState` + effect) + **Active only** toggle checkbox
- Table columns: `Name`, `SKU`, `Type` (badge: `SERVICE=blue`, `PHYSICAL=slate`, `DIGITAL=purple`, `SUBSCRIPTION=emerald`), `Unit Price`, `Currency`, `Status` (Active/Inactive), `Actions`
- Action: **Deactivate** (if active) / **Activate** (if inactive) using PATCH `{ isActive: !current }`
- Create form (inline card above table): fields `name`, `sku`, `type` (select: SERVICE/PHYSICAL/DIGITAL/SUBSCRIPTION), `unitPrice` (number), `currency` (default USD), `description` (textarea, optional)
- Summary: show total product count in header subtitle

**Interface types**:
```typescript
interface Product {
  id: string;
  name: string;
  sku: string | null;
  type: 'SERVICE' | 'PHYSICAL' | 'DIGITAL' | 'SUBSCRIPTION';
  unitPrice: string;
  currency: string;
  isActive: boolean;
  description: string | null;
  createdAt: string;
}
```

---

### 1d. `/integrations/page.tsx`

**File**: `apps/web/src/app/(dashboard)/integrations/page.tsx`

**Data sources**:
- `GET /api/v1/integrations/connections` via `apiClients.integration`
- `GET /api/v1/integrations/sync/jobs` via `apiClients.integration`
- `POST /api/v1/integrations/sync/jobs` via `apiClients.integration`
- OAuth connect URL (redirect, not API call): `/api/v1/integrations/oauth/google/connect` and `/api/v1/integrations/oauth/microsoft/connect` — these are handled by linking directly to the integration service URL (use `NEXT_PUBLIC_INTEGRATION_URL` env var, defaulting to `http://localhost:3012`)

**Required UI**:
- Two provider cards side-by-side: **Google Workspace** and **Microsoft 365**
  - Each card shows: provider logo (use SVG inline or text abbrev), connection status (green "Connected" / grey "Not connected"), connected scopes (list from connection record), last synced timestamp
  - **Connect** button → opens OAuth flow: `window.location.href = \`${INTEGRATION_URL}/api/v1/integrations/oauth/${provider}/connect\``
  - **Disconnect** button (only if connected) → calls `PUT /api/v1/integrations/connections` with `{ provider, isActive: false }` to deactivate
- Sync Jobs section below cards: table with columns `Provider`, `Type`, `Status`, `Started`, `Completed`
- **Trigger Sync** button → opens minimal inline form with `provider` (select) and `type` (select: `calendar/gmail`) → calls `POST /api/v1/integrations/sync/jobs`

**Interface types**:
```typescript
interface Connection {
  id: string;
  provider: 'google' | 'microsoft';
  isActive: boolean;
  scopes: string[];
  lastSyncAt: string | null;
  createdAt: string;
}
interface SyncJob {
  id: string;
  provider: string;
  type: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  startedAt: string | null;
  completedAt: string | null;
}
```

---

## TASK 2 — Sidebar Navigation Updates

**File**: `apps/web/src/components/layout/sidebar.tsx`

Add the 4 missing pages to `SECTIONS`. Also import any additional icon variants needed from `@/components/ui/icons` (use `GitBranchIcon` or `WorkflowIcon` for Workflows, `FileTextIcon` for Contracts, `PackageIcon` for Products, `PlugIcon` for Integrations — if an icon doesn't exist in the icon file, use `FileTextIcon` as fallback and add a TODO comment).

Updated `SECTIONS` should be:

```typescript
const SECTIONS: NavSection[] = [
  {
    heading: 'CRM',
    items: [
      { label: 'Deals', href: '/deals', Icon: BriefcaseIcon },
      { label: 'Contacts', href: '/contacts', Icon: UsersIcon },
      { label: 'Accounts', href: '/accounts', Icon: LayoutIcon },
      { label: 'Leads', href: '/leads', Icon: PhoneIcon },
      { label: 'Activities', href: '/activities', Icon: FileTextIcon },
      { label: 'Cadences', href: '/cadences', Icon: FileTextIcon },
      { label: 'Planning', href: '/planning', Icon: FileTextIcon },
      { label: 'Reports', href: '/reports', Icon: FileTextIcon },
    ],
  },
  {
    heading: 'Finance',
    items: [
      { label: 'Quotes', href: '/quotes', Icon: FileTextIcon },
      { label: 'Invoices', href: '/invoices', Icon: ReceiptIcon },
      { label: 'Contracts', href: '/contracts', Icon: FileTextIcon },
      { label: 'Products', href: '/products', Icon: FileTextIcon },
      { label: 'Approvals', href: '/approvals', Icon: FileTextIcon },
    ],
  },
  {
    heading: 'Automation',
    items: [
      { label: 'Workflows', href: '/workflows', Icon: FileTextIcon },
      { label: 'Integrations', href: '/integrations', Icon: FileTextIcon },
    ],
  },
  {
    heading: 'Platform',
    items: [
      { label: 'Chatbot', href: '/chatbot', Icon: BellIcon },
      { label: 'Knowledge Base', href: '/knowledge', Icon: FileTextIcon },
      { label: 'Incentives', href: '/incentives', Icon: BellIcon },
      { label: 'Settings', href: '/settings', Icon: SettingsIcon },
    ],
  },
  {
    heading: 'Settings',
    items: [{ label: 'Territories', href: '/territories', Icon: SettingsIcon }],
  },
];
```

---

## TASK 3 — .env.example Files for New Services

Each of the following services was created in Phases 9–12 but is missing its own `.env.example`. Create each file exactly as shown below.

### `services/cadence-service/.env.example`
```env
# ─── Cadence Service ──────────────────────────────────────────────────────
PORT=3018
NODE_ENV=development
LOG_LEVEL=info

# JWT verification — must match auth-service JWT_SECRET.
JWT_SECRET=replace-me-with-at-least-32-characters-ok

# CORS origins (comma-separated).
CORS_ORIGINS=http://localhost:3000

# Primary database.
CADENCE_DATABASE_URL=postgresql://nexus:nexus@localhost:5432/nexus_cadence

# Kafka.
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=cadence-service
KAFKA_SSL=false

# Comm service base URL (for sending emails/SMS in steps).
COMM_SERVICE_URL=http://localhost:3009
```

### `services/territory-service/.env.example`
```env
# ─── Territory Service ────────────────────────────────────────────────────
PORT=3019
NODE_ENV=development
LOG_LEVEL=info

JWT_SECRET=replace-me-with-at-least-32-characters-ok
CORS_ORIGINS=http://localhost:3000

TERRITORY_DATABASE_URL=postgresql://nexus:nexus@localhost:5432/nexus_territory

KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=territory-service
KAFKA_SSL=false
```

### `services/planning-service/.env.example`
```env
# ─── Planning Service ─────────────────────────────────────────────────────
PORT=3020
NODE_ENV=development
LOG_LEVEL=info

JWT_SECRET=replace-me-with-at-least-32-characters-ok
CORS_ORIGINS=http://localhost:3000

PLANNING_DATABASE_URL=postgresql://nexus:nexus@localhost:5432/nexus_planning

KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=planning-service
KAFKA_SSL=false

# Analytics service for actuals pull.
ANALYTICS_SERVICE_URL=http://localhost:3008
```

### `services/reporting-service/.env.example`
```env
# ─── Reporting Service ────────────────────────────────────────────────────
PORT=3021
NODE_ENV=development
LOG_LEVEL=info

JWT_SECRET=replace-me-with-at-least-32-characters-ok
CORS_ORIGINS=http://localhost:3000

REPORTING_DATABASE_URL=postgresql://nexus:nexus@localhost:5432/nexus_reporting

KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=reporting-service
KAFKA_SSL=false
```

### `services/portal-service/.env.example`
```env
# ─── Portal Service ───────────────────────────────────────────────────────
PORT=3022
NODE_ENV=development
LOG_LEVEL=info

JWT_SECRET=replace-me-with-at-least-32-characters-ok
CORS_ORIGINS=http://localhost:3000

PORTAL_DATABASE_URL=postgresql://nexus:nexus@localhost:5432/nexus_portal

# Finance service for invoice/quote data.
FINANCE_SERVICE_URL=http://localhost:3002

# Public URL of the web app (used to build portal share links).
APP_URL=http://localhost:3000
```

### `services/knowledge-service/.env.example`
```env
# ─── Knowledge Service ────────────────────────────────────────────────────
PORT=3023
NODE_ENV=development
LOG_LEVEL=info

JWT_SECRET=replace-me-with-at-least-32-characters-ok
CORS_ORIGINS=http://localhost:3000

KNOWLEDGE_DATABASE_URL=postgresql://nexus:nexus@localhost:5432/nexus_knowledge
```

### `services/incentive-service/.env.example`
```env
# ─── Incentive Service ────────────────────────────────────────────────────
PORT=3024
NODE_ENV=development
LOG_LEVEL=info

JWT_SECRET=replace-me-with-at-least-32-characters-ok
CORS_ORIGINS=http://localhost:3000

INCENTIVE_DATABASE_URL=postgresql://nexus:nexus@localhost:5432/nexus_incentive

KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=incentive-service
KAFKA_SSL=false
```

---

## TASK 4 — Seed Script

**File**: `scripts/seed.ts`

Create a realistic seed script that populates a local development database with demo data. Run with `npx ts-node --esm scripts/seed.ts` or `tsx scripts/seed.ts`.

**Requirements**:
- Use the Prisma clients directly (import from `../services/crm-service/prisma` etc.) OR use `fetch` to call the running services via their REST APIs (preferred for isolation — use `http://localhost:PORT/api/v1/...` with a hardcoded dev JWT or a seed API key).
- If using direct DB (simpler): use `@prisma/client` packages from the individual service node_modules, or create a single seed Prisma client pointing at `postgresql://nexus:nexus@localhost:5432/nexus`.

**Seed data to create**:

```
Tenants:        1 (id: "seed-tenant-01", name: "ACME Corp")
Accounts:       20 (mix of PROSPECT/CUSTOMER/PARTNER, realistic company names)
Contacts:       40 (2 per account, realistic names/emails)
Leads:          15 (status spread: NEW/QUALIFIED/CONTACTED/CONVERTED/DISQUALIFIED)
Deals:          30 (spread across pipeline stages, realistic amounts $5k–$250k)
Activities:     50 (mix of EMAIL/CALL/MEETING/NOTE types across accounts/contacts)
Products:       10 (2 SERVICE, 3 PHYSICAL, 3 DIGITAL, 2 SUBSCRIPTION, with realistic SKUs and prices)
Quotes:         10 (linked to deals, mix of DRAFT/SENT/ACCEPTED)
Invoices:       10 (linked to quotes, mix of DRAFT/SENT/PAID/OVERDUE)
Contracts:      8  (linked to accounts, mix of DRAFT/ACTIVE/EXPIRED)
```

**Script structure**:
```typescript
import { PrismaClient as CrmPrisma } from '../services/crm-service/node_modules/.prisma/client/index.js';
import { PrismaClient as FinancePrisma } from '../services/finance-service/node_modules/.prisma/client/index.js';

const TENANT_ID = 'seed-tenant-01';

async function main() {
  console.log('🌱 Seeding NEXUS CRM...');
  await seedAccounts();
  await seedContacts();
  await seedLeads();
  await seedDeals();
  await seedActivities();
  await seedProducts();
  await seedQuotesAndInvoices();
  await seedContracts();
  console.log('✅ Seed complete');
}

main().catch(console.error);
```

Use `faker` (import from `@faker-js/faker`) for realistic names/emails/companies. If `@faker-js/faker` is not installed in the workspace root, add it: `pnpm add -D -w @faker-js/faker`.

Add `"seed": "tsx scripts/seed.ts"` to the root `package.json` scripts.

---

## TASK 5 — Service Health & Observability

### 5a. Prometheus `/metrics` endpoint on core services

Add a `/metrics` endpoint to each of these 6 high-traffic services: `auth-service`, `crm-service`, `finance-service`, `notification-service`, `workflow-service`, `integration-service`.

**Pattern** (add to each service's `src/index.ts` after existing routes are registered):
```typescript
import { register, collectDefaultMetrics } from 'prom-client';

collectDefaultMetrics({ prefix: 'nexus_' });

app.get('/metrics', async (_req, reply) => {
  reply.header('Content-Type', register.contentType);
  return reply.send(await register.metrics());
});
```

Install `prom-client` in each affected service: `pnpm --filter <service-name> add prom-client`.

**Do not add auth** to `/metrics` — Prometheus scrapes it without a bearer token.

### 5b. Standard health check response

Ensure all services return `{ status: 'ok', service: '<name>', version: '1.0.0' }` from `GET /health`. If the endpoint already exists but returns a different shape, update it to match this schema. This is required for the Docker health-check probes.

---

## TASK 6 — Rate Limiting

Add rate limiting to the 3 most exposed services: `auth-service`, `crm-service`, `finance-service`.

**Install**: `pnpm --filter <service> add @fastify/rate-limit`

**Register before route registration** in each service's `src/index.ts`:
```typescript
import rateLimit from '@fastify/rate-limit';

await app.register(rateLimit, {
  global: true,
  max: 300,           // requests per window
  timeWindow: '1 minute',
  errorResponseBuilder: (_req, context) => ({
    success: false,
    error: 'RATE_LIMIT_EXCEEDED',
    message: `Too many requests. Retry after ${context.after}.`,
  }),
});
```

For `auth-service` specifically, add a **stricter limit on login/token endpoints**:
```typescript
app.register(rateLimit, {
  max: 10,
  timeWindow: '1 minute',
  keyGenerator: (req) => req.ip,
  // Apply only to auth routes:
  allowList: (req) => !req.url.includes('/auth/'),
  errorResponseBuilder: (_req, context) => ({
    success: false,
    error: 'RATE_LIMIT_EXCEEDED',
    message: `Too many login attempts. Retry after ${context.after}.`,
  }),
});
```

---

## TASK 7 — Input Validation Hardening

### 7a. Zod schema coverage audit

For each of these routes files, verify that **every** `request.body`, `request.query`, and `request.params` is validated through Zod before use. If any route reads `request.body` without `safeParse`/`parse`, add validation using the existing schemas from `@nexus/validation` or define a local schema inline.

Files to audit:
- `services/crm-service/src/routes/deals.routes.ts`
- `services/crm-service/src/routes/contacts.routes.ts`
- `services/finance-service/src/routes/quotes.routes.ts`
- `services/finance-service/src/routes/invoices.routes.ts`
- `services/workflow-service/src/routes/workflows.routes.ts`

### 7b. Error shape consistency

Every service must return errors in this shape:
```json
{ "success": false, "error": "ERROR_CODE", "message": "Human readable." }
```

Check each service's error handler (registered in `src/index.ts` or a middleware file). If using `@nexus/service-utils` error handler, verify it emits this exact shape. If not, add:
```typescript
app.setErrorHandler((error, _req, reply) => {
  const status = error.statusCode ?? 500;
  return reply.code(status).send({
    success: false,
    error: error.code ?? 'INTERNAL_ERROR',
    message: error.message ?? 'An unexpected error occurred.',
  });
});
```

---

## TASK 8 — Test Coverage (High-Risk Services)

Write integration tests for the 3 highest-risk untested services. Use `vitest` (already in workspace) with `supertest` for HTTP assertions.

### Test files to create:

**`services/auth-service/src/__tests__/auth.test.ts`**
- `POST /api/v1/auth/login` — valid credentials returns 200 + `{ token, refreshToken }`
- `POST /api/v1/auth/login` — wrong password returns 401
- `POST /api/v1/auth/login` — missing body returns 400
- `POST /api/v1/auth/refresh` — valid refresh token returns new access token
- `GET /health` — returns 200

**`services/crm-service/src/__tests__/deals.test.ts`**
- `GET /api/v1/deals` — authenticated, returns paginated list
- `GET /api/v1/deals` — unauthenticated returns 401
- `POST /api/v1/deals` — valid body creates deal, returns 201
- `POST /api/v1/deals` — invalid body returns 400
- `PATCH /api/v1/deals/:id/stage` — valid stage transition returns updated deal
- `PATCH /api/v1/deals/:id/stage` — invalid stage returns 400

**`services/finance-service/src/__tests__/invoices.test.ts`**
- `GET /api/v1/invoices` — returns list
- `POST /api/v1/invoices/:id/mark-paid` — transitions SENT → PAID
- `POST /api/v1/invoices/:id/mark-paid` — already PAID returns 409
- `POST /api/v1/invoices/:id/send` — transitions DRAFT → SENT

**Test setup pattern** (copy from any existing test in the repo or create fresh):
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../app.js'; // adjust to actual app factory export

let app: Awaited<ReturnType<typeof buildApp>>;
let request: ReturnType<typeof supertest>;

beforeAll(async () => {
  app = await buildApp({ logger: false });
  await app.ready();
  request = supertest(app.server);
});

afterAll(() => app.close());
```

Add `supertest` and `@types/supertest` to each service: `pnpm --filter <service> add -D supertest @types/supertest`.

---

## IMPORTANT: Cursor Truncation Prevention

Cursor **consistently truncates files** that exceed ~500 lines. After writing any file longer than 400 lines, you **must** immediately verify it is complete by checking that:

1. The last line of every `.tsx` component is exactly `}` (the closing brace of the default export function)
2. The last line of every `.ts` route file ends with `}` closing `registerXRoutes`
3. Every JSX element opened in the return statement has a corresponding closing tag
4. The `docker-compose.yml` ends with the `volumes:` block and at minimum `  postgres_data:` and `  redis_data:` entries

If any file ends mid-token, mid-string, or mid-block — **stop and complete it before moving on**.

---

## Delivery Checklist

Before declaring this phase complete, verify each item:

- [ ] `apps/web/src/app/(dashboard)/workflows/page.tsx` exists and renders workflow list + executions table
- [ ] `apps/web/src/app/(dashboard)/contracts/page.tsx` exists with status filter + create form + sign action
- [ ] `apps/web/src/app/(dashboard)/products/page.tsx` exists with search + type filter + activate/deactivate
- [ ] `apps/web/src/app/(dashboard)/integrations/page.tsx` exists with provider cards + sync jobs table
- [ ] `sidebar.tsx` SECTIONS array includes entries for `/workflows`, `/contracts`, `/products`, `/integrations`
- [ ] `services/cadence-service/.env.example` created
- [ ] `services/territory-service/.env.example` created
- [ ] `services/planning-service/.env.example` created
- [ ] `services/reporting-service/.env.example` created
- [ ] `services/portal-service/.env.example` created
- [ ] `services/knowledge-service/.env.example` created
- [ ] `services/incentive-service/.env.example` created
- [ ] `scripts/seed.ts` created, `package.json` has `"seed"` script
- [ ] `prom-client` installed and `/metrics` endpoint live on auth, crm, finance, notification, workflow, integration services
- [ ] `@fastify/rate-limit` installed and registered on auth, crm, finance services
- [ ] Error handler returns `{ success, error, message }` shape in all 6 core services
- [ ] Test files created for auth-service, crm-service, finance-service
- [ ] All new `.tsx` files verified complete (no truncation)
