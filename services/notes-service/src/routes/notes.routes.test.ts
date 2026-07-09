import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerRoutes } from './index.js';

function createMockPrisma() {
  return {
    note: {
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

describe('notes routes', () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
  });

  it('GET /api/v1/notes returns paginated list', async () => {
    const app = createTestApp(prisma);
    prisma.note.findMany.mockResolvedValue([]);
    prisma.note.count.mockResolvedValue(0);

    const res = await app.inject({ method: 'GET', url: '/api/v1/notes' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.data.data).toEqual([]);
    expect(body.data.total).toBe(0);
    expect(body.data.page).toBe(1);
  });

  it('GET /api/v1/notes filters by leadId', async () => {
    const app = createTestApp(prisma);
    prisma.note.findMany.mockResolvedValue([]);
    prisma.note.count.mockResolvedValue(0);

    const res = await app.inject({ method: 'GET', url: `/api/v1/notes?leadId=${CUID}` });
    expect(res.statusCode).toBe(200);
    expect(prisma.note.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ leadId: CUID }),
      })
    );
  });

  it('GET /api/v1/notes/:id returns note for existing id', async () => {
    const app = createTestApp(prisma);
    const note = { id: CUID, content: 'Test Note', tenantId: 'ten_test' };
    prisma.note.findFirst.mockResolvedValue(note);

    const res = await app.inject({ method: 'GET', url: `/api/v1/notes/${CUID}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(note.id);
  });

  it('GET /api/v1/notes/:id returns 404 for missing id', async () => {
    const app = createTestApp(prisma);
    prisma.note.findFirst.mockResolvedValue(null);

    const res = await app.inject({ method: 'GET', url: `/api/v1/notes/${CUID}` });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
    expect(body.error.message).toBe('Note not found');
  });

  it('POST /api/v1/notes creates a note and returns 201', async () => {
    const app = createTestApp(prisma);
    const note = { id: CUID, content: 'New Note', tenantId: 'ten_test' };
    prisma.note.create.mockResolvedValue(note);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/notes',
      payload: { content: 'New Note', leadId: CUID },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(note.id);
  });

  it('PATCH /api/v1/notes/:id updates a note and returns 200', async () => {
    const app = createTestApp(prisma);
    const note = { id: CUID, content: 'Updated Note', tenantId: 'ten_test' };
    prisma.note.update.mockResolvedValue(note);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/notes/${CUID}`,
      payload: { content: 'Updated Note' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.data.content).toBe(note.content);
  });

  it('DELETE /api/v1/notes/:id deletes a note and returns 200', async () => {
    const app = createTestApp(prisma);
    prisma.note.update.mockResolvedValue({ id: CUID });

    const res = await app.inject({ method: 'DELETE', url: `/api/v1/notes/${CUID}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.data.deleted).toBe(true);
  });
});
