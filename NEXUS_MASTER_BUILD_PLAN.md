# NEXUS CRM — Master Build Plan
**Last updated:** Phase 4 complete (~32,689 LOC across 11 services)

---

## SECTION 1 — HONEST GAP ANALYSIS (Current State)

### What is fully built ✅

| Area | Backend | Frontend | Quality |
|------|---------|----------|---------|
| Deal management | ✅ Full (740 LOC service) | ✅ Deal detail 1,785 LOC, kanban board | Strong |
| Lead management | ✅ Full (372 LOC, UTM, GDPR, score) | ✅ List page 406 LOC | Strong |
| Activities | ✅ Full (441 LOC, 7 types, linked to all entities) | ✅ List page 523 LOC | Good |
| Contact CRUD | ✅ Full (217 LOC) | ✅ List page 599 LOC | Good |
| Account CRUD | ✅ Full (375 LOC, hierarchy, health, NPS) | ✅ List page 361 LOC | Good |
| CPQ pricing | ✅ 10-rule waterfall, decimal.js, BOGO | ❌ No quote builder UI | Strong backend, weak frontend |
| Quote lifecycle | ✅ send/accept/reject/void/duplicate | ✅ List page only | Backend strong, frontend thin |
| Products | ✅ Full catalog + pricing tiers | ❌ No product management UI | Backend done |
| Commission engine | ✅ Accelerators, SPIFFs, clawbacks, decimal.js | ❌ No UI | Backend done |
| Contracts | ✅ sign/terminate lifecycle (186 LOC) | ❌ No UI | Backend done |
| Workflows/automation | ✅ 14 node types, graph walker, PAUSED state | ✅ Settings page | Strong |
| Realtime (Socket.io) | ✅ 3 Kafka consumers, tenant/user rooms | ✅ Notification bell | Good |
| Search (Meilisearch) | ✅ Indexed deals/contacts/accounts | ✅ Search bar | Good |
| Auth + RBAC | ✅ Keycloak, 8 roles, JWT | ✅ Login page | Strong |
| Email sending | ✅ SMTP + sequences + templates | ❌ No inbox/threading | Outbound only |
| File storage | ✅ MinIO put/get/delete | ❌ No attachment UI | Backend done |
| AI scoring | ✅ XGBoost + rule-based fallback | ❌ No AI insights UI | Backend done |
| Analytics | ✅ Pipeline, revenue, activity, forecast | ✅ Basic numbers page | Partial (bugs in velocity) |
| Kafka event bus | ✅ All services produce events | — | Strong |
| Multi-tenancy | ✅ Row-level, every query scoped | — | Strong |

---

### What is MISSING (critical gaps) ❌

#### Frontend Pages (highest priority — users can't work without these)

1. **`/contacts/[id]` — Contact detail page** does not exist. Sales reps can see a list but can't open a contact.
2. **`/accounts/[id]` — Account detail page** does not exist. No way to see an account's full history.
3. **`/quotes/[id]` — Quote viewer** does not exist. Can list quotes, can't open one.
4. **Quote builder UI** — No product picker, line items, discount input, or total preview in the browser.
5. **Analytics charts** — Analytics page shows raw numbers. No bar charts, funnels, trend lines.
6. **Calendar view for activities** — Only a flat list. No weekly/monthly calendar grid.
7. **Email inbox/threading** — comm-service sends emails but there is no inbox UI inside the CRM.

#### Services Missing Entirely

1. **Approval engine** — No approval chains for deals, quotes, or contracts above value thresholds.
2. **Planning / Quota** — Zero. No quota targets, no attainment tracking, no forecast review workflow.
3. **Cadence engine** — No multi-step sales sequences (day 1 email → day 3 call → day 5 LinkedIn).
4. **Chatbot / Auto-quoting** — No WhatsApp or Telegram integration.
5. **Territory management** — No lead routing, no geographic assignment rules.
6. **Document service** — No contract PDF generation, no e-signature integration.
7. **Customer portal** — Customers can't view their own quotes or contracts online.
8. **Reporting builder** — No custom report creation. All analytics are pre-canned.
9. **Knowledge base** — No sales playbook content, battle cards, or objection guides.

#### Analytics Quality Issues (confirmed bugs)
- `getDealVelocity` uses `avg(1.0)` — always returns 1.0 (fixed in Phase 5 prompt)
- `avgDaysInPipeline` hardcoded to `0` (fixed in Phase 5 prompt)
- `overdueRate` hardcoded to `0` (fixed in Phase 5 prompt)
- `getForecast` multiplies total pipeline by fixed 0.6/0.9 coefficients — not real forecasting

#### Current Comparison to Enterprise CRMs
| CRM | NEXUS parity |
|-----|-------------|
| Zoho CRM | ~40% |
| Salesforce Sales Cloud | ~25% |
| SAP CRM | ~15% |
| HubSpot CRM | ~45% |

After completing all phases in this plan: **~85% Zoho / ~60% Salesforce**.

---

## SECTION 2 — NEW FEATURES & SERVICES RECOMMENDED

### A. Automated Quote System via Chatbot (WhatsApp / Telegram)

**Architecture:**

```
Customer (WhatsApp/Telegram)
        ↓
  chatbot-service (port 3016)
  ├── Conversation FSM (Redis session state)
  ├── Intent detector (rule-based + Ollama via ai-service)
  ├── Product catalog lookup (calls finance-service)
  ├── CPQ auto-quote (calls finance-service /auto-quote)
  ├── PDF quote generation (calls document-service)
  ├── Lead/contact creation (calls crm-service)
  └── Human handoff (creates deal + Kafka event → notification-service)
```

