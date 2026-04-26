# CURSOR PROMPT 14 — Modernized Dashboards

## Context
NEXUS CRM — pnpm monorepo. Frontend: `apps/web` (Next.js 14 App Router).
Charts: use `recharts` (already installed). Icons: `lucide-react`.
All dashboard pages are under `apps/web/src/app/(dashboard)/`.
Data fetches use `@tanstack/react-query` for client-side or Next.js `fetch` for server components.

## Goal
Replace the basic dashboard pages with modern, data-rich dashboards that give sales managers and reps instant visibility into their pipeline, performance, territory, and commissions.

---

## TASK 1 — Redesigned Main Dashboard (Home)

### File: `apps/web/src/app/(dashboard)/page.tsx`
Complete rewrite. This is the first thing users see after login. Make it exceptional.

**Layout (top to bottom):**

### 1a. Welcome Header
```tsx
<div className="flex items-center justify-between">
  <div>
    <h1 className="text-2xl font-bold text-gray-900">
      Good morning, {firstName} 👋
    </h1>
    <p className="text-sm text-gray-500 mt-0.5">
      {todayDate} · {openDealsCount} open deals · {tasksDueToday} tasks due today
    </p>
  </div>
  <div className="flex items-center gap-3">
    <DateRangePicker />  {/* period selector: Today / This Week / This Month / This Quarter */}
    <button className="btn-primary">+ New Deal</button>
  </div>
</div>
```

### 1b. KPI Row (5 cards, responsive grid)
Cards: StatCard component from skeleton. Each has icon, label, value, delta vs previous period.
1. **Revenue** — sum of Closed Won deals in period. Delta arrow (green/red).
2. **Pipeline Value** — total value of Open+Active deals.
3. **Win Rate** — closed won / (closed won + closed lost) %. 
4. **Avg Deal Size** — revenue / won deal count.
5. **Activities Today** — calls logged + emails sent + meetings held.

### 1c. Two-Column Row
**Left (60%)**: Area chart — "Revenue over time" — daily revenue for selected period, using recharts `AreaChart`. Two series: `Closed Won` (blue fill) and `Pipeline Value` (gray dashed).

**Right (40%)**: Donut chart — "Pipeline by stage" — recharts `PieChart` showing deal count and value per pipeline stage. Legend below with stage name, count, total value.

### 1d. Three-Column Row
**Column 1**: "My Tasks today" — checklist of tasks due today. Each row: priority dot, task title, contact name (link), due time. Mark-done checkbox. "View all tasks" link.

**Column 2**: "My deals — activity needed" — list of 5 deals with no activity in >7 days. Deal name, value, days since last touch, quick actions: Log call / Send email / Schedule meeting (icon buttons).

**Column 3**: "Upcoming meetings" — list of calendar events today and tomorrow. Event title, time, attendees avatars, "Join" button (external link).

### 1e. Team Leaderboard (if role is manager or admin)
Table: Rank | Rep name+avatar | Deals won | Revenue | Win rate | Quota % | Trend (sparkline).
Sorted by Revenue desc. Top 3 get gold/silver/bronze badge.

### 1f. Onboarding Checklist
Already exists — import `<OnboardingChecklist />`. Show only if `completedSteps < totalSteps`.

---

## TASK 2 — Pipeline Analytics Dashboard

### File: `apps/web/src/app/(dashboard)/pipeline/analytics/page.tsx`
Deep pipeline intelligence page.

**Section 1: Funnel visualization**
Vertical or horizontal funnel showing deal count and conversion rate between each stage.
Use custom SVG funnel (recharts `FunnelChart`). Show: stage name, deal count, total value, conversion % from previous stage.

**Section 2: Velocity metrics** (4 cards)
- Average days in pipeline (total cycle time)
- Average days per stage (breakdown table)
- Deals stalled >14 days (count + list)
- Projected close this month (based on current pipeline × win rate)

**Section 3: Deal flow over time**
Stacked bar chart by week: New deals entered vs Deals closed won vs Deals closed lost.

**Section 4: Cohort table**
Matrix: rows = months created, columns = stages. Cell = deals still in that stage. Highlights stagnation.

---

## TASK 3 — Sales Performance Dashboard

### File: `apps/web/src/app/(dashboard)/reports/performance/page.tsx`

**Header filters**: Date range, Team, Rep (multi-select), Product/Service

**Section 1: Individual rep scorecard grid**
For each rep (or filtered subset):
Card showing: avatar, name, quota progress bar (x% of $target), deals won, revenue, activities (calls+emails+meetings), avg response time.

**Section 2: Activity breakdown chart**
Grouped bar chart per rep: calls / emails / meetings / demos per week.

**Section 3: Revenue vs Quota line chart**
Multi-line chart. One line per rep (or selected reps). X-axis: weeks. Y-axis: cumulative revenue. Dashed horizontal line = quota target.

**Section 4: Win/loss analysis**
Pie: Won vs Lost by count. Bar: Lost deals by reason (from deal.lostReason field). Table: top 5 competitors mentioned in lost deals (from notes field, parsed).

**Section 5: Response time analysis**
Average hours from lead created → first contact, per rep. Bar chart. SLA line at 4 hours.

---

## TASK 4 — Territory Dashboard

### File: `apps/web/src/app/(dashboard)/territories/page.tsx`

