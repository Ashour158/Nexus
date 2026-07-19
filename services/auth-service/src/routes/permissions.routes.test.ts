import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerPermissionsRoutes } from './permissions.routes.js';

// NexusCache is Redis-backed; without a broker every cacheAside() call rejects
// and the route 500s. The unit under test is the route + permission
// resolution, so replace the cache with a pass-through.
vi.mock('@nexus/cache', () => ({
  NexusCache: vi.fn(() => ({
    cacheAside: vi.fn(
      async (_key: string, factory: () => Promise<unknown>) => factory()
    ),
    disconnect: vi.fn().mockResolvedValue(undefined),
  })),
}));

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

async function createTestApp(prisma: ReturnType<typeof createMockPrisma>) {
  const app = Fastify();
  app.addHook('preHandler', async (request) => {
    (request as any).user = { tenantId: 'ten_test', sub: 'usr_test', email: 'test@example.com', roles: ['ADMIN'], permissions: ['*'] };
  });
  // Awaited so avvio finishes loading the plugin before inject() boots the app.
  await registerPermissionsRoutes(app, prisma as any);
  return app;
}

describe('permissions routes', () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
  });

  it('GET /api/v1/users/:id/permissions returns permissions', async () => {
    const app = await createTestApp(prisma);
    // IdParamSchema requires a cuid — an id like 'usr_test' fails validation.
    const userId = 'clw0000000000000000000001';
    prisma.user.findFirst.mockResolvedValue({
      id: userId,
      tenantId: 'ten_test',
      userRoles: [{ role: { name: 'ADMIN', permissions: ['*'] } }],
    });

    const res = await app.inject({ method: 'GET', url: `/api/v1/users/${userId}/permissions` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });
});
