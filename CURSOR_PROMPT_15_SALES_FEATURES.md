# CURSOR PROMPT 15 — Sales Team Features (All P0/P1 Requested Items)

## Context
NEXUS CRM — pnpm monorepo. Frontend: `apps/web` (Next.js 14 App Router, Tailwind CSS).
Backend: `services/` directory. All backend services use Fastify + Prisma.
Sales team identified these as blocking features. Calling and AI features excluded for this prompt.

---

## TASK 1 — Email Sequence Builder (Cadence UI)

The `cadence-service` (port 3018) already has backend routes. Build the frontend.

### File: `apps/web/src/app/(dashboard)/cadences/page.tsx`
List of all cadence sequences with:
- Name, type (outbound/inbound/nurture), steps count, prospects enrolled, reply rate, status (Active/Paused/Draft)
- Create new cadence button → opens cadence builder
- Clone, Pause, Delete actions per row

### File: `apps/web/src/app/(dashboard)/cadences/[id]/page.tsx`
Full cadence builder (visual step editor):

**Step timeline** (left panel, vertical):
Each step shows: step number, type icon (email/task/wait), day number, subject preview.
Drag-to-reorder (use `@dnd-kit/core` if installed, otherwise drag handles with up/down buttons).
"+ Add step" button between steps.

**Step editor** (right panel):
When a step is selected, show its editor. Step types:

**Email step**:
- Subject line input
- From name / reply-to
- Rich text email body editor (use `react-quill` or a `<textarea>` with markdown preview if quill unavailable)
- A/B test toggle: enable second variant (Subject B + Body B)
- Personalization tokens: `{{first_name}}`, `{{company}}`, `{{rep_name}}`, `{{deal_value}}`
- Send timing: day N of cadence, time of day, exclude weekends checkbox

**Task step** (manual follow-up):
- Task type: Call / LinkedIn / Custom
- Instructions text
- Due offset (same day, +1 day, +2 days)

**Wait step**:
- Duration: number + unit (hours/days/business days)

**Settings panel** (right of builder):
- Cadence name
- Default sender
- Exit conditions: replied, bounced, deal stage changed, unsubscribed
- Goal: meeting booked, demo completed, contact stage changed
- Enroll: from contact list, from deal stage, manually

**Metrics panel** at bottom:
Step-by-step stats table: sent, opened, clicked, replied, unsubscribed for each step.

### File: `apps/web/src/app/(dashboard)/cadences/enroll/page.tsx`
Quick enroll dialog/page — select cadence + add contacts (search / paste emails / upload CSV).
Preview which step they'll start at. Confirm enrollment.

---

## TASK 2 — Product Catalog & Price Book

The `billing-service` already has product/price endpoints. Build the frontend.

### File: `apps/web/src/app/(dashboard)/products/page.tsx`
Product catalog grid and list view (toggle):
- Search + filter by category, status (Active/Archived), type (Product/Service/Subscription)
- Grid card: product image placeholder, name, SKU, list price, category badge, status
- List row: name, SKU, category, list price, discount price, margin %, stock (if physical)
- Create product button → product form modal
- Bulk actions: activate, archive, export CSV

### File: `apps/web/src/app/(dashboard)/products/[id]/page.tsx`
Product detail page:
- Product info (name, description, SKU, category, type)
- Pricing section: list price, currency, discount rules (volume, time-limited, by customer tier)
- Add to deal button
- Usage stats: included in N deals, total revenue generated, avg deal size when this product is included

### File: `apps/web/src/components/deals/ProductLineItems.tsx`
Component for use inside the deal edit page:
- Table of line items: product (searchable dropdown), qty, unit price, discount %, total
- "Add product" row button
- Auto-calculates subtotal, discount total, tax, total
- Supports multiple currencies with conversion notice
- Generates quote PDF button

---

## TASK 3 — Duplicate Contact Detection & Merge

### File: `apps/web/src/app/(dashboard)/contacts/duplicates/page.tsx`
Duplicate management center:

**Detection panel**:
- Run duplicate scan button (POST `/api/contacts/duplicates/scan`)
- Shows: N potential duplicate groups found
- Filter: by confidence (High >90%, Medium 60–90%, Low <60%)
- Confidence based on: exact email match, similar name + company, same phone number

**Duplicate groups list**:
Each group shows 2–N contact cards side by side:
- All fields that match highlighted in green
- Fields that differ highlighted in yellow
- Radio buttons: pick "master" record
- Checkboxes: which fields to keep from each record
- Merge button (calls `POST /api/contacts/merge`)
- "Not duplicates" button to dismiss

**Auto-merge rules**:
Toggle to auto-merge exact email matches.
Set confidence threshold for auto-merge.

### File: `apps/web/src/components/contacts/DuplicateWarning.tsx`
Inline warning banner shown in the contact create form when a potential duplicate is detected:
```
⚠️ Similar contact found: "John Smith" at Acme Corp (john@acme.com)
  [View existing contact]  [Continue creating new]  [Merge]
```

---

## TASK 4 — Calendar Sync & Meeting Scheduler

### File: `apps/web/src/app/(dashboard)/calendar/page.tsx`
Full calendar view (already exists as route — enhance it):

**Calendar component** (week/month/day view, like Google Calendar):
- Use `react-big-calendar` or build a clean week grid manually
- Events color-coded by type: meeting (blue), task (orange), call (green), deadline (red)
- Drag to reschedule (if react-big-calendar)
- Click event → event details side panel (attendees, associated deal/contact, notes, join link)
- Create event button → event form

**Event form** (modal):
- Title, type, date/time, duration
- Attendees: search from contacts + team members
- Link to deal (optional)
- Video link (Google Meet / Zoom — just a text input)
- Description/agenda
- Reminder: 15 min / 1 hour / 1 day before

**Calendar sync status** (top-right of calendar):
- Google Calendar sync status badge (Connected/Disconnected)
- Sync button → redirects to settings/integrations
- Last synced timestamp

