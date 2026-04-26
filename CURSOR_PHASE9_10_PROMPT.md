# NEXUS CRM — Phase 9 + Phase 10 Cursor Prompt
## Calendar / Email / Maps + Cadence Engine + Territory Management

**Estimated LOC:** ~9,500  
**Services added:** cadence-service (port 3018), territory-service (port 3019)  
**Services extended:** integration-service, crm-service, comm-service, frontend

---

## RULES — READ FIRST

- Never truncate a file. Every function must be fully implemented.
- Run `pnpm tsc --noEmit` after each section and fix all errors before proceeding.
- All monetary values: `decimal.js`. All datetimes: ISO strings or `Date` objects.
- New Prisma schemas: `generator client { output = "../../../node_modules/.prisma/<name>-client" }`.
- New services: standard Fastify pattern (JWT auth via `@nexus/service-utils`, Kafka via `@nexus/kafka`).
- When a file is described with a code block, write the file EXACTLY as shown.
- Install packages needed with `pnpm add <pkg> --filter @nexus/<service>`.

---

## SECTION 1 — Phase 9: Calendar, Email Inbox & Maps

### 1A: CRM Schema additions

Add to `services/crm-service/prisma/schema.prisma`:

```prisma
model EmailThread {
  id           String    @id @default(cuid())
  tenantId     String
  contactId    String?
  contact      Contact?  @relation(fields: [contactId], references: [id])
  accountId    String?
  account      Account?  @relation(fields: [accountId], references: [id])
  externalId   String    // Gmail thread ID or Outlook conversation ID
  subject      String
  provider     String    // 'gmail' | 'outlook'
  lastMessageAt DateTime @default(now())
  messageCount Int       @default(1)
  isRead       Boolean   @default(false)
  snippet      String?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  messages     EmailMessage[]

  @@unique([tenantId, provider, externalId])
  @@index([tenantId, contactId])
  @@index([tenantId, accountId])
}

model EmailMessage {
  id         String      @id @default(cuid())
  threadId   String
  thread     EmailThread @relation(fields: [threadId], references: [id], onDelete: Cascade)
  externalId String
  fromEmail  String
  toEmails   String[]
  ccEmails   String[]
  subject    String
  bodyHtml   String?
  bodyText   String?
  sentAt     DateTime
  direction  String      // 'inbound' | 'outbound'
  createdAt  DateTime    @default(now())

  @@index([threadId])
}
```

Also add `lat Float?` and `lng Float?` fields to the `Account` model.

Add `emailThreads EmailThread[]` relation to both `Contact` and `Account` models.

Run `cd services/crm-service && npx prisma generate && npx prisma migrate dev --name add_email_threads_geo`.

### 1B: Integration-service — OAuth + Calendar + Email sync

Extend `services/integration-service/prisma/schema.prisma` with these models (add to existing schema):

```prisma
model OAuthConnection {
  id           String   @id @default(cuid())
  tenantId     String
  userId       String
  provider     String   // 'google' | 'microsoft'
  scope        String   // 'calendar' | 'email' | 'calendar,email'
  accessToken  String   // AES-256 encrypted
  refreshToken String?  // AES-256 encrypted
  expiresAt    DateTime?
  email        String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@unique([tenantId, userId, provider, scope])
  @@index([tenantId, userId])
}

model SyncedCalendarEvent {
  id          String   @id @default(cuid())
  tenantId    String
  activityId  String   @unique
  provider    String
  externalId  String
  etag        String?
  syncedAt    DateTime @default(now())

  @@index([tenantId])
}

model GeocodedAccount {
  id        String   @id @default(cuid())
  tenantId  String
  accountId String   @unique
  lat       Float
  lng       Float
  geocodedAt DateTime @default(now())

  @@index([tenantId])
}
```

Run `cd services/integration-service && npx prisma generate && npx prisma migrate dev --name add_oauth_calendar_geo`.

#### New routes in `services/integration-service/src/routes/`:

