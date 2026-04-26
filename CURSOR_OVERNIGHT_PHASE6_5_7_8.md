# NEXUS CRM — Overnight Build Prompt: Phase 6.5 + Phase 7 + Phase 8

**Estimated LOC:** ~12,000–15,000  
**Estimated Time:** 18–22 hours  
**Working Directory:** repo root (pnpm monorepo with Turborepo)

---

## BEFORE YOU START — READ THIS

This prompt has **four sections** that MUST be completed in order:

1. **SECTION 1 — CRITICAL FIXES** (fork/join nodes + executor — these break workflow tests)
2. **SECTION 2 — Phase 6.5** (P0 daily usability: data-service, attachments, mass ops, lead conversion UI)
3. **SECTION 3 — Phase 7** (approval-service + document-service)
4. **SECTION 4 — Phase 8** (chatbot-service: WhatsApp + Telegram)

**Rules you MUST follow:**
- Never truncate a file mid-implementation. If a file has more than 200 lines, write all of it.
- For SECTION 1 files specifically: copy the EXACT file content shown below — do not paraphrase or shorten.
- Run `pnpm tsc --noEmit` after each section and fix all type errors before proceeding.
- Use `decimal.js` for all monetary values. Import as `import Decimal from 'decimal.js'`.
- All new Fastify services follow the same pattern as `crm-service`: port via `PORT` env var, JWT auth via `@nexus/service-utils`, Kafka via `@nexus/kafka`.
- All new Prisma schemas: `generator client { output = "../../../node_modules/.prisma/<name>-client" }`.

---

## SECTION 1 — CRITICAL FIXES

### Fix 1A: `services/workflow-service/prisma/schema.prisma`

The `WorkflowForkTracker` model is referenced but not defined in the schema. Add it now. Replace the entire file with:

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../../../node_modules/.prisma/workflow-client"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model WorkflowTemplate {
  id                String              @id @default(cuid())
  tenantId          String
  name              String
  description       String?
  trigger           String
  triggerConditions Json                @default("{}")
  nodes             Json
  edges             Json
  isActive          Boolean             @default(false)
  version           Int                 @default(1)
  createdAt         DateTime            @default(now())
  updatedAt         DateTime            @updatedAt
  executions        WorkflowExecution[]

  @@index([tenantId])
  @@index([tenantId, trigger, isActive])
}

model WorkflowExecution {
  id             String                @id @default(cuid())
  tenantId       String
  workflowId     String
  workflow       WorkflowTemplate      @relation(fields: [workflowId], references: [id])
  triggerType    String
  triggerPayload Json
  status         ExecutionStatus       @default(RUNNING)
  currentNodeId  String?
  resumeAt       DateTime?
  startedAt      DateTime              @default(now())
  completedAt    DateTime?
  error          String?
  steps          WorkflowStep[]
  parentForkId   String?
  parentExecId   String?
  parent         WorkflowExecution?    @relation("BranchChildren", fields: [parentExecId], references: [id], onDelete: SetNull)
  branchChildren WorkflowExecution[]   @relation("BranchChildren")
  forkTrackers   WorkflowForkTracker[]

  @@index([tenantId])
  @@index([tenantId, status])
  @@index([status, resumeAt])
  @@index([parentExecId])
}

model WorkflowForkTracker {
  id             String            @id @default(cuid())
  executionId    String
  execution      WorkflowExecution @relation(fields: [executionId], references: [id], onDelete: Cascade)
  forkNodeId     String
  joinNodeId     String
  branchNodeIds  String[]
  completedIds   String[]          @default([])
  createdAt      DateTime          @default(now())

  @@index([executionId, forkNodeId])
}

model WorkflowStep {
  id          String            @id @default(cuid())
  executionId String
  execution   WorkflowExecution @relation(fields: [executionId], references: [id])
  nodeId      String
  nodeType    String
  status      StepStatus        @default(PENDING)
  input       Json              @default("{}")
  output      Json?
  error       String?
  startedAt   DateTime          @default(now())
  completedAt DateTime?

  @@index([executionId])
}

enum ExecutionStatus {
  RUNNING
  PAUSED
  COMPLETED
  FAILED
  CANCELLED
}

enum StepStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
  SKIPPED
}
```

After writing schema.prisma run:
```bash
cd services/workflow-service && npx prisma generate
```

---

### Fix 1B: `services/workflow-service/src/engine/nodes/fork.node.ts`

**WRITE THE COMPLETE FILE BELOW — EXACTLY AS SHOWN — NO TRUNCATION:**

```typescript
import { type NexusProducer, TOPICS } from '@nexus/kafka';
import type { WorkflowPrisma } from '../../prisma.js';
import type { ExecutionContext, NodeResult, WorkflowNode } from '../types.js';

/**
 * FORK: creates one child WorkflowExecution per branch, records a
 * WorkflowForkTracker, publishes workflow.branch.start for each child,
 * then pauses the parent execution for up to 24 h pointing at the JOIN node.
 *
 * config shape: { branches: string[]; joinNodeId: string }
 *   branches   — array of node IDs that are the first node of each branch
 *   joinNodeId — the JOIN node the parent resumes at once all branches finish
 */
