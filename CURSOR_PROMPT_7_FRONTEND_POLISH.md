# Prompt 7 — Frontend Polish: Settings UI, Skeletons, Error Boundaries, API Client Fix

## Context

NEXUS CRM — Next.js 14 App Router, TypeScript 5, Tailwind CSS, TanStack Query v5, Zustand.
The gap analysis identified four frontend issues to resolve:
1. `settings/page.tsx` is a 5-line redirect — no actual settings UI
2. No loading skeleton states on list pages
3. No React error boundaries — a throwing component crashes the whole page
4. `apps/web/src/lib/api-client.ts` has a port collision: both `notification` and `ai` point to port 3003

---

## TASK 1 — Fix Port Collision in `apps/web/src/lib/api-client.ts`

**File:** `apps/web/src/lib/api-client.ts`

The notification service should be on port 3003 and the AI service on a different port. Update the
client configuration to use the correct environment variables:

Find the section defining service base URLs and fix as follows:
- `notification` service URL → `process.env.NEXT_PUBLIC_NOTIFICATION_SERVICE_URL ?? 'http://localhost:3003'`
- `ai` service URL → `process.env.NEXT_PUBLIC_AI_SERVICE_URL ?? 'http://localhost:3025'`

Also add these two entries to `apps/web/.env.example` if not already present:
```
NEXT_PUBLIC_NOTIFICATION_SERVICE_URL=http://localhost:3003
NEXT_PUBLIC_AI_SERVICE_URL=http://localhost:3025
```

And in `docker-compose.yml`, confirm `ai-service` has `PORT=3025` in its environment block
(or whatever port is actually assigned — just ensure it doesn't collide with notification-service
on 3003).

---

## TASK 2 — Build `apps/web/src/app/(dashboard)/settings/page.tsx`

Replace the current 5-line redirect with a full settings page. This is the main settings hub with
four tabs: Profile, Team, Billing, and Integrations.

```tsx
'use client';

import { useState } from 'react';
import { useAuthStore } from '@/store/auth-store';
import { apiClients } from '@/lib/api-client';
import { useQuery } from '@tanstack/react-query';

const TABS = ['Profile', 'Team', 'Billing', 'Integrations'] as const;
type Tab = typeof TABS[number];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('Profile');
  const { user } = useAuthStore();

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Settings</h1>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 mb-8">
        <nav className="-mb-px flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'Profile' && <ProfileTab user={user} />}
      {activeTab === 'Team' && <TeamTab />}
      {activeTab === 'Billing' && <BillingTab />}
      {activeTab === 'Integrations' && <IntegrationsTab />}
    </div>
  );
}

function ProfileTab({ user }: { user: any }) {
  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-base font-medium text-gray-900 mb-4">Personal Information</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
            <input
              type="text"
              defaultValue={user?.firstName ?? ''}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
            <input
              type="text"
              defaultValue={user?.lastName ?? ''}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              defaultValue={user?.email ?? ''}
              disabled
              className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
            />
            <p className="mt-1 text-xs text-gray-500">Email cannot be changed. Contact your admin.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Job Title</label>
            <input
              type="text"
              defaultValue={user?.title ?? ''}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input
              type="tel"
              defaultValue={user?.phone ?? ''}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors">
            Save Changes
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-base font-medium text-gray-900 mb-4">Change Password</h2>
        <div className="space-y-3 max-w-sm">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
            <input type="password" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
            <input type="password" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
            <input type="password" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <button className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors">
            Update Password
          </button>
        </div>
      </div>
    </div>
  );
}

function TeamTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['team-members'],
    queryFn: () => apiClients.auth.get('/users'),
  });

  if (isLoading) return <TeamSkeleton />;

  const members = data?.data ?? [];

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-base font-medium text-gray-900">Team Members</h2>
        <button className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors">
          Invite Member
        </button>
      </div>
      <div className="divide-y divide-gray-100">
        {members.length === 0 && (
          <p className="px-6 py-8 text-sm text-gray-500 text-center">No team members found.</p>
        )}
        {members.map((member: any) => (
          <div key={member.id} className="px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-medium">
                {member.firstName?.[0]}{member.lastName?.[0]}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{member.firstName} {member.lastName}</p>
                <p className="text-xs text-gray-500">{member.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                {member.role ?? 'Member'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BillingTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['billing-subscription'],
    queryFn: () => apiClients.billing?.get('/subscriptions/current').catch(() => null),
  });

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-base font-medium text-gray-900 mb-4">Current Plan</h2>
        {isLoading ? (
          <div className="h-16 bg-gray-100 rounded animate-pulse" />
        ) : (
          <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div>
              <p className="text-sm font-medium text-blue-900">{data?.data?.plan?.name ?? 'Professional'}</p>
              <p className="text-xs text-blue-700 mt-0.5">
                {data?.data?.status === 'active' ? 'Active' : 'Inactive'} ·{' '}
                Next billing: {data?.data?.nextBillingDate ?? 'N/A'}
              </p>
            </div>
            <button className="px-3 py-1.5 text-sm font-medium text-blue-700 border border-blue-300 rounded-md hover:bg-blue-100 transition-colors">
              Manage Plan
            </button>
          </div>
        )}
      </div>
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-base font-medium text-gray-900 mb-4">Payment Method</h2>
        <p className="text-sm text-gray-500">No payment method on file. Add one to activate billing.</p>
        <button className="mt-3 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors">
          Add Payment Method
        </button>
      </div>
    </div>
  );
}

function IntegrationsTab() {
  const integrations = [
    { name: 'Google Workspace', description: 'Sync Gmail, Calendar, and Contacts', connected: false, icon: 'G' },
    { name: 'Microsoft 365', description: 'Sync Outlook, Teams, and OneDrive', connected: false, icon: 'M' },
    { name: 'Stripe', description: 'Payment processing and billing', connected: false, icon: 'S' },
    { name: 'Slack', description: 'Deal notifications and alerts', connected: false, icon: 'S' },
    { name: 'Twilio', description: 'SMS and voice communications', connected: false, icon: 'T' },
    { name: 'SendGrid', description: 'Transactional email delivery', connected: false, icon: 'E' },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {integrations.map((integration) => (
        <div key={integration.name} className="bg-white border border-gray-200 rounded-lg p-4 flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-gray-100 text-gray-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
            {integration.icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900">{integration.name}</p>
            <p className="text-xs text-gray-500 mt-0.5">{integration.description}</p>
          </div>
          <button className={`flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            integration.connected
              ? 'bg-green-100 text-green-700 hover:bg-green-200'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}>
            {integration.connected ? 'Connected' : 'Connect'}
          </button>
        </div>
      ))}
    </div>
  );
}

