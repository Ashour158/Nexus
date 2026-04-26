# NEXUS CRM — Complete Zoho Feature Map + Beyond
## Built for internal use by a 6-year Zoho power user

**Legend:**
- ✅ Built and working
- 🔄 Planned (phase number)
- 🆕 Not yet in plan — needs adding
- 💡 Beyond Zoho — doesn't exist in Zoho at all

---

## MODULE 1 — LEADS

| Feature | Zoho Has | NEXUS Status | Notes |
|---------|----------|-------------|-------|
| Lead capture (manual entry) | ✅ | ✅ | Full model with all fields |
| Lead source tracking (UTM) | ✅ | ✅ | utmSource/Medium/Campaign/Content/Term on Lead |
| Lead status workflow (New→Qualified→Converted) | ✅ | ✅ | 6 status values |
| Lead rating (Hot/Warm/Cold) | ✅ | ✅ | LeadRating enum |
| Lead score (AI + manual) | ✅ | ✅ | `score` + `aiScore` + `aiScoreReason` |
| Lead conversion (→ Contact + Account + Deal) | ✅ | 🆕 | **Missing**: one-click convert with field mapping UI |
| GDPR consent tracking | ✅ | ✅ | `gdprConsent` + `gdprConsentAt` |
| Do Not Contact flag | ✅ | ✅ | `doNotContact` |
| Web-to-lead forms | ✅ | 🔄 Phase 17 | |
| Lead import (CSV/Excel) | ✅ | 🆕 | **Missing**: import wizard with field mapping |
| Lead assignment rules (auto-assign) | ✅ | 🔄 Phase 10 | territory-service |
| Lead scoring rules (field-based) | ✅ | 🆕 | **Missing**: configurable scoring rules engine |
| Behavioral scoring (email opens, page visits) | ✅ | 🔄 Phase 17 | marketing-service |
| Duplicate lead detection | ✅ | 🆕 | **Missing**: on-save duplicate check |
| Lead timeline | ✅ | ✅ | Activities + notes |
| Lead activities | ✅ | ✅ | All activity types linked to leadId |
| Lead notes | ✅ | ✅ | notes.service with leadId |
| Lead attachments | ✅ | 🆕 | **Missing**: file attachment UI on lead record |
| Lead follow-up reminder | ✅ | 🆕 | **Missing**: "Remind me in X days" quick action |
| @Mention colleagues in notes | ✅ | 🆕 | **Missing**: @mention with notification |
| Lead social profiles (LinkedIn/Twitter) | ✅ | ✅ | linkedInUrl + twitterHandle fields |
| Lead enrichment (auto-fill from email) | ✅ | 🔄 Phase 23 | data enrichment service |
| Business card scan → lead | ✅ | 🔄 Phase 13 | mobile app OCR |
| Lead kanban view | ✅ | 🆕 | **Missing**: kanban view for leads (only list today) |
| Custom fields on leads | ✅ | ✅ | `customFields` JSONB + 🆕 needs field definition UI |
| Tags | ✅ | ✅ | `tags` array |
| Mass update leads | ✅ | 🆕 | **Missing**: bulk select + bulk field update |
| Mass delete leads | ✅ | 🆕 | **Missing**: bulk delete |
| Mass reassign leads | ✅ | 🆕 | **Missing**: bulk reassign to different owner |
| Export leads (CSV/Excel) | ✅ | 🆕 | **Missing**: module-level export button |
| Recycle bin (recover deleted) | ✅ | 🆕 | **Missing**: soft delete + recycle bin |
| Field history / audit trail | ✅ | 🆕 | **Missing**: who changed which field from→to, when |
| Custom views / saved filters | ✅ | 🆕 | **Missing**: save a named filter view per user |
| Column chooser | ✅ | 🆕 | **Missing**: add/remove/reorder list columns |
| Inline editing in list | ✅ | 🆕 | **Missing**: click field in list to edit in-place |
| Group by field | ✅ | 🆕 | **Missing**: group list by any field |

---

## MODULE 2 — CONTACTS

| Feature | Zoho Has | NEXUS Status | Notes |
|---------|----------|-------------|-------|
| Full contact profile | ✅ | ✅ | Rich data model |
| Multiple email addresses | ✅ | 🆕 | **Missing**: only one email today; need emails[] array |
| Multiple phone numbers (work/mobile/home) | ✅ | ✅ | `phone` + `mobile` |
| Multiple addresses (billing/shipping/other) | ✅ | 🆕 | **Missing**: only one address; need addresses[] |
| Contact–account relationship | ✅ | ✅ | `accountId` FK |
| Multiple accounts per contact | ✅ | 🆕 | **Missing**: contact can belong to multiple accounts |
| Contact picture/avatar | ✅ | 🆕 | **Missing**: profile photo upload via storage-service |
| Contact detail page (full 360°) | ✅ | 🔄 Phase 6 | being built now |
| Contact timeline (all interactions) | ✅ | 🔄 Phase 6 | being built now |
| Linked deals | ✅ | 🔄 Phase 6 | being built now |
| Contact activities | ✅ | ✅ | activities.service with contactId |
| Contact notes with @mentions | ✅ | 🆕 | @mention part missing |
| Contact attachments | ✅ | 🆕 | **Missing**: file attachment UI |
| Contact email history | ✅ | 🔄 Phase 9 | Gmail/Outlook sync |
| Contact call log | ✅ | 🔄 Phase 19 | telephony-service |
| Do Not Email / Do Not Call | ✅ | ✅ | `doNotEmail` + `doNotCall` |
| GDPR consent | ✅ | ✅ | `gdprConsent` + `gdprConsentAt` |
| Last contacted tracking | ✅ | ✅ | `lastContactedAt` |
| Social profile links | ✅ | ✅ | LinkedIn + Twitter |
| Custom fields | ✅ | ✅ | JSONB + 🆕 needs field definition UI |
| Contact–deal linking | ✅ | ✅ | DealContact junction |
| Convert contact to lead | ✅ | 🆕 | **Missing**: reverse conversion |
| Merge duplicate contacts | ✅ | 🆕 | **Missing**: merge wizard |
| Mass operations | ✅ | 🆕 | See leads mass ops above |
| Contact scoring | ✅ | 🆕 | **Missing**: scoring rules on contacts |
| Preferred communication channel | ✅ | ✅ | `preferredChannel` field |
| Timezone | ✅ | ✅ | `timezone` field |
| "Best time to contact" suggestion | ✅ | 💡 | AI-suggested from call/email history patterns |
| Contact portal access | ✅ | 🔄 Phase 12 | portal-service |
| WhatsApp conversation thread | ❌ | 💡 | **NEXUS ONLY**: click phone → start WhatsApp bot |

