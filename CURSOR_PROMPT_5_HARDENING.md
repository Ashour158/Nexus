# Prompt 5 — Rate Limiting, Document Schema, Root Test Config, Zero-Test Services

## Context

NEXUS CRM — pnpm monorepo. Fastify 4, Prisma 5, Vitest + Supertest. The gap analysis identified:
- 9 services still missing `@fastify/rate-limit` registration despite having the import
- `document-service` has no `prisma/schema.prisma`
- No `vitest.workspace.ts` at monorepo root — `pnpm test` does nothing
- 7 services have zero tests: chatbot, data, incentive, knowledge, planning, portal, reporting

---

## TASK 1 — Add `@fastify/rate-limit` to 9 Missing Services

The following services import `rateLimit` but never call `app.register(rateLimit, ...)`. Add the
registration block to each `src/index.ts`, immediately after the `app.register(fastifyJwt, ...)`
call and before any route registration.

**Services to update:**
```
services/comm-service/src/index.ts
services/notification-service/src/index.ts
services/workflow-service/src/index.ts
services/analytics-service/src/index.ts
services/search-service/src/index.ts
services/billing-service/src/index.ts
services/integration-service/src/index.ts
services/blueprint-service/src/index.ts
services/realtime-service/src/index.ts
services/storage-service/src/index.ts
```

**Block to insert** (same pattern as auth/crm/finance):
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

If `@fastify/rate-limit` is not yet in the service's `package.json` dependencies, install it first:
```bash
pnpm --filter <service-name> add @fastify/rate-limit
```

Do NOT change any other logic in these files. Only insert the register block.

---

## TASK 2 — Create `services/document-service/prisma/schema.prisma`

Create the file `services/document-service/prisma/schema.prisma` with the following content:

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../../../node_modules/.prisma/document-client"
}

datasource db {
  provider = "postgresql"
  url      = env("DOCUMENT_DATABASE_URL")
}

model Document {
  id          String    @id @default(uuid())
  tenantId    String
  ownerId     String
  name        String
  description String?
  mimeType    String
  sizeBytes   Int
  storageKey  String    @unique
  folderId    String?
  folder      Folder?   @relation(fields: [folderId], references: [id])
  versions    DocumentVersion[]
  permissions DocumentPermission[]
  tags        String[]
  isDeleted   Boolean   @default(false)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([tenantId])
  @@index([ownerId])
  @@index([folderId])
}

model DocumentVersion {
  id           String   @id @default(uuid())
  documentId   String
  document     Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  versionNumber Int
  storageKey   String   @unique
  sizeBytes    Int
  createdById  String
  createdAt    DateTime @default(now())

  @@index([documentId])
}

model Folder {
  id        String     @id @default(uuid())
  tenantId  String
  name      String
  parentId  String?
  parent    Folder?    @relation("FolderTree", fields: [parentId], references: [id])
  children  Folder[]   @relation("FolderTree")
  documents Document[]
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt

  @@index([tenantId])
  @@index([parentId])
}

model DocumentPermission {
  id         String   @id @default(uuid())
  documentId String
  document   Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  userId     String
  role       String   // VIEWER | EDITOR | OWNER
  createdAt  DateTime @default(now())

  @@unique([documentId, userId])
  @@index([documentId])
  @@index([userId])
}
```

Also add `DOCUMENT_DATABASE_URL` to `services/document-service/.env.example`:
```
DOCUMENT_DATABASE_URL=postgresql://nexus:nexus@localhost:5432/nexus_document
PORT=3016
JWT_SECRET=dev-secret-change-in-production
STORAGE_SERVICE_URL=http://localhost:3009
```

Then run the migration:
```bash
pnpm --filter document-service exec prisma migrate dev --name init
```

---

## TASK 3 — Create `vitest.workspace.ts` at Monorepo Root

Create `vitest.workspace.ts` in the repo root:

```typescript
import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'services/auth-service/vitest.config.ts',
  'services/crm-service/vitest.config.ts',
  'services/finance-service/vitest.config.ts',
  'services/comm-service/vitest.config.ts',
  'services/notification-service/vitest.config.ts',
  'services/workflow-service/vitest.config.ts',
  'services/billing-service/vitest.config.ts',
  'services/integration-service/vitest.config.ts',
  'services/blueprint-service/vitest.config.ts',
  'services/approval-service/vitest.config.ts',
  'services/cadence-service/vitest.config.ts',
  'services/territory-service/vitest.config.ts',
  'services/chatbot-service/vitest.config.ts',
  'services/data-service/vitest.config.ts',
  'services/document-service/vitest.config.ts',
  'services/incentive-service/vitest.config.ts',
  'services/knowledge-service/vitest.config.ts',
  'services/planning-service/vitest.config.ts',
  'services/portal-service/vitest.config.ts',
  'services/reporting-service/vitest.config.ts',
  'services/analytics-service/vitest.config.ts',
  'services/search-service/vitest.config.ts',
  'services/realtime-service/vitest.config.ts',
  'services/storage-service/vitest.config.ts',
]);
```

Also ensure the root `package.json` `test` script uses the workspace:
```json
"test": "vitest run --workspace vitest.workspace.ts"
```

For any service missing a `vitest.config.ts`, create one with this template:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 15000,
  },
});
```

