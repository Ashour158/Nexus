import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => {
  const state: { app?: FastifyInstance } = {};
  const pubClient = {
    duplicate: vi.fn(),
    ping: vi.fn().mockResolvedValue('PONG'),
    quit: vi.fn().mockResolvedValue(undefined),
  };
  const subClient = {
    ping: vi.fn().mockResolvedValue('PONG'),
    quit: vi.fn().mockResolvedValue(undefined),
  };
  pubClient.duplicate.mockReturnValue(subClient);

  return {
    state,
    pubClient,
    subClient,
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
    startDealConsumer: vi.fn().mockResolvedValue(undefined),
    startNotificationConsumer: vi.fn().mockResolvedValue(undefined),
    startActivityConsumer: vi.fn().mockResolvedValue(undefined),
    startQuoteConsumer: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('@nexus/service-utils/tracing', () => ({
  startTracing: vi.fn(),
}));

vi.mock('@nexus/service-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nexus/service-utils')>();
  return {
    ...actual,
    createRedisClient: vi.fn(() => harness.pubClient),
    startService: harness.startService,
  };
});

vi.mock('@socket.io/redis-adapter', () => {
  // socket.io's Namespace calls `new (server.adapter())(nsp)` and then
  // `adapter.init()`; a bare vi.fn() has no init and crashes the import.
  // Substitute a minimal in-memory adapter class with the lifecycle methods
  // socket.io invokes.
  class FakeAdapter {
    rooms = new Map<string, Set<string>>();
    sids = new Map<string, Set<string>>();
    constructor(public nsp: unknown) {}
    init(): void {}
    close(): void {}
    serverCount(): Promise<number> {
      return Promise.resolve(1);
    }
  }
  return { createAdapter: vi.fn(() => FakeAdapter) };
});

vi.mock('../socket/auth.middleware.js', () => ({
  socketAuthMiddleware: vi.fn(() => vi.fn()),
}));

vi.mock('../socket/handlers/account.handler.js', () => ({
  registerAccountSocketHandlers: vi.fn(),
}));

vi.mock('../socket/handlers/deal.handler.js', () => ({
  registerDealSocketHandlers: vi.fn(),
}));

vi.mock('../socket/handlers/contact.handler.js', () => ({
  registerContactSocketHandlers: vi.fn(),
}));

vi.mock('../socket/handlers/notification.handler.js', () => ({
  registerNotificationSocketHandlers: vi.fn(),
}));

vi.mock('../consumers/deal.consumer.js', () => ({
  startDealConsumer: harness.startDealConsumer,
}));

vi.mock('../consumers/notification.consumer.js', () => ({
  startNotificationConsumer: harness.startNotificationConsumer,
}));

vi.mock('../consumers/activity.consumer.js', () => ({
  startActivityConsumer: harness.startActivityConsumer,
}));

vi.mock('../consumers/quote.consumer.js', () => ({
  startQuoteConsumer: harness.startQuoteConsumer,
}));

vi.mock('../graphql/index.js', () => ({
  registerGraphQL: vi.fn().mockResolvedValue(undefined),
}));

describe('realtime-service', () => {
  beforeAll(async () => {
    vi.stubEnv('JWT_SECRET', '12345678901234567890123456789012');
    await import('../index.js');
  });

  afterAll(async () => {
    await harness.state.app?.close();
    vi.unstubAllEnvs();
  });

  it('reports healthy when Redis responds', async () => {
    const app = harness.state.app;
    expect(app).toBeDefined();

    const response = await app!.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'healthy',
      service: 'realtime-service',
    });
    expect(harness.pubClient.ping).toHaveBeenCalled();
    expect(harness.startDealConsumer).toHaveBeenCalled();
  });
});
