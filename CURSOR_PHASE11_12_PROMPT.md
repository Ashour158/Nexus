# NEXUS CRM — Phase 11 + Phase 12 Cursor Prompt
## Planning / Reporting + Customer Portal / Knowledge Base / Incentives

**Estimated LOC:** ~9,500  
**Services added:** planning-service (3020), reporting-service (3021), portal-service (3022), knowledge-service (3023), incentive-service (3024)  
**Services extended:** analytics-service (forecast rebuild), crm-service, frontend

---

## RULES — READ FIRST

- Never truncate. Every function must be fully implemented with real logic.
- Use `decimal.js` for all monetary values.
- All new Prisma schemas: `generator client { output = "../../../node_modules/.prisma/<name>-client" }`.
- Run `pnpm tsc --noEmit` after each section.
- After adding models to existing schemas, run `npx prisma generate && npx prisma migrate dev --name <description>`.

---

## SECTION 1 — Phase 11: Planning, Forecasting & Reporting

### 1A: Rebuild `analytics-service` forecast module

In `services/analytics-service/src/services/analytics.service.ts`, replace the stub `getForecast` implementation with a real stage-weighted pipeline calculation:

```typescript
async getForecast(tenantId: string): Promise<ForecastData> {
  // 1. Get all OPEN deals with their stage win probability
  const result = await clickhouse.query({
    query: `
      SELECT
        deal_id,
        amount,
        stage_probability,
        owner_id,
        forecast_category,
        toStartOfMonth(expected_close_date) AS close_month
      FROM deals
      WHERE tenant_id = {tenantId:String}
        AND status = 'OPEN'
        AND expected_close_date IS NOT NULL
    `,
    query_params: { tenantId },
    format: 'JSONEachRow',
  });
  const deals = await result.json<DealRow[]>();

  // 2. Calculate weighted pipeline: sum(amount × stage_probability / 100)
  let weightedPipeline = new Decimal(0);
  let totalPipeline = new Decimal(0);
  const byMonth: Record<string, { weighted: Decimal; total: Decimal }> = {};

  for (const deal of deals) {
    const amt = new Decimal(deal.amount ?? 0);
    const prob = new Decimal(deal.stage_probability ?? 0).div(100);
    const weighted = amt.mul(prob);
    weightedPipeline = weightedPipeline.plus(weighted);
    totalPipeline = totalPipeline.plus(amt);
    const month = deal.close_month ?? 'unknown';
    byMonth[month] = byMonth[month] ?? { weighted: new Decimal(0), total: new Decimal(0) };
    byMonth[month].weighted = byMonth[month].weighted.plus(weighted);
    byMonth[month].total = byMonth[month].total.plus(amt);
  }

  // 3. Historical win rate (last 12 months)
  const winRateResult = await clickhouse.query({
    query: `
      SELECT
        countIf(status = 'WON') AS won,
        countIf(status IN ('WON', 'LOST')) AS total
      FROM deals
      WHERE tenant_id = {tenantId:String}
        AND actual_close_date >= now() - INTERVAL 12 MONTH
    `,
    query_params: { tenantId },
    format: 'JSONEachRow',
  });
  const [winRow] = await winRateResult.json<{ won: number; total: number }[]>();
  const winRate = winRow && winRow.total > 0
    ? new Decimal(winRow.won).div(winRow.total)
    : new Decimal(0.25);

  return {
    weightedPipeline: weightedPipeline.toFixed(2),
    totalPipeline: totalPipeline.toFixed(2),
    winRate: winRate.toFixed(4),
    forecastByMonth: Object.entries(byMonth).map(([month, v]) => ({
      month,
      weighted: v.weighted.toFixed(2),
      total: v.total.toFixed(2),
    })).sort((a, b) => a.month.localeCompare(b.month)),
  };
}
```

Also update the analytics page in the frontend to show the `forecastByMonth` chart as a grouped bar (weighted vs total pipeline per month).

### 1B: New service — `services/planning-service/` (port 3020)

```
services/planning-service/
├── package.json
├── tsconfig.json
├── prisma/
│   └── schema.prisma
└── src/
    ├── index.ts
    ├── prisma.ts
    ├── routes/
    │   ├── quotas.routes.ts
    │   └── forecasts.routes.ts
    └── services/
        ├── quotas.service.ts
        └── forecasts.service.ts
```

