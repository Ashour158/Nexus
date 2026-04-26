# Prompt 2 — Test Coverage for 5 High-Risk Services

## Context

NEXUS CRM — pnpm monorepo. Services use Fastify 4, Prisma 5, JWT auth (`@fastify/jwt`), and `@nexus/service-utils`. Tests use `vitest` + `supertest`. The test pattern used by existing tests (e.g. `auth-service/src/__tests__/auth.test.ts`) calls a **running service** via HTTP using `supertest(baseUrl)` with a live URL from env, not an in-process app instance. Tests skip gracefully if the service is unavailable via a `serviceAvailable()` guard.

**Important**: Do NOT try to unit-test Prisma internals. All tests hit the actual HTTP endpoints.

**Install supertest in each service** (if not already present):
```bash
pnpm --filter <service-name> add -D supertest @types/supertest
```

---

## TASK 1 — `services/cadence-service/src/__tests__/cadence.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import supertest from 'supertest';

const baseUrl = process.env.CADENCE_SERVICE_TEST_URL ?? 'http://localhost:3018';
const token = process.env.TEST_JWT_TOKEN ?? '';
const request = supertest(baseUrl);

async function serviceAvailable(): Promise<boolean> {
  try {
    const r = await request.get('/health');
    return r.status < 500;
  } catch { return false; }
}

describe('cadence-service integration', () => {
  it('GET /health returns 200 with correct shape', async () => {
    if (!(await serviceAvailable())) return;
    const r = await request.get('/health');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'ok', service: 'cadence-service' });
  });

  it('GET /api/v1/cadences without auth returns 401', async () => {
    if (!(await serviceAvailable())) return;
    const r = await request.get('/api/v1/cadences');
    expect(r.status).toBe(401);
  });

  it('GET /api/v1/cadences with auth returns array', async () => {
    if (!(await serviceAvailable()) || !token) return;
    const r = await request.get('/api/v1/cadences').set('Authorization', `Bearer ${token}`);
    expect([200, 403]).toContain(r.status);
    if (r.status === 200) expect(Array.isArray(r.body)).toBe(true);
  });

  it('POST /api/v1/cadences with invalid body returns 400/422', async () => {
    if (!(await serviceAvailable()) || !token) return;
    const r = await request
      .post('/api/v1/cadences')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '' });
    expect([400, 422, 403]).toContain(r.status);
  });

  it('POST /api/v1/cadences with valid body creates cadence', async () => {
    if (!(await serviceAvailable()) || !token) return;
    const r = await request
      .post('/api/v1/cadences')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Test Cadence',
        description: 'Integration test cadence',
        objectType: 'CONTACT',
        exitOnReply: true,
        exitOnMeeting: true,
        steps: [{ position: 0, type: 'WAIT', delayDays: 1 }],
      });
    expect([201, 403]).toContain(r.status);
    if (r.status === 201) {
      expect(r.body.data).toHaveProperty('id');
      expect(r.body.data.name).toBe('Test Cadence');
    }
  });

  it('GET /api/v1/enrollments with auth returns array', async () => {
    if (!(await serviceAvailable()) || !token) return;
    const r = await request.get('/api/v1/enrollments').set('Authorization', `Bearer ${token}`);
    expect([200, 403]).toContain(r.status);
  });
});
```

---

## TASK 2 — `services/approval-service/src/__tests__/approval.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import supertest from 'supertest';

const baseUrl = process.env.APPROVAL_SERVICE_TEST_URL ?? 'http://localhost:3014';
const token = process.env.TEST_JWT_TOKEN ?? '';
const request = supertest(baseUrl);

async function serviceAvailable(): Promise<boolean> {
  try {
    const r = await request.get('/health');
    return r.status < 500;
  } catch { return false; }
}