**`oauth.routes.ts`** — OAuth2 connection management:
```
GET  /api/v1/integrations/oauth/:provider/connect   → redirect to Google/Microsoft OAuth
GET  /api/v1/integrations/oauth/:provider/callback  → exchange code, store encrypted tokens
GET  /api/v1/integrations/oauth/connections          → list user's connections
DELETE /api/v1/integrations/oauth/:provider         → revoke connection
```

For Google: use `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` env vars.  
For Microsoft: use `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_REDIRECT_URI` env vars.  
Encrypt tokens with AES-256-GCM using `INTEGRATION_ENCRYPTION_KEY` env var (via Node.js `crypto` module).

**`calendar.routes.ts`**:
```
GET  /api/v1/integrations/calendar/events?start=&end=   → list synced calendar events for date range
POST /api/v1/integrations/calendar/sync                 → trigger manual full sync
```

**`email.routes.ts`**:
```
GET  /api/v1/integrations/email/threads?contactId=&page=&limit=  → list email threads for contact
GET  /api/v1/integrations/email/threads/:id                       → get thread with messages
POST /api/v1/integrations/email/send                              → send email via connected account
```

#### New services in `services/integration-service/src/services/`:

**`google-calendar.service.ts`**:
- `syncGoogleCalendar(tenantId, userId)` — fetches events from Google Calendar API (`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=<30d ago>&maxResults=250`), for each event checks if there's a CRM activity with matching `externalId`, creates `SyncedCalendarEvent` records
- `pushCrmActivityToGoogle(tenantId, userId, activity)` — creates or updates a Google Calendar event from a CRM Activity; stores `SyncedCalendarEvent`
- `handleGoogleCalendarWebhook(payload)` — processes Google Calendar push notifications; updates CRM activity if event was changed

**`google-gmail.service.ts`**:
- `syncGmailThreads(tenantId, userId)` — fetches recent threads from Gmail API, matches to CRM contacts by email address, stores `EmailThread` + `EmailMessage` records in crm-service via internal API call
- `sendEmail(tenantId, userId, to, subject, body, threadId?)` — sends email via Gmail API using stored credentials
- `watchGmail(tenantId, userId)` — sets up Gmail push notifications via `watch()` API

**`geocoding.service.ts`**:
- `geocodeAccount(tenantId, accountId, address)` — calls Google Maps Geocoding API (`https://maps.googleapis.com/maps/api/geocode/json?address=<address>&key=MAPS_API_KEY`), stores lat/lng in crm-service via internal API PATCH
- `processGeoQueue()` — background job, picks up accounts with no lat/lng and geocodes them in batches of 10

#### Kafka consumer in integration-service:

Listen for `activity.created` and `activity.updated` events → push to Google Calendar for users with a connected Google account.

Listen for `account.created` and `account.updated` events → queue geocoding.

### 1C: Frontend — Activities Calendar View

Install: `pnpm add react-big-calendar date-fns --filter @nexus/web`

Update `apps/web/src/app/(dashboard)/activities/page.tsx`:

Add a "List / Calendar" toggle in the page header (list icon vs. calendar icon). When Calendar mode is active, render:

```tsx
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import 'react-big-calendar/lib/css/react-big-calendar.css';

const locales = { 'en-US': require('date-fns/locale/en-US') };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });
```

The calendar shows activities as events — colour-coded by type (CALL=blue, EMAIL=green, MEETING=purple, TASK=yellow, DEMO=orange). Click on an event opens the existing activity detail slide-over. Drag an event to a new time calls `PATCH /api/v1/activities/:id` with the new `dueDate`.

### 1D: Frontend — Email threads tab in Contact/Account detail

In `apps/web/src/app/(dashboard)/contacts/[id]/page.tsx`, add an "Emails" tab (6th tab):

```tsx
// useEmailThreads hook
function useEmailThreads(contactId: string) {
  return useQuery({
    queryKey: ['contact-emails', contactId],
    queryFn: () => api.get<{ data: EmailThread[] }>(`/contacts/${contactId}/email-threads`),
  });
}
```

Render a thread list. Each thread shows: subject, snippet, last message date, unread badge. Click to expand all messages in the thread as a conversation (newest-first bubble layout). "Reply" button opens a compose modal.

