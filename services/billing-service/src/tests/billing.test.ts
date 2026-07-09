import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const prismaHealth = {
    $queryRaw: vi.fn().mockResolvedValue([{ ok: 1 }]),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  };
  const billingPrisma = {
    plan: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'plan_1',
          tenantId: 'tenant_1',
          name: 'Starter',
          amount: 1000,
          currency: 'USD',
          interval: 'MONTHLY',
          trialDays: 0,
          features: [],
          isActive: true,
          deletedAt: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]),
    },
    subscription: {},
    invoice: {},
    payment: {},
    webhookEvent: {},
  };
  const producer = {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn().mockResolvedValue(undefined),
  };

  return { billingPrisma, prismaHealth, producer };
});

vi.mock('../../../../node_modules/.prisma/billing-client/index.js', () => ({
  PrismaClient: vi.fn(() => mocks.prismaHealth),
}));

vi.mock('@nexus/kafka', () => ({
  NexusProducer: vi.fn(() => mocks.producer),
}));

vi.mock('../prisma.js', () => ({
  createBillingPrisma: vi.fn(() => mocks.billingPrisma),
}));

describe('billing-service', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    vi.stubEnv('BILLING_DATABASE_URL', 'postgresql://nexus:nexus@localhost:5432/nexus_billing');
    vi.stubEnv('JWT_SECRET', '12345678901234567890123456789012');
    const { buildServer } = await import('../server.js');
    ({ app } = await buildServer());
  });

  afterAll(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  it('reports healthy when the database check succeeds', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'healthy',
      service: 'billing-service',
    });
    expect(mocks.prismaHealth.$queryRaw).toHaveBeenCalled();
  });

  it('lists billing plans for an authenticated tenant', async () => {
    const token = (app as any).jwt.sign({
      sub: 'user_1',
      tenantId: 'tenant_1',
      permissions: ['*'],
      roles: ['ADMIN'],
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/billing/plans',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      data: [{ id: 'plan_1', name: 'Starter' }],
    });
    expect(mocks.billingPrisma.plan.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant_1', deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  });
});
