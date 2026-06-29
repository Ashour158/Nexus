import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { registerInternalOperationsRoutes } from './internal-operations.routes.js';

function makePrisma() {
  return {
    quote: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    quoteRevision: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    outboxMessage: {
      create: vi.fn(),
      findMany: vi.fn(async (): Promise<unknown[]> => []),
    },
    cpqTransitionLedger: {
      findUnique: vi.fn(async () => null),
      findMany: vi.fn(async () => [{
        id: 'ledger_stuck',
        tenantId: 'tenant_1',
        entity: 'quote',
        entityId: 'quote_1',
        action: 'EXPIRE',
        status: 'STARTED',
        createdAt: new Date('2026-05-20T00:00:00.000Z'),
      }]),
      create: vi.fn(),
      update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
      count: vi.fn(async () => 1),
      findFirst: vi.fn(async () => ({
        id: 'ledger_latest',
        entity: 'quote',
        entityId: 'quote_1',
        action: 'EXPIRE',
        status: 'STARTED',
        updatedAt: new Date('2026-05-20T01:00:00.000Z'),
        correlationId: 'corr_ops_1',
        sourceEventId: null,
      })),
    },
  };
}

function makeProducer() {
  return { publish: vi.fn(async (_topic: string, _event: Record<string, unknown>) => undefined) };
}

function createApp(prisma = makePrisma(), producer = makeProducer()) {
  const app = Fastify();
  registerInternalOperationsRoutes(app, prisma as never, producer as never);
  return { app, prisma, producer };
}

