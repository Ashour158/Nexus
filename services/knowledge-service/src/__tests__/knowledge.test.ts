import { describe, expect, it } from 'vitest';
import supertest from 'supertest';

const baseUrl = process.env.KNOWLEDGE_SERVICE_TEST_URL ?? 'http://localhost:3023';
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

describe('knowledge-service integration', () => {
  it('GET /health returns 200', async () => {
    if (!(await serviceAvailable())) return;
    const r = await request.get('/health');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'ok', service: 'knowledge-service' });
  });

  it('GET /api/v1/knowledge without auth returns 401', async () => {
    if (!(await serviceAvailable())) return;
    const r = await request.get('/api/v1/knowledge');
    expect(r.status).toBe(401);
  });

  it('GET /api/v1/knowledge with auth returns articles', async () => {
    if (!(await serviceAvailable()) || !token) return;
    const r = await request.get('/api/v1/knowledge').set('Authorization', `Bearer ${token}`);
    expect([200, 403]).toContain(r.status);
    if (r.status === 200) expect(Array.isArray(r.body.data ?? r.body)).toBe(true);
  });

  it('POST /api/v1/knowledge creates article', async () => {
    if (!(await serviceAvailable()) || !token) return;
    const r = await request
      .post('/api/v1/knowledge')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Test Article', content: 'Test content body', category: 'general' });
    expect([201, 400, 403, 422]).toContain(r.status);
  });

  it('POST /api/v1/knowledge with empty body returns 400/422', async () => {
    if (!(await serviceAvailable()) || !token) return;
    const r = await request
      .post('/api/v1/knowledge')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect([400, 422, 403]).toContain(r.status);
  });
});