---

## MODULE 3 — ACCOUNTS

| Feature | Zoho Has | NEXUS Status | Notes |
|---------|----------|-------------|-------|
| Full account profile | ✅ | ✅ | Rich model (tier, type, status, NPS, health) |
| Parent–child hierarchy | ✅ | ✅ | `parentAccountId` self-relation |
| Account health score | ✅ | ✅ | `healthScore` + `getAccountHealth` |
| NPS score | ✅ | ✅ | `npsScore` |
| Multiple addresses (billing/shipping) | ✅ | 🆕 | **Missing**: only one address block today |
| Industry + SIC + NAICS codes | ✅ | ✅ | All three fields present |
| Account type (Customer/Prospect/Partner) | ✅ | ✅ | AccountType enum |
| Account tier (SMB/MidMarket/Enterprise/Strategic) | ✅ | ✅ | AccountTier enum |
| Account owner | ✅ | ✅ | `ownerId` |
| Account contacts list | ✅ | 🔄 Phase 6 | Accounts tab: Contacts |
| Account deals list | ✅ | 🔄 Phase 6 | Accounts tab: Deals |
| Account activities | ✅ | ✅ | Activities linked to accountId |
| Account timeline | ✅ | ✅ | `getAccountTimeline` |
| Account notes | ✅ | ✅ | Notes with accountId |
| Account attachments | ✅ | 🆕 | **Missing**: file attachment UI |
| Account email history | ✅ | 🔄 Phase 9 | Gmail/Outlook sync |
| Account-level revenue | ✅ | ✅ | Via linked deals aggregation |
| Account map view (pin on map) | ✅ | 🔄 Phase 9 | Google Maps integration |
| Merge duplicate accounts | ✅ | 🆕 | **Missing**: merge wizard |
| Account contracts | ✅ | ✅ | `contracts.service` linked by accountId |
| Account invoices | ✅ | ✅ | `invoices.service` linked by accountId |
| Account subscriptions | ✅ | 🔄 Phase 5 | billing-service |
| Account competitor tracking | ✅ | 🆕 | **Missing**: competitors module |
| Account news/events feed | ❌ | 💡 | Auto-pull news articles about the company |
| Churn risk prediction | ❌ | 🔄 Phase 14 | AI churn predictor |
| Customer lifetime value | ❌ | 🔄 Phase 18 | Revenue Intelligence |
| Account-level WhatsApp history | ❌ | 💡 | See all WhatsApp conversations for contacts at this account |

---

## MODULE 4 — DEALS / OPPORTUNITIES

| Feature | Zoho Has | NEXUS Status | Notes |
|---------|----------|-------------|-------|
| Deal kanban board (pipeline view) | ✅ | ✅ | Full kanban |
| Multiple pipelines | ✅ | ✅ | Pipeline + Stage models |
| Stage progression with confirmation | ✅ | ✅ | `stageConfirm` state in deal detail |
| Deal won / lost workflow | ✅ | ✅ | `markDealWon` / `markDealLost` with lost reason |
| Lost reason + detail | ✅ | ✅ | `lostReason` + `lostDetail` |
| MEDDIC/MEDDPICC scoring | ❌ | ✅ | **NEXUS BETTER** — full MEDDIC framework built-in |
| AI win probability | ✅ | ✅ | `aiWinProbability` from ML model |
| AI deal insights | ✅ | ✅ | `aiInsights` JSON per deal |
| Forecast category (Commit/BestCase/Pipeline) | ✅ | ✅ | ForecastCategory enum |
| Expected close date | ✅ | ✅ | `expectedCloseDate` |
| Deal source tracking | ✅ | ✅ | `source` field |
| Campaign attribution | ✅ | ✅ | `campaignId` field (campaign module Phase 17) |
| Competitors on deal | ✅ | ✅ | `competitors` string array — 🆕 needs Competitor *module* |
| Deal contacts (multiple) | ✅ | ✅ | DealContact junction |
| Deal activities | ✅ | ✅ | All types linked to dealId |
| Deal notes | ✅ | ✅ | Full notes with pin |
| Deal quotes | ✅ | ✅ | Full quote lifecycle |
| Deal files/attachments | ✅ | 🆕 | **Missing**: attachment UI on deal record |
| Deal stage exit validation | ✅ | ✅ | blueprint-service Stage Exit Criteria |
| Approval for high-value deals | ✅ | 🔄 Phase 7 | approval-service |
| Deal timeline | ✅ | ✅ | Full unified timeline in deal detail |
| Deal stagnation alert | ✅ | 🆕 | **Missing**: alert if deal hasn't moved in N days |
| Deal split credit (multiple owners) | ✅ | 🆕 | **Missing**: split deal credit between reps |
| Deal rooms (shared deal workspace) | ❌ | 💡 | **Beyond Zoho**: shared doc space per deal |
| Real-time collaborative deal editing | ❌ | 💡 | **Beyond Zoho**: Socket.io multi-user editing |
| Custom fields | ✅ | ✅ | JSONB + needs UI |
| Tags | ✅ | ✅ | |
| Mass operations | ✅ | 🆕 | Bulk update / reassign / delete |
| Export | ✅ | 🆕 | CSV/Excel export |
| Recycle bin | ✅ | 🆕 | |
| Field history | ✅ | 🆕 | |
| Predictive close date (AI) | ❌ | 💡 | AI predicts actual close vs. rep estimate |
| Sentiment tracking on deal communications | ❌ | 💡 | Aggregate email/call sentiment per deal |

---

## MODULE 5 — ACTIVITIES (Calls, Meetings, Tasks, Events)