**Conversation flow (state machine):**
```
GREETING → identify language (Arabic/English)
    ↓
PRODUCT_MENU → show product categories
    ↓
PRODUCT_SELECTION → customer picks products + quantities
    ↓
DISCOUNT_CHECK → check if auto-approval threshold met
    ↓ (if below threshold)              ↓ (if above threshold)
QUOTE_PREVIEW                    REQUEST_APPROVAL → wait for sales manager
    ↓
CONTACT_CAPTURE → name, email, phone (if not known from CRM)
    ↓
QUOTE_SENT → PDF attached to message + stored in CRM
    ↓
FOLLOW_UP (optional) → enroll in comm-service sequence
```

**Required additions to finance-service:**
- `POST /api/v1/cpq/auto-quote` — takes `{ tenantId, items: [{productId, qty}], contactId? }` → returns full quoted price
- `GET /api/v1/cpq/quick-catalog` — simplified product list for chatbot display
- Auto-approval threshold setting (configurable per tenant)

**New service: `chatbot-service` (port 3016)**
- WhatsApp Business Cloud API (Meta) webhook handler
- Telegram Bot API webhook handler
- Conversation session store in Redis (TTL 30 minutes)
- FSM with 8 states
- Rate limiting per phone number
- Multi-language: English + Arabic at minimum
- Fallback: any unrecognised intent → "Let me connect you with a specialist" + human handoff

---

### B. Approval Engine

**New service: `approval-service` (port 3014)**

Handles approval requests for:
- Deals above a value threshold (e.g., > $50,000)
- Quotes with discount > X% (e.g., > 15%)
- Contracts above value threshold
- Custom field changes (e.g., changing deal close date past a limit)

**Models:**
```
ApprovalPolicy: trigger conditions, approval chain type, approvers, timeout hours
ApprovalRequest: entity type, entity ID, requestedBy, status, metadata
ApprovalStep: step order, approver role/userId, status, comment, decidedAt
```

**Chain types:**
- `SEQUENTIAL` — each approver must approve in order
- `PARALLEL` — all approvers must approve (can be in parallel)
- `ANY_ONE` — first approver to respond wins
- `MAJORITY` — more than half must approve

**Escalation:** if no response within `timeoutHours`, auto-escalate to next level or auto-reject.

**Integration points:**
- crm-service calls approval-service before `moveDealToStage` if deal > threshold
- finance-service calls approval-service before `sendQuote` if discount > threshold
- notification-service delivers approval request notifications
- Frontend shows pending approvals badge in top nav

---

### C. Calendar, Email & Maps Integrations

**Add to `integration-service` (Phase 9):**

**Google Calendar / Outlook Calendar:**
- Two-way sync: CRM activity created → calendar event created, calendar event accepted → CRM activity updated
- Meeting scheduler: expose `/schedule/{rep-slug}` page showing available slots (like Calendly-lite)
- Sync contacts' email address to attendees list

**Gmail / Outlook Email:**
- OAuth2 inbox read (IMAP-compatible via Google API / Microsoft Graph)
- Email threading linked to contact by email address match
- Send emails from CRM using rep's real email address (not the SMTP relay)
- Email tracking (open/click already exists in comm-service — wire it up)
- Unsubscribe handling / bounce management

**Google Maps:**
- Geocoding on Account create/update (store `lat`/`lng` fields)
- Account map view — show all accounts as pins on a map, colour-coded by status
- Route optimisation for field sales reps (Google Directions API — given a list of visits for today, suggest optimal order)
- Nearest accounts to current location (mobile app feature)

---

### D. Additional Recommended Services

#### 1. `cadence-service` (port 3017) — Sales Sequences
Automated multi-step outreach sequences for leads and contacts.

```
Cadence template: "New Lead 7-Day Touch"
  Step 1 (Day 0):  Send email — "Introduction"
  Step 2 (Day 2):  Create call task
  Step 3 (Day 4):  Send email — "Follow-up"
  Step 4 (Day 6):  Create LinkedIn connection task
  Step 5 (Day 8):  Send SMS
  Exit condition: reply received OR meeting booked
```

**Key features:**
- Enrolment triggers (lead created, lead score crossed threshold, deal stage changed)
- A/B variants on email steps (subject line testing)
- Unsubscribe / bounce auto-exits from cadence
- Cadence analytics: reply rate, meeting rate, deal conversion rate per cadence
- Step analytics: open rate, click rate per step

#### 2. `document-service` (port 3015) — Contracts & PDF Generation
- Contract templates with `{{variable}}` substitution (Handlebars)
- PDF generation using Puppeteer (headless Chromium)
- Contract versioning with diff tracking
- DocuSign / HelloSign e-signature webhook integration
- Storage of signed PDFs in MinIO via storage-service
- Templates: NDA, MSA, SOW, Quote PDF, Invoice PDF

#### 3. `reporting-service` (port 3018) — Custom Report Builder
- Report definition storage (`ReportDefinition` model with columns, filters, groupBy, sort)
- 25+ pre-built report templates:
  - Pipeline by stage, Pipeline by rep, Pipeline by source
  - Activities by type, Activities by rep, Overdue activities
  - Won/lost analysis, Win rate by industry, Close time by stage
  - Revenue by quarter, Revenue by product, Revenue by territory
  - Lead conversion funnel, Lead source ROI
  - Commission statements per rep
