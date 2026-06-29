import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerRolesRoutes } from './roles.js';
import { roleFactory } from '../test/factories/role.factory.js';

function createMockPrisma() {
  return {
    role: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(async (fn: unknown) => (typeof fn === 'function' ? fn() : fn)),
    $disconnect: vi.fn(),
  };
}

function createTestApp(prisma: ReturnType<typeof createMockPrisma>) {
  const app = Fastify();
  app.addHook('preHandler', async (request) => {
    (request as any).user = { tenantId: 'ten_test', sub: 'usr_test', email: 'test@example.com', roles: ['ADMIN'], permissions: ['*'] };
  });
  registerRolesRoutes(app, prisma as any);
  return app;
}

describe('roles routes', () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
  });

  it('GET /api/v1/roles returns paginated list', async () => {
    const app = createTestApp(prisma);
    prisma.role.count.mockResolvedValue(0);
    prisma.role.findMany.mockResolvedValue([]);

    const res = await app.inject({ method: 'GET', url: '/api/v1/roles' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.data.data).toEqual([]);
  });

  it('GET /api/v1/roles/permissions/matrix returns permissions', async () => {
    const app = createTestApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/api/v1/roles/permissions/matrix' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.permissions)).toBe(true);
  });

  it('POST /api/v1/roles creates role', async () => {
    const app = createTestApp(prisma);
    const role = roleFactory();
    prisma.role.create.mockResolvedValue(role);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/roles',
      payload: { name: 'Test Role', permissions: ['users:read'] },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
  });
});
