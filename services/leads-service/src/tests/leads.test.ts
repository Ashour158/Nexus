import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const state: { app?: FastifyInstance } = {};
  const prismaBase = {
    $queryRaw: vi.fn().mockResolvedValue([{ ok: 1 }]),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    $extends: vi.fn(),
    $on: vi.fn(),
  };
  // $extends returns a proxy of itself for chaining
  prismaBase.$extends.mockReturnValue({
    ...prismaBase,
    $extends: vi.fn().mockReturnValue(prismaBase),
  });

  return {
    state,
    prismaBase,
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
    requireEnv: vi.fn((keys: string[]) => Object.fromEntries(keys.map((k) => [k, process.env[k] ?? 'test']))),
  };
});

vi.mock('@nexus/service-utils/prisma-client', () => ({
  createPrismaClientWithReplicas: vi.fn(() => mocks.prismaBase),
}));

vi.mock('@nexus/service-utils/prisma-tenant', () => ({
  createTenantPrismaExtension: vi.fn(() => ({})),
}));

vi.mock('@nexus/security', () => ({
  withFieldEncryption: vi.fn(),
}));

vi.mock('@nexus/outbox', () => ({
  OutboxPublisher: vi.fn(() => ({ publish: vi.fn().mockResolvedValue(undefined) })),
}));

vi.mock('@nexus/kafka', () => ({
  NexusProducer: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() })),
  TOPICS: { LEADS: 'leads' },
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => mocks.prismaBase),
}));

vi.mock('../prisma.js', () => ({
  createLeadsPrisma: vi.fn(() => mocks.prismaBase),
  tenantAls: { enterWith: vi.fn(), getStore: vi.fn() },
}));

vi.mock('../routes/index.js', () => ({
  registerRoutes: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../graphql/index.js', () => ({
  registerGraphQL: vi.fn().mockResolvedValue(undefined),
}));

describe('leads-service', () => {
  beforeAll(async () => {
    vi.stubEnv('JWT_SECRET', '12345678901234567890123456789012');
    vi.stubEnv('LEADS_DATABASE_URL', 'postgresql://test:test@localhost:5432/leads_test');
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
    expect(res.json()).toMatchObject({ status: 'healthy', service: 'leads-service' });
  });
});
