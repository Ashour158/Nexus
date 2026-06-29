import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerRoutes } from './index.js';

function createMockPrisma() {
  return {
    quote: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    dealRoom: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    $disconnect: vi.fn(),
  };
}

function createTestApp(prisma: ReturnType<typeof createMockPrisma>) {
  const app = Fastify();
  app.addHook('preHandler', async (request) => {
    (request as any).user = { tenantId: 'ten_test', sub: 'usr_test', email: 'test@example.com', roles: ['ADMIN'], permissions: ['*'] };
  });
  app.setErrorHandler(async (err, _request, reply) => {
    if ((err as any).code === 'VALIDATION_ERROR' || err.name === 'ZodError') {
      return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: err.message } });
    }
    return reply.code(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } });
  });
  registerRoutes(app, prisma as any);
  return app;
}

const CUID = 'cku9wm5i20001l5k0k3k4k5k';

describe('quotes routes', () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
  });

  it('GET /api/v1/quotes returns paginated list', async () => {
    const app = createTestApp(prisma);
    prisma.quote.findMany.mockResolvedValue([]);
    prisma.quote.count.mockResolvedValue(0);

    const res = await app.inject({ method: 'GET', url: '/api/v1/quotes' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.data.data).toEqual([]);
    expect(body.data.total).toBe(0);
    expect(body.data.page).toBe(1);
  });

  it('GET /api/v1/quotes filters by dealId', async () => {
    const app = createTestApp(prisma);
    prisma.quote.findMany.mockResolvedValue([]);
    prisma.quote.count.mockResolvedValue(0);

    const res = await app.inject({ method: 'GET', url: `/api/v1/quotes?dealId=${CUID}` });
    expect(res.statusCode).toBe(200);
    expect(prisma.quote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ dealId: CUID }),
      })
    );
  });

  it('GET /api/v1/quotes/:id returns quote for existing id', async () => {
    const app = createTestApp(prisma);
    const quote = { id: CUID, name: 'Test Quote', tenantId: 'ten_test' };
    prisma.quote.findFirst.mockResolvedValue(quote);

    const res = await app.inject({ method: 'GET', url: `/api/v1/quotes/${CUID}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(quote.id);
  });

  it('GET /api/v1/quotes/:id returns 404 for missing id', async () => {
    const app = createTestApp(prisma);
    prisma.quote.findFirst.mockResolvedValue(null);

    const res = await app.inject({ method: 'GET', url: `/api/v1/quotes/${CUID}` });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
    expect(body.error.message).toBe('Quote not found');
  });

  it('POST /api/v1/quotes disables deprecated quote creation writes', async () => {
    const app = createTestApp(prisma);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/quotes',
      payload: {
        dealId: CUID,
        ownerId: CUID,
        accountId: CUID,
        name: 'New Quote',
        items: [{ productId: CUID, quantity: 1 }],
      },
    });
    expect(res.statusCode).toBe(410);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
    expect(body.error.message).toBe('Quote mutations have moved to finance-service authority.');
    expect(body.error.migration).toContain('finance-service');
    expect(prisma.quote.create).not.toHaveBeenCalled();
  });

  it('PATCH /api/v1/quotes/:id disables deprecated quote update writes', async () => {
    const app = createTestApp(prisma);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/quotes/${CUID}`,
      payload: { name: 'Updated Quote' },
    });
    expect(res.statusCode).toBe(410);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
    expect(body.error.message).toBe('Quote mutations have moved to finance-service authority.');
    expect(prisma.quote.update).not.toHaveBeenCalled();
  });

  it('DELETE /api/v1/quotes/:id disables deprecated quote delete writes', async () => {
    const app = createTestApp(prisma);

    const res = await app.inject({ method: 'DELETE', url: `/api/v1/quotes/${CUID}` });
    expect(res.statusCode).toBe(410);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
    expect(body.error.message).toBe('Quote mutations have moved to finance-service authority.');
    expect(prisma.quote.update).not.toHaveBeenCalled();
  });

  it('GET /api/v1/deal-rooms returns list of deal rooms', async () => {
    const app = createTestApp(prisma);
    prisma.dealRoom.findMany.mockResolvedValue([]);

    const res = await app.inject({ method: 'GET', url: '/api/v1/deal-rooms' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('GET /api/v1/deal-rooms/:id returns deal room for existing id', async () => {
    const app = createTestApp(prisma);
    const room = { id: CUID, name: 'Test Room', items: [], documents: [] };
    prisma.dealRoom.findFirst.mockResolvedValue(room);

    const res = await app.inject({ method: 'GET', url: `/api/v1/deal-rooms/${CUID}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(room.id);
  });

  it('GET /api/v1/deal-rooms/:id returns 404 for missing id', async () => {
    const app = createTestApp(prisma);
    prisma.dealRoom.findFirst.mockResolvedValue(null);

    const res = await app.inject({ method: 'GET', url: `/api/v1/deal-rooms/${CUID}` });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
    expect(body.error.message).toBe('Deal room not found');
  });
});
