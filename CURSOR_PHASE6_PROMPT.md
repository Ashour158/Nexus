# NEXUS CRM — Cursor Phase 6 Prompt
## Scope: Fork/Join Fix + Critical Frontend Sprint (Detail Pages, Quote Builder, Analytics Charts)

You are continuing to build NEXUS CRM. All existing services compile with zero TypeScript errors.
**Maintain that standard for every line you write.**

---

## CRITICAL RULES (same as every phase)

1. **Zero `any`** — `unknown` with narrowing, explicit interfaces, or generics only.
2. **Zero `TODO` / `FIXME` / stub** — Every function fully implemented.
3. **`tenantId` in every DB query.**
4. **`version: { increment: 1 }`** on every Prisma `update`.
5. **React:** `'use client'` directive, React Query hooks, `useParams` for dynamic routes.
6. **No new libraries** beyond what is already in `package.json`. Use `recharts` (already `^2.12.7`),
   `@tanstack/react-query`, `axios`, `react-router`/`next/navigation`.
7. **Patterns to follow:** Mirror `apps/web/src/app/(dashboard)/deals/[id]/page.tsx` exactly for
   tabbed detail pages. Mirror `apps/web/src/hooks/use-deals.ts` for hook files.
8. **API client pattern:** Use `api.get/post/patch/delete` from `@/lib/api-client` for CRM service.
   Use `apiClients.finance` for finance-service. Use `apiClients.analytics` for analytics-service.

---

## PART 1 — FIX TRUNCATED FORK / JOIN NODES (leftover from Phase 5)

### FILE 1: `services/workflow-service/src/engine/nodes/fork.node.ts`

The current file is truncated (3 imports + start of JSDoc, no function body). Rewrite completely:

```typescript
import { type NexusProducer, TOPICS } from '@nexus/kafka';
import type { WorkflowPrisma } from '../../prisma.js';
import type { ExecutionContext, NodeResult, WorkflowNode } from '../types.js';

/**
 * FORK: creates one child WorkflowExecution per branch, records a
 * WorkflowForkTracker, publishes workflow.branch.start for each child,
 * then pauses the parent at the JOIN node for up to 24 hours.
 */
export async function handleForkNode(
  node: WorkflowNode,
  context: ExecutionContext,
  prisma: WorkflowPrisma,
  producer: NexusProducer
): Promise<NodeResult> {
  const cfg = (node.config ?? {}) as {
    branches?: string[];
    joinNodeId?: string;
  };
  const branches = cfg.branches ?? [];
  if (branches.length === 0) return { output: { skipped: true, reason: 'no_branches' } };
  if (!cfg.joinNodeId) throw new Error(`FORK node ${node.id} is missing joinNodeId in config`);

  // Create the tracker BEFORE spawning children so JOIN can find it
  await prisma.workflowForkTracker.create({
    data: {
      executionId: context.executionId,
      forkNodeId: node.id,
      joinNodeId: cfg.joinNodeId,
      branchNodeIds: branches,
      completedIds: [],
    },
  });

  // Spawn a child execution for every branch
  for (const branchStartNodeId of branches) {
    const child = await prisma.workflowExecution.create({
      data: {
        tenantId: context.tenantId,
        workflowId: context.workflowId,
        triggerType: 'BRANCH',
        triggerPayload: context.triggerPayload as object,
        status: 'RUNNING',
        currentNodeId: branchStartNodeId,
        parentForkId: node.id,
        parentExecId: context.executionId,
      },
    });
    await producer.publish(TOPICS.WORKFLOW, {
      type: 'workflow.branch.start' as never,
      tenantId: context.tenantId,
      payload: {
        executionId: child.id,
        parentExecutionId: context.executionId,
        branchNodeId: branchStartNodeId,
      } as never,
    });
  }

  return {
    nextNodeId: cfg.joinNodeId,
    // Safety timeout: if branches don't complete in 24 h, mark failed
    pauseUntil: new Date(Date.now() + 24 * 60 * 60 * 1_000),
    output: { branches, childCount: branches.length },
  };
}
```

