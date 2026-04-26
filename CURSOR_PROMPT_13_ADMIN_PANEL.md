# CURSOR PROMPT 13 — Admin Panel & System Control Center

## Context
NEXUS CRM is a pnpm monorepo (Turborepo). Frontend: `apps/web` (Next.js 14 App Router).
Backend services live in `services/`. All paths below use these roots.
Auth uses JWT with tenant isolation — every user has `tenantId` and `role` in the token.

## Goal
Build a full `/admin` section in the Next.js frontend, protected to users with `role === 'admin'`.
This gives system administrators complete control over users, tenants, permissions, system health, audit logs, and feature flags — without needing to SSH or query the DB directly.

---

## TASK 1 — Admin Layout & Route Guard

### File: `apps/web/src/app/admin/layout.tsx`
Create a dedicated admin shell layout with its own sidebar, separate from the main dashboard layout.

```tsx
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { AdminSidebar } from '@/components/admin/AdminSidebar';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin') redirect('/');

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto bg-gray-950">
        <div className="max-w-7xl mx-auto px-6 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
```

### File: `apps/web/src/components/admin/AdminSidebar.tsx`
Dark-themed admin sidebar with these sections:
- Overview (chart icon)
- Users (users icon)
- Tenants (building icon)
- Roles & Permissions (shield icon)
- Audit Log (scroll icon)
- Feature Flags (toggle icon)
- System Health (activity icon)
- Settings (settings icon)

Each nav item: `href="/admin/SECTION"`. Active state uses `usePathname()`.
Bottom: link back to main app (`← Back to NEXUS`).

Style: `bg-gray-900 border-r border-gray-800`, text white, active item `bg-blue-600`, hover `bg-gray-800`.

---

## TASK 2 — Admin Overview Dashboard

### File: `apps/web/src/app/admin/page.tsx`
Server component showing system-wide stats.

Grid of 6 stat cards (fetch from `/api/admin/stats`):
- Total users (across all tenants)
- Active tenants
- Total deals in system
- API calls today
- Events in Kafka queue (last hour)
- Active WebSocket connections

Below the cards: two panels side-by-side:
1. **Recent signups** — table of last 10 user registrations (name, email, tenant, joined)
2. **System alerts** — list of recent warnings from the health API (timestamp, service, message, severity badge)

---

## TASK 3 — User Management

### File: `apps/web/src/app/admin/users/page.tsx`
Full user management table with:
- Search by name or email (debounced 300 ms, calls `/api/admin/users?q=`)
- Filter by tenant (dropdown), role (dropdown), status (Active/Suspended/Invited)
- Sortable columns: Name, Email, Role, Tenant, Joined, Last active
- Pagination: 50 per page
- Actions per row: Edit role, Suspend/Activate, Reset password (sends email), Delete (confirm modal)

Table columns: Avatar+Name, Email, Role badge, Tenant, Status badge, Last active, Actions

### File: `apps/web/src/app/admin/users/[id]/page.tsx`
User detail page showing:
- Profile card (avatar, name, email, phone, joined date)
- Role selector (dropdown, saves on change)
- Tenant assignment (dropdown)
- Permission overrides (checkboxes per resource: read/write/delete)
- Login history (last 20 entries)
- Active sessions with revoke buttons
- Danger zone: Suspend account, Delete account (two-step confirm)

---

## TASK 4 — Tenant Management

### File: `apps/web/src/app/admin/tenants/page.tsx`
Table of all tenants (organisations) in the system:
- Columns: Tenant name, Plan (Free/Pro/Enterprise), Users count, Deals count, Storage used, Created, Status
- Actions: View details, Edit plan, Suspend, Delete
- Create tenant button opens a modal (name, plan, admin email, locale)

### File: `apps/web/src/app/admin/tenants/[id]/page.tsx`
Tenant detail page:
- Summary cards: users, active deals, revenue tracked, storage used
- Members list (same as user management, filtered to this tenant)
- Subscription info (plan, renewal date, usage limits)
- Edit limits: max users, max contacts, max storage, max API calls/day
- Danger zone: Force logout all users, Suspend tenant, Delete all data (requires typing tenant name to confirm)

---

## TASK 5 — Roles & Permissions Matrix

### File: `apps/web/src/app/admin/roles/page.tsx`
Interactive permission matrix editor.

Rows = resources: Contacts, Deals, Pipelines, Reports, Cadences, Territories, Workflows, Documents, Billing, Team, Admin Panel

Columns = roles: Admin, Manager, Senior AE, AE, SDR, CSM, Viewer

Each cell = checkboxes or toggle for: Read | Write | Delete

Above the table: role selector tabs. Clicking a role tab highlights that column and shows a role description card on the right.

Save button at the bottom POSTs to `/api/admin/roles/permissions`.

Also include a **Create custom role** button that opens a modal (role name, description, copy-permissions-from dropdown, then the same permission matrix).

---

## TASK 6 — Audit Log Viewer

### File: `apps/web/src/app/admin/audit/page.tsx`
Full-width audit log with:
- Filter bar: date range picker, actor (user search), event type (multi-select dropdown), resource type, tenant filter
- Live search / debounced filter
- Virtual-scrolling or paginated table (100 rows/page):
  - Timestamp, Actor (avatar+name), Event type (colored badge), Resource (type + ID link), IP address, Details (expandable JSON drawer)

