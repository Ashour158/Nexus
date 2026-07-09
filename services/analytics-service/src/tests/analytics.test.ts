import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const state: { app?: FastifyInstance } = {};
  const clickhouseResult = { json: vi.fn().mockResolvedValue([{ '1': 1 }]) };
  const clickhouse = {
    query: vi.fn().mockResolvedValue(clickhouseResult),
    close: vi.fn().mockResolvedValue(undefined),
  };

  return {
    state,
    clickhouse,
    startService: vi.fn(async (app: FastifyInstance, _port: number, cb: (a: FastifyInstance) => Promise<void>) => {
      state.app = app;
      await cb(app);
    }),
    startAnalyticsConsumer: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('@nexus/service-utils/tracing', () => ({ startTracing: vi.fn() }));

vi.mock('@nexus/service-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nexus/service-utils')>();
  return {
    ...actual,
    startService: mocks.startService,
    globalErrorHandler: vi.fn(),
    requireEnv: vi.fn((keys: string[]) => Object.fromEntries(keys.map((k) => [k, process.env[k] ?? 'test_val']))),
    optionalEnv: vi.fn((key: string, fallback: string) => process.env[key] ?? fallback),
  };
});

vi.mock('../clickhouse.js', () => ({
  createClickHouseClient: vi.fn(() => mocks.clickhouse),
}));

vi.mock('../consumers/events.consumer.js', () => ({
  startAnalyticsConsumer: mocks.startAnalyticsConsumer,
}));

vi.mock('../routes/pipeline.routes.js', () => ({
  registerPipelineAnalyticsRoutes: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../routes/revenue.routes.js', () => ({
  registerRevenueAnalyticsRoutes: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../routes/activity.routes.js', () => ({
  registerActivityAnalyticsRoutes: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../routes/forecast.routes.js', () => ({
  registerForecastAnalyticsRoutes: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../graphql/index.js', () => ({
  registerGraphQL: vi.fn().mockResolvedValue(undefined),
}));

describe('analytics-service', () => {
  beforeAll(async () => {
    vi.stubEnv('JWT_SECRET', '12345678901234567890123456789012');
    vi.stubEnv('CLICKHOUSE_URL', 'http://localhost:8123');
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
    expect(res.json()).toMatchObject({ status: 'healthy', service: 'analytics-service' });
  });

  it('starts analytics consumer', () => {
    expect(mocks.startAnalyticsConsumer).toHaveBeenCalled();
  });
});