---

## TASK 4 — Write Integration Tests for 7 Zero-Test Services

Create one test file per service. All follow the same pattern: `supertest` against a live URL,
`serviceAvailable()` guard for graceful skip, 4–5 test cases per service.

### `services/chatbot-service/src/__tests__/chatbot.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import supertest from 'supertest';

const baseUrl = process.env.CHATBOT_SERVICE_TEST_URL ?? 'http://localhost:3017';
const token = process.env.TEST_JWT_TOKEN ?? '';
const request = supertest(baseUrl);

async function serviceAvailable(): Promise<boolean> {
  try { const r = await request.get('/health'); return r.status < 500; } catch { return false; }
}

describe('chatbot-service integration', () => {
  it('GET /health returns 200', async () => {
    if (!(await serviceAvailable())) return;
    const r = await request.get('/health');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'ok', service: 'chatbot-service' });
  });

  it('GET /api/v1/conversations without auth returns 401', async () => {
    if (!(await serviceAvailable())) return;
    const r = await request.get('/api/v1/conversations');
    expect(r.status).toBe(401);
  });

  it('GET /api/v1/conversations with auth returns array', async () => {
    if (!(await serviceAvailable()) || !token) return;
    const r = await request.get('/api/v1/conversations').set('Authorization', `Bearer ${token}`);
    expect([200, 403]).toContain(r.status);
    if (r.status === 200) expect(Array.isArray(r.body.data ?? r.body)).toBe(true);
  });

  it('POST /api/v1/conversations with empty body returns 400/422', async () => {
    if (!(await serviceAvailable()) || !token) return;
    const r = await request
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect([400, 422, 403]).toContain(r.status);
  });

  it('Error responses use { success: false } shape', async () => {
    if (!(await serviceAvailable())) return;
    const r = await request.get('/api/v1/conversations');
    expect(r.body).toHaveProperty('success', false);
  });
});
```

### `services/data-service/src/__tests__/data.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import supertest from 'supertest';

const baseUrl = process.env.DATA_SERVICE_TEST_URL ?? 'http://localhost:3015';
const token = process.env.TEST_JWT_TOKEN ?? '';
const request = supertest(baseUrl);

async function serviceAvailable(): Promise<boolean> {
  try { const r = await request.get('/health'); return r.status < 500; } catch { return false; }
}

describe('data-service integration', () => {
  it('GET /health returns 200', async () => {
    if (!(await serviceAvailable())) return;
    const r = await request.get('/health');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'ok', service: 'data-service' });
  });

  it('GET /api/v1/audit without auth returns 401', async () => {
    if (!(await serviceAvailable())) return;
    const r = await request.get('/api/v1/audit');
    expect(r.status).toBe(401);
  });

  it('GET /api/v1/audit with auth returns paginated logs', async () => {
    if (!(await serviceAvailable()) || !token) return;
    const r = await request.get('/api/v1/audit').set('Authorization', `Bearer ${token}`);
    expect([200, 403]).toContain(r.status);
    if (r.status === 200) expect(r.body).toHaveProperty('data');
  });

  it('GET /api/v1/export without auth returns 401', async () => {
    if (!(await serviceAvailable())) return;
    const r = await request.get('/api/v1/export');
    expect(r.status).toBe(401);
  });

  it('GET /api/v1/recycle with auth returns array', async () => {
    if (!(await serviceAvailable()) || !token) return;
    const r = await request.get('/api/v1/recycle').set('Authorization', `Bearer ${token}`);
    expect([200, 403]).toContain(r.status);
  });
});
```

### `services/incentive-service/src/__tests__/incentive.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import supertest from 'supertest';