#### `services/planning-service/package.json`
```json
{
  "name": "@nexus/planning-service",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate deploy"
  },
  "dependencies": {
    "@fastify/jwt": "^8.0.0",
    "@nexus/kafka": "workspace:*",
    "@nexus/service-utils": "workspace:*",
    "@nexus/shared-types": "workspace:*",
    "@nexus/validation": "workspace:*",
    "@prisma/client": "^5.22.0",
    "decimal.js": "^10.4.3",
    "fastify": "^4.28.1",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "prisma": "^5.22.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.3"
  }
}
```

#### `services/planning-service/prisma/schema.prisma`
```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../../../node_modules/.prisma/planning-client"
}

datasource db {
  provider = "postgresql"
  url      = env("PLANNING_DATABASE_URL")
}

model QuotaPlan {
  id        String        @id @default(cuid())
  tenantId  String
  name      String
  year      Int
  quarter   Int?          // null = annual plan
  type      QuotaType     @default(REVENUE)
  currency  String        @default("USD")
  isActive  Boolean       @default(true)
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt
  targets   QuotaTarget[]

  @@index([tenantId, year])
}

model QuotaTarget {
  id          String    @id @default(cuid())
  planId      String
  plan        QuotaPlan @relation(fields: [planId], references: [id], onDelete: Cascade)
  tenantId    String
  ownerId     String
  targetValue Decimal   @db.Decimal(18, 2)
  currency    String    @default("USD")
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@unique([planId, ownerId])
  @@index([tenantId, ownerId])
}

model ForecastSubmission {
  id              String           @id @default(cuid())
  tenantId        String
  ownerId         String
  period          String           // e.g. "2026-Q1" or "2026-04"
  commitAmount    Decimal          @db.Decimal(18, 2)
  bestCaseAmount  Decimal          @db.Decimal(18, 2)
  pipelineAmount  Decimal          @db.Decimal(18, 2)
  commentary      String?
  submittedAt     DateTime         @default(now())
  reviews         ForecastReview[]

  @@index([tenantId, ownerId, period])
}

model ForecastReview {
  id              String             @id @default(cuid())
  submissionId    String
  submission      ForecastSubmission @relation(fields: [submissionId], references: [id])
  reviewerId      String
  adjustedCommit  Decimal?           @db.Decimal(18, 2)
  adjustedBest    Decimal?           @db.Decimal(18, 2)
  note            String?
  reviewedAt      DateTime           @default(now())
}

enum QuotaType {
  REVENUE
  DEAL_COUNT
  ACTIVITY_COUNT
  NEW_LOGOS
}
```

#### `services/planning-service/src/services/quotas.service.ts`

Implement `createQuotasService(prisma)` returning:
- `listPlans(tenantId, year?)` — list quota plans, optionally filtered by year
- `createPlan(tenantId, input)` — create plan with targets in a transaction
- `updatePlan(tenantId, id, input)` — update plan metadata + upsert targets
- `getPlanAttainment(tenantId, planId)` — for each target:
  - Fetch actual revenue won in the plan's period from `ANALYTICS_SERVICE_URL/api/v1/analytics/pipeline`
  - Return `{ ownerId, target, actual, attainmentPct }`
- `whatIfClose(tenantId, ownerId, dealAmounts)` — sum deal amounts + current won revenue → projected attainment vs quota

#### `services/planning-service/src/services/forecasts.service.ts`

Implement `createForecastsService(prisma, producer)` returning:
- `submitForecast(tenantId, ownerId, period, input)` — upsert ForecastSubmission, publish `forecast.submitted` event
- `listSubmissions(tenantId, period?, ownerId?)` — list submissions
- `reviewForecast(tenantId, submissionId, reviewerId, input)` — create ForecastReview, publish `forecast.reviewed`
- `getRollup(tenantId, period)` — aggregate all submissions for a period: sum commit, bestCase, pipeline grouped by ownerId; also compute team total

#### Routes:

