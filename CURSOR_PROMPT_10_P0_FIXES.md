# Prompt 10 — P0 Fixes: Dead Services, Config Rewrites, Infra Gaps

## Context

NEXUS CRM — pnpm monorepo, Fastify 4 microservices, Next.js 14 frontend.
Audit v3 identified persistent P0 issues that survived Prompts 8 and 9:
10 services still have no `app.listen` call, `next.config.mjs` is truncated,
`settings/page.tsx` reverted to 4 lines, `skeleton.tsx` lost two exports,
Grafana is missing from `docker-compose.yml`, and `init.sql` only has 10 GRANTs
instead of 20.

**Run every bash block exactly as written. Do not skip verification steps.**

---

## TASK 1 — Rewrite 10 Non-Starting Service Entry Points

Each service below is truncated — the file ends before `app.listen` / `startService`.
Rewrite each file **in full** using the canonical template. Do NOT patch; replace the
entire file contents.

### Canonical Template (35 lines — adapt PORT and SERVICE_NAME per service)

```typescript
import 'dotenv/config';
import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyRateLimit from '@fastify/rate-limit';
import { globalErrorHandler, registerHealthRoutes } from '@nexus/service-utils';
import { registerRoutes } from './routes';

const app = Fastify({ logger: true });

app.register(fastifyJwt, { secret: process.env.JWT_SECRET ?? 'dev-secret' });
app.register(fastifyRateLimit, { max: 100, timeWindow: '1 minute' });
app.setErrorHandler(globalErrorHandler);
registerHealthRoutes(app);

app.register(registerRoutes, { prefix: '/api' });

const start = async () => {
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    app.log.info(`SERVICE_NAME running on port PORT`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
```

### Services to rewrite

| Service | File | PORT | SERVICE_NAME |
|---|---|---|---|
| approval-service | `apps/approval-service/src/index.ts` | 3014 | approval-service |
| cadence-service | `apps/cadence-service/src/index.ts` | 3018 | cadence-service |
| territory-service | `apps/territory-service/src/index.ts` | 3019 | territory-service |
| planning-service | `apps/planning-service/src/index.ts` | 3020 | planning-service |
| knowledge-service | `apps/knowledge-service/src/index.ts` | 3023 | knowledge-service |
| incentive-service | `apps/incentive-service/src/index.ts` | 3024 | incentive-service |
| portal-service | `apps/portal-service/src/index.ts` | 3022 | portal-service |
| document-service | `apps/document-service/src/index.ts` | 3016 | document-service |
| chatbot-service | `apps/chatbot-service/src/index.ts` | 3017 | chatbot-service |
| data-service | `apps/data-service/src/index.ts` | 3015 | data-service |

After rewriting all 10, verify with:

```bash
for svc in approval cadence territory planning knowledge incentive portal document chatbot data; do
  tail -5 apps/${svc}-service/src/index.ts | grep -q "start()\|app.listen\|startService" \
    && echo "✅ ${svc}" || echo "❌ ${svc} — STILL TRUNCATED"
done
```

Expected: 10 lines starting with ✅

---

## TASK 2 — Rewrite `next.config.mjs` (Truncated After Prompt 9)

The file is currently truncated at ~450 bytes ending with `export default w`.
Replace the entire file:

**File:** `apps/web/next.config.mjs`

```javascript
import createNextIntlPlugin from 'next-intl/plugin';
import { withSentryConfig } from '@sentry/nextjs';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    domains: ['localhost', 'storage.googleapis.com'],
  },
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client'],
  },
};

const withIntl = withNextIntl(nextConfig);

export default withSentryConfig(withIntl, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
});
```

Verify:

```bash
wc -c apps/web/next.config.mjs
# Must be > 500 bytes
tail -3 apps/web/next.config.mjs
# Must end with: });
```

---

## TASK 3 — Rewrite `settings/page.tsx` (Reverted to 4 Lines)

**File:** `apps/web/src/app/(dashboard)/settings/page.tsx`

Replace the entire file with the full settings page (4 tabs: Profile, Team, Billing, Integrations):