### FILE 2: `services/workflow-service/src/engine/nodes/join.node.ts`

```typescript
import type { WorkflowPrisma } from '../../prisma.js';
import type { ExecutionContext, NodeResult, WorkflowNode } from '../types.js';

/**
 * JOIN: checks whether all branch children of the matching FORK have
 * completed.  If not, stays paused for 60 s.  If yes, clears the pause
 * and lets the executor continue past JOIN.
 */
export async function handleJoinNode(
  node: WorkflowNode,
  context: ExecutionContext,
  prisma: WorkflowPrisma
): Promise<NodeResult> {
  const tracker = await prisma.workflowForkTracker.findFirst({
    where: { executionId: context.executionId, joinNodeId: node.id },
  });
  if (!tracker) {
    // No tracker → no fork preceded this join; treat as pass-through
    return { output: { joined: true, note: 'no_tracker' } };
  }

  const completedCount = await prisma.workflowExecution.count({
    where: {
      parentExecId: context.executionId,
      parentForkId: tracker.forkNodeId,
      status: 'COMPLETED',
    },
  });

  const total = tracker.branchNodeIds.length;
  if (completedCount < total) {
    return {
      pauseUntil: new Date(Date.now() + 60_000),
      output: { waiting: true, completedBranches: completedCount, totalBranches: total },
    };
  }

  return {
    pauseUntil: null,
    output: { joined: true, completedBranches: completedCount, totalBranches: total },
  };
}
```

### FILE 3: `services/workflow-service/src/engine/executor.ts`

Update the `FORK` and `JOIN` cases in `executeNode` to pass the new required arguments:

```typescript
case 'FORK':
  return handleForkNode(node, context, this.prisma, this.producer);
case 'JOIN':
  return handleJoinNode(node, context, this.prisma);
```

---

## PART 2 — CRM SERVICE BACKEND ADDITIONS

Two new endpoints are needed by the contact detail page that don't exist yet.

### FILE 4: `services/crm-service/src/services/contacts.service.ts`

Add two new methods to the existing service object (do not remove anything):

```typescript
async listContactDeals(
  tenantId: string,
  contactId: string,
  opts: { page?: number; limit?: number } = {}
): Promise<{ data: Deal[]; total: number }> {
  // Load the contact first to confirm tenant ownership
  await loadOrThrow(tenantId, contactId);
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, opts.limit ?? 25);
  const skip = (page - 1) * limit;

  // Deals linked via DealContact junction
  const [items, total] = await prisma.$transaction([
    prisma.deal.findMany({
      where: {
        tenantId,
        contacts: { some: { contactId } },
      },
      include: { stage: true, account: { select: { id: true, name: true } } },
      skip,
      take: limit,
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.deal.count({
      where: { tenantId, contacts: { some: { contactId } } },
    }),
  ]);
  return { data: items, total };
},

async getContactTimeline(
  tenantId: string,
  contactId: string,
  opts: { cursor?: string; limit?: number } = {}
): Promise<{ events: TimelineEvent[]; nextCursor: string | null }> {
  await loadOrThrow(tenantId, contactId);
  const limit = Math.min(50, opts.limit ?? 20);

  const [activities, notes] = await Promise.all([
    prisma.activity.findMany({
      where: { tenantId, contactId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.note.findMany({
      where: { tenantId, contactId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
  ]);

  const events: TimelineEvent[] = [
    ...activities.map((a) => ({
      id: `act-${a.id}`,
      type: 'activity' as const,
      title: `${a.type}: ${a.subject}`,
      description: a.notes ?? undefined,
      occurredAt: a.createdAt.toISOString(),
      metadata: { status: a.status, dueDate: a.dueDate },
    })),
    ...notes.map((n) => ({
      id: `note-${n.id}`,
      type: 'note' as const,
      title: n.isPinned ? '📌 Pinned note' : 'Note',
      description: n.content,
      occurredAt: n.createdAt.toISOString(),
      metadata: { isPinned: n.isPinned },
    })),
  ].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
   .slice(0, limit);

  return { events, nextCursor: null };
},
```