### File: `apps/web/src/components/calendar/MeetingBookingWidget.tsx`
Embeddable booking widget for contacts:
- Shows available slots (rep's working hours minus existing events)
- Contact selects slot → creates a meeting + sends invite email
- Route: `/book/[repUsername]` (public, no auth)

---

## TASK 5 — Discount Approval Workflow

The `approval-service` is already running. Build the frontend flow.

### File: `apps/web/src/components/deals/DiscountApprovalBanner.tsx`
Shown inside deal edit when discount > threshold:
```
⚠️ Discount of 22% exceeds your limit of 15%.
This deal requires manager approval before sending a quote.
[Request Approval]  →  sends to manager's approval queue
```

### File: `apps/web/src/app/(dashboard)/approvals/page.tsx`
Approval inbox — items needing your review (role: manager/admin):
- List: deal name, rep name, requested discount %, deal value, impact on margin, time requested
- Actions: Approve (with optional comment), Reject (with required comment), Counter-offer (set max discount %)
- Filter: Pending / Approved / Rejected / All
- Status badges

Also shows **My pending approvals** (deals I've requested approval for):
- Status, who's reviewing, days waiting, reminder button

---

## TASK 6 — Knowledge Base Frontend

The `knowledge-service` (port 3023) has backend routes. Build the full frontend.

### File: `apps/web/src/app/(dashboard)/knowledge/page.tsx`
Knowledge base home:
- Search bar (full-text, sends to `GET /api/knowledge/search?q=`)
- Category sidebar: Sales Scripts, Competitive Intel, Product Guides, Objection Handling, Email Templates, Onboarding, Legal/Compliance
- Featured articles (pinned by managers)
- Recently updated articles
- Popular this week

### File: `apps/web/src/app/(dashboard)/knowledge/[id]/page.tsx`
Article view:
- Title, category breadcrumb, author, published date, last updated
- Estimated read time
- Article body (markdown rendered, support for tables and code blocks)
- Related articles sidebar
- Feedback: Was this helpful? (thumbs up/down + optional comment)
- Share / Copy link button
- "Use in email" button (copies article summary to clipboard)

### File: `apps/web/src/app/(dashboard)/knowledge/new/page.tsx`
Article editor:
- Title, category, tags
- Markdown editor with preview toggle
- Attach files (PDFs, images — uses storage-service)
- Publish / Save draft / Archive
- Visibility: everyone / managers only / specific roles

---

## TASK 7 — Customer Portal Link

The `portal-service` (port 3022) handles external portal logic. Build the frontend integration.

### File: `apps/web/src/app/(dashboard)/contacts/[id]/portal/page.tsx`
Portal management for a specific contact:
- Enable/disable portal access toggle
- Portal link (auto-generated): `https://portal.nexuscrm.io/c/{token}`
- Copy link / Send invite email button
- Permissions: what the contact can see (deals, invoices, documents, support tickets)
- Portal activity log: last login, pages visited, documents downloaded

### File: `apps/web/src/app/(dashboard)/portal/settings/page.tsx`
Global portal branding settings:
- Company logo upload
- Primary color picker
- Welcome message (markdown)
- Footer text
- Custom domain (CNAME input)
- Portal features toggles: Show deals, Show invoices, Show documents, Allow contact to upload files, Allow contact to message rep

---

## TASK 8 — Document Management UI

The `document-service` (port 3016) has backend routes. Build the frontend.

### File: `apps/web/src/app/(dashboard)/documents/page.tsx`
Document library:
- Grid and list view toggle
- Folders: Contracts, Proposals, Quotes, NDAs, Invoices, Templates
- File cards: icon (PDF/DOCX/XLSX), name, associated deal/contact, size, modified date, author
- Upload button (drag-drop zone)
- Filters: type, date modified, associated entity, owner
- Bulk select → download zip, move to folder, delete

### File: `apps/web/src/app/(dashboard)/documents/[id]/page.tsx`
Document detail:
- Preview pane (PDF iframe for PDFs, download for other types)
- Metadata: file size, type, upload date, uploaded by
- Associated records: linked deals, contacts, companies (with edit)
- Version history list (v1.0, v1.1, v2.0...) with download per version + "Restore" button
- Comments/notes thread
- Sharing: generate signed link with expiry time
- Send for e-signature (if DocuSign integrated) button

### File: `apps/web/src/components/documents/DocumentUpload.tsx`
Reusable drag-drop upload component (used in deals, contacts, and document library):
- Accepts: PDF, DOCX, XLSX, PNG, JPG, CSV (max 50 MB)
- Shows upload progress bar
- On complete: shows file name + size + remove button
- Uploads to storage-service via `POST /api/storage/upload`

---

## TASK 9 — Reporting Center

### File: `apps/web/src/app/(dashboard)/reports/page.tsx`
Report library / home:
- Pre-built reports grid (cards with icon, title, description, last run):
  - Sales Pipeline Report
  - Activity Summary Report
  - Revenue Forecast Report
  - Lead Source Analysis
  - Deal Velocity Report
  - Rep Performance Report
  - Lost Deal Analysis
  - Email Engagement Report
  - Territory Performance Report
  - Commission Summary Report

- "Create custom report" button

### File: `apps/web/src/app/(dashboard)/reports/builder/page.tsx`
Custom report builder:
- Step 1: Choose data source (Deals, Contacts, Activities, Revenue, Cadences)
- Step 2: Select fields/columns (checkbox list)
- Step 3: Add filters (field + operator + value rows)
- Step 4: Choose visualization (table / bar chart / line chart / pie chart)
- Step 5: Set schedule (one-time, daily, weekly, monthly email)
- Preview panel updates live as fields/filters change
- Save report + Run now + Schedule

---

## TASK 10 — GDPR & Data Export

### File: `apps/web/src/app/(dashboard)/settings/data-privacy/page.tsx`
GDPR compliance center accessible under Settings:

**My data export (Art. 20)**:
- "Request export" button → triggers background job
- Export includes: contacts owned, deals, activities, emails sent, notes, attachments
- Format: ZIP with JSON files + CSV summary
- Status: Pending / Processing / Ready (with download link, expires in 24 hours)
- History of previous exports

**Right to erasure (Art. 17)**:
- Contact search to find a specific person's data
- Shows all records for that contact in NEXUS
- "Erase all data" button with two-step confirmation
- Generates erasure certificate PDF

**Consent management**:
- Table of contacts with marketing consent status
- Bulk update consent from CSV import
- Consent audit trail per contact

**Data residency** (admin only):
- Shows where data is stored (region)
- Data retention settings per category (leads, closed deals, emails, call logs)

---

## TASK 11 — Slack & Teams Integration UI

### File: `apps/web/src/app/(dashboard)/settings/integrations/slack/page.tsx`
Slack integration config:
- Connect with OAuth button
- Connected workspace name + disconnect button
- Notification rules (which events send to Slack):
  - Deal won → #sales channel
  - Deal lost → #sales-losses channel (optional)
  - New lead assigned → DM to rep
  - Deal stalled → DM to manager after X days
  - Task overdue → DM to rep
  - High-value deal (>$X) created → #big-deals channel
- For each rule: toggle on/off, channel selector, threshold config
- Test button: sends a sample notification

### File: `apps/web/src/app/(dashboard)/settings/integrations/teams/page.tsx`
Same layout/functionality as Slack but for Microsoft Teams.

---

## TASK 12 — Enhanced Contact & Deal Detail Pages

### Enhance: `apps/web/src/app/(dashboard)/contacts/[id]/page.tsx`
Add or ensure these panels exist (tabbed):

**Overview tab** (existing)
**Activity tab**: timeline of all touchpoints — calls, emails, meetings, notes, deal changes. Filter by type.
**Deals tab**: list of all deals with this contact. Stage, value, last activity, assigned rep.
**Documents tab**: files associated with this contact. Upload button.
**Emails tab**: email conversation thread (sent + received via comm-service). Reply inline.
**Notes tab**: create/edit/delete notes. Pin important notes to top.
**Portal tab**: link to Task 7 portal management.

### Enhance: `apps/web/src/app/(dashboard)/deals/[id]/page.tsx`
Add or ensure these panels exist:

**Overview tab**: deal info, stage, value, probability, expected close, assigned rep
**Activity tab**: full timeline
**Contacts tab**: all contacts on this deal. Add/remove contacts.
**Products tab**: line items using `<ProductLineItems />` from Task 2
**Documents tab**: using `<DocumentUpload />` from Task 8
**Emails tab**: conversations
**Approval tab**: discount approval status (if applicable)
**Notes & history tab**

---

## Verification Checklist
- [ ] Cadence builder renders step timeline with add/edit/delete
- [ ] Product catalog shows grid/list view with create modal
- [ ] ProductLineItems calculates subtotal, discount, tax, total
- [ ] Duplicate detection page shows grouped potential matches with merge action
- [ ] DuplicateWarning shows in contact create form
- [ ] Calendar renders week view with event color coding
- [ ] DiscountApprovalBanner triggers on >threshold discount
- [ ] Approvals inbox shows pending/approved/rejected with action buttons
- [ ] Knowledge base home shows categories, featured articles, search
- [ ] Knowledge article view renders markdown correctly
- [ ] Portal contact page shows link + permissions
- [ ] Document library shows grid with upload button
- [ ] DocumentUpload component shows progress bar
- [ ] Report builder has 5 steps and live preview
- [ ] GDPR export page has request + status + download flow
- [ ] Slack integration page has notification rules with channel selector
- [ ] Contact detail has all 7 tabs
- [ ] Deal detail has all 8 tabs