describe('internal CPQ reconciliation operations route', () => {
  it('rejects public access without the internal service token', async () => {
    process.env.INTERNAL_SERVICE_TOKEN = 'secret';
    const { app } = createApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/internal/cpq/reconcile-transitions',
      payload: { olderThanMinutes: 15, limit: 100 },
    });

    expect(res.statusCode).toBe(401);
  });

  it('rejects too-low recovery thresholds', async () => {
    process.env.INTERNAL_SERVICE_TOKEN = 'secret';
    const { app } = createApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/internal/cpq/reconcile-transitions',
      headers: { 'x-service-token': 'secret', 'x-tenant-id': 'tenant_1' },
      payload: { olderThanMinutes: 1, limit: 100 },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload).error.code).toBe('VALIDATION_ERROR');
  });

  it('caps the limit and reconciles stale STARTED rows', async () => {
    process.env.INTERNAL_SERVICE_TOKEN = 'secret';
    const { app, prisma } = createApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/internal/cpq/reconcile-transitions',
      headers: {
        'x-service-token': 'secret',
        'x-tenant-id': 'tenant_1',
        'x-correlation-id': 'corr_ops_1',
      },
      payload: { olderThanMinutes: 15, limit: 999 },
    });

    expect(res.statusCode).toBe(200);
    expect(prisma.cpqTransitionLedger.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 500,
      where: expect.objectContaining({ tenantId: 'tenant_1', status: 'STARTED' }),
    }));
    expect(prisma.cpqTransitionLedger.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'FAILED',
        error: expect.objectContaining({ code: 'TRANSITION_TIMEOUT' }),
      }),
    }));
    expect(JSON.parse(res.payload).data).toEqual(expect.objectContaining({
      scanned: 1,
      reconciled: 1,
      skipped: 0,
      failed: 0,
      correlationId: 'corr_ops_1',
    }));
  });

  it('audits CPQ transition reconciliation with sanitized counts and filters', async () => {
    process.env.INTERNAL_SERVICE_TOKEN = 'secret';
    const producer = makeProducer();
    const { app } = createApp(makePrisma(), producer);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/internal/cpq/reconcile-transitions',
      headers: {
        'x-service-token': 'secret',
        'x-tenant-id': 'tenant_1',
        'x-operator-id': 'ops_1',
        'x-correlation-id': 'corr_ops_1',
      },
      payload: { olderThanMinutes: 15, limit: 100 },
    });

    expect(res.statusCode).toBe(200);
    expect(producer.publish).toHaveBeenCalledWith('nexus.compliance.audit', expect.objectContaining({
      type: 'internal.operation.audited',
      tenantId: 'tenant_1',
      action: 'cpq.transition.reconcile',
      resource: 'internal_operation',
      actorId: 'ops_1',
      correlationId: 'corr_ops_1',
      metadata: expect.objectContaining({
        operationType: 'cpq.transition.reconcile',
        reason: 'Recover stale CPQ STARTED transitions',
        filters: expect.objectContaining({ olderThanMinutes: 15, limit: 100 }),
        counts: expect.objectContaining({ scanned: 1, reconciled: 1 }),
        sourceService: 'finance-service',
        targetDomain: 'cpq',
      }),
    }));
    const auditEvent = producer.publish.mock.calls[0]?.[1] as { metadata?: unknown };
    expect(JSON.stringify(auditEvent.metadata)).not.toContain('payload');
  });

  it('fails CPQ transition reconciliation when strict audit publishing fails', async () => {
    process.env.INTERNAL_SERVICE_TOKEN = 'secret';
    process.env.AUDIT_STRICTNESS_CPQ_RECONCILE = 'strict';
    const producer = {
      publish: vi.fn(async (_topic: string, _event: Record<string, unknown>): Promise<undefined> => {
        throw new Error('audit offline');
      }),
    };
    const { app } = createApp(makePrisma(), producer);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/internal/cpq/reconcile-transitions',
      headers: {
        'x-service-token': 'secret',
        'x-tenant-id': 'tenant_1',
        'x-operator-id': 'ops_1',
        'x-correlation-id': 'corr_ops_1',
      },
      payload: { olderThanMinutes: 15, limit: 100 },
    });

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
    expect(body.error).toEqual(expect.objectContaining({
      code: 'AUDIT_REQUIRED_FAILED',
      message: 'Audit publish failed: audit offline',
    }));
    delete process.env.AUDIT_STRICTNESS_CPQ_RECONCILE;
  });

  it('reports internal CPQ observability with stale STARTED transition visibility', async () => {
    process.env.INTERNAL_SERVICE_TOKEN = 'secret';
    const { app, prisma } = createApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/internal/cpq/observability?olderThanMinutes=15',
      headers: { 'x-service-token': 'secret', 'x-tenant-id': 'tenant_1' },
    });

    expect(res.statusCode).toBe(200);
    expect(prisma.cpqTransitionLedger.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: 'tenant_1', status: 'STARTED' }),
    }));
    const body = JSON.parse(res.payload);
    expect(body.data).toEqual(expect.objectContaining({
      status: 'degraded',
      staleStartedTransitions: 1,
      reconciliationRoute: '/api/v1/internal/cpq/reconcile-transitions',
      dlqVisibility: expect.objectContaining({
        owner: 'outbox-relay',
        statsRoute: '/admin/dlq/stats',
        replayRoute: '/admin/dlq/replay',
      }),
    }));
  });

  it('rejects unauthorized canonical finance event-source access', async () => {
    process.env.INTERNAL_SERVICE_TOKEN = 'secret';
    const { app } = createApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/internal/events/finance?tenantId=tenant_1&eventType=quote.approved',
    });

    expect(res.statusCode).toBe(401);
  });

  it('rejects unfiltered broad finance event-source queries', async () => {
    process.env.INTERNAL_SERVICE_TOKEN = 'secret';
    const { app } = createApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/internal/events/finance?tenantId=tenant_1',
      headers: { 'x-service-token': 'secret' },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload).error.code).toBe('VALIDATION_ERROR');
  });

  it('lists canonical finance events with filters and caps the limit without mutating outbox rows', async () => {
    process.env.INTERNAL_SERVICE_TOKEN = 'secret';
    const prisma = makePrisma();
    prisma.outboxMessage.findMany = vi.fn(async (): Promise<unknown[]> => [{
      id: 'outbox_evt_1',
      eventType: 'quote.approved',
      tenantId: 'tenant_1',
      aggregateType: 'quote',
      aggregateId: 'quote_1',
      correlationId: 'corr_1',
      createdAt: new Date('2026-05-20T10:00:00.000Z'),
      payload: {
        type: 'quote.approved',
        tenantId: 'tenant_1',
        quoteId: 'quote_1',
        metadata: {
          transitionLedgerId: 'ledger_1',
          idempotencyKey: 'idem_1',
          source: 'approval-service',
        },
      },
      headers: { source: 'finance-service' },
    }]);
    const { app } = createApp(prisma);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/internal/events/finance?tenantId=tenant_1&eventType=quote.approved&aggregateId=quote_1&fromOccurredAt=2026-05-20T00:00:00.000Z&limit=999',
      headers: { 'x-service-token': 'secret' },
    });

    expect(res.statusCode).toBe(200);
    expect(prisma.outboxMessage.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 500,
      where: expect.objectContaining({
        tenantId: 'tenant_1',
        eventType: 'quote.approved',
        aggregateId: 'quote_1',
        createdAt: expect.objectContaining({ gte: new Date('2026-05-20T00:00:00.000Z') }),
      }),
    }));
    expect(prisma.outboxMessage.create).not.toHaveBeenCalled();
    const body = JSON.parse(res.payload);
    expect(body.data.events[0]).toEqual(expect.objectContaining({
      eventId: 'outbox_evt_1',
      eventType: 'quote.approved',
      tenantId: 'tenant_1',
      aggregateType: 'quote',
      aggregateId: 'quote_1',
      occurredAt: '2026-05-20T10:00:00.000Z',
      correlationId: 'corr_1',
      transitionLedgerId: 'ledger_1',
      idempotencyKey: 'idem_1',
      source: 'approval-service',
      payload: expect.objectContaining({ quoteId: 'quote_1' }),
    }));
  });
});