export async function handleForkNode(
  node: WorkflowNode,
  context: ExecutionContext,
  prisma: WorkflowPrisma,
  producer: NexusProducer
): Promise<NodeResult> {
  const config = (node.config ?? {}) as { branches?: string[]; joinNodeId?: string };
  const branches = config.branches ?? [];
  const joinNodeId = config.joinNodeId;

  // Edge case: no branches — skip through immediately
  if (branches.length === 0) {
    return { output: { skipped: true } };
  }

  if (!joinNodeId) {
    throw new Error(`FORK node "${node.id}" is missing joinNodeId in config`);
  }

  // Record the tracker BEFORE spawning children so the JOIN can always find it
  await prisma.workflowForkTracker.create({
    data: {
      executionId: context.executionId,
      forkNodeId: node.id,
      joinNodeId,
      branchNodeIds: branches,
      completedIds: [],
    },
  });

  // Spawn one child execution per branch and publish a start event
  for (const branchNodeId of branches) {
    const child = await prisma.workflowExecution.create({
      data: {
        tenantId: context.tenantId,
        workflowId: context.workflowId,
        triggerType: 'BRANCH',
        triggerPayload: context.triggerPayload as object,
        status: 'RUNNING',
        currentNodeId: branchNodeId,
        parentExecId: context.executionId,
        parentForkId: node.id,
      },
    });

    await producer
      .publish(TOPICS.WORKFLOWS, {
        type: 'workflow.branch.start',
        tenantId: context.tenantId,
        payload: {
          executionId: child.id,
          parentExecutionId: context.executionId,
          branchNodeId,
        },
      })
      .catch(() => undefined); // Non-fatal: the child row already exists
  }

  // Pause the parent for 24 h; executor will resume it at joinNodeId
  const pauseUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return { nextNodeId: joinNodeId, pauseUntil };
}
```

---

### Fix 1C: `services/workflow-service/src/engine/nodes/join.node.ts`

**WRITE THE COMPLETE FILE BELOW — EXACTLY AS SHOWN — NO TRUNCATION:**

```typescript
import type { WorkflowPrisma } from '../../prisma.js';
import type { ExecutionContext, NodeResult, WorkflowNode } from '../types.js';

/**
 * JOIN: checks whether all branch children of the matching FORK have
 * completed. If not, re-pauses for 60 seconds (polling). Once all branches
 * are COMPLETED the JOIN returns normally and execution continues.
 *
 * The executor nudges the parent resumeAt to now() whenever a child
 * execution completes (see executor.ts), so in practice the join wakes up
 * almost immediately after the last branch finishes.
 */
export async function handleJoinNode(
  node: WorkflowNode,
  context: ExecutionContext,
  prisma: WorkflowPrisma
): Promise<NodeResult> {
  // Find the tracker created by the most-recent FORK that targets this JOIN
  const tracker = await prisma.workflowForkTracker.findFirst({
    where: {
      executionId: context.executionId,
      joinNodeId: node.id,
    },
    orderBy: { createdAt: 'desc' },
  });

  // No tracker → reached without a FORK (misconfigured graph) — skip through
  if (!tracker) {
    return { output: { skipped: true } };
  }

  // Count how many children have finished
  const completedCount = await prisma.workflowExecution.count({
    where: {
      parentExecId: context.executionId,
      parentForkId: tracker.forkNodeId,
      status: 'COMPLETED',
    },
  });

  const totalBranches = tracker.branchNodeIds.length;

  if (completedCount < totalBranches) {
    // Not all done yet — re-pause for 60 s so the executor polls again
    const pauseUntil = new Date(Date.now() + 60 * 1000);
    return { pauseUntil, nextNodeId: node.id };
  }

  // All branches completed — pass through to next node
  return { output: { completedBranches: completedCount } };
}
```

---

### Fix 1D: `services/workflow-service/src/engine/executor.ts`

The `executeNode` switch statement is truncated — the FORK and JOIN cases are missing. Replace the entire `executeNode` private method (from `private async executeNode` to the closing `}`) with the version below. The rest of the file stays unchanged.

```typescript
  private async executeNode(
    node: WorkflowNode,
    context: ExecutionContext
  ): Promise<NodeResult> {
    switch (node.type) {
      case 'TRIGGER':
        return handleTriggerNode(node, context);
      case 'CONDITION':
        return handleConditionNode(node, context);
      case 'WAIT':
        return handleWaitNode(node, context);
      case 'ACTION':
        return handleActionNode(node, context);
      case 'EMAIL':
        return handleEmailNode(node, context);
      case 'WEBHOOK':
        return handleWebhookNode(node, context);
      case 'SET_FIELD':
        return handleSetFieldNode(node, context);
      case 'CREATE_ACTIVITY':
        return handleCreateActivityNode(node, context);
      case 'CREATE_TASK':
        return handleCreateTaskNode(node, context);
      case 'ASSIGN':
        return handleAssignNode(node, context);
      case 'NOTIFY':
        return handleNotifyNode(node, context);
      case 'FORK':
        return handleForkNode(node, context, this.prisma, this.producer);
      case 'JOIN':
        return handleJoinNode(node, context, this.prisma);
      case 'END':
        return handleEndNode(node, context);
      default:
        return {};
    }
  }
```

After writing all four files in Section 1, run:
```bash
cd services/workflow-service && pnpm test
```
All tests in `src/__tests__/fork.test.ts` and `src/engine/__tests__/nodes.test.ts` must pass.

---

## SECTION 2 — Phase 6.5: P0 Daily Usability Sprint

### 2A: New service — `services/data-service/`

Create a new Fastify microservice on port **3015** with the following structure:

```
services/data-service/
├── package.json
├── tsconfig.json
├── prisma/
│   └── schema.prisma
└── src/
    ├── index.ts
    ├── prisma.ts
    ├── routes/
    │   ├── import.routes.ts
    │   ├── export.routes.ts
    │   ├── recycle.routes.ts
    │   ├── audit.routes.ts
    │   └── views.routes.ts
    └── services/
        ├── import.service.ts
        ├── export.service.ts
        ├── recycle.service.ts
        ├── audit.service.ts
        └── views.service.ts
