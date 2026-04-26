# CURSOR PROMPT 18 — UX, Mobile Responsiveness & Navigation

## Context
NEXUS CRM — pnpm monorepo. Frontend: `apps/web` (Next.js 14 App Router, Tailwind CSS).
This prompt fixes 6 P0 UX blockers and 8 P1 issues identified by the Design team + UX researcher.
Write every file COMPLETELY — no truncation, no "// rest of code".

---

## TASK 1 — Mobile-Responsive Dashboard KPI Grid

### File: `apps/web/src/app/(dashboard)/page.tsx`
Find the KPI card row (the StatCard grid). Change the grid class:

```tsx
// OLD: 5-column grid that breaks on mobile
<div className="grid grid-cols-5 gap-4">

// NEW: responsive breakpoints
<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
```

Also ensure the page's outer container has `overflow-x-hidden` and no fixed widths:
```tsx
<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 overflow-x-hidden">
```

For the two-column chart row below the KPI cards:
```tsx
// OLD:
<div className="grid grid-cols-[60%_40%] gap-6">

// NEW:
<div className="grid grid-cols-1 lg:grid-cols-[60%_40%] gap-6">
```

For the three-column panel row:
```tsx
// OLD:
<div className="grid grid-cols-3 gap-6">

// NEW:
<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
```

---

## TASK 2 — Mobile Sidebar with Backdrop

### File: `apps/web/src/components/layout/sidebar.tsx`
Add a backdrop overlay behind the mobile sidebar and a close-on-tap handler:

```tsx
'use client';
import { useEffect } from 'react';
// ... existing imports

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onMobileClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onMobileClose]);

  return (
    <>
      {/* Mobile backdrop — fixed overlay, click to close */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar panel */}
      <aside className={`
        fixed inset-y-0 start-0 z-40 w-64 bg-white border-e border-gray-200 flex flex-col
        transition-transform duration-300 ease-in-out
        lg:static lg:translate-x-0 lg:z-auto
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* existing sidebar content */}
        {/* ... */}
      </aside>
    </>
  );
}
```

---

## TASK 3 — Sidebar Navigation Groups

### File: `apps/web/src/components/layout/sidebar.tsx`
Replace the flat nav list with grouped sections. Use this structure:

```tsx
const NAV_GROUPS = [
  {
    label: 'My Work',
    items: [
      { href: '/',            label: 'Dashboard',  icon: LayoutDashboard },
      { href: '/deals',       label: 'Deals',      icon: Briefcase },
      { href: '/contacts',    label: 'Contacts',   icon: Users },
      { href: '/companies',   label: 'Companies',  icon: Building2 },
      { href: '/tasks',       label: 'Tasks',      icon: CheckSquare },
      { href: '/activities',  label: 'Activities', icon: Activity },
      { href: '/calendar',    label: 'Calendar',   icon: CalendarIcon },
    ],
  },
  {
    label: 'Sales',
    items: [
      { href: '/cadences',    label: 'Sequences',   icon: Mail },
      { href: '/products',    label: 'Products',    icon: Package },
      { href: '/documents',   label: 'Documents',   icon: FileText },
      { href: '/knowledge',   label: 'Knowledge',  icon: BookOpen },
      { href: '/commissions', label: 'Commissions', icon: DollarSign },
    ],
  },
  {
    label: 'Reports',
    items: [
      { href: '/pipeline/analytics',   label: 'Pipeline',    icon: TrendingUp },
      { href: '/reports/performance',  label: 'Performance', icon: BarChart2 },
      { href: '/reports/manager',      label: 'Manager View',icon: Users2 },
      { href: '/territories',          label: 'Territories', icon: Map },
    ],
  },
  {
    label: 'Tools',
    items: [
      { href: '/approvals',  label: 'Approvals',   icon: ShieldCheck },
      { href: '/workflows',  label: 'Workflows',   icon: GitBranch },
      { href: '/portal/settings', label: 'Portal', icon: Globe },
    ],
  },
];

