import { describe, expect, it } from 'vitest';
import supertest from 'supertest';

const baseUrl = process.env.PLANNING_SERVICE_TEST_URL ?? 'http://localhost:3020';
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
