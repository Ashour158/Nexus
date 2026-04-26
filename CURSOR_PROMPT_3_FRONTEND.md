# Prompt 3 — Frontend: Reports Charts + Search Command Palette + Calendar Page

## Context

NEXUS CRM — Next.js 14 App Router, TypeScript 5, Tailwind CSS, TanStack Query v5, Zustand, Recharts 2.12.

**What already exists and is correct — do NOT touch:**
- `apps/web/src/app/(dashboard)/analytics/page.tsx` — full recharts implementation with Area, Bar, Line, Pie, Funnel charts. This is the reference for chart patterns.
- `apps/web/src/app/(dashboard)/page.tsx` (dashboard) — already has recharts BarChart for pipeline stages.
- `apps/web/src/components/layout/topbar.tsx` — already has notification bell, `useNotifications`, `useUnreadNotificationsCount`, and SearchIcon with ⌘K trigger.
- `apps/web/src/hooks/use-analytics.ts` — exports `usePipelineSummary`, `usePipelineFunnel`, `useRevenueSummary`, `useRevenueByRep`, `useDealVelocity`, `useForecast`, `useActivityByType`, `useActivitySummary`.

**recharts** is already installed (`"recharts": "^2.12.7"` in apps/web/package.json).

---

## TASK 1 — Add Charts to Reports Page

**File**: `apps/web/src/app/(dashboard)/reports/page.tsx`

The page currently shows a template browser and a raw table of results after running a report. Add a chart visualisation section that renders when `viewer` state is non-null (i.e. after running a report).

**Add these imports** at the top of the file:
```typescript
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
```

**Add a `renderChart` helper function** inside the component, before the return statement:

```typescript
function renderChart(result: ReportResult, reportName: string) {
  const { columns, rows } = result;
  if (!rows.length || columns.length < 2) return null;

  const labelCol = columns[0];
  const valueCol = columns.find((c) => {
    const sample = rows[0]?.[c];
    return typeof sample === 'number' || (typeof sample === 'string' && !isNaN(Number(sample)));
  }) ?? columns[1];

  const data = rows.slice(0, 20).map((row) => ({
    name: String(row[labelCol] ?? ''),
    value: Number(row[valueCol] ?? 0),
  }));

  const COLORS = ['#2E5BA8', '#1A7F37', '#E67E22', '#E74C3C', '#8E44AD', '#16A085'];

  // Pie chart for category breakdowns
  if (reportName.toLowerCase().includes('stage') || reportName.toLowerCase().includes('type') || reportName.toLowerCase().includes('status')) {
    return (
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  // Line chart for time-series
  if (reportName.toLowerCase().includes('trend') || reportName.toLowerCase().includes('month') || reportName.toLowerCase().includes('week')) {
    return (
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Line type="monotone" dataKey="value" stroke="#2E5BA8" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  // Default: horizontal bar chart
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 36)}>
      <BarChart data={data} layout="vertical" margin={{ left: 20, right: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis type="number" tick={{ fontSize: 11 }} />
        <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={120} />
        <Tooltip />
        <Bar dataKey="value" fill="#2E5BA8" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

**In the JSX**, find the section where `viewer` data is rendered (currently shows a raw table). Add the chart **above** the raw table:

```tsx
{viewer && (
  <section className="space-y-4">
    {/* Chart visualisation */}
    {viewer.rows.length > 0 && (
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">
          {activeReport?.name ?? 'Report'} — Chart View
        </h3>
        {renderChart(viewer, activeReport?.name ?? '')}
      </div>
    )}

    {/* Raw data table — keep existing */}
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <p className="text-sm font-medium text-slate-700">
          {viewer.rows.length} row{viewer.rows.length !== 1 ? 's' : ''}
        </p>
        <Button variant="secondary" onClick={() => setViewer(null)}>
          Close
        </Button>
      </div>
      {/* existing table content */}
    </div>
  </section>
)}
```

---

## TASK 2 — Search Command Palette

**File to create**: `apps/web/src/components/layout/command-palette.tsx`

The topbar already has a SearchIcon button that shows ⌘K. Create the command palette component it triggers. The topbar imports and renders it already (check `topbar.tsx`) — if not, add `<CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />` to the topbar JSX where the search icon is.

**Full component**:

```typescript
'use client';

import { useEffect, useRef, useState, type JSX } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiClients } from '@/lib/api-client';
import { SearchIcon } from '@/components/ui/icons';

interface SearchResult {
  id: string;
  type: 'deal' | 'contact' | 'account' | 'lead';
  title: string;
  subtitle?: string;
}

interface SearchResponse {
  hits: Array<{
    id: string;
    type: string;
    title: string;
    subtitle?: string;
  }>;
}