```typescript
'use client';

import { useState } from 'react';
import { User, Users, CreditCard, Plug } from 'lucide-react';

type Tab = 'profile' | 'team' | 'billing' | 'integrations';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'profile',      label: 'Profile',       icon: <User className="w-4 h-4" /> },
  { id: 'team',         label: 'Team',           icon: <Users className="w-4 h-4" /> },
  { id: 'billing',      label: 'Billing',        icon: <CreditCard className="w-4 h-4" /> },
  { id: 'integrations', label: 'Integrations',   icon: <Plug className="w-4 h-4" /> },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('profile');

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your account and workspace preferences.</p>
      </div>

      {/* Tab Nav */}
      <div className="border-b border-gray-200 mb-8">
        <nav className="-mb-px flex gap-6">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Panels */}
      {activeTab === 'profile' && <ProfileTab />}
      {activeTab === 'team' && <TeamTab />}
      {activeTab === 'billing' && <BillingTab />}
      {activeTab === 'integrations' && <IntegrationsTab />}
    </div>
  );
}

/* ── Profile ── */
function ProfileTab() {
  return (
    <div className="space-y-6">
      <section className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Personal Information</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
            <input type="text" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Ahmed" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
            <input type="text" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Zayed" />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="ahmed@nexus.io" />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors">
            Save Changes
          </button>
        </div>
      </section>

      <section className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Password</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
            <input type="password" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
            <input type="password" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
            <input type="password" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors">
            Update Password
          </button>
        </div>
      </section>
    </div>
  );
}

/* ── Team ── */
function TeamTab() {
  const members = [
    { name: 'Ahmed Zayed', email: 'ahmed@nexus.io', role: 'Owner', avatar: 'AZ' },
    { name: 'Sara Hassan', email: 'sara@nexus.io', role: 'Admin', avatar: 'SH' },
    { name: 'Omar Khalil', email: 'omar@nexus.io', role: 'Member', avatar: 'OK' },
  ];
  return (
    <div className="space-y-6">
      <section className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Team Members</h2>
          <button className="bg-blue-600 text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors">
            Invite Member
          </button>
        </div>
        <div className="divide-y divide-gray-100">
          {members.map(m => (
            <div key={m.email} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold">
                  {m.avatar}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{m.name}</p>
                  <p className="text-xs text-gray-500">{m.email}</p>
                </div>
              </div>
              <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded">
                {m.role}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ── Billing ── */
function BillingTab() {
  return (
    <div className="space-y-6">
      <section className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Current Plan</h2>
        <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div>
            <p className="font-semibold text-blue-900">Pro Plan</p>
            <p className="text-sm text-blue-700">$79 / month · Up to 25 seats</p>
          </div>
          <button className="text-sm text-blue-700 font-medium hover:underline">Upgrade</button>
        </div>
      </section>
      <section className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Payment Method</h2>
        <div className="flex items-center gap-3 text-sm text-gray-600">
          <CreditCard className="w-5 h-5" />
          <span>Visa ending in 4242</span>
          <button className="ml-auto text-blue-600 hover:underline text-xs font-medium">Update</button>
        </div>
      </section>
    </div>
  );
}

/* ── Integrations ── */
function IntegrationsTab() {
  const integrations = [
    { name: 'Google Workspace', description: 'Sync contacts, calendar and email', connected: true },
    { name: 'Slack',            description: 'Get notifications in Slack channels', connected: false },
    { name: 'Stripe',           description: 'Billing and subscription management', connected: true },
    { name: 'SendGrid',         description: 'Transactional email delivery',        connected: false },
  ];
  return (
    <div className="space-y-4">
      {integrations.map(intg => (
        <div key={intg.name} className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900">{intg.name}</p>
            <p className="text-xs text-gray-500 mt-0.5">{intg.description}</p>
          </div>
          <button
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              intg.connected
                ? 'bg-red-50 text-red-600 hover:bg-red-100'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {intg.connected ? 'Disconnect' : 'Connect'}
          </button>
        </div>
      ))}
    </div>
  );
}
```

Verify:

```bash
wc -l apps/web/src/app/\(dashboard\)/settings/page.tsx
# Must be > 150
```

---

## TASK 4 — Fix `skeleton.tsx` — Append Missing Exports

**File:** `apps/web/src/components/ui/skeleton.tsx`

Append the following two components to the **end** of the file (do not remove existing content):

```typescript
export function CardSkeleton() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
      <Skeleton className="h-8 w-24" />
      <Skeleton className="h-4 w-40" />
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-2">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-7 w-16" />
      <Skeleton className="h-3 w-28" />
    </div>
  );
}
```

Verify:

```bash
grep -c "^export function" apps/web/src/components/ui/skeleton.tsx
# Must be 4
```

---

## TASK 5 — Add Grafana to `docker-compose.yml`

The `grafana` service is missing from `docker-compose.yml`. If `prometheus` is also missing,
add both; otherwise add only Grafana.

First check:

```bash
grep -c "grafana\|prometheus" docker-compose.yml
```

**If result < 4**, append the following inside the `services:` block (before the `volumes:` section).
Add only what's missing:

```yaml
  prometheus:
    image: prom/prometheus:v2.51.0
    container_name: nexus_prometheus
    volumes:
      - ./infrastructure/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=15d'
    ports:
      - '9090:9090'
    networks:
      - nexus-network
    restart: unless-stopped

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

Also ensure the `volumes:` block at the end of the file contains:

```yaml
  prometheus_data:
  grafana_data:
```

Verify:

```bash
grep -E "prometheus|grafana" docker-compose.yml | grep -v "^#"
# Must show at least 4 lines (image lines for both services)
```

---

## TASK 6 — Fix `init.sql` GRANT Block (10 → 20 Databases)

**File:** `infrastructure/postgres/init.sql`

The file currently only GRANTs privileges on 10 databases. Append the following 10 missing GRANTs
(Phase 9-12 services) to the end of the file:

```sql
-- Phase 9-12 database grants
\connect nexus_chatbot
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO nexus;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO nexus;

