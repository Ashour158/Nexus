import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerUsersRoutes } from './users.routes.js';
import { userFactory } from '../test/factories/user.factory.js';

function createMockPrisma() {
  return {
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    userRole: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    role: {
      findMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(async (fn: unknown) => (typeof fn === 'function' ? fn() : fn)),
    $disconnect: vi.fn(),
  };
}

async function createTestApp(prisma: ReturnType<typeof createMockPrisma>) {
  const app = Fastify();
  app.addHook('preHandler', async (request) => {
    (request as any).user = { tenantId: 'ten_test', sub: 'usr_test', email: 'test@example.com', roles: ['ADMIN'], permissions: ['*'] };
  });
  // Must be awaited: registerUsersRoutes awaits app.register() internally and
  // registers another route after that await. Left un-awaited it races avvio's
  // boot from app.inject() and the instance never becomes ready (inject hangs).
  await registerUsersRoutes(app, prisma as any, { log: async () => {} } as any);
  return app;
}

describe('users routes', () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
  });

  it('GET /api/v1/users returns paginated list', async () => {
    const app = await createTestApp(prisma);
    prisma.user.count.mockResolvedValue(0);
    prisma.user.findMany.mockResolvedValue([]);

    const res = await app.inject({ method: 'GET', url: '/api/v1/users' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.data.data).toEqual([]);
  });

  it('GET /api/v1/users/:id returns user', async () => {
    const app = await createTestApp(prisma);
    // IdParamSchema requires a cuid — an id like 'usr_123' fails validation.
    const user = userFactory({ id: 'clw0000000000000000000000' });
    prisma.user.findFirst.mockResolvedValue(user);

    const res = await app.inject({ method: 'GET', url: `/api/v1/users/${user.id}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(user.id);
  });

  it('GET /api/v1/users/:id/availability returns slots', async () => {
    const app = await createTestApp(prisma);
    const user = userFactory({ isActive: true, email: 'test@example.com' });
    prisma.user.findFirst.mockResolvedValue(user);

    const res = await app.inject({ method: 'GET', url: '/api/v1/users/test/availability' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.slots)).toBe(true);
  });
});
