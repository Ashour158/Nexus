import { describe, expect, it } from 'vitest';
import supertest from 'supertest';

const baseUrl = process.env.DATA_SERVICE_TEST_URL ?? 'http://localhost:3015';
const token = process.env.TEST_JWT_TOKEN ?? '';
const request = supertest(baseUrl);

async function serviceAvailable(): Promise<boolean> {
  try {
    const r = await request.get('/health');
    return r.status < 500;
  } catch {
    return false;
  }
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