### FILE 5: `services/crm-service/src/routes/contacts.routes.ts`

Add two new route handlers inside the existing `async (r) => { ... }` block:

```typescript
r.get(
  '/contacts/:id/deals',
  { preHandler: requirePermission(PERMISSIONS.DEALS.READ) },
  async (request, reply) => {
    const jwt = request.user as JwtPayload;
    const { id } = IdParamSchema.parse(request.params);
    const q = PaginationQuerySchema.safeParse(request.query);
    const pagination = q.success ? q.data : { page: 1, limit: 25 };
    const result = await contacts.listContactDeals(jwt.tenantId, id, pagination);
    return reply.send(result);
  }
);

r.get(
  '/contacts/:id/timeline',
  { preHandler: requirePermission(PERMISSIONS.CONTACTS.READ) },
  async (request, reply) => {
    const jwt = request.user as JwtPayload;
    const { id } = IdParamSchema.parse(request.params);
    const result = await contacts.getContactTimeline(jwt.tenantId, id);
    return reply.send(result);
  }
);
```

---

## PART 3 — NEW FRONTEND HOOKS

### FILE 6: `apps/web/src/hooks/use-contacts.ts`

Add these two hooks at the bottom of the existing file. Do not remove any existing hooks.

```typescript
export function useContactDeals(contactId: string, opts: { page?: number; limit?: number } = {}) {
  return useQuery({
    queryKey: [...contactKeys.detail(contactId), 'deals', opts] as QueryKey,
    queryFn: () =>
      api.get<{ data: Deal[]; total: number }>(`/contacts/${contactId}/deals`, {
        params: { page: opts.page ?? 1, limit: opts.limit ?? 25 },
      }),
    enabled: Boolean(contactId),
  });
}

export function useContactTimeline(contactId: string) {
  return useInfiniteQuery({
    queryKey: [...contactKeys.detail(contactId), 'timeline'] as QueryKey,
    queryFn: ({ pageParam }) =>
      api.get<{ events: TimelineEvent[]; nextCursor: string | null }>(
        `/contacts/${contactId}/timeline`,
        { params: { cursor: pageParam } }
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(contactId),
  });
}
```

Also add these imports to the top of the file if not already present:
```typescript
import { useInfiniteQuery } from '@tanstack/react-query';
import type { Deal, TimelineEvent } from '@nexus/shared-types';
```

---

## PART 4 — CONTACT DETAIL PAGE

### FILE 7: `apps/web/src/app/(dashboard)/contacts/[id]/page.tsx`

Create a full contact detail page. Target: 900–1,100 lines. Mirror the deal detail page pattern exactly.

**Required imports:**
```typescript
'use client';
import { useState, useMemo, type ReactElement } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatDate, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import {
  useContact, useUpdateContact, useDeleteContact,
  useContactTimeline, useContactDeals,
} from '@/hooks/use-contacts';
import { useContactNotes, useCreateNote, useUpdateNote, useDeleteNote, usePinNote } from '@/hooks/use-notes';
import {
  useActivities, useCreateActivity, useCompleteActivity, useDeleteActivity,
} from '@/hooks/use-activities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
```

**Tab type:**
```typescript
type TabId = 'overview' | 'activities' | 'notes' | 'deals' | 'timeline';
```

**Page structure:**

**Header section:**
- Full name as `h1`
- Job title + account name as subtitle (account name links to `/accounts/{accountId}`)
- Status pills: `doNotEmail` → red "Do Not Email" badge, `doNotCall` → red "Do Not Call" badge, `gdprConsent` → green "GDPR ✓" badge
- `lastContactedAt` shown with `formatDateTime` and label "Last contacted"
- Quick action buttons: "Log Call" (creates activity type=CALL), "Send Email" (creates activity type=EMAIL), "Schedule Meeting" (creates activity type=MEETING) — each opens an inline mini-form slide-over
- "Edit" button → opens an edit slide-over
- "Delete" button with confirmation modal