const TYPE_LABELS: Record<string, string> = {
  deal: 'Deal', contact: 'Contact', account: 'Account', lead: 'Lead',
};
const TYPE_HREFS: Record<string, (id: string) => string> = {
  deal: (id) => `/deals/${id}`,
  contact: (id) => `/contacts/${id}`,
  account: (id) => `/accounts/${id}`,
  lead: (id) => `/leads/${id}`,
};
const TYPE_COLORS: Record<string, string> = {
  deal: 'bg-blue-100 text-blue-700',
  contact: 'bg-emerald-100 text-emerald-700',
  account: 'bg-purple-100 text-purple-700',
  lead: 'bg-orange-100 text-orange-700',
};

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: Props): JSX.Element | null {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);

  const searchQuery = useQuery({
    queryKey: ['search', query],
    queryFn: () =>
      apiClients.search.get<SearchResponse>('/search', { params: { q: query, limit: 8 } }),
    enabled: query.trim().length >= 2,
    staleTime: 5000,
  });

  const results: SearchResult[] = (searchQuery.data?.hits ?? []).map((h) => ({
    id: h.id,
    type: h.type as SearchResult['type'],
    title: h.title,
    subtitle: h.subtitle,
  }));

  // Quick nav shortcuts when query is empty
  const shortcuts = [
    { label: 'New Deal', href: '/deals/new' },
    { label: 'Deals', href: '/deals' },
    { label: 'Contacts', href: '/contacts' },
    { label: 'Accounts', href: '/accounts' },
    { label: 'Reports', href: '/reports' },
  ];

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setSelected(0);
    }
  }, [open]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  function navigate(href: string) {
    router.push(href);
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const items = query.length < 2 ? shortcuts : results;
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => Math.min(s + 1, items.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
    if (e.key === 'Escape') { onClose(); }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (query.length < 2) {
        const shortcut = shortcuts[selected];
        if (shortcut) navigate(shortcut.href);
      } else {
        const result = results[selected];
        if (result) navigate(TYPE_HREFS[result.type]?.(result.id) ?? '/');
      }
    }
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close search"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm"
      />
      {/* Palette */}
      <div className="fixed left-1/2 top-24 z-50 w-full max-w-xl -translate-x-1/2 rounded-xl border border-slate-200 bg-white shadow-2xl">
        {/* Input */}
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
          <SearchIcon size={16} className="shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search deals, contacts, accounts…"
            className="flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
          <kbd className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-400">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-2">
          {query.length < 2 ? (
            <>
              <p className="px-4 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Quick navigation</p>
              {shortcuts.map((s, i) => (
                <button
                  key={s.href}
                  type="button"
                  onClick={() => navigate(s.href)}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 ${selected === i ? 'bg-slate-50' : ''}`}
                >
                  {s.label}
                </button>
              ))}
            </>
          ) : searchQuery.isLoading ? (
            <div className="px-4 py-6 text-center text-sm text-slate-400">Searching…</div>
          ) : results.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-slate-400">No results for &ldquo;{query}&rdquo;</div>
          ) : (
            <>
              <p className="px-4 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{results.length} results</p>
              {results.map((r, i) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => navigate(TYPE_HREFS[r.type]?.(r.id) ?? '/')}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 hover:bg-slate-50 ${selected === i ? 'bg-slate-50' : ''}`}
                >
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${TYPE_COLORS[r.type] ?? 'bg-slate-100 text-slate-600'}`}>
                    {TYPE_LABELS[r.type] ?? r.type}
                  </span>
                  <span className="flex-1 truncate text-sm font-medium text-slate-900">{r.title}</span>
                  {r.subtitle && <span className="truncate text-xs text-slate-400">{r.subtitle}</span>}
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </>
  );
}
```

**Wire up in `apps/web/src/components/layout/topbar.tsx`**:

1. Import at the top: `import { CommandPalette } from './command-palette';`
2. Add state: `const [searchOpen, setSearchOpen] = useState(false);`
3. Add keyboard shortcut in the existing `useEffect` for keyboard shortcuts (or add a new one):
```typescript
useEffect(() => {
  function onKey(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      setSearchOpen(true);
    }
  }
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, []);
```
4. Wire the SearchIcon button's `onClick` to `() => setSearchOpen(true)`
5. Render `<CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />` as the last child before closing the `<header>` tag.

---

## TASK 3 — Calendar Page

**File to create**: `apps/web/src/app/(dashboard)/calendar/page.tsx`

The integration-service syncs Google and Microsoft calendar events but there is no frontend calendar view. Create a simple month/week calendar that displays synced events.

**Data source**: `GET /api/v1/integrations/calendar/events?from=<ISO>&to=<ISO>` via `apiClients.integration`

```typescript
'use client';

import { useMemo, useState, type JSX } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClients } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/format';

interface CalendarEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  provider: 'google' | 'microsoft';
  meetingUrl?: string | null;
  attendees?: string[];
}

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59); }
function daysInMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); }
function firstDayOfWeek(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1).getDay(); }

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export default function CalendarPage(): JSX.Element {
  const [current, setCurrent] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const from = startOfMonth(current).toISOString();
  const to = endOfMonth(current).toISOString();

  const eventsQuery = useQuery({
    queryKey: ['calendar', 'events', from, to],
    queryFn: () =>
      apiClients.integration.get<{ data: CalendarEvent[] }>('/integrations/calendar/events', {
        params: { from, to },
      }),
  });

  const events = eventsQuery.data?.data ?? [];

  const eventsByDay = useMemo(() => {
    const map: Record<number, CalendarEvent[]> = {};
    for (const ev of events) {
      const d = new Date(ev.startTime).getDate();
      if (!map[d]) map[d] = [];
      map[d].push(ev);
    }
    return map;
  }, [events]);

  const days = daysInMonth(current);
  const offset = firstDayOfWeek(current);

  const selectedEvents = selectedDay ? (eventsByDay[selectedDay] ?? []) : [];

  return (
    <main className="space-y-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Calendar</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setCurrent(new Date(current.getFullYear(), current.getMonth() - 1, 1))}>
            ←
          </Button>
          <span className="min-w-[160px] text-center text-sm font-medium text-slate-700">
            {MONTHS[current.getMonth()]} {current.getFullYear()}
          </span>
          <Button variant="secondary" onClick={() => setCurrent(new Date(current.getFullYear(), current.getMonth() + 1, 1))}>
            →
          </Button>
          <Button variant="secondary" onClick={() => setCurrent(new Date())}>
            Today
          </Button>
        </div>
      </header>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
          {DAYS.map((d) => (
            <div key={d} className="py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7">
          {Array.from({ length: offset }).map((_, i) => (
            <div key={`empty-${i}`} className="min-h-[80px] border-b border-r border-slate-100 bg-slate-50/50" />
          ))}
          {Array.from({ length: days }).map((_, i) => {
            const day = i + 1;
            const dayEvents = eventsByDay[day] ?? [];
            const isToday =
              new Date().getDate() === day &&
              new Date().getMonth() === current.getMonth() &&
              new Date().getFullYear() === current.getFullYear();
            const isSelected = selectedDay === day;
            return (
              <button
                key={day}
                type="button"
                onClick={() => setSelectedDay(isSelected ? null : day)}
                className={`min-h-[80px] border-b border-r border-slate-100 p-1 text-left transition-colors hover:bg-slate-50 ${isSelected ? 'bg-blue-50' : ''}`}
              >
                <div className={`mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${isToday ? 'bg-slate-900 text-white' : 'text-slate-700'}`}>
                  {day}
                </div>
                <div className="space-y-0.5">
                  {dayEvents.slice(0, 3).map((ev) => (
                    <div
                      key={ev.id}
                      className={`truncate rounded px-1 py-0.5 text-[10px] font-medium ${ev.provider === 'google' ? 'bg-blue-100 text-blue-700' : 'bg-indigo-100 text-indigo-700'}`}
                    >
                      {ev.title}
                    </div>
                  ))}
                  {dayEvents.length > 3 && (
                    <div className="text-[10px] text-slate-400">+{dayEvents.length - 3} more</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Day detail panel */}
      {selectedDay && (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">
            {MONTHS[current.getMonth()]} {selectedDay} — {selectedEvents.length} event{selectedEvents.length !== 1 ? 's' : ''}
          </h2>
          {selectedEvents.length === 0 ? (
            <p className="text-sm text-slate-500">No events on this day.</p>
          ) : (
            <div className="space-y-2">
              {selectedEvents.map((ev) => (
                <div key={ev.id} className="flex items-start gap-3 rounded-lg border border-slate-100 p-3">
                  <div className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${ev.provider === 'google' ? 'bg-blue-500' : 'bg-indigo-500'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900">{ev.title}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(ev.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {' – '}
                      {new Date(ev.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {' · '}
                      <span className="capitalize">{ev.provider}</span>
                    </p>
                    {ev.meetingUrl && (
                      <a href={ev.meetingUrl} target="_blank" rel="noopener noreferrer" className="mt-1 text-xs text-blue-600 hover:underline">
                        Join meeting →
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {eventsQuery.isLoading && (
        <div className="text-center text-sm text-slate-400">Loading events…</div>
      )}
      {!eventsQuery.isLoading && events.length === 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-center">
          <p className="text-sm text-slate-500">No synced calendar events for this month.</p>
          <p className="mt-1 text-xs text-slate-400">Connect Google or Microsoft calendar in Integrations → Connect.</p>
        </div>
      )}
    </main>
  );
}
```

**Add to sidebar** in `apps/web/src/components/layout/sidebar.tsx` — add Calendar to the Automation section:
```typescript
{ label: 'Calendar', href: '/calendar', Icon: FileTextIcon },
```

---

## Verification

- [ ] `reports/page.tsx` imports recharts and renders a chart above the data table when results exist
- [ ] `components/layout/command-palette.tsx` created, keyboard navigation works, Cmd+K opens it
- [ ] `topbar.tsx` wires `CommandPalette` with `open`/`onClose` props and Cmd+K shortcut
- [ ] `calendar/page.tsx` created, 34 dashboard pages become 35
- [ ] Sidebar includes Calendar in Automation section
- [ ] All new/modified `.tsx` files end with `}` (no truncation)