- Scheduled delivery: cron-based, email PDF/Excel report on schedule
- Export: XLSX (via xlsx package), PDF (via Puppeteer)
- Frontend: drag-and-drop report builder, saved reports library

#### 4. `territory-service` (port 3019) — Territory Management
- Territory definitions: geographic (country/region/city), industry, account size, custom
- Lead routing rules: auto-assign inbound leads to territory owners
- Account assignment rules: ownership based on territory
- Round-robin assignment within territory when multiple reps cover same area
- Territory performance analytics (pipeline, revenue, activities per territory)
- Territory overlap detection and conflict resolution

#### 5. `planning-service` (port 3020) — Quotas & Sales Planning
- Quota management: annual → quarterly → monthly → rep breakdown
- Quota types: revenue, deal count, activity count, new logos
- Attainment tracking: real-time vs. quota (from analytics data)
- Forecast submission workflow:
  - Rep submits forecast → manager reviews → VP approves
  - Forecast categories: commit, best-case, pipeline, omit
  - Change history and commentary
- What-if modelling: "what if I close these 5 deals?" → projected attainment
- Sales capacity planning: required pipeline multiple (typically 3-4x quota)

#### 6. `portal-service` (port 3021) — Customer Self-Service Portal
- Unique token-based access (no login required for customers)
- Customers can view their open/sent quotes
- Accept or reject quotes online (one-click)
- Digital signature for contracts (docusign integration or manual upload)
- Download invoices as PDF
- View account balance and payment history
- Raise support requests (creates activity + notification in CRM)
- Branded portal with tenant logo and colours

#### 7. `knowledge-service` (port 3022) — Sales Knowledge Base
- Sales playbook articles (Markdown, stored in DB)
- Product battle cards (us vs. competitor comparison)
- Objection handling guides
- Onboarding materials for new reps
- Searchable (Meilisearch-indexed)
- Linked from deal detail page ("Articles for this stage") via blueprint-service
- Version-controlled articles with publish/draft workflow
- View analytics: which articles are viewed most at which deal stages

#### 8. `incentive-service` (port 3023) — Gamification & Sales Contests
- Contest creation: target metric, date range, leaderboard type
- Real-time leaderboard from analytics data
- Achievement badges (first deal won, 10 deals in a month, etc.)
- SPIFF tracking dashboard (integrates with commission engine)
- Commission statement self-service (reps can view earned vs. pending)
- Peer recognition / kudos feed

---

## SECTION 3 — COMPLETE PHASED BUILD PLAN

### Current Status
- **Phases 1–4**: Complete
- **LOC**: ~32,689
- **Services running**: 11 of planned 23

---

### Phase 5 — Analytics Fixes + Fork/Join + billing + integration + blueprint
**Prompt file:** `CURSOR_PHASE5_PROMPT.md` *(already written)*
**Files:** 61 | **Est. LOC added:** ~2,800

**Deliverables:**
- Fix `getDealVelocity` (real ClickHouse window function query)
- Fix `avgDaysInPipeline` (CTE-based real calculation)
- Fix `overdueRate` (real `activity.overdue` count)
- Fork/Join parallel branch execution with `WorkflowForkTracker`
- `billing-service`: Plans, Subscriptions, Usage metering, Invoices, Stripe webhooks
- `integration-service`: Outbound webhooks (HMAC-signed), OAuth connections (AES-256 token encryption), sync jobs
- `blueprint-service`: Playbooks, Stage templates, Exit criteria validation engine

**Running after phase:** 14 services, ~35,500 LOC

---

### Phase 6 — Critical Frontend Sprint
**Prompt file:** `CURSOR_PHASE6_PROMPT.md` *(to create)*
**Files:** ~35 | **Est. LOC added:** ~4,500

**Deliverables:**

**1. `/contacts/[id]/page.tsx`** (est. 1,200 LOC)
- Header: name, photo initials, job title, account link, owner, tags, quick-action buttons (log call, send email, schedule meeting)
- 5 tabs: Overview (all fields, edit inline), Activities (list + inline log), Notes, Linked Deals, Timeline (unified feed newest-first)
- GDPR consent toggle, do-not-email / do-not-call badges
- `lastContactedAt` display with relative time

**2. `/accounts/[id]/page.tsx`** (est. 1,000 LOC)
- Header: company name, logo initials, type/tier/status badges, website, health score bar
- 5 tabs: Overview (all fields), Contacts (list + add existing), Deals (kanban mini-view), Activities, Timeline
- Child accounts section (tree view for parent/child hierarchy)
- Account health score breakdown

**3. `/quotes/[id]/page.tsx`** (est. 600 LOC)
- Quote header: number, status badge, expiry date, created by
- Line items table: product name, qty, unit price, discount%, line total — editable when in DRAFT
- Totals section: subtotal, total discount, tax, grand total
- Action buttons: Send, Accept, Reject, Void, Duplicate (permission-gated)
- PDF preview trigger

**4. `/quotes/new/page.tsx` — Full Quote Builder** (est. 900 LOC)
- Step 1: Select account + contact
- Step 2: Product picker (searchable catalog, add line items, set qty)
- Step 3: Apply discounts (line-level % or $ off, overall discount, promo code)
- Step 4: Preview totals (CPQ engine called live as items change)
- Step 5: Review + set expiry + add notes → Create Quote
- Keyboard-navigable line item table

