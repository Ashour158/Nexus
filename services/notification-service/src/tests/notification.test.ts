import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const state: { app?: FastifyInstance } = {};
  const prismaHealth = {
    $queryRaw: vi.fn().mockResolvedValue([{ ok: 1 }]),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  };
  const prisma = {
    notification: { findMany: vi.fn().mockResolvedValue([]) },
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
      // Match the real startService contract: the callback receives the app.
      await cb(app);
    }),
    startDealConsumer: vi.fn().mockResolvedValue(undefined),
    startActivityConsumer: vi.fn().mockResolvedValue(undefined),
    startQuoteConsumer: vi.fn().mockResolvedValue(undefined),
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
  TOPICS: { NOTIFICATIONS: 'notifications' },
}));

vi.mock('../../../node_modules/.prisma/notification-client/index.js', () => ({
  PrismaClient: vi.fn(() => mocks.prismaHealth),
}));

vi.mock('../prisma.js', () => ({
  createNotificationPrisma: vi.fn(() => mocks.prisma),
}));

vi.mock('../channels/email.channel.js', () => ({
  createEmailChannel: vi.fn(() => ({ send: vi.fn().mockResolvedValue(undefined) })),
}));

vi.mock('../channels/in-app.channel.js', () => ({
  createInAppChannel: vi.fn(() => ({ send: vi.fn().mockResolvedValue(undefined) })),
}));

vi.mock('../consumers/deal.consumer.js', () => ({
  startDealConsumer: mocks.startDealConsumer,
}));

vi.mock('../consumers/activity.consumer.js', () => ({
  startActivityConsumer: mocks.startActivityConsumer,
}));

vi.mock('../consumers/quote.consumer.js', () => ({
  startQuoteConsumer: mocks.startQuoteConsumer,
}));

vi.mock('../routes/notifications.routes.js', () => ({
  registerNotificationsRoutes: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../graphql/index.js', () => ({
  registerGraphQL: vi.fn().mockResolvedValue(undefined),
}));

describe('notification-service', () => {
  beforeAll(async () => {
    vi.stubEnv('JWT_SECRET', '12345678901234567890123456789012');
    vi.stubEnv('NOTIFICATION_DATABASE_URL', 'postgresql://test:test@localhost:5432/notification_test');
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
    expect(res.json()).toMatchObject({ status: 'healthy', service: 'notification-service' });
  });

  it('starts kafka producer', () => {
    expect(mocks.producer.connect).toHaveBeenCalled();
  });
});
