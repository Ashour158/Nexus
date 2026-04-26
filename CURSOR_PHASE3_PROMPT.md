# NEXUS CRM — Phase 3 Build Prompt
## Paste this entire file as your first Cursor message

---

## STATE OF THE BUILD (do not rewrite anything listed here)

**Total LOC so far: ~23,000 lines across 4 services + frontend + infrastructure**

### Confirmed complete — DO NOT touch:
```
packages/shared-types, validation, kafka, service-utils         ✅
services/auth-service/                                          ✅ (full)
services/crm-service/  (deals, accounts, contacts, leads,
                        pipelines, activities, notes)           ✅
services/finance-service/ (products, invoices, contracts,
                           quotes, commission, cpq)             ✅
services/notification-service/ (full scaffold)                  ✅
apps/web/src/components/layout/ (sidebar, topbar, app-shell)    ✅
apps/web/src/app/(dashboard)/ (deals, contacts, accounts,
                               leads, activities pages)         ✅
docker-compose.yml + Dockerfiles + init.sql                     ✅
Vitest tests: deals (15 passing) + pricing engine (12 passing)  ✅
```

### Code patterns — same as always:
- Services: `createXxxService(prisma, producer)` factory returning methods object
- Routes: `registerXxxRoutes(app, prisma, producer)` registered under `/api/v1`
- Tenancy: `tenantId` in **every** DB query where clause
- Mutations: `version: { increment: 1 }` on versioned models
- Validation: `Zod.safeParse` on every request body/query before use
- Auth: `const jwt = request.user as JwtPayload`
- Money: `decimal.js` — never native JS floats for financial values
- Zero stubs, zero TODOs, zero `any` types

---

## PHASE 3 — FILE ORDER (work top to bottom, do not skip)

---

### FILE 1: `apps/web/src/app/(dashboard)/deals/[id]/page.tsx`

The deal detail view — the most important missing frontend page. Users can see the pipeline board but cannot click into a deal yet.

Full implementation requirements:

```
Layout: two-column on desktop (lg:grid lg:grid-cols-3 gap-6)
  Left column (2/3 width): tabs [Overview | Timeline | Activities | Notes | Quotes]
  Right column (1/3 width): sticky sidebar with deal metadata card

OVERVIEW TAB:
  - Deal header: name, amount (large), status badge (WON/LOST/OPEN), pipeline/stage breadcrumb
  - Account card: linked account name (clickable), website, industry, ARR, tier badge
  - MEDDIC score ring (0–100 circular progress) + expandable MEDDIC form (import DealMeddicicForm from @/components/deals/deal-meddic-form — write this component too)
  - Contacts section: list of linked contacts with role badge, "+ Add Contact" button
  - Custom fields JSON viewer (collapsible)

TIMELINE TAB:
  - Unified feed of activities + notes (newest first)
  - Each entry: icon (activity type or note icon), title, timestamp relative ("2 hours ago"), actor avatar placeholder
  - Infinite scroll or pagination

ACTIVITIES TAB:
  - List of activities (type icon, subject, due date colored red if overdue, status badge, owner)
  - "+ Schedule Activity" button → inline slide-over form
  - "Complete" button on OPEN activities → outcome input popover

NOTES TAB:
  - Pinned notes first (pinned badge), then by date desc
  - Rich textarea to add new note (min 2 rows, auto-expand)
  - Edit/delete on hover (author-only)
  - Pin/unpin toggle

QUOTES TAB:
  - List of quotes with status badge, total, version number, created date
  - "+ New Quote" button → navigates to /quotes/new?dealId=xxx
  - Status actions: Send, Accept, Reject inline on each row

RIGHT SIDEBAR:
  - Deal info card: Owner (avatar + name), Close date (color-coded if past due), Probability gauge bar, Forecast category pill, Created/Updated timestamps
  - Stage move: clickable stage progression bar showing all pipeline stages (highlight current, click to move)
  - Quick actions: "Mark Won" button (green), "Mark Lost" button (red with reason modal), Edit button
  - Tags display

Use these hooks (all already exist): useDeal(id), useUpdateDeal(), useMoveDeal(), useDealTimeline(), useDealActivities(dealId), useCreateActivity(), useCompleteActivity(), useDealNotes(), useCreateNote(), useDealQuotes()
Write missing hooks alongside this file if they don't exist.
```