```

#### `services/data-service/package.json`
```json
{
  "name": "@nexus/data-service",
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
    "csv-parse": "^5.5.6",
    "csv-stringify": "^6.5.1",
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

#### `services/data-service/prisma/schema.prisma`
```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../../../node_modules/.prisma/data-client"
}

datasource db {
  provider = "postgresql"
  url      = env("DATA_DATABASE_URL")
}

model RecycleBinItem {
  id             String   @id @default(cuid())
  tenantId       String
  module         String
  recordId       String
  recordSnapshot Json
  deletedBy      String
  deletedAt      DateTime @default(now())
  expiresAt      DateTime

  @@index([tenantId, module])
  @@index([tenantId, expiresAt])
}

model FieldAuditLog {
  id         String   @id @default(cuid())
  tenantId   String
  module     String
  recordId   String
  fieldName  String
  oldValue   String?
  newValue   String?
  changedBy  String
  changedAt  DateTime @default(now())

  @@index([tenantId, module, recordId])
  @@index([tenantId, changedAt])
}

model SavedView {
  id        String   @id @default(cuid())
  tenantId  String
  userId    String
  module    String
  name      String
  filters   Json     @default("{}")
  columns   Json     @default("[]")
  sortBy    String?
  sortDir   String   @default("asc")
  isDefault Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([tenantId, userId, module, name])
  @@index([tenantId, userId, module])
}

model RecentRecord {
  id       String   @id @default(cuid())
  tenantId String
  userId   String
  module   String
  recordId String
  viewedAt DateTime @default(now())

  @@unique([tenantId, userId, module, recordId])
  @@index([tenantId, userId])
}

model ImportJob {
  id          String       @id @default(cuid())
  tenantId    String
  module      String
  status      ImportStatus @default(PENDING)
  fileName    String
  totalRows   Int          @default(0)
  imported    Int          @default(0)
  failed      Int          @default(0)
  errors      Json         @default("[]")
  fieldMap    Json         @default("{}")
  createdBy   String
  createdAt   DateTime     @default(now())
  completedAt DateTime?

  @@index([tenantId, module])
}

enum ImportStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
}
```

#### `services/data-service/src/prisma.ts`
```typescript
import { PrismaClient } from '../../../node_modules/.prisma/data-client/index.js';

export type DataPrisma = PrismaClient;

let prisma: DataPrisma | null = null;

export function getPrisma(): DataPrisma {
  if (!prisma) {
    prisma = new PrismaClient({ log: ['error'] });
  }
  return prisma;
}
```

#### `services/data-service/src/index.ts`
```typescript
import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { getPrisma } from './prisma.js';
import { NexusProducer } from '@nexus/kafka';
import { registerImportRoutes } from './routes/import.routes.js';
import { registerExportRoutes } from './routes/export.routes.js';
import { registerRecycleRoutes } from './routes/recycle.routes.js';
import { registerAuditRoutes } from './routes/audit.routes.js';
import { registerViewsRoutes } from './routes/views.routes.js';

const app = Fastify({ logger: true });
const prisma = getPrisma();
const producer = new NexusProducer('data-service');

app.register(fastifyJwt, { secret: process.env.JWT_SECRET ?? 'nexus-secret' });

app.addHook('onRequest', async (request, reply) => {
  try {
    await request.jwtVerify();
  } catch {
    reply.code(401).send({ error: 'Unauthorized' });
  }
});

await registerImportRoutes(app, prisma, producer);
await registerExportRoutes(app, prisma);
await registerRecycleRoutes(app, prisma);
await registerAuditRoutes(app, prisma);
await registerViewsRoutes(app, prisma);

app.get('/health', async () => ({ status: 'ok', service: 'data-service' }));

const port = Number(process.env.PORT ?? 3015);
await producer.connect();
await app.listen({ port, host: '0.0.0.0' });
console.log(`data-service listening on :${port}`);
```

#### `services/data-service/src/services/recycle.service.ts`

Implement `createRecycleService(prisma)` returning:
- `softDelete(tenantId, module, recordId, recordSnapshot, deletedBy)` — creates RecycleBinItem with `expiresAt = now() + 30 days`
- `listBin(tenantId, module?, page, limit)` — paginated list of non-expired items
- `restore(tenantId, id)` — returns the recordSnapshot for the caller to re-create the record, then deletes the bin item
- `purge(tenantId, id)` — hard-delete a single bin item
- `purgeExpired()` — deletes all items where `expiresAt < now()`

#### `services/data-service/src/services/audit.service.ts`

Implement `createAuditService(prisma)` returning:
- `log(tenantId, module, recordId, fieldName, oldValue, newValue, changedBy)` — creates FieldAuditLog
- `getHistory(tenantId, module, recordId, page, limit)` — paginated list ordered by `changedAt desc`

#### `services/data-service/src/services/views.service.ts`

Implement `createViewsService(prisma)` returning:
- `listViews(tenantId, userId, module)` — all saved views for a user+module
- `createView(tenantId, userId, module, input)` — if `isDefault=true`, first clears any existing default for that user+module
- `updateView(tenantId, id, input)` — partial update
- `deleteView(tenantId, id)` — delete

#### `services/data-service/src/services/import.service.ts`

Implement `createImportService(prisma)` returning:
- `createJob(tenantId, module, fileName, createdBy, fieldMap)` — creates an ImportJob in PENDING state, returns the job
- `processJob(jobId, csvBuffer)` — uses `csv-parse` (async iterator) to read rows, maps fields via `fieldMap`, calls the CRM service API for each row via `fetch`, increments imported/failed counters, updates job to COMPLETED or FAILED
- `getJob(tenantId, id)` — returns ImportJob
- `listJobs(tenantId, module?, page, limit)` — paginated

#### `services/data-service/src/services/export.service.ts`

Implement `createExportService(prisma)` returning:
- `exportCsv(tenantId, module, filters, columns)` — calls the CRM service API to fetch all records (paginating with limit=500 until exhausted), maps to selected columns, returns a CSV string using `csv-stringify`

#### Routes:

**`src/routes/recycle.routes.ts`**
```
GET  /api/v1/recycle?module=&page=&limit=
POST /api/v1/recycle/:id/restore
DELETE /api/v1/recycle/:id
DELETE /api/v1/recycle/purge-expired
```

**`src/routes/audit.routes.ts`**
```
GET /api/v1/audit/:module/:recordId?page=&limit=
POST /api/v1/audit  — body: {module,recordId,fieldName,oldValue,newValue}
```

**`src/routes/views.routes.ts`**
```
GET    /api/v1/views/:module
POST   /api/v1/views/:module
PATCH  /api/v1/views/:id
DELETE /api/v1/views/:id
```

**`src/routes/import.routes.ts`**
```
POST /api/v1/import/:module          — multipart upload (csv file + fieldMap JSON)
GET  /api/v1/import/jobs/:id
GET  /api/v1/import/jobs?module=&page=&limit=
```

**`src/routes/export.routes.ts`**
```
POST /api/v1/export/:module          — body: {filters?, columns?}, returns CSV with Content-Disposition header
```

---

### 2B: Attachments in `services/crm-service`

Add an `Attachment` model to `services/crm-service/prisma/schema.prisma`:

```prisma
model Attachment {
  id          String   @id @default(cuid())
  tenantId    String
  module      String   // 'contact' | 'account' | 'deal' | 'lead'
  recordId    String
  fileName    String
  fileSize    Int
  mimeType    String
  storageKey  String   // MinIO object key
  uploadedBy  String
  createdAt   DateTime @default(now())

  @@index([tenantId, module, recordId])
}
```

After adding to schema, run `cd services/crm-service && npx prisma generate`.

Add to `services/crm-service/src/routes/contacts.routes.ts`:
```
POST   /contacts/:id/attachments     — multipart: uploads to storage-service, stores metadata
GET    /contacts/:id/attachments     — list attachments
DELETE /contacts/:id/attachments/:attachmentId
```

Add same routes to `accounts.routes.ts`, `deals.routes.ts`, `leads.routes.ts`.

Create `services/crm-service/src/services/attachments.service.ts`:
- `createAttachmentsService(prisma)` returning `listAttachments(tenantId, module, recordId)`, `deleteAttachment(tenantId, id)`, `createAttachment(tenantId, module, recordId, meta, uploadedBy)`.
- For actual file upload: proxy the multipart to `STORAGE_SERVICE_URL/api/v1/objects` (storage-service, port 3008). Store returned `storageKey`.

---

### 2C: Mass Operations in `services/crm-service`

Add to `services/crm-service/src/routes/contacts.routes.ts`:
```
PATCH  /contacts/mass-update         — body: { ids: string[], data: { ownerId?, tags?, customFields? } }
DELETE /contacts/mass-delete         — body: { ids: string[] }
```

Add to `leads.routes.ts`:
```
PATCH  /leads/mass-update            — body: { ids: string[], data: { ownerId?, status?, rating? } }
DELETE /leads/mass-delete            — body: { ids: string[] }
```

Add to `deals.routes.ts`:
```
PATCH  /deals/mass-update            — body: { ids: string[], data: { ownerId?, stageId?, forecastCategory? } }
DELETE /deals/mass-delete            — body: { ids: string[] }
```

Implementation: use `prisma.contact.updateMany({ where: { id: { in: ids }, tenantId }, data })` and `deleteMany`. Cap `ids.length` at 200.

---

### 2D: Lead Conversion Frontend

Create `apps/web/src/app/(dashboard)/leads/[id]/page.tsx` — a lead detail page with:

**Tab structure:** Overview | Activities | Notes | Convert

**Overview tab** shows all lead fields in a read-only card grid: Name, Email, Phone, Company, Job Title, Source, Status, Rating, Score, Industry, Website, UTM fields, Owner, Created.

**Activities/Notes tabs** — same pattern as contact detail page (use `useContactTimeline` pattern adapted for leads).

**Convert tab** — a conversion form with:
- Radio: "Create new account" (default) vs "Use existing account" (with account search input)
- Account Name input (pre-filled from `lead.company`)
- Checkbox: "Create deal" (default true)
- If "Create deal" checked: Pipeline selector (`/api/v1/pipelines`), Stage selector (filtered by pipeline), Deal Name input (pre-filled), Deal Amount input
- Submit button "Convert Lead" calls `POST /api/v1/leads/:id/convert`
- On success: show success banner with links to the newly created Contact and Account

Also update `apps/web/src/app/(dashboard)/leads/page.tsx` to add `href={/leads/${l.id}}` link on each row's name column (same pattern as contacts list → contacts/[id]).

---

### 2E: Quick-Create Floating Action Button

Create `apps/web/src/components/quick-create-fab.tsx`:

A floating `+` button in the bottom-right corner of the screen. On click, expands a radial menu with 4 options:
- ➕ Lead → opens `CreateLeadModal`
- ➕ Contact → opens `CreateContactModal`
- ➕ Account → opens `CreateAccountModal`
- ➕ Deal → opens `CreateDealModal`

Each modal is a minimal form (name + required fields only) using the existing create API endpoints. On success, invalidate the relevant React Query cache (`queryClient.invalidateQueries`).

Add `<QuickCreateFab />` to `apps/web/src/app/(dashboard)/layout.tsx`.

---

### 2F: Saved Views UI

Create `apps/web/src/components/saved-views-sidebar.tsx`:

A collapsible left sidebar for list pages with:
- "All [Module]" default view (no filter)
- List of saved views from `GET /api/v1/views/:module` (data-service)
- "Save current view" button — opens modal to name the view, posts to data-service
- Click on a view applies its `filters`, `columns`, `sortBy` to the parent list query

Update `apps/web/src/app/(dashboard)/contacts/page.tsx` to include `<SavedViewsSidebar module="contact" onViewSelect={setFilters} />`.

Update `apps/web/src/app/(dashboard)/leads/page.tsx` the same way.

---

### 2G: Mass Operations Toolbar (Frontend)

Update `apps/web/src/app/(dashboard)/contacts/page.tsx`:
- Add a checkbox column to the table
- When 1+ rows are selected, show a floating toolbar above the table: "X selected | Change Owner | Add Tags | Delete | ✕"
- "Change Owner" opens an owner picker modal, calls `PATCH /contacts/mass-update`
- "Delete" calls `DELETE /contacts/mass-delete` with confirmation dialog

Apply the same pattern to `leads/page.tsx` and `deals/page.tsx`.

---

## SECTION 3 — Phase 7: Approval Engine + Document Service

### 3A: New service — `services/approval-service/` (port 3014)

```
services/approval-service/
├── package.json
├── tsconfig.json
├── prisma/
│   └── schema.prisma
└── src/
    ├── index.ts
    ├── prisma.ts
    ├── routes/
    │   ├── policies.routes.ts
    │   └── requests.routes.ts
    └── services/
        ├── policies.service.ts
        └── requests.service.ts
```

#### `services/approval-service/package.json`
```json
{
  "name": "@nexus/approval-service",
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

#### `services/approval-service/prisma/schema.prisma`
```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../../../node_modules/.prisma/approval-client"
}