**5. Analytics Dashboard Charts** — Update `/analytics/page.tsx`
- Pipeline funnel (horizontal bar chart using recharts)
- Revenue by month (line chart, last 12 months)
- Activities by type (donut chart)
- Win rate trend (area chart)
- Forecast vs. actual (grouped bar chart)
- Top reps leaderboard (horizontal bar)

**6. Activities List Improvements**
- Add "Today / Overdue / Upcoming" filter tabs
- Add inline complete button directly in the list row
- Group by date (Today, Tomorrow, This Week, Later)

**Running after phase:** 14 services, ~40,000 LOC

---

### Phase 7 — Approval Engine + Document Service
**Prompt file:** `CURSOR_PHASE7_PROMPT.md` *(to create)*
**Files:** ~45 | **Est. LOC added:** ~4,200

**Deliverables:**

**New service: `approval-service` (port 3014)**
- `ApprovalPolicy` model: trigger type, threshold value, chain type, approver roles, timeout hours
- `ApprovalRequest` model: entity type/ID, requestedBy, status, metadata snapshot
- `ApprovalStep` model: step order, approverUserId, status, comment, decidedAt
- `createApprovalRequest(tenantId, entityType, entityId, metadata)` — evaluates all active policies for entity type, creates chain
- `decide(tenantId, requestId, stepId, decision, comment)` — approves or rejects one step, advances chain, or finalises
- `escalate()` — background job that escalates timed-out steps
- Policy types: `deal.amount > X`, `quote.discountPct > Y`, `contract.amount > Z`, custom
- Chain types: SEQUENTIAL, PARALLEL, ANY_ONE, MAJORITY
- Publishes: `approval.requested`, `approval.approved`, `approval.rejected`, `approval.escalated`
- Routes: policies CRUD, requests list/get, decision endpoint, pending approvals for current user

**finance-service updates:**
- Before `sendQuote`: check if discount % exceeds policy threshold → call approval-service → queue quote if pending
- Quote gains `approvalStatus: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED'` field

**crm-service updates:**
- Before `moveDealToStage` to high-value stage: check deal amount against policy

**New service: `document-service` (port 3015)**
- `DocumentTemplate` model: name, category (quote/contract/invoice/nda), Handlebars body HTML, variables list
- `GeneratedDocument` model: templateId, entityType, entityId, renderedHtml, pdfPath, version, status
- `renderTemplate(templateId, variables)` — Handlebars compile + render to HTML
- `generatePdf(htmlContent)` — Puppeteer headless Chromium → PDF Buffer → store in MinIO via storage-service
- `getPresignedUrl(documentId)` — returns time-limited MinIO URL for download
- E-signature: `initiateSignature(documentId, signerEmail)` — creates DocuSign envelope (or stub that stores a `signedAt` timestamp for now)
- Pre-built templates: Quote PDF, Contract, NDA, Invoice
- Routes: templates CRUD, generate document, download URL, signature status

**Frontend additions:**
- Approval pending badge in top navigation
- Approval request modal on deals/quotes above threshold
- "Approve / Reject" quick-action cards in notification dropdown
- Document generation button on contract/quote detail pages
- PDF preview iframe in quote detail page

**Running after phase:** 16 services, ~44,200 LOC

---

### Phase 8 — Chatbot Service + Auto-Quoting Engine
**Prompt file:** `CURSOR_PHASE8_PROMPT.md` *(to create)*
**Files:** ~40 | **Est. LOC added:** ~4,500

**Deliverables:**

**New service: `chatbot-service` (port 3016)**

*Conversation state machine:*
```typescript
type BotState =
  | 'GREETING'
  | 'PRODUCT_MENU'
  | 'PRODUCT_SELECTION'
  | 'QUANTITY_INPUT'
  | 'CART_REVIEW'
  | 'DISCOUNT_CHECK'
  | 'CONTACT_CAPTURE'
  | 'QUOTE_PREVIEW'
  | 'QUOTE_SENT'
  | 'HUMAN_HANDOFF'
  | 'CLOSED';
```

*Session store (Redis):*
```typescript
interface ChatSession {
  sessionId: string;
  channel: 'whatsapp' | 'telegram';
  phoneOrChatId: string;
  tenantId: string;
  state: BotState;
  language: 'en' | 'ar';
  cart: Array<{ productId: string; name: string; qty: number; unitPrice: number }>;
  contactId?: string;
  leadId?: string;
  quoteId?: string;
  lastMessageAt: number;
}
```

*WhatsApp Business Cloud API handler:*
- POST `/api/v1/bot/whatsapp/webhook` — receives Meta webhook events
- GET `/api/v1/bot/whatsapp/webhook` — verify webhook token (PUBLIC routes)
- Handles text messages, button replies, list selections, document messages
- Sends text, interactive list menus, buttons, and PDF attachments

*Telegram Bot API handler:*
- POST `/api/v1/bot/telegram/webhook` — receives Telegram updates
- Handles text messages and inline keyboard callbacks
- Sends messages with inline keyboards and documents

*Bot logic:*
- `processMessage(session, inboundText)` — FSM transition function
- Language detection on first message (Arabic / English)
- Product catalog display as interactive list (WhatsApp) or inline keyboard (Telegram)
- Multi-item cart with confirmation before quoting
- Calls `finance-service /api/v1/cpq/auto-quote` to calculate price
- PDF quote generated via `document-service`
- Lead/contact looked up by phone number → creates in crm-service if not found
- Human handoff: creates deal + sends notification to assigned rep
- Anti-spam: max 20 messages per hour per phone number (Redis rate limiter)
- Idle session cleanup after 30 minutes (Redis TTL)