---

### FILE 2: `apps/web/src/components/deals/deal-meddic-form.tsx`

MEDDIC/MEDDPICC qualification form component used on the deal detail page.

```
8 sections — each collapsible:
  Metrics (score 0–100 slider + description textarea)
  Economic Buyer (identified checkbox + name input + access level select)
  Decision Criteria (score 0–100 + criteria list textarea)
  Decision Process (score 0–100 + process description + next step + expected decision date)
  Paper Process (score 0–100 + procurement type + legal review required toggle)
  Identify Pain (score 0–100 + pain description + business impact textarea)
  Champion (identified checkbox + contact select from deal contacts + strength rating 1–5 stars)
  Competition (identified checkbox + competitor names tag input + our differentiators textarea)

Footer: overall MEDDIC score (computed from 8 dimensions, live preview)
"Save MEDDIC" button → calls useUpdateMeddic() mutation → PATCH /deals/:id/meddic

Props: dealId: string, initialData?: MeddicicData, onSave?: () => void
```

---

### FILE 3: `apps/web/src/app/(dashboard)/quotes/page.tsx`

Quotes list page:

```
Table columns: Quote # (auto-generated), Deal name (linked), Account, Status badge, Total (currency formatted), Version, Expires, Owner, Created
Filters: status (DRAFT/SENT/ACCEPTED/REJECTED/EXPIRED/VOID), ownerId, dateFrom/dateTo
Actions per row: Send (if DRAFT), Duplicate, Void, Download PDF (placeholder button for now)
Status color coding: DRAFT=grey, SENT=blue, ACCEPTED=green, REJECTED=red, EXPIRED=amber, VOID=slate
Write useQuotes(filters, pagination) hook alongside this file
```

---

### FILE 4: `apps/web/src/app/(dashboard)/quotes/new/page.tsx`

Quote builder — the UI for the CPQ engine:

```
Step 1 — Deal selection (if not pre-filled from ?dealId param):
  Searchable deal combobox → auto-fills account

Step 2 — Line items builder:
  Product search (calls GET /products) → add to line items table
  Each line: product name, qty (number input), list price (read-only), unit price (editable for override), discount %, line total
  "+ Add Product" button
  Remove line button

Step 3 — Pricing summary:
  "Calculate Price" button → POST /cpq/price → shows result:
    Per-line breakdown with applied rules
    Subtotal / Discount Total / Tax / Grand Total
    Floor price warnings (amber alert)
    Approval required indicator (red banner if approvalRequired=true)
  Payment terms select (NET_30/NET_60/NET_0/PREPAID) — recalculates on change
  Promo code input + "Apply" button

Step 4 — Quote details:
  Quote name, expiry date, notes textarea
  "Create Quote" button → POST /quotes with the CPQ result → redirects to /deals/:id on success

All state in React (useState/useReducer) — no server state until final submit
```

---

### FILE 5: `apps/web/src/app/(dashboard)/page.tsx` (Dashboard)

Replace the current placeholder root dashboard with a real metrics dashboard:

```
KPI row (4 cards):
  - Open Deals (count + total value)
  - Won This Month (count + total value, green)
  - Activities Due Today (count, amber if > 0)
  - Quota Attainment % (won value / target — use hardcoded target for now, settable in settings later)

Pipeline Health chart:
  - Horizontal bar chart per stage showing deal count + value
  - Use recharts BarChart (already available as a dependency)
  - Data from GET /deals grouped by stageId (client-side group after fetch)

Recent Activity feed:
  - Last 10 activities across all deals (GET /activities?limit=10&sortBy=updatedAt)
  - Each: activity type icon, subject, related deal name (linked), owner, "X ago" timestamp

My Tasks widget:
  - GET /activities?ownerId=me&status=OPEN&dueBefore=7days, limit 5
  - Each row: checkbox (ticks off via complete mutation), subject, due date
  - "View all" link → /activities

Deals closing this week:
  - GET /deals?status=OPEN, filter client-side for expectedCloseDate within 7 days
  - Small table: name, amount, stage, probability, owner

All data via React Query hooks. Loading skeletons for each section.
```

---

### FILE 6: `apps/web/src/app/(dashboard)/settings/page.tsx` and sub-pages

Settings section with tabbed navigation:

**`settings/page.tsx`** — redirects to `/settings/pipelines`

**`settings/pipelines/page.tsx`**:
```
List all pipelines (GET /pipelines)
Each pipeline: name, stage count, deal count, is default badge, Edit / Archive buttons
"+ New Pipeline" → inline form: name, currency
Stage editor (click pipeline → expands stage list):
  - Each stage: name (inline edit), order (drag reorder via @dnd-kit), probability (0–100 slider), rotten days input
  - "+ Add Stage" button
  - Delete stage (only if no deals in stage)
  - "Save Changes" → PATCH /pipelines/:id + PATCH /stages/:id for each modified stage
```

**`settings/users/page.tsx`**:
```
Table: Avatar, Name, Email, Role badge, Status (active/inactive), Last login, Actions
Actions: Change role (select dropdown inline), Deactivate/Activate, Reset password (sends email)
"+ Invite User" button → modal: email, role select → POST /auth/users/invite
Uses GET /users from auth-service
```

**`settings/profile/page.tsx`**:
```
Form fields: First name, Last name, Email (read-only), Phone, Timezone select, Language select
Avatar upload (placeholder — button exists but no upload logic yet, just shows initials avatar)
Change password section: current password, new password, confirm → PATCH /auth/users/me/password
Save button → PATCH /auth/users/me
```

---

### FILE 7: New service — `services/realtime-service/`

Create the full realtime service. This is the Socket.io server that pushes live updates to the browser.

Structure:
```
services/realtime-service/
  src/
    index.ts                    — Fastify + Socket.io bootstrap on port 3005
    socket/
      auth.middleware.ts        — validate JWT on socket handshake (reuse @nexus/service-utils logic)
      rooms.ts                  — room naming: tenant:{tenantId}, user:{userId}, deal:{dealId}
      handlers/
        deal.handler.ts         — join/leave deal rooms, receive deal update events
        notification.handler.ts — push unread count to user:{userId} room
    consumers/
      deal.consumer.ts          — subscribe Kafka TOPICS.DEALS → emit to tenant room
      notification.consumer.ts  — subscribe TOPICS.NOTIFICATIONS → emit to user room
      activity.consumer.ts      — subscribe TOPICS.ACTIVITIES → emit to deal room
    routes/
      health.routes.ts          — GET /health (reuse registerHealthRoutes)
  package.json
  tsconfig.json
  Dockerfile                    — same multi-stage pattern as other services
```

**`src/index.ts`** — must:
- Create Fastify app via `createService` from `@nexus/service-utils`
- Attach Socket.io to the Fastify HTTP server: `const io = new Server(app.server, { cors: { origin: process.env.CORS_ORIGINS }, transports: ['websocket', 'polling'] })`
- Apply JWT auth middleware on every socket connection
- Start all Kafka consumers
- Add Dockerfile ENV: PORT=3005, REALTIME_DATABASE_URL not needed (no DB — stateless)

**`auth.middleware.ts`**:
```typescript
// Validate the JWT passed as socket.handshake.auth.token
// Attach decoded JwtPayload to socket.data.user
// Reject connection with Error('Unauthorized') if invalid
```