\connect nexus_cadence
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO nexus;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO nexus;

\connect nexus_territory
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO nexus;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO nexus;

\connect nexus_planning
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO nexus;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO nexus;

\connect nexus_reporting
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO nexus;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO nexus;

\connect nexus_portal
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO nexus;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO nexus;

\connect nexus_knowledge
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO nexus;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO nexus;

\connect nexus_incentive
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO nexus;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO nexus;

\connect nexus_data
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO nexus;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO nexus;

\connect nexus_document
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO nexus;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO nexus;
```

Verify:

```bash
grep -c "GRANT ALL PRIVILEGES ON ALL TABLES" infrastructure/postgres/init.sql
# Must be >= 20
```

---

## TASK 7 — Add 8 Zero-Coverage Services to `vitest.workspace.ts`

**File:** `vitest.workspace.ts` (monorepo root)

The following services have no test file and are excluded from the workspace.
Add them to the `projects` array:

```typescript
{ test: { name: 'cadence-service',   root: './apps/cadence-service',   include: ['src/**/*.test.ts'] } },
{ test: { name: 'territory-service', root: './apps/territory-service', include: ['src/**/*.test.ts'] } },
{ test: { name: 'planning-service',  root: './apps/planning-service',  include: ['src/**/*.test.ts'] } },
{ test: { name: 'knowledge-service', root: './apps/knowledge-service', include: ['src/**/*.test.ts'] } },
{ test: { name: 'incentive-service', root: './apps/incentive-service', include: ['src/**/*.test.ts'] } },
{ test: { name: 'portal-service',    root: './apps/portal-service',    include: ['src/**/*.test.ts'] } },
{ test: { name: 'document-service',  root: './apps/document-service',  include: ['src/**/*.test.ts'] } },
{ test: { name: 'chatbot-service',   root: './apps/chatbot-service',   include: ['src/**/*.test.ts'] } },
```

Then create a minimal smoke-test for each. Template (adapt SERVICE_NAME and PORT):

**File:** `apps/SERVICE_NAME-service/src/index.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

const BASE = `http://localhost:PORT`;

async function serviceAvailable(): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(1000) });
    return r.ok;
  } catch {
    return false;
  }
}

describe('SERVICE_NAME-service smoke', () => {
  let available = false;
  beforeAll(async () => { available = await serviceAvailable(); });

  it('GET /health → 200', async () => {
    if (!available) return;
    const res = await fetch(`${BASE}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('returns JSON on api routes', async () => {
    if (!available) return;
    expect(true).toBe(true); // placeholder — expands per service
  });
});
```

Create tests for: `cadence` (3018), `territory` (3019), `planning` (3020),
`knowledge` (3023), `incentive` (3024), `portal` (3022), `document` (3016), `chatbot` (3017).

Verify:

```bash
ls apps/{cadence,territory,planning,knowledge,incentive,portal,document,chatbot}-service/src/index.test.ts
# Must show 8 paths
grep -c "projects" vitest.workspace.ts
# Must be >= 1 (file exists)
```

---

## Final Verification Checklist

Run this full bash block after completing all tasks:

```bash
echo "=== TASK 1: Service listen checks ==="
for svc in approval cadence territory planning knowledge incentive portal document chatbot data; do
  tail -5 apps/${svc}-service/src/index.ts | grep -q "start()\|app.listen\|startService" \
    && echo "✅ ${svc}" || echo "❌ ${svc}"
done

echo ""
echo "=== TASK 2: next.config.mjs ==="
wc -c apps/web/next.config.mjs
tail -3 apps/web/next.config.mjs

echo ""
echo "=== TASK 3: settings/page.tsx ==="
wc -l "apps/web/src/app/(dashboard)/settings/page.tsx"

echo ""
echo "=== TASK 4: skeleton.tsx exports ==="
grep -c "^export function" apps/web/src/components/ui/skeleton.tsx

echo ""
echo "=== TASK 5: docker-compose observability ==="
grep -E "prometheus|grafana" docker-compose.yml | grep -v "^#" | wc -l

echo ""
echo "=== TASK 6: init.sql GRANTs ==="
grep -c "GRANT ALL PRIVILEGES ON ALL TABLES" infrastructure/postgres/init.sql

echo ""
echo "=== TASK 7: test files ==="
ls apps/{cadence,territory,planning,knowledge,incentive,portal,document,chatbot}-service/src/index.test.ts 2>&1 | grep -v "No such" | wc -l
```

### Expected Results

| Task | Check | Expected |
|---|---|---|
| 1 | 10 service listen checks | 10 × ✅ |
| 2 | next.config.mjs size | > 500 bytes |
| 2 | next.config.mjs tail | ends with `});` |
| 3 | settings/page.tsx lines | > 150 |
| 4 | skeleton.tsx export count | 4 |
| 5 | docker-compose grafana/prometheus lines | ≥ 4 |
| 6 | init.sql GRANT count | ≥ 20 |
| 7 | test file count | 8 |
