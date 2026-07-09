import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { registerCrmInternalRoutes } from './internal.routes.js';
import { createFinanceTimelineIdempotencyBackfillPlan } from '../consumers/finance-timeline.consumer.js';

function makePrisma(latest: unknown | null) {
  return {
    activity: {
      count: vi.fn(async () => (latest ? 1 : 0)),
      findFirst: vi.fn(async () => latest),
      findMany: vi.fn(async (): Promise<unknown[]> => []),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    lead: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  };
}

describe('CRM internal finance timeline health route', () => {
  it('rejects public access', async () => {
    const app = Fastify();
    await registerCrmInternalRoutes(app, makePrisma(null) as never);

    const res = await app.inject({ method: 'GET', url: '/api/v1/internal/finance-timeline/health' });

    expect(res.statusCode).toBe(401);
  });

  it('returns healthy status for recent finance timeline activity', async () => {
    process.env.INTERNAL_SERVICE_TOKEN = 'test-token';
    const app = Fastify();
    await registerCrmInternalRoutes(app, makePrisma({
      createdAt: new Date(Date.now() - 1000),
      updatedAt: new Date(),
      customFields: { timelineSource: 'finance', sourceEventId: 'evt-1' },
    }) as never);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/internal/finance-timeline/health?staleAfterMinutes=15',
      headers: { 'x-service-token': 'test-token', 'x-tenant-id': 'tenant-1' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.status).toBe('healthy');
    expect(body.data.latestSourceEventId).toBe('evt-1');
    delete process.env.INTERNAL_SERVICE_TOKEN;
  });

  it('POST /api/v1/internal/finance-timeline/replay rejects missing reason', async () => {
    process.env.INTERNAL_SERVICE_TOKEN = 'test-token';
    const app = Fastify();
    await registerCrmInternalRoutes(app, makePrisma(null) as never);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/internal/finance-timeline/replay',
      headers: { 'x-service-token': 'test-token', 'x-tenant-id': 'tenant-1', 'x-operator-id': 'ops-1' },
      payload: { dryRun: true },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('VALIDATION_ERROR');
    delete process.env.INTERNAL_SERVICE_TOKEN;
  });

  it('POST /api/v1/internal/finance-timeline/replay defaults to dry-run and reports unsupported execution', async () => {
    process.env.INTERNAL_SERVICE_TOKEN = 'test-token';
    const app = Fastify();
    await registerCrmInternalRoutes(app, makePrisma(null) as never);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/internal/finance-timeline/replay',
      headers: { 'x-service-token': 'test-token', 'x-tenant-id': 'tenant-1', 'x-operator-id': 'ops-1' },
      payload: { reason: 'Rebuild finance activity timeline after outage', aggregateId: 'quote-1' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toEqual(expect.objectContaining({
      projection: 'financeTimeline',
      dryRun: true,
      tenantId: 'tenant-1',
      operatorId: 'ops-1',
      reason: 'Rebuild finance activity timeline after outage',
      status: 'unsupported',
      sourceEventStorageAvailable: false,
    }));
    delete process.env.INTERNAL_SERVICE_TOKEN;
  });

  it('audits finance timeline replay reports without storing source event payloads', async () => {
    process.env.INTERNAL_SERVICE_TOKEN = 'test-token';
    const app = Fastify();
    const producer = { publish: vi.fn(async (_topic: string, _event: Record<string, unknown>) => undefined) };
    await registerCrmInternalRoutes(app, makePrisma(null) as never, producer as never);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/internal/finance-timeline/replay',
      headers: { 'x-service-token': 'test-token', 'x-tenant-id': 'tenant-1', 'x-operator-id': 'ops-1', 'x-correlation-id': 'corr-replay' },
      payload: { reason: 'Rebuild finance activity timeline after outage', aggregateId: 'quote-1' },
    });

    expect(res.statusCode).toBe(200);
    expect(producer.publish).toHaveBeenCalledWith('nexus.compliance.audit', expect.objectContaining({
      type: 'internal.operation.audited',
      tenantId: 'tenant-1',
      action: 'financeTimeline.replay',
      resource: 'internal_operation',
      actorId: 'ops-1',
      correlationId: 'corr-replay',
      metadata: expect.objectContaining({
        operationType: 'financeTimeline.replay',
        operationId: expect.stringContaining('financeTimeline-replay:'),
        reason: 'Rebuild finance activity timeline after outage',
        sourceService: 'crm-service',
        targetProjection: 'financeTimeline',
      }),
    }));
    const auditEvent = producer.publish.mock.calls[0]?.[1] as { metadata?: unknown };
    expect(JSON.stringify(auditEvent.metadata)).not.toContain('payload');
    delete process.env.INTERNAL_SERVICE_TOKEN;
  });

  it('fails finance timeline replay when strict audit publishing fails', async () => {
    process.env.INTERNAL_SERVICE_TOKEN = 'test-token';
    process.env.AUDIT_STRICTNESS_FINANCE_TIMELINE_REPLAY = 'strict';
    const app = Fastify();
    const producer = { publish: vi.fn(async (_topic: string, _event: Record<string, unknown>) => { throw new Error('audit offline'); }) };
    await registerCrmInternalRoutes(app, makePrisma(null) as never, producer as never);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/internal/finance-timeline/replay',
      headers: { 'x-service-token': 'test-token', 'x-tenant-id': 'tenant-1', 'x-operator-id': 'ops-1' },
      payload: { reason: 'Rebuild finance activity timeline after outage', aggregateId: 'quote-1' },
    });

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error).toEqual(expect.objectContaining({
      code: 'AUDIT_REQUIRED_FAILED',
      message: 'Audit publish failed: audit offline',
    }));
    delete process.env.INTERNAL_SERVICE_TOKEN;
    delete process.env.AUDIT_STRICTNESS_FINANCE_TIMELINE_REPLAY;
  });

  it('GET /api/v1/internal/finance-timeline/idempotency-readiness rejects public access', async () => {
    const app = Fastify();
    await registerCrmInternalRoutes(app, makePrisma(null) as never);

    const res = await app.inject({ method: 'GET', url: '/api/v1/internal/finance-timeline/idempotency-readiness' });

    expect(res.statusCode).toBe(401);
  });

  it('GET /api/v1/internal/finance-timeline/idempotency-readiness returns a sanitized read-only report', async () => {
    process.env.INTERNAL_SERVICE_TOKEN = 'test-token';
    const prisma = makePrisma(null);
    (prisma.activity as any).findMany = vi.fn(async () => [
      {
        id: 'activity-eligible',
        tenantId: 'tenant-1',
        accountId: 'acct-1',
        contactId: null,
        dealId: 'deal-1',
        createdAt: new Date('2026-05-20T08:01:00.000Z'),
        customFields: {
          timelineSource: 'finance',
          sourceEventId: 'evt-eligible',
          sourceEventType: 'quote.sent',
          aggregateId: 'quote-2',
          aggregateType: 'quote',
          payload: { customerName: 'Sensitive Co' },
        },
      },
    ]);
    const app = Fastify();
    await registerCrmInternalRoutes(app, prisma as never);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/internal/finance-timeline/idempotency-readiness?includeSamples=true&limit=9999&sourceEventType=quote.sent',
      headers: { 'x-service-token': 'test-token', 'x-tenant-id': 'tenant-1' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toEqual(expect.objectContaining({
      readOnly: true,
      tenantId: 'tenant-1',
      status: 'ready',
      counts: expect.objectContaining({ eligibleUniqueHistoricalRows: 1 }),
    }));
    expect(body.data.samples.eligible).toEqual([expect.objectContaining({
      activityId: 'activity-eligible',
      sourceEventId: 'evt-eligible',
      sourceEventType: 'quote.sent',
    })]);
    expect(JSON.stringify(body.data)).not.toContain('Sensitive Co');
    expect(prisma.activity.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 500 }));
    expect((prisma.activity as any).create).toBeUndefined();
    delete process.env.INTERNAL_SERVICE_TOKEN;
  });

  it('GET /api/v1/internal/finance-timeline/idempotency-readiness omits samples by default', async () => {
    process.env.INTERNAL_SERVICE_TOKEN = 'test-token';
    const prisma = makePrisma(null);
    (prisma.activity as any).findMany = vi.fn(async () => [
      {
        id: 'activity-eligible',
        tenantId: 'tenant-1',
        accountId: 'acct-1',
        contactId: null,
        dealId: 'deal-1',
        createdAt: new Date('2026-05-20T08:01:00.000Z'),
        customFields: {
          timelineSource: 'finance',
          sourceEventId: 'evt-eligible',
          sourceEventType: 'quote.sent',
          aggregateId: 'quote-2',
          aggregateType: 'quote',
        },
      },
    ]);
    const app = Fastify();
    await registerCrmInternalRoutes(app, prisma as never);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/internal/finance-timeline/idempotency-readiness',
      headers: { 'x-service-token': 'test-token', 'x-tenant-id': 'tenant-1' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.samples).toEqual({
      eligible: [],
      duplicates: [],
      ambiguous: [],
      missingSourceEventId: [],
    });
    delete process.env.INTERNAL_SERVICE_TOKEN;
  });

  it('GET /api/v1/internal/finance-timeline/idempotency-readiness rejects invalid cursors', async () => {
    process.env.INTERNAL_SERVICE_TOKEN = 'test-token';
    const app = Fastify();
    await registerCrmInternalRoutes(app, makePrisma(null) as never);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/internal/finance-timeline/idempotency-readiness?cursor=not-a-valid-cursor',
      headers: { 'x-service-token': 'test-token', 'x-tenant-id': 'tenant-1' },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('VALIDATION_ERROR');
    delete process.env.INTERNAL_SERVICE_TOKEN;
  });

  it('POST /api/v1/internal/finance-timeline/idempotency-backfill-plan requires operatorReason', async () => {
    process.env.INTERNAL_SERVICE_TOKEN = 'test-token';
    const app = Fastify();
    await registerCrmInternalRoutes(app, makePrisma(null) as never);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/internal/finance-timeline/idempotency-backfill-plan',
      headers: { 'x-service-token': 'test-token', 'x-tenant-id': 'tenant-1' },
      payload: { includeSamples: true },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('VALIDATION_ERROR');
    delete process.env.INTERNAL_SERVICE_TOKEN;
  });

  it('POST /api/v1/internal/finance-timeline/idempotency-backfill-plan returns an audited dry-run plan', async () => {
    process.env.INTERNAL_SERVICE_TOKEN = 'test-token';
    const prisma = makePrisma(null);
    (prisma.activity as any).findMany = vi.fn(async () => [
      {
        id: 'activity-eligible',
        tenantId: 'tenant-1',
        accountId: 'acct-1',
        contactId: null,
        dealId: 'deal-1',
        createdAt: new Date('2026-05-20T08:01:00.000Z'),
        customFields: {
          timelineSource: 'finance',
          sourceEventId: 'evt-eligible',
          sourceEventType: 'quote.sent',
          aggregateId: 'quote-2',
          aggregateType: 'quote',
          payload: { customerName: 'Sensitive Co' },
        },
      },
    ]);
    const producer = { publish: vi.fn(async (_topic: string, _event: Record<string, unknown>) => undefined) };
    const app = Fastify();
    await registerCrmInternalRoutes(app, prisma as never, producer as never);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/internal/finance-timeline/idempotency-backfill-plan',
      headers: { 'x-service-token': 'test-token', 'x-tenant-id': 'tenant-1', 'x-operator-id': 'ops-1', 'x-correlation-id': 'corr-plan' },
      payload: {
        operatorReason: 'Plan historical idempotency backfill',
        includeSamples: true,
        limit: 9999,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toEqual(expect.objectContaining({
      dryRun: true,
      executed: false,
      operatorReason: 'Plan historical idempotency backfill',
      tenantId: 'tenant-1',
      counts: expect.objectContaining({ wouldMarkVersion1: 1 }),
    }));
    expect(JSON.stringify(body.data)).not.toContain('Sensitive Co');
    expect((prisma.activity as any).create).toBeUndefined();
    expect(producer.publish).toHaveBeenCalledWith('nexus.compliance.audit', expect.objectContaining({
      type: 'internal.operation.audited',
      action: 'financeTimeline.idempotency_backfill_plan',
      tenantId: 'tenant-1',
      actorId: 'ops-1',
      correlationId: 'corr-plan',
      metadata: expect.objectContaining({
        operationType: 'financeTimeline.idempotency_backfill_plan',
        reason: 'Plan historical idempotency backfill',
        sourceService: 'crm-service',
        targetProjection: 'financeTimeline',
      }),
    }));
    const auditEvent = producer.publish.mock.calls[0]?.[1] as { metadata?: unknown };
    expect(JSON.stringify(auditEvent.metadata)).not.toContain('payload');
    delete process.env.INTERNAL_SERVICE_TOKEN;
  });

  it('POST /api/v1/internal/finance-timeline/idempotency-backfill-execute rejects missing approval gates', async () => {
    process.env.INTERNAL_SERVICE_TOKEN = 'test-token';
    const app = Fastify();
    await registerCrmInternalRoutes(app, makePrisma(null) as never);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/internal/finance-timeline/idempotency-backfill-execute',
      headers: { 'x-service-token': 'test-token', 'x-tenant-id': 'tenant-1', 'x-operator-id': 'ops-1' },
      payload: {
        operatorReason: 'Prepare historical idempotency backfill',
        activityIds: ['activity-1'],
        execute: true,
      },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('VALIDATION_ERROR');
    delete process.env.INTERNAL_SERVICE_TOKEN;
  });

  it('POST /api/v1/internal/finance-timeline/idempotency-backfill-execute updates eligible rows and audits sanitized counts', async () => {
    process.env.INTERNAL_SERVICE_TOKEN = 'test-token';
    const prisma = makePrisma(null);
    const rows = [
      {
        id: 'activity-eligible',
        tenantId: 'tenant-1',
        accountId: 'acct-1',
        contactId: null,
        dealId: 'deal-1',
        createdAt: new Date('2026-05-20T08:01:00.000Z'),
        customFields: {
          timelineSource: 'finance',
          sourceEventId: 'evt-eligible',
          sourceEventType: 'quote.sent',
          aggregateId: 'quote-2',
          aggregateType: 'quote',
          payload: { customerName: 'Sensitive Co' },
        },
      },
    ];
    (prisma.activity as any).findMany = vi.fn(async () => rows);
    (prisma.activity as any).update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...rows[0], ...data }));
    const plan = await createFinanceTimelineIdempotencyBackfillPlan(prisma as never, {
      tenantId: 'tenant-1',
      operatorReason: 'Prepare historical idempotency backfill',
    });
    const producer = { publish: vi.fn(async (_topic: string, _event: Record<string, unknown>) => undefined) };
    const app = Fastify();
    await registerCrmInternalRoutes(app, prisma as never, producer as never);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/internal/finance-timeline/idempotency-backfill-execute',
      headers: { 'x-service-token': 'test-token', 'x-tenant-id': 'tenant-1', 'x-operator-id': 'ops-1', 'x-correlation-id': 'corr-execute' },
      payload: {
        operatorReason: 'Prepare historical idempotency backfill',
        approvalReason: 'Approved by data governance',
        dryRunOperationId: plan.operationId,
        planHash: plan.planHash,
        activityIds: ['activity-eligible'],
        execute: true,
        confirmation: 'BACKFILL_FINANCE_TIMELINE_IDEMPOTENCY',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toEqual(expect.objectContaining({
      executed: true,
      status: 'completed',
      counts: expect.objectContaining({ requested: 1, updated: 1 }),
      updatedActivityIds: ['activity-eligible'],
    }));
    expect(JSON.stringify(body.data)).not.toContain('Sensitive Co');
    expect(producer.publish).toHaveBeenCalledWith('nexus.compliance.audit', expect.objectContaining({
      type: 'internal.operation.audited',
      action: 'financeTimeline.idempotency_backfill_execute',
      tenantId: 'tenant-1',
      actorId: 'ops-1',
      correlationId: 'corr-execute',
      metadata: expect.objectContaining({
        operationType: 'financeTimeline.idempotency_backfill_execute',
        reason: 'Prepare historical idempotency backfill',
        sourceService: 'crm-service',
        targetProjection: 'financeTimeline',
      }),
    }));
    const auditEvent = producer.publish.mock.calls[0]?.[1] as { metadata?: unknown };
    expect(JSON.stringify(auditEvent.metadata)).not.toContain('payload');
    delete process.env.INTERNAL_SERVICE_TOKEN;
  });

  it('GET /api/v1/internal/finance-timeline/idempotency-backfill-consistency reports matching audit and Activity metadata counts', async () => {
    process.env.INTERNAL_SERVICE_TOKEN = 'test-token';
    process.env.AUDIT_CONSUMER_URL = 'http://audit-consumer:3028';
    const prisma = makePrisma(null);
    (prisma.activity as any).count = vi.fn(async () => 2);
    (prisma.activity as any).findMany = vi.fn(async () => [
      {
        id: 'activity-1',
        tenantId: 'tenant-1',
        createdAt: new Date('2026-05-20T10:00:00.000Z'),
        customFields: {
          timelineSource: 'finance',
          projectionIdempotencyVersion: 1,
          sourceEventId: 'evt-1',
          idempotencyBackfillOperationId: 'financeTimeline-idempotency-backfill-execute:1',
          idempotencyBackfilledAt: '2026-05-20T10:00:00.000Z',
          rawActivityCustomFields: { customerEmail: 'private@example.com' },
        },
      },
    ]);
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({
        success: true,
        data: {
          records: [
            {
              auditId: 'audit-1',
              tenantId: 'tenant-1',
              operationType: 'financeTimeline.idempotency_backfill_execute',
              operationId: 'financeTimeline-idempotency-backfill-execute:1',
              correlationId: 'corr-1',
              status: 'completed',
              counts: { updated: 2 },
              createdAt: '2026-05-20T10:00:00.000Z',
              completedAt: '2026-05-20T10:01:00.000Z',
            },
          ],
          pageInfo: { nextCursor: null },
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    );
    vi.stubGlobal('fetch', fetchMock);
    const app = Fastify();
    await registerCrmInternalRoutes(app, prisma as never);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/internal/finance-timeline/idempotency-backfill-consistency?operationId=financeTimeline-idempotency-backfill-execute:1&includeSamples=true',
      headers: { 'x-service-token': 'test-token', 'x-tenant-id': 'tenant-1' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const [auditUrl, auditInit] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
    const parsedAuditUrl = new URL(auditUrl);
    expect(`${parsedAuditUrl.origin}${parsedAuditUrl.pathname}`).toBe('http://audit-consumer:3028/api/v1/internal/audit/internal-operations');
    expect(parsedAuditUrl.searchParams.get('tenantId')).toBe('tenant-1');
    expect(parsedAuditUrl.searchParams.get('operationType')).toBe('financeTimeline.idempotency_backfill_execute');
    expect(parsedAuditUrl.searchParams.get('operationId')).toBe('financeTimeline-idempotency-backfill-execute:1');
    expect(parsedAuditUrl.searchParams.get('limit')).toBe('100');
    expect(auditInit.headers['x-service-token']).toBe('test-token');
    expect(body.data).toEqual(expect.objectContaining({
      readOnly: true,
      tenantId: 'tenant-1',
      summary: expect.objectContaining({
        checkedOperations: 1,
        consistent: 1,
        countMismatches: 0,
      }),
      items: [
        expect.objectContaining({
          operationId: 'financeTimeline-idempotency-backfill-execute:1',
          auditUpdatedCount: 2,
          activityBackfilledCount: 2,
          status: 'CONSISTENT',
        }),
      ],
    }));
    expect(JSON.stringify(body.data)).not.toContain('private@example.com');
    expect(JSON.stringify(body.data)).not.toContain('rawActivityCustomFields');
    expect((prisma.activity as any).update).not.toHaveBeenCalled();
    delete process.env.INTERNAL_SERVICE_TOKEN;
    delete process.env.AUDIT_CONSUMER_URL;
    vi.unstubAllGlobals();
  });

  it('GET /api/v1/internal/finance-timeline/idempotency-backfill-consistency detects count mismatches and handles audit outage as inconclusive', async () => {
    process.env.INTERNAL_SERVICE_TOKEN = 'test-token';
    process.env.AUDIT_CONSUMER_URL = 'http://audit-consumer:3028';
    const prisma = makePrisma(null);
    (prisma.activity as any).count = vi.fn(async () => 1);
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({
        success: true,
        data: {
          records: [
            {
              tenantId: 'tenant-1',
              operationType: 'financeTimeline.idempotency_backfill_execute',
              operationId: 'financeTimeline-idempotency-backfill-execute:2',
              status: 'completed',
              counts: { updated: 3 },
              createdAt: '2026-05-20T10:00:00.000Z',
            },
            {
              tenantId: 'tenant-1',
              operationType: 'financeTimeline.idempotency_backfill_execute',
              operationId: 'financeTimeline-idempotency-backfill-execute:3',
              status: 'blocked',
              counts: { updated: 0 },
              createdAt: '2026-05-20T11:00:00.000Z',
            },
          ],
          pageInfo: { nextCursor: 'cursor-2' },
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    ));
    const app = Fastify();
    await registerCrmInternalRoutes(app, prisma as never);

    const mismatch = await app.inject({
      method: 'GET',
      url: '/api/v1/internal/finance-timeline/idempotency-backfill-consistency?status=completed&limit=9999',
      headers: { 'x-service-token': 'test-token', 'x-tenant-id': 'tenant-1' },
    });

    expect(mismatch.statusCode).toBe(200);
    const mismatchBody = JSON.parse(mismatch.body);
    expect(mismatchBody.data.summary).toEqual(expect.objectContaining({
      checkedOperations: 2,
      countMismatches: 1,
      inconclusive: 1,
    }));
    expect(mismatchBody.data.items).toEqual([
      expect.objectContaining({ operationId: 'financeTimeline-idempotency-backfill-execute:2', status: 'COUNT_MISMATCH' }),
      expect.objectContaining({ operationId: 'financeTimeline-idempotency-backfill-execute:3', status: 'INCONCLUSIVE' }),
    ]);
    expect(mismatchBody.data.nextCursor).toBe('cursor-2');

    vi.stubGlobal('fetch', vi.fn(async () => new Response('unavailable', { status: 503 })));
    const outage = await app.inject({
      method: 'GET',
      url: '/api/v1/internal/finance-timeline/idempotency-backfill-consistency',
      headers: { 'x-service-token': 'test-token', 'x-tenant-id': 'tenant-1' },
    });

    expect(outage.statusCode).toBe(200);
    const outageBody = JSON.parse(outage.body);
    expect(outageBody.data.summary.inconclusive).toBe(1);
    expect(outageBody.data.warnings).toEqual(expect.arrayContaining([
      'Audit-consumer returned 503; consistency report is inconclusive.',
    ]));
    delete process.env.INTERNAL_SERVICE_TOKEN;
    delete process.env.AUDIT_CONSUMER_URL;
    vi.unstubAllGlobals();
  });

  it('GET /api/v1/internal/finance-timeline/idempotency-backfill-consistency reports bounded orphan metadata without raw Activity fields', async () => {
    process.env.INTERNAL_SERVICE_TOKEN = 'test-token';
    process.env.AUDIT_CONSUMER_URL = 'http://audit-consumer:3028';
    const prisma = makePrisma(null);
    (prisma.activity as any).findMany = vi.fn(async () => [
      {
        id: 'activity-orphan-1',
        tenantId: 'tenant-1',
        createdAt: new Date('2026-05-20T10:00:00.000Z'),
        customFields: {
          timelineSource: 'finance',
          projectionIdempotencyVersion: 1,
          idempotencyBackfillOperationId: 'backfill-orphan',
          idempotencyBackfilledAt: '2026-05-20T10:00:00.000Z',
          sourceEventId: 'evt-orphan-1',
          rawActivityCustomFields: { customerEmail: 'private@example.com' },
        },
      },
      {
        id: 'activity-orphan-2',
        tenantId: 'tenant-1',
        createdAt: new Date('2026-05-20T10:01:00.000Z'),
        customFields: {
          timelineSource: 'finance',
          projectionIdempotencyVersion: 1,
          idempotencyBackfillOperationId: 'backfill-orphan',
          idempotencyBackfilledAt: '2026-05-20T10:01:00.000Z',
          sourceEventId: 'evt-orphan-2',
        },
      },
      {
        id: 'activity-matched',
        tenantId: 'tenant-1',
        createdAt: new Date('2026-05-20T10:02:00.000Z'),
        customFields: {
          timelineSource: 'finance',
          projectionIdempotencyVersion: 1,
          idempotencyBackfillOperationId: 'backfill-matched',
          idempotencyBackfilledAt: '2026-05-20T10:02:00.000Z',
          sourceEventId: 'evt-matched',
        },
      },
    ]);
    const fetchMock = vi.fn(async (url: string) => {
      const operationId = new URL(url).searchParams.get('operationId');
      return new Response(JSON.stringify({
        success: true,
        data: {
          records: operationId === 'backfill-matched'
            ? [{ operationId: 'backfill-matched', operationType: 'financeTimeline.idempotency_backfill_execute', tenantId: 'tenant-1' }]
            : [],
          pageInfo: { nextCursor: null },
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const app = Fastify();
    await registerCrmInternalRoutes(app, prisma as never);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/internal/finance-timeline/idempotency-backfill-consistency?mode=orphan-metadata&includeSamples=true&limit=100',
      headers: { 'x-service-token': 'test-token', 'x-tenant-id': 'tenant-1' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toEqual(expect.objectContaining({
      readOnly: true,
      mode: 'orphan-metadata',
      tenantId: 'tenant-1',
      summary: expect.objectContaining({
        scannedActivityRows: 3,
        uniqueBackfillOperationIds: 2,
        matchedAuditOperations: 1,
        orphanOperationIds: 1,
        orphanActivityRows: 2,
        inconclusive: 0,
      }),
      items: [
        expect.objectContaining({
          backfillOperationId: 'backfill-orphan',
          activityCount: 2,
          auditFound: false,
          status: 'AUDIT_MISSING',
          sampleActivityIds: ['activity-orphan-1', 'activity-orphan-2'],
          sampleSourceEventIds: ['evt-orphan-1', 'evt-orphan-2'],
        }),
      ],
    }));
    expect(body.data.warnings).toEqual(expect.arrayContaining([
      'Orphan metadata report is page-scoped and read-only.',
    ]));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(body.data)).not.toContain('private@example.com');
    expect(JSON.stringify(body.data)).not.toContain('rawActivityCustomFields');
    expect((prisma.activity as any).update).not.toHaveBeenCalled();
    expect((prisma.activity as any).deleteMany).not.toHaveBeenCalled();
    delete process.env.INTERNAL_SERVICE_TOKEN;
    delete process.env.AUDIT_CONSUMER_URL;
    vi.unstubAllGlobals();
  });

  it('GET /api/v1/internal/finance-timeline/idempotency-backfill-consistency orphan mode degrades to inconclusive on audit outage', async () => {
    process.env.INTERNAL_SERVICE_TOKEN = 'test-token';
    process.env.AUDIT_CONSUMER_URL = 'http://audit-consumer:3028';
    const prisma = makePrisma(null);
    (prisma.activity as any).findMany = vi.fn(async () => [
      {
        id: 'activity-1',
        tenantId: 'tenant-1',
        createdAt: new Date('2026-05-20T10:00:00.000Z'),
        customFields: {
          timelineSource: 'finance',
          projectionIdempotencyVersion: 1,
          idempotencyBackfillOperationId: 'backfill-unknown',
          idempotencyBackfilledAt: '2026-05-20T10:00:00.000Z',
          sourceEventId: 'evt-1',
        },
      },
    ]);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('unavailable', { status: 503 })));
    const app = Fastify();
    await registerCrmInternalRoutes(app, prisma as never);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/internal/finance-timeline/idempotency-backfill-consistency?mode=orphan-metadata',
      headers: { 'x-service-token': 'test-token', 'x-tenant-id': 'tenant-1' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.summary).toEqual(expect.objectContaining({
      orphanOperationIds: 0,
      inconclusive: 1,
    }));
    expect(body.data.items).toEqual([
      expect.objectContaining({
        backfillOperationId: 'backfill-unknown',
        auditFound: false,
        status: 'INCONCLUSIVE',
      }),
    ]);
    expect(body.data.warnings).toEqual(expect.arrayContaining([
      'Audit-consumer returned 503; orphan metadata report is inconclusive for at least one operation.',
    ]));
    delete process.env.INTERNAL_SERVICE_TOKEN;
    delete process.env.AUDIT_CONSUMER_URL;
    vi.unstubAllGlobals();
  });

  it('GET /api/v1/internal/finance-timeline/idempotency-backfill-consistency orphan mode caps limit and rejects invalid cursor', async () => {
    process.env.INTERNAL_SERVICE_TOKEN = 'test-token';
    const app = Fastify();
    await registerCrmInternalRoutes(app, makePrisma(null) as never);

    const invalidCursor = await app.inject({
      method: 'GET',
      url: '/api/v1/internal/finance-timeline/idempotency-backfill-consistency?mode=orphan-metadata&cursor=not-a-cursor',
      headers: { 'x-service-token': 'test-token', 'x-tenant-id': 'tenant-1' },
    });

    expect(invalidCursor.statusCode).toBe(400);
    expect(JSON.parse(invalidCursor.body).error.code).toBe('VALIDATION_ERROR');
    delete process.env.INTERNAL_SERVICE_TOKEN;
  });

  it('GET /api/v1/internal/finance-timeline/idempotency-backfill-consistency rejects public access', async () => {
    const app = Fastify();
    await registerCrmInternalRoutes(app, makePrisma(null) as never);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/internal/finance-timeline/idempotency-backfill-consistency',
    });

    expect(res.statusCode).toBe(401);
  });
});
