import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

function adminRequest(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${path}`, {
    headers: {
      'x-admin-role': 'admin',
      'x-user-id': 'admin-1',
      'x-tenant-id': 'tenant-1',
      ...headers,
    },
  });
}

describe('/api/admin/audit/internal-operations', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    delete process.env.AUDIT_CONSUMER_URL;
    delete process.env.INTERNAL_SERVICE_TOKEN;
  });

  it('rejects unauthorized users before calling audit-consumer', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const route = await import('./route');

    const response = await route.GET(
      new NextRequest('http://localhost/api/admin/audit/internal-operations?tenantId=tenant-1')
    );

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards allowed filters, caps limit, and keeps the service token server-side', async () => {
    process.env.AUDIT_CONSUMER_URL = 'http://audit-consumer:3028';
    process.env.INTERNAL_SERVICE_TOKEN = 'service-secret';
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: true,
          data: {
            records: [
              {
                auditId: 'audit-1',
                tenantId: 'tenant-1',
                operationType: 'quoteProjection.replay',
                operationId: 'op-1',
                operatorId: 'operator-1',
                sourceService: 'deals-service',
                targetProjection: 'quoteProjection',
                dryRun: false,
                executed: true,
                reason: 'repair projection',
                counts: { processed: 1 },
                status: 'completed',
                warnings: [],
                errors: [],
                correlationId: 'corr-1',
                createdAt: '2026-05-20T10:00:00.000Z',
                rawPayload: { shouldNotLeak: true },
              },
            ],
            pageInfo: { limit: 500, returned: 1, nextCursor: null },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    const route = await import('./route');

    const response = await route.GET(
      adminRequest(
        '/api/admin/audit/internal-operations?operationType=quoteProjection.replay&status=completed&limit=9999&cursor=abc'
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://audit-consumer:3028/api/v1/internal/audit/internal-operations?tenantId=tenant-1&operationType=quoteProjection.replay&status=completed&limit=500&cursor=abc',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-service-token': 'service-secret',
          'x-tenant-id': 'tenant-1',
        }),
      })
    );
    expect(JSON.stringify(body)).not.toContain('service-secret');
    expect(JSON.stringify(body)).not.toContain('rawPayload');
    expect(body.data.records[0]).toMatchObject({
      auditId: 'audit-1',
      operationType: 'quoteProjection.replay',
      status: 'completed',
    });
  });

  it('allows finance timeline backfill execution operation filters through the existing admin audit proxy', async () => {
    process.env.AUDIT_CONSUMER_URL = 'http://audit-consumer:3028';
    process.env.INTERNAL_SERVICE_TOKEN = 'service-secret';
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: true,
          data: {
            records: [
              {
                auditId: 'audit-backfill-1',
                tenantId: 'tenant-1',
                operationType: 'financeTimeline.idempotency_backfill_execute',
                operationId: 'op-backfill-1',
                operatorId: 'ops-1',
                sourceService: 'crm-service',
                targetProjection: 'financeTimeline',
                dryRun: false,
                executed: true,
                reason: 'Backfill eligible historical finance timeline activities',
                counts: {
                  requested: 3,
                  updated: 1,
                  blockedMissingSourceEventId: 1,
                  rawPayload: { customerName: 'Sensitive Customer' },
                },
                status: 'completed_with_warnings',
                warnings: [],
                errors: [],
                correlationId: 'corr-backfill',
                createdAt: '2026-05-20T10:00:00.000Z',
                rawActivityCustomFields: { customerEmail: 'private@example.com' },
              },
            ],
            pageInfo: { limit: 100, returned: 1, nextCursor: null },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    const route = await import('./route');

    const response = await route.GET(
      adminRequest(
        '/api/admin/audit/internal-operations?operationType=financeTimeline.idempotency_backfill_execute&status=completed_with_warnings&correlationId=corr-backfill'
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://audit-consumer:3028/api/v1/internal/audit/internal-operations?tenantId=tenant-1&operationType=financeTimeline.idempotency_backfill_execute&status=completed_with_warnings&correlationId=corr-backfill&limit=100',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-service-token': 'service-secret' }),
      })
    );
    expect(body.data.records[0]).toMatchObject({
      operationType: 'financeTimeline.idempotency_backfill_execute',
      counts: {
        requested: 3,
        updated: 1,
        blockedMissingSourceEventId: 1,
      },
    });
    expect(JSON.stringify(body)).not.toContain('service-secret');
    expect(JSON.stringify(body)).not.toContain('private@example.com');
    expect(JSON.stringify(body)).not.toContain('Sensitive Customer');
  });

  it('returns a stable error when audit-consumer fails', async () => {
    process.env.INTERNAL_SERVICE_TOKEN = 'service-secret';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ success: false, error: { message: 'audit unavailable' } }), {
          status: 503,
          headers: { 'content-type': 'application/json' },
        })
      )
    );
    const route = await import('./route');

    const response = await route.GET(adminRequest('/api/admin/audit/internal-operations'));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      success: false,
      error: {
        code: 'AUDIT_CONSUMER_ERROR',
      },
    });
  });
});
