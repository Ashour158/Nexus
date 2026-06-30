import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const state: { app?: FastifyInstance } = {};
  const prismaHealth = {
    $queryRaw: vi.fn().mockResolvedValue([{ ok: 1 }]),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  };
  const prisma = {
    workflowExecution: { findMany: vi.fn().mockResolvedValue([]) },
    $disconnect: vi.fn().mockResolvedValue(undefined),
  };
  const producer = {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn().mockResolvedValue(undefined),
  };

  return {
    state,
    prismaHealth,
    prisma,
    producer,
    startService: vi.fn(async (app: FastifyInstance, _port: number, cb: (a: FastifyInstance) => Promise<void>) => {
      state.app = app;
      await cb(app);
    }),
    startTriggerConsumer: vi.fn().mockResolvedValue(undefined),
    startBranchConsumer: vi.fn().mockResolvedValue(undefined),
    startGdprConsumer: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('@nexus/service-utils/tracing', () => ({ startTracing: vi.fn() }));

vi.mock('@nexus/service-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nexus/service-utils')>();
  return {
    ...actual,
    startService: mocks.startService,
    checkDatabase: vi.fn().mockResolvedValue({ name: 'db', ok: true }),
    requireEnv: vi.fn((keys: string[]) => Object.fromEntries(keys.map((k) => [k, process.env[k] ?? 'test']))),
    optionalEnv: vi.fn((key: string, fallback: string) => process.env[key] ?? fallback),
  };
});

vi.mock('@nexus/kafka', () => ({
  NexusProducer: vi.fn(() => mocks.producer),
  TOPICS: {},
}));

vi.mock('@nexus/service-utils/prisma-client', () => ({
  createPrismaClientWithReplicas: vi.fn(() => mocks.prisma),
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => mocks.prismaHealth),
}));

vi.mock('../prisma.js', () => ({
  createWorkflowPrisma: vi.fn(() => mocks.prisma),
}));

vi.mock('../routes/index.js', () => ({
  registerRoutes: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../graphql/index.js', () => ({
  registerGraphQL: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../consumers/trigger.consumer.js', () => ({
  startTriggerConsumer: mocks.startTriggerConsumer,
}));

vi.mock('../consumers/branch.consumer.js', () => ({
  startBranchConsumer: mocks.startBranchConsumer,
}));

vi.mock('../consumers/gdpr.consumer.js', () => ({
  startGdprConsumer: mocks.startGdprConsumer,
}));

vi.mock('../services/executions.service.js', () => ({
  createExecutionsService: vi.fn(() => ({ runExecution: vi.fn().mockResolvedValue(undefined) })),
}));

describe('workflow-service', () => {
  beforeAll(async () => {
    vi.stubEnv('JWT_SECRET', '12345678901234567890123456789012');
    vi.stubEnv('DATABASE_URL', 'postgresql://test:test@localhost:5432/workflow_test');
    vi.useFakeTimers();
    await import('../index.js');
    vi.useRealTimers();
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
    expect(res.json()).toMatchObject({ status: 'healthy', service: 'workflow-service' });
  });
});