**Tab navigation:** Overview | Activities | Notes | Deals | Timeline

**Overview tab:**
Split into two columns:
- Left: Contact Information — firstName, lastName, email, phone, mobile, jobTitle, department, country, city, address, timezone, preferredChannel, linkedInUrl, twitterHandle
- Right: Settings & Status — ownerId (resolved to name from useUsers), tags (as pill badges), doNotEmail toggle, doNotCall toggle, gdprConsent + gdprConsentAt, isActive
- Custom fields: render each key/value from `customFields` JSON as a `<dt>/<dd>` pair
- Edit slide-over: all fields editable, calls `useUpdateContact`

**Activities tab:**
- Filter row: "All" | "Calls" | "Emails" | "Meetings" | "Tasks" buttons + "Overdue only" toggle
- Activity list: each row shows type icon (📞 call, ✉️ email, 🤝 meeting, ✅ task), subject, dueDate formatted, status badge
- Inline create: "Log Activity" button → mini form (type selector, subject, dueDate, notes) → calls `useCreateActivity` with `contactId`
- Complete button on each activity row → calls `useCompleteActivity`
- Delete with confirmation

**Notes tab:**
- Exactly mirror the Notes tab from the deal detail page
- `useContactNotes(id)`, `useCreateNote` (pass `contactId`), pin, update, delete
- Pinned notes shown at the top

**Deals tab:**
- Uses `useContactDeals(id)`
- Table: Deal Name (links to `/deals/{id}`), Stage, Amount (`formatCurrency`), Close Date, Status
- "No deals linked" empty state if empty
- Pagination: show `total` count and prev/next buttons

**Timeline tab:**
- Uses `useContactTimeline(id)` with `useInfiniteQuery`
- Each event: coloured left border (blue=activity, yellow=note), icon, title, description snippet, relative time
- "Load more" button when `hasNextPage` is true

**Edit slide-over:**
Full-width slide-over (same pattern as deal edit). All contact fields.
On save: `useUpdateContact`, invalidate `contactKeys.detail(id)`.

**Update contacts list to link to detail page:**
In `apps/web/src/app/(dashboard)/contacts/page.tsx`, make each contact row clickable:
Change the table row `onClick` (or the name cell) to use `router.push(`/contacts/${contact.id}`)`.
The "active" side panel in the current contacts page can be replaced with a "View full profile →" link.

---

## PART 5 — ACCOUNT DETAIL PAGE

### FILE 8: `apps/web/src/app/(dashboard)/accounts/[id]/page.tsx`

All hooks for accounts already exist: `useAccount`, `useAccountTimeline`, `useAccountDeals`,
`useAccountContacts`, `useAccountHealth`. Use them directly.

Target: 900–1,100 lines. Tab type:
```typescript
type TabId = 'overview' | 'contacts' | 'deals' | 'activities' | 'timeline';
```

**Header section:**
- Company name as `h1` with industry badge
- Type badge (PROSPECT/CUSTOMER/PARTNER/etc.) + Tier badge (SMB/MID_MARKET/ENTERPRISE/STRATEGIC)
- Status badge with colour: ACTIVE=green, AT_RISK=yellow, CHURNED=red
- Health score bar: `healthScore` rendered as a horizontal progress bar (0–100), colour coded (0–40=red, 41–70=yellow, 71–100=green)
- Website link (external, `target="_blank"`)
- NPS score pill if set
- "Edit" + "Delete" buttons

**Overview tab:**
Two columns:
- Left: Company details — name, website, phone, email, country, city, address, zipCode, industry, sicCode, naicsCode, annualRevenue (formatCurrency), employeeCount, description, linkedInUrl
- Right: Account health — healthScore bar, npsScore, type, tier, status, ownerId (resolved name), tags, parentAccount link (if set), child accounts count with link to filter
- Custom fields section

