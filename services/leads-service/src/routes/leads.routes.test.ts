import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerRoutes } from './index.js';

function createMockPrisma() {
  return {
    lead: {
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

describe('leads routes', () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
  });

  it('GET /api/v1/leads returns paginated list', async () => {
    const app = createTestApp(prisma);
    prisma.lead.findMany.mockResolvedValue([]);
    prisma.lead.count.mockResolvedValue(0);

    const res = await app.inject({ method: 'GET', url: '/api/v1/leads' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.data.data).toEqual([]);
    expect(body.data.total).toBe(0);
    expect(body.data.page).toBe(1);
  });

  it('GET /api/v1/leads/:id returns lead for existing id', async () => {
    const app = createTestApp(prisma);
    const lead = { id: CUID, firstName: 'Test', tenantId: 'ten_test' };
    prisma.lead.findFirst.mockResolvedValue(lead);

    const res = await app.inject({ method: 'GET', url: `/api/v1/leads/${CUID}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(lead.id);
  });

  it('GET /api/v1/leads/:id returns 404 for missing id', async () => {
    const app = createTestApp(prisma);
    prisma.lead.findFirst.mockResolvedValue(null);

    const res = await app.inject({ method: 'GET', url: `/api/v1/leads/${CUID}` });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
    expect(body.error.message).toBe('Lead not found');
  });

  it('POST /api/v1/leads creates a lead and returns 201', async () => {
    const app = createTestApp(prisma);
    const lead = { id: CUID, firstName: 'New', tenantId: 'ten_test' };
    prisma.lead.create.mockResolvedValue(lead);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/leads',
      payload: { firstName: 'New', lastName: 'Lead', ownerId: CUID },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(lead.id);
  });

  it('PATCH /api/v1/leads/:id updates a lead and returns 200', async () => {
    const app = createTestApp(prisma);
    const lead = { id: CUID, firstName: 'Updated', tenantId: 'ten_test' };
    prisma.lead.update.mockResolvedValue(lead);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/leads/${CUID}`,
      payload: { firstName: 'Updated' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.data.firstName).toBe(lead.firstName);
  });

  it('DELETE /api/v1/leads/:id deletes a lead and returns 200', async () => {
    const app = createTestApp(prisma);
    prisma.lead.update.mockResolvedValue({ id: CUID });

    const res = await app.inject({ method: 'DELETE', url: `/api/v1/leads/${CUID}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.data.deleted).toBe(true);
  });
});
