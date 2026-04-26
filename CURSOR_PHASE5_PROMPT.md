# NEXUS CRM — Cursor Phase 5 Prompt
## Scope: Analytics Fixes + Fork/Join Engine + billing-service + integration-service + blueprint-service

You are continuing to build NEXUS CRM, a self-hosted Revenue Operating System.
The monorepo is at the repo root. All existing services compile with zero TypeScript errors,
zero `TODO` comments, zero stub functions, and zero `any` types. **Maintain that standard for every line you write.**

---

## CRITICAL RULES (apply to every file you touch)

1. **Zero `any`** — Use `unknown` with narrowing, explicit interfaces, or generics.
2. **Zero `TODO` / `FIXME` / `stub`** — Every function must be fully implemented.
3. **`tenantId` in every DB query** — No query is ever tenant-unscoped.
4. **`version: { increment: 1 }`** — On every Prisma `update` mutation.
5. **`decimal.js`** — For all monetary arithmetic. Import as `import Decimal from 'decimal.js'`.
6. **Kafka events** — Publish a domain event on every state change.
7. **`requirePermission(PERMISSIONS.X.Y)`** — As `preHandler` on every route.
8. **Factory pattern** — `createXxxService(prisma, producer)` returning a plain object with methods.
9. **Route pattern** — `registerXxxRoutes(app, prisma, producer)` under `/api/v1`.
10. **Zod validation** — Every route body/query parsed through a Zod schema from `@nexus/validation`.
11. **Error handling** — Use `BusinessRuleError`, `NotFoundError`, `ValidationError` from `@nexus/service-utils`.
12. **TypeScript strict mode** — The tsconfig has `"strict": true`. All code must satisfy it.

---

## PART 1 — FIX BROKEN ANALYTICS QUERIES

### FILE 1: `services/analytics-service/src/services/pipeline.analytics.ts`

**Three confirmed bugs — rewrite the whole file:**

**Bug 1:** `getPipelineSummary` returns `avgDaysInPipeline: 0` (hardcoded).
**Bug 2:** `getDealVelocity` uses `avg(1.0)` — always returns 1.0, never real stage durations.
**Bug 3:** `getFunnelConversion` sets `stageName: String(r.stageId ?? '')` — stageName equals stageId.

**Fix:** Rewrite all three methods using the `deal_events` ClickHouse table whose schema is:

```sql
deal_events (
  event_id UUID, tenant_id String, deal_id String, owner_id String,
  account_id String, pipeline_id String, stage_id String,
  event_type String,   -- 'deal.created' | 'deal.stage_changed' | 'deal.won' | 'deal.lost'
  amount Decimal64(2), currency String,
  occurred_at DateTime64(3)
)
```

**Correct implementations:**

```typescript
// getPipelineSummary — avgDaysInPipeline: avg time from deal.created to deal.won/deal.lost
// Query: for each deal_id, find the created event and the terminal event,
//        compute dateDiff('day', created_at, terminal_at), average across all deals.
// Use a subquery or WITH clause in ClickHouse:
`
WITH
  created AS (
    SELECT deal_id, min(occurred_at) AS created_at
    FROM deal_events
    WHERE tenant_id = {tenantId:String} ${filter}
      AND event_type = 'deal.created'
    GROUP BY deal_id
  ),
  closed AS (
    SELECT deal_id, max(occurred_at) AS closed_at
    FROM deal_events
    WHERE tenant_id = {tenantId:String} ${filter}
      AND event_type IN ('deal.won', 'deal.lost')
    GROUP BY deal_id
  )
SELECT
  countDistinct(d.deal_id) AS totalDeals,
  sum(d.amount) AS totalValue,
  if(countDistinct(d.deal_id) = 0, 0, sum(d.amount) / countDistinct(d.deal_id)) AS avgDealSize,
  avg(dateDiff('day', c.created_at, cl.closed_at)) AS avgDaysInPipeline
FROM deal_events d
JOIN created c ON d.deal_id = c.deal_id
JOIN closed cl ON d.deal_id = cl.deal_id
WHERE d.tenant_id = {tenantId:String} ${filter}
`

// getDealVelocity — measure real stage residence time:
// For each (deal_id, stage_id), find min(occurred_at) as entry time,
// find the next stage_changed event as exit time, diff in days.
`
WITH stage_entries AS (
  SELECT
    deal_id,
    stage_id,
    occurred_at AS entered_at,
    leadInFrame(occurred_at) OVER (
      PARTITION BY deal_id ORDER BY occurred_at
      ROWS BETWEEN CURRENT ROW AND 1 FOLLOWING
    ) AS exited_at
  FROM deal_events
  WHERE tenant_id = {tenantId:String}
    AND occurred_at >= parseDateTime64BestEffort({from:String})
    AND occurred_at <= parseDateTime64BestEffort({to:String})
    AND event_type IN ('deal.created', 'deal.stage_changed', 'deal.won', 'deal.lost')
)
SELECT
  stage_id AS stageId,
  avg(dateDiff('hour', entered_at, exited_at)) / 24.0 AS avgDays
FROM stage_entries
WHERE exited_at IS NOT NULL AND exited_at != entered_at
GROUP BY stage_id
`

// getFunnelConversion — stageName stays as stageId (no stage names in ClickHouse;
// frontend resolves names from crm-service). Do NOT populate stageName from stageId.
// Instead: stageName = '' (empty string) — frontend joins on stageId.
```

Write the full corrected `pipeline.analytics.ts`. All three methods must use real ClickHouse queries.
`avgDaysInPipeline` must come from the DB. `stageName` must be `''` (blank) — document in a comment that
the frontend resolves stage names via crm-service using `stageId`.

---

### FILE 2: `services/analytics-service/src/services/activity.analytics.ts`

**Bug:** `overdueRate` is hardcoded to `0`.

The `activity_events` table schema:
```sql
activity_events (
  event_id UUID, tenant_id String, activity_id String, owner_id String,
  deal_id String, activity_type String,
  event_type String,  -- 'activity.created' | 'activity.completed' | 'activity.overdue'
  occurred_at DateTime64(3)
)
```

Fix `getActivitySummary` to compute `overdueRate` from actual `activity.overdue` events:
```typescript
// overdueRate = countIf(event_type = 'activity.overdue') / countIf(event_type = 'activity.created') * 100
// if createdCount = 0, overdueRate = 0
```

Also add `getActivityByType` method:
```typescript
async getActivityByType(tenantId: string, period: { from: string; to: string }):
  Promise<Array<{ activityType: string; count: number; completionRate: number }>>
// Query: GROUP BY activity_type, count created vs completed
```

---

## PART 2 — FIX FORK / JOIN PARALLEL BRANCH EXECUTION

The workflow engine currently has stub `fork.node.ts` (8 lines, does nothing) and `join.node.ts` (8 lines, does nothing).
Fix them so FORK genuinely spawns parallel branch executions and JOIN waits for all branches to finish.

### Step 1 — Update Prisma schema: `services/workflow-service/prisma/schema.prisma`

