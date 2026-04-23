# NEXUS CRM — Cursor Overnight Build Prompt
## Copy this entire file into Cursor as your starting message

---

## CONTEXT (read before writing a single line)

You are continuing the build of **NEXUS CRM** — a self-hosted, microservices-based Revenue Operating System.

**Your reference document is `@NEXUS_CRM_Technical_Spec.md`** — always keep it in context. Every section number below refers to that file.

**Your anti-stub rules file is `@.cursorrules`** — you must obey it without exception.

### What already exists (DO NOT rewrite these):
```
packages/shared-types/src/index.ts        — 474 lines (all types)
packages/validation/src/index.ts          — 586 lines (all Zod schemas)
packages/kafka/src/index.ts               — 220 lines (NexusProducer/NexusConsumer)
packages/service-utils/src/server.ts      — 141 lines (createService, startService)
packages/service-utils/src/rbac.ts        — 235 lines (requirePermission, PERMISSIONS)
packages/service-utils/src/errors.ts      — 111 lines (NotFoundError, BusinessRuleError, etc.)
services/auth-service/                    — COMPLETE (do not touch)
services/crm-service/src/services/deals.service.ts     — 740 lines ✅
services/crm-service/src/services/accounts.service.ts  — 375 lines ✅
services/crm-service/src/services/contacts.service.ts  — 217 lines ✅
services/crm-service/src/services/leads.service.ts     — 372 lines ✅
services/crm-service/src/services/pipelines.service.ts — 211 lines ✅
services/crm-service/src/routes/deals.routes.ts        — 323 lines ✅
services/crm-service/src/routes/accounts.routes.ts     — 183 lines ✅
services/crm-service/src/routes/contacts.routes.ts     — 111 lines ✅
services/crm-service/src/routes/leads.routes.ts        — 124 lines ✅
services/crm-service/src/routes/pipelines.routes.ts    — 164 lines ✅
services/finance-service/src/cpq/pricing-engine.ts     — 520 lines ✅
services/finance-service/src/services/products.service.ts   — 211 lines ✅
services/finance-service/src/services/invoices.service.ts   — 314 lines ✅
services/finance-service/src/services/contracts.service.ts  — 186 lines ✅
apps/web/src/components/deals/pipeline-board.tsx       — 290 lines ✅
apps/web/src/components/deals/deal-form.tsx            — 723 lines ✅
apps/web/src/hooks/use-deals.ts                        — 204 lines ✅
apps/web/src/hooks/use-accounts.ts                     — 285 lines ✅
```

### Code patterns you MUST follow:
- Services: `export function createXxxService(prisma: XxxPrisma, producer: NexusProducer) { return { async methodName(...) {...} }; }`
- Routes: `export async function registerXxxRoutes(app: FastifyInstance, prisma: XxxPrisma, producer: NexusProducer): Promise<void>`
- Every DB query: `where: { ..., tenantId }` — no exceptions
- Every mutation: `version: { increment: 1 }` on models that have `version`
- Validation: `const parsed = XxxSchema.safeParse(request.body); if (!parsed.success) throw new ValidationError(...)`
- Auth: `const jwt = request.user as JwtPayload;` then `jwt.tenantId`
- Errors: Import from `@nexus/service-utils` — `NotFoundError`, `BusinessRuleError`, `ConflictError`, `ValidationError`
- Kafka: `await producer.publish(TOPICS.XXX, { type: 'entity.event', tenantId, payload: {...} })`

---

## PHASE 1 COMPLETION — CRM Service (Write these files NOW, in order)

### FILE 1: `services/crm-service/src/services/activities.service.ts`

**Reference**: Section 34.3 of the spec. Mirror the exact structure of `deals.service.ts`.

The `Activity` and `Note` models are already in `services/crm-service/prisma/schema.prisma`. The `getDealTimeline` method in deals.service.ts already queries these tables — so the schema is confirmed working.

Write a complete `createActivitiesService(prisma, producer)` factory that returns an object with ALL of these methods — each fully implemented, no stubs:

```typescript
// Import types from:
// - '@nexus/shared-types' for PaginatedResult
// - '@nexus/validation' for CreateActivityInput, UpdateActivityInput
// - '@nexus/kafka' for NexusProducer, TOPICS
// - '@nexus/service-utils' for NotFoundError, BusinessRuleError
// - '../prisma.js' for CrmPrisma
// - '../lib/pagination.js' for toPaginatedResult

listActivities(tenantId: string, filters: ActivityListFilters, pagination: ActivityListPagination): Promise<PaginatedResult<Activity>>
// filters: { dealId?, contactId?, leadId?, accountId?, ownerId?, type?, status?, dueBefore?, dueAfter?, overdue? }
// overdue = dueDate < now AND status NOT IN [DONE, CANCELLED]

getActivityById(tenantId: string, id: string): Promise<Activity>
// throws NotFoundError if not found

createActivity(tenantId: string, data: CreateActivityInput): Promise<Activity>
// validate dealId/contactId/leadId all belong to tenant if provided
// set dueDate from data.dueDate
// publish TOPICS.ACTIVITIES: { type: 'activity.created', tenantId, payload: { activityId, type, ownerId, dealId } }

updateActivity(tenantId: string, id: string, data: UpdateActivityInput): Promise<Activity>
// partial update, bump version

deleteActivity(tenantId: string, id: string): Promise<void>
// soft delete: set status = 'CANCELLED', do NOT hard delete

completeActivity(tenantId: string, id: string, outcome: string): Promise<Activity>
// set status = 'DONE', completedAt = now(), outcome = outcome
// throw BusinessRuleError if already DONE or CANCELLED
// publish TOPICS.ACTIVITIES: { type: 'activity.completed', tenantId, payload: { activityId, type, ownerId, dealId, outcome } }

rescheduleActivity(tenantId: string, id: string, newDueDate: string): Promise<Activity>
// update dueDate, bump version
// throw BusinessRuleError if activity is DONE or CANCELLED

listActivitiesForDeal(tenantId: string, dealId: string, pagination: { page: number; limit: number }): Promise<PaginatedResult<Activity>>
// verify deal exists in tenant first, then filter by dealId

listActivitiesForContact(tenantId: string, contactId: string, pagination: { page: number; limit: number }): Promise<PaginatedResult<Activity>>
// verify contact exists in tenant first, then filter by contactId

listActivitiesForLead(tenantId: string, leadId: string, pagination: { page: number; limit: number }): Promise<PaginatedResult<Activity>>
// verify lead exists in tenant first

getUpcomingActivities(tenantId: string, ownerId: string, daysAhead: number): Promise<Activity[]>
// return activities where ownerId matches, dueDate <= now + daysAhead days, status = 'OPEN'
// order by dueDate asc, limit 50
```

---

### FILE 2: `services/crm-service/src/routes/activities.routes.ts`

Mirror the structure of `deals.routes.ts`. Register under `/api/v1`.

All endpoints:
```
GET    /activities                    — requirePermission(PERMISSIONS.ACTIVITIES.READ)  → listActivities
POST   /activities                    — requirePermission(PERMISSIONS.ACTIVITIES.CREATE) → createActivity
GET    /activities/upcoming           — requirePermission(PERMISSIONS.ACTIVITIES.READ)  → getUpcomingActivities (query: ownerId, daysAhead=7)
GET    /activities/:id                — requirePermission(PERMISSIONS.ACTIVITIES.READ)  → getActivityById
PATCH  /activities/:id                — requirePermission(PERMISSIONS.ACTIVITIES.UPDATE) → updateActivity
DELETE /activities/:id                — requirePermission(PERMISSIONS.ACTIVITIES.DELETE) → deleteActivity (soft)
POST   /activities/:id/complete       — requirePermission(PERMISSIONS.ACTIVITIES.UPDATE) → completeActivity (body: { outcome: string })
PATCH  /activities/:id/reschedule     — requirePermission(PERMISSIONS.ACTIVITIES.UPDATE) → rescheduleActivity (body: { dueDate: string })
GET    /deals/:dealId/activities      — requirePermission(PERMISSIONS.ACTIVITIES.READ)  → listActivitiesForDeal
GET    /contacts/:contactId/activities — requirePermission(PERMISSIONS.ACTIVITIES.READ) → listActivitiesForContact
GET    /leads/:leadId/activities      — requirePermission(PERMISSIONS.ACTIVITIES.READ)  → listActivitiesForLead
```

---

### FILE 3: `services/crm-service/src/services/notes.service.ts`

