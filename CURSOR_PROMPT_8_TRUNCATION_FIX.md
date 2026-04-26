# Prompt 8 — Truncation Fix Pass + Grafana + Frontend Completions

## Context

NEXUS CRM — pnpm monorepo. A deep scan found that 16/24 service `src/index.ts` files are still
truncated (cut off mid-block, no `app.listen` or `startService`). Several frontend files were also
truncated. This prompt rewrites every broken file to completion using explicit full content.

**IMPORTANT FOR CURSOR:** Write each file in full from top to bottom in a single edit. Do NOT
append to existing files. Use the Write/overwrite approach for every file in this prompt.

---

## TASK 1 — Fix 16 Truncated Service `src/index.ts` Files

For each service below, **completely rewrite** `src/index.ts` with the canonical template.
Preserve any existing route imports — check the current file first and keep the `registerRoutes`
import and call. Only the wrapper (rateLimit, errorHandler, health, listen) needs standardising.

### Canonical Template

```typescript
import 'dotenv/config';
import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { globalErrorHandler } from '@nexus/service-utils';
import { PrismaClient } from '@prisma/client';
import { registerRoutes } from './routes/index.js';

const app = Fastify({ logger: true });
const prisma = new PrismaClient();

const port = parseInt(process.env.PORT ?? 'PORT_NUMBER', 10);
const jwtSecret = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';

await app.register(fastifyJwt, { secret: jwtSecret });

await app.register(rateLimit, {
  global: true,
  max: 300,
  timeWindow: '1 minute',
  errorResponseBuilder: (_req, context) => ({
    success: false,
    error: 'RATE_LIMIT_EXCEEDED',
    message: `Too many requests. Retry after ${context.after}.`,
  }),
});

app.setErrorHandler(globalErrorHandler);

app.get('/health', async () => ({
  status: 'ok',
  service: 'SERVICE_NAME',
  version: '1.0.0',
}));

await registerRoutes(app, prisma);

try {
  await app.listen({ port, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  await prisma.$disconnect();
  process.exit(1);
}
```

### Per-Service Values

| Service | Port | Service Name | Notes |
|---|---|---|---|
| finance-service | 3002 | `finance-service` | Check existing route imports — has 6 route files |
| comm-service | 3009 | `comm-service` | Has templates, sequences, outbox, webhook routes |
| notification-service | 3003 | `notification-service` | May use Redis/Kafka consumer |
| workflow-service | 3007 | `workflow-service` | Has Kafka consumer for workflow events |
| analytics-service | 3008 | `analytics-service` | Has ClickHouse client, no Prisma |
| search-service | 3006 | `search-service` | Has Meilisearch client, no Prisma |
| billing-service | 3011 | `billing-service` | Has subscriptions, plans, invoices, webhooks routes |
| integration-service | 3012 | `integration-service` | Complex — has Kafka + OAuth + multiple clients |
| blueprint-service | 3013 | `blueprint-service` | Standard Prisma service |
| data-service | 3015 | `data-service` | Has audit, export, import, recycle, views routes |
| document-service | 3016 | `document-service` | Standard Prisma service |
| chatbot-service | 3017 | `chatbot-service` | Has conversations, messages routes |
| cadence-service | 3018 | `cadence-service` | Has cadences, enrollments routes |
| territory-service | 3019 | `territory-service` | Has territories routes |
| planning-service | 3020 | `planning-service` | Has quotas, forecasts routes |
| portal-service | 3022 | `portal-service` | Standard Prisma service |
| knowledge-service | 3023 | `knowledge-service` | Standard Prisma service |
| incentive-service | 3024 | `incentive-service` | Has badges, contests routes |
| storage-service | 3009 | `storage-service` | Uses MinIO, no Prisma |

**For analytics-service** (no Prisma, uses ClickHouse) use this variant:
```typescript
import 'dotenv/config';
import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { globalErrorHandler } from '@nexus/service-utils';
import { registerRoutes } from './routes/index.js';

const app = Fastify({ logger: true });
const port = parseInt(process.env.PORT ?? '3008', 10);

await app.register(fastifyJwt, { secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production' });

await app.register(rateLimit, {
  global: true,
  max: 300,
  timeWindow: '1 minute',
  errorResponseBuilder: (_req, context) => ({
    success: false,
    error: 'RATE_LIMIT_EXCEEDED',
    message: `Too many requests. Retry after ${context.after}.`,
  }),
});

app.setErrorHandler(globalErrorHandler);

app.get('/health', async () => ({ status: 'ok', service: 'analytics-service', version: '1.0.0' }));

await registerRoutes(app);

try {
  await app.listen({ port, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
```

**For search-service** (no Prisma, uses Meilisearch) use the same no-Prisma variant with port 3006
and service name `search-service`.

**For storage-service** (no Prisma, uses MinIO) use the same no-Prisma variant with port 3009
and service name `storage-service`.

**After writing each file**, confirm the last 3 lines are:
```
  process.exit(1);
}
```
(closing the try/catch and file). If not, rewrite again.