**Contacts tab:**
- Uses `useAccountContacts(id, { page, limit: 20 })`
- Table: name (links to `/contacts/{id}`), job title, email, phone, last contacted
- Pagination controls
- "Add Contact" button → modal to search existing contacts and link them (calls `PATCH /contacts/{contactId}` to set `accountId`)

**Deals tab:**
- Uses `useAccountDeals(id, { page, limit: 20 })`
- Mini kanban OR table view (toggle)
- Table: deal name (links to `/deals/{id}`), pipeline, stage, amount, close date, owner, status
- Total pipeline value shown as summary: "Total: {formatCurrency(sum of open deal amounts)}"

**Activities tab:**
- Uses `useActivities({ accountId: id, limit: 25 })`
- Same filter pattern as Contact activities tab
- Inline activity creation with `accountId` set

**Timeline tab:**
- Uses `useAccountTimeline(id)` (already infinite query in use-accounts.ts)
- Same rendering pattern as contact timeline

**Update accounts list:** In `apps/web/src/app/(dashboard)/accounts/page.tsx`, make rows link to `/accounts/{account.id}`.

---

## PART 6 — QUOTE DETAIL PAGE

### FILE 9: `apps/web/src/app/(dashboard)/quotes/[id]/page.tsx`

Uses `useQuote(id)`, `useSendQuote`, `useAcceptQuote`, `useRejectQuote`, `useVoidQuote`, `useDuplicateQuote`.
Target: 500–700 lines.

**Header:**
- Quote number (e.g. `QTE-0042`) as `h1`
- Status badge: DRAFT=grey, SENT=blue, ACCEPTED=green, REJECTED=red, VOID=dim, EXPIRED=orange
- "For:" account name + contact name
- "Linked deal:" deal name link
- Expiry date with `formatDate` — show "Expires in X days" or "Expired N days ago" in red
- Total amount large display: `formatCurrency(quote.totalAmount, quote.currency)`

**Line items table:**
Columns: Product Name | Description | Qty | Unit Price | Discount % | Line Total
- Each row is read-only when status ≠ DRAFT
- When status = DRAFT: qty and discount fields are inline-editable `<input>`s
- Footer rows: Subtotal | Total Discount | Tax | **Grand Total** (bold)
- If `approvalStatus` field exists: show an amber "Pending Approval" banner when `approvalStatus === 'PENDING'`

**Action bar (permission-gated):**
- DRAFT: "Send Quote" button → `useSendQuote` → confirm modal "This will email the quote to the contact"
- SENT: "Mark Accepted" → `useAcceptQuote`, "Mark Rejected" → `useRejectQuote` with reason input
- Any non-VOID/non-ACCEPTED: "Void" → confirm modal, "Duplicate" → `useDuplicateQuote` → redirect to new quote
- "Download PDF" button: calls `GET /api/v1/finance/quotes/{id}/pdf` if the endpoint exists, otherwise shows a toast "PDF generation coming in Phase 7"

**Update quotes list:** In `/quotes/page.tsx`, make rows link to `/quotes/{quote.id}`.

---

## PART 7 — FULL QUOTE BUILDER

### FILE 10: `apps/web/src/app/(dashboard)/quotes/new/page.tsx`

**Completely rewrite** the existing basic new quote page with a full multi-step builder.
Target: 900–1,100 lines.

**Step state:**
```typescript
type BuilderStep = 'customer' | 'products' | 'pricing' | 'review';
```

**Step 1 — Customer:**
- Search/select Account (uses `useAccounts({ search })` — searchable dropdown)
- Select Contact within that account (uses `useContacts({ accountId })`)
- Select linked Deal (optional, uses `useDeals({ accountId })`)
- Expiry date picker (defaults to today + 30 days)
- Currency selector (USD/EUR/GBP/AED — AED included for Middle East market)
- Notes textarea