*Settings page:*
- Bot configuration (welcome message, language, product categories to expose)
- Enable/disable WhatsApp / Telegram channels per tenant
- Human handoff assignment rules (which rep gets notified by account type)
- Auto-approval threshold (quotes below this value are sent without manager approval)
- Chatbot testing simulator in the UI

**finance-service additions:**
- `POST /api/v1/cpq/auto-quote` — headless quote creation (no user session needed):
  Input: `{ tenantId, items: [{productId, qty}], contactId?, applyBestPromo: true }`
  Output: full quote object with all 10 pricing rules applied
- `GET /api/v1/products/quick-catalog` — minimal product list for chatbot menu
  Output: `[{ id, name, shortDescription, basePrice, currency, unit }]`

**Running after phase:** 17 services, ~48,700 LOC

---

### Phase 9 — Calendar, Email Inbox & Maps
**Prompt file:** `CURSOR_PHASE9_PROMPT.md` *(to create)*
**Files:** ~50 | **Est. LOC added:** ~5,000

**Deliverables:**

**Extend `integration-service`:**

*Google Calendar sync:*
- OAuth2 token exchange route: `/api/v1/integrations/oauth/google/calendar/connect`
- Two-way sync consumer: CRM `activity.created` → create Google Calendar event
- Google Calendar push notification handler → update CRM activity when event changes
- `SyncedCalendarEvent` DB model: links CRM activity ID ↔ Google event ID

*Outlook/Office 365 Calendar sync:*
- Microsoft Graph OAuth2 flow
- Same bidirectional sync pattern as Google

*Gmail two-way sync:*
- OAuth2 `gmail.readonly` + `gmail.send` scopes
- Poll Gmail for new emails to/from known contact addresses (every 5 minutes or push via Gmail watch)
- Store `EmailThread` records linked to `contactId` in integration-service DB
- Send email from CRM using rep's Gmail credentials (calls Google API, not SMTP relay)
- Open/click tracking still goes through comm-service outbox

*Outlook email sync:*
- Microsoft Graph `Mail.ReadWrite` + `Mail.Send` scopes
- Same threading pattern

*Google Maps geocoding:*
- On `account.created` or `account.updated` Kafka events: call Google Maps Geocoding API
- Store `lat` + `lng` on Account record (add fields to CRM schema)
- Reverse geocode on coordinates → auto-fill city/country if missing

**Frontend additions:**

*Activities calendar view* — new tab on `/activities/page.tsx`:
- Week view (default) and Month view
- `react-big-calendar` component
- Colour-coded by activity type
- Click event → opens activity slide-over
- Drag event → calls `rescheduleActivity`
- "New activity" button from calendar opens creation modal

*Email threads in contact/account detail pages*:
- New "Emails" tab on `/contacts/[id]` and `/accounts/[id]`
- Shows threaded email conversation (newest first)
- Compose inline reply → routes through Gmail/Outlook API or SMTP fallback
- Unread badge count

*Account map view* — new view toggle on `/accounts/page.tsx`:
- List view (default) ↔ Map view toggle
- Google Maps embed showing account pins
- Pin colour: green = ACTIVE, yellow = AT_RISK, red = CHURNED
- Click pin → account summary popover with link to detail page

*Meeting scheduler page* `/schedule/[rep-slug]` (public, no auth):
- Shows rep availability from calendar integration
- Customer selects slot → creates CRM activity + calendar event
- Sends confirmation email to both parties

**Running after phase:** 17 services, ~53,700 LOC

---

### Phase 10 — Cadence Engine + Territory Management
**Prompt file:** `CURSOR_PHASE10_PROMPT.md` *(to create)*
**Files:** ~55 | **Est. LOC added:** ~4,500

**Deliverables:**

**New service: `cadence-service` (port 3017)**

*Data models:*
```
CadenceTemplate: name, description, objectType (lead/contact/deal), steps[]
CadenceStep: position, type (email/call_task/linkedin_task/sms/wait), delayDays, templateId?, taskTitle?, smsBody?, variants[]
CadenceEnrollment: contactId/leadId, cadenceId, tenantId, status, currentStep, enrolledAt, exitReason?
CadenceStepExecution: enrollmentId, stepId, status, scheduledAt, executedAt, result
```

*Key methods:*
- `enrollContact(tenantId, cadenceId, contactId, ownerId)` — creates enrollment, schedules step 0
- `processQueue()` — background job every 5 min: find due step executions, execute them via comm-service or task creation
- `exitEnrollment(enrollmentId, reason)` — exits on reply/meeting booked/unsubscribe/manual
- Kafka consumer: `activity.completed` where type = MEETING → exits relevant enrollment
- Kafka consumer: `comm.email.reply` → exits enrollment (requires email sync from Phase 9)
- `getCadenceAnalytics(tenantId, cadenceId)` — per-step open rate, reply rate, meeting rate

*A/B variants:*
- Email steps can have 2 variants; system assigns 50/50 on enrollment
- Analytics split by variant to determine winner

**Frontend:**
- Cadence builder: drag-and-drop step editor
- Step configuration: email template picker, delay days, task title
- Cadence analytics dashboard: funnel per step
- Active enrollments table: who is at which step

**New service: `territory-service` (port 3018)**

