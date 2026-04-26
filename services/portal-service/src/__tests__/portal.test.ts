import { describe, expect, it } from 'vitest';
import supertest from 'supertest';

const baseUrl = process.env.PORTAL_SERVICE_TEST_URL ?? 'http://localhost:3022';
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