datasource db {
  provider = "postgresql"
  url      = env("APPROVAL_DATABASE_URL")
}

model ApprovalPolicy {
  id          String            @id @default(cuid())
  tenantId    String
  name        String
  module      String            // 'quote' | 'deal' | 'contract'
  conditions  Json              @default("{}")
  steps       Json              @default("[]")
  // steps shape: Array<{ order: number; approverType: 'USER'|'ROLE'|'MANAGER'; approverId?: string; role?: string; canDelegate: boolean }>
  isActive    Boolean           @default(true)
  createdAt   DateTime          @default(now())
  updatedAt   DateTime          @updatedAt
  requests    ApprovalRequest[]

  @@index([tenantId, module])
}

model ApprovalRequest {
  id           String          @id @default(cuid())
  tenantId     String
  policyId     String
  policy       ApprovalPolicy  @relation(fields: [policyId], references: [id])
  module       String
  recordId     String
  requestedBy  String
  status       ApprovalStatus  @default(PENDING)
  currentStep  Int             @default(0)
  data         Json            @default("{}")
  comment      String?
  createdAt    DateTime        @default(now())
  updatedAt    DateTime        @updatedAt
  steps        ApprovalStep[]

  @@index([tenantId, module, recordId])
  @@index([tenantId, status])
}

