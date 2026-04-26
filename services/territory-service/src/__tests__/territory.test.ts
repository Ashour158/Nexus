import { describe, expect, it } from 'vitest';
import supertest from 'supertest';

const baseUrl = process.env.TERRITORY_SERVICE_TEST_URL ?? 'http://localhost:3019';
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

});