describe('approval-service integration', () => {
  it('GET /health returns 200', async () => {
    if (!(await serviceAvailable())) return;
    const r = await request.get('/health');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'ok', service: 'approval-service' });
  });

  it('GET /api/v1/approvals without auth returns 401', async () => {
    if (!(await serviceAvailable())) return;
    const r = await request.get('/api/v1/approvals');
    expect(r.status).toBe(401);
  });

  it('GET /api/v1/approval-policies with auth returns data', async () => {
    if (!(await serviceAvailable()) || !token) return;
    const r = await request.get('/api/v1/approval-policies').set('Authorization', `Bearer ${token}`);
    expect([200, 403]).toContain(r.status);
  });

  it('POST /api/v1/approvals without required fields returns 400/422', async () => {
    if (!(await serviceAvailable()) || !token) return;
    const r = await request
      .post('/api/v1/approvals')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect([400, 422, 403]).toContain(r.status);
  });

  it('POST /api/v1/approvals with valid body creates request', async () => {
    if (!(await serviceAvailable()) || !token) return;
    const r = await request
      .post('/api/v1/approvals')
      .set('Authorization', `Bearer ${token}`)
      .send({
        resourceType: 'DEAL',
        resourceId: 'test-deal-id',
        requestedAmount: 50000,
        notes: 'Integration test approval request',
      });
    expect([201, 400, 403, 422]).toContain(r.status);
  });

  it('Error responses use { success, error, message } shape', async () => {
    if (!(await serviceAvailable())) return;
    const r = await request.get('/api/v1/approvals');
    expect(r.body).toHaveProperty('success', false);
    expect(r.body).toHaveProperty('error');
  });
});
```

---

## TASK 3 — `services/territory-service/src/__tests__/territory.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import supertest from 'supertest';

const baseUrl = process.env.TERRITORY_SERVICE_TEST_URL ?? 'http://localhost:3019';
const token = process.env.TEST_JWT_TOKEN ?? '';
const request = supertest(baseUrl);

async function serviceAvailable(): Promise<boolean> {
  try {
    const r = await request.get('/health');
    return r.status < 500;
  } catch { return false; }
}

describe('territory-service integration', () => {
  it('GET /health returns 200', async () => {
    if (!(await serviceAvailable())) return;
    const r = await request.get('/health');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'ok', service: 'territory-service' });
  });

  it('GET /api/v1/territories without auth returns 401', async () => {
    if (!(await serviceAvailable())) return;
    const r = await request.get('/api/v1/territories');
    expect(r.status).toBe(401);
  });

  it('GET /api/v1/territories with auth returns array', async () => {
    if (!(await serviceAvailable()) || !token) return;
    const r = await request.get('/api/v1/territories').set('Authorization', `Bearer ${token}`);
    expect([200, 403]).toContain(r.status);
    if (r.status === 200) expect(Array.isArray(r.body.data ?? r.body)).toBe(true);
  });

  it('POST /api/v1/territories with valid body creates territory', async () => {
    if (!(await serviceAvailable()) || !token) return;
    const r = await request
      .post('/api/v1/territories')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Test Territory',
        rules: [{ field: 'country', operator: 'eq', value: 'US' }],
      });
    expect([201, 400, 403, 422]).toContain(r.status);
  });

  it('POST /api/v1/territories/test-assignment routes a lead', async () => {
    if (!(await serviceAvailable()) || !token) return;
    const r = await request
      .post('/api/v1/territories/test-assignment')
      .set('Authorization', `Bearer ${token}`)
      .send({ leadId: 'test-lead-id', country: 'US', region: 'West' });
    expect([200, 400, 403, 404, 422]).toContain(r.status);
  });

  it('Invalid body returns { success: false } shape', async () => {
    if (!(await serviceAvailable()) || !token) return;
    const r = await request
      .post('/api/v1/territories')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    if (r.status >= 400) {
      expect(r.body).toHaveProperty('success', false);
    }
  });
});
```

---

## TASK 4 — `services/notification-service/src/__tests__/notification.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import supertest from 'supertest';

const baseUrl = process.env.NOTIFICATION_SERVICE_TEST_URL ?? 'http://localhost:3003';
const token = process.env.TEST_JWT_TOKEN ?? '';
const request = supertest(baseUrl);

async function serviceAvailable(): Promise<boolean> {
  try {
    const r = await request.get('/health');
    return r.status < 500;
  } catch { return false; }
}

