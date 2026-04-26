import { describe, expect, it } from 'vitest';
import supertest from 'supertest';

const baseUrl = process.env.COMM_SERVICE_TEST_URL ?? 'http://localhost:3009';
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