model ApprovalStep {
  id         String          @id @default(cuid())
  requestId  String
  request    ApprovalRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
  order      Int
  approverId String
  status     StepStatus      @default(PENDING)
  comment    String?
  actionedAt DateTime?
  createdAt  DateTime        @default(now())

  @@index([requestId])
  @@index([approverId, status])
}

enum ApprovalStatus {
  PENDING
  APPROVED
  REJECTED
  ESCALATED
  CANCELLED
}

enum StepStatus {
  PENDING
  APPROVED
  REJECTED
  SKIPPED
  DELEGATED
}
```

#### `services/approval-service/src/services/policies.service.ts`

Implement `createPoliciesService(prisma)` returning:
- `listPolicies(tenantId, module?)` — list active policies
- `getPolicy(tenantId, id)` — get single policy or throw NotFoundError
- `createPolicy(tenantId, input)` — create
- `updatePolicy(tenantId, id, input)` — partial update
- `deletePolicy(tenantId, id)` — soft-delete (set isActive=false)
- `findMatchingPolicy(tenantId, module, recordData)` — evaluates `policy.conditions` against `recordData`, returns first matching active policy or null

#### `services/approval-service/src/services/requests.service.ts`

Implement `createRequestsService(prisma, producer)` returning:
- `createRequest(tenantId, policyId, module, recordId, requestedBy, data)` — creates ApprovalRequest in PENDING state, creates ApprovalStep rows from policy.steps, publishes `approval.request.created` to TOPICS.WORKFLOWS
- `getRequest(tenantId, id)` — include steps
- `listRequests(tenantId, module?, recordId?, status?, page, limit)` — paginated
- `listMyPendingRequests(tenantId, approverId, page, limit)` — requests where current step has approverId and status=PENDING
- `approve(tenantId, requestId, approverId, comment?)` — marks current ApprovalStep APPROVED, advances currentStep; if all steps approved marks request APPROVED and publishes `approval.request.approved`; if more steps remain publishes `approval.step.advanced`
- `reject(tenantId, requestId, approverId, comment)` — marks step REJECTED, marks request REJECTED, publishes `approval.request.rejected`
- `cancel(tenantId, requestId, requestedBy)` — only requestedBy or admin can cancel; sets status CANCELLED

#### Routes:

**`src/routes/policies.routes.ts`**
```
GET    /api/v1/approval/policies?module=
POST   /api/v1/approval/policies
PATCH  /api/v1/approval/policies/:id
DELETE /api/v1/approval/policies/:id
```

**`src/routes/requests.routes.ts`**
```
GET    /api/v1/approval/requests?module=&recordId=&status=&page=&limit=
GET    /api/v1/approval/requests/mine?page=&limit=
POST   /api/v1/approval/requests
GET    /api/v1/approval/requests/:id
POST   /api/v1/approval/requests/:id/approve    — body: { comment? }
POST   /api/v1/approval/requests/:id/reject     — body: { comment }
POST   /api/v1/approval/requests/:id/cancel
```

All routes protected with `requirePermission`. Approval actions check that `request.user.id` matches the step's `approverId`.

#### `services/approval-service/src/index.ts`
Standard Fastify setup on port 3014 with JWT auth, registers both route files.

---

### 3B: Approval integration in `services/finance-service`

When a quote changes status to `PENDING_APPROVAL`, the finance-service should call the approval-service:

In `services/finance-service/src/services/quotes.service.ts`, in the `updateQuote` function, after persisting the update:

```typescript
if (data.status === 'PENDING_APPROVAL') {
  // POST to approval-service to find matching policy and create request
  await fetch(`${process.env.APPROVAL_SERVICE_URL}/api/v1/approval/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${INTERNAL_SERVICE_TOKEN}` },
    body: JSON.stringify({
      module: 'quote',
      recordId: updated.id,
      requestedBy: updatedBy,
      data: { amount: updated.total.toString(), currency: updated.currency },
    }),
  }).catch(() => undefined); // non-fatal
}
```

Use env var `INTERNAL_SERVICE_TOKEN` for service-to-service calls.

---

### 3C: New service — `services/document-service/` (port 3016)

```
services/document-service/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── routes/
    │   └── documents.routes.ts
    └── services/
        ├── pdf.service.ts
        └── templates/
            ├── quote.template.ts
            └── contract.template.ts