Event type badges (color-coded):
- `USER_LOGIN` green
- `USER_LOGOUT` gray
- `DEAL_CREATED` blue
- `DEAL_DELETED` red
- `CONTACT_EXPORTED` orange
- `PERMISSION_CHANGED` purple
- `TENANT_SUSPENDED` red
- `BILLING_UPDATED` yellow

Export button: downloads filtered results as CSV.

---

## TASK 7 — Feature Flags

### File: `apps/web/src/app/admin/flags/page.tsx`
Feature flag control panel.

List all feature flags with:
- Flag name (monospace)
- Description
- Enabled globally (toggle)
- Enabled for specific tenants (multi-select)
- Enabled for specific users (email input list)
- Rollout percentage (0–100 slider)
- Last modified by + timestamp

Pre-populate with these flags:
```
AI_FORECASTING       - Enable AI-powered deal scoring and forecast
CALLING_MODULE       - Show calling/dialer UI
EMAIL_SEQUENCES      - Enable cadence email builder
WHATSAPP_INTEGRATION - WhatsApp message sending from contacts
PRODUCT_CATALOG      - Product/price book in deals
COMMISSION_TRACKER   - Commission calculator and leaderboard
CUSTOMER_PORTAL      - External customer portal
GDPR_EXPORT          - Self-service data export (GDPR Art. 20)
ADVANCED_REPORTING   - Custom report builder
MOBILE_APP           - Allow mobile app API access
```

Create flag button opens a modal (name, description, rollout %).

---

## TASK 8 — System Health Monitor

### File: `apps/web/src/app/admin/health/page.tsx`
Real-time system health dashboard that auto-refreshes every 30 seconds (`useEffect` + interval).

### Service Status Grid
For each service, fetch `GET /SERVICE_URL/health` and display:
- Service name + icon
- Status badge: Healthy (green) / Degraded (yellow) / Down (red)
- Response time (ms)
- Uptime %
- Last checked timestamp

Services to check:
auth (3000), crm (3001), finance (3002), notification (3003), realtime (3005), search (3006),
workflow (3007), analytics (3008), comm (3009), storage (3010), billing (3011),
integration (3012), blueprint (3013), approval (3014), data (3015), document (3016),
chatbot (3017), cadence (3018), territory (3019), planning (3020), reporting (3021),
portal (3022), knowledge (3023), incentive (3024)

### Infrastructure Status
Separate section for: PostgreSQL, Redis, Kafka, Meilisearch, MinIO, ClickHouse
Each shows: status, connections used, memory %, storage used.

### Response Time Chart
Line chart (last 1 hour, recharts) showing p50/p95 response times for the 5 most-called services.

---

## TASK 9 — Admin API Routes

### File: `apps/web/src/app/api/admin/stats/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

export async function GET(req: NextRequest) {
  await requireAdmin(req);
  // Return mock/real aggregate stats
  return NextResponse.json({
    totalUsers: 142,
    activeTenants: 18,
    totalDeals: 3847,
    apiCallsToday: 28493,
    kafkaQueueDepth: 12,
    wsConnections: 34,
  });
}
```

### File: `apps/web/src/app/api/admin/users/route.ts`
GET: list users with pagination + filters (q, tenant, role, status, page, limit)
POST: create user

### File: `apps/web/src/app/api/admin/users/[id]/route.ts`
GET: user detail
PATCH: update role, status, permissions
DELETE: delete user

### File: `apps/web/src/app/api/admin/tenants/route.ts`
GET: list tenants
POST: create tenant

### File: `apps/web/src/app/api/admin/tenants/[id]/route.ts`
GET: tenant detail
PATCH: update plan, limits
DELETE: delete tenant

### File: `apps/web/src/lib/admin-auth.ts`
```typescript
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { NextRequest } from 'next/server';

export async function requireAdmin(req?: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin') {
    throw new Error('Unauthorized');
  }
  return session;
}
```

---

## TASK 10 — Admin Nav in Main App

### File: `apps/web/src/components/layout/sidebar.tsx`
Add an "Admin Panel" link at the bottom of the sidebar, visible only when `session.user.role === 'admin'`:

```tsx
{session?.user?.role === 'admin' && (
  <li>
    <Link href="/admin" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs
      font-semibold text-purple-300 hover:bg-purple-900/30 border border-purple-800/40 mt-2">
      <ShieldCheck className="w-4 h-4" />
      Admin Panel
    </Link>
  </li>
)}
```

---

## Verification Checklist
- [ ] `/admin` redirects non-admins back to `/`
- [ ] AdminSidebar renders with all 8 nav items, dark theme
- [ ] `/admin/users` table has search, filter, sort, pagination
- [ ] `/admin/tenants` shows plan and usage per tenant
- [ ] `/admin/roles` matrix is editable and saves
- [ ] `/admin/audit` table has date filter and CSV export
- [ ] `/admin/flags` shows 10 pre-built flags with toggles
- [ ] `/admin/health` polls 24 services, shows status badges
- [ ] API routes return 401 for non-admin callers
- [ ] Admin link appears in sidebar only for admin users
