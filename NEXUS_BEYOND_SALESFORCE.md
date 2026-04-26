# NEXUS CRM — Beyond Salesforce + Zoho Combined
## The strategy to build the world's most capable open-source Revenue Operating System

---

## WHY THIS IS ACHIEVABLE

Salesforce and Zoho are not beating NEXUS on engineering. They are beating it on **surface area** —
the number of features they've shipped over 20+ years with thousands of engineers.
But almost every feature they have can be engineered. More importantly, there are entire categories
where NEXUS can be **structurally better** — not just equal — because of decisions baked into the
architecture that Salesforce and Zoho can never replicate without a full rewrite.

**NEXUS's permanent structural advantages over both:**

| Advantage | Salesforce | Zoho | NEXUS |
|-----------|-----------|------|-------|
| Open source / self-hosted | ❌ | ❌ | ✅ |
| No per-seat pricing | ❌ ($150–$300/user/mo) | ❌ ($14–$52/user/mo) | ✅ Free |
| Data sovereignty (your servers) | ❌ | ❌ | ✅ |
| WhatsApp/Telegram native quoting | ❌ (add-on required) | Partial | ✅ Phase 8 |
| Real-time collaborative editing | ❌ | ❌ | ✅ (Socket.io) |
| Modern TypeScript stack | ❌ (Apex, LWC) | ❌ (Deluge) | ✅ |
| Local AI (Ollama, private data) | ❌ (Einstein = cloud) | ❌ (Zia = cloud) | ✅ |
| Kafka event bus (full event history) | ❌ ($$$) | ❌ | ✅ |
| Sub-10ms search (Meilisearch) | ❌ (SOQL is slow) | ❌ | ✅ |
| No vendor lock-in | ❌ | ❌ | ✅ |

---

## SECTION 1 — WHAT SALESFORCE HAS THAT NEXUS NEEDS

### 1.1 — Service Cloud (Customer Support) 🔴 Critical Gap
Salesforce's second-largest product. Without it NEXUS is a sales tool, not a full Revenue OS.

**Missing from NEXUS:**
- Case / ticket management (customer submits issue → tracked to resolution)
- SLA rules (response time targets, breach alerts, escalation)
- Email-to-case (inbound email auto-creates a case)
- Live chat widget (embed on customer website)
- Agent queues (assign cases to teams, round-robin, skill-based routing)
- Case escalation (unresolved after N hours → escalate to senior)
- Customer self-service portal cases (we have portal-service planned but no cases)
- Canned responses / macros for agents
- Customer satisfaction (CSAT) survey after case closure

### 1.2 — Marketing Cloud / Pardot 🔴 Critical Gap
Salesforce charges $1,250+/month for this separately. NEXUS can include it.

**Missing from NEXUS:**
- Email campaign management (bulk sends, not just sequences)
- Landing page builder (drag-and-drop HTML pages with forms)
- Web-to-lead forms (embed on any website, submits directly to CRM)
- Website visitor tracking (identify anonymous visitors, track page views)
- Lead scoring based on behaviour (visited pricing page +10pts, opened email +5pts)
- A/B testing of campaigns (not just cadence steps)
- Campaign attribution (which campaign drove a deal)
- Drip campaign visual builder (journey map, not just linear sequences)
- Social media publishing + monitoring
- UTM link builder + attribution tracking (partially in Lead model — needs campaign layer)

### 1.3 — Revenue Intelligence / Revenue Cloud 🟡 Important Gap
Salesforce charges $200/user/month extra for this.

**Missing from NEXUS:**
- ARR / MRR tracking (subscription revenue metrics)
- Revenue recognition (ASC 606: recognise revenue over contract period, not at booking)
- Renewal management (flag renewals 90/60/30 days before expiry)
- Expansion revenue tracking (upsell / cross-sell to existing customers)
- Net Revenue Retention (NRR) metric
- Customer Lifetime Value (LTV) calculation
- Revenue waterfall chart (new ARR + expansion − churn = net ARR)
- Cohort analysis (revenue by customer cohort over time)
- Subscription health dashboard

### 1.4 — Collaborative Forecasting with Quota Splits 🟡 Important
- Opportunity splits: credit multiple reps for the same deal (e.g. 60% AE / 40% SE)
- Overlay reps (solutions engineers, specialists) get partial credit
- Manager can override rep forecast and add notes
- Multiple forecast categories (Commit, Best Case, Most Likely, Pipeline, Omit)
- Forecast roll-up tree (rep → team → region → company)
- AI-assisted forecast adjustment

### 1.5 — Field Service Lightning 🟢 Nice to Have
- Work order management
- Field technician scheduling and dispatching
- Mobile app for field techs
- Parts and inventory management
- Time tracking and billing for field work

