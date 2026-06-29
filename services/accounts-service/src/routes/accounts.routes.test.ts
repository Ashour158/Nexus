import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerRoutes } from './index.js';

function createMockPrisma() {
  return {
    account: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
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

describe('accounts routes', () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
  });

  it('GET /api/v1/accounts returns paginated list', async () => {
    const app = createTestApp(prisma);
    prisma.account.findMany.mockResolvedValue([]);
    prisma.account.count.mockResolvedValue(0);

    const res = await app.inject({ method: 'GET', url: '/api/v1/accounts' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.data.data).toEqual([]);
    expect(body.data.total).toBe(0);
    expect(body.data.page).toBe(1);
  });

  it('GET /api/v1/accounts/:id returns account for existing id', async () => {
    const app = createTestApp(prisma);
    const account = { id: CUID, name: 'Test Account', tenantId: 'ten_test' };
    prisma.account.findFirst.mockResolvedValue(account);

    const res = await app.inject({ method: 'GET', url: `/api/v1/accounts/${CUID}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(account.id);
  });

  it('GET /api/v1/accounts/:id returns 404 for missing id', async () => {
    const app = createTestApp(prisma);
    prisma.account.findFirst.mockResolvedValue(null);

    const res = await app.inject({ method: 'GET', url: `/api/v1/accounts/${CUID}` });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
    expect(body.error.message).toBe('Account not found');
  });

  it('POST /api/v1/accounts creates an account and returns 201', async () => {
    const app = createTestApp(prisma);
    const account = { id: CUID, name: 'New Account', tenantId: 'ten_test' };
    prisma.account.create.mockResolvedValue(account);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/accounts',
      payload: { name: 'New Account', ownerId: CUID },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(account.id);
  });

  it('PATCH /api/v1/accounts/:id updates an account and returns 200', async () => {
    const app = createTestApp(prisma);
    const account = { id: CUID, name: 'Updated Account', tenantId: 'ten_test' };
    prisma.account.update.mockResolvedValue(account);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/accounts/${CUID}`,
      payload: { name: 'Updated Account' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.data.name).toBe(account.name);
  });

  it('DELETE /api/v1/accounts/:id deletes an account and returns 200', async () => {
    const app = createTestApp(prisma);
    prisma.account.update.mockResolvedValue({ id: CUID });

    const res = await app.inject({ method: 'DELETE', url: `/api/v1/accounts/${CUID}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.data.deleted).toBe(true);
  });
});