Add a new model after `WorkflowStep`:

```prisma
model WorkflowForkTracker {
  id            String            @id @default(cuid())
  executionId   String
  execution     WorkflowExecution @relation(fields: [executionId], references: [id])
  forkNodeId    String
  joinNodeId    String
  branchNodeIds String[]          // the first node of each branch
  completedIds  String[]          @default([])  // branch start nodeIds that have completed
  createdAt     DateTime          @default(now())

  @@index([executionId, forkNodeId])
}
```

Also add to `WorkflowExecution`:
```prisma
  forkTrackers   WorkflowForkTracker[]
  parentForkId   String?    // set when this execution is a branch child
  parentExecId   String?    // the parent execution that spawned this branch
```

Run `pnpm --filter workflow-service prisma migrate dev --name add_fork_tracker` — but in the prompt,
just tell Cursor to add the migration SQL. The migration file goes in
`services/workflow-service/prisma/migrations/YYYYMMDD_add_fork_tracker/migration.sql`.

### Step 2 — Rewrite `services/workflow-service/src/engine/nodes/fork.node.ts`

```typescript
import { type NexusProducer } from '@nexus/kafka';
import type { WorkflowPrisma } from '../../prisma.js';
import type { ExecutionContext, NodeResult, WorkflowNode } from '../types.js';

// FORK: creates one child WorkflowExecution per branch and publishes
// workflow.branch.start events so the scheduler picks them up.
export async function handleForkNode(
  node: WorkflowNode,
  context: ExecutionContext,
  prisma: WorkflowPrisma,
  producer: NexusProducer
): Promise<NodeResult> {
  const cfg = (node.config ?? {}) as {
    branches?: string[];   // array of nodeIds that start each branch
    joinNodeId?: string;   // nodeId of the JOIN gate
  };
  const branches = cfg.branches ?? [];
  if (branches.length === 0) return { output: { skipped: true, reason: 'no_branches' } };
  if (!cfg.joinNodeId) throw new Error('FORK node missing joinNodeId');

  // Record the fork tracker so JOIN can verify completion
  await prisma.workflowForkTracker.create({
    data: {
      executionId: context.executionId,
      forkNodeId: node.id,
      joinNodeId: cfg.joinNodeId,
      branchNodeIds: branches,
      completedIds: [],
    },
  });

  // Spawn a child execution for each branch
  const parentExecution = await prisma.workflowExecution.findUniqueOrThrow({
    where: { id: context.executionId },
    include: { workflow: true },
  });

  for (const branchStartNodeId of branches) {
    const child = await prisma.workflowExecution.create({
      data: {
        tenantId: context.tenantId,
        workflowId: context.workflowId,
        triggerType: 'BRANCH',
        triggerPayload: context.triggerPayload,
        status: 'RUNNING',
        currentNodeId: branchStartNodeId,
        parentForkId: node.id,
        parentExecId: context.executionId,
      },
    });
    await producer.publish('nexus.automation.workflows', {
      type: 'workflow.branch.start' as never,
      tenantId: context.tenantId,
      payload: { executionId: child.id, parentExecutionId: context.executionId, branchNodeId: branchStartNodeId } as never,
    });
  }

  // Pause the parent at the JOIN node until all branches complete
  return {
    nextNodeId: cfg.joinNodeId,
    pauseUntil: new Date(Date.now() + 24 * 60 * 60 * 1000), // safety 24h timeout
    output: { branches, childCount: branches.length },
  };
}
```

### Step 3 — Rewrite `services/workflow-service/src/engine/nodes/join.node.ts`

```typescript
import type { WorkflowPrisma } from '../../prisma.js';
import type { ExecutionContext, NodeResult, WorkflowNode } from '../types.js';

// JOIN: checks whether all branch child executions have completed.
// If not all done → keep paused (return pauseUntil = future).
// If all done → clear pause and continue to the next node after JOIN.
export async function handleJoinNode(
  node: WorkflowNode,
  context: ExecutionContext,
  prisma: WorkflowPrisma
): Promise<NodeResult> {
  // Find the fork tracker for this join
  const tracker = await prisma.workflowForkTracker.findFirst({
    where: {
      executionId: context.executionId,
      joinNodeId: node.id,
    },
  });
  if (!tracker) return { output: { joined: true, note: 'no_tracker_found' } };

  // Count how many branch children are COMPLETED
  const completedChildren = await prisma.workflowExecution.count({
    where: {
      parentExecId: context.executionId,
      parentForkId: tracker.forkNodeId,
      status: 'COMPLETED',
    },
  });

  const totalBranches = tracker.branchNodeIds.length;
  if (completedChildren < totalBranches) {
    // Not all branches done — stay paused for 60 seconds, will be polled again
    return {
      pauseUntil: new Date(Date.now() + 60_000),
      output: { waiting: true, completedBranches: completedChildren, totalBranches },
    };
  }

  // All branches complete — clear pause, continue past JOIN
  return {
    pauseUntil: null,
    output: { joined: true, completedBranches: completedChildren, totalBranches },
  };
}
```

### Step 4 — Update `services/workflow-service/src/engine/executor.ts`

The `executeNode` private method currently calls handler functions with `(node, context)`.
`handleForkNode` now needs `(node, context, prisma, producer)` and `handleJoinNode` needs `(node, context, prisma)`.

Update the `FORK` and `JOIN` cases in the switch:
```typescript
case 'FORK':
  return handleForkNode(node, context, this.prisma, this.producer);
case 'JOIN':
  return handleJoinNode(node, context, this.prisma);
```

Also add a Kafka consumer handler for `workflow.branch.start` events so branch child executions
are processed. In `services/workflow-service/src/consumers/trigger.consumer.ts` (or create
`branch.consumer.ts`), subscribe to `nexus.automation.workflows` and handle `workflow.branch.start`
by calling `executor.run(payload.executionId)`.

---

## PART 3 — NEW SERVICE: `billing-service` (port 3011)

### Overview
Handles subscription plans, active subscriptions, Stripe payment processing, usage metering,
and invoicing for NEXUS tenants who want billing features. Uses its own Postgres DB (`nexus_billing`).

### Step 1 — `infrastructure/postgres/init.sql`

Add to the existing file (append, do not replace):
```sql
CREATE DATABASE nexus_billing;
GRANT ALL PRIVILEGES ON DATABASE nexus_billing TO nexus;
\connect nexus_billing
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

### Step 2 — `services/billing-service/prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../../../node_modules/.prisma/billing-client"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Plan {
  id              String         @id @default(cuid())
  name            String
  description     String?
  stripePriceId   String?        @unique
  intervalType    String         // 'monthly' | 'annual'
  basePrice       Decimal        @db.Decimal(12, 2)
  currency        String         @default("USD")
  maxSeats        Int?
  features        Json           @default("[]")
  isActive        Boolean        @default(true)
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt
  subscriptions   Subscription[]
}

