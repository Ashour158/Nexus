import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const state: { app?: FastifyInstance } = {};
  const prisma = {
    $queryRaw: vi.fn().mockResolvedValue([{ ok: 1 }]),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    deal: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const producer = {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn().mockResolvedValue(undefined),
  };

  return {
    state,
    prisma,
    producer,
    startService: vi.fn(async (app: FastifyInstance, _port: number, cb: () => Promise<void>) => {
      state.app = app;
      await cb();
    }),
  };
});

vi.mock('@nexus/service-utils/tracing', () => ({ startTracing: vi.fn() }));

vi.mock('@nexus/service-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nexus/service-utils')>();
  return {
    ...actual,
    startService: mocks.startService,
    checkDatabase: vi.fn().mockResolvedValue({ name: 'db', ok: true }),
  };
});

vi.mock('@nexus/kafka', () => ({
  NexusProducer: vi.fn(() => mocks.producer),
  TOPICS: {},
}));

vi.mock('../prisma.js', () => ({
  createDealsPrisma: vi.fn(() => mocks.prisma),
}));

vi.mock('../routes/health.routes.js', () => ({
  registerDealsHealthRoutes: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../routes/deals.routes.js', () => ({
  registerDealsRoutes: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../routes/pipelines.routes.js', () => ({
  registerPipelinesRoutes: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../routes/quotes.routes.js', () => ({
  registerQuotesRoutes: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../routes/quote-projections.routes.js', () => ({
  registerQuoteProjectionRoutes: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../graphql/index.js', () => ({
  registerGraphQL: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../consumers/quote-projection.consumer.js', () => ({
  startQuoteProjectionConsumer: vi.fn().mockResolvedValue(undefined),
}));

describe('deals-service', () => {
  beforeAll(async () => {
    vi.stubEnv('JWT_SECRET', '12345678901234567890123456789012');
    vi.stubEnv('DEALS_DATABASE_URL', 'postgresql://test:test@localhost:5432/deals_test');
    await import('../index.js');
  });

  afterAll(async () => {
    await mocks.state.app?.close();
    vi.unstubAllEnvs();
  });

  it('health check returns healthy', async () => {
    const app = mocks.state.app;
    expect(app).toBeDefined();
    const res = await app!.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'healthy', service: 'deals-service' });
  });

  it('starts kafka producer', () => {
    expect(mocks.producer.connect).toHaveBeenCalled();
  });
});