**`src/routes/quotas.routes.ts`**
```
GET    /api/v1/quotas/plans?year=
POST   /api/v1/quotas/plans
PATCH  /api/v1/quotas/plans/:id
GET    /api/v1/quotas/plans/:id/attainment
POST   /api/v1/quotas/what-if    — body: { ownerId, dealAmounts[] }
```

**`src/routes/forecasts.routes.ts`**
```
GET    /api/v1/forecasts?period=&ownerId=
POST   /api/v1/forecasts
GET    /api/v1/forecasts/rollup?period=
POST   /api/v1/forecasts/:id/review
```

---

### 1C: New service — `services/reporting-service/` (port 3021)

```
services/reporting-service/
├── package.json
├── tsconfig.json
├── prisma/
│   └── schema.prisma
└── src/
    ├── index.ts
    ├── prisma.ts
    ├── routes/
    │   └── reports.routes.ts
    ├── services/
    │   ├── reports.service.ts
    │   └── executor.service.ts
    └── templates/
        └── index.ts    ← 30 pre-built report definitions
```

#### `services/reporting-service/package.json`
```json
{
  "name": "@nexus/reporting-service",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate deploy"
  },
  "dependencies": {
    "@fastify/jwt": "^8.0.0",
    "@nexus/kafka": "workspace:*",
    "@nexus/service-utils": "workspace:*",
    "@nexus/shared-types": "workspace:*",
    "@nexus/validation": "workspace:*",
    "@prisma/client": "^5.22.0",
    "decimal.js": "^10.4.3",
    "fastify": "^4.28.1",
    "xlsx": "^0.18.5",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "prisma": "^5.22.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.3"
  }
}
```

#### `services/reporting-service/prisma/schema.prisma`
```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../../../node_modules/.prisma/reporting-client"
}

datasource db {
  provider = "postgresql"
  url      = env("REPORTING_DATABASE_URL")
}

model ReportDefinition {
  id          String   @id @default(cuid())
  tenantId    String?  // null = system template
  name        String
  description String?
  category    String
  isTemplate  Boolean  @default(false)
  datasource  String   // 'crm' | 'analytics' | 'finance'
  querySpec   Json     // { entity, columns[], filters[], groupBy?, sortBy?, sortDir?, limit? }
  ownerId     String?
  isShared    Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  schedules   ReportSchedule[]

  @@index([tenantId, category])
}

model ReportSchedule {
  id           String           @id @default(cuid())
  reportId     String
  report       ReportDefinition @relation(fields: [reportId], references: [id], onDelete: Cascade)
  tenantId     String
  cron         String           // e.g. "0 8 * * 1" (every Monday 8am)
  format       String           @default("xlsx")  // 'xlsx' | 'csv'
  recipients   String[]
  lastRunAt    DateTime?
  nextRunAt    DateTime?
  isActive     Boolean          @default(true)
  createdAt    DateTime         @default(now())

  @@index([tenantId])
  @@index([nextRunAt, isActive])
}
```

#### `services/reporting-service/src/templates/index.ts`

Export an array of 12 pre-built `ReportDefinition` objects (as seed data — inserted when tenant is created or on first access):

