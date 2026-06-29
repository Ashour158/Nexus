import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerQuotesRoutes } from './quotes.routes.js';
import { quoteFactory } from '../test/factories/quote.factory.js';

function createMockPrisma() {
  return {
    quote: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    product: {
      findFirst: vi.fn(),
    },
    promoCode: {
      findFirst: vi.fn(),
    },
    approvalRequest: {
      create: vi.fn(),
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
  registerQuotesRoutes(app, prisma as any, producer as any);
  return app;
}

describe('quotes routes', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let producer: ReturnType<typeof createMockProducer>;

  beforeEach(() => {
    prisma = createMockPrisma();
    producer = createMockProducer();
  });

  it('GET /api/v1/quotes returns paginated list', async () => {
    const app = createTestApp(prisma, producer);
    prisma.quote.count.mockResolvedValue(0);
    prisma.quote.findMany.mockResolvedValue([]);

    const res = await app.inject({ method: 'GET', url: '/api/v1/quotes' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.data.data).toEqual([]);
  });

  it('POST /api/v1/quotes invalid body returns 400', async () => {
    const app = createTestApp(prisma, producer);
    const res = await app.inject({ method: 'POST', url: '/api/v1/quotes', payload: { dealId: '' } });
    expect([400, 422]).toContain(res.statusCode);
  });

  it('GET /api/v1/quotes/:id returns quote', async () => {
    const app = createTestApp(prisma, producer);
    prisma.quote.findFirst.mockResolvedValue(quoteFactory());

    const res = await app.inject({ method: 'GET', url: '/api/v1/quotes/quo_test' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.data.id).toBeDefined();
  });
});
