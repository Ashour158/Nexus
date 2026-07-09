import { describe, expect, it, vi } from 'vitest';
import {
  createQuoteProjectionsService,
  projectFinanceQuoteEvent,
} from './quote-projections.service.js';

function makePrisma() {
  return {
    quoteProjection: {
      count: vi.fn(async () => 1),
      findFirst: vi.fn(async (): Promise<unknown | null> => null),
      findMany: vi.fn(async () => [{ quoteId: 'quote_1', dealId: 'deal_1', status: 'APPROVED' }]),
      upsert: vi.fn(async ({ create, update }) => ({ id: create.id ?? 'projection_1', ...create, ...update })),
      create: vi.fn(),
      update: vi.fn(),
    },
    quoteProjectionEvent: {
      findFirst: vi.fn(async (): Promise<unknown | null> => null),
      findMany: vi.fn(async () => [{ sourceEventId: 'finance_evt_1' }]),
      create: vi.fn(async ({ data }) => ({ id: 'projection_event_1', ...data })),
    },
    quote: {
      create: vi.fn(),
      update: vi.fn(),
    },
  };
}

const event = {
  id: 'event_1',
  type: 'quote.approved',
  tenantId: 'tenant_1',
  payload: {
    quoteId: 'quote_1',
    quoteNumber: 'QUO-1',
    accountId: 'acct_1',
    contactId: 'contact_1',
    dealId: 'deal_1',
    rfqId: 'rfq_1',
    status: 'APPROVED',
    total: 1200,
    currency: 'USD',
    currentRevisionId: 'rev_1',
    validUntil: '2026-06-20T00:00:00.000Z',
    metadata: {
      transitionLedgerId: 'ledger_1',
      sourceEventId: 'finance_evt_1',
      eventVersion: 3,
      correlationId: 'corr_1',
    },
  },
};