| Feature | Zoho Has | NEXUS Status | Notes |
|---------|----------|-------------|-------|
| Call logging (manual) | ✅ | ✅ | ActivityType.CALL |
| Call duration tracking | ✅ | ✅ | `duration` field (minutes) |
| Call outcome codes | ✅ | 🆕 | **Missing**: standard outcome enum (Connected/No Answer/Left VM/Wrong Number/Busy) |
| Inbound / Outbound call direction | ✅ | 🆕 | **Missing**: `direction` field on Activity |
| One-click call from record (softphone) | ✅ | 🔄 Phase 19 | telephony-service |
| Call recording auto-attach | ✅ | 🔄 Phase 19 | Whisper transcription |
| Meeting scheduling | ✅ | 🔄 Phase 9 | Calendar integration + scheduler |
| Meeting room / video link | ✅ | 🆕 | **Missing**: `meetingUrl` field on Activity |
| Activity reminders (browser notification) | ✅ | 🆕 | **Missing**: push notification N minutes before due |
| Follow-up quick-create ("Remind me in 3 days") | ✅ | 🆕 | **Missing**: one-click follow-up from any record |
| Activity calendar view (week/month) | ✅ | 🔄 Phase 6 | activities page improvements |
| Google Calendar sync | ✅ | 🔄 Phase 9 | |
| Outlook Calendar sync | ✅ | 🔄 Phase 9 | |
| Task assignment to other users | ✅ | ✅ | `ownerId` on Activity |
| Task priority (Low/Normal/High/Urgent) | ✅ | ✅ | ActivityPriority enum |
| Recurring activities | ✅ | 🆕 | **Missing**: recurrence rules (daily/weekly/monthly) |
| Activity check-in (GPS, for field visits) | ✅ | 🔄 Phase 13 | mobile app location |
| Activity email confirmation | ✅ | 🆕 | **Missing**: send meeting invite email to contact |
| Bulk reschedule | ✅ | 🆕 | **Missing**: bulk update due dates |
| Activity report (by type, by rep) | ✅ | ✅ | activity.analytics.ts (fixed in Phase 5) |
| Overdue activity alerts | ✅ | 🔄 Phase 6 | Overdue tab being added |
| Activity templates | ✅ | 🆕 | **Missing**: save activity templates (e.g. "Intro Call" with standard notes template) |
| Meeting notes auto-template | 🆕 | 💡 | Pre-fill meeting notes with agenda template |
| Whisper transcription of calls/meetings | ❌ | 🔄 Phase 19 | **Beyond Zoho**: local private AI transcription |
| AI meeting summary & action items | ❌ | 🔄 Phase 14 | **Beyond Zoho**: auto-extract todos from transcript |

---

## MODULE 6 — EMAIL

| Feature | Zoho Has | NEXUS Status | Notes |
|---------|----------|-------------|-------|
| Send email from record | ✅ | 🆕 | **Missing**: compose + send email directly from contact/deal page |
| Email templates | ✅ | ✅ | comm-service templates with {{variable}} |
| Email tracking (open/click) | ✅ | ✅ | comm-service trackOpen/trackClick |
| Email threading on contact | ✅ | 🔄 Phase 9 | Gmail/Outlook two-way sync |
| BCC-to-CRM (auto-log via BCC address) | ✅ | 🆕 | **Missing**: unique BCC address per rep → auto-logs to CRM |
| Gmail integration | ✅ | 🔄 Phase 9 | |
| Outlook integration | ✅ | 🔄 Phase 9 | |
| Mass email from module view | ✅ | 🔄 Phase 17 | marketing-service campaigns |
| Email sequences / drip | ✅ | ✅ | comm-service sequences |
| Email delivery reports | ✅ | ✅ | outbox tracking |
| Bounce + unsubscribe handling | ✅ | 🆕 | **Missing**: bounce list, auto-unsubscribe on opt-out link |
| Email scheduling (send later) | ✅ | 🆕 | **Missing**: schedule email for future time |
| Email signature management | ✅ | 🆕 | **Missing**: per-user email signature stored in profile |
| Reply suggestions (AI) | ❌ | 🔄 Phase 14 | **Beyond Zoho**: Ollama-powered reply drafts |
| Sentiment analysis on emails | ❌ | 🔄 Phase 14 | **Beyond Zoho**: track customer tone over time |

---

## MODULE 7 — QUOTES & CPQ

| Feature | Zoho Has | NEXUS Status | Notes |
|---------|----------|-------------|-------|
| Quote creation | ✅ | ✅ | Full CPQ |
| Quote line items | ✅ | 🔄 Phase 6 | quote builder being built |
| Quote PDF generation | ✅ | 🔄 Phase 7 | document-service |
| Quote email to customer | ✅ | ✅ | `sendQuote` → comm-service |
| Quote accept/reject by customer | ✅ | 🔄 Phase 12 | portal-service |
| Quote expiry date | ✅ | ✅ | |
| Quote versioning (v1, v2, v3) | ✅ | 🆕 | **Missing**: track quote revision history |
| Quote comparison (3 options: Good/Better/Best) | ✅ | 🆕 | **Missing**: multi-option quote in one document |
| Product catalog | ✅ | ✅ | products.service + PriceTier |
| Price books (different prices per segment) | ✅ | 🆕 | **Missing**: PriceBook model — SMB/Enterprise/Partner pricing |
| Discount scheduling (volume tiers) | ✅ | ✅ | 10-rule CPQ waterfall |
| Promo codes | ✅ | ✅ | PromoCode model |
| Tax calculation | ✅ | 🆕 | **Missing**: tax rate rules by region (or manual rate) |
| Multi-currency quotes | ✅ | 🔄 Phase 20 | |
| Quote approval workflow | ✅ | 🔄 Phase 7 | approval-service |
| Sales order from accepted quote | ✅ | 🆕 | **Missing**: SalesOrder model (quote → order) |
| Product bundles | ✅ | ✅ | bundle pricing rule in CPQ |
| Guided selling / product configurator | ✅ | 🆕 | **Missing**: decision-tree product selection |
| E-signature on quotes | ✅ | 🔄 Phase 7 | document-service DocuSign |
| Customer quote portal | ✅ | 🔄 Phase 12 | portal-service |
| Automated quoting via WhatsApp | ❌ | 🔄 Phase 8 | **Beyond Zoho**: chatbot-service |
| Automated quoting via Telegram | ❌ | 🔄 Phase 8 | **Beyond Zoho**: chatbot-service |
| Quote acceptance analytics (time to accept, etc.) | ❌ | 💡 | Track how long quotes sit before response |
| CPQ decimal precision (no floating-point errors) | ❌ | ✅ | **NEXUS BETTER**: decimal.js throughout |

---

## MODULE 8 — PRODUCTS & PRICE BOOKS

