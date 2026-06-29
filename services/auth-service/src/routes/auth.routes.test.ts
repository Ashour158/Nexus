import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerAuthRoutes } from './auth.js';
import { JwksKeyStore } from '../lib/jwt.js';

function createMockPrisma() {
  return {
    tenant: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    user: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
    },
    session: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    role: {
      findFirst: vi.fn(),
    },
    userRole: {
      create: vi.fn(),
    },
    $transaction: vi.fn(async (fn: unknown) => (typeof fn === 'function' ? fn() : fn)),
    $disconnect: vi.fn(),
  };
}

function createTestApp(prisma: ReturnType<typeof createMockPrisma>, keyStore: JwksKeyStore) {
  const app = Fastify();
  registerAuthRoutes(app, prisma as any, keyStore, null as any);
  return app;
}

describe('auth routes', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let keyStore: JwksKeyStore;

  beforeEach(() => {
    prisma = createMockPrisma();
    keyStore = new JwksKeyStore();
  });

  it('POST /api/v1/auth/login missing body returns 400', async () => {
    const app = createTestApp(prisma, keyStore);
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: {} });
    expect([400, 422]).toContain(res.statusCode);
  });

  it('POST /api/v1/auth/refresh missing body returns 400', async () => {
    const app = createTestApp(prisma, keyStore);
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: {} });
    expect([400, 422]).toContain(res.statusCode);
  });

  it('POST /api/v1/auth/forgot-password returns message', async () => {
    const app = createTestApp(prisma, keyStore);
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/forgot-password', payload: { email: 'test@example.com' } });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.data.message).toContain('password reset');
  });
});
