import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => {
  const state: { app?: FastifyInstance } = {};
  const prisma = {
    $queryRaw: vi.fn().mockResolvedValue([{ ok: 1 }]),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    dashboard: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'dashboard_1',
          tenantId: 'tenant_1',
          name: 'Sales Overview',
          widgets: [],
          isPinned: true,
        },
      ]),
    },
    dashboardWidget: {},
    reportDefinition: {},
    definitionReportSchedule: {},
  };

  return {
    state,
    prisma,
    startService: vi.fn(
      async (
        app: FastifyInstance,
        _port: number,
        registerRoutes: (app: FastifyInstance) => Promise<void>
      ) => {
        state.app = app;
        await registerRoutes(app);
      }
    ),
    startSnapshotScheduler: vi.fn(),
    startScheduleRunner: vi.fn(),
  };
});

vi.mock('@nexus/service-utils/tracing', () => ({
  startTracing: vi.fn(),
}));

vi.mock('@nexus/service-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nexus/service-utils')>();
  return {
    ...actual,
    startService: harness.startService,
  };
});

vi.mock('../prisma.js', () => ({
  getPrisma: vi.fn(() => harness.prisma),
}));

vi.mock('../graphql/index.js', () => ({
  registerGraphQL: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/snapshot.job.js', () => ({
  startSnapshotScheduler: harness.startSnapshotScheduler,
}));

vi.mock('../lib/schedule-runner.js', () => ({
  startScheduleRunner: harness.startScheduleRunner,
}));

describe('reporting-service', () => {
  beforeAll(async () => {
    vi.stubEnv('JWT_SECRET', '12345678901234567890123456789012');
    await import('../index.js');
  });

  afterAll(async () => {
    await harness.state.app?.close();
    vi.unstubAllEnvs();
  });

  it('reports healthy when the database check succeeds', async () => {
    const app = harness.state.app;
    expect(app).toBeDefined();

    const response = await app!.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'healthy',
      service: 'reporting-service',
    });
    expect(harness.prisma.$queryRaw).toHaveBeenCalled();
  });

  it('lists dashboards for the authenticated tenant', async () => {
    const app = harness.state.app!;
    const token = (app as any).jwt.sign({
      sub: 'user_1',
      tenantId: 'tenant_1',
      permissions: ['*'],
      roles: ['ADMIN'],
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboards',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      data: [{ id: 'dashboard_1', name: 'Sales Overview' }],
    });
    expect(harness.prisma.dashboard.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant_1' },
      include: { widgets: { orderBy: { position: 'asc' } } },
      orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }],
    });
  });
});