| Feature | Zoho Has | NEXUS Status | Notes |
|---------|----------|-------------|-------|
| Product catalog | ✅ | ✅ | |
| Product pricing tiers | ✅ | ✅ | PriceTier model |
| Product categories | ✅ | 🆕 | **Missing**: category/subcategory on Product |
| Product images | ✅ | 🆕 | **Missing**: product image upload via storage-service |
| Product availability flag | ✅ | ✅ | `isActive` |
| Product units (each, kg, hour) | ✅ | 🆕 | **Missing**: `unit` field (each/hour/kg/license/seat) |
| Price books (multiple pricing lists) | ✅ | 🆕 | **Missing**: PriceBook model — see Zoho price books |
| Price book assignment per account/segment | ✅ | 🆕 | Account → PriceBook assignment |
| Product variants (size, color, config) | ✅ | 🆕 | **Missing**: ProductVariant model |
| Bill of Materials (product components) | ✅ | 🆕 | **Missing**: BOM for configurable products |
| Product performance analytics | ✅ | 🔄 Phase 11 | reporting-service |

---

## MODULE 9 — SALES ORDERS & PURCHASE ORDERS

| Feature | Zoho Has | NEXUS Status | Notes |
|---------|----------|-------------|-------|
| Sales Orders | ✅ | 🆕 | **Completely missing** — needs SalesOrder model |
| Sales order from quote | ✅ | 🆕 | Quote accepted → auto-create SalesOrder |
| Sales order PDF | ✅ | 🔄 Phase 7 | document-service |
| Sales order fulfillment status | ✅ | 🆕 | Pending/Processing/Fulfilled/Cancelled |
| Purchase Orders | ✅ | 🆕 | **Completely missing** — needs PurchaseOrder model |
| Vendor management | ✅ | 🆕 | **Missing**: Vendor model (supplier database) |
| Purchase order approval | ✅ | 🔄 Phase 7 | approval-service |
| PO PDF generation | ✅ | 🔄 Phase 7 | document-service |

---

## MODULE 10 — INVOICES & PAYMENTS

| Feature | Zoho Has | NEXUS Status | Notes |
|---------|----------|-------------|-------|
| Invoice creation | ✅ | ✅ | invoices.service |
| Invoice from sales order | ✅ | 🆕 | Needs SalesOrder first |
| Invoice PDF | ✅ | 🔄 Phase 7 | document-service |
| Payment recording | ✅ | ✅ | Payment model |
| Payment methods | ✅ | ✅ | PaymentMethod enum |
| Partial payments | ✅ | 🆕 | **Missing**: multiple payments per invoice |
| Payment reminders | ✅ | 🆕 | **Missing**: auto-send overdue payment reminder |
| Invoice aging report | ✅ | 🔄 Phase 11 | reporting-service |
| Online payment link | ✅ | 🔄 Phase 12 | portal-service |
| Stripe payment processing | ✅ | ✅ | billing-service Stripe integration |
| Tax on invoices | ✅ | 🆕 | **Missing**: tax line on Invoice |
| Multi-currency invoices | ✅ | 🔄 Phase 20 | |
| Recurring invoices | ✅ | 🆕 | **Missing**: recurring invoice schedule |
| Credit notes | ✅ | 🆕 | **Missing**: CreditNote model (refund/adjustment) |
| QuickBooks sync | ✅ | 🔄 Phase 24 | |
| Xero sync | ✅ | 🔄 Phase 24 | |

---

## MODULE 11 — CONTRACTS

| Feature | Zoho Has | NEXUS Status | Notes |
|---------|----------|-------------|-------|
| Contract creation | ✅ | ✅ | contracts.service (186 LOC) |
| Contract number (auto-generated) | ✅ | ✅ | `generateContractNumber` |
| Contract sign / terminate | ✅ | ✅ | `signContract` / `terminateContract` |
| Contract PDF generation | ✅ | 🔄 Phase 7 | document-service |
| E-signature | ✅ | 🔄 Phase 7 | DocuSign integration |
| Contract templates | ✅ | 🔄 Phase 7 | document-service templates |
| Contract versioning | ✅ | 🆕 | **Missing**: track contract revisions |
| Contract renewal management | ✅ | 🔄 Phase 18 | Revenue Intelligence |
| Contract value reporting | ✅ | ✅ | Via finance analytics |
| Multi-party contracts | ✅ | 🆕 | **Missing**: multiple signers |
| Contract milestone tracking | ✅ | 🆕 | **Missing**: delivery milestones on contracts |

---

## MODULE 12 — CAMPAIGNS & MARKETING

| Feature | Zoho Has | NEXUS Status | Notes |
|---------|----------|-------------|-------|
| Campaign management | ✅ | 🔄 Phase 17 | marketing-service |
| Email campaigns (bulk send) | ✅ | 🔄 Phase 17 | |
| Campaign budget tracking | ✅ | 🔄 Phase 17 | |
| Campaign ROI / attribution | ✅ | 🔄 Phase 17 | |
| Web-to-lead forms | ✅ | 🔄 Phase 17 | |
| Landing pages | ✅ | 🔄 Phase 17 | |
| Website visitor tracking | ✅ | 🔄 Phase 17 | |
| Lead scoring from behavior | ✅ | 🔄 Phase 17 | |
| A/B email testing | ✅ | 🔄 Phase 17 | |
| UTM tracking | ✅ | ✅ | Lead model has all 5 UTM fields |
| Social media publishing | ✅ | 🔄 Phase 23 | |
| Campaign member management | ✅ | 🔄 Phase 17 | |

---

## MODULE 13 — REPORTS & DASHBOARDS

| Feature | Zoho Has | NEXUS Status | Notes |
|---------|----------|-------------|-------|
| Pre-built reports (30+) | ✅ | 🔄 Phase 11 | reporting-service |
| Custom report builder | ✅ | 🔄 Phase 11 | |
| Cross-module reports | ✅ | 🔄 Phase 11 | |
| Dashboard with widgets | ✅ | 🔄 Phase 6 (charts) | recharts charts being added |
| Drag-and-drop dashboard | ✅ | 🔄 Phase 25 | advanced BI |
| Scheduled reports (email) | ✅ | 🔄 Phase 11 | |
| Export reports (Excel/PDF) | ✅ | 🔄 Phase 11 | |
| Funnel analytics | ✅ | ✅ | pipeline.analytics.ts (fixed) |
| Revenue analytics | ✅ | ✅ | revenue.analytics.ts |
| Activity analytics | ✅ | ✅ | activity.analytics.ts (fixed) |
| Forecast accuracy report | ✅ | 🔄 Phase 11 | |
| Commission reports | ✅ | ✅ | commission.service |
| Product performance reports | ✅ | 🔄 Phase 11 | |
| Cohort analysis | ❌ | 🔄 Phase 18 | **Beyond Zoho** |
| ARR/MRR waterfall | ❌ | 🔄 Phase 18 | **Beyond Zoho** |
| Attribution modelling | ❌ | 🔄 Phase 18 | **Beyond Zoho** |
| Customer LTV analytics | ❌ | 🔄 Phase 18 | **Beyond Zoho** |
| Embedded/shareable dashboards | ❌ | 🔄 Phase 25 | **Beyond Zoho** |