**Step 2 — Product Selection:**
```typescript
interface LineItem {
  productId: string;
  name: string;
  description: string;
  qty: number;
  unitPrice: number;  // populated from product basePrice
  discountPct: number; // 0–100
  lineTotal: number;  // calculated: qty * unitPrice * (1 - discountPct/100)
}
```
- Left panel: Product catalog (uses `useProducts({ isActive: true, search })`)
  - Search input
  - Product cards: name, description, base price, "Add to Quote" button
- Right panel: Quote line items
  - Each line: product name, qty spinner (+/-), unit price (readonly), discount % input, line total
  - Remove (×) button per line
  - "Clear all" button

**Step 3 — Pricing:**
- Overall discount %: input 0–100, applied after line discounts
- Promo code input: calls `GET /api/v1/finance/cpq/validate-promo?code={code}&tenantId={x}` 
  On success: show applied promo name + savings amount
  On failure: show "Invalid or expired code" error
- Tax rate % (optional)
- Live totals preview:
  ```
  Subtotal:          $12,500.00
  Line discounts:    -$1,250.00
  Overall discount:  -$550.00
  Promo (SAVE10):    -$108.00
  Tax (5%):          +$529.60
  ─────────────────────────────
  Grand Total:       $11,121.60
  ```
  All calculated client-side using exact decimal arithmetic:
  `lineTotal = qty * unitPrice * (1 - discountPct/100)`
  `subtotal = sum(lineTotal)`
  `afterLineDisc = subtotal`
  `afterOverall = afterLineDisc * (1 - overallDiscountPct/100)`
  `afterPromo = afterOverall - promoDiscount`
  `tax = afterPromo * (taxRate/100)`
  `grandTotal = afterPromo + tax`

**Step 4 — Review:**
- Summary of customer (account, contact, deal)
- Summary of all line items in read-only table
- Final totals box
- "Create Quote" button → calls `useCreateQuote` with full payload:
  ```typescript
  {
    accountId, contactId, dealId, expiryDate, currency, notes,
    lineItems: [{ productId, qty, unitPrice, discountPct }],
    overallDiscountPct, promoCode, taxRate,
  }
  ```
- On success: redirect to `/quotes/{newQuote.id}`
- On error: show toast with error message, stay on review step

**Progress indicator:** horizontal step bar at top showing the 4 steps.
**Back / Next navigation** between steps with validation (can't proceed from step 1 without account selected, can't proceed from step 2 without at least 1 line item).

---

## PART 8 — ANALYTICS DASHBOARD WITH CHARTS

### FILE 11: `apps/web/src/app/(dashboard)/analytics/page.tsx`

**Completely rewrite** the existing basic analytics page with real recharts visualisations.
Target: 700–900 lines.

**Required imports:**
```typescript
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, FunnelChart, Funnel, LabelList,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  usePipelineSummary, usePipelineFunnel, useDealVelocity,
  useRevenueSummary, useRevenueByRep, useActivitySummary,
  useDealVelocity,
} from '@/hooks/use-analytics';
```

**Layout:** 2-column grid on desktop, 1-column on mobile. Each chart in a white card with title + subtitle.

**Chart 1 — Pipeline Funnel (full width):**
- Data from `usePipelineFunnel(from, to)` — date range picker at top (default: last 30 days)
- Horizontal bar chart: each stage = one bar, length = deal count
- Secondary label: deal value per stage
- Colour: gradient from light blue (top of funnel) to dark blue (bottom)
- Show conversion rate % between bars: `stageN.count / stage0.count * 100`

**Chart 2 — Monthly Revenue (line chart):**
- Data from `useRevenueSummary` for each of the last 6 months
- Build 6 data points by calling the hook with `{ year, quarter }` params
- X-axis: month abbreviation (Jan, Feb...)
- Y-axis: currency formatted
- Two lines: totalRevenue (solid blue) + target/quota line (dashed grey) — use 0 for quota if not yet set