```typescript
export const SYSTEM_TEMPLATES = [
  {
    id: 'tpl-pipeline-by-stage',
    name: 'Pipeline by Stage',
    description: 'Open deals grouped by pipeline stage with totals',
    category: 'Pipeline',
    isTemplate: true,
    datasource: 'crm',
    querySpec: {
      entity: 'deal',
      columns: ['stage.name', 'count', 'sum(amount)', 'avg(amount)'],
      filters: [{ field: 'status', operator: 'eq', value: 'OPEN' }],
      groupBy: 'stageId',
      sortBy: 'stage.order',
      sortDir: 'asc',
    },
  },
  {
    id: 'tpl-pipeline-by-rep',
    name: 'Pipeline by Rep',
    description: 'Open deals grouped by owner with totals',
    category: 'Pipeline',
    isTemplate: true,
    datasource: 'crm',
    querySpec: {
      entity: 'deal',
      columns: ['owner.name', 'count', 'sum(amount)', 'avg(probability)'],
      filters: [{ field: 'status', operator: 'eq', value: 'OPEN' }],
      groupBy: 'ownerId',
      sortBy: 'sum(amount)',
      sortDir: 'desc',
    },
  },
  {
    id: 'tpl-won-lost-analysis',
    name: 'Won / Lost Analysis',
    description: 'Win rate and lost reasons breakdown',
    category: 'Revenue',
    isTemplate: true,
    datasource: 'crm',
    querySpec: {
      entity: 'deal',
      columns: ['status', 'count', 'sum(amount)', 'lostReason'],
      filters: [{ field: 'status', operator: 'in', value: 'WON,LOST' }],
      groupBy: 'status,lostReason',
      sortBy: 'count',
      sortDir: 'desc',
    },
  },
  {
    id: 'tpl-activities-by-rep',
    name: 'Activities by Rep',
    description: 'Activity counts per rep by type',
    category: 'Activities',
    isTemplate: true,
    datasource: 'crm',
    querySpec: {
      entity: 'activity',
      columns: ['owner.name', 'type', 'count'],
      groupBy: 'ownerId,type',
      sortBy: 'count',
      sortDir: 'desc',
    },
  },
  {
    id: 'tpl-lead-source-roi',
    name: 'Lead Source ROI',
    description: 'Leads and conversion by source',
    category: 'Leads',
    isTemplate: true,
    datasource: 'crm',
    querySpec: {
      entity: 'lead',
      columns: ['source', 'count', 'countIf(status=CONVERTED)', 'conversionRate'],
      groupBy: 'source',
      sortBy: 'count',
      sortDir: 'desc',
    },
  },
  // ... (add 7 more templates for: Revenue by Quarter, Revenue by Product, Overdue Activities,
  //      Lead Conversion Funnel, Forecast vs Quota, Commission by Rep, Customer Health Distribution)
];
```

#### `services/reporting-service/src/services/executor.service.ts`

Implement `executeReport(tenantId, querySpec, params)`:
- Routes to the appropriate upstream service based on `datasource`
- For `datasource: 'crm'` — calls `CRM_SERVICE_URL/api/v1/reports/query` (add this generic query endpoint to crm-service)
- For `datasource: 'analytics'` — calls analytics-service
- Applies `columns`, `filters`, `groupBy`, `sortBy`, `limit` from querySpec
- Returns `{ columns: string[], rows: Record<string, unknown>[] }`

#### `services/reporting-service/src/services/reports.service.ts`

Implement `createReportsService(prisma)` returning:
- `listTemplates(category?)` — returns SYSTEM_TEMPLATES filtered by category
- `listCustomReports(tenantId)` — custom saved reports
- `saveReport(tenantId, ownerId, input)` — save a custom report definition
- `runReport(tenantId, reportId, params)` — load definition, call executor, return results
- `exportXlsx(tenantId, reportId, params)` — run report, convert to XLSX buffer using `xlsx` package
- `createSchedule(tenantId, reportId, input)` — create ReportSchedule, compute nextRunAt from cron
- `processSchedules()` — background job (every hour): find schedules where nextRunAt <= now(), run report, email XLSX to recipients via comm-service, update nextRunAt

#### Routes:

```
GET    /api/v1/reports/templates?category=
GET    /api/v1/reports?category=
POST   /api/v1/reports
GET    /api/v1/reports/:id
DELETE /api/v1/reports/:id
POST   /api/v1/reports/:id/run           — returns results JSON
POST   /api/v1/reports/:id/export        — returns XLSX file
GET    /api/v1/reports/:id/schedules
POST   /api/v1/reports/:id/schedules
DELETE /api/v1/reports/schedules/:scheduleId
```

---

### 1D: Planning & Reporting Frontend

Create `apps/web/src/app/(dashboard)/planning/page.tsx`:

**Three tabs:**

1. **Quota Attainment** — table per rep:
   - Columns: Rep Name, Quota, Actual Won, Attainment %, progress bar (green/amber/red based on %)
   - Period picker (year + quarter)
   - "Set Quotas" button → opens bulk quota input modal

2. **Forecast** — submit + review workflow:
   - Your forecast card: Commit / Best Case / Pipeline inputs with decimal number inputs, Commentary textarea, Submit button
   - Team rollup table: each rep's submitted commit vs their quota, variance
   - Manager review panel: adjust commit/best-case per rep, add note

