# Prompt 1 — Infrastructure P0 Fixes + Service Hardening

## Context

NEXUS CRM is a pnpm monorepo with 25 microservices. All Fastify services use `@nexus/service-utils` which exports `createService`, `globalErrorHandler`, `registerHealthRoutes`, and `startService`. The core services (auth, crm, finance) already use this pattern. The 12 Phase 9–12 services were built with raw Fastify instead and are missing the error handler and rate limiting.

**Stack**: Fastify 4, Prisma 5, Postgres 16, Kafka, Redis, Kong API Gateway (infrastructure/kong/kong.yml)

---

## TASK 1 — Fix `infrastructure/postgres/init.sql`

**File**: `infrastructure/postgres/init.sql`

The file currently creates 10 databases. Add the following 10 databases for Phase 9–12 services. Add them **after** the existing `CREATE DATABASE nexus_blueprint;` line and before the `GRANT` statements, following the exact same pattern:

```sql
CREATE DATABASE nexus_approval;
CREATE DATABASE nexus_cadence;
CREATE DATABASE nexus_territory;
CREATE DATABASE nexus_planning;
CREATE DATABASE nexus_reporting;
CREATE DATABASE nexus_portal;
CREATE DATABASE nexus_knowledge;
CREATE DATABASE nexus_incentive;
CREATE DATABASE nexus_data;
CREATE DATABASE nexus_chatbot;
```

Add the corresponding `GRANT ALL PRIVILEGES` lines after the existing grants:

```sql
GRANT ALL PRIVILEGES ON DATABASE nexus_approval TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_cadence TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_territory TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_planning TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_reporting TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_portal TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_knowledge TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_incentive TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_data TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_chatbot TO nexus;
```

Add `uuid-ossp` extension connections for each new database, following the existing `\connect` pattern at the bottom of the file:

```sql
\connect nexus_approval
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\connect nexus_cadence
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\connect nexus_territory
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\connect nexus_planning
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\connect nexus_reporting
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\connect nexus_portal
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\connect nexus_knowledge
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\connect nexus_incentive
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\connect nexus_data
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\connect nexus_chatbot
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

---

## TASK 2 — Fix `infrastructure/kong/kong.yml`

**File**: `infrastructure/kong/kong.yml`

The file currently registers 10 services. Append the following 15 service entries at the end of the `services:` list. Follow the exact YAML format of existing entries:

```yaml
  - name: billing-service
    url: http://billing-service:3011
    routes:
      - name: billing-routes
        paths:
          - /api/v1/billing
          - /api/v1/subscriptions
          - /api/v1/plans
        strip_path: false

  - name: integration-service
    url: http://integration-service:3012
    routes:
      - name: integration-routes
        paths:
          - /api/v1/integrations
        strip_path: false

  - name: blueprint-service
    url: http://blueprint-service:3013
    routes:
      - name: blueprint-routes
        paths:
          - /api/v1/blueprints
        strip_path: false

  - name: approval-service
    url: http://approval-service:3014
    routes:
      - name: approval-routes
        paths:
          - /api/v1/approvals
          - /api/v1/approval-policies
        strip_path: false

  - name: data-service
    url: http://data-service:3015
    routes:
      - name: data-routes
        paths:
          - /api/v1/audit
          - /api/v1/export
          - /api/v1/import
          - /api/v1/recycle
          - /api/v1/views
        strip_path: false

  - name: document-service
    url: http://document-service:3016
    routes:
      - name: document-routes
        paths:
          - /api/v1/documents
        strip_path: false

  - name: chatbot-service
    url: http://chatbot-service:3017
    routes:
      - name: chatbot-routes
        paths:
          - /api/v1/chatbot
          - /api/v1/conversations
        strip_path: false

  - name: cadence-service
    url: http://cadence-service:3018
    routes:
      - name: cadence-routes
        paths:
          - /api/v1/cadences
          - /api/v1/enrollments
        strip_path: false

  - name: territory-service
    url: http://territory-service:3019
    routes:
      - name: territory-routes
        paths:
          - /api/v1/territories
        strip_path: false

  - name: planning-service
    url: http://planning-service:3020
    routes:
      - name: planning-routes
        paths:
          - /api/v1/quotas
          - /api/v1/forecasts
        strip_path: false

  - name: reporting-service
    url: http://reporting-service:3021
    routes:
      - name: reporting-routes
        paths:
          - /api/v1/reports
        strip_path: false

  - name: portal-service
    url: http://portal-service:3022
    routes:
      - name: portal-routes
        paths:
          - /api/v1/portal
        strip_path: false

  - name: knowledge-service
    url: http://knowledge-service:3023
    routes:
      - name: knowledge-routes
        paths:
          - /api/v1/knowledge
        strip_path: false

  - name: incentive-service
    url: http://incentive-service:3024
    routes:
      - name: incentive-routes
        paths:
          - /api/v1/badges
          - /api/v1/contests
        strip_path: false

  - name: realtime-service
    url: http://realtime-service:3005
    routes:
      - name: realtime-routes
        paths:
          - /api/v1/realtime
          - /socket.io
        strip_path: false