*Data models:*
```
Territory: name, tenantId, type (geographic/industry/account_size/custom), rules[], ownerIds[], teamId?
TerritoryRule: field, operator, value (e.g. country eq 'UAE', annualRevenue gte 1000000)
LeadRoutingLog: leadId, matchedTerritoryId, assignedOwnerId, routedAt
```

*Key methods:*
- `assignLead(tenantId, leadData)` — evaluates all active territory rules, returns best-match territory + owner
- `assignAccount(tenantId, accountData)` — same for accounts
- `resolveConflict(tenantId, entityId, candidates)` — when multiple territories match, apply priority or round-robin
- Kafka consumer: `lead.created` → auto-assign via territory rules → update lead ownerId via crm-service

*Frontend:*
- Territory list and create/edit page
- Visual rule builder (field → operator → value)
- Lead routing test tool (input lead data → see which territory would match)
- Territory performance report

**Running after phase:** 19 services, ~58,200 LOC

---

### Phase 11 — Planning, Forecasting & Reporting
**Prompt file:** `CURSOR_PHASE11_PROMPT.md` *(to create)*
**Files:** ~60 | **Est. LOC added:** ~5,500

**Deliverables:**

**New service: `planning-service` (port 3019)**

*Data models:*
```
QuotaPlan: tenantId, year, quarter?, type (revenue/count/activity)
QuotaTarget: planId, ownerId (rep or team), targetValue, currency
AttainmentRecord: targetId, tenantId, ownerId, period, actualValue, calculatedAt
ForecastSubmission: tenantId, ownerId, period, commitAmount, bestCaseAmount, pipelineAmount, commentary, submittedAt
ForecastReview: submissionId, reviewerId, adjustedCommit?, adjustedBestCase?, note, reviewedAt
```

*Quota management:*
- Create/update quota plans (annual broken into quarterly + monthly)
- Quota cascade: team quota → individual rep quotas (proportional or manual)
- Live attainment: pull won-deal revenue from analytics-service for the period

*Forecast workflow:*
- Rep submits forecast → `ForecastSubmission` created → notification to manager
- Manager reviews, adjusts, adds note → `ForecastReview` created
- Roll-up: manager's team forecast aggregated for VP view
- History: every submission and review tracked with timestamp + author

*What-if modeller:*
- `whatIfClose(tenantId, ownerId, dealIds[])` → returns projected attainment if those deals close
- `requiredPipeline(tenantId, ownerId, period)` → how much pipeline needed to hit quota at current win rate

**Rebuild `analytics-service` forecast module:**
- Replace the `getWeightedPipeline` fixed-multiplier stub with:
  - Stage-weighted pipeline: `sum(deal.amount × stage.winProbability)` (win probability per stage configurable)
  - Historical win rate by stage (last 12 months of closed data from ClickHouse)
  - Seasonality index per month (calculated from historical revenue distribution)
  - Per-rep forecast vs. historical accuracy score

**New service: `reporting-service` (port 3020)**

*Pre-built report templates (30+):*
```
Pipeline: by stage, by rep, by source, by account size, stale deals
Revenue: by quarter, by product, by territory, by industry
Activities: by type, by rep, overdue, completion rate
Leads: by source, conversion funnel, time to convert, UTM attribution
Forecast: vs. quota, vs. prior year, stage accuracy
Commission: by rep, by period, accelerator breakdown
Customers: health score distribution, churn risk, NPS trend
```

*Report builder engine:*
- `ReportDefinition`: name, querySpec (datasource, columns, filters, groupBy, sort, limit)
- `executeReport(definitionId, params)` — routes to ClickHouse or Postgres depending on datasource
- `scheduleReport(definitionId, schedule, recipientEmails, format)` — cron-based delivery
- Export: XLSX (SheetJS), PDF (Puppeteer)
- Report permission: owner-only or shared with tenant

*Frontend:*
- Planning dashboard: quota attainment progress bar per rep, team rollup, forecast vs. quota
- Forecast submission form + review interface
- Report library: grid of pre-built + custom reports
- Report runner: select template → fill filters → view results table → export
- Report scheduler modal

**Running after phase:** 21 services, ~63,700 LOC

---

### Phase 12 — Customer Portal + Knowledge Base + Incentives
**Prompt file:** `CURSOR_PHASE12_PROMPT.md` *(to create)*
**Files:** ~50 | **Est. LOC added:** ~4,000

**Deliverables:**

**New service: `portal-service` (port 3021)**

*Token-based access (no login):*
- `PortalToken`: entityType (quote/contract/account), entityId, token (UUID), expiresAt, viewCount
- `GET /portal/:token` — renders customer-facing portal page (Next.js server-side rendered, separate from main app)
- Quote view: line items, totals, expiry, accept/reject buttons
- `POST /portal/:token/accept` — calls finance-service acceptQuote
- `POST /portal/:token/reject` — calls finance-service rejectQuote
- Contract view: document preview, download PDF, upload signed copy
- Invoice view: details + download PDF

*Portal branding:*
- Tenant can upload logo + set primary colour
- All portal pages render with tenant branding

**New service: `knowledge-service` (port 3022)**

*Data models:*
```
KbArticle: tenantId, title, slug, category, body (Markdown), tags[], status (draft/published), authorId, version
KbCategory: tenantId, name, icon, position, parentCategoryId?
KbView: articleId, viewedBy, viewedAt, dealStage? (context where it was accessed)
```

