# Prompt 1B — Verify Phase 9–12 Service Files + Postgres Helper Script

## Context

NEXUS CRM — pnpm monorepo. Prompt 1 added `@fastify/rate-limit` and `globalErrorHandler` to 12
Phase 9–12 services and updated `infrastructure/postgres/init.sql`. This prompt verifies those
edits landed cleanly and creates a Postgres migration helper for environments where the volume
already exists.

---

## TASK 1 — Tail-check all 12 service `src/index.ts` files

For each of the following services, read the **last 10 lines** of `src/index.ts` and confirm:

1. The file ends with a closing `});` that closes the `startService(...)` call.
2. There is no truncated line (e.g. a line ending mid-word, mid-string, or `asy`, `glob`, `t`,
   `pr`, etc.).
3. The `app.setErrorHandler(globalErrorHandler)` line is present somewhere in the file.
4. The `await app.register(rateLimit, {` block is present.

**Services to check:**
```
services/approval-service/src/index.ts
services/cadence-service/src/index.ts
services/chatbot-service/src/index.ts
services/data-service/src/index.ts
services/document-service/src/index.ts
services/incentive-service/src/index.ts
services/knowledge-service/src/index.ts
services/planning-service/src/index.ts
services/portal-service/src/index.ts
services/reporting-service/src/index.ts
services/territory-service/src/index.ts
```

**If any file is truncated or missing the error handler / rate limiter**, rewrite it completely
using the template below. Use the correct service name, port, and Prisma client for each.

### Canonical `src/index.ts` template for a Phase 9–12 service

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

const port = parseInt(process.env.PORT ?? '<DEFAULT_PORT>', 10);
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
  service: '<SERVICE_NAME>',
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

**Per-service values:**

| Service             | Default Port | Service Name string      |
|---------------------|-------------|--------------------------|
| approval-service    | 3014        | `approval-service`       |
| cadence-service     | 3018        | `cadence-service`        |
| chatbot-service     | 3017        | `chatbot-service`        |
| data-service        | 3015        | `data-service`           |
| document-service    | 3016        | `document-service`       |
| incentive-service   | 3024        | `incentive-service`      |
| knowledge-service   | 3023        | `knowledge-service`      |
| planning-service    | 3020        | `planning-service`       |
| portal-service      | 3022        | `portal-service`         |
| reporting-service   | 3021        | `reporting-service`      |
| territory-service   | 3019        | `territory-service`      |

> **Note:** Each service may have a different routes import path or additional route registrations.
> Preserve any existing route registrations — only fix the wrapper (rateLimit, errorHandler,
> health, listen). Do not delete route imports.

---

## TASK 2 — Create `scripts/create-missing-dbs.sql`

Create this file at `scripts/create-missing-dbs.sql`. This is a **one-time migration helper** for
developers who already have a running Postgres container with an existing volume (so `init.sql`
won't re-run). It is safe to run multiple times — all statements use `IF NOT EXISTS`.

```sql
-- scripts/create-missing-dbs.sql
-- Run this against your Postgres container if the volume already existed before init.sql was
-- updated. Safe to run multiple times (all statements are idempotent).
--
-- Usage:
--   docker compose exec postgres psql -U nexus -f /scripts/create-missing-dbs.sql
-- Or from the host:
--   cat scripts/create-missing-dbs.sql | docker compose exec -T postgres psql -U nexus

CREATE DATABASE IF NOT EXISTS nexus_approval;
CREATE DATABASE IF NOT EXISTS nexus_cadence;
CREATE DATABASE IF NOT EXISTS nexus_territory;
CREATE DATABASE IF NOT EXISTS nexus_planning;
CREATE DATABASE IF NOT EXISTS nexus_reporting;
CREATE DATABASE IF NOT EXISTS nexus_portal;
CREATE DATABASE IF NOT EXISTS nexus_knowledge;
CREATE DATABASE IF NOT EXISTS nexus_incentive;
CREATE DATABASE IF NOT EXISTS nexus_data;
CREATE DATABASE IF NOT EXISTS nexus_chatbot;

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

## TASK 3 — Add a `db:create` script to root `package.json`

In the root `package.json`, add the following entry under `"scripts"`:

```json
"db:create-missing": "docker compose exec -T postgres psql -U nexus -f /dev/stdin < scripts/create-missing-dbs.sql"
```

This gives developers a single command (`pnpm db:create-missing`) to hydrate an existing volume
without wiping it.

---

## Verification Checklist

After completing all tasks:

- [ ] All 11 service `src/index.ts` files have `app.setErrorHandler(globalErrorHandler)`
- [ ] All 11 service `src/index.ts` files have `await app.register(rateLimit, {`
- [ ] All 11 service `src/index.ts` files end with a complete `listen` block or `startService` call
- [ ] No `src/index.ts` has a line ending mid-token
- [ ] `scripts/create-missing-dbs.sql` exists and has all 10 `CREATE DATABASE IF NOT EXISTS` lines
- [ ] Root `package.json` has `"db:create-missing"` script
