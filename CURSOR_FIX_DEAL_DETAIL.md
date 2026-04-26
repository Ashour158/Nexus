# URGENT FIX — Write `apps/web/src/app/(dashboard)/deals/[id]/page.tsx`

## The problem
The directory `/deals/[id]/` exists but `page.tsx` is completely missing/empty.
Users can see the pipeline board but cannot click into any deal.
This is the single most important page in the frontend.

## Do not touch anything else — one file only.

## References to read first
- `@apps/web/src/app/(dashboard)/deals/page.tsx` — the list page pattern
- `@apps/web/src/hooks/use-deals.ts` — available hooks (useDeal, useUpdateDeal, useMoveDeal, useDealTimeline, useDealQuotes)
- `@apps/web/src/components/deals/deal-meddic-form.tsx` — already built, import it
- `@apps/web/src/components/deals/deal-form.tsx` — form patterns
- `@apps/web/src/hooks/use-activities.ts` — useCreateActivity, useCompleteActivity
- `@apps/web/src/hooks/use-notes.ts` — useCreateNote, useDealNotes
- `@apps/web/src/stores/auth.store.ts` — useAuthStore for current user id + hasPermission

## Write the complete file. Zero stubs. Every tab fully implemented.

```tsx
'use client';

// File: apps/web/src/app/(dashboard)/deals/[id]/page.tsx
```

### Layout
Two-column grid on desktop:
- Left (col-span-2): tabbed content area
- Right (col-span-1): sticky metadata sidebar
- Mobile: stacked single column

### Data loading (all parallel, non-blocking)
```typescript
const { data: dealData, isLoading, isError } = useDeal(id);
const deal = dealData?.data;
// load the rest only after deal is available:
// useDealTimeline, useDealActivities, useDealNotes, useDealQuotes
// use the 'enabled: !!deal' React Query option
```

---

## TAB 1 — Overview

**Deal header:**
- `<h1>` with deal name
- Amount: `formatCurrency(deal.amount, deal.currency)` in `text-3xl font-bold`
- Status badge: WON=green, LOST=red, OPEN=blue, DORMANT=grey
- Breadcrumb: `{pipeline.name} › {stage.name}` (from `deal.pipeline` and `deal.stage` relations)

**Account card** (if `deal.account` exists):
- Account name as a link (href=`/accounts` for now)
- Website as external link with icon
- Industry chip, ARR formatted, tier badge (STRATEGIC=purple, ENTERPRISE=blue, MID_MARKET=teal, SMB=grey)

**MEDDIC section:**
- Circular SVG progress ring showing `deal.meddicicScore` / 100
  - Ring color: score < 40 → red, 40–70 → amber, > 70 → green
  - SVG approach: `r=36`, `circumference = 2 * Math.PI * 36 ≈ 226.2`
  - `stroke-dasharray={circumference}`, `stroke-dashoffset={circumference - (score/100)*circumference}`
  - Score number in center, "MEDDIC" label below
- Below ring: `<DealMeddicicForm dealId={id} initialData={deal.meddicicData} />`

**Contacts section:**
- List `deal.contacts` (from `DealWithRelations`)
- Each contact: initials avatar (2-letter, colored by hash of name), name, role badge, email
- "+ Add Contact" button → popover with:
  - Contact combobox (search `GET /contacts?search=` via `useContacts`)
  - Role text input
  - isPrimary checkbox
  - Save → `useAddDealContact()` mutation → `POST /deals/:id/contacts`
  - Write `useAddDealContact` and `useRemoveDealContact` hooks inline in this file or add to use-deals.ts

**Custom fields:** collapsible section, renders `deal.customFields` as `<dl>` key-value pairs

**Tags:** `deal.tags` rendered as grey pill chips

---

## TAB 2 — Timeline

Pull from `useDealTimeline(id, { page: 1, limit: 20 })`.

Each event renders as a vertical feed item (left dot + line connector):
- ACTIVITY event: phone/email/meeting icon, bold subject, status chip, relative time ("2h ago")
  - If status === 'OPEN': inline "Complete" button → small popover with outcome textarea → `useCompleteActivity()` mutation
- NOTE event: sticky-note icon, content (truncated 3 lines, "expand" link), author initials, relative time
  - If `metadata.isPinned`: show 📌 icon

Load more button if `timeline.data?.meta.hasNextPage`.

---

## TAB 3 — Activities

Pull from `useDealActivities(id)` if the hook exists, otherwise use `useActivities({ dealId: id })`.

**Table:**
| Icon+Type | Subject | Due Date | Priority | Status | Owner |
- Due date: red text if `dueDate < new Date() && status === 'OPEN'`
- Priority badge: URGENT=red, HIGH=orange, MEDIUM=blue, LOW=grey
- Status chip: OPEN=blue, DONE=green, CANCELLED=grey

**Row actions:**
- Complete button (OPEN only) → outcome popover → `useCompleteActivity({ id, outcome })`
- Delete → confirm dialog → `useDeleteActivity()`

**"+ Schedule Activity" button** → renders `<ActivitySlideOver>` component (write inline):
```tsx
// Local component inside this file
function ActivitySlideOver({ dealId, open, onClose }: { dealId: string; open: boolean; onClose: () => void }) {
  // Form fields:
  // - type: select [CALL, EMAIL, MEETING, TASK, DEMO, FOLLOW_UP]
  // - subject: text input (required)
  // - dueDate: datetime-local input
  // - priority: select [LOW, MEDIUM, HIGH, URGENT]
  // - description: textarea
  // Submit: useCreateActivity() → { dealId, type, subject, dueDate, priority, description }
  // On success: onClose(), invalidate activities query
}
```