**`deal.handler.ts`**:
```typescript
socket.on('deal:subscribe', (dealId: string) => { socket.join(`deal:${dealId}`); })
socket.on('deal:unsubscribe', (dealId: string) => { socket.leave(`deal:${dealId}`); })
```

**`consumers/deal.consumer.ts`**:
```typescript
// Subscribe to TOPICS.DEALS
// On any event: io.to(`tenant:${tenantId}`).emit('deal:updated', { type, payload })
// On deal.stage_changed: also io.to(`deal:${dealId}`).emit('deal:stage_changed', payload)
// On deal.won/deal.lost: also emit deal:status_changed
```

---

### FILE 8: New service — `services/search-service/`

Meilisearch integration service. Indexes CRM entities and exposes a unified search API.

Structure:
```
services/search-service/
  src/
    index.ts                    — Fastify bootstrap on port 3006
    meilisearch.ts              — Meilisearch client factory (MEILISEARCH_URL, MEILISEARCH_KEY)
    indexes/
      setup.ts                  — createOrUpdateIndex for all entities with correct settings
      deals.index.ts            — fields: id, tenantId, name, accountName, ownerName, status, amount, stageId, tags
      contacts.index.ts         — fields: id, tenantId, firstName, lastName, email, phone, accountName
      accounts.index.ts         — fields: id, tenantId, name, website, industry, tier
      leads.index.ts            — fields: id, tenantId, firstName, lastName, email, company, status, score
    consumers/
      indexer.consumer.ts       — Kafka consumer: on deal.created/updated/won/lost → upsert in deals index
                                   on contact/account/lead events → upsert in their indexes
    routes/
      search.routes.ts          — GET /search?q=&types=&tenantId= (from JWT)
                                   GET /search/deals?q=
                                   GET /search/contacts?q=
                                   GET /search/accounts?q=
  package.json
  tsconfig.json
  Dockerfile
```

**`search.routes.ts`** must:
- Global search: query all 4 indexes in parallel via `Promise.all`, merge results, return `{ deals: [], contacts: [], accounts: [], leads: [], total: number }`
- Per-entity search: query single index with `tenantId` filter
- All searches enforce `filter: "tenantId = '${jwt.tenantId}'"` — never return another tenant's data
- Pagination: `limit` (default 20, max 100), `offset`

**`indexes/setup.ts`** must:
```typescript
// Run on service startup — idempotent
// For deals index: searchableAttributes: ['name', 'accountName', 'ownerName', 'tags']
//                  filterableAttributes: ['tenantId', 'status', 'stageId']
//                  sortableAttributes: ['amount', 'createdAt']
// For contacts: searchableAttributes: ['firstName', 'lastName', 'email', 'phone']
// For accounts: searchableAttributes: ['name', 'website']
// For leads: searchableAttributes: ['firstName', 'lastName', 'email', 'company']
```

---

### FILE 9: Add realtime to the frontend

**`apps/web/src/lib/socket.ts`**:
```typescript
// Singleton Socket.io client
import { io, type Socket } from 'socket.io-client';
import { useAuthStore } from '@/stores/auth.store';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const token = useAuthStore.getState().accessToken;
    socket = io(process.env.NEXT_PUBLIC_REALTIME_URL ?? 'http://localhost:3005', {
      auth: { token },
      transports: ['websocket'],
      autoConnect: false,
    });
  }
  return socket;
}

export function connectSocket(): void { getSocket().connect(); }
export function disconnectSocket(): void { socket?.disconnect(); socket = null; }
```

**`apps/web/src/hooks/use-realtime.ts`**:
```typescript
// useRealtimeDeal(dealId) — subscribes to deal room, invalidates React Query cache on update
// useRealtimeNotifications() — listens for notification:new, increments unread count badge in Zustand
// useRealtimePipeline(pipelineId) — listens for deal:stage_changed in tenant room, invalidates pipeline query
```