*Features:*
- Full CRUD on articles with Markdown body
- Meilisearch indexing (add to search-service index)
- Article suggestions: blueprint-service `getPlaybookForStage` returns linked `articleIds[]`
  → deal detail page shows "Recommended reading for this stage"
- View analytics: most-read articles, articles read before deals won

**`incentive-service` additions (extend commission engine):**

*Contest management:*
```
Contest: tenantId, name, metric, startDate, endDate, prizeDescription, rules
ContestEntry: contestId, ownerId, currentValue, lastUpdatedAt
```
- Leaderboard: live ranking from analytics data
- Badge system: 20 pre-defined badges (first win, 10 deals in 30 days, etc.)
- Commission statement page: rep can view monthly/quarterly earned commission with deal-level breakdown

*Frontend:*
- Portal share button on quote + contract detail pages (generates token link)
- Knowledge base article editor (Markdown with preview)
- Knowledge base browser for sales reps
- Contest leaderboard widget on dashboard homepage
- Commission statement page under `/settings/my-commission`

**Running after phase:** 23 services, ~67,700 LOC

---

### Phase 13 — Mobile App (React Native + Expo)
**Prompt file:** `CURSOR_PHASE13_PROMPT.md` *(to create)*
**Files:** ~90 | **Est. LOC added:** ~12,000

**Deliverables:**

```
apps/mobile/          ← new Expo app in monorepo
├── src/
│   ├── screens/
│   │   ├── auth/        Login, ForgotPassword
│   │   ├── dashboard/   Home, Notifications
│   │   ├── deals/       DealsList (kanban), DealDetail, DealCreate
│   │   ├── contacts/    ContactsList, ContactDetail, ContactCreate
│   │   ├── accounts/    AccountsList, AccountDetail
│   │   ├── activities/  ActivitiesList (today/overdue), ActivityCreate, CalendarView
│   │   ├── quotes/      QuotesList, QuoteDetail
│   │   └── settings/    Profile, Preferences
│   ├── components/      Shared UI components
│   ├── hooks/           React Query hooks (reuse web hooks where possible)
│   ├── navigation/      Stack + Tab navigators
│   └── services/        API client
```

*Key mobile-specific features:*
- **Offline mode**: SQLite local cache (expo-sqlite) — read-only when offline, sync queue for mutations
- **Push notifications**: Expo Push Notifications → notification-service webhook
- **Business card scanner**: camera capture → OCR (via ai-service Whisper or Google Vision) → pre-fill contact form
- **Voice notes**: record voice memo on activity log → Whisper transcription via ai-service → stored as note
- **Location check-in**: tap "I'm at this account" → creates visit activity with GPS coordinates
- **Biometric auth**: Face ID / Touch ID for app unlock (Expo LocalAuthentication)
- **Maps**: React Native Maps showing nearby accounts

**Tech stack:**
- Expo SDK 51 (managed workflow)
- React Native 0.74
- React Navigation 6
- React Query (same hooks pattern as web)
- Expo SQLite for offline
- Expo Camera for card scanner
- Expo Location for check-in

**Running after phase:** 23 services + mobile app, ~79,700 LOC

---

### Phase 14 — AI Enhancement
**Prompt file:** `CURSOR_PHASE14_PROMPT.md` *(to create)*
**Files:** ~30 | **Est. LOC added:** ~3,500

**Deliverables:**

**Enhance `ai-service` (Python FastAPI):**

*New models:*
- `ChurnPredictor` — Random Forest on account features (last activity date, open deals, NPS, payment history)
  → `risk_score` (0–1) + `risk_factors[]` stored on Account
- `NextBestAction` — rule-based engine with ML scoring overlay
  Input: deal + contact + account snapshot
  Output: ranked list of suggested actions (call, email, send quote, offer discount, escalate)
- `EmailReplyAssistant` — Ollama prompt: given email thread → suggest 3 reply options in rep's tone
- `MeetingSummariser` — Whisper transcription → structured summary (attendees, key points, action items, next steps)
  Called from activity detail page after a call/meeting is logged with a recording

*New endpoints:*
- `POST /predict/churn-risk` — batch or single account
- `POST /recommend/next-action` — returns ranked action list for a deal
- `POST /assist/email-reply` — returns 3 email reply drafts
- `POST /transcribe/meeting` — Whisper + summarisation

**crm-service additions:**
- Cron-based churn score refresh: every 6 hours, batch-call ai-service for all accounts
- Store `churnRiskScore` + `churnRiskFactors` on Account model
- Next Best Action panel on deal detail page (calls ai-service, renders top 3 suggestions)

**comm-service addition:**
- Email reply assistant: on email compose, show "Suggest replies" button → calls ai-service

**Frontend:**
- AI insights panel on contact/account/deal detail pages
- Churn risk heatmap on accounts list (colour-coded rows)
- Meeting summary auto-fill after recording upload
- "Suggest reply" button in email compose

**Running after phase:** 23 services, ~83,200 LOC

---

### Phase 15 — Production Hardening + Full Test Suite
**Prompt file:** `CURSOR_PHASE15_PROMPT.md` *(to create)*
**Files:** ~120 | **Est. LOC added:** ~25,000

**Deliverables:**

**Full test suite (target: 80% coverage across all services):**
- Unit tests: every service method (vitest, mocked Prisma + Kafka)
- Integration tests: every route (fastify inject, real test DB via Docker Compose)
- E2E tests: 20 critical user journeys (Playwright against running app)