```

#### `services/document-service/package.json`
```json
{
  "name": "@nexus/document-service",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@fastify/jwt": "^8.0.0",
    "@nexus/service-utils": "workspace:*",
    "@nexus/shared-types": "workspace:*",
    "decimal.js": "^10.4.3",
    "fastify": "^4.28.1",
    "puppeteer": "^22.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.3"
  }
}
```

#### `services/document-service/src/services/templates/quote.template.ts`

Export `renderQuoteHtml(quote: QuoteData): string` where `QuoteData` is:
```typescript
interface LineItem {
  name: string;
  description?: string;
  qty: number;
  unitPrice: string;
  discount: string;
  total: string;
}
interface QuoteData {
  quoteNumber: string;
  name: string;
  validUntil?: string;
  currency: string;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  total: string;
  terms?: string;
  notes?: string;
  lineItems: LineItem[];
  companyName?: string;
  companyLogo?: string;
  contactName?: string;
  contactEmail?: string;
}
```

Generate a clean, professional HTML document with:
- Company header (logo if provided, name)
- Quote metadata box (quote number, date, valid until)
- Bill-to section (contact name/email)
- Line items table (columns: Item, Description, Qty, Unit Price, Discount, Total)
- Summary section (Subtotal, Discount, Tax, **Total**)
- Terms & conditions section
- Print-ready CSS (A4 size, no page-break inside line items table)

#### `services/document-service/src/services/pdf.service.ts`

```typescript
import puppeteer from 'puppeteer';

export async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
```

#### `services/document-service/src/routes/documents.routes.ts`

```
POST /api/v1/documents/quotes/:quoteId/pdf
  — fetches quote from finance-service
  — renders quote HTML template
  — converts to PDF with Puppeteer
  — returns PDF with Content-Type: application/pdf and Content-Disposition: attachment; filename="quote-{quoteNumber}.pdf"

POST /api/v1/documents/render
  — body: { template: 'quote' | 'contract'; data: object }
  — renders HTML and returns PDF
