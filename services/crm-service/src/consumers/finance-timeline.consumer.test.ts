import { describe, expect, it, vi } from 'vitest';
import {
  analyzeFinanceTimelineIdempotencyReadiness,
  createFinanceTimelineIdempotencyBackfillPlan,
  executeFinanceTimelineIdempotencyBackfill,
  getFinanceTimelineHealth,
  getFinanceTimelineReplayReport,
  projectFinanceTimelineEvent,
} from './finance-timeline.consumer.js';

function makePrisma(existing: { id: string } | null = null) {
  return {
    activity: {
      findFirst: vi.fn(async () => existing),
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => (existing ? 1 : 0)),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'activity-finance-1', ...data })),
      update: vi.fn(async ({ data, where }: { data: Record<string, unknown>; where: Record<string, unknown> }) => ({ id: where.id, ...data })),
    },
    quote: {
      create: vi.fn(),
      update: vi.fn(),
    },
  };
}

describe('finance timeline projector', () => {
  it('projects quote.approved into the existing CRM activity timeline', async () => {
    const prisma = makePrisma();

    const result = await projectFinanceTimelineEvent(prisma as never, {
      id: 'evt-quote-approved',
      type: 'quote.approved',
      tenantId: 'tenant-1',
      occurredAt: '2026-05-20T08:00:00.000Z',
      payload: {
        quoteId: 'quote-1',
        quoteNumber: 'Q-100',
        accountId: 'acct-1',
        contactId: 'contact-1',
        dealId: 'deal-1',
        actorId: 'approver-1',
        status: 'APPROVED',
        totalAmount: 1200,
        currency: 'USD',
        metadata: { transitionLedgerId: 'ledger-1', correlationId: 'corr-1', eventVersion: 2 },
      },
    });

    expect(result).toEqual({ status: 'projected', activityId: 'activity-finance-1', sourceEventId: 'evt-quote-approved' });
    expect(prisma.activity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          accountId: 'acct-1',
          contactId: 'contact-1',
          dealId: 'deal-1',
          ownerId: 'approver-1',
          subject: 'Quote Q-100 approved',
          customFields: expect.objectContaining({
            timelineSource: 'finance',
            sourceEventId: 'evt-quote-approved',
            sourceEventType: 'quote.approved',
            sourceAggregateId: 'quote-1',
            sourceAggregateType: 'quote',
            sourceEventVersion: 2,
            transitionLedgerId: 'ledger-1',
            correlationId: 'corr-1',
            projectionVersion: 1,
            projectionIdempotencyVersion: 1,
            quoteId: 'quote-1',
          }),
        }),
      })
    );
  });

  it('projects canonical RFQ review lifecycle events', async () => {
    const prisma = makePrisma();

    const result = await projectFinanceTimelineEvent(prisma as never, {
      id: 'evt-rfq-ready',
      type: 'rfq.ready_for_quote',
      tenantId: 'tenant-1',
      payload: {
        rfqId: 'rfq-1',
        rfqNumber: 'RFQ-100',
        accountId: 'acct-1',
        contactId: 'contact-1',
        dealId: 'deal-1',
        status: 'RESPONDED',
        metadata: { transitionLedgerId: 'ledger-rfq-ready' },
      },
    });

    expect(result.status).toBe('projected');
    expect(prisma.activity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subject: 'RFQ RFQ-100 ready for quote',
          customFields: expect.objectContaining({
            sourceEventType: 'rfq.ready_for_quote',
            transitionLedgerId: 'ledger-rfq-ready',
            rfqId: 'rfq-1',
          }),
        }),
      })
    );
  });

  it('projects quote.sent and preserves finance metadata without mutating quotes', async () => {
    const prisma = makePrisma();

    await projectFinanceTimelineEvent(prisma as never, {
      id: 'evt-quote-sent',
      type: 'quote.sent',
      tenantId: 'tenant-1',
      payload: {
        quoteId: 'quote-2',
        quoteNumber: 'Q-101',
        accountId: 'acct-1',
        dealId: 'deal-1',
        metadata: { transitionLedgerId: 'ledger-2' },
      },
    });

    expect(prisma.activity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subject: 'Quote Q-101 sent to customer',
          customFields: expect.objectContaining({ transitionLedgerId: 'ledger-2' }),
        }),
      })
    );
    expect(prisma.quote.create).not.toHaveBeenCalled();
    expect(prisma.quote.update).not.toHaveBeenCalled();
  });

  it('projects canonical quote.signed into the CRM activity timeline', async () => {
    const prisma = makePrisma();

    const result = await projectFinanceTimelineEvent(prisma as never, {
      id: 'evt-quote-signed',
      type: 'quote.signed',
      tenantId: 'tenant-1',
      payload: {
        quoteId: 'quote-2',
        quoteNumber: 'Q-102',
        accountId: 'acct-1',
        contactId: 'contact-1',
        dealId: 'deal-1',
        status: 'ACCEPTED',
        metadata: { transitionLedgerId: 'ledger-signed' },
      },
    });

    expect(result.status).toBe('projected');
    expect(prisma.activity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subject: 'Quote Q-102 signed',
          customFields: expect.objectContaining({
            sourceEventType: 'quote.signed',
            transitionLedgerId: 'ledger-signed',
          }),
        }),
      })
    );
  });

  it('projects drq.approved when CRM anchors exist', async () => {
    const prisma = makePrisma();

    const result = await projectFinanceTimelineEvent(prisma as never, {
      id: 'evt-drq-approved',
      type: 'drq.approved',
      tenantId: 'tenant-1',
      payload: {
        discountRequestId: 'drq-1',
        quoteId: 'quote-1',
        accountId: 'acct-1',
        dealId: 'deal-1',
        reasonCode: 'COMPETITIVE_MATCH',
      },
    });

    expect(result.status).toBe('projected');
    expect(prisma.activity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subject: 'Discount request approved',
          customFields: expect.objectContaining({
            aggregateType: 'drq',
            drqId: 'drq-1',
          }),
        }),
      })
    );
  });

  it('projects order.created_from_quote into account and deal timelines without requiring contactId', async () => {
    const prisma = makePrisma();

    const result = await projectFinanceTimelineEvent(prisma as never, {
      id: 'evt-order-created',
      type: 'order.created_from_quote',
      tenantId: 'tenant-1',
      payload: {
        orderId: 'order-1',
        orderNumber: 'SO-1',
        quoteId: 'quote-1',
        accountId: 'acct-1',
        dealId: 'deal-1',
      },
    });

    expect(result.status).toBe('projected');
    expect(prisma.activity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountId: 'acct-1',
          contactId: undefined,
          dealId: 'deal-1',
          subject: 'Order SO-1 created from quote',
        }),
      })
    );
  });

  it('skips duplicate sourceEventId without creating another timeline entry', async () => {
    const prisma = makePrisma({ id: 'existing-activity' });

    const result = await projectFinanceTimelineEvent(prisma as never, {
      id: 'evt-duplicate',
      type: 'quote.approved',
      tenantId: 'tenant-1',
      payload: { quoteId: 'quote-1', accountId: 'acct-1' },
    });

    expect(result).toEqual({ status: 'duplicate', sourceEventId: 'evt-duplicate' });
    expect(prisma.activity.create).not.toHaveBeenCalled();
  });

  it('treats a database unique violation as a duplicate finance timeline event', async () => {
    const prisma = makePrisma();
    (prisma.activity as any).create = vi.fn(async () => {
      const error = new Error('Unique constraint failed on finance source event');
      (error as { code?: string }).code = 'P2002';
      throw error;
    });

    const result = await projectFinanceTimelineEvent(prisma as never, {
      id: 'evt-race-duplicate',
      type: 'quote.approved',
      tenantId: 'tenant-1',
      payload: { quoteId: 'quote-1', accountId: 'acct-1' },
    });

    expect(result).toEqual({ status: 'duplicate', sourceEventId: 'evt-race-duplicate' });
    expect(prisma.activity.create).toHaveBeenCalledTimes(1);
  });

  it('requires a stable sourceEventId for finance timeline projection', async () => {
    const prisma = makePrisma();

    const result = await projectFinanceTimelineEvent(prisma as never, {
      type: 'quote.approved',
      tenantId: 'tenant-1',
      payload: { quoteId: 'quote-1', accountId: 'acct-1' },
    });

    expect(result).toEqual({ status: 'ignored', reason: 'missing_source_event_id' });
    expect(prisma.activity.create).not.toHaveBeenCalled();
  });

  it('ignores finance events without CRM anchors', async () => {
    const prisma = makePrisma();

    const result = await projectFinanceTimelineEvent(prisma as never, {
      id: 'evt-no-anchor',
      type: 'quote.approved',
      tenantId: 'tenant-1',
      payload: { quoteId: 'quote-1' },
    });

    expect(result).toEqual({ status: 'ignored', reason: 'missing_crm_anchor' });
    expect(prisma.activity.create).not.toHaveBeenCalled();
  });

  it('reports healthy finance timeline health when the latest projection is recent', async () => {
    const prisma = makePrisma();
    (prisma.activity as any).count = vi.fn(async () => 3);
    (prisma.activity as any).findFirst = vi.fn(async () => ({
      createdAt: new Date(Date.now() - 250),
      updatedAt: new Date(),
      customFields: { sourceEventId: 'evt-latest', timelineSource: 'finance' },
    }));

    await expect(getFinanceTimelineHealth(prisma as never, 'tenant-1', 15)).resolves.toEqual(expect.objectContaining({
      status: 'healthy',
      projectedEventCount: 3,
      latestSourceEventId: 'evt-latest',
    }));
  });

  it('reports stale finance timeline health when the latest projection is old', async () => {
    const prisma = makePrisma();
    (prisma.activity as any).count = vi.fn(async () => 1);
    (prisma.activity as any).findFirst = vi.fn(async () => ({
      createdAt: new Date(Date.now() - 30 * 60_000),
      updatedAt: new Date(Date.now() - 20 * 60_000),
      customFields: { sourceEventId: 'evt-old', timelineSource: 'finance' },
    }));

    await expect(getFinanceTimelineHealth(prisma as never, 'tenant-1', 15)).resolves.toEqual(expect.objectContaining({
      status: 'stale',
      projectedEventCount: 1,
      latestSourceEventId: 'evt-old',
    }));
  });

  it('reports degraded finance timeline health when the latest projection is far beyond threshold', async () => {
    const prisma = makePrisma();
    (prisma.activity as any).count = vi.fn(async () => 1);
    (prisma.activity as any).findFirst = vi.fn(async () => ({
      createdAt: new Date(Date.now() - 130 * 60_000),
      updatedAt: new Date(Date.now() - 120 * 60_000),
      customFields: { sourceEventId: 'evt-very-old', timelineSource: 'finance' },
    }));

    await expect(getFinanceTimelineHealth(prisma as never, 'tenant-1', 15)).resolves.toEqual(expect.objectContaining({
      status: 'degraded',
      projectedEventCount: 1,
      latestSourceEventId: 'evt-very-old',
      consumerGroup: 'crm-service.finance-timeline',
      dlqTopic: 'nexus.finance.quotes.dlq',
    }));
  });

  it('reports empty finance timeline health when no finance activities exist', async () => {
    const prisma = makePrisma();
    (prisma.activity as any).count = vi.fn(async () => 0);
    (prisma.activity as any).findFirst = vi.fn(async () => null);

    await expect(getFinanceTimelineHealth(prisma as never, 'tenant-1', 15)).resolves.toEqual(expect.objectContaining({
      status: 'empty',
      projectedEventCount: 0,
      latestProjectedAt: null,
      latestSourceEventId: null,
    }));
  });

  it('returns an empty idempotency readiness report when no finance activities exist', async () => {
    const prisma = makePrisma();

    await expect(analyzeFinanceTimelineIdempotencyReadiness(prisma as never, { tenantId: 'tenant-1' })).resolves.toEqual(expect.objectContaining({
      readOnly: true,
      tenantId: 'tenant-1',
      status: 'empty',
      counts: expect.objectContaining({
        hardenedRows: 0,
        eligibleUniqueHistoricalRows: 0,
        duplicateGroups: 0,
        ambiguousGroups: 0,
        missingSourceEventIdRows: 0,
      }),
      samples: {
        eligible: [],
        duplicates: [],
        ambiguous: [],
        missingSourceEventId: [],
      },
      futureBackfillRecommendation: {
        canBackfillAutomatically: false,
        requiresOperatorReview: false,
        recommendedNextAction: 'none',
      },
    }));
  });

  it('classifies hardened, eligible, duplicate, ambiguous, and missing-source finance timeline rows', async () => {
    const prisma = makePrisma();
    (prisma.activity as any).findMany = vi.fn(async () => [
      {
        id: 'activity-hardened',
        tenantId: 'tenant-1',
        accountId: 'acct-1',
        contactId: null,
        dealId: 'deal-1',
        createdAt: new Date('2026-05-20T08:00:00.000Z'),
        customFields: {
          timelineSource: 'finance',
          sourceEventId: 'evt-hardened',
          sourceEventType: 'quote.approved',
          aggregateId: 'quote-1',
          aggregateType: 'quote',
          projectionIdempotencyVersion: 1,
        },
      },
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
      {
        id: 'activity-dup-1',
        tenantId: 'tenant-1',
        accountId: 'acct-1',
        contactId: null,
        dealId: 'deal-1',
        createdAt: new Date('2026-05-20T08:02:00.000Z'),
        customFields: {
          timelineSource: 'finance',
          sourceEventId: 'evt-dup',
          sourceEventType: 'quote.signed',
          aggregateId: 'quote-3',
          aggregateType: 'quote',
        },
      },
      {
        id: 'activity-dup-2',
        tenantId: 'tenant-1',
        accountId: 'acct-1',
        contactId: null,
        dealId: 'deal-1',
        createdAt: new Date('2026-05-20T08:02:01.000Z'),
        customFields: {
          timelineSource: 'finance',
          sourceEventId: 'evt-dup',
          sourceEventType: 'quote.signed',
          aggregateId: 'quote-3',
          aggregateType: 'quote',
        },
      },
      {
        id: 'activity-ambiguous-1',
        tenantId: 'tenant-1',
        accountId: 'acct-1',
        contactId: null,
        dealId: 'deal-1',
        createdAt: new Date('2026-05-20T08:03:00.000Z'),
        customFields: {
          timelineSource: 'finance',
          sourceEventId: 'evt-ambiguous',
          sourceEventType: 'quote.approved',
          aggregateId: 'quote-4',
          aggregateType: 'quote',
        },
      },
      {
        id: 'activity-ambiguous-2',
        tenantId: 'tenant-1',
        accountId: 'acct-2',
        contactId: null,
        dealId: 'deal-1',
        createdAt: new Date('2026-05-20T08:03:01.000Z'),
        customFields: {
          timelineSource: 'finance',
          sourceEventId: 'evt-ambiguous',
          sourceEventType: 'quote.rejected',
          aggregateId: 'quote-4',
          aggregateType: 'quote',
        },
      },
      {
        id: 'activity-missing-source',
        tenantId: 'tenant-1',
        accountId: 'acct-1',
        contactId: null,
        dealId: 'deal-1',
        createdAt: new Date('2026-05-20T08:04:00.000Z'),
        customFields: {
          timelineSource: 'finance',
          sourceEventType: 'quote.approved',
          aggregateId: 'quote-5',
          aggregateType: 'quote',
        },
      },
    ]);

    const report = await analyzeFinanceTimelineIdempotencyReadiness(prisma as never, {
      tenantId: 'tenant-1',
      includeSamples: true,
      limit: 9999,
    });

    expect(report.status).toBe('ambiguous');
    expect(report.counts).toEqual(expect.objectContaining({
      hardenedRows: 1,
      eligibleUniqueHistoricalRows: 1,
      duplicateGroups: 2,
      ambiguousGroups: 1,
      missingSourceEventIdRows: 1,
      sampledRows: 5,
    }));
    expect(report.samples.eligible).toEqual([expect.objectContaining({ activityId: 'activity-eligible', sourceEventId: 'evt-eligible' })]);
    expect(report.samples.duplicates).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceEventId: 'evt-dup', count: 2 }),
      expect.objectContaining({ sourceEventId: 'evt-ambiguous', count: 2 }),
    ]));
    expect(report.samples.ambiguous).toEqual([expect.objectContaining({ sourceEventId: 'evt-ambiguous', count: 2 })]);
    expect(report.samples.missingSourceEventId).toEqual([expect.objectContaining({ activityId: 'activity-missing-source' })]);
    expect(report.futureBackfillRecommendation).toEqual({
      canBackfillAutomatically: false,
      requiresOperatorReview: true,
      recommendedNextAction: 'review_duplicates',
    });
    expect(prisma.activity.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: 'tenant-1' }),
      take: 500,
    }));
    expect(prisma.activity.create).not.toHaveBeenCalled();
  });

  it('reports automatic backfill readiness for unique historical rows only', async () => {
    const prisma = makePrisma();
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

    const report = await analyzeFinanceTimelineIdempotencyReadiness(prisma as never, { tenantId: 'tenant-1' });

    expect(report.status).toBe('ready');
    expect(report.futureBackfillRecommendation).toEqual({
      canBackfillAutomatically: true,
      requiresOperatorReview: false,
      recommendedNextAction: 'prepare_backfill_plan',
    });
    expect(report.samples).toEqual({
      eligible: [],
      duplicates: [],
      ambiguous: [],
      missingSourceEventId: [],
    });
  });

  it('paginates readiness items with an opaque cursor and category filter', async () => {
    const prisma = makePrisma();
    (prisma.activity as any).findMany = vi.fn(async () => [
      {
        id: 'activity-eligible-1',
        tenantId: 'tenant-1',
        accountId: 'acct-1',
        contactId: null,
        dealId: 'deal-1',
        createdAt: new Date('2026-05-20T08:01:00.000Z'),
        customFields: {
          timelineSource: 'finance',
          sourceEventId: 'evt-eligible-1',
          sourceEventType: 'quote.sent',
          aggregateId: 'quote-1',
          aggregateType: 'quote',
        },
      },
      {
        id: 'activity-eligible-2',
        tenantId: 'tenant-1',
        accountId: 'acct-1',
        contactId: null,
        dealId: 'deal-1',
        createdAt: new Date('2026-05-20T08:02:00.000Z'),
        customFields: {
          timelineSource: 'finance',
          sourceEventId: 'evt-eligible-2',
          sourceEventType: 'quote.sent',
          aggregateId: 'quote-2',
          aggregateType: 'quote',
        },
      },
      {
        id: 'activity-eligible-3',
        tenantId: 'tenant-1',
        accountId: 'acct-1',
        contactId: null,
        dealId: 'deal-1',
        createdAt: new Date('2026-05-20T08:03:00.000Z'),
        customFields: {
          timelineSource: 'finance',
          sourceEventId: 'evt-eligible-3',
          sourceEventType: 'quote.sent',
          aggregateId: 'quote-3',
          aggregateType: 'quote',
        },
      },
    ]);

    const firstPage = await analyzeFinanceTimelineIdempotencyReadiness(prisma as never, {
      tenantId: 'tenant-1',
      category: 'eligible',
      limit: 2,
    });

    expect(firstPage.items).toEqual([
      expect.objectContaining({ activityId: 'activity-eligible-1' }),
      expect.objectContaining({ activityId: 'activity-eligible-2' }),
    ]);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.nextCursor).toEqual(expect.any(String));

    const secondPage = await analyzeFinanceTimelineIdempotencyReadiness(prisma as never, {
      tenantId: 'tenant-1',
      category: 'eligible',
      limit: 2,
      cursor: firstPage.nextCursor,
    });

    expect(secondPage.items).toEqual([expect.objectContaining({ activityId: 'activity-eligible-3' })]);
    expect(secondPage.hasMore).toBe(false);
    expect(secondPage.nextCursor).toBeNull();
    expect(prisma.activity.create).not.toHaveBeenCalled();
  });

  it('does not treat the same sourceEventId in different tenants as a duplicate group', async () => {
    const prisma = makePrisma();
    (prisma.activity as any).findMany = vi.fn(async () => [
      {
        id: 'activity-tenant-1',
        tenantId: 'tenant-1',
        accountId: 'acct-1',
        contactId: null,
        dealId: 'deal-1',
        createdAt: new Date('2026-05-20T08:01:00.000Z'),
        customFields: {
          timelineSource: 'finance',
          sourceEventId: 'evt-shared',
          sourceEventType: 'quote.sent',
          aggregateId: 'quote-1',
          aggregateType: 'quote',
        },
      },
      {
        id: 'activity-tenant-2',
        tenantId: 'tenant-2',
        accountId: 'acct-2',
        contactId: null,
        dealId: 'deal-2',
        createdAt: new Date('2026-05-20T08:02:00.000Z'),
        customFields: {
          timelineSource: 'finance',
          sourceEventId: 'evt-shared',
          sourceEventType: 'quote.sent',
          aggregateId: 'quote-2',
          aggregateType: 'quote',
        },
      },
    ]);

    const report = await analyzeFinanceTimelineIdempotencyReadiness(prisma as never, { includeSamples: true });

    expect(report.counts.duplicateGroups).toBe(0);
    expect(report.counts.eligibleUniqueHistoricalRows).toBe(2);
    expect(report.samples.eligible).toEqual(expect.arrayContaining([
      expect.objectContaining({ activityId: 'activity-tenant-1' }),
      expect.objectContaining({ activityId: 'activity-tenant-2' }),
    ]));
  });

  it('creates a dry-run-only idempotency backfill plan with approval gates and blockers', async () => {
    const prisma = makePrisma();
    (prisma.activity as any).findMany = vi.fn(async () => [
      {
        id: 'activity-hardened',
        tenantId: 'tenant-1',
        accountId: 'acct-1',
        contactId: null,
        dealId: 'deal-1',
        createdAt: new Date('2026-05-20T08:00:00.000Z'),
        customFields: {
          timelineSource: 'finance',
          sourceEventId: 'evt-hardened',
          sourceEventType: 'quote.approved',
          aggregateId: 'quote-1',
          aggregateType: 'quote',
          projectionIdempotencyVersion: 1,
        },
      },
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
      {
        id: 'activity-dup-1',
        tenantId: 'tenant-1',
        accountId: 'acct-1',
        contactId: null,
        dealId: 'deal-1',
        createdAt: new Date('2026-05-20T08:02:00.000Z'),
        customFields: {
          timelineSource: 'finance',
          sourceEventId: 'evt-dup',
          sourceEventType: 'quote.signed',
          aggregateId: 'quote-3',
          aggregateType: 'quote',
        },
      },
      {
        id: 'activity-dup-2',
        tenantId: 'tenant-1',
        accountId: 'acct-1',
        contactId: null,
        dealId: 'deal-1',
        createdAt: new Date('2026-05-20T08:02:01.000Z'),
        customFields: {
          timelineSource: 'finance',
          sourceEventId: 'evt-dup',
          sourceEventType: 'quote.signed',
          aggregateId: 'quote-3',
          aggregateType: 'quote',
        },
      },
      {
        id: 'activity-missing-source',
        tenantId: 'tenant-1',
        accountId: 'acct-1',
        contactId: null,
        dealId: 'deal-1',
        createdAt: new Date('2026-05-20T08:03:00.000Z'),
        customFields: {
          timelineSource: 'finance',
          sourceEventType: 'quote.expired',
          aggregateId: 'quote-4',
          aggregateType: 'quote',
        },
      },
    ]);

    const plan = await createFinanceTimelineIdempotencyBackfillPlan(prisma as never, {
      tenantId: 'tenant-1',
      operatorReason: 'Prepare historical timeline idempotency backfill',
      includeSamples: true,
    });

    expect(plan).toEqual(expect.objectContaining({
      dryRun: true,
      executed: false,
      planHash: expect.any(String),
      operatorReason: 'Prepare historical timeline idempotency backfill',
      tenantId: 'tenant-1',
      counts: expect.objectContaining({
        wouldMarkVersion1: 1,
        blockedDuplicateGroups: 1,
        blockedAmbiguousGroups: 0,
        blockedMissingSourceEventIdRows: 1,
        alreadyHardenedRows: 1,
        unsafeRows: 1,
      }),
      approvalGates: {
        requiresOperatorApproval: true,
        requiresDuplicateResolution: true,
        requiresMissingSourceIdResolution: true,
        requiresBackfillMutationEndpoint: true,
      },
      recommendation: 'blocked_by_duplicates',
    }));
    expect(plan.samples?.wouldMarkVersion1).toEqual([expect.objectContaining({ activityId: 'activity-eligible' })]);
    expect(prisma.activity.create).not.toHaveBeenCalled();
    expect(prisma.quote.update).not.toHaveBeenCalled();
  });

  it('executes approved metadata backfill only for eligible unique historical rows', async () => {
    const prisma = makePrisma();
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
          transitionLedgerId: 'ledger-1',
        },
      },
    ];
    (prisma.activity as any).findMany = vi.fn(async () => rows);
    (prisma.activity as any).update = vi.fn(async ({ data }: { data: { customFields: Record<string, unknown> } }) => ({
      ...rows[0],
      customFields: data.customFields,
    }));
    const plan = await createFinanceTimelineIdempotencyBackfillPlan(prisma as never, {
      tenantId: 'tenant-1',
      operatorReason: 'Prepare historical timeline idempotency backfill',
      includeSamples: true,
    });

    const result = await executeFinanceTimelineIdempotencyBackfill(prisma as never, {
      tenantId: 'tenant-1',
      operatorId: 'ops-1',
      operatorReason: 'Prepare historical timeline idempotency backfill',
      approvalReason: 'Approved by data governance',
      dryRunOperationId: plan.operationId,
      planHash: plan.planHash,
      activityIds: ['activity-eligible'],
      execute: true,
      confirmation: 'BACKFILL_FINANCE_TIMELINE_IDEMPOTENCY',
    });

    expect(result).toEqual(expect.objectContaining({
      executed: true,
      dryRunRequired: true,
      status: 'completed',
      counts: expect.objectContaining({
        requested: 1,
        validatedEligible: 1,
        updated: 1,
        alreadyHardened: 0,
        blockedDuplicate: 0,
        blockedMissingSourceEventId: 0,
        failed: 0,
      }),
      updatedActivityIds: ['activity-eligible'],
    }));
    expect(prisma.activity.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'activity-eligible' },
      data: expect.objectContaining({
        customFields: expect.objectContaining({
          timelineSource: 'finance',
          sourceEventId: 'evt-eligible',
          sourceEventType: 'quote.sent',
          aggregateId: 'quote-2',
          aggregateType: 'quote',
          transitionLedgerId: 'ledger-1',
          projectionIdempotencyVersion: 1,
          idempotencyBackfillOperationId: result.operationId,
          idempotencyBackfillReason: 'Prepare historical timeline idempotency backfill',
        }),
      }),
    }));
    expect(prisma.quote.update).not.toHaveBeenCalled();
  });

  it('blocks execution when plan hash no longer matches current eligibility state', async () => {
    const prisma = makePrisma();
    (prisma.activity as any).findMany = vi.fn(async () => [
      {
        id: 'activity-eligible',
        tenantId: 'tenant-1',
        createdAt: new Date('2026-05-20T08:01:00.000Z'),
        customFields: {
          timelineSource: 'finance',
          sourceEventId: 'evt-eligible',
          sourceEventType: 'quote.sent',
          aggregateId: 'quote-2',
          aggregateType: 'quote',
        },
      },
      {
        id: 'activity-new-duplicate',
        tenantId: 'tenant-1',
        createdAt: new Date('2026-05-20T08:02:00.000Z'),
        customFields: {
          timelineSource: 'finance',
          sourceEventId: 'evt-eligible',
          sourceEventType: 'quote.sent',
          aggregateId: 'quote-2',
          aggregateType: 'quote',
        },
      },
    ]);

    const result = await executeFinanceTimelineIdempotencyBackfill(prisma as never, {
      tenantId: 'tenant-1',
      operatorId: 'ops-1',
      operatorReason: 'Prepare historical timeline idempotency backfill',
      approvalReason: 'Approved by data governance',
      planHash: 'stale-plan-hash',
      activityIds: ['activity-eligible'],
      execute: true,
      confirmation: 'BACKFILL_FINANCE_TIMELINE_IDEMPOTENCY',
    });

    expect(result.status).toBe('blocked');
    expect(result.errors).toEqual(expect.arrayContaining(['Plan hash does not match current finance timeline idempotency state.']));
    expect(result.counts.blockedDuplicate).toBe(1);
    expect(prisma.activity.update).not.toHaveBeenCalled();
  });

  it('blocks duplicate, missing source, non-finance, tenant mismatch, and already hardened rows without deleting activity', async () => {
    const prisma = makePrisma();
    const rows = [
      {
        id: 'activity-dup-1',
        tenantId: 'tenant-1',
        createdAt: new Date('2026-05-20T08:01:00.000Z'),
        customFields: { timelineSource: 'finance', sourceEventId: 'evt-dup', sourceEventType: 'quote.sent' },
      },
      {
        id: 'activity-dup-2',
        tenantId: 'tenant-1',
        createdAt: new Date('2026-05-20T08:02:00.000Z'),
        customFields: { timelineSource: 'finance', sourceEventId: 'evt-dup', sourceEventType: 'quote.sent' },
      },
      {
        id: 'activity-missing-source',
        tenantId: 'tenant-1',
        createdAt: new Date('2026-05-20T08:03:00.000Z'),
        customFields: { timelineSource: 'finance', sourceEventType: 'quote.sent' },
      },
      {
        id: 'activity-non-finance',
        tenantId: 'tenant-1',
        createdAt: new Date('2026-05-20T08:04:00.000Z'),
        customFields: { timelineSource: 'sales', sourceEventId: 'evt-sales' },
      },
      {
        id: 'activity-other-tenant',
        tenantId: 'tenant-2',
        createdAt: new Date('2026-05-20T08:05:00.000Z'),
        customFields: { timelineSource: 'finance', sourceEventId: 'evt-other', sourceEventType: 'quote.sent' },
      },
      {
        id: 'activity-hardened',
        tenantId: 'tenant-1',
        createdAt: new Date('2026-05-20T08:06:00.000Z'),
        customFields: { timelineSource: 'finance', sourceEventId: 'evt-hardened', sourceEventType: 'quote.sent', projectionIdempotencyVersion: 1 },
      },
    ];
    (prisma.activity as any).findMany = vi.fn(async () => rows);

    const currentPlan = await createFinanceTimelineIdempotencyBackfillPlan(prisma as never, {
      tenantId: 'tenant-1',
      operatorReason: 'Prepare historical timeline idempotency backfill',
    });
    const result = await executeFinanceTimelineIdempotencyBackfill(prisma as never, {
      tenantId: 'tenant-1',
      operatorId: 'ops-1',
      operatorReason: 'Prepare historical timeline idempotency backfill',
      approvalReason: 'Approved by data governance',
      planHash: currentPlan.planHash,
      activityIds: rows.map((row) => row.id),
      execute: true,
      confirmation: 'BACKFILL_FINANCE_TIMELINE_IDEMPOTENCY',
    });

    expect(result.status).toBe('blocked');
    expect(result.counts).toEqual(expect.objectContaining({
      requested: 6,
      updated: 0,
      alreadyHardened: 1,
      blockedDuplicate: 2,
      blockedMissingSourceEventId: 1,
      blockedUnsafe: 2,
    }));
    expect(result.blocked).toEqual(expect.arrayContaining([
      expect.objectContaining({ activityId: 'activity-dup-1', reason: 'duplicate_source_event_id' }),
      expect.objectContaining({ activityId: 'activity-missing-source', reason: 'missing_source_event_id' }),
      expect.objectContaining({ activityId: 'activity-non-finance', reason: 'not_finance_timeline' }),
      expect.objectContaining({ activityId: 'activity-other-tenant', reason: 'tenant_mismatch' }),
      expect.objectContaining({ activityId: 'activity-hardened', reason: 'already_hardened' }),
    ]));
    expect(prisma.activity.update).not.toHaveBeenCalled();
    expect((prisma.activity as any).delete).toBeUndefined();
    expect((prisma.activity as any).deleteMany).toBeUndefined();
  });

  it('handles a unique conflict during execution as a duplicate blocker', async () => {
    const prisma = makePrisma();
    const rows = [
      {
        id: 'activity-eligible',
        tenantId: 'tenant-1',
        createdAt: new Date('2026-05-20T08:01:00.000Z'),
        customFields: {
          timelineSource: 'finance',
          sourceEventId: 'evt-eligible',
          sourceEventType: 'quote.sent',
          aggregateId: 'quote-2',
          aggregateType: 'quote',
        },
      },
    ];
    (prisma.activity as any).findMany = vi.fn(async () => rows);
    (prisma.activity as any).update = vi.fn(async () => {
      const error = new Error('Unique constraint failed');
      (error as { code?: string }).code = 'P2002';
      throw error;
    });
    const plan = await createFinanceTimelineIdempotencyBackfillPlan(prisma as never, {
      tenantId: 'tenant-1',
      operatorReason: 'Prepare historical timeline idempotency backfill',
    });

    const result = await executeFinanceTimelineIdempotencyBackfill(prisma as never, {
      tenantId: 'tenant-1',
      operatorId: 'ops-1',
      operatorReason: 'Prepare historical timeline idempotency backfill',
      approvalReason: 'Approved by data governance',
      planHash: plan.planHash,
      activityIds: ['activity-eligible'],
      execute: true,
      confirmation: 'BACKFILL_FINANCE_TIMELINE_IDEMPOTENCY',
    });

    expect(result.status).toBe('completed_with_warnings');
    expect(result.counts.updated).toBe(0);
    expect(result.counts.blockedDuplicate).toBe(1);
    expect(result.blocked).toEqual([expect.objectContaining({ activityId: 'activity-eligible', reason: 'unique_constraint_conflict' })]);
  });

  it('returns a governed unsupported replay report without mutating CPQ state', async () => {
    const prisma = makePrisma();

    await expect(getFinanceTimelineReplayReport(prisma as never, {
      tenantId: 'tenant-1',
      aggregateId: 'quote-1',
      operatorId: 'ops-1',
      reason: 'Rebuild finance activity timeline after outage',
    })).resolves.toEqual(expect.objectContaining({
      projection: 'financeTimeline',
      dryRun: true,
      tenantId: 'tenant-1',
      operatorId: 'ops-1',
      reason: 'Rebuild finance activity timeline after outage',
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
      candidateCount: 3,
      events: [],
    }));

    await expect(getFinanceTimelineReplayReport(prisma as never, {
      tenantId: 'tenant-1',
      aggregateId: 'quote-1',
      sourceEventTypes: ['quote.approved'],
      operatorId: 'ops-1',
      reason: 'Check source availability',
      eventSource,
    })).resolves.toEqual(expect.objectContaining({
      projection: 'financeTimeline',
      eventSourceAvailable: true,
      eventSourceEndpoint: 'http://finance/api/v1/internal/events/finance',
      candidateCount: 3,
      status: 'dry_run',
    }));
    expect(eventSource).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1',
      aggregateId: 'quote-1',
      sourceEventTypes: ['quote.approved'],
    }));
  });

  it('dry-runs finance timeline replay without writing Activity', async () => {
    const prisma = makePrisma();
    const eventSource = vi.fn(async () => ({
      available: true,
      endpoint: 'http://finance/api/v1/internal/events/finance',
      candidateCount: 1,
      events: [{
        eventId: 'finance-timeline-replay-1',
        eventType: 'quote.approved',
        tenantId: 'tenant-1',
        aggregateType: 'quote',
        aggregateId: 'quote-1',
        occurredAt: '2026-05-20T08:00:00.000Z',
        correlationId: 'corr-1',
        transitionLedgerId: 'ledger-1',
        payload: {
          quoteId: 'quote-1',
          quoteNumber: 'Q-100',
          accountId: 'acct-1',
          dealId: 'deal-1',
          status: 'APPROVED',
        },
      }],
    }));

    const report = await getFinanceTimelineReplayReport(prisma as never, {
      tenantId: 'tenant-1',
      aggregateId: 'quote-1',
      sourceEventTypes: ['quote.approved'],
      operatorId: 'ops-1',
      reason: 'Dry-run timeline replay',
      eventSource,
    });

    expect(report).toEqual(expect.objectContaining({
      projection: 'financeTimeline',
      dryRun: true,
      executed: false,
      status: 'dry_run',
      counts: expect.objectContaining({
        candidates: 1,
        processed: 0,
        created: 1,
        skipped: 0,
        duplicate: 0,
        failed: 0,
      }),
    }));
    expect(prisma.activity.create).not.toHaveBeenCalled();
    expect(prisma.quote.create).not.toHaveBeenCalled();
    expect(prisma.quote.update).not.toHaveBeenCalled();
  });

  it('executes finance timeline replay through the existing Activity projector only', async () => {
    const prisma = makePrisma();
    const eventSource = vi.fn(async () => ({
      available: true,
      endpoint: 'http://finance/api/v1/internal/events/finance',
      candidateCount: 1,
      events: [{
        eventId: 'finance-timeline-replay-2',
        eventType: 'quote.approved',
        tenantId: 'tenant-1',
        aggregateType: 'quote',
        aggregateId: 'quote-1',
        occurredAt: '2026-05-20T08:00:00.000Z',
        correlationId: 'corr-2',
        transitionLedgerId: 'ledger-2',
        payload: {
          quoteId: 'quote-1',
          quoteNumber: 'Q-100',
          accountId: 'acct-1',
          dealId: 'deal-1',
          status: 'APPROVED',
        },
      }],
    }));

    const report = await getFinanceTimelineReplayReport(prisma as never, {
      tenantId: 'tenant-1',
      aggregateId: 'quote-1',
      sourceEventTypes: ['quote.approved'],
      dryRun: false,
      execute: true,
      operatorId: 'ops-1',
      reason: 'Execute timeline replay',
      eventSource,
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
    expect(prisma.activity.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        customFields: expect.objectContaining({
          sourceEventId: 'finance-timeline-replay-2',
          transitionLedgerId: 'ledger-2',
        }),
      }),
    }));
    expect(prisma.quote.create).not.toHaveBeenCalled();
    expect(prisma.quote.update).not.toHaveBeenCalled();
  });

  it('skips duplicate finance timeline events during replay execution', async () => {
    const prisma = makePrisma({ id: 'activity-existing' });
    const eventSource = vi.fn(async () => ({
      available: true,
      endpoint: 'http://finance/api/v1/internal/events/finance',
      candidateCount: 1,
      events: [{
        eventId: 'finance-timeline-replay-3',
        eventType: 'quote.approved',
        tenantId: 'tenant-1',
        aggregateType: 'quote',
        aggregateId: 'quote-1',
        occurredAt: '2026-05-20T08:00:00.000Z',
        payload: { quoteId: 'quote-1', accountId: 'acct-1' },
      }],
    }));

    const report = await getFinanceTimelineReplayReport(prisma as never, {
      tenantId: 'tenant-1',
      aggregateId: 'quote-1',
      sourceEventTypes: ['quote.approved'],
      dryRun: false,
      execute: true,
      operatorId: 'ops-1',
      reason: 'Replay duplicate safely',
      eventSource,
    });

    expect(report.counts).toEqual(expect.objectContaining({ candidates: 1, duplicate: 1, processed: 0 }));
    expect(prisma.activity.create).not.toHaveBeenCalled();
  });

  it('counts database-level duplicate protection during replay execution', async () => {
    const prisma = makePrisma();
    (prisma.activity as any).create = vi.fn(async () => {
      const error = new Error('Unique constraint failed on finance source event');
      (error as { code?: string }).code = 'P2002';
      throw error;
    });
    const eventSource = vi.fn(async () => ({
      available: true,
      endpoint: 'http://finance/api/v1/internal/events/finance',
      candidateCount: 1,
      events: [{
        eventId: 'finance-timeline-race-duplicate',
        eventType: 'quote.approved',
        tenantId: 'tenant-1',
        aggregateType: 'quote',
        aggregateId: 'quote-1',
        occurredAt: '2026-05-20T08:00:00.000Z',
        payload: { quoteId: 'quote-1', accountId: 'acct-1' },
      }],
    }));

    const report = await getFinanceTimelineReplayReport(prisma as never, {
      tenantId: 'tenant-1',
      aggregateId: 'quote-1',
      sourceEventTypes: ['quote.approved'],
      dryRun: false,
      execute: true,
      operatorId: 'ops-1',
      reason: 'Replay duplicate safely under race',
      eventSource,
    });

    expect(report.counts).toEqual(expect.objectContaining({ candidates: 1, duplicate: 1, processed: 0, failed: 0 }));
  });
});