3. **What-If** — deal selector:
   - List of open deals with checkboxes
   - As user checks deals, live-updating "Projected Attainment" card appears showing current + checked deals

Create `apps/web/src/app/(dashboard)/reports/page.tsx`:

**Two tabs:**

1. **Report Library** — grid of cards:
   - System templates (shown with a "⭐ Template" badge)
   - Custom saved reports
   - Each card: name, category, description, "Run" and "Export" buttons
   - Category filter tabs: All | Pipeline | Revenue | Activities | Leads | Forecast

2. **Report Viewer** — when "Run" is clicked:
   - Renders results in a sortable data table
   - "Export XLSX" button
   - "Schedule" button → opens cron scheduler modal (frequency: Daily/Weekly/Monthly, time, recipients email list)

Add "Planning" and "Reports" nav items to the sidebar.

---

## SECTION 2 — Phase 12: Customer Portal + Knowledge Base + Incentives

### 2A: New service — `services/portal-service/` (port 3022)

```
services/portal-service/
├── package.json
├── tsconfig.json
├── prisma/
│   └── schema.prisma
└── src/
    ├── index.ts
    ├── prisma.ts
    ├── routes/
    │   └── portal.routes.ts
    └── services/
        └── portal.service.ts
```

#### `services/portal-service/package.json`
```json
{
  "name": "@nexus/portal-service",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate deploy"
  },
  "dependencies": {
    "@fastify/jwt": "^8.0.0",
    "@nexus/service-utils": "workspace:*",
    "@nexus/shared-types": "workspace:*",
    "@prisma/client": "^5.22.0",
    "fastify": "^4.28.1",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "prisma": "^5.22.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.3"
  }
}
```

#### `services/portal-service/prisma/schema.prisma`
```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../../../node_modules/.prisma/portal-client"
}

datasource db {
  provider = "postgresql"
  url      = env("PORTAL_DATABASE_URL")
}

model PortalToken {
  id         String     @id @default(cuid())
  tenantId   String
  token      String     @unique @default(cuid())
  entityType EntityType
  entityId   String
  expiresAt  DateTime
  viewCount  Int        @default(0)
  createdBy  String
  createdAt  DateTime   @default(now())

  @@index([token])
  @@index([tenantId, entityId])
}

model PortalBranding {
  id           String   @id @default(cuid())
  tenantId     String   @unique
  logoUrl      String?
  primaryColor String   @default("#3B82F6")
  companyName  String?
  updatedAt    DateTime @updatedAt
}

enum EntityType {
  QUOTE
  CONTRACT
  INVOICE
  ACCOUNT
}
```

#### `services/portal-service/src/services/portal.service.ts`

Implement `createPortalService(prisma)` returning:
- `createToken(tenantId, entityType, entityId, createdBy, expiresInDays)` — generates token, stores with expiresAt
- `getPortalContext(token)` — validates token (not expired), increments viewCount, fetches entity data from finance-service/crm-service, returns `{ entityType, entityData, branding }`
- `recordAction(token, action)` — e.g., 'viewed', 'accepted', 'rejected', 'downloaded'
- `getBranding(tenantId)` — fetch PortalBranding
- `updateBranding(tenantId, input)` — upsert

#### Routes (NO JWT auth required on public portal routes):

```
GET  /portal/:token              → returns full portal context (entity data + branding)
POST /portal/:token/accept       → calls finance-service to accept quote
POST /portal/:token/reject       → body: { reason? } → calls finance-service to reject
GET  /portal/:token/download     → proxies PDF download from document-service

// Auth-required management routes:
POST   /api/v1/portal/tokens              — body: { entityType, entityId, expiresInDays }
GET    /api/v1/portal/tokens?entityId=
DELETE /api/v1/portal/tokens/:id
GET    /api/v1/portal/branding
PATCH  /api/v1/portal/branding
```

#### Frontend — Customer Portal Page

Create `apps/web/src/app/portal/[token]/page.tsx` (public, no auth):

This is the customer-facing portal. It fetches `GET /portal/:token` and renders:

**If entityType = QUOTE:**
- Company header with logo + primary colour from branding
- Quote header: Quote #, Date, Valid Until, Status badge
- Line items table (read-only): Product, Qty, Unit Price, Total
- Totals: Subtotal, Discount, Tax, **Grand Total**
- "Accept Quote" button (green) → calls `/portal/:token/accept` → shows "Quote Accepted ✓" confirmation
- "Reject Quote" button (outlined) → asks for optional reason → calls `/portal/:token/reject`
- "Download PDF" button → calls `/portal/:token/download`
- Terms & conditions section

The page uses no Next.js auth; just a simple server component with `fetch`.

#### Frontend — Portal Share Button

In `apps/web/src/app/(dashboard)/quotes/[id]/page.tsx`, add a "Share Portal Link" button:
- Calls `POST /api/v1/portal/tokens` with `{ entityType: 'QUOTE', entityId: quote.id, expiresInDays: 30 }`
- Shows a "Copy Link" dialog with the portal URL: `https://<APP_URL>/portal/<token>`

---

### 2B: New service — `services/knowledge-service/` (port 3023)

```
services/knowledge-service/
├── package.json
├── tsconfig.json
├── prisma/
│   └── schema.prisma
└── src/
    ├── index.ts
    ├── prisma.ts
    ├── routes/
    │   └── knowledge.routes.ts
    └── services/
        └── knowledge.service.ts
```

#### `services/knowledge-service/package.json`
```json
{
  "name": "@nexus/knowledge-service",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate deploy"
  },
  "dependencies": {
    "@fastify/jwt": "^8.0.0",
    "@nexus/kafka": "workspace:*",
    "@nexus/service-utils": "workspace:*",
    "@nexus/shared-types": "workspace:*",
    "@nexus/validation": "workspace:*",
    "@prisma/client": "^5.22.0",
    "fastify": "^4.28.1",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "prisma": "^5.22.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.3"
  }
}
```

#### `services/knowledge-service/prisma/schema.prisma`
```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../../../node_modules/.prisma/knowledge-client"
}

datasource db {
  provider = "postgresql"
  url      = env("KNOWLEDGE_DATABASE_URL")
}

model KbCategory {
  id               String       @id @default(cuid())
  tenantId         String
  name             String
  icon             String?
  position         Int          @default(0)
  parentCategoryId String?
  parent           KbCategory?  @relation("CategoryTree", fields: [parentCategoryId], references: [id])
  children         KbCategory[] @relation("CategoryTree")
  articles         KbArticle[]

  @@index([tenantId])
}

model KbArticle {
  id         String        @id @default(cuid())
  tenantId   String
  categoryId String?
  category   KbCategory?   @relation(fields: [categoryId], references: [id])
  title      String
  slug       String
  body       String        // Markdown
  tags       String[]
  status     ArticleStatus @default(DRAFT)
  authorId   String
  version    Int           @default(1)
  viewCount  Int           @default(0)
  dealStages String[]      // Stage IDs this article is recommended for
  createdAt  DateTime      @default(now())
  updatedAt  DateTime      @updatedAt
  views      KbView[]

  @@unique([tenantId, slug])
  @@index([tenantId, status])
}

model KbView {
  id        String    @id @default(cuid())
  articleId String
  article   KbArticle @relation(fields: [articleId], references: [id], onDelete: Cascade)
  viewedBy  String
  dealStage String?
  viewedAt  DateTime  @default(now())

  @@index([articleId])
}

enum ArticleStatus {
  DRAFT
  PUBLISHED
  ARCHIVED
}
```

#### `services/knowledge-service/src/services/knowledge.service.ts`

Implement `createKnowledgeService(prisma)` returning:
- `listCategories(tenantId)` — tree structure
- `listArticles(tenantId, categoryId?, status?, tags?, search?)` — PUBLISHED articles, full-text search via `ILIKE`
- `getArticle(tenantId, id)` — fetch by id
- `createArticle(tenantId, authorId, input)` — create; if slug not provided, slugify title
- `updateArticle(tenantId, id, input)` — update; increment version
- `publishArticle(tenantId, id)` — set status=PUBLISHED
- `archiveArticle(tenantId, id)` — set status=ARCHIVED
- `recordView(articleId, viewedBy, dealStage?)` — create KbView
- `getArticlesForStage(tenantId, stageId)` — return articles where `dealStages @> [stageId]` (PostgreSQL array contains)
- `getTopArticles(tenantId, limit)` — order by viewCount desc