describe('finance quote read-model projection', () => {
  it('creates a read-only projection from a finance quote event', async () => {
    const prisma = makePrisma();

    const result = await projectFinanceQuoteEvent(prisma as never, event);

    expect(result.status).toBe('projected');
    expect(prisma.quoteProjection.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId_quoteId: { tenantId: 'tenant_1', quoteId: 'quote_1' } },
      create: expect.objectContaining({
        tenantId: 'tenant_1',
        quoteId: 'quote_1',
        sourceEventId: 'finance_evt_1',
        sourceAggregateId: 'quote_1',
        sourceAggregateType: 'quote',
        sourceEventVersion: 3,
        correlationId: 'corr_1',
        transitionLedgerId: 'ledger_1',
        projectionVersion: 1,
      }),
    }));
    expect(prisma.quoteProjectionEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId: 'tenant_1',
        quoteId: 'quote_1',
        sourceEventId: 'finance_evt_1',
        sourceAggregateId: 'quote_1',
        sourceAggregateType: 'quote',
        correlationId: 'corr_1',
        transitionLedgerId: 'ledger_1',
        projectionVersion: 1,
      }),
    }));
    expect(prisma.quote.create).not.toHaveBeenCalled();
    expect(prisma.quote.update).not.toHaveBeenCalled();
  });

  it('skips duplicate source events idempotently', async () => {
    const prisma = makePrisma();
    prisma.quoteProjectionEvent.findFirst = vi.fn(async (): Promise<unknown | null> => ({ id: 'projection_event_1', sourceEventId: 'finance_evt_1' }));

    const result = await projectFinanceQuoteEvent(prisma as never, event);

    expect(result.status).toBe('duplicate');
    expect(prisma.quoteProjection.upsert).not.toHaveBeenCalled();
  });

  it('updates QuoteProjection from canonical quote.signed events', async () => {
    const prisma = makePrisma();

    const result = await projectFinanceQuoteEvent(prisma as never, {
      ...event,
      id: 'event_signed',
      type: 'quote.signed',
      payload: {
        ...event.payload,
        metadata: { transitionLedgerId: 'ledger_signed', sourceEventId: 'finance_evt_signed' },
        status: 'ACCEPTED',
      },
    });

    expect(result.status).toBe('projected');
    expect(prisma.quoteProjection.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        status: 'ACCEPTED',
        lastFinanceEventType: 'quote.signed',
        transitionLedgerId: 'ledger_signed',
      }),
    }));
  });

  it('reads projections by deal, account, and contact without mutation authority', async () => {
    const prisma = makePrisma();
    const service = createQuoteProjectionsService(prisma as never);

    const byDeal = await service.listByDeal('tenant_1', 'deal_1', { page: 1, limit: 20 });
    const byAccount = await service.listByAccount('tenant_1', 'acct_1', { page: 1, limit: 20 });
    const byContact = await service.listByContact('tenant_1', 'contact_1', { page: 1, limit: 20 });

    expect((byDeal.data[0] as { quoteId: string }).quoteId).toBe('quote_1');
    expect((byAccount.data[0] as { quoteId: string }).quoteId).toBe('quote_1');
    expect((byContact.data[0] as { quoteId: string }).quoteId).toBe('quote_1');
    expect(prisma.quote.create).not.toHaveBeenCalled();
    expect(prisma.quote.update).not.toHaveBeenCalled();
  });

  it('reports healthy projection health when the latest projection is recent', async () => {
    const prisma = makePrisma();
    (prisma.quoteProjection as any).count = vi.fn(async () => 2);
    (prisma.quoteProjection as any).findFirst = vi.fn(async () => ({
      sourceEventId: 'finance_evt_latest',
      projectedAt: new Date(),
    }));
    const service = createQuoteProjectionsService(prisma as never);

    await expect(service.health('tenant_1', 15)).resolves.toEqual(expect.objectContaining({
      status: 'healthy',
      projectionCount: 2,
      lastProcessedSourceEventId: 'finance_evt_latest',
    }));
    expect(prisma.quoteProjection.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant_1' },
    }));
  });

  it('reports stale projection health when the latest projection is older than threshold', async () => {
    const prisma = makePrisma();
    (prisma.quoteProjection as any).count = vi.fn(async () => 1);
    (prisma.quoteProjection as any).findFirst = vi.fn(async () => ({
      sourceEventId: 'finance_evt_old',
      projectedAt: new Date(Date.now() - 20 * 60_000),
    }));
    const service = createQuoteProjectionsService(prisma as never);

    await expect(service.health('tenant_1', 15)).resolves.toEqual(expect.objectContaining({
      status: 'stale',
      projectionCount: 1,
      lastProcessedSourceEventId: 'finance_evt_old',
    }));
  });

  it('reports degraded projection health when the latest projection is far beyond threshold', async () => {
    const prisma = makePrisma();
    (prisma.quoteProjection as any).count = vi.fn(async () => 1);
    (prisma.quoteProjection as any).findFirst = vi.fn(async () => ({
      sourceEventId: 'finance_evt_very_old',
      projectedAt: new Date(Date.now() - 120 * 60_000),
    }));
    const service = createQuoteProjectionsService(prisma as never);

    await expect(service.health('tenant_1', 15)).resolves.toEqual(expect.objectContaining({
      status: 'degraded',
      projectionCount: 1,
      lastProcessedSourceEventId: 'finance_evt_very_old',
      consumerGroup: 'deals-service.quote-projections',
      dlqTopic: 'nexus.finance.quotes.dlq',
    }));
  });

  it('reports empty projection health when no projections exist', async () => {
    const prisma = makePrisma();
    (prisma.quoteProjection as any).count = vi.fn(async () => 0);
    (prisma.quoteProjection as any).findFirst = vi.fn(async () => null);
    const service = createQuoteProjectionsService(prisma as never);

    await expect(service.health('tenant_1', 15)).resolves.toEqual(expect.objectContaining({
      status: 'empty',
      projectionCount: 0,
      latestProjectedAt: null,
      lastProcessedSourceEventId: null,
    }));
  });

  it('reports dry-run rebuild readiness from stored projection events', async () => {
    const prisma = makePrisma();
    prisma.quoteProjectionEvent.findMany = vi.fn(async () => [
      { sourceEventId: 'finance_evt_1' },
      { sourceEventId: 'finance_evt_2' },
    ]);
    prisma.quoteProjectionEvent.findFirst = vi.fn(async (): Promise<unknown | null> => ({ sourceEventId: 'finance_evt_2' }));
    const service = createQuoteProjectionsService(prisma as never);

    await expect(service.rebuildReadiness({
      tenantId: 'tenant_1',
      quoteId: 'quote_1',
      fromEventId: 'finance_evt_1',
    })).resolves.toEqual(expect.objectContaining({
      dryRun: true,
      tenantId: 'tenant_1',
      quoteId: 'quote_1',
      fromEventId: 'finance_evt_1',
      eventCount: 2,
      latestEventId: 'finance_evt_2',
      safeToReplay: false,
    }));
    expect(prisma.quoteProjectionEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: 'tenant_1',
        quoteId: 'quote_1',
        sourceEventId: { gte: 'finance_evt_1' },
      }),
    }));
  });

  it('returns a governed unsupported replay report when durable source events are unavailable', async () => {
    const prisma = makePrisma();
    const service = createQuoteProjectionsService(prisma as never);

    await expect(service.governedReplay({
      tenantId: 'tenant_1',
      aggregateId: 'quote_1',
      dryRun: undefined,
      operatorId: 'ops_1',
      reason: 'Reconcile projection after outage',
    })).resolves.toEqual(expect.objectContaining({
      projection: 'quoteProjection',
      dryRun: true,
      tenantId: 'tenant_1',
      operatorId: 'ops_1',
      reason: 'Reconcile projection after outage',
      status: 'unsupported',
      sourceEventStorageAvailable: false,
      counts: expect.objectContaining({
        candidates: 0,
        processed: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        duplicate: 0,
        failed: 0,
      }),
      warnings: expect.arrayContaining([
        'Replay execution is unavailable because canonical finance source-event access is not configured or unavailable.',
      ]),
    }));
    expect(prisma.quote.create).not.toHaveBeenCalled();
    expect(prisma.quote.update).not.toHaveBeenCalled();
  });

  it('reports configured finance event-source availability and candidate count without enabling execution', async () => {
    const prisma = makePrisma();
    const eventSource = vi.fn(async () => ({
      available: true,
      endpoint: 'http://finance/api/v1/internal/events/finance',
      candidateCount: 2,
      events: [],
    }));
    const service = createQuoteProjectionsService(prisma as never, { eventSource });

    await expect(service.governedReplay({
      tenantId: 'tenant_1',
      aggregateId: 'quote_1',
      sourceEventTypes: ['quote.approved'],
      operatorId: 'ops_1',
      reason: 'Check source availability',
    })).resolves.toEqual(expect.objectContaining({
      projection: 'quoteProjection',
      eventSourceAvailable: true,
      eventSourceEndpoint: 'http://finance/api/v1/internal/events/finance',
      candidateCount: 2,
      status: 'dry_run',
    }));
    expect(eventSource).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant_1',
      aggregateId: 'quote_1',
      sourceEventTypes: ['quote.approved'],
    }));
  });

  it('dry-runs canonical finance events without writing projections', async () => {
    const prisma = makePrisma();
    const eventSource = vi.fn(async () => ({
      available: true,
      endpoint: 'http://finance/api/v1/internal/events/finance',
      candidateCount: 1,
      events: [{
        eventId: 'finance_evt_replay_1',
        eventType: 'quote.approved',
        tenantId: 'tenant_1',
        aggregateType: 'quote',
        aggregateId: 'quote_1',
        occurredAt: '2026-05-20T08:00:00.000Z',
        correlationId: 'corr_replay',
        transitionLedgerId: 'ledger_replay',
        payload: event.payload,
      }],
    }));
    const service = createQuoteProjectionsService(prisma as never, { eventSource });

    const report = await service.governedReplay({
      tenantId: 'tenant_1',
      aggregateId: 'quote_1',
      sourceEventTypes: ['quote.approved'],
      operatorId: 'ops_1',
      reason: 'Dry-run quote projection replay',
    });

    expect(report).toEqual(expect.objectContaining({
      projection: 'quoteProjection',
      dryRun: true,
      executed: false,
      status: 'dry_run',
      sourceEventAccess: expect.objectContaining({ available: true, candidateCount: 1 }),
      counts: expect.objectContaining({
        candidates: 1,
        processed: 0,
        created: 1,
        updated: 0,
        skipped: 0,
        duplicate: 0,
        failed: 0,
      }),
    }));
    expect(prisma.quoteProjection.upsert).not.toHaveBeenCalled();
    expect(prisma.quoteProjectionEvent.create).not.toHaveBeenCalled();
    expect(prisma.quote.create).not.toHaveBeenCalled();
    expect(prisma.quote.update).not.toHaveBeenCalled();
  });

  it('executes quote projection replay through the existing projector', async () => {
    const prisma = makePrisma();
    const eventSource = vi.fn(async () => ({
      available: true,
      endpoint: 'http://finance/api/v1/internal/events/finance',
      candidateCount: 1,
      events: [{
        eventId: 'finance_evt_replay_2',
        eventType: 'quote.approved',
        tenantId: 'tenant_1',
        aggregateType: 'quote',
        aggregateId: 'quote_1',
        occurredAt: '2026-05-20T08:00:00.000Z',
        correlationId: 'corr_replay',
        transitionLedgerId: 'ledger_replay',
        payload: event.payload,
      }],
    }));
    const service = createQuoteProjectionsService(prisma as never, { eventSource });

    const report = await service.governedReplay({
      tenantId: 'tenant_1',
      aggregateId: 'quote_1',
      sourceEventTypes: ['quote.approved'],
      dryRun: false,
      execute: true,
      operatorId: 'ops_1',
      reason: 'Execute quote projection replay',
    });

    expect(report.status).toBe('completed');
    expect(report.executed).toBe(true);
    expect(report.counts).toEqual(expect.objectContaining({
      candidates: 1,
      processed: 1,
      created: 1,
      duplicate: 0,
      failed: 0,
    }));
    expect(prisma.quoteProjection.upsert).toHaveBeenCalled();
    expect(prisma.quoteProjectionEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        sourceEventId: 'finance_evt_replay_2',
        transitionLedgerId: 'ledger_replay',
      }),
    }));
    expect(prisma.quote.create).not.toHaveBeenCalled();
    expect(prisma.quote.update).not.toHaveBeenCalled();
  });

  it('skips duplicate source events during replay execution', async () => {
    const prisma = makePrisma();
    prisma.quoteProjectionEvent.findFirst = vi.fn(async (): Promise<unknown | null> => ({ id: 'projection_event_existing', sourceEventId: 'finance_evt_replay_3' }));
    const eventSource = vi.fn(async () => ({
      available: true,
      endpoint: 'http://finance/api/v1/internal/events/finance',
      candidateCount: 1,
      events: [{
        eventId: 'finance_evt_replay_3',
        eventType: 'quote.approved',
        tenantId: 'tenant_1',
        aggregateType: 'quote',
        aggregateId: 'quote_1',
        occurredAt: '2026-05-20T08:00:00.000Z',
        payload: event.payload,
      }],
    }));
    const service = createQuoteProjectionsService(prisma as never, { eventSource });

    const report = await service.governedReplay({
      tenantId: 'tenant_1',
      aggregateId: 'quote_1',
      sourceEventTypes: ['quote.approved'],
      dryRun: false,
      execute: true,
      operatorId: 'ops_1',
      reason: 'Replay duplicate safely',
    });

    expect(report.counts).toEqual(expect.objectContaining({ candidates: 1, duplicate: 1, processed: 0 }));
    expect(prisma.quoteProjection.upsert).not.toHaveBeenCalled();
  });
});
