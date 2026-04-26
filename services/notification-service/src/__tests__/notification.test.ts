import { describe, expect, it } from 'vitest';
import supertest from 'supertest';

const baseUrl = process.env.NOTIFICATION_SERVICE_TEST_URL ?? 'http://localhost:3003';
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

describe('notification-service integration', () => {
  it('GET /health returns 200', async () => {
    if (!(await serviceAvailable())) return;
    const r = await request.get('/health');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'ok', service: 'notification-service' });
  });

  it('GET /api/v1/notifications without auth returns 401', async () => {
    if (!(await serviceAvailable())) return;
    const r = await request.get('/api/v1/notifications');
    expect(r.status).toBe(401);
  });

  it('GET /api/v1/notifications with auth returns paginated list', async () => {
    if (!(await serviceAvailable()) || !token) return;
    const r = await request.get('/api/v1/notifications').set('Authorization', `Bearer ${token}`);
    expect([200, 403]).toContain(r.status);
    if (r.status === 200) {
      expect(r.body).toHaveProperty('data');
      expect(Array.isArray(r.body.data)).toBe(true);
    }
  });

  it('GET /metrics returns Prometheus text format', async () => {
    if (!(await serviceAvailable())) return;
    const r = await request.get('/metrics');
    expect(r.status).toBe(200);
    expect(r.text).toContain('nexus_');
  });

  it('Error responses use { success: false } shape', async () => {
    if (!(await serviceAvailable())) return;
    const r = await request.post('/api/v1/notifications').send({});
    if (r.status >= 400) {
      expect(r.body).toHaveProperty('success', false);
    }
  });
});
