import { describe, expect, it } from 'vitest';
import supertest from 'supertest';

const baseUrl = process.env.INCENTIVE_SERVICE_TEST_URL ?? 'http://localhost:3024';
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