Add `GET /contacts/:id/email-threads` route to `services/crm-service/src/routes/contacts.routes.ts` — queries `EmailThread` records linked to the contact.

Apply same pattern to `accounts/[id]/page.tsx`.

### 1E: Frontend — Account Map View

Install: `pnpm add @react-google-maps/api --filter @nexus/web`

In `apps/web/src/app/(dashboard)/accounts/page.tsx`, add a "List / Map" view toggle.

When Map view is active, render a Google Map (`APIProvider` from `@vis.gl/react-google-maps`) centred on the mean lat/lng of all visible accounts. Render a `Marker` for each account that has lat/lng. Marker colour: green=ACTIVE, amber=AT_RISK, red=CHURNED. Click a marker shows an `InfoWindow` with account name, industry, annual revenue, and a link to the account detail page.

Use `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` env var.

### 1F: Meeting Scheduler Page (Public)

Create `apps/web/src/app/schedule/[repSlug]/page.tsx`:

A public-facing page (no auth required) that shows a rep's available time slots for the next 14 days. The rep slug maps to their userId via a public API endpoint `GET /api/v1/users/:slug/availability`. The page shows a date picker and time slot grid. Customer fills in name + email, clicks a slot → calls `POST /api/v1/activities` to create a MEETING activity and `POST /api/v1/integrations/calendar/events` to create the calendar event.

---

## SECTION 2 — Phase 10: Cadence Engine + Territory Management

### 2A: New service — `services/cadence-service/` (port 3018)

```
services/cadence-service/
├── package.json
├── tsconfig.json
├── prisma/
│   └── schema.prisma
└── src/
    ├── index.ts
    ├── prisma.ts
    ├── routes/
    │   ├── cadences.routes.ts
    │   └── enrollments.routes.ts
    └── services/
        ├── cadences.service.ts
        ├── enrollments.service.ts
        └── queue.service.ts
```

#### `services/cadence-service/package.json`
```json
{
  "name": "@nexus/cadence-service",
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

#### `services/cadence-service/prisma/schema.prisma`
```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../../../node_modules/.prisma/cadence-client"
}

datasource db {
  provider = "postgresql"
  url      = env("CADENCE_DATABASE_URL")
}

model CadenceTemplate {
  id          String              @id @default(cuid())
  tenantId    String
  name        String
  description String?
  objectType  ObjectType          @default(CONTACT)
  isActive    Boolean             @default(true)
  exitOnReply Boolean             @default(true)
  exitOnMeeting Boolean           @default(true)
  createdAt   DateTime            @default(now())
  updatedAt   DateTime            @updatedAt
  steps       CadenceStep[]
  enrollments CadenceEnrollment[]

  @@index([tenantId])
}

model CadenceStep {
  id           String          @id @default(cuid())
  cadenceId    String
  cadence      CadenceTemplate @relation(fields: [cadenceId], references: [id], onDelete: Cascade)
  position     Int
  type         StepType
  delayDays    Int             @default(0)
  subject      String?
  body         String?
  taskTitle    String?
  variantB     Json?           // Optional B variant: { subject, body }
  createdAt    DateTime        @default(now())

  @@index([cadenceId])
}

model CadenceEnrollment {
  id          String              @id @default(cuid())
  tenantId    String
  cadenceId   String
  cadence     CadenceTemplate     @relation(fields: [cadenceId], references: [id])
  objectType  ObjectType
  objectId    String
  ownerId     String
  status      EnrollmentStatus    @default(ACTIVE)
  currentStep Int                 @default(0)
  enrolledAt  DateTime            @default(now())
  exitReason  String?
  exitedAt    DateTime?
  executions  StepExecution[]

  @@unique([tenantId, cadenceId, objectId])
  @@index([tenantId, status])
}