model Subscription {
  id                String              @id @default(cuid())
  tenantId          String              @unique  // one active sub per tenant
  planId            String
  plan              Plan                @relation(fields: [planId], references: [id])
  stripeCustomerId  String?
  stripeSubId       String?             @unique
  status            SubscriptionStatus  @default(TRIALING)
  trialEndsAt       DateTime?
  currentPeriodStart DateTime
  currentPeriodEnd   DateTime
  cancelAtPeriodEnd  Boolean            @default(false)
  seats             Int                 @default(1)
  version           Int                 @default(1)
  createdAt         DateTime            @default(now())
  updatedAt         DateTime            @updatedAt
  usageRecords      UsageRecord[]
  invoices          BillingInvoice[]

  @@index([tenantId])
  @@index([status])
}

model UsageRecord {
  id             String       @id @default(cuid())
  tenantId       String
  subscriptionId String
  subscription   Subscription @relation(fields: [subscriptionId], references: [id])
  metric         String       // 'api_calls' | 'storage_gb' | 'emails_sent'
  quantity       Int
  recordedAt     DateTime     @default(now())

  @@index([tenantId, metric, recordedAt])
}

model BillingInvoice {
  id             String          @id @default(cuid())
  tenantId       String
  subscriptionId String
  subscription   Subscription    @relation(fields: [subscriptionId], references: [id])
  stripeInvoiceId String?        @unique
  amount         Decimal         @db.Decimal(12, 2)
  currency       String          @default("USD")
  status         InvoiceStatus   @default(DRAFT)
  periodStart    DateTime
  periodEnd      DateTime
  dueAt          DateTime?
  paidAt         DateTime?
  lineItems      Json            @default("[]")
  version        Int             @default(1)
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt

  @@index([tenantId])
  @@index([tenantId, status])
}

enum SubscriptionStatus {
  TRIALING
  ACTIVE
  PAST_DUE
  CANCELED
  UNPAID
}

enum InvoiceStatus {
  DRAFT
  OPEN
  PAID
  VOID
  UNCOLLECTIBLE
}
```

### Step 3 — `services/billing-service/src/prisma.ts`

Follow the exact same pattern as finance-service's `prisma.ts`. Import PrismaClient from
`'../../../node_modules/.prisma/billing-client/index.js'`, instantiate with `DATABASE_URL`,
add a `$use` middleware that throws if any query reaches the DB without a `tenantId` condition
(same middleware as crm-service).

### Step 4 — `services/billing-service/src/services/plans.service.ts`

Implement `createPlansService(prisma)` with:
- `listPlans()` — active plans only, no tenantId filter (plans are global)
- `getPlanById(id)` — throws `NotFoundError` if not found
- `createPlan(data)` — creates plan, no Kafka event needed (admin action)
- `updatePlan(id, data)` — `version: { increment: 1 }`, sets `isActive` flag
- `deletePlan(id)` — soft delete: sets `isActive = false`

### Step 5 — `services/billing-service/src/services/subscriptions.service.ts`

Implement `createSubscriptionsService(prisma, producer)` with:

```typescript
interface SubscriptionService {
  getSubscription(tenantId: string): Promise<Subscription & { plan: Plan }>;
  createSubscription(tenantId: string, data: {
    planId: string;
    stripeCustomerId?: string;
    seats?: number;
    trialDays?: number;
  }): Promise<Subscription>;
  updateSubscription(tenantId: string, data: {
    planId?: string;
    seats?: number;
    cancelAtPeriodEnd?: boolean;
  }): Promise<Subscription>;
  cancelSubscription(tenantId: string): Promise<Subscription>;
  recordUsage(tenantId: string, data: {
    metric: string;
    quantity: number;
  }): Promise<UsageRecord>;
  getUsageSummary(tenantId: string, period: { from: string; to: string }):
    Promise<Array<{ metric: string; total: number }>>;
}
```

**Implementation rules:**
- `createSubscription`: sets `currentPeriodStart = now()`, `currentPeriodEnd = now() + 30 days` (monthly) or `+ 365 days` (annual), `trialEndsAt = now() + trialDays`. Status = `TRIALING` if `trialDays > 0`, else `ACTIVE`.
  Publishes Kafka event `billing.subscription.created`.
- `updateSubscription`: find by `tenantId`, apply changes, `version: { increment: 1 }`. Publishes `billing.subscription.updated`.
- `cancelSubscription`: sets `cancelAtPeriodEnd = true`, publishes `billing.subscription.canceled`.
- `recordUsage`: creates a `UsageRecord`. No Kafka event.
- `getUsageSummary`: aggregates `UsageRecord` by metric using Prisma groupBy for the given period.

### Step 6 — `services/billing-service/src/services/invoices.service.ts`

Implement `createBillingInvoicesService(prisma, producer)` with:

```typescript
interface BillingInvoicesService {
  listInvoices(tenantId: string, pagination: { page: number; limit: number }):
    Promise<{ items: BillingInvoice[]; total: number }>;
  getInvoice(tenantId: string, id: string): Promise<BillingInvoice>;
  generateInvoice(tenantId: string, subscriptionId: string): Promise<BillingInvoice>;
  markPaid(tenantId: string, id: string, paidAt?: Date): Promise<BillingInvoice>;
  voidInvoice(tenantId: string, id: string): Promise<BillingInvoice>;
}
```

- `generateInvoice`: fetches subscription + plan, creates `BillingInvoice` with `status: OPEN`,
  `amount = plan.basePrice * seats + sum(usage overages)`, `lineItems` as JSON array of `{ description, qty, unitPrice, total }`.
  Publishes `billing.invoice.generated`.
- `markPaid`: sets `status = PAID`, `paidAt`, `version: { increment: 1 }`. Publishes `billing.invoice.paid`.
- `voidInvoice`: sets `status = VOID`, `version: { increment: 1 }`. Publishes `billing.invoice.voided`.

### Step 7 — `services/billing-service/src/routes/` (4 route files)

Create `plans.routes.ts`, `subscriptions.routes.ts`, `invoices.routes.ts`, `webhooks.routes.ts`:

**`plans.routes.ts`** — CRUD under `/api/v1/billing/plans`. `GET /plans` is public (no auth). 
Other routes require `PERMISSIONS.BILLING.MANAGE`.

**`subscriptions.routes.ts`** — under `/api/v1/billing/subscriptions`:
- `GET /` — get current tenant subscription (requires `PERMISSIONS.BILLING.READ`)
- `POST /` — create subscription (requires `PERMISSIONS.BILLING.MANAGE`)
- `PATCH /` — update subscription (requires `PERMISSIONS.BILLING.MANAGE`)
- `DELETE /` — cancel subscription (requires `PERMISSIONS.BILLING.MANAGE`)
- `POST /usage` — record usage event (requires `PERMISSIONS.BILLING.MANAGE`)
- `GET /usage` — get usage summary (requires `PERMISSIONS.BILLING.READ`)

**`invoices.routes.ts`** — under `/api/v1/billing/invoices`:
- `GET /` — list invoices (requires `PERMISSIONS.BILLING.READ`)
- `GET /:id` — get invoice (requires `PERMISSIONS.BILLING.READ`)
- `POST /generate` — generate invoice (requires `PERMISSIONS.BILLING.MANAGE`)
- `POST /:id/mark-paid` — mark paid (requires `PERMISSIONS.BILLING.MANAGE`)
- `POST /:id/void` — void invoice (requires `PERMISSIONS.BILLING.MANAGE`)

**`webhooks.routes.ts`** — under `/api/v1/billing/webhooks/stripe` (PUBLIC, no auth):
Handles Stripe webhook events. For now implement handlers for:
- `customer.subscription.updated` → calls `updateSubscription`
- `invoice.paid` → calls `markPaid`
- `invoice.payment_failed` → sets subscription status to `PAST_DUE`

Validate Stripe signature using `stripe-signature` header and `STRIPE_WEBHOOK_SECRET` env var.
If `STRIPE_WEBHOOK_SECRET` is not set, log a warning and skip signature validation (dev mode).
Parse the raw body — Fastify must have `rawBody: true` set for this route.

### Step 8 — `services/billing-service/src/index.ts`

Follow the exact same pattern as `comm-service/src/index.ts`:
- Port from `process.env.PORT ?? 3011`
- `JWT_SECRET` length check ≥ 32
- `createService(...)`, `globalErrorHandler`, `registerHealthRoutes`
- Register all 4 route groups
- `startService(app, port, async () => Promise.resolve())`

### Step 9 — Add to `packages/service-utils/src/permissions.ts` (or wherever PERMISSIONS live)

Add `BILLING` permission namespace:
```typescript
BILLING: {
  READ: 'billing:read',
  MANAGE: 'billing:manage',
},
```

### Step 10 — Add Zod schemas to `packages/validation/src/billing.schema.ts`

```typescript
CreatePlanSchema, UpdatePlanSchema,
CreateSubscriptionSchema, UpdateSubscriptionSchema,
RecordUsageSchema,
GenerateInvoiceSchema
```

### Step 11 — `services/billing-service/package.json`

```json
{
  "name": "@nexus/billing-service",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "db:migrate": "prisma migrate deploy",
    "db:generate": "prisma generate"
  },
  "dependencies": {
    "@nexus/kafka": "workspace:*",
    "@nexus/service-utils": "workspace:*",
    "@nexus/shared-types": "workspace:*",
    "@nexus/validation": "workspace:*",
    "@prisma/client": "^5.14.0",
    "decimal.js": "^10.4.3",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "prisma": "^5.14.0",
    "tsx": "^4.11.0",
    "typescript": "^5.4.5"
  }
}
```

### Step 12 — `services/billing-service/tsconfig.json`

Copy from `services/comm-service/tsconfig.json` verbatim, change `outDir` to `./dist`.

### Step 13 — `services/billing-service/.env.example`

```
PORT=3011
DATABASE_URL=postgresql://nexus:nexus@localhost:5432/nexus_billing
JWT_SECRET=change_me_to_a_very_long_secret_at_least_32_chars
STRIPE_SECRET_KEY=sk_test_placeholder
STRIPE_WEBHOOK_SECRET=whsec_placeholder
KAFKA_BROKERS=localhost:9092
CORS_ORIGINS=http://localhost:3000
```

### Step 14 — `services/billing-service/Dockerfile`

Copy from `services/comm-service/Dockerfile` verbatim, update service name references.

### Step 15 — `docker-compose.yml`

Add `billing-service` block following the `comm-service` pattern:
```yaml
  billing-service:
    build:
      context: .
      dockerfile: ./services/billing-service/Dockerfile
    container_name: nexus-billing
    restart: unless-stopped
    ports:
      - '3011:3011'
    env_file:
      - ./services/billing-service/.env.example
    environment:
      DATABASE_URL: postgresql://nexus:nexus@postgres:5432/nexus_billing
      KAFKA_BROKERS: kafka:9092
    depends_on:
      postgres:
        condition: service_healthy
      kafka:
        condition: service_started