### 1.6 — AppExchange / Ecosystem 🟡 Important
- Plugin marketplace (we have MCP plugins, but no CRM-specific marketplace)
- ISV partnerships
- Data connectors (ZoomInfo, Clearbit, LinkedIn Sales Navigator)

### 1.7 — Enterprise Administration 🔴 Critical
- **Custom Objects** — User can define new data entities in the UI (like a "Project" or "Warehouse") without code
- **Custom Fields** — Add fields to any standard object without schema migration
- **Page Layouts** — Different field layouts for different profiles/roles
- **Validation Rules** — Business rules enforced at the UI layer
- **Multiple Business Units** — Run multiple companies/brands under one Salesforce org
- **Duplicate Matching Rules** — Auto-detect and merge duplicates
- **Multi-currency** — Transactions in any currency, auto-converted to corporate currency
- **Data Retention / Archiving** — GDPR right-to-erasure, data retention schedules

---

## SECTION 2 — WHAT ZOHO HAS THAT NEXUS NEEDS

### 2.1 — Zia AI Assistant 🔴 Critical (but we can do better)
Zoho's conversational AI lets users ask: *"Show me deals closing this month that haven't been contacted in 2 weeks"*

NEXUS can do this BETTER because:
- Ollama runs locally (Zoho's Zia uses cloud — data leaves your servers)
- We can use GPT-4 class models via Ollama
- Natural language → structured query → real-time results
- "Ask NEXUS" chatbot embedded in every page

### 2.2 — CommandCenter (Customer Journey Orchestration) 🟡 Important
Visual journey builder that maps the entire customer lifecycle from lead through renewal.
Different from workflow automation — this maps the JOURNEY (all touchpoints across all channels).

**What it does:**
- Define stages a customer passes through (Prospect → Lead → MQL → SQL → Opportunity → Customer → Renewal)
- Map which actions happen at each stage (email sent, call logged, demo given)
- Identify gaps (customer reached SQL stage but never received a demo — flag it)
- Measure time spent at each stage across all customers

### 2.3 — SalesIQ (Website Visitor Tracking) 🟡 Important
- Identify known contacts when they visit your website
- See what pages they're viewing in real-time
- Trigger proactive live chat based on rules (visited pricing page 3 times → chat prompt)
- Lead scoring auto-increment on page visits
- Anonymous visitor tracking (cookie-based, GDPR-compliant)

### 2.4 — Canvas / No-Code UI Customiser 🟡 Important
Zoho Canvas lets non-technical admins redesign any CRM screen — move fields, change colours, hide sections.
NEXUS needs a page layout configuration engine so admins can customise what fields show and where.

### 2.5 — Telephony (PhoneBridge) 🔴 Critical for sales teams
- Built-in softphone (WebRTC-based, no physical phone needed)
- Click-to-call from any phone number in the CRM
- Incoming call screen pop (caller's CRM record opens automatically)
- Call recording + automatic activity creation
- Call disposition codes (reason for call outcome)
- Voicemail drop (pre-recorded voicemail left in one click)
- Integration with Twilio, RingCentral, Vonage, Avaya, Asterisk

### 2.6 — Social CRM 🟢 Nice to Have
- Monitor Twitter/X, LinkedIn, Facebook for brand mentions
- Convert social mentions into leads
- See a contact's social activity inside their CRM profile
- Social profile enrichment (auto-fill photo, job title from LinkedIn)

### 2.7 — Multi-Layout / Multi-Stage Forms 🟡 Important
- Different deal entry forms for different pipeline types (e.g. Enterprise deals vs SMB deals)
- Conditional field visibility (show "Government contract number" only if Account Type = Government)
- Required field rules per stage (already in blueprint-service — needs UI)
- Wizard-style deal entry (multi-step form)

---

## SECTION 3 — WHERE NEXUS WILL BE BETTER THAN BOTH

This is the critical section. These are features that neither Salesforce nor Zoho does well,
and NEXUS can own these categories.

### 3.1 — WhatsApp / Telegram Native Quoting ✅ NEXUS WINS
Neither SF nor Zoho have a native WhatsApp quoting bot. They rely on third-party integrations.
NEXUS builds this as a first-class feature (Phase 8). A customer on WhatsApp gets a full CPQ-priced
PDF quote in minutes, with approval workflow, without any human intervention.

**Advantage:** This alone could be the defining feature for Middle East, South Asia, Latin America
markets where WhatsApp is the primary business communication channel.

### 3.2 — Local AI / Privacy-First Intelligence ✅ NEXUS WINS
Salesforce Einstein and Zoho Zia both send your customer data to their cloud for AI processing.
NEXUS runs Ollama locally — your customer data NEVER leaves your server.

For enterprises in regulated industries (finance, healthcare, government), this is not a nice-to-have.
It is a hard compliance requirement. NEXUS is the only enterprise CRM that can offer this.

**AI capabilities to build that beat Einstein + Zia:**
- Natural language search: "deals over $100k closing next month with no activity in 2 weeks" → executed query
- Deal risk scoring: real-time, on-premise, explainable ML (not a black box)
- Call intelligence: Whisper transcription + sentiment analysis + action item extraction
- Email reply drafting: context-aware, in rep's tone, private
- Predictive lead scoring: trained on YOUR data, not generic industry benchmarks
- Anomaly detection: pipeline suddenly dropped 20%? → alert + root cause suggestion

### 3.3 — Real-Time Collaborative CRM ✅ NEXUS WINS
Google Docs showed the world that real-time collaboration changes how people work.
CRM hasn't had this. Both Salesforce and Zoho require page refresh to see another rep's updates.

NEXUS with Socket.io:
- See another rep typing in a note field (live cursor)
- Deal stage updates propagate instantly to every open tab
- Activity feed updates in real-time without polling
- "John is editing this contact right now" indicator
- Conflict detection: "This record was updated while you were editing — see changes"

### 3.4 — True Revenue Operating System ✅ NEXUS WINS
Salesforce achieves this by selling you 5 separate clouds at 5x the cost.
Zoho achieves it with 40+ separate apps that don't fully integrate.

NEXUS is designed from day 1 as a single unified platform:
- Sales (crm-service, deals, contacts, accounts)
- Finance (CPQ, quotes, invoices, commissions, billing)
- Automation (workflow-service, cadence-service, approval-service)
- Marketing (marketing module — Phase 17)
- Customer Success (service module — Phase 16)
- Intelligence (analytics, planning, reporting)
- Communications (comm, chatbot, telephony)

Single data model, single event bus, single authentication. No sync failures, no data mismatches.

### 3.5 — Open-Source Ecosystem Advantage ✅ NEXUS WINS
Salesforce charges ISVs 15-25% revenue share for AppExchange listings.
Zoho's marketplace is limited and requires proprietary Deluge scripting.

NEXUS: completely open, build on top of it freely, standard TypeScript and REST APIs.
Community-built connectors, themes, add-ons — zero platform tax.

### 3.6 — Cost ✅ NEXUS WINS (permanently)
Salesforce Enterprise: ~$165/user/month → 50 users = $99,000/year
Zoho CRM Enterprise: ~$52/user/month → 50 users = $31,200/year
NEXUS: $0/user/month → 50 users = cost of hosting only (~$2,000-5,000/year on AWS)

---

## SECTION 4 — THE ADDITIONAL PHASES (16–25)

These phases close the remaining gap and push NEXUS past both platforms.

---

### Phase 16 — Customer Service Module (Service Desk)
**New service: `service-service` (port 3024)**
**Est. LOC:** ~5,500

**Data models:**
```
Case: tenantId, caseNumber, contactId, accountId, subject, description, status, priority, category,
      ownerId, queueId, slaId, firstResponseAt, resolvedAt, satisfactionScore
SlaPolicy: name, priority targets (response/resolution time in hours), escalation rules
CaseQueue: name, tenantId, memberIds[], autoAssignRule (round-robin/least-busy)
CaseComment: caseId, authorId, isPublic, body, attachments[]
CannedResponse: name, category, body (supports {{variable}} substitution)
```

**Key features:**
- `POST /api/v1/service/cases/inbound-email` — public route: inbound email → auto-creates case
- Email-to-case: parse `Subject`, `From`, `Body` → match to known contact → create Case
- SLA engine: background job every 5 min checks breach conditions, fires Kafka `case.sla_breach`
- Case escalation rules: if status = OPEN and age > 4 hours → reassign to senior queue
- Queue management: round-robin assignment within team queues
- CSAT survey: auto-sent via comm-service when case resolved, score stored on Case
- Live chat widget: embeddable JS snippet → WebSocket → realtime-service → creates case
- Macro/canned response library with template variable substitution
- Case merge: combine duplicate cases into one

**Frontend:**
- `/service/cases` — Case queue view (kanban by status or table by priority)
- `/service/cases/[id]` — Full case detail with timeline, comments, SLA indicator
- `/service/settings/sla` — SLA policy management
- `/service/settings/queues` — Queue management
- Live chat widget builder + install instructions

---

### Phase 17 — Marketing Module
**New service: `marketing-service` (port 3025)**
**Est. LOC:** ~6,000

**Data models:**
```
Campaign: tenantId, name, type (email/social/event/paid), status, budget, startDate, endDate,
           targetSegmentId, utmSource, utmMedium, utmCampaign
CampaignEmail: campaignId, subject, fromName, fromEmail, htmlBody, textBody, sendAt, status
CampaignRecipient: campaignId, contactId/leadId, status, sentAt, openedAt, clickedAt, bouncedAt
LeadSegment: tenantId, name, rules (JSON filter rules — same engine as blueprint-service validation)
LandingPage: tenantId, slug, title, htmlContent, formFields[], redirectUrl, campaignId?
WebForm: tenantId, name, fields[], campaignId?, onSubmit (create lead/contact)
WebVisit: tenantId, contactId?, sessionId, pageUrl, referrer, utmParams, visitedAt
BehaviouralScore: contactId/leadId, scoreBreakdown (JSON: {pageView: N, emailOpen: N, formSubmit: N})
```

**Key features:**
- Segment builder: filter contacts/leads by any field combination (industry, score, last activity, etc.)
- Email campaign builder: drag-and-drop HTML block editor (GrapeJS or Unlayer embedded)
- Campaign send: bulk email to segment, respects do-not-email, bounce management
- Landing page builder: drag-and-drop, hosted on `/lp/{tenantSlug}/{pageSlug}`
- Web-to-lead form: embeddable `<script>` snippet → submits to marketing-service → creates lead
- Website tracking pixel: 1px transparent gif → logs page visit → increments behavioural score
- Lead scoring engine: configurable point rules (email open +5, page visit +2, demo form +20)
- Campaign attribution: when deal won, trace back which campaign the contact was part of
- A/B testing: split a campaign send 50/50 on different subjects, track winner
- Social publishing: post to Twitter/X, LinkedIn via official APIs (schedule posts from CRM)
- UTM link builder with click tracking
- Campaign ROI: total campaign cost vs. revenue from attributed won deals

**Frontend:**
- `/marketing/campaigns` — Campaign list + create
- `/marketing/campaigns/[id]` — Campaign detail, recipients, performance stats
- `/marketing/segments` — Segment builder (visual filter rules)
- `/marketing/pages` — Landing page editor
- `/marketing/forms` — Web form builder + embed code
- Marketing analytics: delivery rate, open rate, click rate, conversion rate, ROI per campaign

---

### Phase 18 — Revenue Intelligence
**Add to `analytics-service` + extend `billing-service`**
**Est. LOC:** ~4,000

**ARR / MRR tracking:**
- `MrrRecord` model (in billing-service): tenantId, period (YYYY-MM), newMrr, expansionMrr, contractionMrr, churnMrr, netMrr
- Background job: monthly calculation from subscription + won deal data
- ARR = MRR × 12
- Revenue waterfall: beginning ARR + new + expansion − contraction − churn = ending ARR

**Revenue recognition (ASC 606 compliant):**
- Contract → recognition schedule (monthly equal installments over contract term)
- `RevenueRecognitionSchedule` model: contractId, period, recognisedAmount, recognisedAt
- Deferred revenue calculation: booked but not yet recognised
- Revenue ledger: all recognition events in chronological order

**Customer LTV calculation:**
- `LtvRecord`: tenantId, accountId, calculatedAt, ltv, paybackPeriod, cac
- LTV formula: Average deal value × Purchase frequency × Average customer lifespan
- CAC: total sales + marketing spend (from campaign budgets) / new customers acquired

**Cohort analysis:**
- Revenue retention by customer cohort (month of first purchase)
- Logo retention (% of customers from cohort still active)
- Revenue expansion index (cohort revenue in month N / cohort revenue in month 0)

**Renewal management:**
- Scan contracts with `endDate` within 90/60/30 days → create renewal deal automatically
- Renewal pipeline (separate pipeline type in crm-service)
- Renewal forecast: expected ARR renewal rate based on health scores

**Frontend:**
- Revenue Intelligence dashboard: ARR waterfall chart, MRR trend, NRR %, LTV by segment
- Cohort retention grid (colour-coded, like a heat map)
- Renewal pipeline tracker
- Revenue recognition ledger view

---

### Phase 19 — Telephony (Voice & Call Intelligence)
**New service: `telephony-service` (port 3026)**
**Est. LOC:** ~5,000

**Architecture:**
```
Browser (WebRTC) ←→ telephony-service ←→ Twilio Voice API
                          ↓
                  Kafka: call.started, call.ended, call.recording_ready
                          ↓
                  ai-service: Whisper transcription → NLP → summary
                          ↓
                  crm-service: activity.created (type=CALL, with transcript)
```

**Data models:**
```
PhoneCall: tenantId, callSid, direction (inbound/outbound), fromNumber, toNumber,
           contactId?, duration, recordingUrl?, transcript?, summary?,
           sentiment?, actionItems[], status, startedAt, endedAt
VoicemailDrop: tenantId, name, audioUrl, duration (pre-recorded messages)
DialerSession: tenantId, agentId, status, currentCallId, queuePosition
```

**Key features:**
- WebRTC softphone embedded in the CRM browser UI (no external app needed)
- Click-to-call: click any phone number → call initiated from browser
- Inbound screen pop: incoming call → automatically opens caller's CRM record
- Call recording: stored in MinIO via storage-service
- Voicemail drop: one-click leave pre-recorded voicemail, move to next call
- Twilio integration: SIP trunking for real phone calls
- Post-call automation: call ends → Whisper transcribes → Ollama summarises → activity auto-created
- Call disposition: rep selects outcome (Connected/No Answer/Left VM/Wrong Number) after call
- Power dialer: auto-dial next contact in a list (for outbound campaigns)
- Call analytics: average call duration, connection rate, best time to call by contact type

**Frontend:**
- Softphone widget (collapsible side panel, available on all pages)
- Inbound call notification (toast + ring tone)
- Call log tab on contact/deal/account detail pages
- Call intelligence panel: transcript viewer, keyword highlights, action items
- Dialer session management

---

### Phase 20 — Advanced Enterprise Administration
**Add to `auth-service` + new `admin-service` (port 3027)**
**Est. LOC:** ~6,000

**Custom Objects engine:**
This is Salesforce's killer feature for enterprise. It lets admins define new data entities
without writing code. Example: a logistics company adds "Shipment" as a custom object;
a legal firm adds "Matter"; a manufacturer adds "Product Line".

Architecture:
```
ObjectDefinition: tenantId, apiName, labelSingular, labelPlural, icon, fields[]
FieldDefinition: objectId, apiName, label, type (text/number/date/select/lookup/formula),
                 required, unique, defaultValue, validationRule, options[]
ObjectRecord: objectId, tenantId, data (JSONB), ownerId, createdAt, updatedAt
ObjectRelation: fromObjectId, toObjectId, relationType (lookup/master-detail)
```

Query engine:
- `GET /api/v1/objects/{objectApiName}` — list records of custom object
- `POST /api/v1/objects/{objectApiName}` — create record
- Dynamic Prisma-equivalent using raw PostgreSQL + JSONB queries
- Meilisearch indexing of custom object records
- Workflow engine can trigger on custom object events

**Custom Fields on standard objects:**
- Currently crm-service has `customFields: Json` JSONB column on Lead, Contact, Account, Deal
- Build a field definition API that renders dynamic form fields in the UI
- Validation rules for custom fields (regex, min/max, required condition)
- Field-level security: hide specific fields from specific roles

**Page Layout engine:**
- Admin defines which fields appear on which section of a detail page
- Different layouts for different Record Types (e.g. Enterprise Deal vs. SMB Deal)
- Conditional field visibility (only show "PO Number" if Account Type = Enterprise)
- Required field indicators that match blueprint-service exit criteria

**Multi-currency:**
- `Currency` model: code, name, symbol, exchangeRate, lastUpdated
- All monetary fields support an optional `currency` column
- Auto-conversion to tenant's base currency for analytics + forecasting
- Exchange rate refresh: background job daily via open exchange rates API

**Duplicate management:**
- `DuplicateRule`: objectType, matchFields, matchThreshold (fuzzy), action (block/warn/merge)
- Levenshtein distance for name matching
- Email domain matching for accounts
- Admin-initiated bulk merge wizard

**GDPR / Data Management:**
- Right-to-erasure: `POST /api/v1/admin/erasure-request` → anonymises all PII for a contact
- Data export: download all data for a contact (DSAR compliance)
- Retention policies: auto-anonymise inactive leads after N days
- Consent audit log: who changed GDPR consent, when, from which IP

---

### Phase 21 — Natural Language Interface ("Ask NEXUS")
**Add to `ai-service` + new `nlq-service` (port 3028)**
**Est. LOC:** ~3,500

This is the single feature that will get the most attention and most demo impact.
Neither Salesforce nor Zoho has made natural language queries truly work.

**Architecture:**
```
User types: "Show me all deals over $50k closing this quarter with no activity in the last 2 weeks"
        ↓
nlq-service: parse intent with Ollama (local LLM, function calling mode)
        ↓
Generate structured query:
{
  entity: "Deal",
  filters: [
    { field: "amount", op: "gte", value: 50000 },
    { field: "closeDate", op: "between", value: ["2026-01-01", "2026-03-31"] },
    { field: "lastActivityDate", op: "lte", value: "2026-02-10" }
  ],
  sort: { field: "amount", dir: "desc" },
  limit: 50
}
        ↓
Execute query against crm-service / analytics-service
        ↓
Return results as a live data table in the chat interface
```

**Capabilities:**
- Entity queries: deals, contacts, accounts, leads, activities, quotes
- Aggregation: "total revenue from enterprise accounts last quarter"
- Comparison: "how did Q1 compare to Q4?"
- Actions: "assign all deals in New York to Sarah" (with confirmation step)
- Insights: "which rep has the longest average sales cycle?"
- Forecasting questions: "will we hit our quota this quarter?"
- Natural language workflow creation: "remind me to follow up with all deals in proposal stage every Friday"

**Safety layer:**
- All destructive actions require explicit confirmation ("Are you sure you want to reassign 12 deals?")
- Read-only queries execute immediately
- Full audit log of all NLQ actions

**Frontend:**
- Global command bar (Cmd+K / Ctrl+K) opens NLQ interface from anywhere
- Results rendered as table, chart, or summary text depending on query type
- "Ask NEXUS" panel on analytics/dashboard pages
- Suggested queries based on current page context
- Query history saved per user

---

### Phase 22 — Partner Relationship Management (PRM)
**New service: `partner-service` (port 3029)**
**Est. LOC:** ~4,500

Salesforce PRM is a $250/user/month add-on. NEXUS includes it.

**Data models:**
```
Partner: tenantId, name, type (reseller/referral/technology/OEM), tier (gold/silver/bronze),
         status, contractId?, region, contactId, portalAccess
DealRegistration: partnerId, tenantId, dealId?, accountName, contactName, estimatedValue,
                  status (pending/approved/rejected/converted), expiresAt
PartnerIncentive: partnerId, type (MDF/spiff/rebate), amount, currency, status, period
MdfRequest: partnerId, name, purpose, requestedAmount, approvedAmount, status, receipts[]
```

**Key features:**
- Partner portal: separate login for partner users (partner.nexuscrm.io/{tenant})
- Deal registration: partner submits a lead/deal → vendor reviews, approves, protects registration
- Deal registration protection: if partner registered a deal first, they get credit even if vendor's rep later engages
- MDF management: Market Development Funds request, approval, reconciliation
- Partner performance dashboard: pipeline, closed won, attach rate, by partner
- Partner tier management: auto-promote/demote based on performance metrics
- Co-selling: partner can be added as a collaborator on a deal (sees limited fields)
- Partner onboarding workflow: automated welcome sequence, training material access

---

### Phase 23 — Social CRM + Data Enrichment
**Extend `integration-service` + new capabilities**
**Est. LOC:** ~3,000

**Social monitoring:**
- Monitor Twitter/X for @mentions and keywords
- Monitor LinkedIn for job changes at key accounts (signals for outreach)
- `SocialMention`: platform, author, content, sentiment, linkedContactId?, createdAt
- Auto-create lead from social mention (configurable)
- Push social activity into contact/account timeline

**Data enrichment:**
- Clearbit-compatible enrichment API: given email/domain → return company + person data
- Auto-enrich: on lead created with email → lookup → fill in company, industry, employee count, etc.
- LinkedIn enrichment: given LinkedIn URL → scrape public profile data (where legally permitted)
- NEXUS can integrate with open-source alternatives: Hunter.io, Apollo.io, Snov.io

**Data quality:**
- Duplicate detection on import (CSV upload deduplication wizard)
- Email validation (verify deliverability before sending)
- Phone number formatting (E.164 international standard)
- Address validation and geocoding

---

### Phase 24 — Native Integrations Ecosystem
**Extend `integration-service`**
**Est. LOC:** ~5,000

**Priority native connectors:**

| Integration | What it does | Why critical |
|-------------|-------------|--------------|
| QuickBooks Online | Two-way invoice/payment sync | SMB accounting |
| Xero | Two-way invoice/payment sync | International SMB accounting |
| Stripe | Payment links, subscription sync | SaaS billing |
| LinkedIn Sales Navigator | Lead data + InMail send | B2B prospecting |
| ZoomInfo / Apollo.io | Contact + company enrichment | Data quality |
| Slack | Deal notifications, approval actions | Team comms |
| Microsoft Teams | Same as Slack | Enterprise comms |
| Google Workspace | Calendar, Gmail, Drive | Productivity |
| Microsoft 365 | Outlook, Teams, OneDrive | Enterprise productivity |
| Shopify | Customer + order sync | E-commerce CRM |
| DocuSign | E-signature | Contracts |
| Twilio | SMS + voice | Telephony |
| Mailchimp | Campaign sync | Email marketing |
| HubSpot (migration) | Import from HubSpot | Win switchers |
| Salesforce (migration) | Import from Salesforce | Win switchers |

**Zapier / Make compatibility:**
- NEXUS as Zapier trigger: any Kafka event exposed as Zapier trigger
- NEXUS as Zapier action: POST to public NEXUS webhook to create/update records
- This instantly gives NEXUS 5,000+ app integrations through Zapier

---

### Phase 25 — Advanced BI & Embedded Analytics
**Extend `reporting-service` + add `bi-service` (port 3030)**
**Est. LOC:** ~5,500

**Capabilities:**
- Custom dashboard builder: drag-and-drop widgets (chart, number, table, map, funnel)
- 6 chart types: bar, line, area, pie/donut, scatter, heatmap (all via recharts + D3.js)
- Cross-object analytics: combine deal + activity + email data in one chart
- ClickHouse materialized views for common complex aggregations (pre-computed for speed)
- Embedded analytics: share a dashboard publicly or embed in another app via iframe + token
- Drill-down: click any chart bar → filtered table of underlying records
- Scheduled snapshots: daily PDF of key dashboards emailed to management
- Data export: any report → XLSX, CSV, PDF
- White-label: customer-facing dashboards with their own logo (used in portal-service)

**Pre-built executive dashboards:**
- CEO: Revenue waterfall, pipeline coverage, win rate trend, headcount efficiency
- VP Sales: Quota attainment by rep, forecast accuracy, pipeline velocity, churn risk
- Marketing: Campaign ROI, lead source attribution, funnel conversion, CAC trend
- Customer Success: NPS trend, health score distribution, renewal rate, escalated cases
- Finance: ARR/MRR trend, deferred revenue, commission payable, invoice aging

---

## SECTION 5 — REVISED FULL PHASE MAP

| Phase | Focus | New Services | Est. LOC Added | Cumulative |
|-------|-------|-------------|----------------|------------|
| 1–4 | Core CRM built | 11 services | 32,689 | 32,689 |
| 5 | Analytics fix + billing + integration + blueprint | +3 | 2,800 | 35,489 |
| 6 | Frontend sprint (detail pages, quote builder, charts) | 0 | 4,500 | 39,989 |
| 7 | Approval engine + Document service | +2 | 4,200 | 44,189 |
| 8 | Chatbot + Auto-quoting (WhatsApp + Telegram) | +1 | 4,500 | 48,689 |
| 9 | Calendar + Email inbox + Maps | 0 | 5,000 | 53,689 |
| 10 | Cadence engine + Territory management | +2 | 4,500 | 58,189 |
| 11 | Planning + Forecasting + Reporting | +2 | 5,500 | 63,689 |
| 12 | Customer portal + Knowledge base + Incentives | +3 | 4,000 | 67,689 |
| 13 | Mobile app (React Native + Expo) | +1 app | 12,000 | 79,689 |
| 14 | AI Enhancement (NLQ, call intelligence, churn) | +1 | 3,500 | 83,189 |
| 15 | Production hardening + Full test suite | 0 | 25,000 | 108,189 |
| 16 | Customer Service Module (Service Cloud rival) | +1 | 5,500 | 113,689 |
| 17 | Marketing Module (Marketing Cloud rival) | +1 | 6,000 | 119,689 |
| 18 | Revenue Intelligence (ARR/MRR/LTV/Cohorts) | 0 | 4,000 | 123,689 |
| 19 | Telephony + Call Intelligence | +1 | 5,000 | 128,689 |
| 20 | Enterprise Admin (custom objects, multi-currency, GDPR) | +1 | 6,000 | 134,689 |
| 21 | Natural Language Interface ("Ask NEXUS") | +1 | 3,500 | 138,189 |
| 22 | Partner Relationship Management | +1 | 4,500 | 142,689 |
| 23 | Social CRM + Data Enrichment | 0 | 3,000 | 145,689 |
| 24 | Native Integrations (QuickBooks, LinkedIn, Slack, etc.) | 0 | 5,000 | 150,689 |
| 25 | Advanced BI + Embedded Analytics | +1 | 5,500 | 156,189 |

**After Phase 25: ~156,000 production LOC**

**To reach 300k–500k (the full target):**
| Additional source | LOC |
|------------------|-----|
| Full test suite at 80% coverage (unit + integration + e2e) | ~90,000 |
| React Native mobile app full depth | +18,000 |
| Infrastructure-as-code (Terraform + Helm charts) | ~15,000 |
| OpenAPI generated client SDKs (TypeScript + Python) | ~12,000 |
| Full multi-language i18n (EN + AR + FR + ES + DE) | ~15,000 |
| Event sourcing full audit store (Kafka log replay) | ~20,000 |
| Additional test scenarios + load tests | ~15,000 |
| **Grand total** | **~341,000 LOC** |

---

## SECTION 6 — THE FEATURE PARITY TABLE (End State)

| Feature Category | Salesforce | Zoho | NEXUS (after Phase 25) |
|----------------|-----------|------|----------------------|
| Core CRM (deals, contacts, accounts) | ✅ | ✅ | ✅ |
| CPQ / Quoting | ✅ (+$$$) | ✅ | ✅ **Better** (10-rule waterfall, decimal.js) |
| Automated quoting via WhatsApp/Telegram | ❌ | Partial | ✅ **NEXUS ONLY** |
| Approval workflows | ✅ | ✅ | ✅ |
| Email automation / sequences | ✅ | ✅ | ✅ |
| Marketing campaigns | ✅ (+$$$) | ✅ | ✅ Phase 17 |
| Landing pages + web forms | ✅ (+$$$) | ✅ | ✅ Phase 17 |
| Website visitor tracking | ✅ (+$$$) | ✅ | ✅ Phase 17 |
| Customer Service / Cases | ✅ (+$$$) | ✅ | ✅ Phase 16 |
| SLA management | ✅ | ✅ | ✅ Phase 16 |
| Live chat widget | ✅ (+$$$) | ✅ | ✅ Phase 16 |
| Workflow / Process automation | ✅ | ✅ | ✅ **Better** (14 node types, parallel fork) |
| Sales cadences / sequences | ✅ | ✅ | ✅ Phase 10 |
| Territory management | ✅ (+$$$) | ✅ | ✅ Phase 10 |
| Quota & planning | ✅ | ✅ | ✅ Phase 11 |
| Forecasting | ✅ | ✅ | ✅ Phase 11 |
| Custom report builder | ✅ | ✅ | ✅ Phase 11 |
| ARR / MRR / Revenue Intelligence | ✅ (+$$$) | Partial | ✅ Phase 18 |
| Revenue recognition (ASC 606) | ✅ (+$$$) | ❌ | ✅ Phase 18 |
| Cohort analysis | Partial | ❌ | ✅ Phase 18 |
| Telephony / Softphone | ✅ | ✅ | ✅ Phase 19 |
| Call recording + transcription | ✅ (+$$$) | ✅ | ✅ Phase 19 **Better** (local Whisper) |
| Call intelligence / sentiment | ✅ (+$$$) | Partial | ✅ Phase 19 **Better** (local AI) |
| Custom objects | ✅ | ✅ | ✅ Phase 20 |
| Custom fields | ✅ | ✅ | ✅ Phase 20 |
| Multi-currency | ✅ | ✅ | ✅ Phase 20 |
| GDPR / Data management | ✅ | ✅ | ✅ Phase 20 |
| Natural language queries | Partial (Einstein) | Partial (Zia) | ✅ Phase 21 **Better** (local, private) |
| Partner portal / PRM | ✅ (+$$$) | ✅ | ✅ Phase 22 |
| Social CRM | ✅ | ✅ | ✅ Phase 23 |
| Data enrichment | ✅ (+$$$) | ✅ | ✅ Phase 23 |
| Native integrations | ✅ 5000+ | ✅ 800+ | ✅ Phase 24 + Zapier = 5000+ |
| Advanced BI / Embedded analytics | ✅ (Tableau) | Partial | ✅ Phase 25 |
| Customer portal (quote accept) | ✅ | ✅ | ✅ Phase 12 |
| Document generation / e-sign | ✅ (+$$$) | ✅ | ✅ Phase 7 |
| Mobile app | ✅ | ✅ | ✅ Phase 13 |
| Open source / self-hosted | ❌ | ❌ | ✅ **NEXUS ONLY** |
| Local AI (data never leaves server) | ❌ | ❌ | ✅ **NEXUS ONLY** |
| Real-time collaborative editing | ❌ | ❌ | ✅ **NEXUS ONLY** |
| Price | $150–300/user/mo | $14–52/user/mo | **FREE** |

**Final score:** NEXUS after Phase 25 matches or exceeds every major feature of Salesforce Sales Cloud
and Zoho CRM, and beats both on privacy, cost, real-time collaboration, and chatbot quoting.

---

## SECTION 7 — THE DIFFERENTIATING PITCH

After Phase 25, NEXUS can be positioned as:

> **"The only CRM that combines Salesforce's power, Zoho's breadth, and neither's price or privacy trade-offs.
> Self-hosted, AI-native, WhatsApp-first, real-time collaborative, and completely free."**

**The 5 things that make enterprises choose NEXUS over Salesforce:**
1. Data never leaves your infrastructure (compliance, sovereignty)
2. No per-seat pricing — scale from 10 to 10,000 users at the same cost
3. WhatsApp/Telegram automated quoting out of the box
4. Natural language interface powered by your own private LLM
5. Full developer access — customise anything, no Apex, no Salesforce-specific language

**The 5 things that make SMBs choose NEXUS over Zoho:**
1. Single unified platform (not 40 separate Zoho apps to manage)
2. Real-time live updates across the whole team
3. Chatbot quoting — critical in WhatsApp-first markets (UAE, India, LatAm)
4. Better AI (local, trained on their data, explainable)
5. No vendor lock-in — your data is always yours

---

*This document defines the complete product vision for NEXUS CRM.*
*Current phases 1–15 are planned in NEXUS_MASTER_BUILD_PLAN.md.*
*Phases 16–25 above extend that plan to full Salesforce + Zoho parity and beyond.*
