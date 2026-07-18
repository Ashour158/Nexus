import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createService, globalErrorHandler } from '@nexus/service-utils';
import { registerDealsRoutes } from '../routes/deals.routes.js';

vi.mock('@nexus/cache', () => ({
  getSharedCache: () => ({
    cacheAside: async <T>(
      _key: string,
      factory: () => Promise<T>
    ): Promise<T> => factory(),
    invalidatePattern: vi.fn(),
  }),
}));

const JWT_SECRET = '12345678901234567890123456789012';

const prisma = {
  deal: {
    count: vi.fn().mockResolvedValue(0),
    findMany: vi.fn().mockResolvedValue([]),
  },
};

const producer = {
  publish: vi.fn().mockResolvedValue(undefined),
};

let app: FastifyInstance;
let token: string;

beforeAll(async () => {
  vi.stubEnv('AUTH_JWKS_URL', '');
  vi.stubEnv('REDIS_URL', '');

  app = await createService({
    name: 'crm-service',
    port: 3001,
    jwtSecret: JWT_SECRET,
    corsOrigins: ['http://localhost:3000'],
  });
  app.setErrorHandler(globalErrorHandler);
  await registerDealsRoutes(app, prisma as never, producer as never);
  await app.ready();

  token = app.jwt.sign({
    sub: 'usr_test',
    tenantId: 'tenant_test',
    email: 'test@example.com',
    roles: ['ADMIN'],
    permissions: ['*'],
  });
});

afterAll(async () => {
  await app.close();
  vi.unstubAllEnvs();
});

describe('GET /api/v1/deals', () => {
  it('returns a tenant-scoped list for an authenticated caller', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/deals',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: { data: [], total: 0 },
    });
    expect(prisma.deal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant_test' }),
      })
    );
  });

  it('rejects requests without a bearer token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/deals',
    });

    expect(res.statusCode).toBe(401);
  });
});
