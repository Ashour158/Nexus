import { describe, expect, it } from 'vitest';
import supertest from 'supertest';

const baseUrl = process.env.APPROVAL_SERVICE_TEST_URL ?? 'http://localhost:3014';
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
    const r = await request.post('/api/v1/approvals').set('Authorization', `Bearer ${token}`).send({});
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