```

Also add `billing-service` to the `web` service's `depends_on` list.

### Step 16 — `infrastructure/kong/kong.yml`

Add billing routes after the comm-service routes block:
```yaml
  - name: billing-service
    url: http://billing-service:3011
    routes:
      - name: billing-public
        paths: [/api/v1/billing/webhooks]
        strip_path: false
      - name: billing-api
        paths: [/api/v1/billing]
        strip_path: false
```

---

## PART 4 — NEW SERVICE: `integration-service` (port 3012)

### Overview
Manages outbound webhooks (tenant-configured event subscriptions), OAuth connection management
for third-party integrations (HubSpot, Salesforce, Google), and async sync jobs.
Uses its own Postgres DB (`nexus_integration`).

### Step 1 — `infrastructure/postgres/init.sql` (append)
```sql
CREATE DATABASE nexus_integration;
GRANT ALL PRIVILEGES ON DATABASE nexus_integration TO nexus;
\connect nexus_integration
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

### Step 2 — `services/integration-service/prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../../../node_modules/.prisma/integration-client"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model WebhookSubscription {
  id          String    @id @default(cuid())
  tenantId    String
  name        String
  targetUrl   String
  secret      String    // HMAC signing secret, stored hashed
  events      String[]  // e.g. ['deal.won', 'deal.created']
  isActive    Boolean   @default(true)
  version     Int       @default(1)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deliveries  WebhookDelivery[]

  @@index([tenantId])
  @@index([tenantId, isActive])
}

model WebhookDelivery {
  id               String              @id @default(cuid())
  subscriptionId   String
  subscription     WebhookSubscription @relation(fields: [subscriptionId], references: [id])
  tenantId         String
  eventType        String
  payload          Json
  status           DeliveryStatus      @default(PENDING)
  httpStatus       Int?
  responseBody     String?             @db.Text
  attemptCount     Int                 @default(0)
  nextRetryAt      DateTime?
  deliveredAt      DateTime?
  createdAt        DateTime            @default(now())

  @@index([tenantId, status])
  @@index([status, nextRetryAt])
}

model OAuthConnection {
  id              String    @id @default(cuid())
  tenantId        String
  provider        String    // 'hubspot' | 'salesforce' | 'google'
  providerAccountId String?
  accessToken     String    @db.Text  // encrypted at rest (AES-256)
  refreshToken    String?   @db.Text  // encrypted at rest
  expiresAt       DateTime?
  scopes          String[]
  metadata        Json      @default("{}")
  isActive        Boolean   @default(true)
  version         Int       @default(1)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@unique([tenantId, provider])
  @@index([tenantId])
}

model SyncJob {
  id           String      @id @default(cuid())
  tenantId     String
  connectionId String
  connection   OAuthConnection @relation(fields: [connectionId], references: [id])
  jobType      String      // 'contacts_import' | 'deals_import' | 'contacts_export'
  status       SyncStatus  @default(PENDING)
  totalRecords Int         @default(0)
  processedRecords Int     @default(0)
  errorCount   Int         @default(0)
  errorLog     Json        @default("[]")
  startedAt    DateTime?
  completedAt  DateTime?
  createdAt    DateTime    @default(now())

  @@index([tenantId, status])
}

