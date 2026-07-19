import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerDealsRoutes } from './deals.routes.js';
import { dealFactory } from '../test/factories/deal.factory.js';

vi.mock('@nexus/cache', () => ({
  getSharedCache: () => ({
    cacheAside: async <T>(
      _key: string,
      factory: () => Promise<T>
    ): Promise<T> => factory(),
    invalidatePattern: vi.fn(),
  }),
}));

const DEAL_ID = 'cdeal000000000000000001';

function createMockPrisma() {
  return {
    deal: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    account: {
      findFirst: vi.fn(),
    },
    contact: {
      findFirst: vi.fn(),
    },
    activity: {
      create: vi.fn(),
    },
    orgWideDefault: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    sharingRule: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    $transaction: vi.fn(async (fn: unknown) => (typeof fn === 'function' ? fn() : fn)),
    $disconnect: vi.fn(),
  };
}

function createMockProducer() {
  return {
    publish: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
}

function createTestApp(prisma: ReturnType<typeof createMockPrisma>, producer: ReturnType<typeof createMockProducer>) {
  const app = Fastify();
  app.addHook('preHandler', async (request) => {
    (request as any).user = { tenantId: 'ten_test', sub: 'usr_test', email: 'test@example.com', roles: ['ADMIN'], permissions: ['*'] };
  });
  registerDealsRoutes(app, prisma as any, producer as any);
  return app;
}

describe('deals routes', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let producer: ReturnType<typeof createMockProducer>;

  beforeEach(() => {
    prisma = createMockPrisma();
    producer = createMockProducer();
  });

  it('GET /api/v1/deals returns paginated list', async () => {
    const app = createTestApp(prisma, producer);
    prisma.deal.count.mockResolvedValue(0);
    prisma.deal.findMany.mockResolvedValue([]);

    const res = await app.inject({ method: 'GET', url: '/api/v1/deals' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.data.data).toEqual([]);
  });

  it('POST /api/v1/deals invalid body returns 400', async () => {
    const app = createTestApp(prisma, producer);
    const res = await app.inject({ method: 'POST', url: '/api/v1/deals', payload: { name: '' } });
    expect([400, 422]).toContain(res.statusCode);
  });

  it('GET /api/v1/deals/:id returns deal', async () => {
    const app = createTestApp(prisma, producer);
    prisma.deal.findFirst.mockResolvedValue(dealFactory({ id: DEAL_ID }));

    const res = await app.inject({ method: 'GET', url: `/api/v1/deals/${DEAL_ID}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.data.id).toBeDefined();
  });
});
