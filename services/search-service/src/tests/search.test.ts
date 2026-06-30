import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => {
  const state: { app?: FastifyInstance } = {};
  const index = {
    search: vi.fn().mockResolvedValue({ hits: [], estimatedTotalHits: 0 }),
  };
  const meili = {
    health: vi.fn().mockResolvedValue({ status: 'available' }),
    index: vi.fn(() => index),
  };

  return {
    state,
    index,
    meili,
    setupIndexes: vi.fn().mockResolvedValue(undefined),
    startIndexerConsumer: vi.fn().mockResolvedValue(undefined),
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

vi.mock('../meilisearch.js', () => ({
  createMeilisearchClient: vi.fn(() => harness.meili),
}));

vi.mock('../indexes/setup.js', () => ({
  setupIndexes: harness.setupIndexes,
}));

vi.mock('../consumers/indexer.consumer.js', () => ({
  startIndexerConsumer: harness.startIndexerConsumer,
}));

vi.mock('../graphql/index.js', () => ({
  registerGraphQL: vi.fn().mockResolvedValue(undefined),
}));

describe('search-service', () => {
  beforeAll(async () => {
    vi.stubEnv('JWT_SECRET', '12345678901234567890123456789012');
    await import('../index.js');
  });

  afterAll(async () => {
    await harness.state.app?.close();
    vi.unstubAllEnvs();
  });

  it('reports healthy when Meilisearch is available', async () => {
    const app = harness.state.app;
    expect(app).toBeDefined();

    const response = await app!.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'healthy',
      service: 'search-service',
    });
    expect(harness.meili.health).toHaveBeenCalled();
  });

  it('runs an authenticated global search against all primary indexes', async () => {
    const app = harness.state.app!;
    const token = (app as any).jwt.sign({
      sub: 'user_1',
      tenantId: 'tenant_1',
      permissions: ['*'],
      roles: ['ADMIN'],
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/search?q=acme',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      data: {
        deals: [],
        contacts: [],
        accounts: [],
        leads: [],
        total: 0,
      },
    });
    expect(harness.meili.index).toHaveBeenCalledTimes(4);
    expect(harness.index.search).toHaveBeenCalledWith('acme', {
      filter: "tenantId = 'tenant_1'",
      limit: 20,
      offset: 0,
    });
  });
});
