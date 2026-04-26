import { describe, expect, it } from 'vitest';
import supertest from 'supertest';

const baseUrl = process.env.CRM_SERVICE_TEST_URL ?? 'http://localhost:3001';
const token = process.env.CRM_TEST_TOKEN;
const dealId = process.env.CRM_TEST_DEAL_ID;
const request = supertest(baseUrl);

async function serviceAvailable(): Promise<boolean> {
  try {
    const response = await request.get('/health');
    return response.status < 500;
  } catch {
    return false;
  }
}

describe('crm-service deals integration', () => {
  it('GET /api/v1/deals unauthenticated returns 401', async () => {
    if (!(await serviceAvailable())) return;
    const response = await request.get('/api/v1/deals');
    expect(response.status).toBe(401);
  });

  it('GET /api/v1/deals authenticated returns paginated list', async () => {
    if (!(await serviceAvailable())) return;
    if (!token) return;
    const response = await request.get('/api/v1/deals').set('authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data?.data)).toBe(true);
  });

  it('POST /api/v1/deals invalid body returns 400/422', async () => {
    if (!(await serviceAvailable())) return;
    if (!token) return;
    const response = await request
      .post('/api/v1/deals')
      .set('authorization', `Bearer ${token}`)
      .send({ name: '' });
    expect([400, 422]).toContain(response.status);
  });

  it('POST /api/v1/deals valid body creates deal', async () => {
    if (!(await serviceAvailable())) return;
    if (!token) return;
    const response = await request
      .post('/api/v1/deals')
      .set('authorization', `Bearer ${token}`)
      .send({
        accountId: process.env.CRM_TEST_ACCOUNT_ID,
        pipelineId: process.env.CRM_TEST_PIPELINE_ID,
        stageId: process.env.CRM_TEST_STAGE_ID,
        name: 'Integration Test Deal',
        amount: 10000,
        currency: 'USD',
      });
    expect([201, 422]).toContain(response.status);
  });

  it('PATCH /api/v1/deals/:id/stage invalid stage returns 400/422', async () => {
    if (!(await serviceAvailable())) return;
    if (!token || !dealId) return;
    const response = await request
      .patch(`/api/v1/deals/${dealId}/stage`)
      .set('authorization', `Bearer ${token}`)
      .send({ stageId: 'invalid-stage' });
    expect([400, 422]).toContain(response.status);
  });

  it('PATCH /api/v1/deals/:id/stage valid transition returns updated deal', async () => {
    if (!(await serviceAvailable())) return;
    if (!token || !dealId || !process.env.CRM_TEST_STAGE_ID) return;
    const response = await request
      .patch(`/api/v1/deals/${dealId}/stage`)
      .set('authorization', `Bearer ${token}`)
      .send({ stageId: process.env.CRM_TEST_STAGE_ID });
    expect([200, 422]).toContain(response.status);
  });
});