```

#### Frontend: Quote PDF Download

In `apps/web/src/app/(dashboard)/quotes/[id]/page.tsx`, add a "Download PDF" button:
```typescript
const downloadPdf = async () => {
  const res = await fetch(`${DOCUMENT_SERVICE_URL}/api/v1/documents/quotes/${quote.id}/pdf`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `quote-${quote.quoteNumber}.pdf`;
  a.click();
};
```

---

### 3D: Approval UI (Frontend)

Create `apps/web/src/app/(dashboard)/approvals/page.tsx`:

Two tabs:
1. **My Pending Approvals** — list from `GET /api/v1/approval/requests/mine`
   - Each row: Module, Record ID (linked), Requested By, Date, Amount
   - Actions: ✅ Approve | ❌ Reject (both open a comment modal)

2. **All Requests** — list from `GET /api/v1/approval/requests` with status filter
   - Filter: All | Pending | Approved | Rejected

Add "Approvals" nav item to `apps/web/src/components/sidebar.tsx` with a badge showing pending count.

---

## SECTION 4 — Phase 8: Chatbot Service

### 4A: New service — `services/chatbot-service/` (port 3017)

```
services/chatbot-service/
├── package.json
├── tsconfig.json
├── prisma/
│   └── schema.prisma
└── src/
    ├── index.ts
    ├── prisma.ts
    ├── routes/
    │   ├── whatsapp.routes.ts
    │   └── telegram.routes.ts
    └── services/
        ├── conversation.service.ts
        ├── whatsapp.service.ts
        └── telegram.service.ts
```

#### `services/chatbot-service/package.json`
```json
{
  "name": "@nexus/chatbot-service",
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
    "@prisma/client": "^5.22.0",
    "fastify": "^4.28.1",
    "node-fetch": "^3.3.2",
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

#### `services/chatbot-service/prisma/schema.prisma`
```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../../../node_modules/.prisma/chatbot-client"
}

datasource db {
  provider = "postgresql"
  url      = env("CHATBOT_DATABASE_URL")
}

model Conversation {
  id           String              @id @default(cuid())
  tenantId     String
  channel      Channel
  externalId   String              // WhatsApp: phone number; Telegram: chat_id
  state        ConversationState   @default(IDLE)
  contactId    String?             // CRM contact if matched
  draftQuoteId String?             // Quote being built
  context      Json                @default("{}")
  lastMessageAt DateTime           @default(now())
  createdAt    DateTime            @default(now())
  updatedAt    DateTime            @updatedAt
  messages     ConversationMessage[]

  @@unique([tenantId, channel, externalId])
  @@index([tenantId, state])
}

model ConversationMessage {
  id             String       @id @default(cuid())
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  direction      Direction
  body           String
  metadata       Json         @default("{}")
  createdAt      DateTime     @default(now())

  @@index([conversationId])
}

enum Channel {
  WHATSAPP
  TELEGRAM
}

enum Direction {
  INBOUND
  OUTBOUND
}

enum ConversationState {
  IDLE
  GREETING
  COLLECTING_INFO
  PRODUCT_SEARCH
  QUOTE_BUILDING
  QUOTE_REVIEW
  QUOTE_SENT
  COMPLETE
}
```

#### `services/chatbot-service/src/services/conversation.service.ts`

Implement a Finite State Machine (FSM) that processes incoming messages:

```typescript
export type FsmResult = {
  reply: string;
  newState: ConversationState;
  updatedContext?: Record<string, unknown>;
};

export async function processMessage(
  conversation: Conversation,
  message: string,
  prisma: ChatbotPrisma
): Promise<FsmResult> {
  switch (conversation.state) {
    case 'IDLE':
      // Any message → greet and move to GREETING
      return {
        reply: `Hello! I'm the NEXUS quoting assistant. I can help you get a quote. What's your name?`,
        newState: 'GREETING',
      };

    case 'GREETING': {
      // Message is the customer's name
      const name = message.trim();
      return {
        reply: `Nice to meet you, ${name}! What's your email address?`,
        newState: 'COLLECTING_INFO',
        updatedContext: { name },
      };
    }

    case 'COLLECTING_INFO': {
      // Message is the email
      const ctx = conversation.context as Record<string, unknown>;
      const email = message.trim();
      // Check if contact exists in CRM
      const crmRes = await fetch(
        `${process.env.CRM_SERVICE_URL}/api/v1/contacts?search=${encodeURIComponent(email)}`,
        { headers: { Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN}` } }
      );
      const crmData = await crmRes.json() as { data: Array<{ id: string }> };
      const contactId = crmData.data[0]?.id ?? null;
      return {
        reply: `Thanks! What product or service are you looking for? (You can search by name)`,
        newState: 'PRODUCT_SEARCH',
        updatedContext: { ...ctx, email, contactId },
      };
    }

    case 'PRODUCT_SEARCH': {
      const ctx = conversation.context as Record<string, unknown>;
      // Search products via finance-service
      const res = await fetch(
        `${process.env.FINANCE_SERVICE_URL}/api/v1/products?search=${encodeURIComponent(message)}&limit=5`,
        { headers: { Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN}` } }
      );
      const data = await res.json() as { data: Array<{ id: string; name: string; listPrice: string }> };
      if (data.data.length === 0) {
        return {
          reply: `Sorry, I couldn't find any products matching "${message}". Try a different search term.`,
          newState: 'PRODUCT_SEARCH',
        };
      }
      const list = data.data
        .map((p, i) => `${i + 1}. ${p.name} — ${p.listPrice}`)
        .join('\n');
      return {
        reply: `I found these products:\n${list}\n\nReply with the number(s) you want (e.g. "1" or "1,3"), and specify quantity (e.g. "1 x2").`,
        newState: 'QUOTE_BUILDING',
        updatedContext: { ...ctx, productSearchResults: data.data },
      };
    }

    case 'QUOTE_BUILDING': {
      const ctx = conversation.context as Record<string, unknown>;
      const products = ctx.productSearchResults as Array<{ id: string; name: string; listPrice: string }>;
      // Parse "1 x2, 3 x1" format
      const selections = parseProductSelections(message, products);
      if (selections.length === 0) {
        return {
          reply: `I didn't understand that. Please reply with numbers like "1 x2" or "1,2".`,
          newState: 'QUOTE_BUILDING',
        };
      }
      const lineItems = selections.map((s) => ({
        productId: s.product.id,
        name: s.product.name,
        qty: s.qty,
        unitPrice: s.product.listPrice,
        discount: '0',
        total: (parseFloat(s.product.listPrice) * s.qty).toFixed(2),
      }));
      const grandTotal = lineItems.reduce((sum, li) => sum + parseFloat(li.total), 0).toFixed(2);
      const summary = lineItems.map((li) => `• ${li.name} x${li.qty} = ${li.total}`).join('\n');
      return {
        reply: `Here's your quote summary:\n${summary}\n\n**Total: ${grandTotal}**\n\nShall I send this quote? Reply YES to confirm or NO to start over.`,
        newState: 'QUOTE_REVIEW',
        updatedContext: { ...ctx, lineItems, grandTotal },
      };
    }

    case 'QUOTE_REVIEW': {
      const ctx = conversation.context as Record<string, unknown>;
      if (message.trim().toUpperCase() === 'YES') {
        // Create quote via finance-service
        await fetch(`${process.env.FINANCE_SERVICE_URL}/api/v1/quotes`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN}`,
          },
          body: JSON.stringify({
            tenantId: conversation.tenantId,
            name: `Chatbot Quote - ${ctx.name}`,
            currency: 'USD',
            lineItems: ctx.lineItems,
          }),
        });
        return {
          reply: `Your quote has been created and our team will follow up shortly. Thank you, ${ctx.name}!`,
          newState: 'QUOTE_SENT',
        };
      }
      return {
        reply: `No problem! What product would you like to search for?`,
        newState: 'PRODUCT_SEARCH',
        updatedContext: { ...ctx, lineItems: undefined, grandTotal: undefined },
      };
    }

    case 'QUOTE_SENT':
    case 'COMPLETE':
      return {
        reply: `Your quote is being processed. Is there anything else I can help you with? Reply START to begin a new quote.`,
        newState: message.trim().toUpperCase() === 'START' ? 'IDLE' : 'COMPLETE',
      };

    default:
      return { reply: `Sorry, I didn't understand that. Reply START to begin.`, newState: 'IDLE' };
  }
}

function parseProductSelections(
  input: string,
  products: Array<{ id: string; name: string; listPrice: string }>
): Array<{ product: (typeof products)[number]; qty: number }> {
  const selections: Array<{ product: (typeof products)[number]; qty: number }> = [];
  const parts = input.split(',').map((p) => p.trim());
  for (const part of parts) {
    const match = part.match(/^(\d+)(?:\s*[xX]\s*(\d+))?$/);
    if (!match) continue;
    const idx = parseInt(match[1], 10) - 1;
    const qty = match[2] ? parseInt(match[2], 10) : 1;
    if (idx >= 0 && idx < products.length) {
      selections.push({ product: products[idx], qty });
    }
  }
  return selections;
}
```

#### `services/chatbot-service/src/services/whatsapp.service.ts`

Implement WhatsApp Business Cloud API integration:

```typescript
const WA_API = `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_ID}/messages`;

export async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  await fetch(WA_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  });
}
```

#### `services/chatbot-service/src/services/telegram.service.ts`

Implement Telegram Bot API integration:

```typescript
const TG_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