---

## MODULE 14 — WORKFLOW AUTOMATION

| Feature | Zoho Has | NEXUS Status | Notes |
|---------|----------|-------------|-------|
| Workflow rules (trigger + condition + action) | ✅ | ✅ | workflow-service, 14 node types |
| Triggers: record create/update/delete | ✅ | ✅ | TRIGGER node |
| Conditions: field-based | ✅ | ✅ | CONDITION node (7 operators) |
| Actions: email / task / field update / webhook | ✅ | ✅ | EMAIL, WEBHOOK, SET_FIELD, CREATE_TASK nodes |
| Scheduled workflows (date-based) | ✅ | ✅ | WAIT node with delayHours/Days |
| Parallel branches (FORK/JOIN) | ❌ | ✅ | **NEXUS BETTER**: true parallel execution |
| Workflow visual builder (drag/drop) | ✅ | 🆕 | **Missing**: canvas-based visual workflow editor |
| Approval process workflows | ✅ | 🔄 Phase 7 | approval-service |
| Macros (one-click multi-action) | ✅ | 🆕 | **Missing**: Macro model — execute N actions on selected records |
| Custom functions (code) | ✅ | 🆕 | **Missing**: FunctionDefinition — run TypeScript on trigger |
| Assignment rules | ✅ | 🔄 Phase 10 | territory-service |
| Escalation rules | ✅ | 🆕 | **Missing**: auto-escalate stale deals/activities |
| Blueprint (stage-gated process) | ✅ | ✅ | blueprint-service |
| CommandCenter (journey orchestration) | ✅ | 🆕 | **Missing**: visual customer journey map |
| Webhook outbound | ✅ | ✅ | integration-service webhooks |
| Workflow execution history | ✅ | ✅ | WorkflowStep audit table |
| Workflow error alerts | ✅ | 🆕 | **Missing**: notify admin when workflow fails |

---

## MODULE 15 — FORECASTING & PLANNING

| Feature | Zoho Has | NEXUS Status | Notes |
|---------|----------|-------------|-------|
| Sales quotas per rep | ✅ | 🔄 Phase 11 | planning-service |
| Forecast submission by rep | ✅ | 🔄 Phase 11 | |
| Manager forecast review/override | ✅ | 🔄 Phase 11 | |
| Forecast roll-up (rep→team→company) | ✅ | 🔄 Phase 11 | |
| Multiple forecast categories | ✅ | ✅ | ForecastCategory enum (5 values) |
| Weighted pipeline | ✅ | 🔄 Phase 11 | analytics fix + planning-service |
| Quota attainment tracking | ✅ | 🔄 Phase 11 | |
| What-if scenario modelling | ❌ | 🔄 Phase 11 | **Beyond Zoho** |
| Revenue recognition forecast | ❌ | 🔄 Phase 18 | **Beyond Zoho** |
| AI-assisted forecast adjustment | ❌ | 🔄 Phase 14 | **Beyond Zoho** |

---

## MODULE 16 — GAMIFICATION / MOTIVATOR

| Feature | Zoho Has | NEXUS Status | Notes |
|---------|----------|-------------|-------|
| Sales contests | ✅ | 🔄 Phase 12 | incentive-service |
| Real-time leaderboard | ✅ | 🔄 Phase 12 | |
| Achievement trophies/badges | ✅ | 🔄 Phase 12 | |
| Sales goals tracking | ✅ | 🆕 | **Missing**: personal goal (different from quota) |
| Rep performance comparisons | ✅ | 🔄 Phase 12 | |
| Commission statement (self-service) | ✅ | 🔄 Phase 12 | incentive-service |
| Sales TV mode (lobby display) | ✅ | 🆕 | **Missing**: full-screen leaderboard display mode |

---

## MODULE 17 — TERRITORY MANAGEMENT

| Feature | Zoho Has | NEXUS Status | Notes |
|---------|----------|-------------|-------|
| Territory definitions | ✅ | 🔄 Phase 10 | territory-service |
| Territory-based lead assignment | ✅ | 🔄 Phase 10 | |
| Account territory mapping | ✅ | 🔄 Phase 10 | |
| Territory performance analytics | ✅ | 🔄 Phase 10 | |
| Round-robin assignment | ✅ | 🔄 Phase 10 | |
| Territory conflict resolution | ✅ | 🔄 Phase 10 | |

---

## MODULE 18 — SalesSignals (Real-Time Notifications)

This is one of Zoho's most loved features — real-time signals when a contact interacts.

| Signal | Zoho Has | NEXUS Status | Notes |
|--------|----------|-------------|-------|
| Email opened (contact read your email) | ✅ | ✅ | comm-service trackOpen → Kafka |
| Email clicked (link click) | ✅ | ✅ | comm-service trackClick → Kafka |
| Website page visited | ✅ | 🔄 Phase 17 | marketing-service visitor tracking |
| Form submitted on your website | ✅ | 🔄 Phase 17 | web-to-lead |
| Quote opened by customer | ❌ | 💡 | **Beyond Zoho**: portal-service view tracking |
| Quote accepted/rejected | ✅ | ✅ | Kafka events → realtime-service |
| Contract signed | ✅ | 🔄 Phase 7 | document-service |
| Payment received | ✅ | ✅ | Kafka invoice.paid → notification |
| Twitter mention | ✅ | 🔄 Phase 23 | social CRM |
| Deal updated by colleague | ✅ | ✅ | Socket.io realtime updates |
| Activity due in 30 minutes | ✅ | 🆕 | **Missing**: scheduled push notification |
| WhatsApp message received | ❌ | 🔄 Phase 8 | **Beyond Zoho** — chatbot-service |

---

## MODULE 19 — COLLABORATION & TEAM FEATURES