enum DeliveryStatus {
  PENDING
  DELIVERED
  FAILED
  RETRYING
}

enum SyncStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
  CANCELED
}
```

Also add `SyncJob` relation to `OAuthConnection` (as shown above).

### Step 3 — `services/integration-service/src/services/webhooks.service.ts`

Implement `createWebhooksService(prisma, producer)` with:

```typescript
interface WebhooksService {
  listSubscriptions(tenantId: string): Promise<WebhookSubscription[]>;
  getSubscription(tenantId: string, id: string): Promise<WebhookSubscription>;
  createSubscription(tenantId: string, data: {
    name: string;
    targetUrl: string;
    events: string[];
  }): Promise<WebhookSubscription>;
  updateSubscription(tenantId: string, id: string, data: {
    name?: string;
    targetUrl?: string;
    events?: string[];
    isActive?: boolean;
  }): Promise<WebhookSubscription>;
  deleteSubscription(tenantId: string, id: string): Promise<void>;
  // Called by the Kafka consumer to fan out events to subscribers
  deliverEvent(tenantId: string, eventType: string, payload: Record<string, unknown>): Promise<void>;
  // Background job — retry failed deliveries
  processDeliveryQueue(): Promise<void>;
}
```

**Key implementation details:**

- `createSubscription`: generate a random 32-byte HMAC secret with `crypto.randomBytes(32).toString('hex')`.
  Store it **hashed** in the DB (`bcrypt` or `sha256`). Return the **plaintext secret once** in the response
  (document this clearly with a comment — it cannot be retrieved again).
  Actually for simplicity, store the plaintext secret encrypted with `AES-256-CBC` using `INTEGRATION_SECRET_KEY` env var.
  Use Node's built-in `crypto` module: `createCipheriv('aes-256-cbc', ...)`.

- `deliverEvent`: query all active subscriptions for the tenant that include `eventType` in their `events[]` array.
  For each subscription, create a `WebhookDelivery` record with `status: PENDING`, then immediately attempt HTTP POST.
  Sign the payload: `X-Nexus-Signature: sha256=<HMAC-SHA256(payload, secret)>`.
  Use `fetch` with a 5-second timeout (`AbortController`). On success (2xx), set status `DELIVERED`.
  On failure, set `status: RETRYING`, `attemptCount: 1`, `nextRetryAt: now + 5 minutes`.

- `processDeliveryQueue`: find all `RETRYING` deliveries where `nextRetryAt <= now` and `attemptCount < 5`.
  Re-attempt delivery. On success: `DELIVERED`. On failure and `attemptCount >= 5`: `FAILED`.
  Exponential backoff: `nextRetryAt = now + 5 * 2^attemptCount minutes`.

### Step 4 — `services/integration-service/src/services/connections.service.ts`

Implement `createConnectionsService(prisma)` with:

```typescript
interface ConnectionsService {
  listConnections(tenantId: string): Promise<OAuthConnectionSafe[]>;  // never return tokens
  getConnection(tenantId: string, provider: string): Promise<OAuthConnectionSafe>;
  upsertConnection(tenantId: string, data: {
    provider: string;
    providerAccountId: string;
    accessToken: string;
    refreshToken?: string;
    expiresAt?: Date;
    scopes: string[];
    metadata?: Record<string, unknown>;
  }): Promise<OAuthConnectionSafe>;
  revokeConnection(tenantId: string, provider: string): Promise<void>;
  isTokenExpired(connection: OAuthConnection): boolean;
}
```

**`OAuthConnectionSafe`** = OAuthConnection without `accessToken` and `refreshToken` fields.

**Token encryption:** Implement `encryptToken(token: string): string` and `decryptToken(cipher: string): string`
using `AES-256-CBC` with `INTEGRATION_SECRET_KEY` env var (must be exactly 32 bytes, enforce at startup).
Store IV prepended to ciphertext as `iv:ciphertext` (hex-encoded).

`upsertConnection`: use Prisma `upsert` on `{ tenantId_provider }` unique constraint.
Encrypt both `accessToken` and `refreshToken` before persisting.
Set `version: { increment: 1 }` in the update branch.

### Step 5 — `services/integration-service/src/services/sync.service.ts`

Implement `createSyncService(prisma, producer)` with:

```typescript
interface SyncService {
  listJobs(tenantId: string): Promise<SyncJob[]>;
  startSyncJob(tenantId: string, data: {
    connectionId: string;
    jobType: string;
  }): Promise<SyncJob>;
  updateJobProgress(id: string, processed: number, errors: string[]): Promise<void>;
  completeJob(id: string): Promise<void>;
  failJob(id: string, error: string): Promise<void>;
}
```

- `startSyncJob`: creates `SyncJob` with `status: RUNNING`, `startedAt: now()`.
  Publishes `integration.sync.started` Kafka event.
  Note: Actual sync work is done by background job handlers (out of scope for Phase 5 — 
  add a comment: `// Sync execution dispatched to background workers via Kafka`).
- `completeJob`: sets `status: COMPLETED`, `completedAt: now()`. Publishes `integration.sync.completed`.
- `failJob`: sets `status: FAILED`, appends to `errorLog`. Publishes `integration.sync.failed`.

### Step 6 — `services/integration-service/src/consumers/events.consumer.ts`

Subscribe to ALL Nexus Kafka topics and fan out events to webhook subscribers:
```typescript
// Subscribe to: nexus.crm.deals, nexus.crm.contacts, nexus.crm.accounts,
//               nexus.finance.quotes, nexus.automation.workflows
// For each message: call webhooksService.deliverEvent(tenantId, eventType, payload)
```

### Step 7 — Routes

**`webhooks.routes.ts`** — `/api/v1/integrations/webhooks`:
- `GET /` — list subscriptions (PERMISSIONS.INTEGRATIONS.READ)
- `POST /` — create subscription (PERMISSIONS.INTEGRATIONS.MANAGE) — return plaintext secret ONCE
- `PATCH /:id` — update (PERMISSIONS.INTEGRATIONS.MANAGE)
- `DELETE /:id` — delete (PERMISSIONS.INTEGRATIONS.MANAGE)
- `GET /:id/deliveries` — list recent deliveries for a subscription (PERMISSIONS.INTEGRATIONS.READ)

**`connections.routes.ts`** — `/api/v1/integrations/connections`:
- `GET /` — list connections (PERMISSIONS.INTEGRATIONS.READ) — never return tokens
- `POST /` — upsert connection (PERMISSIONS.INTEGRATIONS.MANAGE)
- `DELETE /:provider` — revoke (PERMISSIONS.INTEGRATIONS.MANAGE)