---

## TASK 2 — Fix `apps/web/src/app/(dashboard)/settings/page.tsx`

The file is currently 4 lines (truncated). Rewrite it completely:

```tsx
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClients } from '@/lib/api-client';
import { useAuthStore } from '@/store/auth-store';
import { TableSkeleton } from '@/components/ui/skeleton';

const TABS = ['Profile', 'Team', 'Billing', 'Integrations'] as const;
type Tab = typeof TABS[number];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('Profile');
  const { user } = useAuthStore();

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Settings</h1>
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
            <input type="text" defaultValue={user?.firstName ?? ''} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
            <input type="text" defaultValue={user?.lastName ?? ''} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" defaultValue={user?.email ?? ''} disabled className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500" />
            <p className="mt-1 text-xs text-gray-500">Email cannot be changed. Contact your admin.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Job Title</label>
            <input type="text" defaultValue={user?.title ?? ''} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input type="tel" defaultValue={user?.phone ?? ''} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700">Save Changes</button>
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
          <button className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700">Update Password</button>
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
  if (isLoading) return <TableSkeleton rows={5} cols={3} />;
  const members: any[] = data?.data ?? [];
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-base font-medium text-gray-900">Team Members</h2>
        <button className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700">Invite Member</button>
      </div>
      <div className="divide-y divide-gray-100">
        {members.length === 0 && <p className="px-6 py-8 text-sm text-gray-500 text-center">No team members found.</p>}
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
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
              {member.role ?? 'Member'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BillingTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['billing-subscription'],
    queryFn: () => apiClients.finance.get('/subscriptions/current').catch(() => null),
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
              <p className="text-xs text-blue-700 mt-0.5">Active · Renews monthly</p>
            </div>
            <button className="px-3 py-1.5 text-sm font-medium text-blue-700 border border-blue-300 rounded-md hover:bg-blue-100">Manage Plan</button>
          </div>
        )}
      </div>
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-base font-medium text-gray-900 mb-4">Payment Method</h2>
        <p className="text-sm text-gray-500">No payment method on file.</p>
        <button className="mt-3 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700">Add Payment Method</button>
      </div>
    </div>
  );
}

function IntegrationsTab() {
  const integrations = [
    { name: 'Google Workspace', description: 'Sync Gmail, Calendar, and Contacts', icon: 'G' },
    { name: 'Microsoft 365', description: 'Sync Outlook, Teams, and OneDrive', icon: 'M' },
    { name: 'Stripe', description: 'Payment processing and billing', icon: 'S' },
    { name: 'Slack', description: 'Deal notifications and alerts', icon: 'Sl' },
    { name: 'Twilio', description: 'SMS and voice communications', icon: 'T' },
    { name: 'SendGrid', description: 'Transactional email delivery', icon: 'E' },
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
          <button className="flex-shrink-0 px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200">
            Connect
          </button>
        </div>
      ))}
    </div>
  );
}
```

---

## TASK 3 — Fix `apps/web/src/app/(dashboard)/layout.tsx`

The file ends at `export defa` — truncated. Read the current file first to keep any existing shell/sidebar structure, then ensure it ends with:

```tsx
import { ErrorBoundary } from '@/components/error-boundary';
import { AppShell } from '@/components/layout/app-shell';

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

Adapt to match whatever `AppShell` or sidebar structure is actually used in the current file — just make sure `ErrorBoundary` wraps `children` and the file ends with a complete closing brace.

---

## TASK 4 — Complete `apps/web/src/components/ui/skeleton.tsx`

The file currently only exports `Skeleton` and `TableSkeleton`. Add the missing exports at the end
of the file (do not remove existing exports):

```tsx
export function CardSkeleton() {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-3">
      <div className="h-5 w-2/5 bg-gray-200 rounded animate-pulse" />
      <div className="h-4 w-full bg-gray-200 rounded animate-pulse" />
      <div className="h-4 w-3/4 bg-gray-200 rounded animate-pulse" />
      <div className="h-4 w-1/2 bg-gray-200 rounded animate-pulse" />
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
      <div className="h-3 w-20 bg-gray-200 rounded animate-pulse" />
      <div className="h-8 w-28 bg-gray-200 rounded animate-pulse" />
      <div className="h-3 w-16 bg-gray-200 rounded animate-pulse" />
    </div>
  );
}
```

---

## TASK 5 — Add Grafana to `docker-compose.yml`

Prompt 6 added Prometheus but not Grafana. Add the Grafana service to `docker-compose.yml`
inside the `services:` block, immediately after the `prometheus:` service definition:

```yaml
  grafana:
    image: grafana/grafana:10.4.0
    container_name: nexus_grafana
    environment:
      - GF_SECURITY_ADMIN_USER=${GRAFANA_USER:-admin}
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD:-nexus-admin}
      - GF_USERS_ALLOW_SIGN_UP=false
    volumes:
      - grafana_data:/var/lib/grafana
      - ./infrastructure/grafana/provisioning:/etc/grafana/provisioning:ro
    ports:
      - '3100:3000'
    networks:
      - nexus-network
    depends_on:
      - prometheus
    restart: unless-stopped