```

---

## TASK 3 — Add Error Handler + Rate Limiting to 12 Phase 9–12 Services

The following 12 services use raw Fastify without `globalErrorHandler` or `@fastify/rate-limit`. Update **each** service's `src/index.ts` to add both.

**Services to update:**
`approval-service`, `cadence-service`, `chatbot-service`, `data-service`, `document-service`, `incentive-service`, `knowledge-service`, `planning-service`, `portal-service`, `reporting-service`, `territory-service`

**For each service**, make these changes to `src/index.ts`:

### Step 1 — Add imports at the top
```typescript
import rateLimit from '@fastify/rate-limit';
```

Also add `globalErrorHandler` to the existing `@nexus/service-utils` import if the service already imports from it, or add the full import if not:
```typescript
import { globalErrorHandler } from '@nexus/service-utils';
```

### Step 2 — Register rate limiter BEFORE route registration
Add this block immediately after `app.register(fastifyJwt, ...)`:

```typescript
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
```

### Step 3 — Set error handler BEFORE route registration
Add this line after the rate limit registration:
```typescript
app.setErrorHandler(globalErrorHandler);
```

### Step 4 — Update health route to return version
Change the existing health route from:
```typescript
app.get('/health', async () => ({ status: 'ok', service: '<name>' }));
```
to:
```typescript
app.get('/health', async () => ({ status: 'ok', service: '<service-name>', version: '1.0.0' }));
```
Use the correct service name for each service.

### Step 5 — Install @fastify/rate-limit in each affected service
Run: `pnpm --filter <service-name> add @fastify/rate-limit`

Do this for all 12 services before making index.ts changes.

---

## Verification Checklist

After completing all tasks:

- [ ] `infrastructure/postgres/init.sql` has 20 `CREATE DATABASE` statements (10 original + 10 new)
- [ ] `infrastructure/postgres/init.sql` has 20 `GRANT ALL PRIVILEGES` statements
- [ ] `infrastructure/postgres/init.sql` has `\connect` + `CREATE EXTENSION` for all 20 databases
- [ ] `infrastructure/kong/kong.yml` has 25 service entries
- [ ] All 12 Phase 9–12 services have `@fastify/rate-limit` in their `package.json`
- [ ] All 12 Phase 9–12 services call `app.register(rateLimit, ...)` in `src/index.ts`
- [ ] All 12 Phase 9–12 services call `app.setErrorHandler(globalErrorHandler)` in `src/index.ts`
- [ ] Health routes return `{ status, service, version: '1.0.0' }` in all 12 services
- [ ] No service `index.ts` ends mid-token or mid-block (verify with `tail -3` on each file)