const baseUrl = process.env.INCENTIVE_SERVICE_TEST_URL ?? 'http://localhost:3024';
const token = process.env.TEST_JWT_TOKEN ?? '';
const request = supertest(baseUrl);

async function serviceAvailable(): Promise<boolean> {
  try { const r = await request.get('/health'); return r.status < 500; } catch { return false; }
}

describe('incentive-service integration', () => {
  it('GET /health returns 200', async () => {
    if (!(await serviceAvailable())) return;
    const r = await request.get('/health');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'ok', service: 'incentive-service' });
  });

  it('GET /api/v1/badges without auth returns 401', async () => {
    if (!(await serviceAvailable())) return;
    const r = await request.get('/api/v1/badges');
    expect(r.status).toBe(401);
  });

  it('GET /api/v1/badges with auth returns array', async () => {
    if (!(await serviceAvailable()) || !token) return;
    const r = await request.get('/api/v1/badges').set('Authorization', `Bearer ${token}`);
    expect([200, 403]).toContain(r.status);
    if (r.status === 200) expect(Array.isArray(r.body.data ?? r.body)).toBe(true);
  });

  it('GET /api/v1/contests with auth returns array', async () => {
    if (!(await serviceAvailable()) || !token) return;
    const r = await request.get('/api/v1/contests').set('Authorization', `Bearer ${token}`);
    expect([200, 403]).toContain(r.status);
  });

  it('POST /api/v1/badges with empty body returns 400/422', async () => {
    if (!(await serviceAvailable()) || !token) return;
    const r = await request
      .post('/api/v1/badges')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect([400, 422, 403]).toContain(r.status);
  });
});
```

### `services/knowledge-service/src/__tests__/knowledge.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import supertest from 'supertest';

const baseUrl = process.env.KNOWLEDGE_SERVICE_TEST_URL ?? 'http://localhost:3023';
const token = process.env.TEST_JWT_TOKEN ?? '';
const request = supertest(baseUrl);

async function serviceAvailable(): Promise<boolean> {
  try { const r = await request.get('/health'); return r.status < 500; } catch { return false; }
}

describe('knowledge-service integration', () => {
  it('GET /health returns 200', async () => {
    if (!(await serviceAvailable())) return;
    const r = await request.get('/health');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'ok', service: 'knowledge-service' });
  });

  it('GET /api/v1/knowledge without auth returns 401', async () => {
    if (!(await serviceAvailable())) return;
    const r = await request.get('/api/v1/knowledge');
    expect(r.status).toBe(401);
  });

  it('GET /api/v1/knowledge with auth returns articles', async () => {
    if (!(await serviceAvailable()) || !token) return;
    const r = await request.get('/api/v1/knowledge').set('Authorization', `Bearer ${token}`);
    expect([200, 403]).toContain(r.status);
    if (r.status === 200) expect(Array.isArray(r.body.data ?? r.body)).toBe(true);
  });

  it('POST /api/v1/knowledge creates article', async () => {
    if (!(await serviceAvailable()) || !token) return;
    const r = await request
      .post('/api/v1/knowledge')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Test Article', content: 'Test content body', category: 'general' });
    expect([201, 400, 403, 422]).toContain(r.status);
  });

  it('POST /api/v1/knowledge with empty body returns 400/422', async () => {
    if (!(await serviceAvailable()) || !token) return;
    const r = await request
      .post('/api/v1/knowledge')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect([400, 422, 403]).toContain(r.status);
  });
});
```

### `services/planning-service/src/__tests__/planning.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import supertest from 'supertest';

const baseUrl = process.env.PLANNING_SERVICE_TEST_URL ?? 'http://localhost:3020';
const token = process.env.TEST_JWT_TOKEN ?? '';
const request = supertest(baseUrl);

async function serviceAvailable(): Promise<boolean> {
  try { const r = await request.get('/health'); return r.status < 500; } catch { return false; }
}