Write `createNotesService(prisma)` (no Kafka for notes — they're synchronous). All methods fully implemented:

```typescript
listNotes(tenantId: string, filters: NoteListFilters, pagination: { page: number; limit: number }): Promise<PaginatedResult<Note>>
// filters: { dealId?, contactId?, leadId?, accountId?, isPinned?, authorId? }

getNoteById(tenantId: string, id: string): Promise<Note>

createNote(tenantId: string, data: { content: string; dealId?: string; contactId?: string; leadId?: string; accountId?: string; isPinned?: boolean; authorId: string }): Promise<Note>
// validate at least one of dealId/contactId/leadId/accountId provided
// validate the referenced entity exists in tenant

updateNote(tenantId: string, id: string, data: { content?: string; isPinned?: boolean }): Promise<Note>
// only author can update — check note.authorId === jwt.sub (pass userId as param)
// throw BusinessRuleError('Only the author can edit this note') if mismatch

deleteNote(tenantId: string, id: string, requestingUserId: string): Promise<void>
// only author OR admin role can delete
// hard delete is fine for notes

pinNote(tenantId: string, id: string): Promise<Note>
// set isPinned = true

unpinNote(tenantId: string, id: string): Promise<Note>
// set isPinned = false

listNotesForDeal(tenantId: string, dealId: string, pagination: { page: number; limit: number }): Promise<PaginatedResult<Note>>
// verify deal exists, pinned notes first, then by createdAt desc

listNotesForContact(tenantId: string, contactId: string, pagination: { page: number; limit: number }): Promise<PaginatedResult<Note>>

listNotesForLead(tenantId: string, leadId: string, pagination: { page: number; limit: number }): Promise<PaginatedResult<Note>>
```

---

### FILE 4: `services/crm-service/src/routes/notes.routes.ts`

All endpoints:
```
GET    /notes                          — READ  → listNotes
POST   /notes                          — CREATE → createNote
GET    /notes/:id                      — READ  → getNoteById
PATCH  /notes/:id                      — UPDATE → updateNote
DELETE /notes/:id                      — DELETE → deleteNote
POST   /notes/:id/pin                  — UPDATE → pinNote
DELETE /notes/:id/pin                  — UPDATE → unpinNote
GET    /deals/:dealId/notes            — READ  → listNotesForDeal
GET    /contacts/:contactId/notes      — READ  → listNotesForContact
GET    /leads/:leadId/notes            — READ  → listNotesForLead
```

---

### FILE 5: UPDATE `services/crm-service/src/routes/index.ts`

Add activities and notes to `registerAllRoutes`:

```typescript
import { registerActivitiesRoutes } from './activities.routes.js';
import { registerNotesRoutes } from './notes.routes.js';
// ... add to registerAllRoutes:
await registerActivitiesRoutes(app, prisma, producer);
await registerNotesRoutes(app, prisma);
```

---

## PHASE 1 COMPLETION — Finance Service (Write these files)

### FILE 6: `services/finance-service/src/services/quotes.service.ts`

The CPQ engine (`cpq/pricing-engine.ts`) already calculates prices — quotes.service persists the result.

Write `createQuotesService(prisma, producer)` with these methods:

```typescript
listQuotes(tenantId: string, filters: { dealId?: string; accountId?: string; status?: QuoteStatus; ownerId?: string }, pagination): Promise<PaginatedResult<Quote>>

getQuoteById(tenantId: string, id: string): Promise<QuoteWithLineItems>
// include: lineItems, deal, account

createQuote(tenantId: string, data: CreateQuoteInput, pricingResult: CpqPricingResult): Promise<Quote>
// persist quote + line items in a single $transaction
// publish TOPICS.QUOTES: { type: 'quote.created', tenantId, payload: { quoteId, dealId, accountId, total } }

updateQuote(tenantId: string, id: string, data: UpdateQuoteInput): Promise<Quote>
// only DRAFT status quotes can be updated
// throw BusinessRuleError if status !== 'DRAFT'

sendQuote(tenantId: string, id: string): Promise<Quote>
// set status = 'SENT', sentAt = now()
// throw BusinessRuleError if not DRAFT
// publish TOPICS.QUOTES: { type: 'quote.sent', tenantId, payload: { quoteId, dealId, accountId, total, recipientEmail } }

acceptQuote(tenantId: string, id: string): Promise<Quote>
// set status = 'ACCEPTED', acceptedAt = now()
// throw BusinessRuleError if not SENT
// publish TOPICS.QUOTES: { type: 'quote.accepted', tenantId, payload: { quoteId, dealId, total } }

rejectQuote(tenantId: string, id: string, reason: string): Promise<Quote>
// set status = 'REJECTED', rejectedAt = now(), rejectionReason = reason
// throw BusinessRuleError if not SENT
// publish TOPICS.QUOTES: { type: 'quote.rejected', ... }

expireQuotes(tenantId: string): Promise<number>
// batch update: set status = 'EXPIRED' where status = 'SENT' AND expiresAt < now()
// returns count of expired quotes

duplicateQuote(tenantId: string, id: string): Promise<Quote>
// create new DRAFT quote copying all line items, bump version to 1
// new quote has name = original.name + ' (Copy)'

voidQuote(tenantId: string, id: string, reason: string): Promise<Quote>
// set status = 'VOID' — only allowed on DRAFT or SENT quotes
// publish TOPICS.QUOTES: { type: 'quote.voided', ... }
```

---

### FILE 7: `services/finance-service/src/routes/quotes.routes.ts`

```
GET    /quotes                  — READ   → listQuotes
POST   /quotes                  — CREATE → createQuote (calls CPQ engine internally: instantiate CpqPricingEngine, run calculate(), pass result to createQuotesService.createQuote)
GET    /quotes/:id              — READ   → getQuoteById
PATCH  /quotes/:id              — UPDATE → updateQuote
POST   /quotes/:id/send         — UPDATE → sendQuote
POST   /quotes/:id/accept       — UPDATE → acceptQuote
POST   /quotes/:id/reject       — UPDATE → rejectQuote (body: { reason: string })
POST   /quotes/:id/duplicate    — CREATE → duplicateQuote
POST   /quotes/:id/void         — UPDATE → voidQuote (body: { reason: string })
GET    /deals/:dealId/quotes    — READ   → listQuotes filtered by dealId
```

---

### FILE 8: `services/finance-service/src/services/commission.service.ts`

Write `createCommissionService(prisma, producer)` — Section 41 of the spec.

The commission calculation logic (accelerators, decelerators, clawbacks):

```typescript
calculateCommission(deal: { amount: number; ownerId: string; pipelineId: string }, plan: CommissionPlan): CommissionResult
// CommissionResult = { base: number; acceleratorBonus: number; spiff: number; clawbackRisk: number; total: number; breakdown: string[] }
// Base = deal.amount * plan.baseRate
// If deal.amount >= plan.acceleratorThreshold: bonus = base * plan.acceleratorMultiplier - base
// SPIFF: check plan.spiffs[] for matching pipelineId/productId conditions
// Clawback risk = base * plan.clawbackRate (returned as a warning amount, not deducted)

recordCommission(tenantId: string, dealId: string, ownerId: string): Promise<CommissionRecord>
// load the deal's won event data
// load the owner's active CommissionPlan for this tenant
// run calculateCommission
// persist CommissionRecord with status = 'PENDING'
// publish TOPICS.COMMISSIONS: { type: 'commission.calculated', tenantId, payload: { ... } }

approveCommission(tenantId: string, commissionId: string): Promise<CommissionRecord>
// set status = 'APPROVED', approvedAt = now()
// publish TOPICS.COMMISSIONS: { type: 'commission.approved', ... }

clawbackCommission(tenantId: string, commissionId: string, reason: string): Promise<CommissionRecord>
// set status = 'CLAWBACK', clawbackReason = reason
// only PAID commissions can be clawed back
// publish TOPICS.COMMISSIONS: { type: 'commission.clawback', ... }

listCommissions(tenantId: string, filters: { ownerId?: string; status?: CommissionStatus; dateFrom?: string; dateTo?: string }, pagination): Promise<PaginatedResult<CommissionRecord>>

getCommissionSummary(tenantId: string, ownerId: string, period: { year: number; quarter?: number }): Promise<{ total: number; paid: number; pending: number; clawbacks: number; acceleratorBonus: number }>
// aggregate from CommissionRecord table for the period
```

---

### FILE 9: `services/finance-service/src/routes/commission.routes.ts`

```
GET    /commissions                   — READ   → listCommissions
GET    /commissions/summary           — READ   → getCommissionSummary (query: ownerId, year, quarter?)
POST   /commissions/:id/approve       — UPDATE → approveCommission  (FINANCE role required)
POST   /commissions/:id/clawback      — UPDATE → clawbackCommission (FINANCE role required, body: { reason })
GET    /deals/:dealId/commission      — READ   → get commission record for a specific won deal
```

Update `services/finance-service/src/routes/index.ts` to register quotes and commission routes.

---

## PHASE 2 — Frontend App Shell (Critical Path — Nothing Else Renders Without This)

### FILE 10: `apps/web/src/components/layout/sidebar.tsx`

A full left-navigation sidebar component. Requirements:
- Uses `next/link` for navigation
- Active state from `usePathname()`
- Nav sections: CRM (Deals, Contacts, Accounts, Leads, Activities), Finance (Quotes, Invoices), Settings
- Collapsed/expanded state stored in `useUIStore` (Zustand, already exists in `stores/ui.store.ts`)
- Shows tenant name + user avatar at the bottom (from `useAuthStore`)
- Keyboard shortcut: `Cmd+B` / `Ctrl+B` toggles collapse
- Each nav item has icon (use `lucide-react`), label, href, optional badge count
- Responsive: auto-collapses below `lg` breakpoint
- Fully typed props, no `any`, no stubs

---

### FILE 11: `apps/web/src/components/layout/topbar.tsx`

Top navigation bar:
- Left: breadcrumb (derive from pathname — "Deals", "Deals / New Deal", etc.)
- Center: global command palette trigger button (opens `Cmd+K` modal — placeholder for now, just a button that shows `⌘K`)
- Right: notifications bell (icon + unread dot placeholder), user menu (avatar + dropdown: Profile, Settings, Sign out)
- User menu calls `useAuthStore.getState().logout()` on Sign out
- Fully responsive

---

### FILE 12: `apps/web/src/components/layout/app-shell.tsx`

The root layout shell that wraps all authenticated pages:
- Renders `<Sidebar />` + `<Topbar />` + `{children}`
- Handles sidebar collapsed/expanded state via CSS transition (width: 240px expanded, 64px collapsed)
- Sets `data-sidebar-collapsed` on root div for CSS targeting
- Mobile: sidebar is a drawer (slides in from left, overlay background)
- `className` prop for content area

---

### FILE 13: `apps/web/src/app/(dashboard)/layout.tsx`

The Next.js layout that uses `AppShell`:
```tsx
import { AppShell } from '@/components/layout/app-shell';
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
```
Move existing deals pages under this route group if they aren't already.

---

### FILE 14: `apps/web/src/app/(dashboard)/contacts/page.tsx`

Full contacts list page. Requirements:
- Table view with columns: Name, Company, Email, Phone, Account, Owner, Created
- Filters: search (name/email), accountId, ownerId
- Sort by name, email, createdAt
- Pagination (use existing `use-contacts.ts` hook — extend it if needed)
- "+ New Contact" button opens a slide-over form (inline, not a separate page)
- Click row → opens contact detail slide-over showing: info fields + linked deals table + activity timeline
- All data from React Query hooks, no local fetch
- Optimistic delete with confirmation dialog

---

### FILE 15: `apps/web/src/app/(dashboard)/accounts/page.tsx`

Full accounts list page (mirror contacts page structure):
- Columns: Name, Industry, ARR, Tier, Owner, Open Deals count, Created
- Filter by: industry, tier, ownerId, search
- Click row → account detail: info + contacts tab + deals tab + activity timeline
- Uses `use-accounts.ts` which already has 285 lines — use as-is

---

### FILE 16: `apps/web/src/app/(dashboard)/leads/page.tsx`

Leads list with Kanban-style status columns (NEW → CONTACTED → QUALIFIED → CONVERTED/DISQUALIFIED):
- Toggle between table view and kanban view (stored in `useUIStore`)
- Kanban: drag lead cards between status columns — calls PATCH `/leads/:id/status`
- Table: columns: Name, Company, Score (with color indicator), Status, Source, Owner, Created
- "Convert Lead" button on each row → confirmation modal → POST `/leads/:id/convert`
- Uses `use-leads.ts` hook (write this hook too — see pattern in `use-deals.ts`)

---

### FILE 17: `apps/web/src/hooks/use-leads.ts`

Mirror `use-deals.ts` exactly. Include:
- `useLeads(filters, pagination)` — list with filters
- `useLead(id)` — single lead
- `useCreateLead()` — mutation
- `useUpdateLead()` — mutation
- `useDeleteLead()` — mutation + optimistic remove from list
- `useConvertLead()` — mutation: POST `/leads/:id/convert`
- `useUpdateLeadStatus()` — mutation: PATCH `/leads/:id/status` with optimistic update

---

### FILE 18: `apps/web/src/app/(dashboard)/activities/page.tsx`

Activities page — unified activity feed across all entities:
- Tabs: All | My Activities | Overdue | Upcoming (next 7 days)
- Table: Subject, Type (icon), Due Date (red if overdue), Priority (badge), Related To (linked to deal/contact/lead), Owner, Status
- Inline "Complete" button → fires `useCompleteActivity()` mutation with outcome input
- "+ Schedule Activity" button → slide-over form (type, subject, dueDate, priority, relatedTo linkage)
- Write `apps/web/src/hooks/use-activities.ts` alongside this file

---

### FILE 19: `apps/web/src/hooks/use-activities.ts`

```typescript
useActivities(filters, pagination) — list
useActivity(id) — single
useCreateActivity() — mutation
useUpdateActivity() — mutation
useDeleteActivity() — mutation + optimistic remove
useCompleteActivity() — mutation: POST /activities/:id/complete, body: { outcome }
useRescheduleActivity() — mutation: PATCH /activities/:id/reschedule, body: { dueDate }
useDealActivities(dealId, pagination) — activities for a specific deal
```

---

## PHASE 2 — Notification Service (Scaffold + Core Logic)

### FILE 20: `services/notification-service/src/index.ts`

Create the full notification service scaffold. This service listens to Kafka events and sends notifications.

Directory structure to create:
```
services/notification-service/
  src/
    index.ts                     — service bootstrap
    consumers/
      deal.consumer.ts           — handles deal.won, deal.lost, deal.stage_changed
      activity.consumer.ts       — handles activity.created (overdue reminder logic), activity.completed
      quote.consumer.ts          — handles quote.sent, quote.accepted, quote.rejected
    channels/
      email.channel.ts           — sends via SMTP/SendGrid (env-configured)
      in-app.channel.ts          — writes to DB notification table
    services/
      notifications.service.ts   — listNotifications, markAsRead, markAllRead, getUnreadCount
    routes/
      notifications.routes.ts    — GET /notifications, PATCH /notifications/:id/read, POST /notifications/read-all
    prisma.ts                    — createNotificationPrisma() with tenantId RLS middleware
  prisma/
    schema.prisma                — Notification model (id, tenantId, userId, type, title, body, entityType, entityId, isRead, readAt, createdAt)
  package.json
  tsconfig.json
```

`deal.consumer.ts` must:
- Subscribe to TOPICS.DEALS Kafka topic
- On `deal.won`: create in-app notification for deal owner ("🎉 Deal won: {dealName}")
- On `deal.lost`: create in-app notification for deal owner + manager
- On `deal.stage_changed`: create in-app notification if deal has been in stage > rottenDays (check against CRM service via REST GET /deals/:id)

`email.channel.ts` must:
- Use nodemailer with SMTP transport (env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS)
- Fall back gracefully if SMTP not configured (log warning, skip send)
- HTML email templates as template literals (professional look)

`notifications.routes.ts` — full CRUD as listed above plus WebSocket push (placeholder comment for now — realtime comes in a later phase)

---

## PHASE 2 — Infrastructure

### FILE 21: `services/crm-service/Dockerfile`

Multi-stage build. Use this exact pattern:
```dockerfile
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/ ./packages/
COPY services/crm-service/package.json ./services/crm-service/
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY services/crm-service ./services/crm-service
COPY packages ./packages
WORKDIR /app/services/crm-service
RUN pnpm prisma generate --schema=./prisma/schema.prisma
RUN pnpm build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nexus
COPY --from=builder --chown=nexus:nodejs /app/services/crm-service/dist ./dist
COPY --from=builder --chown=nexus:nodejs /app/node_modules/.prisma/crm-client ./node_modules/.prisma/crm-client
COPY --from=builder --chown=nexus:nodejs /app/node_modules/@prisma ./node_modules/@prisma
USER nexus
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

Write identical Dockerfiles for: `auth-service` (EXPOSE 3000), `finance-service` (EXPOSE 3002), `notification-service` (EXPOSE 3003).

---

### FILE 22: `docker-compose.yml` (root of monorepo)

Write the complete docker-compose file with ALL of these services:

**Infrastructure services:**
- `postgres` — image: postgres:16-alpine, ports: 5432:5432, env: POSTGRES_PASSWORD=nexus, POSTGRES_DB=nexus, volumes: postgres_data:/var/lib/postgresql/data + ./infrastructure/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql
- `redis` — image: redis:7-alpine, ports: 6379:6379, command: redis-server --requirepass nexus
- `kafka` — image: confluentinc/cp-kafka:7.6.0, depends on: zookeeper, ports: 9092:9092
- `zookeeper` — image: confluentinc/cp-zookeeper:7.6.0
- `meilisearch` — image: getmeili/meilisearch:v1.8, ports: 7700:7700, env: MEILI_MASTER_KEY=nexus-dev
- `minio` — image: minio/minio:latest, ports: 9000:9000, 9001:9001, command: server /data --console-address ":9001"
- `keycloak` — image: quay.io/keycloak/keycloak:24.0, ports: 8080:8080, env: KEYCLOAK_ADMIN=admin, KEYCLOAK_ADMIN_PASSWORD=admin

**App services:**
- `auth-service` — build: ./services/auth-service, ports: 3000:3000, env_file: ./services/auth-service/.env, depends_on: [postgres, keycloak, redis]
- `crm-service` — build: ./services/crm-service, ports: 3001:3001, env_file: ./services/crm-service/.env, depends_on: [postgres, kafka]
- `finance-service` — build: ./services/finance-service, ports: 3002:3002, env_file: ./services/finance-service/.env, depends_on: [postgres, kafka]
- `notification-service` — build: ./services/notification-service, ports: 3003:3003, env_file: ./services/notification-service/.env, depends_on: [postgres, kafka]
- `web` — build: ./apps/web, ports: 3000:3000 → map to 3100:3000, env_file: ./apps/web/.env.local

**Volume declarations:** postgres_data, redis_data, minio_data, kafka_data, zookeeper_data

---

### FILE 23: `infrastructure/postgres/init.sql`

Write the PostgreSQL initialization script:
```sql
-- Create one database per service
CREATE DATABASE nexus_auth;
CREATE DATABASE nexus_crm;
CREATE DATABASE nexus_finance;
CREATE DATABASE nexus_notifications;

-- Enable Row Level Security extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Grant all to the nexus user
GRANT ALL PRIVILEGES ON DATABASE nexus_auth TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_crm TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_finance TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_notifications TO nexus;
```

---

## PHASE 2 — Unit Tests (Core Business Logic)

### FILE 24: `services/crm-service/src/services/__tests__/deals.service.test.ts`

Write comprehensive unit tests using Vitest + `@prisma/client/testing` mock helpers.

Test all 15 methods. Key test cases:
```typescript
describe('createDeal', () => {
  it('throws NotFoundError when accountId not in tenant')
  it('throws BusinessRuleError when stage not in pipeline')
  it('publishes deal.created Kafka event on success')
  it('sets probability from stage default when not provided')
  it('links contact IDs via DealContact create')
})

describe('markDealWon', () => {
  it('throws BusinessRuleError when deal is LOST')
  it('sets status=WON, probability=100, actualCloseDate')
  it('publishes deal.won with correct payload')
  it('is idempotent when already WON')
})

describe('moveDealToStage', () => {
  it('throws BusinessRuleError when stage is in different pipeline')
  it('publishes deal.stage_changed with previousStageId and newStageId')
  it('returns existing deal unchanged when stageId is the same')
})

describe('getDealTimeline', () => {
  it('merges activities and notes sorted newest-first')
  it('paginates correctly')
})
```

Use `vi.fn()` for Prisma mock and `vi.fn()` for producer mock. No actual DB connections.

---

### FILE 25: `services/finance-service/src/cpq/__tests__/pricing-engine.test.ts`

Test the 10-rule waterfall:
```typescript
describe('CpqPricingEngine.calculate', () => {
  it('applies STRATEGIC tier 25% discount')
  it('selects correct volume tier for given quantity')
  it('applies bundle discount when all required products in cart')
  it('promo code: skips expired promos')
  it('promo code: skips promos that exceeded maxUses')
  it('competitive override: only applies if deeper than accumulated discount')
  it('floor price: clamps working price up and adds warning')
  it('non-standard override: sets approvalRequired=true')
  it('NET_0 payment terms: applies 2% early payment discount')
  it('BOGO: appends free line items for floor(qty/2) units')
  it('throws NotFoundError for inactive product')
  it('uses decimal.js — no floating point errors on 0.1 + 0.2')
})
```

---

## ANTI-STUB CHECKLIST (verify before finishing each file)

Before you consider any file "done", scan it yourself:

- [ ] Zero `TODO` comments
- [ ] Zero `// implement later` or similar
- [ ] Zero `throw new Error('not implemented')`
- [ ] Zero `return {} as any`
- [ ] Zero abbreviated sections (`// ... rest of implementation`)
- [ ] Every function body has real logic (not just a return statement returning an empty value)
- [ ] Every Kafka publish call has the correct `type` string and full `payload`
- [ ] Every `createXxxService` factory returns an object with ALL the methods listed
- [ ] Every route handler calls `Zod.safeParse` on body/query before using values
- [ ] Every DB query includes `tenantId` in the where clause

---

## FILE ORDER (work top to bottom, do not skip)

1. `services/crm-service/src/services/activities.service.ts`
2. `services/crm-service/src/routes/activities.routes.ts`
3. `services/crm-service/src/services/notes.service.ts`
4. `services/crm-service/src/routes/notes.routes.ts`
5. `services/crm-service/src/routes/index.ts` (update only)
6. `services/finance-service/src/services/quotes.service.ts`
7. `services/finance-service/src/routes/quotes.routes.ts`
8. `services/finance-service/src/services/commission.service.ts`
9. `services/finance-service/src/routes/commission.routes.ts`
10. `services/finance-service/src/routes/index.ts` (update only)
11. `apps/web/src/components/layout/sidebar.tsx`
12. `apps/web/src/components/layout/topbar.tsx`
13. `apps/web/src/components/layout/app-shell.tsx`
14. `apps/web/src/app/(dashboard)/layout.tsx`
15. `apps/web/src/hooks/use-leads.ts`
16. `apps/web/src/app/(dashboard)/leads/page.tsx`
17. `apps/web/src/hooks/use-activities.ts`
18. `apps/web/src/app/(dashboard)/activities/page.tsx`
19. `apps/web/src/app/(dashboard)/contacts/page.tsx`
20. `apps/web/src/app/(dashboard)/accounts/page.tsx`
21. `services/notification-service/prisma/schema.prisma`
22. `services/notification-service/src/prisma.ts`
23. `services/notification-service/src/channels/email.channel.ts`
24. `services/notification-service/src/channels/in-app.channel.ts`
25. `services/notification-service/src/consumers/deal.consumer.ts`
26. `services/notification-service/src/consumers/activity.consumer.ts`
27. `services/notification-service/src/services/notifications.service.ts`
28. `services/notification-service/src/routes/notifications.routes.ts`
29. `services/notification-service/src/index.ts`
30. `services/auth-service/Dockerfile`
31. `services/crm-service/Dockerfile`
32. `services/finance-service/Dockerfile`
33. `services/notification-service/Dockerfile`
34. `docker-compose.yml`
35. `infrastructure/postgres/init.sql`
36. `services/crm-service/src/services/__tests__/deals.service.test.ts`
37. `services/finance-service/src/cpq/__tests__/pricing-engine.test.ts`

---

## SESSION CONTINUITY RULE

If Cursor cuts you off mid-file, your very next message should be:
```
Continue from exactly where you left off. Complete the current file fully before moving to the next one. Do not summarize what was written — just continue the code from the last line.
```

Do not move to the next file until the current file passes the anti-stub checklist above.

---

*Generated: 2026-04-23 | Target: Phase 1 completion + Phase 2 start | Est. new LOC: ~12,000–18,000*