```

Also add `grafana_data:` to the `volumes:` section at the bottom of the file.

---

## TASK 6 — Expand `scripts/.env.prod.example`

The current file is only 46 lines and is missing most DATABASE_URLs. Append the following block
after the existing content (do not remove existing lines):

```bash
# ─── Service Database URLs (all 20 DB-backed services) ──────────────────────
AUTH_DATABASE_URL=postgresql://nexus:CHANGE_ME@postgres:5432/nexus_auth
CRM_DATABASE_URL=postgresql://nexus:CHANGE_ME@postgres:5432/nexus_crm
FINANCE_DATABASE_URL=postgresql://nexus:CHANGE_ME@postgres:5432/nexus_finance
NOTIFICATION_DATABASE_URL=postgresql://nexus:CHANGE_ME@postgres:5432/nexus_notifications
COMM_DATABASE_URL=postgresql://nexus:CHANGE_ME@postgres:5432/nexus_comm
STORAGE_DATABASE_URL=postgresql://nexus:CHANGE_ME@postgres:5432/nexus_storage
WORKFLOW_DATABASE_URL=postgresql://nexus:CHANGE_ME@postgres:5432/nexus_workflow
BILLING_DATABASE_URL=postgresql://nexus:CHANGE_ME@postgres:5432/nexus_billing
INTEGRATION_DATABASE_URL=postgresql://nexus:CHANGE_ME@postgres:5432/nexus_integration
BLUEPRINT_DATABASE_URL=postgresql://nexus:CHANGE_ME@postgres:5432/nexus_blueprint
APPROVAL_DATABASE_URL=postgresql://nexus:CHANGE_ME@postgres:5432/nexus_approval
DATA_DATABASE_URL=postgresql://nexus:CHANGE_ME@postgres:5432/nexus_data
DOCUMENT_DATABASE_URL=postgresql://nexus:CHANGE_ME@postgres:5432/nexus_document
CHATBOT_DATABASE_URL=postgresql://nexus:CHANGE_ME@postgres:5432/nexus_chatbot
CADENCE_DATABASE_URL=postgresql://nexus:CHANGE_ME@postgres:5432/nexus_cadence
TERRITORY_DATABASE_URL=postgresql://nexus:CHANGE_ME@postgres:5432/nexus_territory
PLANNING_DATABASE_URL=postgresql://nexus:CHANGE_ME@postgres:5432/nexus_planning
REPORTING_DATABASE_URL=postgresql://nexus:CHANGE_ME@postgres:5432/nexus_reporting
PORTAL_DATABASE_URL=postgresql://nexus:CHANGE_ME@postgres:5432/nexus_portal
KNOWLEDGE_DATABASE_URL=postgresql://nexus:CHANGE_ME@postgres:5432/nexus_knowledge
INCENTIVE_DATABASE_URL=postgresql://nexus:CHANGE_ME@postgres:5432/nexus_incentive

# ─── Observability ────────────────────────────────────────────────────────────
SENTRY_DSN=https://CHANGE_ME@sentry.io/CHANGE_ME
NEXT_PUBLIC_SENTRY_DSN=https://CHANGE_ME@sentry.io/CHANGE_ME
GRAFANA_USER=admin
GRAFANA_PASSWORD=CHANGE_ME_STRONG

# ─── Deployment ───────────────────────────────────────────────────────────────
IMAGE_TAG=latest
DEPLOY_HOST=your-server-ip
DEPLOY_USER=deploy
```

---

## Verification Checklist

After all tasks complete, run these checks:

```bash
# 1. Check no service ends mid-block
for svc in finance comm notification workflow analytics search billing integration blueprint data document chatbot cadence territory planning portal knowledge incentive storage; do
  echo "=== $svc ===" && tail -3 services/$svc-service/src/index.ts
done

# 2. Check settings page is > 50 lines
wc -l apps/web/src/app/\(dashboard\)/settings/page.tsx

# 3. Check layout.tsx has ErrorBoundary
grep -c "ErrorBoundary" apps/web/src/app/\(dashboard\)/layout.tsx

# 4. Check Grafana in docker-compose
grep -c "grafana" docker-compose.yml

# 5. Check skeleton exports
grep "export function" apps/web/src/components/ui/skeleton.tsx

# 6. Check .env.prod.example line count
wc -l scripts/.env.prod.example
```

Expected results:
- All services: last line is `}` closing the try/catch
- settings/page.tsx: > 100 lines
- layout.tsx: grep returns >= 2 (import + usage)
- docker-compose.yml: grep returns >= 3 (image, container_name, service name)
- skeleton.tsx: 4 exported functions (Skeleton, TableSkeleton, CardSkeleton, StatCardSkeleton)
- .env.prod.example: > 60 lines