**`sync.routes.ts`** — `/api/v1/integrations/sync`:
- `GET /` — list sync jobs (PERMISSIONS.INTEGRATIONS.READ)
- `POST /` — start sync job (PERMISSIONS.INTEGRATIONS.MANAGE)

### Step 8 — `services/integration-service/src/index.ts`

Port 3012. Same pattern as billing-service. Also start the events consumer and a 30-second interval
to call `webhooksService.processDeliveryQueue()`:
```typescript
setInterval(() => {
  webhooksService.processDeliveryQueue().catch((err) => app.log.error({ err }, 'Delivery queue error'));
}, 30_000);
```

### Step 9 — Add to `packages/service-utils/src/permissions.ts`:
```typescript
INTEGRATIONS: {
  READ: 'integrations:read',
  MANAGE: 'integrations:manage',
},
```

### Step 10 — Add Zod schemas to `packages/validation/src/integration.schema.ts`

```typescript
CreateWebhookSubscriptionSchema, UpdateWebhookSubscriptionSchema,
UpsertConnectionSchema, StartSyncJobSchema
```

### Step 11 — `services/integration-service/package.json`, `tsconfig.json`, `.env.example`, `Dockerfile`

Same pattern as billing-service. Port 3012.

`.env.example`:
```
PORT=3012
DATABASE_URL=postgresql://nexus:nexus@localhost:5432/nexus_integration
JWT_SECRET=change_me_to_a_very_long_secret_at_least_32_chars
INTEGRATION_SECRET_KEY=change_me_to_exactly_32_bytes_key  # exactly 32 bytes
KAFKA_BROKERS=localhost:9092
CORS_ORIGINS=http://localhost:3000
```

### Step 12 — `docker-compose.yml` + `infrastructure/kong/kong.yml`

Add `integration-service` on port 3012. Kong routes: `/api/v1/integrations`.

---

## PART 5 — NEW SERVICE: `blueprint-service` (port 3013)

### Overview
Manages Sales Playbooks, Deal Entry Templates (stage-level required fields + recommended actions),
and Pipeline Stage Exit Criteria. When a deal is about to move to the next stage, blueprint-service
validates that all required fields are filled. Uses its own Postgres DB (`nexus_blueprint`).

### Step 1 — `infrastructure/postgres/init.sql` (append)
```sql
CREATE DATABASE nexus_blueprint;
GRANT ALL PRIVILEGES ON DATABASE nexus_blueprint TO nexus;
\connect nexus_blueprint
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

### Step 2 — `services/blueprint-service/prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../../../node_modules/.prisma/blueprint-client"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Playbook {
  id          String       @id @default(cuid())
  tenantId    String
  name        String
  description String?
  pipelineId  String?      // optional: scoped to specific pipeline
  isActive    Boolean      @default(true)
  version     Int          @default(1)
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  stages      PlaybookStage[]

  @@index([tenantId])
  @@index([tenantId, pipelineId, isActive])
}

model PlaybookStage {
  id             String       @id @default(cuid())
  playbookId     String
  playbook       Playbook     @relation(fields: [playbookId], references: [id], onDelete: Cascade)
  stageId        String       // references CRM pipeline stage ID
  stageName      String       // denormalised for display without CRM lookup
  position       Int
  entryActions   Json         @default("[]")  // recommended actions when entering stage
  exitCriteria   Json         @default("[]")  // conditions that must be true to exit
  requiredFields Json         @default("[]")  // deal fields that must be non-null
  talkingPoints  Json         @default("[]")  // free text bullets for sales reps
  resources      Json         @default("[]")  // { title, url } links
  version        Int          @default(1)
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  @@index([playbookId])
  @@index([playbookId, stageId])
}

model DealEntryTemplate {
  id          String    @id @default(cuid())
  tenantId    String
  name        String
  description String?
  pipelineId  String?
  fields      Json      @default("[]")
  // fields: Array<{
  //   fieldKey: string;        // e.g. 'amount', 'closeDate', 'custom_field_1'
  //   label: string;
  //   type: 'text' | 'number' | 'date' | 'select' | 'boolean';
  //   required: boolean;
  //   options?: string[];      // for select type
  //   defaultValue?: unknown;
  // }>
  isActive    Boolean   @default(true)
  version     Int       @default(1)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([tenantId])
}

