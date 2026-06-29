import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerInternalOperationAuditRoutes } from './internal-operation-audit.routes.js';

const SERVICE_TOKEN = 'audit-service-token';

function createAuditLog(overrides: Record<string, unknown> = {}) {
  return {
    id: 'audit-1',
    tenantId: 'tenant-1',
    actorId: 'operator-1',
    actorType: 'user',
    action: 'quoteProjection.replay',
    resource: 'internal_operation',
    resourceId: 'op-1',
    changes: {
      before: { payload: 'should-not-leak' },
    },
    metadata: {
      operationType: 'quoteProjection.replay',
      operationId: 'op-1',
      sourceService: 'deals-service',
      targetProjection: 'quoteProjection',
      dryRun: false,
      executed: true,
      reason: 'repair quote projection',
      filters: { aggregateId: 'quote-1', tenantId: 'tenant-1' },
      counts: { candidates: 2, processed: 2, created: 1, updated: 1 },
      status: 'completed',
      warnings: ['one event was already projected'],
      errors: [],
      correlationId: 'corr-1',
      sourceEvents: [{ payload: { customerEmail: 'private@example.com' } }],
      rawPayload: { customerName: 'Sensitive Customer' },
    },
    timestamp: new Date('2026-05-20T10:00:00.000Z'),
    correlationId: null,
    ...overrides,
  };
}

function makeApp(findMany = vi.fn()) {
  const app = Fastify();
  registerInternalOperationAuditRoutes(app, {
    auditLog: { findMany },
  });
  return { app, findMany };
}