model StepExecution {
  id           String             @id @default(cuid())
  enrollmentId String
  enrollment   CadenceEnrollment  @relation(fields: [enrollmentId], references: [id], onDelete: Cascade)
  stepPosition Int
  stepType     StepType
  status       ExecutionStatus    @default(PENDING)
  scheduledAt  DateTime
  executedAt   DateTime?
  result       String?
  variant      String             @default("A")
  createdAt    DateTime           @default(now())

  @@index([enrollmentId])
  @@index([status, scheduledAt])
}

enum ObjectType {
  CONTACT
  LEAD
}

enum StepType {
  EMAIL
  CALL_TASK
  LINKEDIN_TASK
  SMS
  WAIT
}

enum EnrollmentStatus {
  ACTIVE
  PAUSED
  COMPLETED
  EXITED
}

enum ExecutionStatus {
  PENDING
  EXECUTED
  SKIPPED
  FAILED
}
```

#### `services/cadence-service/src/services/cadences.service.ts`

Implement `createCadencesService(prisma)` returning:
- `listCadences(tenantId)` — list all cadence templates with step count
- `getCadence(tenantId, id)` — get cadence with all steps ordered by position
- `createCadence(tenantId, input)` — create template + steps in a transaction
- `updateCadence(tenantId, id, input)` — update template metadata
- `deleteCadence(tenantId, id)` — soft-delete (set isActive=false)
- `getAnalytics(tenantId, cadenceId)` — return per-step stats:
  - Total enrollments ever
  - Completion rate (reached step / enrolled)
  - Exit rate per step
  - For EMAIL steps: executions count (proxy for "sent")

#### `services/cadence-service/src/services/enrollments.service.ts`

Implement `createEnrollmentsService(prisma, producer)` returning:
- `enroll(tenantId, cadenceId, objectType, objectId, ownerId)` — creates CadenceEnrollment (throws if already enrolled and ACTIVE), creates first StepExecution scheduled for `now() + step.delayDays days`
- `listEnrollments(tenantId, cadenceId?, objectId?, status?, page, limit)` — paginated
- `pauseEnrollment(tenantId, enrollmentId)` — set status=PAUSED
- `resumeEnrollment(tenantId, enrollmentId)` — set status=ACTIVE, reschedule next step from now
- `exitEnrollment(tenantId, enrollmentId, reason)` — set status=EXITED, exitReason, exitedAt

#### `services/cadence-service/src/services/queue.service.ts`

Implement `createQueueService(prisma, producer)` returning:
- `processQueue()` — finds all StepExecutions where `status=PENDING` and `scheduledAt <= now()`:
  - For each execution:
    - Fetch enrollment + cadence step
    - If enrollment is not ACTIVE → skip (mark SKIPPED)
    - Execute the step:
      - `EMAIL`: POST to `COMM_SERVICE_URL/api/v1/emails` with the step subject+body (variant A or B based on enrollment index % 2)
      - `CALL_TASK` / `LINKEDIN_TASK`: POST to `CRM_SERVICE_URL/api/v1/activities` to create a TASK
      - `SMS`: log as skipped (SMS provider not yet integrated)
      - `WAIT`: mark as EXECUTED immediately
    - Mark execution as EXECUTED
    - Schedule next step: create StepExecution for step at position+1 with scheduledAt = now() + nextStep.delayDays days
    - If no more steps: set enrollment status=COMPLETED
- `startQueueWorker()` — calls `processQueue()` every 5 minutes via `setInterval`

#### Routes:

**`src/routes/cadences.routes.ts`**
```
GET    /api/v1/cadences
POST   /api/v1/cadences
GET    /api/v1/cadences/:id
PATCH  /api/v1/cadences/:id
DELETE /api/v1/cadences/:id
GET    /api/v1/cadences/:id/analytics
```

**`src/routes/enrollments.routes.ts`**
```
GET    /api/v1/enrollments?cadenceId=&objectId=&status=&page=&limit=
POST   /api/v1/enrollments               — body: { cadenceId, objectType, objectId, ownerId }
POST   /api/v1/enrollments/:id/pause
POST   /api/v1/enrollments/:id/resume
POST   /api/v1/enrollments/:id/exit      — body: { reason }
```

#### Kafka consumer in cadence-service:

Listen for `activity.completed` where `payload.type = 'MEETING'` → call `exitEnrollment` for any ACTIVE enrollment where `objectId = payload.contactId`.

#### `src/index.ts`
Standard Fastify setup on port 3018. Start queue worker after server starts.

---

### 2B: Frontend — Cadence Builder

Create `apps/web/src/app/(dashboard)/cadences/page.tsx`:

**Three tabs:**

1. **Templates** — list cadence templates with: Name, Object Type, Step Count, Enrollment Count, Status badges. "New Cadence" button opens the builder.

2. **Cadence Builder** (modal or slide-over):
   - Name + Description inputs
   - Object Type selector (Contact / Lead)
   - Toggle: Exit on reply | Exit on meeting booked
   - Step list (drag to reorder via `@dnd-kit/sortable`):
     - Each step: Type selector, Delay Days input, subject/body fields (for EMAIL), task title (for CALL_TASK/LINKEDIN_TASK)
     - "Add step" button
     - "Add B variant" toggle on EMAIL steps (shows second subject/body)
   - Save button

3. **Active Enrollments** — table showing: Object (name+link), Cadence, Current Step, Status, Enrolled At. Filter by cadence. "Exit" action per row.

Add "Cadences" nav item to the sidebar.

Also: In `apps/web/src/app/(dashboard)/contacts/[id]/page.tsx`, add a "Enroll in Cadence" button that opens a cadence picker modal and calls `POST /api/v1/enrollments`.

---

### 2C: New service — `services/territory-service/` (port 3019)

```
services/territory-service/
├── package.json
├── tsconfig.json
├── prisma/
│   └── schema.prisma
└── src/
    ├── index.ts
    ├── prisma.ts
    ├── routes/
    │   └── territories.routes.ts
    └── services/
        └── territories.service.ts