#### Routes:

```
GET    /api/v1/knowledge/categories
POST   /api/v1/knowledge/categories
GET    /api/v1/knowledge/articles?categoryId=&status=&search=
POST   /api/v1/knowledge/articles
GET    /api/v1/knowledge/articles/:id
PATCH  /api/v1/knowledge/articles/:id
POST   /api/v1/knowledge/articles/:id/publish
POST   /api/v1/knowledge/articles/:id/archive
POST   /api/v1/knowledge/articles/:id/view     — body: { dealStage? }
GET    /api/v1/knowledge/articles/for-stage/:stageId
GET    /api/v1/knowledge/articles/top?limit=10
```

#### Frontend — Knowledge Base

Create `apps/web/src/app/(dashboard)/knowledge/page.tsx`:

**Two views:**

1. **Article Browser** (for sales reps):
   - Left sidebar: category tree
   - Main area: article list with search bar
   - Article view: Markdown rendered with `react-markdown`
   - Category filter + tag filter chips

2. **Editor** (for admins/managers — shown if user has `KNOWLEDGE.WRITE` permission):
   - "New Article" button
   - Article editor: Title input, Category picker, Tags input, Status toggle (Draft/Published), Markdown textarea with preview toggle
   - "Save" and "Publish" buttons

**Recommended articles widget** — add to `apps/web/src/app/(dashboard)/deals/[id]/page.tsx`:
- Fetches `GET /api/v1/knowledge/articles/for-stage/:stageId`
- Shows compact list of 3 recommended articles at bottom of Overview tab
- "Read" opens article in a drawer

Add "Knowledge Base" nav item to the sidebar.

---

### 2C: New service — `services/incentive-service/` (port 3024)

```
services/incentive-service/
├── package.json
├── tsconfig.json
├── prisma/
│   └── schema.prisma
└── src/
    ├── index.ts
    ├── prisma.ts
    ├── routes/
    │   ├── contests.routes.ts
    │   └── badges.routes.ts
    └── services/
        ├── contests.service.ts
        └── badges.service.ts
```

#### `services/incentive-service/prisma/schema.prisma`
```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../../../node_modules/.prisma/incentive-client"
}

datasource db {
  provider = "postgresql"
  url      = env("INCENTIVE_DATABASE_URL")
}

model Contest {
  id               String          @id @default(cuid())
  tenantId         String
  name             String
  description      String?
  metric           ContestMetric
  targetValue      Decimal?        @db.Decimal(18, 2)
  startDate        DateTime
  endDate          DateTime
  prizeDescription String?
  isActive         Boolean         @default(true)
  createdAt        DateTime        @default(now())
  entries          ContestEntry[]

  @@index([tenantId])
}

model ContestEntry {
  id           String   @id @default(cuid())
  contestId    String
  contest      Contest  @relation(fields: [contestId], references: [id], onDelete: Cascade)
  tenantId     String
  ownerId      String
  currentValue Decimal  @default(0) @db.Decimal(18, 2)
  rank         Int?
  updatedAt    DateTime @updatedAt

  @@unique([contestId, ownerId])
  @@index([contestId, currentValue])
}

model Badge {
  id          String      @id @default(cuid())
  tenantId    String?     // null = system badge
  key         String      @unique
  name        String
  description String
  icon        String      // emoji or icon name
  condition   Json        // { metric, operator, value, period? }
  awardedTo   BadgeAward[]

  @@index([tenantId])
}

model BadgeAward {
  id        String   @id @default(cuid())
  badgeId   String
  badge     Badge    @relation(fields: [badgeId], references: [id])
  tenantId  String
  ownerId   String
  awardedAt DateTime @default(now())

  @@unique([badgeId, tenantId, ownerId])
  @@index([tenantId, ownerId])
}

enum ContestMetric {
  DEALS_WON_COUNT
  DEALS_WON_REVENUE
  ACTIVITIES_COMPLETED
  LEADS_CONVERTED
  NEW_LOGOS
}
```

#### `services/incentive-service/src/services/contests.service.ts`