export async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
  await fetch(`${TG_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
}
```

#### `services/chatbot-service/src/routes/whatsapp.routes.ts`

```typescript
// GET /api/v1/webhooks/whatsapp  — webhook verification (WhatsApp hub.challenge)
// POST /api/v1/webhooks/whatsapp — inbound message handler

// Verification:
r.get('/webhooks/whatsapp', async (request, reply) => {
  const q = request.query as Record<string, string>;
  if (q['hub.verify_token'] === process.env.WHATSAPP_VERIFY_TOKEN) {
    return reply.send(q['hub.challenge']);
  }
  return reply.code(403).send();
});

// Inbound:
r.post('/webhooks/whatsapp', async (request, reply) => {
  const body = request.body as WhatsAppWebhookBody;
  const messages = body?.entry?.[0]?.changes?.[0]?.value?.messages;
  if (!messages?.length) return reply.send({ status: 'ok' });

  for (const msg of messages) {
    if (msg.type !== 'text') continue;
    const from = msg.from;   // phone number
    const text = msg.text.body;
    const tenantId = process.env.DEFAULT_TENANT_ID ?? 'default';

    // Get or create conversation
    let conv = await prisma.conversation.findUnique({
      where: { tenantId_channel_externalId: { tenantId, channel: 'WHATSAPP', externalId: from } },
    });
    if (!conv) {
      conv = await prisma.conversation.create({
        data: { tenantId, channel: 'WHATSAPP', externalId: from, state: 'IDLE' },
      });
    }

    // Save inbound message
    await prisma.conversationMessage.create({
      data: { conversationId: conv.id, direction: 'INBOUND', body: text },
    });

    // Run FSM
    const result = await processMessage(conv, text, prisma);

    // Update conversation state + context
    await prisma.conversation.update({
      where: { id: conv.id },
      data: {
        state: result.newState,
        context: result.updatedContext ?? conv.context,
        lastMessageAt: new Date(),
      },
    });

    // Save outbound message
    await prisma.conversationMessage.create({
      data: { conversationId: conv.id, direction: 'OUTBOUND', body: result.reply },
    });

    // Send reply
    await sendWhatsAppMessage(from, result.reply);
  }

  reply.send({ status: 'ok' });
});
```

Apply the same pattern to `telegram.routes.ts` (Telegram uses `chat.id` as `externalId`, webhook at `POST /api/v1/webhooks/telegram`).

#### `services/chatbot-service/src/index.ts`

Standard Fastify setup on port **3017**, NO JWT auth on webhook routes (they use platform-specific verification), registers both route files.

---

### 4B: Chatbot Management UI (Frontend)

Create `apps/web/src/app/(dashboard)/chatbot/page.tsx`:

**Three tabs:**

1. **Conversations** — list from chatbot-service (direct fetch — not via api-client since chatbot is a new service):
   - Columns: Channel (WhatsApp/Telegram icon), Customer ID, State badge, Last Message, Last Activity
   - Click → conversation detail drawer showing full message thread

2. **Configuration**:
   - WhatsApp: Phone ID input, Access Token input (masked), Verify Token input, Webhook URL display
   - Telegram: Bot Token input (masked), Webhook URL display
   - Save button (stores in env, requires service restart note)

3. **Analytics**:
   - Cards: Total Conversations, Quotes Created via Bot, Conversion Rate, Avg Messages per Quote
   - Simple bar chart (recharts BarChart) showing conversations per day (last 14 days)

Add "Chatbot" nav item to `apps/web/src/components/sidebar.tsx`.

---

## SECTION 5 — FINAL VERIFICATION

After all four sections are complete, run all of the following:

```bash
# 1. Type check entire monorepo
pnpm tsc --noEmit

# 2. Workflow service tests (fork/join must all pass)
cd services/workflow-service && pnpm test

# 3. Generate all Prisma clients
cd services/data-service && npx prisma generate
cd services/approval-service && npx prisma generate
cd services/chatbot-service && npx prisma generate

# 4. Build all services
pnpm build

# 5. Verify no truncated files (every new node handler must export a function)
grep -l "export async function" services/workflow-service/src/engine/nodes/*.ts
# Should list ALL 14 node files including fork.node.ts and join.node.ts
```

Fix any TypeScript errors before marking this prompt complete.

---

## ENVIRONMENT VARIABLES NEEDED

Add to `.env.example` (and docker-compose if present):

```env
# data-service
DATA_DATABASE_URL=postgresql://nexus:nexus@localhost:5432/nexus_data
PORT=3015

# approval-service
APPROVAL_DATABASE_URL=postgresql://nexus:nexus@localhost:5432/nexus_approval
APPROVAL_SERVICE_URL=http://localhost:3014

# document-service
PORT=3016

# chatbot-service
CHATBOT_DATABASE_URL=postgresql://nexus:nexus@localhost:5432/nexus_chatbot
WHATSAPP_PHONE_ID=your_phone_id
WHATSAPP_ACCESS_TOKEN=your_token
WHATSAPP_VERIFY_TOKEN=your_verify_token
TELEGRAM_BOT_TOKEN=your_bot_token
DEFAULT_TENANT_ID=tenant_default
PORT=3017

# shared
INTERNAL_SERVICE_TOKEN=nexus-internal-secret
DOCUMENT_SERVICE_URL=http://localhost:3016
FINANCE_SERVICE_URL=http://localhost:3002
CRM_SERVICE_URL=http://localhost:3001
```

---

## SUMMARY OF DELIVERABLES

| # | File / Change | LOC est. |
|---|---|---|
| 1A | workflow-service/prisma/schema.prisma (complete) | 80 |
| 1B | fork.node.ts (complete) | 60 |
| 1C | join.node.ts (complete) | 55 |
| 1D | executor.ts switch fix | 20 |
| 2A | data-service (all files) | 800 |
| 2B | CRM Attachment model + 4 route files | 200 |
| 2C | Mass operations routes + service methods | 150 |
| 2D | leads/[id]/page.tsx | 350 |
| 2E | quick-create-fab.tsx | 200 |
| 2F | saved-views-sidebar.tsx | 200 |
| 2G | Mass operations toolbar (3 list pages) | 150 |
| 3A | approval-service (all files) | 700 |
| 3B | finance-service quote approval integration | 30 |
| 3C | document-service (all files) | 350 |
| 3D | approvals/page.tsx | 250 |
| 4A | chatbot-service (all files) | 600 |
| 4B | chatbot/page.tsx | 300 |
| **Total** | | **~4,495 net new** |

**Services after this prompt:** 18 microservices (ports 3001–3017 + 8000)