**Chart 3 — Activities by Type (donut chart):**
- Data from `useActivitySummary`
- Donut pie chart with 6 segments (CALL, EMAIL, MEETING, TASK, DEMO, OTHER)
- Custom colours: CALL=#3b82f6, EMAIL=#8b5cf6, MEETING=#10b981, TASK=#f59e0b, DEMO=#ef4444, OTHER=#6b7280
- Centre label: total activity count
- Legend below

**Chart 4 — Win Rate Trend (area chart):**
- Build from `useRevenueSummary` across last 4 quarters
- X-axis: Q1/Q2/Q3/Q4
- Area showing winRate % per quarter
- Reference line at 30% (industry benchmark)

**Chart 5 — Avg Days in Pipeline (bar chart):**
- Data from `usePipelineSummary`
- Single metric displayed: `avgDaysInPipeline` as a large number card rather than chart
- Benchmarks below: "Industry avg: 45 days", colour green if below benchmark, red if above

**Chart 6 — Top Reps by Revenue (horizontal bar):**
- Data from `useRevenueByRep(currentYear)`
- Top 5 reps: horizontal bars, labels = rep name (or ownerId if name not available), value = totalRevenue
- Each bar shows win rate % as a secondary label

**Summary cards row (top of page):**
Four KPI cards using `usePipelineSummary` and `useRevenueSummary`:
- Total Pipeline Value
- Avg Deal Size
- Win Rate %
- Avg Days to Close

**Date range state:**
```typescript
const [period, setPeriod] = useState({
  from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  to: new Date().toISOString().slice(0, 10),
  year: new Date().getFullYear(),
  quarter: undefined as number | undefined,
});
```
Period picker: "Last 30 days" | "This Quarter" | "This Year" | "Last Year" — buttons that update the period state.

---

## PART 9 — ACTIVITIES PAGE IMPROVEMENTS

### FILE 12: `apps/web/src/app/(dashboard)/activities/page.tsx`

**Add at the top of the page (below the title):**
Three filter tabs: **Today** | **Overdue** | **All**

Tab logic:
- "Today": filter `dueAfter = start of today, dueBefore = end of today`
- "Overdue": filter `overdue = true, dueBefore = now`
- "All": no date filter

**Add to each activity row:** An inline "✓ Complete" button that calls `useCompleteActivity(id)` directly without a modal. Show a green checkmark animation on success (use a brief `completed` state on the row that shows a ✅ for 1.5 seconds before fading).

**Group activities by date:**
Instead of a flat list, group into sections:
- "Overdue" (red header)
- "Today" (blue header)
- "Tomorrow"
- Day names for the next 5 days
- "Later"
Use `useMemo` to compute the groups from the flat activity list.

---

## PART 10 — UPDATE LIST PAGES TO LINK TO DETAIL PAGES

### FILE 13: `apps/web/src/app/(dashboard)/contacts/page.tsx`

Find the table row rendering and make the contact name a `<Link href={`/contacts/${contact.id}`}>` instead of a click handler that opens the side panel. Keep the side panel for quick-edit, but the primary name click goes to the full detail page.

### FILE 14: `apps/web/src/app/(dashboard)/accounts/page.tsx`

Same treatment: account name in each row → `<Link href={`/accounts/${account.id}`}>`.

### FILE 15: `apps/web/src/app/(dashboard)/quotes/page.tsx`

Quote number / name in each row → `<Link href={`/quotes/${quote.id}`}>`.

---

## PART 11 — TESTS

### FILE 16: `services/workflow-service/src/__tests__/fork.test.ts`

**Rewrite** the existing fork test (which currently passes via mocks) to verify the actual
fork.node.ts implementation:
- `handleForkNode` with 2 branches:
  - Calls `prisma.workflowForkTracker.create` with correct branchNodeIds
  - Calls `prisma.workflowExecution.create` twice (once per branch)
  - Calls `producer.publish` twice with `workflow.branch.start`
  - Returns `pauseUntil` set ~24h in future + `nextNodeId = joinNodeId`