function TeamSkeleton() {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="h-5 w-32 bg-gray-200 rounded animate-pulse" />
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="px-6 py-4 flex items-center gap-3 border-b border-gray-100">
          <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse" />
          <div className="flex-1 space-y-1.5">
            <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
            <div className="h-3 w-48 bg-gray-100 rounded animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}
```

---

## TASK 3 — Create Reusable Skeleton Components

Create `apps/web/src/components/ui/skeleton.tsx` (replace existing if present):

```tsx
import { cn } from '@/lib/cn';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse rounded-md bg-gray-200', className)} />
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full">
      <div className="flex gap-4 px-4 py-3 border-b border-gray-200">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 px-4 py-4 border-b border-gray-100">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className={`h-4 flex-1 ${j === 0 ? 'max-w-[180px]' : ''}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-3">
      <Skeleton className="h-5 w-2/5" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-8 w-28" />
      <Skeleton className="h-3 w-16" />
    </div>
  );
}
```

---

## TASK 4 — Create a Global Error Boundary

Create `apps/web/src/components/error-boundary.tsx`:

```tsx
'use client';

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // In production this would go to Sentry
    console.error('ErrorBoundary caught:', error, info);
    if (typeof window !== 'undefined' && (window as any).__sentry__) {
      (window as any).Sentry?.captureException(error);
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center min-h-[200px] p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 110 18A9 9 0 0112 3z" />
            </svg>
          </div>
          <h3 className="text-sm font-medium text-gray-900 mb-1">Something went wrong</h3>
          <p className="text-xs text-gray-500 mb-4 max-w-xs">
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: undefined })}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

Wrap the main layout in `apps/web/src/app/(dashboard)/layout.tsx`:

```tsx
import { ErrorBoundary } from '@/components/error-boundary';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <ErrorBoundary>
        {children}
      </ErrorBoundary>
    </AppShell>
  );
}
```

---

## TASK 5 — Add Skeleton Loading to Key List Pages

For each of the following pages, find the loading state (where `isLoading` is true) and replace
any empty div, spinner, or nothing with the appropriate skeleton:

**Pattern to apply** (adapt to each page's actual loading condition):

```tsx
import { TableSkeleton } from '@/components/ui/skeleton';

// Replace: if (isLoading) return <div>Loading...</div>
// or:      if (isLoading) return null
// With:
if (isLoading) return (
  <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
    <TableSkeleton rows={8} cols={5} />
  </div>
);
```

**Pages to update:**
- `app/(dashboard)/contacts/page.tsx`
- `app/(dashboard)/leads/page.tsx`
- `app/(dashboard)/deals/page.tsx`
- `app/(dashboard)/accounts/page.tsx`
- `app/(dashboard)/activities/page.tsx`
- `app/(dashboard)/invoices/page.tsx`
- `app/(dashboard)/quotes/page.tsx`

---

## Verification Checklist

- [ ] `api-client.ts` notification is on 3003, ai-service on 3025 (or correct non-colliding port)
- [ ] `settings/page.tsx` has 4 tabs: Profile, Team, Billing, Integrations
- [ ] `settings/page.tsx` Team tab calls `apiClients.auth.get('/users')`
- [ ] `components/ui/skeleton.tsx` exports `Skeleton`, `TableSkeleton`, `CardSkeleton`, `StatCardSkeleton`
- [ ] `components/error-boundary.tsx` exists as a class component
- [ ] `app/(dashboard)/layout.tsx` wraps children in `<ErrorBoundary>`
- [ ] At least 5 list pages use `<TableSkeleton>` on loading state
- [ ] No TypeScript errors in the new files (`pnpm --filter web typecheck`)