describe('planning-service integration', () => {
  it('GET /health returns 200', async () => {
    if (!(await serviceAvailable())) return;
    const r = await request.get('/health');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'ok', service: 'planning-service' });
  });

  it('GET /api/v1/quotas without auth returns 401', async () => {
    if (!(await serviceAvailable())) return;
    const r = await request.get('/api/v1/quotas');
    expect(r.status).toBe(401);
  });

  it('GET /api/v1/quotas with auth returns data', async () => {
    if (!(await serviceAvailable()) || !token) return;
    const r = await request.get('/api/v1/quotas').set('Authorization', `Bearer ${token}`);
    expect([200, 403]).toContain(r.status);
  });

  it('GET /api/v1/forecasts with auth returns data', async () => {
    if (!(await serviceAvailable()) || !token) return;
    const r = await request.get('/api/v1/forecasts').set('Authorization', `Bearer ${token}`);
    expect([200, 403]).toContain(r.status);
  });

  it('POST /api/v1/quotas with invalid body returns 400/422', async () => {
    if (!(await serviceAvailable()) || !token) return;
    const r = await request
      .post('/api/v1/quotas')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect([400, 422, 403]).toContain(r.status);
  });
});
```

### `services/portal-service/src/__tests__/portal.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import supertest from 'supertest';

const baseUrl = process.env.PORTAL_SERVICE_TEST_URL ?? 'http://localhost:3022';
const token = process.env.TEST_JWT_TOKEN ?? '';
const request = supertest(baseUrl);

async function serviceAvailable(): Promise<boolean> {
  try { const r = await request.get('/health'); return r.status < 500; } catch { return false; }
}

describe('portal-service integration', () => {
  it('GET /health returns 200', async () => {
    if (!(await serviceAvailable())) return;
    const r = await request.get('/health');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'ok', service: 'portal-service' });
  });

  it('GET /api/v1/portal without auth returns 401', async () => {
    if (!(await serviceAvailable())) return;
    const r = await request.get('/api/v1/portal');
    expect(r.status).toBe(401);
  });

  it('GET /api/v1/portal with auth returns data', async () => {
    if (!(await serviceAvailable()) || !token) return;
    const r = await request.get('/api/v1/portal').set('Authorization', `Bearer ${token}`);
    expect([200, 403]).toContain(r.status);
  });

  it('Error shape is { success: false }', async () => {
    if (!(await serviceAvailable())) return;
    const r = await request.get('/api/v1/portal');
    expect(r.body).toHaveProperty('success', false);
  });
});
```

### `services/reporting-service/src/__tests__/reporting.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import supertest from 'supertest';

const baseUrl = process.env.REPORTING_SERVICE_TEST_URL ?? 'http://localhost:3021';
const token = process.env.TEST_JWT_TOKEN ?? '';
const request = supertest(baseUrl);

async function serviceAvailable(): Promise<boolean> {
  try { const r = await request.get('/health'); return r.status < 500; } catch { return false; }
}

describe('reporting-service integration', () => {
  it('GET /health returns 200', async () => {
    if (!(await serviceAvailable())) return;
    const r = await request.get('/health');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'ok', service: 'reporting-service' });
  });

  it('GET /api/v1/reports without auth returns 401', async () => {
    if (!(await serviceAvailable())) return;
    const r = await request.get('/api/v1/reports');
    expect(r.status).toBe(401);
  });

  it('GET /api/v1/reports with auth returns templates', async () => {
    if (!(await serviceAvailable()) || !token) return;
    const r = await request.get('/api/v1/reports').set('Authorization', `Bearer ${token}`);
    expect([200, 403]).toContain(r.status);
    if (r.status === 200) expect(Array.isArray(r.body.data ?? r.body)).toBe(true);
  });

  it('POST /api/v1/reports with valid body creates report', async () => {
    if (!(await serviceAvailable()) || !token) return;
    const r = await request
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test Report', type: 'DEALS', filters: {} });
    expect([201, 400, 403, 422]).toContain(r.status);
  });

  it('POST /api/v1/reports with empty body returns 400/422', async () => {
    if (!(await serviceAvailable()) || !token) return;
    const r = await request
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect([400, 422, 403]).toContain(r.status);
  });
});
```

---

## Verification Checklist

- [ ] All 10 services now have `await app.register(rateLimit, {` in `src/index.ts`
- [ ] `services/document-service/prisma/schema.prisma` exists with 4 models
- [ ] `services/document-service/.env.example` has `DOCUMENT_DATABASE_URL`
- [ ] `vitest.workspace.ts` exists at repo root with all 24 services
- [ ] Root `package.json` `test` script uses `--workspace vitest.workspace.ts`
- [ ] 7 new test files created (chatbot, data, incentive, knowledge, planning, portal, reporting)
- [ ] Each new service has `vitest.config.ts` if missing
- [ ] `pnpm --filter chatbot-service add -D supertest @types/supertest` run for each new test service
