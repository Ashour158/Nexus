import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { registerDealsHealthRoutes } from './health.routes.js';

describe('health routes', () => {
  it('GET /health returns healthy status', async () => {
    const app = Fastify();
    registerDealsHealthRoutes(app);
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('healthy');
    expect(body.service).toBe('deals-service');
  });

  it('GET /api/v1/internal/quote-projections/health rejects public access', async () => {
    const app = Fastify();
    registerDealsHealthRoutes(app, {
      $queryRaw: vi.fn(),
      quoteProjection: { count: vi.fn(), findFirst: vi.fn() },
      quoteProjectionEvent: { findFirst: vi.fn(), findMany: vi.fn() },
    } as never);

    const res = await app.inject({ method: 'GET', url: '/api/v1/internal/quote-projections/health' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/v1/internal/quote-projections/health returns scoped projection health', async () => {
    process.env.INTERNAL_SERVICE_TOKEN = 'test-token';
    const app = Fastify();
    registerDealsHealthRoutes(app, {
      $queryRaw: vi.fn(),
      quoteProjection: {
        count: vi.fn(async () => 1),
        findFirst: vi.fn(async () => ({ sourceEventId: 'evt_1', projectedAt: new Date() })),
      },
      quoteProjectionEvent: { findFirst: vi.fn(), findMany: vi.fn() },
    } as never);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/internal/quote-projections/health?staleAfterMinutes=15',
      headers: { 'x-service-token': 'test-token', 'x-tenant-id': 'tenant_1' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.status).toBe('healthy');
    expect(body.data.projectionCount).toBe(1);
    delete process.env.INTERNAL_SERVICE_TOKEN;
  });

  it('GET /api/v1/internal/quote-projections/rebuild-readiness returns dry-run replay readiness', async () => {
    process.env.INTERNAL_SERVICE_TOKEN = 'test-token';
    const app = Fastify();
    const quoteProjectionEvent = {
      findMany: vi.fn(async () => [{ sourceEventId: 'evt_1' }, { sourceEventId: 'evt_2' }]),
      findFirst: vi.fn(async () => ({ sourceEventId: 'evt_2' })),
    };
    registerDealsHealthRoutes(app, {
      $queryRaw: vi.fn(),
      quoteProjection: {
        count: vi.fn(async () => 0),
        findFirst: vi.fn(async () => null),
      },
      quoteProjectionEvent,
    } as never);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/internal/quote-projections/rebuild-readiness?quoteId=quote_1&fromEventId=evt_1',
      headers: { 'x-service-token': 'test-token', 'x-tenant-id': 'tenant_1' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toEqual(expect.objectContaining({
      dryRun: true,
      tenantId: 'tenant_1',
      quoteId: 'quote_1',
      fromEventId: 'evt_1',
      eventCount: 2,
      latestEventId: 'evt_2',
      safeToReplay: false,
    }));
    expect(quoteProjectionEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: 'tenant_1', quoteId: 'quote_1' }),
    }));
    delete process.env.INTERNAL_SERVICE_TOKEN;
  });

  it('POST /api/v1/internal/quote-projections/replay rejects missing reason', async () => {
    process.env.INTERNAL_SERVICE_TOKEN = 'test-token';
    const app = Fastify();
    registerDealsHealthRoutes(app, {
      $queryRaw: vi.fn(),
      quoteProjection: { count: vi.fn(), findFirst: vi.fn() },
      quoteProjectionEvent: { findFirst: vi.fn(), findMany: vi.fn() },
    } as never);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/internal/quote-projections/replay',
      headers: { 'x-service-token': 'test-token', 'x-tenant-id': 'tenant_1', 'x-operator-id': 'ops_1' },
      payload: { dryRun: true },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('VALIDATION_ERROR');
    delete process.env.INTERNAL_SERVICE_TOKEN;
  });

  it('POST /api/v1/internal/quote-projections/replay defaults to dry-run and reports unsupported execution', async () => {
    process.env.INTERNAL_SERVICE_TOKEN = 'test-token';
    const app = Fastify();
    registerDealsHealthRoutes(app, {
      $queryRaw: vi.fn(),
      quoteProjection: {
        count: vi.fn(async () => 0),
        findFirst: vi.fn(async () => null),
      },
      quoteProjectionEvent: { findFirst: vi.fn(), findMany: vi.fn(async () => []) },
      quote: { create: vi.fn(), update: vi.fn() },
    } as never);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/internal/quote-projections/replay',
      headers: { 'x-service-token': 'test-token', 'x-tenant-id': 'tenant_1', 'x-operator-id': 'ops_1' },
      payload: { reason: 'Reconcile projection after outage', aggregateId: 'quote_1' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toEqual(expect.objectContaining({
      projection: 'quoteProjection',
      dryRun: true,
      tenantId: 'tenant_1',
      operatorId: 'ops_1',
      reason: 'Reconcile projection after outage',
      status: 'unsupported',
      sourceEventStorageAvailable: false,
    }));
    delete process.env.INTERNAL_SERVICE_TOKEN;
  });

  it('audits quote projection replay reports without storing source event payloads', async () => {
    process.env.INTERNAL_SERVICE_TOKEN = 'test-token';
    const app = Fastify();
    const producer = { publish: vi.fn(async (_topic: string, _event: Record<string, unknown>) => undefined) };
    registerDealsHealthRoutes(app, {
      $queryRaw: vi.fn(),
      quoteProjection: {
        count: vi.fn(async () => 0),
        findFirst: vi.fn(async () => null),
      },
      quoteProjectionEvent: { findFirst: vi.fn(), findMany: vi.fn(async () => []) },
      quote: { create: vi.fn(), update: vi.fn() },
    } as never, producer as never);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/internal/quote-projections/replay',
      headers: { 'x-service-token': 'test-token', 'x-tenant-id': 'tenant_1', 'x-operator-id': 'ops_1', 'x-correlation-id': 'corr_replay' },
      payload: { reason: 'Reconcile projection after outage', aggregateId: 'quote_1' },
    });

    expect(res.statusCode).toBe(200);
    expect(producer.publish).toHaveBeenCalledWith('nexus.compliance.audit', expect.objectContaining({
      type: 'internal.operation.audited',
      tenantId: 'tenant_1',
      action: 'quoteProjection.replay',
      resource: 'internal_operation',
      actorId: 'ops_1',
      correlationId: 'corr_replay',
      metadata: expect.objectContaining({
        operationType: 'quoteProjection.replay',
        operationId: expect.stringContaining('quoteProjection-replay:'),
        reason: 'Reconcile projection after outage',
        filters: expect.objectContaining({ aggregateId: 'quote_1' }),
        counts: expect.any(Object),
        sourceService: 'deals-service',
        targetProjection: 'quoteProjection',
      }),
    }));
    const auditEvent = producer.publish.mock.calls[0]?.[1] as { metadata?: unknown };
    expect(JSON.stringify(auditEvent.metadata)).not.toContain('payload');
    delete process.env.INTERNAL_SERVICE_TOKEN;
  });

  it('adds a replay warning when audit publishing fails', async () => {
    process.env.INTERNAL_SERVICE_TOKEN = 'test-token';
    const app = Fastify();
    const producer = { publish: vi.fn(async (_topic: string, _event: Record<string, unknown>) => { throw new Error('audit offline'); }) };
    registerDealsHealthRoutes(app, {
      $queryRaw: vi.fn(),
      quoteProjection: { count: vi.fn(async () => 0), findFirst: vi.fn(async () => null) },
      quoteProjectionEvent: { findFirst: vi.fn(), findMany: vi.fn(async () => []) },
    } as never, producer as never);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/internal/quote-projections/replay',
      headers: { 'x-service-token': 'test-token', 'x-tenant-id': 'tenant_1', 'x-operator-id': 'ops_1' },
      payload: { reason: 'Reconcile projection after outage', aggregateId: 'quote_1' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.warnings).toContain('Audit publish failed: audit offline');
    delete process.env.INTERNAL_SERVICE_TOKEN;
  });

  it('fails quote projection replay when strict audit publishing fails', async () => {
    process.env.INTERNAL_SERVICE_TOKEN = 'test-token';
    process.env.AUDIT_STRICTNESS_QUOTE_PROJECTION_REPLAY = 'strict';
    const app = Fastify();
    const producer = { publish: vi.fn(async (_topic: string, _event: Record<string, unknown>) => { throw new Error('audit offline'); }) };
    registerDealsHealthRoutes(app, {
      $queryRaw: vi.fn(),
      quoteProjection: { count: vi.fn(async () => 0), findFirst: vi.fn(async () => null) },
      quoteProjectionEvent: { findFirst: vi.fn(), findMany: vi.fn(async () => []) },
    } as never, producer as never);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/internal/quote-projections/replay',
      headers: { 'x-service-token': 'test-token', 'x-tenant-id': 'tenant_1', 'x-operator-id': 'ops_1' },
      payload: { reason: 'Reconcile projection after outage', aggregateId: 'quote_1' },
    });

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error).toEqual(expect.objectContaining({
      code: 'AUDIT_REQUIRED_FAILED',
      message: 'Audit publish failed: audit offline',
    }));
    delete process.env.INTERNAL_SERVICE_TOKEN;
    delete process.env.AUDIT_STRICTNESS_QUOTE_PROJECTION_REPLAY;
  });
});