Implement `createContestsService(prisma)` returning:
- `listContests(tenantId)` — list with entry counts
- `createContest(tenantId, input)` — create
- `getLeaderboard(tenantId, contestId)` — return entries sorted by currentValue desc with rank
- `updateLeaderboard(tenantId, contestId)` — fetches current metric values from analytics-service and updates all ContestEntry.currentValue + rank
- `startContestWorker()` — updates all active contest leaderboards every 30 minutes

#### `services/incentive-service/src/services/badges.service.ts`

Implement `createBadgesService(prisma)` returning:
- `listBadges(tenantId)` — system badges + tenant-specific badges
- `getMyBadges(tenantId, ownerId)` — earned badges
- `checkAndAward(tenantId, ownerId, metric, value)` — check all badges where condition matches metric, award if threshold met and not already awarded
- `seedSystemBadges()` — insert 8 system badges if not exists:
  - `first_deal` — Won first deal | 🏆
  - `deal_10` — Won 10 deals total | ⭐
  - `big_deal` — Won a deal over $100k | 💰
  - `speed_demon` — Closed a deal in < 7 days | ⚡
  - `activity_streak` — Logged activities 5 days in a row | 🔥
  - `top_prospector` — Created 20 leads in a month | 🎯
  - `converter` — Converted 10 leads to contacts | 🔄
  - `quota_crusher` — Reached 150% of quota | 🚀

#### Routes:

```
GET    /api/v1/contests
POST   /api/v1/contests
GET    /api/v1/contests/:id/leaderboard
GET    /api/v1/badges
GET    /api/v1/badges/mine
```

Kafka consumer: listen for `deal.won` events → call `updateLeaderboard` for relevant contests + call `checkAndAward` for deal-based badges.

#### Frontend — Incentives

Create `apps/web/src/app/(dashboard)/incentives/page.tsx`:

**Two tabs:**

1. **Contests** — list of active contests:
   - Each contest shows: Name, Metric, Prize, End Date countdown, "View Leaderboard" button
   - Leaderboard modal: ranked table of reps with current value and rank badge (🥇🥈🥉 for top 3)

2. **My Badges** — grid of earned badges (full colour) and locked badges (greyed out)
   - Each badge shows: icon, name, description, earned date (or "Not yet earned")

**Dashboard widget:** Add a `<LeaderboardWidget />` to the main dashboard home page showing top 3 reps in the most active contest.

Add "Incentives" nav item to the sidebar.

---

## SECTION 3 — Environment Variables

Add to `.env.example`:

```env
# planning-service
PLANNING_DATABASE_URL=postgresql://nexus:nexus@localhost:5432/nexus_planning
ANALYTICS_SERVICE_URL=http://localhost:3008
PORT=3020

# reporting-service
REPORTING_DATABASE_URL=postgresql://nexus:nexus@localhost:5432/nexus_reporting
PORT=3021

# portal-service
PORTAL_DATABASE_URL=postgresql://nexus:nexus@localhost:5432/nexus_portal
FINANCE_SERVICE_URL=http://localhost:3003
APP_URL=http://localhost:3000
PORT=3022

# knowledge-service
KNOWLEDGE_DATABASE_URL=postgresql://nexus:nexus@localhost:5432/nexus_knowledge
PORT=3023

# incentive-service
INCENTIVE_DATABASE_URL=postgresql://nexus:nexus@localhost:5432/nexus_incentive
PORT=3024
```

---

## SECTION 4 — Final Verification

```bash
# Type check
pnpm tsc --noEmit

# Generate all new Prisma clients
cd services/planning-service && npx prisma generate
cd services/reporting-service && npx prisma generate
cd services/portal-service && npx prisma generate
cd services/knowledge-service && npx prisma generate
cd services/incentive-service && npx prisma generate

# Verify new pages exist
ls apps/web/src/app/\(dashboard\)/planning/
ls apps/web/src/app/\(dashboard\)/reports/
ls apps/web/src/app/\(dashboard\)/knowledge/
ls apps/web/src/app/\(dashboard\)/incentives/
ls apps/web/src/app/portal/

# Verify service count
ls services/ | wc -l
# Should be 23
```

**Services count after this phase: 23 microservices** (+ Phase 13 mobile app)