// Render in sidebar:
<nav className="flex-1 overflow-y-auto py-4 px-2 space-y-6">
  {NAV_GROUPS.map(group => (
    <div key={group.label}>
      <p className="px-3 mb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">
        {group.label}
      </p>
      <ul className="space-y-0.5">
        {group.items.map(item => {
          const Icon = item.icon;
          const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <li key={item.href}>
              <Link href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition
                  ${active ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}>
                <Icon className="w-4 h-4 shrink-0" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  ))}
</nav>
```

Import all required icons from `lucide-react` at the top of the file.

---

## TASK 4 — Inline Contact Creation from Deal Form

### File: `apps/web/src/components/deals/QuickCreateContact.tsx`
```tsx
'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, UserPlus } from 'lucide-react';

interface Props {
  onCreated: (contact: { id: string; name: string; email: string }) => void;
  onCancel: () => void;
}

export function QuickCreateContact({ onCreated, onCancel }: Props) {
  const qc = useQueryClient();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [error, setError] = useState('');

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName, email, company }),
      });
      if (!res.ok) throw new Error('Failed to create contact');
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['contacts'] });
      onCreated({ id: data.id, name: `${firstName} ${lastName}`.trim(), email });
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Quick-create contact</h2>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">First name *</label>
              <input required value={firstName} onChange={e => setFirstName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Last name</label>
              <input value={lastName} onChange={e => setLastName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 outline-none" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Email *</label>
            <input required type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 outline-none" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Company</label>
            <input value={company} onChange={e => setCompany(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 outline-none" />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={create.isPending}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition">
              {create.isPending ? 'Creating...' : 'Create & add to deal'}
            </button>
            <button type="button" onClick={onCancel}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 text-sm hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

### Update deal form's contact field
In the deal create/edit form, find the contact selector. Add a "New contact" button next to it:

```tsx
const [showQuickCreate, setShowQuickCreate] = useState(false);

// Next to the contact search input:
<button type="button" onClick={() => setShowQuickCreate(true)}
  className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium">
  <UserPlus className="w-4 h-4" /> New contact
</button>

{showQuickCreate && (
  <QuickCreateContact
    onCreated={(contact) => { setSelectedContact(contact); setShowQuickCreate(false); }}
    onCancel={() => setShowQuickCreate(false)}
  />
)}
```

---

## TASK 5 — Global Search Entity Type Badges

### File: `apps/web/src/components/layout/GlobalSearch.tsx` (or command-palette.tsx)
In the search results list, add a type badge to each result item:

```tsx
const TYPE_BADGES: Record<string, { label: string; color: string }> = {
  contact:  { label: 'Contact',  color: 'bg-blue-50 text-blue-700 border-blue-200' },
  deal:     { label: 'Deal',     color: 'bg-green-50 text-green-700 border-green-200' },
  company:  { label: 'Company',  color: 'bg-purple-50 text-purple-700 border-purple-200' },
  document: { label: 'Doc',      color: 'bg-orange-50 text-orange-700 border-orange-200' },
  activity: { label: 'Activity', color: 'bg-gray-50 text-gray-700 border-gray-200' },
};

// In result item JSX (add after the title/name):
{result.type && TYPE_BADGES[result.type] && (
  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border ${TYPE_BADGES[result.type].color}`}>
    {TYPE_BADGES[result.type].label}
  </span>
)}
```

Also add the entity type to search result items returned by the API proxy. Update `apps/web/src/app/api/search/route.ts`:
```typescript
// Ensure each result includes a `type` field: 'contact' | 'deal' | 'company' | 'document'
const results = await res.json();
// Map type from Meilisearch index name if not already present
const withTypes = results.hits?.map((hit: any) => ({
  ...hit,
  type: hit.type ?? hit._index ?? 'unknown',
}));
return NextResponse.json({ hits: withTypes, total: results.estimatedTotalHits });
```

---

## TASK 6 — Modal Keyboard Focus Trap

### File: `apps/web/src/components/ui/Modal.tsx`
```tsx
'use client';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const SIZE_CLASSES = {
  sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-2xl',
};

export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Keyboard trap — keep focus inside modal while open
  useEffect(() => {
    if (!open) return;
    const el = containerRef.current;
    if (!el) return;

    const focusable = el.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last?.focus(); } }
      else { if (document.activeElement === last) { e.preventDefault(); first?.focus(); } }
    };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };

    document.addEventListener('keydown', trap);
    document.addEventListener('keydown', escape);
    first?.focus();

    return () => {
      document.removeEventListener('keydown', trap);
      document.removeEventListener('keydown', escape);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={containerRef} role="dialog" aria-modal="true" aria-labelledby="modal-title"
        className={`bg-white rounded-2xl shadow-xl w-full ${SIZE_CLASSES[size]} max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 id="modal-title" className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  );
}
```

Update all modal usages throughout the app to use this `<Modal>` component instead of ad-hoc inline modals.

---

## TASK 7 — Improved Dashboard Visual Polish

### Table rows — alternating + hover (apply globally)
In `apps/web/src/components/ui/DataTable.tsx` (or wherever the shared table is):
```tsx
<tr key={row.id} className="border-b border-gray-50 even:bg-gray-50/50 hover:bg-blue-50/40 transition-colors">
```

### Delta indicators — replace emoji with lucide icons
In `apps/web/src/components/dashboard/StatCard.tsx`:
```tsx
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

// Replace emoji arrows:
{delta > 0 && <TrendingUp className="w-3 h-3 text-green-600" />}
{delta < 0 && <TrendingDown className="w-3 h-3 text-red-500" />}
{delta === 0 && <Minus className="w-3 h-3 text-gray-400" />}
```

### Pipeline funnel — color per stage
In the funnel chart component, add a color array:
```tsx
const STAGE_COLORS = ['#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#EF4444'];
// Apply to each funnel stage cell: color={STAGE_COLORS[index % STAGE_COLORS.length]}
```

### Commission slider — style the range input
In `apps/web/src/app/(dashboard)/commissions/page.tsx`:
```tsx
// Replace unstyled <input type="range"> with:
<input
  type="range"
  min={0} max={100000} step={5000}
  value={extraRevenue}
  onChange={(e) => setExtraRevenue(Number(e.target.value))}
  className="w-full accent-blue-600 cursor-pointer"
/>
<div className="flex justify-between text-xs text-gray-400 mt-1">
  <span>$0</span>
  <span className="font-medium text-blue-700">+${extraRevenue.toLocaleString()}</span>
  <span>$100k</span>
</div>
```

---

## TASK 8 — Calendar Working Hours Highlighting

### File: `apps/web/src/app/(dashboard)/calendar/page.tsx`
In the week grid, highlight the 8am–6pm working hours block:

```tsx
// In the time slot row renderer:
const isWorkingHour = (hour: number) => hour >= 8 && hour < 18;

<div key={hour} className={`border-b border-gray-100 ${isWorkingHour(hour) ? 'bg-white' : 'bg-gray-50/60'}`}>
  <span className={`text-xs ${isWorkingHour(hour) ? 'text-gray-600' : 'text-gray-300'}`}>
    {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
  </span>
</div>
```

Also scroll to working hours on mount:
```tsx
useEffect(() => {
  document.getElementById('hour-8')?.scrollIntoView({ block: 'start' });
}, []);

// Add id to each hour row:
<div id={`hour-${hour}`} ...>
```

---

## TASK 9 — Topbar Icon Tooltips

### File: `apps/web/src/components/layout/topbar.tsx`
Add `title` attribute and aria-label to all icon-only buttons:

```tsx
// Notification bell:
<button aria-label="Notifications" title="Notifications" ...>

// Search:
<button aria-label="Search (⌘K)" title="Search (⌘K)" ...>

// Settings:
<Link href="/settings" aria-label="Settings" title="Settings" ...>

// User menu:
<button aria-label="Account menu" title="Account menu" ...>
```

---

## TASK 10 — Onboarding Checklist Fixes

### File: `apps/web/src/components/layout/OnboardingChecklist.tsx`
Fix two issues:

1. **Wrong link on step 3** — change the calendar integration link:
```tsx
// OLD:
{ id: 'connect-calendar', label: 'Connect your calendar', href: '/settings' }

// NEW:
{ id: 'connect-calendar', label: 'Connect your calendar', href: '/settings?tab=integrations' }
```

2. **Checklist never disappears** — add completion state:
```tsx
const allDone = completedSteps.length === CHECKLIST_STEPS.length;

// Wrap the entire component:
if (allDone) return null;
```

3. **Add "Skip for now" button**:
```tsx
const [dismissed, setDismissed] = useState(() => {
  try { return localStorage.getItem('onboarding_dismissed') === 'true'; } catch { return false; }
});

const dismiss = () => {
  try { localStorage.setItem('onboarding_dismissed', 'true'); } catch {}
  setDismissed(true);
};

if (dismissed || allDone) return null;

// In JSX, add at bottom of checklist:
<button onClick={dismiss} className="text-xs text-gray-400 hover:text-gray-500 mt-2">
  Skip for now
</button>
```

---

## Verification Checklist
- [ ] Dashboard renders correctly on 375px mobile (no horizontal overflow)
- [ ] Sidebar opens on mobile with a dark backdrop visible
- [ ] Tapping outside the sidebar on mobile closes it
- [ ] Sidebar has 4 labeled sections: My Work, Sales, Reports, Tools
- [ ] Activities link in sidebar resolves (no 404)
- [ ] Deal form has "New contact" button that opens QuickCreateContact modal
- [ ] QuickCreateContact modal creates contact and auto-fills the deal form
- [ ] Global search results show a type badge on each item (Contact/Deal/Company)
- [ ] Modal dialogs (create deal, create contact) keep focus inside — Tab cycles within
- [ ] Pressing Escape closes any open modal
- [ ] Dashboard table rows have even:bg-gray-50 and hover:bg-blue-50 styling
- [ ] StatCard delta uses TrendingUp/TrendingDown lucide icons (not arrows)
- [ ] Pipeline funnel has distinct colors per stage
- [ ] Commission slider has proper styled track (accent-blue-600)
- [ ] Calendar working hours (8am–6pm) are white; other hours are slightly grayed
- [ ] Calendar scrolls to 8am on mount
- [ ] Topbar buttons have aria-label and title attributes
- [ ] Onboarding checklist step 3 links to /settings?tab=integrations
- [ ] Onboarding checklist hides when all steps completed
- [ ] Onboarding checklist has "Skip for now" button