| Feature | Zoho Has | NEXUS Status | Notes |
|---------|----------|-------------|-------|
| @Mention users in notes | ✅ | 🆕 | **Missing** everywhere |
| Follow a record (get notifications on changes) | ✅ | 🆕 | **Missing**: record subscription |
| Record sharing (give another user access) | ✅ | 🆕 | **Missing**: currently all access is role-based only |
| Internal chat per record | ✅ | 🆕 | **Missing**: internal thread separate from customer notes |
| Collaborative deal editing (multiple users) | ❌ | 💡 | **Beyond Zoho**: real-time Socket.io co-editing |
| Deal room (shared workspace per deal) | ❌ | 💡 | **Beyond Zoho**: shared docs, tasks, chat per deal |
| Team inbox | ✅ | 🆕 | **Missing**: shared team email inbox |

---

## MODULE 20 — ADMIN & CUSTOMISATION

| Feature | Zoho Has | NEXUS Status | Notes |
|---------|----------|-------------|-------|
| Custom fields (UI-based, no code) | ✅ | 🔄 Phase 20 | admin-service |
| Custom modules | ✅ | 🔄 Phase 20 | admin-service |
| Page layouts (per role) | ✅ | 🔄 Phase 20 | |
| Conditional field visibility | ✅ | 🔄 Phase 20 | |
| Field-level security (hide from roles) | ✅ | 🔄 Phase 20 | |
| Validation rules (field-level) | ✅ | 🔄 Phase 20 | |
| Formula fields (calculated) | ✅ | 🔄 Phase 20 | |
| Rollup summary fields | ✅ | 🆕 | **Missing**: even in phase 20 plan |
| Subforms (repeating data within record) | ✅ | 🆕 | **Missing**: e.g. contact's employment history |
| Multi-select picklist fields | ✅ | 🆕 | **Missing**: multi-value select custom field type |
| Lookup fields (FK to another module) | ✅ | 🔄 Phase 20 | |
| Canvas / UI customiser (drag-drop redesign) | ✅ | 🆕 | Complex — low priority for internal use |
| Multiple business units | ✅ | 🆕 | **Missing**: for companies with multiple brands |
| Sandbox environment | ✅ | 🆕 | **Missing**: test env with data copy |
| Multi-language (Arabic UI) | ✅ | 🔄 Phase 15 | i18n |
| RTL layout (Arabic) | ✅ | 🔄 Phase 15 | Tailwind `dir="rtl"` |
| Dark mode | ❌ | 💡 | **Beyond Zoho**: CSS variable theme switching |
| Compact / Comfortable / Spacious density | ✅ | 🆕 | **Missing**: list density setting |
| Colour theme customisation | ✅ | 🆕 | **Missing**: primary colour per tenant |

---

## MODULE 21 — DATA MANAGEMENT

| Feature | Zoho Has | NEXUS Status | Notes |
|---------|----------|-------------|-------|
| CSV/Excel import (all modules) | ✅ | 🆕 | **Missing** everywhere |
| Import field mapping wizard | ✅ | 🆕 | **Missing**: map CSV columns to CRM fields |
| Import duplicate handling (skip/update/create) | ✅ | 🆕 | **Missing** |
| Bulk export (all modules) | ✅ | 🆕 | **Missing**: download full module as CSV/Excel |
| Scheduled data backup | ✅ | 🆕 | **Missing**: daily backup to MinIO storage |
| Recycle bin (30-day recovery) | ✅ | 🆕 | **Missing**: soft-delete everywhere |
| Duplicate detection (on save) | ✅ | 🆕 | **Missing**: check email/phone before creating |
| Duplicate merge wizard | ✅ | 🆕 | **Missing**: side-by-side merge UI |
| Audit log (field changes) | ✅ | 🆕 | **Missing**: `FieldAuditLog` model — old value, new value, user, timestamp |
| Field history tracking (per field) | ✅ | 🆕 | **Missing**: configure which fields are tracked |
| Storage usage dashboard | ✅ | 🆕 | **Missing**: see files/attachments storage used |
| GDPR right-to-erasure | ✅ | 🔄 Phase 20 | admin-service |
| Data retention policies | ✅ | 🔄 Phase 20 | |
| Lead/contact deduplication job | ✅ | 🆕 | **Missing**: scheduled batch dedup scan |

---

## MODULE 22 — SECURITY & ACCESS

| Feature | Zoho Has | NEXUS Status | Notes |
|---------|----------|-------------|-------|
| Role-based access (8 roles) | ✅ | ✅ | RBAC in service-utils |
| Profile-based field security | ✅ | 🔄 Phase 20 | |
| IP address restrictions | ✅ | 🆕 | **Missing**: whitelist IP ranges per tenant |
| Two-factor authentication | ✅ | 🆕 | **Missing**: TOTP (Google Authenticator) — Keycloak supports this |
| Session management (active sessions list) | ✅ | 🆕 | **Missing**: see + force-logout active sessions |
| Login history | ✅ | 🆕 | **Missing**: log auth events with IP/device |
| Password policies | ✅ | ✅ | Keycloak handles |
| SSO (SAML/OIDC) | ✅ | ✅ | Keycloak 24 |
| Audit trail (all user actions) | ✅ | 🆕 | **Missing**: user action log beyond field changes |
| Record-level sharing rules | ✅ | 🆕 | Currently all-or-nothing per role |

---

## MODULE 23 — MOBILE APP

| Feature | Zoho Has | NEXUS Status | Notes |
|---------|----------|-------------|-------|
| Full CRM on mobile | ✅ | 🔄 Phase 13 | React Native |
| Offline mode | ✅ | 🔄 Phase 13 | SQLite local cache |
| Business card scanner | ✅ | 🔄 Phase 13 | Camera + OCR |
| GPS check-in (field visits) | ✅ | 🔄 Phase 13 | Location API |
| Voice notes → transcription | ❌ | 🔄 Phase 13 | **Beyond Zoho**: Whisper AI |
| Biometric auth (Face ID) | ✅ | 🔄 Phase 13 | Expo LocalAuthentication |
| Push notifications | ✅ | 🔄 Phase 13 | Expo Push |
| Nearby accounts map | ✅ | 🔄 Phase 13 | React Native Maps |
| Call from CRM (tap-to-call) | ✅ | 🔄 Phase 13 | native tel: link |

---

## MODULE 24 — PORTAL (CUSTOMER SELF-SERVICE)

| Feature | Zoho Has | NEXUS Status | Notes |
|---------|----------|-------------|-------|
| Customer portal | ✅ | 🔄 Phase 12 | portal-service |
| View quotes online | ✅ | 🔄 Phase 12 | |
| Accept/reject quotes online | ✅ | 🔄 Phase 12 | |
| View + download invoices | ✅ | 🔄 Phase 12 | |
| View contracts | ✅ | 🔄 Phase 12 | |
| Submit support cases | ✅ | 🔄 Phase 16 | service-service |
| Custom branding (logo/colours) | ✅ | 🔄 Phase 12 | |
| Vendor portal | ✅ | 🆕 | **Missing**: separate portal for vendors/suppliers |

