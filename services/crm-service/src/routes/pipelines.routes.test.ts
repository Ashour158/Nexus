import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerPipelinesRoutes } from './pipelines.routes.js';
import { pipelineFactory } from '../test/factories/pipeline.factory.js';
import { stageFactory } from '../test/factories/stage.factory.js';

function createMockPrisma() {
  return {
    pipeline: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findFirstOrThrow: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    stage: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    deal: {
      count: vi.fn(),
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
  registerPipelinesRoutes(app, prisma as any);
  return app;
}

describe('pipelines routes', () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
  });

  it('GET /api/v1/pipelines returns pipelines', async () => {
    const app = createTestApp(prisma);
    prisma.pipeline.findMany.mockResolvedValue([pipelineFactory()]);

    const res = await app.inject({ method: 'GET', url: '/api/v1/pipelines' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('POST /api/v1/pipelines creates pipeline', async () => {
    const app = createTestApp(prisma);
    prisma.pipeline.findFirst.mockResolvedValue(null);
    prisma.pipeline.create.mockResolvedValue(pipelineFactory());

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/pipelines',
      payload: { name: 'New Pipeline', type: 'sales', stages: [{ name: 'Stage 1', order: 0, probability: 10 }] },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
  });

  it('GET /api/v1/pipelines/:id returns pipeline', async () => {
    const app = createTestApp(prisma);
    prisma.pipeline.findFirst.mockResolvedValue(pipelineFactory());

    const res = await app.inject({ method: 'GET', url: '/api/v1/pipelines/pip_test' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
  });

  it('GET /api/v1/pipelines/:id/stages returns stages', async () => {
    const app = createTestApp(prisma);
    prisma.pipeline.findFirst.mockResolvedValue(pipelineFactory());
    prisma.stage.findMany.mockResolvedValue([stageFactory()]);

    const res = await app.inject({ method: 'GET', url: '/api/v1/pipelines/pip_test/stages' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });
});