```

#### `services/territory-service/package.json`
```json
{
  "name": "@nexus/territory-service",
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

#### `services/territory-service/prisma/schema.prisma`
```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../../../node_modules/.prisma/territory-client"
}

datasource db {
  provider = "postgresql"
  url      = env("TERRITORY_DATABASE_URL")
}

model Territory {
  id          String          @id @default(cuid())
  tenantId    String
  name        String
  description String?
  type        TerritoryType   @default(GEOGRAPHIC)
  ownerIds    String[]
  teamId      String?
  priority    Int             @default(0)
  isActive    Boolean         @default(true)
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt
  rules       TerritoryRule[]
  routingLogs LeadRoutingLog[]

  @@index([tenantId])
}

model TerritoryRule {
  id          String    @id @default(cuid())
  territoryId String
  territory   Territory @relation(fields: [territoryId], references: [id], onDelete: Cascade)
  field       String    // e.g. 'country', 'industry', 'annualRevenue'
  operator    String    // 'eq' | 'neq' | 'contains' | 'gte' | 'lte' | 'in'
  value       String    // stored as string; numeric values compared after parseFloat
  createdAt   DateTime  @default(now())
}

model LeadRoutingLog {
  id                String    @id @default(cuid())
  tenantId          String
  leadId            String
  matchedTerritoryId String?
  territory         Territory? @relation(fields: [matchedTerritoryId], references: [id])
  assignedOwnerId   String?
  routedAt          DateTime  @default(now())

  @@index([tenantId, leadId])
}

model RoundRobinState {
  id          String   @id @default(cuid())
  tenantId    String
  territoryId String
  lastIndex   Int      @default(0)
  updatedAt   DateTime @updatedAt

  @@unique([tenantId, territoryId])
}

enum TerritoryType {
  GEOGRAPHIC
  INDUSTRY
  ACCOUNT_SIZE
  CUSTOM
}
```

#### `services/territory-service/src/services/territories.service.ts`

Implement `createTerritoriesService(prisma, producer)` returning:
- `listTerritories(tenantId)` — list active territories with rule count
- `getTerritory(tenantId, id)` — get with rules
- `createTerritory(tenantId, input)` — create territory + rules in transaction
- `updateTerritory(tenantId, id, input)` — update territory metadata + replace rules
- `deleteTerritory(tenantId, id)` — set isActive=false
- `assignLead(tenantId, leadData)` — rule matching engine:
  - Fetch all active territories with rules
  - For each territory, evaluate all rules against leadData (AND logic — all rules must match)
  - Rule evaluation: `eq` (strict equals), `neq` (not equals), `contains` (string includes), `gte`/`lte` (numeric), `in` (value in comma-separated list)
  - Return first matching territory (ordered by `priority` desc)
  - If matched territory has multiple ownerIds → round-robin via RoundRobinState
  - Log the routing decision to `LeadRoutingLog`
  - Return `{ territory, assignedOwnerId }` or null if no match
- `testAssignment(tenantId, leadData)` — same as assignLead but does NOT write to DB — dry-run for UI testing tool
- `getRoutingLogs(tenantId, leadId?, page, limit)` — paginated routing history

#### Kafka consumer in territory-service:

Listen for `lead.created` events. Call `assignLead` with the lead data. If matched, call `PATCH CRM_SERVICE_URL/api/v1/leads/:id` with `{ ownerId: assignedOwnerId }`.

#### Routes:

**`src/routes/territories.routes.ts`**
```
GET    /api/v1/territories
POST   /api/v1/territories
GET    /api/v1/territories/:id
PATCH  /api/v1/territories/:id
DELETE /api/v1/territories/:id
POST   /api/v1/territories/test-assignment   — body: lead-like object → returns matched territory
GET    /api/v1/territories/routing-logs?leadId=&page=&limit=
```

#### `src/index.ts`
Standard Fastify setup on port 3019. Start Kafka consumer for `lead.created` events.

---

### 2D: Frontend — Territory Management

Create `apps/web/src/app/(dashboard)/territories/page.tsx`:

**Two sections:**

**Territory List:**
- Each territory card shows: Name, Type badge, Rule count, Owner(s), Priority
- "Add Territory" button → opens create/edit slide-over
- Slide-over form:
  - Name, Description, Type (Geographic/Industry/Account Size/Custom)
  - Owner(s) — multi-user picker
  - Priority (number input — higher = evaluated first)
  - Rules builder — table of rules:
    - Field dropdown (Country, Industry, Annual Revenue, Employee Count, Source, City, Custom)
    - Operator dropdown (equals, not equals, contains, ≥, ≤, in list)
    - Value input
    - Add/remove rows

**Assignment Tester:**
- Input form mirroring a Lead's key fields (company, industry, country, annualRevenue)
- "Test" button → calls `POST /api/v1/territories/test-assignment`
- Shows: matched territory name + assigned owner, or "No match — will be assigned to default owner"

Add "Territories" nav item to the sidebar under a "Settings" section.

---

## SECTION 3 — Environment Variables

Add to `.env.example`:

```env
# integration-service
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3012/api/v1/integrations/oauth/google/callback
GOOGLE_MAPS_API_KEY=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_REDIRECT_URI=http://localhost:3012/api/v1/integrations/oauth/microsoft/callback
INTEGRATION_ENCRYPTION_KEY=32-char-random-string-here
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=

# cadence-service
CADENCE_DATABASE_URL=postgresql://nexus:nexus@localhost:5432/nexus_cadence
COMM_SERVICE_URL=http://localhost:3009
PORT=3018

# territory-service
TERRITORY_DATABASE_URL=postgresql://nexus:nexus@localhost:5432/nexus_territory
PORT=3019
```

---

## SECTION 4 — Final Verification

```bash
# Type check
pnpm tsc --noEmit

# Generate Prisma clients
cd services/cadence-service && npx prisma generate
cd services/territory-service && npx prisma generate

# Verify new routes exist
grep -r "enrollments\|territories\|cadences" services/cadence-service/src/routes/
grep -r "territories" services/territory-service/src/routes/

# Verify Kafka consumers registered
grep -r "lead.created\|activity.completed" services/cadence-service/src/ services/territory-service/src/
```

**Services count after this phase: 20 microservices**