---

## MODULE 25 — UX / DAILY USABILITY (Things Zoho users rely on daily)

| Feature | Zoho Has | NEXUS Status | Notes |
|---------|----------|-------------|-------|
| Global quick-create (+) button | ✅ | 🆕 | **Missing**: floating + button → create any record |
| Global keyboard shortcut (Cmd+K) | ✅ | 🔄 Phase 21 | NLQ interface uses Cmd+K |
| Global search across all modules | ✅ | ✅ | search-service (Meilisearch) |
| Recent records (quick access) | ✅ | 🆕 | **Missing**: "Recently viewed" bar |
| Pinned/starred records | ✅ | 🆕 | **Missing**: star/pin important records to top |
| Saved views per module | ✅ | 🆕 | **Missing**: critical for daily use |
| Inline editing in list view | ✅ | 🆕 | **Missing**: double-click to edit in place |
| Column resize & reorder | ✅ | 🆕 | **Missing** |
| Group by any field | ✅ | 🆕 | **Missing** |
| Sort by multiple columns | ✅ | 🆕 | **Missing** |
| Pagination with page jump | ✅ | ✅ | Pagination exists |
| Quick filter chips (active filters shown) | ✅ | 🆕 | **Missing**: visible chips showing active filters |
| Record breadcrumbs (navigation) | ✅ | 🆕 | **Missing**: Home › Accounts › Acme Corp |
| Print view / Print record | ✅ | 🆕 | **Missing** |
| Copy record link | ✅ | 🆕 | **Missing**: copy sharable URL to clipboard |
| Full-screen detail view | ✅ | 🆕 | **Missing**: expand record to full screen |
| Compact / Spacious view toggle | ✅ | 🆕 | **Missing** |
| Notification bell (in-app) | ✅ | ✅ | realtime-service |
| Email notifications for assignments | ✅ | ✅ | notification-service |
| Activity due reminders | ✅ | 🆕 | **Missing**: push notification before activity due |
| Toast notifications on actions | ✅ | ✅ | useUiStore pushToast |
| Undo last action | ✅ | 🆕 | **Missing**: brief undo window after delete/update |
| Keyboard shortcuts cheat sheet | ✅ | 🆕 | **Missing**: Shift+? to show shortcuts |
| Help tooltips on fields | ✅ | 🆕 | **Missing**: `?` icon with field description |
| Dark mode | ❌ | 💡 | **Beyond Zoho**: Tailwind dark: classes |
| Responsive (tablet-friendly) | ✅ | 🆕 | **Missing**: Tailwind responsive breakpoints |

---

## SECTION A — BEYOND ZOHO: NEXUS-EXCLUSIVE FEATURES

These don't exist in Zoho CRM at all. These are NEXUS's competitive moat.

| Feature | Description |
|---------|-------------|
| **WhatsApp Auto-Quoting** | Customer messages on WhatsApp → bot shows catalog → CPQ prices → PDF quote sent back. Zero human intervention. |
| **Telegram Auto-Quoting** | Same as above via Telegram Bot API |
| **Local AI (Ollama)** | All AI runs on your server. Customer data never leaves. Zoho Zia sends your data to their cloud. |
| **Real-time collaborative editing** | Two users editing the same deal simultaneously — changes sync via Socket.io. Zoho locks the record. |
| **MEDDIC/MEDDPICC built-in** | Structured qualification scoring on every deal. Zoho has no equivalent — it's a plugin from AppExchange on Salesforce. |
| **Deal Room** | Shared workspace per deal: shared documents, internal chat thread, task board, all linked to the deal. |
| **Whisper call transcription (local)** | Transcribe and summarise calls/meetings on-premise. Gong/Chorus cost $5,000+/year. NEXUS includes it. |
| **AI email reply suggestions** | Ollama suggests 3 contextual reply options. Privacy-safe because it runs locally. |
| **Predictive close date** | AI compares rep's estimated close date to historical patterns and flags optimistic dates. |
| **Commission transparency dashboard** | Reps see their commission calculation update in real-time as they move deals through stages. |
| **WhatsApp conversation thread on records** | Full WhatsApp message history on contact/deal page — not just email. |
| **Churn prediction (ML)** | Random Forest model on account behaviour → risk score before customer churns. |
| **Revenue waterfall (ARR/MRR)** | Subscription revenue intelligence. Zoho CRM doesn't track ARR/MRR — you'd need Zoho Subscriptions separately. |
| **Audit trail with event sourcing** | Full Kafka event log — every change to every record is permanently stored and replayable. |
| **Natural language queries** | Type "deals over $100k closing this quarter with no activity in 2 weeks" → instant results. |
| **Arabic-first UI** | RTL layout, Arabic UI strings. Zoho's Arabic support is partial and inconsistent. |
| **Quote acceptance analytics** | See how long quotes sit before customers open them, which sections they read, when they accept. |

---

## SECTION B — NEW SERVICES TO ADD TO THE PLAN

Based on this full audit, these services must be added (not yet in any phase):

### S1: `data-service` — Import / Export / Recycle Bin / Audit Log
**Every Zoho user uses these daily. They are non-negotiable.**

```
DataImport: module, filename, status, mappings, totalRows, importedRows, errorRows, errors[]
DataExport: module, filters, format (csv/xlsx), status, downloadUrl, expiresAt
RecycleBinItem: module, recordId, recordSnapshot (JSON), deletedBy, deletedAt, expiresAt
FieldAuditLog: module, recordId, fieldName, oldValue, newValue, changedBy, changedAt
```

Routes:
- `POST /import/{module}` — upload CSV/Excel, map fields, start import job
- `GET /import/{importId}/progress` — streaming progress
- `GET /export/{module}` — trigger export with current filters
- `GET /recycle-bin` — list deleted records (filter by module)
- `POST /recycle-bin/{id}/restore` — restore a deleted record
- `GET /audit/{module}/{recordId}` — field change history for a record

### S2: `order-service` — Sales Orders, Purchase Orders, Vendors
```
SalesOrder: from Quote → accepted order lifecycle
PurchaseOrder: vendor procurement
Vendor: supplier database (like Account but for procurement side)
```