**Map placeholder + Region cards**
Since we can't embed Google Maps without API key, use a clean regional breakdown:
- Filter by region/territory
- Each territory card: name, assigned rep, deal count, pipeline value, YTD revenue, quota attainment %, open leads

**Territory comparison table**
Side-by-side table: territory | rep | leads | deals | revenue | win rate | growth vs last quarter

**Leakage alert**
Highlight deals where the contact's address is outside the rep's assigned territory.
Table: Deal name | Contact | Contact's region | Assigned rep | Correct rep

---

## TASK 5 — Manager Dashboard

### File: `apps/web/src/app/(dashboard)/reports/manager/page.tsx`
Available only to users with role `manager` or `admin`.

**Section 1: Team snapshot (top row)**
- Total team quota: progress bar (revenue / total quota)
- Reps on track (≥75% to quota): count
- Reps at risk (25–74%): count  
- Reps behind (<25%): count

**Section 2: Forecast summary**
Table with columns: Rep | Commit | Best case | Pipeline | Weighted forecast | Quota | Gap.
Row totals at bottom. Color coding: green if forecast ≥ quota, yellow if 75–99%, red if <75%.

**Section 3: Coaching opportunities**
Auto-generated list of coaching signals:
- Low activity (< N calls/emails this week)
- High stall rate (>30% deals stalled)
- Low response time (>8h avg first response)
- Discount dependency (>40% of deals had discounts)
Each signal: rep name, metric, deviation from team average, "Schedule 1:1" button.

**Section 4: Pipeline risk heatmap**
Table: rows = deal stages, columns = deal value brackets ($0–$10k, $10k–$50k, $50k+).
Each cell = count of deals in that state. Red = high concentration of large deals in early stages.

---

## TASK 6 — Commission Calculator Dashboard

### File: `apps/web/src/app/(dashboard)/commissions/page.tsx`

**My commission summary (current period)**
- Base commission earned (% of closed won revenue)
- Accelerator bonuses (if over quota, higher %)
- Spiff bonuses (one-off deal bonuses)
- Estimated total payout
- Payout date

**Earnings timeline chart**
Bar chart per month: base commission + accelerator + spiff stacked.

**Deal commission breakdown table**
Every closed deal this period: Deal name | Close date | Amount | Commission % | Commission $ | Accelerator applied | Spiff

**What-if calculator**
Interactive sliders: "If I close $X more this month at Y% avg discount, my total commission will be $Z."
Recharts `LineChart` showing payout curve from current → overachievement.

**Commission plan summary card**
Current plan: base %, quota, accelerator tiers (0–100%: X%, 100–120%: Y%, >120%: Z%), active SPIFFs.

---

## TASK 7 — Shared Dashboard Components

### File: `apps/web/src/components/dashboard/StatCard.tsx`
```tsx
interface StatCardProps {
  label: string;
  value: string | number;
  delta?: number;       // +/- % vs previous period
  deltaLabel?: string;  // "vs last month"
  icon: React.ReactNode;
  iconBg?: string;      // tailwind bg class
  format?: 'currency' | 'percent' | 'number';
}
```
Show icon on right side in colored circle. Large value. Small delta below (green arrow if positive, red if negative).

### File: `apps/web/src/components/dashboard/DateRangePicker.tsx`
Dropdown with options: Today, Yesterday, This Week, Last Week, This Month, Last Month, This Quarter, Last Quarter, This Year, Custom range.
On custom: show two date inputs (from/to). Exposes `value: DateRange` and `onChange` prop.
Store selection in URL search params (`?from=&to=`) so links are shareable.

### File: `apps/web/src/components/dashboard/EmptyState.tsx`
```tsx
// Generic empty state with icon, title, description, optional action button
export function EmptyState({ icon, title, description, action }: ...) 
```

### File: `apps/web/src/components/dashboard/Sparkline.tsx`
Tiny inline `recharts LineChart` (no axes, no legend) for trend indicators in tables.
Props: `data: number[]`, `color?: string`, `width?: number`, `height?: number`.

---

## TASK 8 — Dashboard Navigation Update

### File: `apps/web/src/components/layout/sidebar.tsx`
Expand the Reports and Analytics section in the sidebar. Replace flat links with an expandable group:

**Reports & Analytics** (chevron to expand):
- Pipeline Analytics → `/pipeline/analytics`
- Sales Performance → `/reports/performance`
- Manager Dashboard → `/reports/manager` (only if role=manager|admin)
- Territory View → `/territories`
- Commissions → `/commissions`

**My Work**:
- Dashboard → `/`
- My Deals → `/deals`
- My Contacts → `/contacts`
- My Tasks → `/tasks`
- Calendar → `/calendar`

---

## Verification Checklist
- [ ] Main dashboard renders 5 KPI cards with delta indicators
- [ ] Area chart and donut chart render without crashing
- [ ] Task list, stale deals, and upcoming meetings panels populate
- [ ] Team leaderboard visible to managers/admins only
- [ ] Pipeline analytics funnel chart renders with stage conversion rates
- [ ] Performance dashboard shows rep scorecards
- [ ] Territory dashboard shows regional breakdown table
- [ ] Manager dashboard locked to manager+ roles
- [ ] Commission calculator renders with working what-if sliders
- [ ] DateRangePicker syncs selection to URL params
- [ ] StatCard, Sparkline, EmptyState components exported from their files
- [ ] Sidebar report group is expandable