describe('internal operation audit read routes', () => {
  const originalToken = process.env.INTERNAL_SERVICE_TOKEN;

  beforeEach(() => {
    process.env.INTERNAL_SERVICE_TOKEN = SERVICE_TOKEN;
  });

  afterEach(() => {
    process.env.INTERNAL_SERVICE_TOKEN = originalToken;
    vi.restoreAllMocks();
  });

  it('rejects unauthorized requests', async () => {
    const { app, findMany } = makeApp(vi.fn().mockResolvedValue([]));

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/internal/audit/internal-operations?tenantId=tenant-1',
    });

    expect(response.statusCode).toBe(401);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('queries replay and reconciliation audit records by operation type', async () => {
    const { app, findMany } = makeApp(vi.fn().mockResolvedValue([createAuditLog()]));

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/internal/audit/internal-operations?tenantId=tenant-1&operationType=quoteProjection.replay',
      headers: { 'x-service-token': SERVICE_TOKEN },
    });

    expect(response.statusCode).toBe(200);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          resource: 'internal_operation',
          action: 'quoteProjection.replay',
        }),
      })
    );
    expect(response.json()).toMatchObject({
      success: true,
      data: {
        records: [
          {
            auditId: 'audit-1',
            operationType: 'quoteProjection.replay',
            operationId: 'op-1',
            operatorId: 'operator-1',
            sourceService: 'deals-service',
            targetProjection: 'quoteProjection',
            dryRun: false,
            executed: true,
            status: 'completed',
            correlationId: 'corr-1',
          },
        ],
      },
    });
  });

  it('queries finance timeline backfill execution audit records with sanitized result counts', async () => {
    const { app, findMany } = makeApp(vi.fn().mockResolvedValue([
      createAuditLog({
        id: 'audit-backfill-1',
        actorId: 'ops-1',
        action: 'financeTimeline.idempotency_backfill_execute',
        resourceId: 'financeTimeline-idempotency-backfill-execute:1',
        correlationId: 'corr-backfill',
        metadata: {
          operationType: 'financeTimeline.idempotency_backfill_execute',
          operationId: 'financeTimeline-idempotency-backfill-execute:1',
          sourceService: 'crm-service',
          targetProjection: 'financeTimeline',
          dryRun: false,
          executed: true,
          reason: 'Backfill eligible historical finance timeline activities',
          filters: {
            planHash: 'plan-hash-1',
            requestedActivityCount: 3,
            rawPayload: { customerName: 'Sensitive Customer' },
          },
          counts: {
            requested: 3,
            validatedEligible: 1,
            updated: 1,
            alreadyHardened: 1,
            blockedDuplicate: 1,
            blockedAmbiguous: 0,
            blockedMissingSourceEventId: 1,
            blockedUnsafe: 0,
            failed: 0,
          },
          status: 'completed_with_warnings',
          warnings: ['Some requested rows were already hardened and were treated as no-op.'],
          errors: [],
          correlationId: 'corr-backfill',
          rawActivityCustomFields: { payload: { customerEmail: 'private@example.com' } },
          sourceEvents: [{ payload: { quoteTotal: 1000 } }],
        },
      }),
    ]));

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/internal/audit/internal-operations?tenantId=tenant-1&operationType=financeTimeline.idempotency_backfill_execute&status=completed_with_warnings&correlationId=corr-backfill',
      headers: { 'x-service-token': SERVICE_TOKEN },
    });

    expect(response.statusCode).toBe(200);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: 'tenant-1',
        resource: 'internal_operation',
        action: 'financeTimeline.idempotency_backfill_execute',
        OR: expect.any(Array),
        AND: expect.arrayContaining([
          { metadata: { path: ['status'], equals: 'completed_with_warnings' } },
        ]),
      }),
    }));
    const body = response.json();
    expect(body.data.records[0]).toMatchObject({
      auditId: 'audit-backfill-1',
      operationType: 'financeTimeline.idempotency_backfill_execute',
      operationId: 'financeTimeline-idempotency-backfill-execute:1',
      operatorId: 'ops-1',
      sourceService: 'crm-service',
      targetProjection: 'financeTimeline',
      dryRun: false,
      executed: true,
      status: 'completed_with_warnings',
      correlationId: 'corr-backfill',
      counts: {
        requested: 3,
        validatedEligible: 1,
        updated: 1,
        alreadyHardened: 1,
        blockedDuplicate: 1,
        blockedAmbiguous: 0,
        blockedMissingSourceEventId: 1,
        blockedUnsafe: 0,
        failed: 0,
      },
    });
    expect(JSON.stringify(body)).not.toContain('private@example.com');
    expect(JSON.stringify(body)).not.toContain('Sensitive Customer');
    expect(JSON.stringify(body)).not.toContain('sourceEvents');
    expect(JSON.stringify(body)).not.toContain('rawActivityCustomFields');
  });

  it('queries by operation id and correlation id', async () => {
    const { app, findMany } = makeApp(vi.fn().mockResolvedValue([createAuditLog()]));

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/internal/audit/internal-operations?tenantId=tenant-1&operationId=op-1&correlationId=corr-1',
      headers: { 'x-service-token': SERVICE_TOKEN },
    });

    expect(response.statusCode).toBe(200);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          resourceId: 'op-1',
          OR: expect.any(Array),
        }),
      })
    );
  });

  it('enforces tenant scope and caps limits', async () => {
    const { app, findMany } = makeApp(vi.fn().mockResolvedValue([]));

    const missingTenant = await app.inject({
      method: 'GET',
      url: '/api/v1/internal/audit/internal-operations',
      headers: { 'x-service-token': SERVICE_TOKEN },
    });

    expect(missingTenant.statusCode).toBe(400);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/internal/audit/internal-operations?tenantId=tenant-1&limit=9999',
      headers: { 'x-service-token': SERVICE_TOKEN },
    });

    expect(response.statusCode).toBe(200);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 500 }));
  });

  it('rejects unsupported operation types', async () => {
    const { app, findMany } = makeApp(vi.fn().mockResolvedValue([]));

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/internal/audit/internal-operations?tenantId=tenant-1&operationType=legacy.quote.write',
      headers: { 'x-service-token': SERVICE_TOKEN },
    });

    expect(response.statusCode).toBe(400);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('does not return sensitive payloads or raw metadata', async () => {
    const { app } = makeApp(vi.fn().mockResolvedValue([createAuditLog()]));

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/internal/audit/internal-operations?tenantId=tenant-1',
      headers: { 'x-service-token': SERVICE_TOKEN },
    });

    expect(response.statusCode).toBe(200);
    const body = response.body;
    expect(body).not.toContain('private@example.com');
    expect(body).not.toContain('Sensitive Customer');
    expect(body).not.toContain('should-not-leak');
    expect(body).not.toContain('rawPayload');
    expect(body).not.toContain('sourceEvents');
  });

  it('returns a stable empty result shape', async () => {
    const { app } = makeApp(vi.fn().mockResolvedValue([]));

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/internal/audit/internal-operations?tenantId=tenant-1',
      headers: { 'x-service-token': SERVICE_TOKEN },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      success: true,
      data: {
        records: [],
        pageInfo: {
          limit: 100,
          returned: 0,
          nextCursor: null,
        },
      },
    });
  });
});