- `handleForkNode` with 0 branches → returns `{ skipped: true, reason: 'no_branches' }`
- `handleForkNode` missing `joinNodeId` → throws Error
- `handleJoinNode` with 1 of 2 branches complete → returns `pauseUntil` ~60s future
- `handleJoinNode` with all branches complete → returns `pauseUntil: null, joined: true`
- `handleJoinNode` with no tracker → returns `{ joined: true, note: 'no_tracker' }`

Follow the exact vitest mock pattern from `services/workflow-service/src/__tests__/nodes.test.ts`.

---

## PART 12 — FINAL CHECKLIST

Before finishing, verify:
- [ ] `fork.node.ts` — full function body present, not truncated
- [ ] `join.node.ts` — full function body present, not truncated
- [ ] `executor.ts` FORK/JOIN cases pass `prisma` and `producer`
- [ ] `/contacts/:id/deals` and `/contacts/:id/timeline` routes added to contacts.routes.ts
- [ ] `useContactDeals` and `useContactTimeline` added to use-contacts.ts
- [ ] `/contacts/[id]/page.tsx` exists with 5 tabs, all implemented
- [ ] `/accounts/[id]/page.tsx` exists with 5 tabs, all implemented
- [ ] `/quotes/[id]/page.tsx` exists with line items table + action buttons
- [ ] `/quotes/new/page.tsx` is a 4-step builder with product picker + live totals
- [ ] `/analytics/page.tsx` has 6 recharts visualisations
- [ ] `/activities/page.tsx` has Today/Overdue/All tabs + grouping + inline complete
- [ ] Contact, Account, Quote list pages link to detail pages
- [ ] Fork test rewritten with real assertions
- [ ] Zero `any` types in all new code
- [ ] Zero `TODO` / `FIXME` in all new code

---

## FILE COUNT SUMMARY

| # | File | Action |
|---|------|--------|
| 1 | `services/workflow-service/src/engine/nodes/fork.node.ts` | REWRITE (complete) |
| 2 | `services/workflow-service/src/engine/nodes/join.node.ts` | REWRITE (complete) |
| 3 | `services/workflow-service/src/engine/executor.ts` | UPDATE FORK/JOIN dispatch |
| 4 | `services/crm-service/src/services/contacts.service.ts` | ADD listContactDeals + getContactTimeline |
| 5 | `services/crm-service/src/routes/contacts.routes.ts` | ADD /contacts/:id/deals + /contacts/:id/timeline |
| 6 | `apps/web/src/hooks/use-contacts.ts` | ADD useContactDeals + useContactTimeline |
| 7 | `apps/web/src/app/(dashboard)/contacts/[id]/page.tsx` | CREATE (5-tab detail page) |
| 8 | `apps/web/src/app/(dashboard)/accounts/[id]/page.tsx` | CREATE (5-tab detail page) |
| 9 | `apps/web/src/app/(dashboard)/quotes/[id]/page.tsx` | CREATE (line items viewer) |
| 10 | `apps/web/src/app/(dashboard)/quotes/new/page.tsx` | REWRITE (4-step builder) |
| 11 | `apps/web/src/app/(dashboard)/analytics/page.tsx` | REWRITE (6 recharts charts) |
| 12 | `apps/web/src/app/(dashboard)/activities/page.tsx` | UPDATE (tabs + grouping + inline complete) |
| 13 | `apps/web/src/app/(dashboard)/contacts/page.tsx` | UPDATE (link rows to detail) |
| 14 | `apps/web/src/app/(dashboard)/accounts/page.tsx` | UPDATE (link rows to detail) |
| 15 | `apps/web/src/app/(dashboard)/quotes/page.tsx` | UPDATE (link rows to detail) |
| 16 | `services/workflow-service/src/__tests__/fork.test.ts` | REWRITE (real assertions) |

**Total: 16 files — estimated 4,500–5,500 new/changed LOC**
