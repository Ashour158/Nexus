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

function createTestApp(prisma: ReturnType<typeof createMockPrisma>) {
  const app = Fastify();
  app.addHook('preHandler', async (request) => {
    (request as any).user = { tenantId: 'ten_test', sub: 'usr_test', email: 'test@example.com', roles: ['ADMIN'], permissions: ['*'] };
  });
  registerUsersRoutes(app, prisma as any, { log: async () => {} } as any);
  return app;
}

describe('users routes', () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
  });

  it('GET /api/v1/users returns paginated list', async () => {
    const app = createTestApp(prisma);
    prisma.user.count.mockResolvedValue(0);
    prisma.user.findMany.mockResolvedValue([]);

    const res = await app.inject({ method: 'GET', url: '/api/v1/users' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.data.data).toEqual([]);
  });

  it('GET /api/v1/users/:id returns user', async () => {
    const app = createTestApp(prisma);
    const user = userFactory();
    prisma.user.findFirst.mockResolvedValue(user);

    const res = await app.inject({ method: 'GET', url: '/api/v1/users/usr_123' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(user.id);
  });

  it('GET /api/v1/users/:id/availability returns slots', async () => {
    const app = createTestApp(prisma);
    const user = userFactory({ isActive: true, email: 'test@example.com' });
    prisma.user.findFirst.mockResolvedValue(user);

    const res = await app.inject({ method: 'GET', url: '/api/v1/users/test/availability' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.slots)).toBe(true);
  });
});