**Update `apps/web/src/app/providers.tsx`**:
- Connect socket on mount (when user is authenticated)
- Disconnect on unmount / logout
- Add `io` from `socket.io-client` as import (install in apps/web/package.json)

**Update `apps/web/src/components/layout/topbar.tsx`**:
- Replace the static notification bell placeholder with a real unread count badge
- Use `useRealtimeNotifications()` hook + `useNotifications()` React Query hook
- Badge: red dot with count if unread > 0
- Click → dropdown showing last 5 notifications with "Mark all read" button

---

### FILE 10: `services/workflow-service/` (full scaffold)

The automation engine. Executes workflow templates (Section 42 of spec — 14 node handler types).

Structure:
```
services/workflow-service/
  src/
    index.ts                    — Fastify bootstrap on port 3007
    engine/
      executor.ts               — WorkflowExecutor class: run(workflowId, triggerPayload)
      nodes/
        trigger.node.ts         — entry point node (DEAL_WON, LEAD_CREATED, etc.)
        condition.node.ts       — if/else branching on field values
        wait.node.ts            — delay execution N hours/days (stores resume time in DB)
        action.node.ts          — perform HTTP call to another service
        email.node.ts           — send email via notification-service
        webhook.node.ts         — POST to external URL with payload
        set-field.node.ts       — update entity field via CRM/Finance service REST call
        create-activity.node.ts — POST /activities on crm-service
        create-task.node.ts     — create a follow-up task activity
        assign.node.ts          — reassign deal/lead owner
        notify.node.ts          — create in-app notification via notification-service
        fork.node.ts            — split execution into parallel branches
        join.node.ts            — wait for all parallel branches to complete
        end.node.ts             — terminal node, mark execution as COMPLETED
    consumers/
      trigger.consumer.ts       — Kafka consumer: listens to ALL topics, checks if any workflow
                                   should trigger based on event type + conditions
    services/
      workflows.service.ts      — CRUD for WorkflowTemplate (create, update, activate, deactivate, list)
      executions.service.ts     — list/get/cancel WorkflowExecution + resume paused executions
    routes/
      workflows.routes.ts       — full CRUD + activate/deactivate/test-run
      executions.routes.ts      — list/get/cancel executions, GET /executions/:id/log
    prisma/
      schema.prisma             — WorkflowTemplate, WorkflowExecution, WorkflowStep models
  package.json
  tsconfig.json
  Dockerfile
```

**`engine/executor.ts`** — the core class:
```typescript
export class WorkflowExecutor {
  constructor(private prisma: WorkflowPrisma, private producer: NexusProducer) {}

  async run(executionId: string): Promise<void>
  // Load execution + template
  // Walk nodes in order, calling the correct node handler
  // On WAIT node: save resumeAt, mark execution status=PAUSED, return
  // On CONDITION node: evaluate expression against payload, branch to trueNodeId or falseNodeId
  // On error: mark execution status=FAILED, store error in WorkflowStep.error
  // On completion: mark execution status=COMPLETED, completedAt=now()

  async resume(executionId: string): Promise<void>
  // Load PAUSED execution, check resumeAt <= now(), continue from paused node

  private async executeNode(node: WorkflowNode, context: ExecutionContext): Promise<NodeResult>
  // Dispatch to correct node handler class based on node.type
}
```

