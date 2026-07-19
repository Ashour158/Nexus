import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const state: { app?: FastifyInstance } = {};
  const prisma = {
    cadenceEnrollment: { findMany: vi.fn().mockResolvedValue([]) },
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
  const consumer = {
    subscribe: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  };

  return {
    state,
    prisma,
    producer,
    consumer,
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
  NexusConsumer: vi.fn(() => mocks.consumer),
  TOPICS: { ACTIVITIES: 'activities' },
}));

vi.mock('../../../node_modules/.prisma/cadence-client/index.js', () => ({
  PrismaClient: vi.fn(() => mocks.prisma),
}));

vi.mock('../prisma.js', () => ({
  getPrisma: vi.fn(() => mocks.prisma),
}));

vi.mock('../services/cadences.service.js', () => ({
  createCadencesService: vi.fn(() => ({})),
}));

vi.mock('../services/enrollments.service.js', () => ({
  createEnrollmentsService: vi.fn(() => ({
    exitEnrollment: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../services/queue.service.js', () => ({
  createQueueService: vi.fn(() => ({
    startQueueWorker: vi.fn(() => vi.fn()),
  })),
}));

vi.mock('../routes/cadences.routes.js', () => ({
  registerCadencesRoutes: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../routes/enrollments.routes.js', () => ({
  registerEnrollmentsRoutes: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../graphql/index.js', () => ({
  registerGraphQL: vi.fn().mockResolvedValue(undefined),
}));

describe('cadence-service', () => {
  beforeAll(async () => {
    vi.stubEnv('JWT_SECRET', '12345678901234567890123456789012');
    vi.stubEnv('CADENCE_DATABASE_URL', 'postgresql://test:test@localhost:5432/cadence_test');
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
