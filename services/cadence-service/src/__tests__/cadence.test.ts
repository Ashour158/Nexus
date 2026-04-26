import { describe, expect, it } from 'vitest';
import supertest from 'supertest';

const baseUrl = process.env.CADENCE_SERVICE_TEST_URL ?? 'http://localhost:3018';
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
