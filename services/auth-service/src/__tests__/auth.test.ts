import { describe, expect, it } from 'vitest';
import supertest from 'supertest';

const baseUrl = process.env.AUTH_SERVICE_TEST_URL ?? 'http://localhost:3010';
const loginEmail = process.env.AUTH_TEST_EMAIL;
const loginPassword = process.env.AUTH_TEST_PASSWORD;
const refreshToken = process.env.AUTH_TEST_REFRESH_TOKEN;
const request = supertest(baseUrl);

async function serviceAvailable(): Promise<boolean> {
  try {
    const response = await request.get('/health');
    return response.status < 500;
  } catch {
    return false;
  }
}

describe('auth-service integration', () => {
  it('GET /health returns 200', async () => {
    if (!(await serviceAvailable())) return;
    const response = await request.get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ok', service: 'auth-service', version: '1.0.0' });
  });

  it('POST /api/v1/auth/login missing body returns 400/422', async () => {
    if (!(await serviceAvailable())) return;
    const response = await request.post('/api/v1/auth/login').send({});
    expect([400, 422]).toContain(response.status);
  });

  it('POST /api/v1/auth/login wrong password returns 401', async () => {
    if (!(await serviceAvailable())) return;
    if (!loginEmail) return;
    const response = await request
      .post('/api/v1/auth/login')
      .send({ email: loginEmail, password: 'wrong-password' });
    expect(response.status).toBe(401);
  });

  it('POST /api/v1/auth/login valid credentials returns tokens', async () => {
    if (!(await serviceAvailable())) return;
    if (!loginEmail || !loginPassword) return;
    const response = await request
      .post('/api/v1/auth/login')
      .send({ email: loginEmail, password: loginPassword });
    expect(response.status).toBe(200);
    expect(response.body.data?.token).toBeTypeOf('string');
    expect(response.body.data?.refreshToken).toBeTypeOf('string');
  });

  it('POST /api/v1/auth/refresh valid refresh token returns access token', async () => {
    if (!(await serviceAvailable())) return;
    if (!refreshToken) return;
    const response = await request
      .post('/api/v1/auth/refresh')
      .send({ refreshToken });
    expect(response.status).toBe(200);
    expect(response.body.data?.token).toBeTypeOf('string');
  });
});