**`prisma/schema.prisma`**:
```prisma
model WorkflowTemplate {
  id          String   @id @default(cuid())
  tenantId    String
  name        String
  description String?
  trigger     String   // DEAL_WON | DEAL_LOST | DEAL_STAGE_CHANGED | LEAD_CREATED | etc.
  triggerConditions Json @default("{}")
  nodes       Json     // array of WorkflowNode objects
  edges       Json     // array of { from: string, to: string, condition?: string }
  isActive    Boolean  @default(false)
  version     Int      @default(1)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  executions  WorkflowExecution[]
  @@index([tenantId])
  @@index([tenantId, trigger, isActive])
}

model WorkflowExecution {
  id          String   @id @default(cuid())
  tenantId    String
  workflowId  String
  workflow    WorkflowTemplate @relation(fields: [workflowId], references: [id])
  triggerType String
  triggerPayload Json
  status      ExecutionStatus @default(RUNNING)
  currentNodeId String?
  resumeAt    DateTime?
  startedAt   DateTime @default(now())
  completedAt DateTime?
  error       String?
  steps       WorkflowStep[]
  @@index([tenantId])
  @@index([tenantId, status])
  @@index([status, resumeAt])   // for the resume scheduler
}

model WorkflowStep {
  id          String   @id @default(cuid())
  executionId String
  execution   WorkflowExecution @relation(fields: [executionId], references: [id])
  nodeId      String
  nodeType    String
  status      StepStatus @default(PENDING)
  input       Json     @default("{}")
  output      Json     @default("{}")
  error       String?
  startedAt   DateTime?
  completedAt DateTime?
}

enum ExecutionStatus { RUNNING PAUSED COMPLETED FAILED CANCELLED }
enum StepStatus      { PENDING RUNNING COMPLETED FAILED SKIPPED }
```

---

### FILE 11: `services/analytics-service/` (scaffold)

ClickHouse-backed analytics. Exposes aggregated metrics for dashboards.

Structure:
```
services/analytics-service/
  src/
    index.ts                    — Fastify bootstrap on port 3008
    clickhouse.ts               — ClickHouse client factory (CLICKHOUSE_URL, CLICKHOUSE_DB)
    ddl/
      init.sql                  — CREATE TABLE IF NOT EXISTS for all ClickHouse tables (from spec Section 44)
    consumers/
      events.consumer.ts        — Kafka → ClickHouse: inserts deal/activity/quote events into fact tables
    services/
      pipeline.analytics.ts     — deals by stage, velocity, conversion rates
      revenue.analytics.ts      — ARR, MRR, bookings, win rate, ASP by segment
      activity.analytics.ts     — activity volume, completion rate, overdue rate
      forecast.analytics.ts     — weighted pipeline, commit, best case by period
    routes/
      pipeline.routes.ts        — GET /analytics/pipeline/summary, /funnel, /velocity
      revenue.routes.ts         — GET /analytics/revenue/summary, /by-rep, /by-segment
      activity.routes.ts        — GET /analytics/activities/summary
      forecast.routes.ts        — GET /analytics/forecast/weighted-pipeline
  package.json
  tsconfig.json
  Dockerfile
```

**`clickhouse.ts`**:
```typescript
import { createClient } from '@clickhouse/client';

export function createClickHouseClient() {
  return createClient({
    url: process.env.CLICKHOUSE_URL ?? 'http://localhost:8123',
    database: process.env.CLICKHOUSE_DB ?? 'nexus_analytics',
    username: process.env.CLICKHOUSE_USER ?? 'default',
    password: process.env.CLICKHOUSE_PASSWORD ?? '',
  });
}
```

**`ddl/init.sql`** — create these ClickHouse tables:
```sql
CREATE TABLE IF NOT EXISTS deal_events (
  event_id     UUID DEFAULT generateUUIDv4(),
  tenant_id    String,
  deal_id      String,
  owner_id     String,
  account_id   String,
  pipeline_id  String,
  stage_id     String,
  event_type   String,    -- deal.created | deal.stage_changed | deal.won | deal.lost
  amount       Decimal64(2),
  currency     String,
  occurred_at  DateTime64(3)
) ENGINE = MergeTree()
ORDER BY (tenant_id, occurred_at)
PARTITION BY toYYYYMM(occurred_at);

CREATE TABLE IF NOT EXISTS activity_events (
  event_id     UUID DEFAULT generateUUIDv4(),
  tenant_id    String,
  activity_id  String,
  owner_id     String,
  deal_id      String,
  activity_type String,
  event_type   String,    -- activity.created | activity.completed
  occurred_at  DateTime64(3)
) ENGINE = MergeTree()
ORDER BY (tenant_id, occurred_at)
PARTITION BY toYYYYMM(occurred_at);

CREATE TABLE IF NOT EXISTS quote_events (
  event_id     UUID DEFAULT generateUUIDv4(),
  tenant_id    String,
  quote_id     String,
  deal_id      String,
  account_id   String,
  event_type   String,    -- quote.created | quote.sent | quote.accepted | quote.rejected
  total        Decimal64(2),
  currency     String,
  occurred_at  DateTime64(3)
) ENGINE = MergeTree()
ORDER BY (tenant_id, occurred_at)
PARTITION BY toYYYYMM(occurred_at);
```