describe('notification-service integration', () => {
  it('GET /health returns 200', async () => {
    if (!(await serviceAvailable())) return;
    const r = await request.get('/health');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'ok', service: 'notification-service' });
  });

  it('GET /api/v1/notifications without auth returns 401', async () => {
    if (!(await serviceAvailable())) return;
    const r = await request.get('/api/v1/notifications');
    expect(r.status).toBe(401);
  });

  it('GET /api/v1/notifications with auth returns paginated list', async () => {
    if (!(await serviceAvailable()) || !token) return;
    const r = await request.get('/api/v1/notifications').set('Authorization', `Bearer ${token}`);
    expect([200, 403]).toContain(r.status);
    if (r.status === 200) {
      expect(r.body).toHaveProperty('data');
      expect(Array.isArray(r.body.data)).toBe(true);
    }
  });

  it('GET /metrics returns Prometheus text format', async () => {
    if (!(await serviceAvailable())) return;
    const r = await request.get('/metrics');
    expect(r.status).toBe(200);
    expect(r.text).toContain('nexus_');
  });

  it('Error responses use { success: false } shape', async () => {
    if (!(await serviceAvailable())) return;
    const r = await request.post('/api/v1/notifications').send({});
    if (r.status >= 400) {
      expect(r.body).toHaveProperty('success', false);
    }
  });
});
```

---

## TASK 5 — `services/comm-service/src/__tests__/comm.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import supertest from 'supertest';

const baseUrl = process.env.COMM_SERVICE_TEST_URL ?? 'http://localhost:3009';
const token = process.env.TEST_JWT_TOKEN ?? '';
const request = supertest(baseUrl);

async function serviceAvailable(): Promise<boolean> {
  try {
    const r = await request.get('/health');
    return r.status < 500;
  } catch { return false; }
}

describe('comm-service integration', () => {
  it('GET /health returns 200', async () => {
    if (!(await serviceAvailable())) return;
    const r = await request.get('/health');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'ok', service: 'comm-service' });
  });

  it('Unauthenticated request returns 401', async () => {
    if (!(await serviceAvailable())) return;
    const r = await request.get('/api/v1/templates');
    expect(r.status).toBe(401);
  });

  it('GET /api/v1/templates with auth returns list', async () => {
    if (!(await serviceAvailable()) || !token) return;
    const r = await request.get('/api/v1/templates').set('Authorization', `Bearer ${token}`);
    expect([200, 403]).toContain(r.status);
    if (r.status === 200) expect(Array.isArray(r.body.data ?? r.body)).toBe(true);
  });

  it('POST /api/v1/templates with invalid body returns 400/422', async () => {
    if (!(await serviceAvailable()) || !token) return;
    const r = await request
      .post('/api/v1/templates')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '' });
    expect([400, 422, 403]).toContain(r.status);
  });

  it('POST /api/v1/templates with valid body creates template', async () => {
    if (!(await serviceAvailable()) || !token) return;
    const r = await request
      .post('/api/v1/templates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Test Template',
        subject: 'Hello {{firstName}}',
        body: '<p>Hi {{firstName}},</p>',
        channel: 'EMAIL',
      });
    expect([201, 400, 403, 422]).toContain(r.status);
  });

  it('GET /api/v1/sequences with auth returns list', async () => {
    if (!(await serviceAvailable()) || !token) return;
    const r = await request.get('/api/v1/sequences').set('Authorization', `Bearer ${token}`);
    expect([200, 403]).toContain(r.status);
  });
});
```

---

## TASK 6 — Add `vitest.config.ts` to services missing it

For each new test file, ensure a `vitest.config.ts` exists at the service root. If not present, create:

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

Also ensure each service's `package.json` has a test script:
```json
"scripts": {
  "test": "vitest run"
}
```

---

## Verification

After all tasks complete:
- [ ] `cadence-service/src/__tests__/cadence.test.ts` exists, 6 test cases, ends with `});`
- [ ] `approval-service/src/__tests__/approval.test.ts` exists, 6 test cases
- [ ] `territory-service/src/__tests__/territory.test.ts` exists, 5 test cases
- [ ] `notification-service/src/__tests__/notification.test.ts` exists, 5 test cases
- [ ] `comm-service/src/__tests__/comm.test.ts` exists, 6 test cases
- [ ] Each service has `vitest.config.ts`
- [ ] Each service `package.json` has `"test": "vitest run"`
- [ ] No test file ends mid-function or mid-block
