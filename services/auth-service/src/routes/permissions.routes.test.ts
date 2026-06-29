import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerPermissionsRoutes } from './permissions.routes.js';

function createMockPrisma() {
  return {
    user: {
      findFirst: vi.fn(),
    },
    userRole: {
      findMany: vi.fn(),
    },
    role: {
      findMany: vi.fn(),
    },
    $disconnect: vi.fn(),
  };
}

function createTestApp(prisma: ReturnType<typeof createMockPrisma>) {
  const app = Fastify();
  app.addHook('preHandler', async (request) => {
    (request as any).user = { tenantId: 'ten_test', sub: 'usr_test', email: 'test@example.com', roles: ['ADMIN'], permissions: ['*'] };
  });
  registerPermissionsRoutes(app, prisma as any);
  return app;
}

describe('permissions routes', () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
  });

  it('GET /api/v1/users/:id/permissions returns permissions', async () => {
    const app = createTestApp(prisma);
    prisma.user.findFirst.mockResolvedValue({
      id: 'usr_test',
      tenantId: 'ten_test',
      userRoles: [{ role: { name: 'ADMIN', permissions: ['*'] } }],
    });

    const res = await app.inject({ method: 'GET', url: '/api/v1/users/usr_test/permissions' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });
});