**`services/pipeline.analytics.ts`** — implement these methods using ClickHouse queries:
```typescript
getPipelineSummary(tenantId: string, pipelineId?: string): Promise<{
  totalDeals: number; totalValue: number; avgDealSize: number; avgDaysInPipeline: number
}>

getFunnelConversion(tenantId: string, period: { from: string; to: string }): Promise<Array<{
  stageId: string; stageName: string; count: number; value: number; conversionRate: number
}>>

getDealVelocity(tenantId: string, period: { from: string; to: string }): Promise<{
  avgDaysToClose: number; avgDaysPerStage: Record<string, number>
}>
```

**`services/revenue.analytics.ts`**:
```typescript
getRevenueSummary(tenantId: string, period: { year: number; quarter?: number }): Promise<{
  totalRevenue: number; wonDeals: number; lostDeals: number; winRate: number; avgSalePrice: number
}>

getRevenueByRep(tenantId: string, period: { year: number; quarter?: number }): Promise<Array<{
  ownerId: string; totalRevenue: number; wonDeals: number; winRate: number
}>>
```

---

### FILE 12: Tests for new services

**`services/crm-service/src/services/__tests__/activities.service.test.ts`**:
```typescript
describe('createActivity', () => {
  it('validates dealId belongs to tenant — throws NotFoundError if not')
  it('publishes activity.created event with correct payload')
  it('stores dueDate as Date object')
})
describe('completeActivity', () => {
  it('throws BusinessRuleError when already DONE')
  it('throws BusinessRuleError when CANCELLED')
  it('sets completedAt to now and stores outcome')
  it('publishes activity.completed with dealId in payload')
})
describe('getUpcomingActivities', () => {
  it('returns only OPEN activities due within daysAhead window')
  it('orders by dueDate asc')
})
```

**`services/finance-service/src/services/__tests__/quotes.service.test.ts`**:
```typescript
describe('sendQuote', () => {
  it('throws BusinessRuleError when status is not DRAFT')
  it('sets sentAt to now, changes status to SENT')
  it('publishes quote.sent event')
})
describe('acceptQuote', () => {
  it('throws BusinessRuleError when status is not SENT')
  it('sets acceptedAt, changes status to ACCEPTED')
})
describe('duplicateQuote', () => {
  it('creates new DRAFT with status=DRAFT, version=1')
  it('appends " (Copy)" to the name')
  it('copies all line items')
})
describe('expireQuotes', () => {
  it('only expires SENT quotes past expiresAt')
  it('returns correct count of expired quotes')
})
```

**`services/workflow-service/src/engine/__tests__/executor.test.ts`**:
```typescript
describe('WorkflowExecutor', () => {
  it('executes linear workflow from trigger to end node')
  it('branches correctly on CONDITION node true/false')
  it('pauses on WAIT node and stores resumeAt')
  it('marks execution FAILED and stores error on node exception')
  it('resumes PAUSED execution after resumeAt has passed')
  it('marks execution CANCELLED when cancel() is called on RUNNING execution')
})
```

---

### FILE 13: `apps/web/src/app/(dashboard)/analytics/page.tsx`

Revenue analytics dashboard page:

```
Date range picker (preset: This Month, Last Quarter, This Year, Custom)
  
Row 1 — KPI cards (6):
  Total Revenue (won deals), Win Rate %, Avg Deal Size, Avg Days to Close,
  Open Pipeline Value, Deals Created

Row 2 — Charts (2 columns):
  Left: Revenue over time — recharts LineChart with won revenue by week/month
  Right: Win/Loss breakdown — recharts PieChart (WON vs LOST vs DORMANT)

Row 3 — Charts (2 columns):
  Left: Pipeline funnel — recharts FunnelChart or horizontal BarChart by stage
  Right: Revenue by rep — recharts BarChart sorted by revenue desc

Row 4 — Table:
  Rep performance table: Rep name, Revenue, Won deals, Lost deals, Win rate, Avg deal size, Quota attainment %

All data from: GET /analytics/pipeline/summary, /funnel, GET /analytics/revenue/summary, /by-rep
Loading state: skeleton placeholders for each chart
Write useAnalytics() hooks alongside this file
```

---

### FILE 14: `apps/web/src/app/(dashboard)/settings/workflows/page.tsx`

Workflow builder UI (visual representation — simplified):

```
List view: workflow cards showing name, trigger type badge, status (active/inactive), last execution count, last run time
"+ New Workflow" → wizard:
  Step 1: Name + Trigger (select from: Deal Won, Deal Lost, Stage Changed, Lead Created, Lead Qualified, Activity Overdue)
  Step 2: Conditions (optional) — simple filter: field select, operator select, value input
  Step 3: Actions — add action nodes from dropdown: Send Email, Create Activity, Create Task, Send Notification, Set Field, Webhook
           Each action has a config form (e.g., Send Email: to, subject, body template with {{dealName}} variables)
  Step 4: Review + Activate

Active/Pause toggle on each workflow card
"Test Run" button → POST /workflows/:id/test-run with dummy payload → show execution result modal
Execution history modal: table of last 20 runs with status, duration, triggered at
```

---

## ANTI-STUB CHECKLIST

Before finishing each file, verify:
- [ ] Zero `TODO` / `FIXME` / `// implement later`
- [ ] Every service method has real implementation logic
- [ ] Every Kafka publish has typed payload
- [ ] Every DB query has `tenantId` in where
- [ ] Every new route registered in the service's `routes/index.ts`
- [ ] New services added to `docker-compose.yml`

---

## NEW SERVICES — ADD TO DOCKER-COMPOSE

After writing the new services, update `docker-compose.yml` to add:

```yaml
  realtime-service:
    build: ./services/realtime-service
    ports:
      - "3005:3005"
    env_file: ./services/realtime-service/.env.example
    depends_on: [kafka, redis]

  search-service:
    build: ./services/search-service
    ports:
      - "3006:3006"
    env_file: ./services/search-service/.env.example
    depends_on: [kafka, meilisearch]

  workflow-service:
    build: ./services/workflow-service
    ports:
      - "3007:3007"
      env_file: ./services/workflow-service/.env.example
    depends_on: [postgres, kafka]

  analytics-service:
    build: ./services/analytics-service
    ports:
      - "3008:3008"
    env_file: ./services/analytics-service/.env.example
    depends_on: [kafka, clickhouse]

  clickhouse:
    image: clickhouse/clickhouse-server:24.3
    ports:
      - "8123:8123"
      - "9000:9000"
    volumes:
      - clickhouse_data:/var/lib/clickhouse
      - ./services/analytics-service/src/ddl/init.sql:/docker-entrypoint-initdb.d/init.sql
```

Add `clickhouse_data` to the volumes section.

---

## SESSION CONTINUITY

If Cursor cuts off mid-file:
```
Continue exactly where you left off in [filename]. Write the remaining code from the last line. Do not summarize — just continue.
```

Do not move to the next file until the current one is complete and passes the anti-stub checklist.

---

*Phase 3 target: ~8 new services/service scaffolds, 14 files, ~15,000–22,000 new LOC*
*Running total after Phase 3: ~40,000–45,000 LOC*