### S3: `signals-service` (extend `realtime-service`) — SalesSignals
- Aggregate real-time signals from all channels: email opens, page visits, quote views, payment received, WhatsApp message
- Deliver as real-time toast notification when a rep has that contact/account open
- Signals feed in notification center: sorted by time, filterable by type

### S4: `ux-service` — Saved Views, Column Config, User Preferences
Stateful user preferences:
```
SavedView: userId, module, name, filters (JSON), columns (JSON), sortBy, isDefault
ColumnConfig: userId, module, columns[] (order + visibility + width)
UserPreference: userId, key (theme/density/language/timezone), value
RecentRecord: userId, module, recordId, viewedAt
PinnedRecord: userId, module, recordId, pinnedAt
```
This is what makes the CRM feel fast and personalised.

---

## SECTION C — PRIORITY ORDERING (What to build next after Phase 6)

Ranked by daily impact for a team that lives in a CRM:

| Priority | Feature | Why |
|----------|---------|-----|
| 🔴 P0 | Saved Views / Custom Filters (all modules) | Used every single day. Without these, list pages are unusable at scale. |
| 🔴 P0 | CSV Import (Leads, Contacts, Accounts, Deals) | Can't migrate data from Zoho without this |
| 🔴 P0 | CSV Export (all modules) | Data ownership. Can't report externally without this. |
| 🔴 P0 | Recycle Bin | Every accidental delete needs recovery |
| 🔴 P0 | Field Audit Log | "Who changed this?" is asked every day |
| 🔴 P0 | Lead Conversion (1-click → Contact + Account + Deal) | Core daily workflow in every CRM |
| 🔴 P0 | File attachments on records | Attach proposals, briefs, signed docs to any record |
| 🔴 P0 | Activity reminder notifications | Team misses calls without this |
| 🔴 P0 | @Mentions in notes | Team collaboration basic |
| 🔴 P0 | Quick-create button (global +) | Creates friction every N times per day without it |
| 🟡 P1 | Email compose from record | Huge daily time-saver |
| 🟡 P1 | Mass operations (bulk update/delete/reassign) | Needed for any list management |
| 🟡 P1 | Column chooser per module | Personalise what you see |
| 🟡 P1 | Inline editing in lists | Speed |
| 🟡 P1 | Duplicate detection | Data quality |
| 🟡 P1 | Price Books | Different prices per account type |
| 🟡 P1 | Sales Orders (from accepted quote) | Core order flow |
| 🟡 P1 | Activity templates | Pre-filled meeting/call note templates |
| 🟡 P1 | BCC-to-CRM | Auto-log emails |
| 🟡 P1 | Recurrence on activities | Recurring meetings/check-ins |
| 🟢 P2 | Macros | Power-user feature |
| 🟢 P2 | Escalation rules (stale deal alerts) | Pipeline hygiene |
| 🟢 P2 | Quote versioning | Negotiate through multiple versions |
| 🟢 P2 | Multiple addresses on Accounts | Shipping/billing split |
| 🟢 P2 | Product variants | Size/colour/config |
| 🟢 P2 | Record following | Passive monitoring |
| 🟢 P2 | Print view | On-site presentations |
| 🟢 P2 | Dark mode | Eye comfort |
| 🟢 P2 | Arabic RTL layout | If team speaks Arabic |
| 🟢 P2 | Keyboard shortcuts | Power user speed |

---

## SECTION D — REVISED PHASE INSERTIONS

Insert **Phase 6.5** between Phase 6 and Phase 7 to handle the highest-priority P0 items
that make the CRM usable for daily work:

### Phase 6.5 — Daily Usability Sprint (P0 items)
**Files: ~50 | Est. LOC: ~5,000**

1. **Lead Conversion** — `POST /leads/:id/convert` → creates Contact + Account (if new) + Deal in one transaction. Mapping UI: show which lead fields map to which contact/deal fields.
2. **CSV Import** — `/data/import/:module` with field mapping wizard (leads, contacts, accounts, deals)
3. **CSV Export** — `/data/export/:module` endpoint + download button on every list page
4. **Recycle Bin** — soft-delete on all records, recycle bin page with restore
5. **Field Audit Log** — `FieldAuditLog` table, Prisma middleware to capture old/new values on update
6. **File Attachments on records** — `RecordAttachment` model, storage-service integration, attachment section on all detail pages
7. **Activity reminder notifications** — scheduled job: 30 min before due → push via realtime-service
8. **@Mentions in notes** — parse `@username` in note content → lookup userId → send notification
9. **Quick-create button** — floating `+` FAB in bottom-right corner, opens modal with module selector
10. **Saved Views** — `SavedView` model, save/load filter state per module per user
11. **Recently viewed records** — `RecentRecord` model, show last 5 of each module in nav dropdown
12. **Mass operations** — checkboxes on all list pages → bulk update/delete/reassign modal

Then continue with Phase 7 (Approval + Document service) as originally planned.

---

## FINAL COUNT

| Category | Features in Zoho | NEXUS Built | NEXUS Planned | Still Missing | Beyond Zoho |
|----------|-----------------|-------------|--------------|--------------|-------------|
| CRM Core (Leads/Contacts/Accounts/Deals) | ~80 | 45 | 20 | 15 | 8 |
| Activities | ~25 | 12 | 8 | 5 | 3 |
| Email | ~15 | 5 | 7 | 3 | 2 |
| Quotes/CPQ | ~20 | 12 | 6 | 2 | 4 |
| Finance (Orders/Invoices/Contracts) | ~30 | 15 | 10 | 5 | 3 |
| Marketing/Campaigns | ~20 | 2 | 15 | 3 | 3 |
| Automation/Workflow | ~20 | 12 | 5 | 3 | 4 |
| Analytics/Reports | ~20 | 8 | 10 | 2 | 6 |
| Forecasting/Planning | ~10 | 2 | 8 | 0 | 4 |
| Admin/Customisation | ~30 | 5 | 15 | 10 | 5 |
| Data Management | ~15 | 0 | 5 | 10 | 2 |
| Security/Access | ~10 | 6 | 3 | 1 | 2 |
| Mobile | ~10 | 0 | 10 | 0 | 3 |
| UX/Usability | ~25 | 5 | 5 | 15 | 5 |
| Portals | ~8 | 0 | 8 | 0 | 2 |
| **TOTAL** | **~338** | **~129** | **~135** | **~74** | **~56** |

**After completing all phases + P0 additions: ~320 of 338 Zoho features + 56 exclusive features = full parity + beyond.**
