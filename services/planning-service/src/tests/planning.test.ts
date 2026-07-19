import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const state: { app?: FastifyInstance } = {};
  const prisma = {
    quota: { findMany: vi.fn().mockResolvedValue([]) },
    forecast: { findMany: vi.fn().mockResolvedValue([]) },
    // /health runs checkDatabase(prisma) -> $queryRaw; without it the mock
    // rejects and the health endpoint reports 503.
    $queryRaw: vi.fn().mockResolvedValue([{ ok: 1 }]),
    $disconnect: vi.fn().mockResolvedValue(undefined),
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
    globalErrorHandler: vi.fn(),
  };
});

vi.mock('@nexus/kafka', () => ({
  NexusProducer: vi.fn(() => mocks.producer),
  TOPICS: {},
}));

vi.mock('../../../node_modules/.prisma/planning-client/index.js', () => ({
  PrismaClient: vi.fn(() => mocks.prisma),
}));

vi.mock('../prisma.js', () => ({
  getPrisma: vi.fn(() => mocks.prisma),
}));

vi.mock('../services/quotas.service.js', () => ({
  createQuotasService: vi.fn(() => ({})),
}));

vi.mock('../services/forecasts.service.js', () => ({
  createForecastsService: vi.fn(() => ({})),
}));

vi.mock('../routes/quotas.routes.js', () => ({
  registerQuotasRoutes: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../routes/forecasts.routes.js', () => ({
  registerForecastsRoutes: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../routes/forecast-override.routes.js', () => ({
  registerForecastOverrideRoutes: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../graphql/index.js', () => ({
  registerGraphQL: vi.fn().mockResolvedValue(undefined),
}));

describe('planning-service', () => {
  beforeAll(async () => {
    vi.stubEnv('JWT_SECRET', '12345678901234567890123456789012');
    vi.stubEnv('PLANNING_DATABASE_URL', 'postgresql://test:test@localhost:5432/planning_test');
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
  });

  it('connects kafka producer', () => {
    expect(mocks.producer.connect).toHaveBeenCalled();
  });
});