---

## TAB 4 — Notes

Pull from `useDealNotes(id)` — pinned first, then by createdAt desc.

**Top: always-visible new note form:**
```tsx
<textarea placeholder="Write a note..." rows={3} />
<button>Save Note</button>
// Submit: useCreateNote() → { dealId, content, authorId: user.id }
```

**Notes list:**
Each note card:
- Author initials avatar, relative timestamp, pinned indicator if `isPinned`
- Full note content (not truncated)
- On hover: show action buttons
  - Edit (pencil icon) — only if `note.authorId === currentUserId` → replaces content with textarea
  - Pin/Unpin (pin icon) — always visible for SALES_MANAGER+
  - Delete (trash icon) — only if `note.authorId === currentUserId`

Write `usePinNote`, `useUnpinNote`, `useUpdateNote`, `useDeleteNote` hooks if not already in use-notes.ts. Check the file first.

---

## TAB 5 — Quotes

Pull from `useDealQuotes(id)`.

**Table:**
| Quote # | Status | Total | Version | Expires | Actions |
- Quote number: `Q-${deal.id.slice(-4).toUpperCase()}-${quote.version}`
- Status badge: DRAFT=grey, SENT=blue, ACCEPTED=green, REJECTED=red, EXPIRED=amber, VOID=slate
- Actions:
  - DRAFT: "Send" button → `useSendQuote()` mutation → `POST /quotes/:id/send`
  - Any: "Duplicate" → `useDuplicateQuote()` mutation
  - DRAFT/SENT: "Void" → confirm → `useVoidQuote({ id, reason: 'User cancelled' })`
  - Any: "Download" → disabled with tooltip "PDF export coming soon"

**"+ New Quote" button** → `router.push('/quotes/new?dealId=' + id)`

Write `useSendQuote`, `useDuplicateQuote`, `useVoidQuote` hooks if not in use-quotes.ts. Check first.

---

## RIGHT SIDEBAR

**Deal info card:**
```
Owner:          [initials avatar] [Full name]         [Reassign link — MANAGER+ only]
Expected close: [formatted date]  ← red if past + OPEN
Probability:    [progress bar 0-100, color by value]
Forecast:       [inline select: PIPELINE/BEST_CASE/COMMIT/CLOSED/OMITTED]
                → onChange calls useUpdateDeal({ forecastCategory: value }) immediately
Created:        [formatted date]
Updated:        [relative time]
```

**Stage progression:**
- Load pipeline stages from `deal.pipeline?.stages` (already in DealWithRelations)
- Sort by `stage.order`
- Render horizontal pill list: each stage = small circle + name
  - Past stages: filled circle (green)
  - Current stage: filled circle (blue) + bold label
  - Future stages: empty circle (grey)
- Click any future stage → `<ConfirmDialog>` "Move deal to [stage name]?" → `useMoveDeal({ id, stageId })`

**Quick actions:**
```tsx
<button
  onClick={() => setShowWonModal(true)}
  disabled={deal.status !== 'OPEN'}
  className="w-full bg-green-600 hover:bg-green-700 text-white ..."
>
  🎉 Mark Won
</button>

<button
  onClick={() => setShowLostModal(true)}
  disabled={deal.status !== 'OPEN'}
  className="w-full border border-red-300 text-red-600 ..."
>
  Mark Lost
</button>

<Link href={`/deals/${id}/edit`} className="...">
  Edit Deal
</Link>
```

**Mark Won modal:**
- Confirmation text: "Congratulations! Mark [deal.name] as Won?"
- Confirm button → `useMarkDealWon()` → `POST /deals/:id/won`
- On success: show brief confetti effect (use CSS keyframe animation — 5 colored divs fly up from button, no external library)
- Invalidate deal query

**Mark Lost modal:**
- Required field: Lost Reason select (PRICE / COMPETITION / NO_BUDGET / NO_DECISION / TIMING / OTHER)
- Optional: Detail textarea
- Confirm → `useMarkDealLost({ id, reason, detail })` → `POST /deals/:id/lost`

**Tags display:**
- `deal.tags` as removable chips
- "+ Add" opens inline text input → on Enter: `useUpdateDeal({ tags: [...deal.tags, newTag] })`

---

## Missing hooks to write (check use-deals.ts first, add only what's missing)

```typescript
// In use-deals.ts or inline exports:
useMarkDealWon()     → POST /deals/:id/won
useMarkDealLost()    → POST /deals/:id/lost, body: { reason, detail? }
useAddDealContact()  → POST /deals/:id/contacts, body: { contactId, role?, isPrimary? }
useRemoveDealContact() → DELETE /deals/:id/contacts/:contactId
```

---

## Full page skeleton + error state

```tsx
if (isLoading) return <DealDetailSkeleton />  // full page skeleton matching the layout
if (isError || !deal) return (
  <div className="...">
    <p>Deal not found or you don't have access.</p>
    <Link href="/deals">← Back to deals</Link>
  </div>
)
```

`DealDetailSkeleton` — write as a local component: skeleton cards matching the two-column layout, skeleton lines for each section.

---

## Anti-stub check before finishing
- [ ] All 5 tabs render real data (not placeholder text)
- [ ] Mark Won and Mark Lost both call real mutations
- [ ] Stage click calls `useMoveDeal` on confirm
- [ ] ActivitySlideOver form submits via `useCreateActivity`
- [ ] New note form submits via `useCreateNote`
- [ ] All hooks used are real (check each import resolves)
- [ ] No `// TODO`, no `as any`, no stub returns