model StageExitValidation {
  id           String    @id @default(cuid())
  tenantId     String
  pipelineId   String
  fromStageId  String
  toStageId    String
  rules        Json      @default("[]")
  // rules: Array<{
  //   type: 'required_field' | 'min_value' | 'activity_completed' | 'contact_linked';
  //   field?: string;
  //   minValue?: number;
  //   activityType?: string;
  //   errorMessage: string;
  // }>
  isActive     Boolean   @default(true)
  version      Int       @default(1)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  @@unique([tenantId, pipelineId, fromStageId, toStageId])
  @@index([tenantId, pipelineId])
}
```

### Step 3 — `services/blueprint-service/src/services/playbooks.service.ts`

Implement `createPlaybooksService(prisma, producer)` with:
```typescript
interface PlaybooksService {
  listPlaybooks(tenantId: string, pipelineId?: string): Promise<Playbook[]>;
  getPlaybook(tenantId: string, id: string): Promise<Playbook & { stages: PlaybookStage[] }>;
  createPlaybook(tenantId: string, data: {
    name: string;
    description?: string;
    pipelineId?: string;
  }): Promise<Playbook>;
  updatePlaybook(tenantId: string, id: string, data: {
    name?: string;
    description?: string;
    isActive?: boolean;
  }): Promise<Playbook>;
  deletePlaybook(tenantId: string, id: string): Promise<void>;
  upsertStage(tenantId: string, playbookId: string, data: {
    stageId: string;
    stageName: string;
    position: number;
    entryActions?: unknown[];
    exitCriteria?: unknown[];
    requiredFields?: string[];
    talkingPoints?: string[];
    resources?: Array<{ title: string; url: string }>;
  }): Promise<PlaybookStage>;
  removeStage(tenantId: string, playbookId: string, stageId: string): Promise<void>;
}
```

All mutations publish Kafka events: `blueprint.playbook.created`, `blueprint.playbook.updated`,
`blueprint.stage.upserted`.

### Step 4 — `services/blueprint-service/src/services/templates.service.ts`

Implement `createDealTemplatesService(prisma)` with full CRUD on `DealEntryTemplate`.
Methods: `listTemplates`, `getTemplate`, `createTemplate`, `updateTemplate`, `deleteTemplate`.

### Step 5 — `services/blueprint-service/src/services/validation.service.ts`

This is the most important service — called by crm-service when a deal is about to change stages.

```typescript
interface ValidationService {
  // Validate whether a deal can move from fromStageId to toStageId
  validateStageTransition(
    tenantId: string,
    pipelineId: string,
    fromStageId: string,
    toStageId: string,
    dealSnapshot: Record<string, unknown>   // the deal's current field values
  ): Promise<{
    valid: boolean;
    errors: Array<{ rule: string; field?: string; message: string }>;
  }>;
  // Get the active playbook stage config for a given stage
  getPlaybookForStage(
    tenantId: string,
    pipelineId: string,
    stageId: string
  ): Promise<PlaybookStage | null>;
  // CRUD on StageExitValidation rules
  listValidationRules(tenantId: string, pipelineId: string): Promise<StageExitValidation[]>;
  upsertValidationRule(tenantId: string, data: {
    pipelineId: string;
    fromStageId: string;
    toStageId: string;
    rules: Array<{
      type: 'required_field' | 'min_value' | 'activity_completed' | 'contact_linked';
      field?: string;
      minValue?: number;
      activityType?: string;
      errorMessage: string;
    }>;
  }): Promise<StageExitValidation>;
  deleteValidationRule(tenantId: string, id: string): Promise<void>;
}
```

**`validateStageTransition` implementation:**
```typescript
// 1. Find active StageExitValidation for (tenantId, pipelineId, fromStageId, toStageId)
// 2. Also find active Playbook for (tenantId, pipelineId) and get the stage's requiredFields
// 3. For each rule in StageExitValidation.rules:
//    - 'required_field': check dealSnapshot[rule.field] is not null/undefined/''
//    - 'min_value': check Number(dealSnapshot[rule.field]) >= rule.minValue
//    - 'activity_completed': cannot validate from snapshot alone → skip with note
//    - 'contact_linked': check dealSnapshot['contacts'] is a non-empty array
// 4. For each field in PlaybookStage.requiredFields:
//    - check dealSnapshot[field] is not null/undefined/''
// 5. Return { valid: errors.length === 0, errors }
```

### Step 6 — Routes

**`playbooks.routes.ts`** — `/api/v1/blueprints/playbooks`:
- Full CRUD + stage upsert/remove endpoints
- All require `PERMISSIONS.BLUEPRINTS.MANAGE` except GET routes which require `PERMISSIONS.BLUEPRINTS.READ`

**`templates.routes.ts`** — `/api/v1/blueprints/templates`: Full CRUD

**`validation.routes.ts`** — `/api/v1/blueprints/validation`:
- `POST /validate-transition` — validate a stage transition (body: `{ pipelineId, fromStageId, toStageId, dealSnapshot }`)
  This route requires ONLY a service-to-service JWT (not necessarily RBAC), since crm-service calls it.
  Check for header `x-service-token` matching `BLUEPRINT_SERVICE_TOKEN` env var, OR fall back to normal JWT auth.
- `GET /rules` — list rules (PERMISSIONS.BLUEPRINTS.READ)
- `POST /rules` — upsert rule (PERMISSIONS.BLUEPRINTS.MANAGE)
- `DELETE /rules/:id` — delete rule (PERMISSIONS.BLUEPRINTS.MANAGE)

### Step 7 — `services/blueprint-service/src/index.ts`

Port 3013. Same pattern as other services.

### Step 8 — Add to `packages/service-utils/src/permissions.ts`:
```typescript
BLUEPRINTS: {
  READ: 'blueprints:read',
  MANAGE: 'blueprints:manage',
},
```

### Step 9 — Add Zod schemas to `packages/validation/src/blueprint.schema.ts`

```typescript
CreatePlaybookSchema, UpdatePlaybookSchema,
UpsertPlaybookStageSchema,
CreateTemplateSchema, UpdateTemplateSchema,
UpsertValidationRuleSchema,
ValidateTransitionSchema
```

### Step 10 — `services/blueprint-service/package.json`, `tsconfig.json`, `.env.example`, `Dockerfile`

Same pattern as billing-service. Port 3013.

`.env.example`:
```
PORT=3013
DATABASE_URL=postgresql://nexus:nexus@localhost:5432/nexus_blueprint
JWT_SECRET=change_me_to_a_very_long_secret_at_least_32_chars
BLUEPRINT_SERVICE_TOKEN=change_me_blueprint_service_token
KAFKA_BROKERS=localhost:9092
CORS_ORIGINS=http://localhost:3000
```

### Step 11 — `docker-compose.yml` + `infrastructure/kong/kong.yml`

Add `blueprint-service` on port 3013. Kong routes: `/api/v1/blueprints`.

---

## PART 6 — SHARED INFRASTRUCTURE UPDATES

### FILE: `infrastructure/postgres/init.sql` (final state)

After all additions, the file should create these databases:
`nexus_auth`, `nexus_crm`, `nexus_finance`, `nexus_notifications`, `nexus_comm`,
`nexus_storage`, `nexus_workflow`, `nexus_billing`, `nexus_integration`, `nexus_blueprint`.
Each gets `uuid-ossp` extension.

### FILE: `packages/validation/src/index.ts`

Export all new schemas: `billing.schema.ts`, `integration.schema.ts`, `blueprint.schema.ts`.

### FILE: `packages/shared-types/src/index.ts`

Add shared event type union additions for new domains:
```typescript
// Add to existing KafkaEventType union or domain registries:
| 'billing.subscription.created' | 'billing.subscription.updated' | 'billing.subscription.canceled'
| 'billing.invoice.generated'    | 'billing.invoice.paid'         | 'billing.invoice.voided'
| 'integration.sync.started'     | 'integration.sync.completed'   | 'integration.sync.failed'
| 'blueprint.playbook.created'   | 'blueprint.playbook.updated'   | 'blueprint.stage.upserted'
| 'workflow.branch.start'
```

---

## PART 7 — TESTS

### FILE: `services/billing-service/src/__tests__/subscriptions.service.test.ts`

Write a vitest test file (≥ 120 lines) covering:
- `createSubscription`: verify status is `TRIALING` when `trialDays > 0`, `ACTIVE` when `trialDays = 0`
- `cancelSubscription`: verify `cancelAtPeriodEnd = true`
- `recordUsage` + `getUsageSummary`: verify aggregation
- `generateInvoice`: verify amount = `plan.basePrice * seats`

Use `vi.fn()` mocks for Prisma and the Kafka producer. Follow the exact same vitest pattern
used in `services/crm-service/src/__tests__/deals.service.test.ts`.

### FILE: `services/integration-service/src/__tests__/webhooks.service.test.ts`

Write a vitest test file (≥ 100 lines) covering:
- `createSubscription`: verify secret is generated and encrypted
- `deliverEvent`: verify HTTP POST is attempted, delivery record created
- `processDeliveryQueue`: verify retry logic and exponential backoff

### FILE: `services/blueprint-service/src/__tests__/validation.service.test.ts`

Write a vitest test file (≥ 100 lines) covering:
- `validateStageTransition`: valid case (all required fields present)
- `validateStageTransition`: invalid case (missing required_field) → errors array populated
- `validateStageTransition`: min_value rule — deal amount below minimum → error
- `getPlaybookForStage`: returns null when no playbook exists

### FILE: `services/workflow-service/src/__tests__/fork.test.ts`

Add tests for `handleForkNode` and `handleJoinNode`:
- `handleForkNode`: creates `WorkflowForkTracker` row, creates child executions, publishes Kafka events
- `handleJoinNode`: returns `pauseUntil` when branches not complete, returns `pauseUntil: null` when all complete

---

## PART 8 — FINAL CHECKLIST

Before submitting, run these checks mentally against every file you wrote:

- [ ] Zero `any` types
- [ ] Zero `TODO` / `FIXME` / `stub` comments
- [ ] Every Prisma query includes `tenantId` in `where`
- [ ] Every Prisma `update` has `version: { increment: 1 }`
- [ ] Every monetary value uses `decimal.js`
- [ ] Every state-change publishes a typed Kafka event
- [ ] Every route has `requirePermission(...)` preHandler
- [ ] Every route body/query is validated through a Zod schema
- [ ] `NotFoundError` thrown (not returned) when entity not found
- [ ] `BusinessRuleError` thrown for domain violations
- [ ] All `catch (err)` blocks use `err instanceof Error ? err.message : String(err)`
- [ ] All `index.ts` files check `JWT_SECRET` length ≥ 32 before proceeding
- [ ] New services added to `docker-compose.yml` with correct `depends_on`
- [ ] New services added to Kong declarative config
- [ ] New databases added to `infrastructure/postgres/init.sql`
- [ ] New Kafka event types added to `@nexus/shared-types`
- [ ] New permissions added to `@nexus/service-utils`
- [ ] New Zod schemas exported from `@nexus/validation`
- [ ] All 3 new services have `package.json`, `tsconfig.json`, `.env.example`, `Dockerfile`

**Target LOC:** Each new service should be 400–700 lines of TypeScript source.
The analytics fix should be ~50 lines. The fork/join fix ~100 lines.
Total Phase 5 addition: ~2,000–3,000 lines.

---

## FILE COUNT SUMMARY

| # | File | Action |
|---|------|--------|
| 1 | `services/analytics-service/src/services/pipeline.analytics.ts` | FIX (rewrite) |
| 2 | `services/analytics-service/src/services/activity.analytics.ts` | FIX (add overdueRate + getActivityByType) |
| 3 | `services/workflow-service/prisma/schema.prisma` | ADD WorkflowForkTracker model |
| 4 | `services/workflow-service/src/engine/nodes/fork.node.ts` | REWRITE |
| 5 | `services/workflow-service/src/engine/nodes/join.node.ts` | REWRITE |
| 6 | `services/workflow-service/src/engine/executor.ts` | UPDATE FORK/JOIN dispatch |
| 7 | `services/workflow-service/src/consumers/branch.consumer.ts` | CREATE |
| 8 | `infrastructure/postgres/init.sql` | APPEND 3 new databases |
| 9 | `services/billing-service/prisma/schema.prisma` | CREATE |
| 10 | `services/billing-service/src/prisma.ts` | CREATE |
| 11 | `services/billing-service/src/services/plans.service.ts` | CREATE |
| 12 | `services/billing-service/src/services/subscriptions.service.ts` | CREATE |
| 13 | `services/billing-service/src/services/invoices.service.ts` | CREATE |
| 14 | `services/billing-service/src/routes/plans.routes.ts` | CREATE |
| 15 | `services/billing-service/src/routes/subscriptions.routes.ts` | CREATE |
| 16 | `services/billing-service/src/routes/invoices.routes.ts` | CREATE |
| 17 | `services/billing-service/src/routes/webhooks.routes.ts` | CREATE (Stripe webhooks) |
| 18 | `services/billing-service/src/index.ts` | CREATE |
| 19 | `services/billing-service/package.json` | CREATE |
| 20 | `services/billing-service/tsconfig.json` | CREATE |
| 21 | `services/billing-service/.env.example` | CREATE |
| 22 | `services/billing-service/Dockerfile` | CREATE |
| 23 | `services/integration-service/prisma/schema.prisma` | CREATE |
| 24 | `services/integration-service/src/prisma.ts` | CREATE |
| 25 | `services/integration-service/src/services/webhooks.service.ts` | CREATE |
| 26 | `services/integration-service/src/services/connections.service.ts` | CREATE |
| 27 | `services/integration-service/src/services/sync.service.ts` | CREATE |
| 28 | `services/integration-service/src/consumers/events.consumer.ts` | CREATE |
| 29 | `services/integration-service/src/routes/webhooks.routes.ts` | CREATE |
| 30 | `services/integration-service/src/routes/connections.routes.ts` | CREATE |
| 31 | `services/integration-service/src/routes/sync.routes.ts` | CREATE |
| 32 | `services/integration-service/src/index.ts` | CREATE |
| 33 | `services/integration-service/package.json` | CREATE |
| 34 | `services/integration-service/tsconfig.json` | CREATE |
| 35 | `services/integration-service/.env.example` | CREATE |
| 36 | `services/integration-service/Dockerfile` | CREATE |
| 37 | `services/blueprint-service/prisma/schema.prisma` | CREATE |
| 38 | `services/blueprint-service/src/prisma.ts` | CREATE |
| 39 | `services/blueprint-service/src/services/playbooks.service.ts` | CREATE |
| 40 | `services/blueprint-service/src/services/templates.service.ts` | CREATE |
| 41 | `services/blueprint-service/src/services/validation.service.ts` | CREATE |
| 42 | `services/blueprint-service/src/routes/playbooks.routes.ts` | CREATE |
| 43 | `services/blueprint-service/src/routes/templates.routes.ts` | CREATE |
| 44 | `services/blueprint-service/src/routes/validation.routes.ts` | CREATE |
| 45 | `services/blueprint-service/src/index.ts` | CREATE |
| 46 | `services/blueprint-service/package.json` | CREATE |
| 47 | `services/blueprint-service/tsconfig.json` | CREATE |
| 48 | `services/blueprint-service/.env.example` | CREATE |
| 49 | `services/blueprint-service/Dockerfile` | CREATE |
| 50 | `packages/service-utils/src/permissions.ts` | ADD BILLING, INTEGRATIONS, BLUEPRINTS |
| 51 | `packages/shared-types/src/index.ts` | ADD new Kafka event types |
| 52 | `packages/validation/src/billing.schema.ts` | CREATE |
| 53 | `packages/validation/src/integration.schema.ts` | CREATE |
| 54 | `packages/validation/src/blueprint.schema.ts` | CREATE |
| 55 | `packages/validation/src/index.ts` | EXPORT new schemas |
| 56 | `docker-compose.yml` | ADD 3 new service blocks |
| 57 | `infrastructure/kong/kong.yml` | ADD 3 new route groups |
| 58 | `services/billing-service/src/__tests__/subscriptions.service.test.ts` | CREATE |
| 59 | `services/integration-service/src/__tests__/webhooks.service.test.ts` | CREATE |
| 60 | `services/blueprint-service/src/__tests__/validation.service.test.ts` | CREATE |
| 61 | `services/workflow-service/src/__tests__/fork.test.ts` | CREATE |

**Total: 61 files (7 fixes/updates + 54 new files)**