**Kubernetes / Helm:**
```
infrastructure/k8s/
├── helm/
│   ├── nexus/                Chart.yaml, values.yaml
│   └── charts/               Per-service sub-charts
└── manifests/
    ├── namespaces.yaml
    ├── secrets-template.yaml
    └── ingress.yaml
```

**Observability:**
- Prometheus metrics endpoint on every service (`/metrics`)
- Custom metrics: `http_request_duration_seconds`, `kafka_consumer_lag`, `workflow_execution_duration`
- Grafana dashboards: service health, deal pipeline, kafka lag, error rates
- Structured JSON logging (already using pino via Fastify)
- Distributed tracing: OpenTelemetry → Jaeger

**OpenAPI documentation:**
- Every service has `swagger.json` auto-generated from Fastify route schemas
- API gateway docs page at Kong `/docs`

**Security hardening:**
- OWASP Top 10 checklist run against all routes
- SQL injection prevention audit (parameterised queries already used — document)
- Rate limiting review (per-tenant + per-IP, already in service-utils — tighten limits)
- Token rotation: short-lived JWTs (15 min) + refresh token rotation
- Content Security Policy headers
- Dependency vulnerability scan (npm audit, pip-audit)

**Seed data:**
- `scripts/seed.ts` — creates demo tenant with:
  - 5 users (admin, 3 sales reps, manager)
  - 3 pipelines, 15 stages
  - 50 accounts, 100 contacts, 30 leads
  - 40 deals in various stages
  - 10 products with pricing tiers
  - 5 workflows, 3 cadences
  - Sample quotes, invoices, contracts

**Running after phase:** 23 services, ~108,000 LOC ✅

---

## SECTION 4 — FULL SERVICE MAP (End State)

| Port | Service | Status after Phase |
|------|---------|-------------------|
| 3001 | auth-service | Done (Phase 1) |
| 3002 | crm-service | Done (Phase 1) |
| 3003 | finance-service | Done (Phase 1) |
| 3004 | workflow-service | Done (Phase 2) |
| 3005 | realtime-service | Done (Phase 2) |
| 3006 | search-service | Done (Phase 2) |
| 3007 | notification-service | Done (Phase 2) |
| 3008 | analytics-service | Phase 5 (fixes) |
| 3009 | comm-service | Done (Phase 4) |
| 3010 | storage-service | Done (Phase 4) |
| 8000 | ai-service (Python) | Phase 14 (enhanced) |
| 3011 | billing-service | Phase 5 |
| 3012 | integration-service | Phase 5 |
| 3013 | blueprint-service | Phase 5 |
| 3014 | approval-service | Phase 7 |
| 3015 | document-service | Phase 7 |
| 3016 | chatbot-service | Phase 8 |
| 3017 | cadence-service | Phase 10 |
| 3018 | territory-service | Phase 10 |
| 3019 | planning-service | Phase 11 |
| 3020 | reporting-service | Phase 11 |
| 3021 | portal-service | Phase 12 |
| 3022 | knowledge-service | Phase 12 |
| 3023 | incentive-service | Phase 12 |
| — | Mobile app (React Native) | Phase 13 |

**Total: 24 services + 1 mobile app**

---

## SECTION 5 — LOC PROJECTION

| After Phase | Cumulative LOC | % of 300k target |
|------------|----------------|-----------------|
| Phase 4 (now) | 32,689 | 11% |
| Phase 5 | ~35,500 | 12% |
| Phase 6 | ~40,000 | 13% |
| Phase 7 | ~44,200 | 15% |
| Phase 8 | ~48,700 | 16% |
| Phase 9 | ~53,700 | 18% |
| Phase 10 | ~58,200 | 19% |
| Phase 11 | ~63,700 | 21% |
| Phase 12 | ~67,700 | 23% |
| Phase 13 | ~79,700 | 27% |
| Phase 14 | ~83,200 | 28% |
| Phase 15 | ~108,000 | 36% |

**To reach 300k LOC, the remaining 200k comes from:**
- Full test suite at 80% coverage: ~80,000 LOC
- React Native mobile app full depth: +15,000 LOC
- Event sourcing event store (full audit log): ~25,000 LOC
- OpenAPI generated clients: ~15,000 LOC
- More detailed implementations + edge cases: ~30,000 LOC
- Multi-language UI (i18n strings, Arabic RTL): ~10,000 LOC
- Infrastructure-as-code (Terraform, Helm): ~15,000 LOC
- Documentation-as-code (OpenAPI, ADRs): ~10,000 LOC

**Realistic final target: ~250,000–280,000 LOC** — which is a legitimate, world-class open-source CRM.

---

## SECTION 6 — NEXT CURSOR PROMPT TO RUN

**Now:** Phase 5 prompt is ready (`CURSOR_PHASE5_PROMPT.md`).
After Phase 5 is verified, the next prompt to write is **Phase 6 (Critical Frontend Sprint)** — this is the
highest-impact phase because it unlocks the CRM for actual day-to-day use by sales teams.

**Priority order if resources are limited:**
1. Phase 6 (frontend gaps — reps can't work without contact/account detail pages)
2. Phase 7 (approval engine — needed before chatbot can go live)
3. Phase 8 (chatbot — your specific requirement)
4. Phase 9 (calendar/email — major productivity feature)
5. Phase 11 (planning/forecast — management needs this)

---

*Document generated after Phase 4 audit. Update LOC column after each phase completion.*
