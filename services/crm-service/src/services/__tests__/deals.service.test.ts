import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BusinessRuleError,
  NotFoundError,
} from '@nexus/service-utils';
import { Prisma } from '../../../../../node_modules/.prisma/crm-client/index.js';
import { createDealsService } from '../deals.service.js';

/**
 * Unit tests for the deals service (Section 34.2). All Prisma and Kafka
 * dependencies are mocked with `vi.fn()` — no DB or broker is started. We
 * exercise the branches listed in the Cursor prompt plus supporting paths
 * that guarantee the service honours multi-tenant isolation.
 */

const TENANT = 'tenant_1';
const OTHER_TENANT = 'tenant_2';

function makeDeal(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'deal_1',
    tenantId: TENANT,
    ownerId: 'user_1',
    accountId: 'acc_1',
    pipelineId: 'pipe_1',
    stageId: 'stage_1',
    name: 'Acme Expansion',
    amount: new Prisma.Decimal(100_000),
    currency: 'USD',
    probability: 40,
    status: 'OPEN',
    forecastCategory: 'PIPELINE',
    expectedCloseDate: null,
    actualCloseDate: null,
    source: null,
    campaignId: null,
    customFields: {},
    tags: [] as string[],
    lostReason: null,
    lostDetail: null,
    meddicicData: {},
    meddicicScore: null,
    aiWinProbability: null,
    aiInsights: null,
    version: 1,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...over,
  };
}

function makeStage(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'stage_1',
    tenantId: TENANT,
    pipelineId: 'pipe_1',
    name: 'Prospecting',
    probability: 40,
    rottenDays: 14,
    ...over,
  };
}

function makePipeline(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'pipe_1',
    tenantId: TENANT,
    name: 'Default',
    isActive: true,
    ...over,
  };
}

function makeAccount(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'acc_1',
    tenantId: TENANT,
    name: 'Acme',
    ...over,
  };
}

function buildPrismaMock() {
  return {
    deal: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    account: { findFirst: vi.fn() },
    pipeline: { findFirst: vi.fn() },
    stage: { findFirst: vi.fn() },
    contact: { findMany: vi.fn(), findFirst: vi.fn() },
    dealContact: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    activity: { findMany: vi.fn() },
    note: { findMany: vi.fn() },
    quote: { count: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
  };
}

function buildProducerMock() {
  return { publish: vi.fn().mockResolvedValue(undefined) } as unknown as {
    publish: ReturnType<typeof vi.fn>;
  };
}

type PrismaMock = ReturnType<typeof buildPrismaMock>;

function makeService() {
  const prisma = buildPrismaMock();
  const producer = buildProducerMock();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createDealsService(prisma as any, producer as any);
  return { prisma, producer, service };
}

// ─── createDeal ──────────────────────────────────────────────────────────────

describe('createDeal', () => {
  let ctx: ReturnType<typeof makeService>;

  beforeEach(() => {
    ctx = makeService();
  });

  function primeOk(prisma: PrismaMock) {
    prisma.account.findFirst.mockResolvedValue(makeAccount());
    prisma.pipeline.findFirst.mockResolvedValue(makePipeline());
    prisma.stage.findFirst.mockResolvedValue(makeStage());
    prisma.contact.findMany.mockResolvedValue([]);
    prisma.deal.create.mockResolvedValue(makeDeal());
  }

  it('throws NotFoundError when accountId not in tenant', async () => {
    ctx.prisma.account.findFirst.mockResolvedValue(null);
    ctx.prisma.pipeline.findFirst.mockResolvedValue(makePipeline());
    ctx.prisma.stage.findFirst.mockResolvedValue(makeStage());

    await expect(
      ctx.service.createDeal(TENANT, {
        name: 'X',
        accountId: 'acc_missing',
        pipelineId: 'pipe_1',
        stageId: 'stage_1',
        ownerId: 'user_1',
        amount: 10,
      } as never)
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws BusinessRuleError when stage not in pipeline', async () => {
    ctx.prisma.account.findFirst.mockResolvedValue(makeAccount());
    ctx.prisma.pipeline.findFirst.mockResolvedValue(makePipeline());
    ctx.prisma.stage.findFirst.mockResolvedValue(
      makeStage({ pipelineId: 'other_pipe' })
    );

    await expect(
      ctx.service.createDeal(TENANT, {
        name: 'X',
        accountId: 'acc_1',
        pipelineId: 'pipe_1',
        stageId: 'stage_1',
        ownerId: 'user_1',
        amount: 10,
      } as never)
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('publishes deal.created Kafka event on success', async () => {
    primeOk(ctx.prisma);

    await ctx.service.createDeal(TENANT, {
      name: 'X',
      accountId: 'acc_1',
      pipelineId: 'pipe_1',
      stageId: 'stage_1',
      ownerId: 'user_1',
      amount: 5_000,
      currency: 'USD',
    } as never);

    expect(ctx.producer.publish).toHaveBeenCalledTimes(1);
    const [topic, event] = ctx.producer.publish.mock.calls[0];
    expect(topic).toContain('deals');
    expect(event.type).toBe('deal.created');
    expect(event.tenantId).toBe(TENANT);
    expect(event.payload.dealId).toBe('deal_1');
    expect(event.payload.amount).toBe(100_000);
  });

  it('sets probability from stage default when not provided', async () => {
    primeOk(ctx.prisma);
    ctx.prisma.stage.findFirst.mockResolvedValue(makeStage({ probability: 72 }));

    await ctx.service.createDeal(TENANT, {
      name: 'X',
      accountId: 'acc_1',
      pipelineId: 'pipe_1',
      stageId: 'stage_1',
      ownerId: 'user_1',
      amount: 10,
    } as never);

    expect(ctx.prisma.deal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ probability: 72 }),
      })
    );
  });

  it('links contact IDs via DealContact create', async () => {
    primeOk(ctx.prisma);
    ctx.prisma.contact.findMany.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);

    await ctx.service.createDeal(TENANT, {
      name: 'X',
      accountId: 'acc_1',
      pipelineId: 'pipe_1',
      stageId: 'stage_1',
      ownerId: 'user_1',
      amount: 10,
      contactIds: ['c1', 'c2'],
    } as never);

    const args = ctx.prisma.deal.create.mock.calls[0][0];
    expect(args.data.contacts.create).toEqual([
      { contactId: 'c1', isPrimary: true },
      { contactId: 'c2', isPrimary: false },
    ]);
  });
});

// ─── markDealWon ─────────────────────────────────────────────────────────────

describe('markDealWon', () => {
  let ctx: ReturnType<typeof makeService>;

  beforeEach(() => {
    ctx = makeService();
  });

  it('throws BusinessRuleError when deal is LOST', async () => {
    ctx.prisma.deal.findFirst.mockResolvedValue(makeDeal({ status: 'LOST' }));
    await expect(ctx.service.markDealWon(TENANT, 'deal_1')).rejects.toBeInstanceOf(
      BusinessRuleError
    );
  });

  it('sets status=WON, probability=100, actualCloseDate', async () => {
    ctx.prisma.deal.findFirst.mockResolvedValue(makeDeal());
    ctx.prisma.deal.update.mockResolvedValue(
      makeDeal({ status: 'WON', probability: 100 })
    );

    await ctx.service.markDealWon(TENANT, 'deal_1');

    const args = ctx.prisma.deal.update.mock.calls[0][0];
    expect(args.data.status).toBe('WON');
    expect(args.data.probability).toBe(100);
    expect(args.data.actualCloseDate).toBeInstanceOf(Date);
    expect(args.data.forecastCategory).toBe('CLOSED');
    expect(args.data.version).toEqual({ increment: 1 });
  });

  it('publishes deal.won with correct payload', async () => {
    ctx.prisma.deal.findFirst.mockResolvedValue(makeDeal());
    ctx.prisma.deal.update.mockResolvedValue(
      makeDeal({ status: 'WON', probability: 100, currency: 'EUR' })
    );

    await ctx.service.markDealWon(TENANT, 'deal_1');

    const [topic, event] = ctx.producer.publish.mock.calls[0];
    expect(topic).toContain('deals');
    expect(event.type).toBe('deal.won');
    expect(event.payload).toMatchObject({
      dealId: 'deal_1',
      ownerId: 'user_1',
      accountId: 'acc_1',
      currency: 'EUR',
      amount: 100_000,
    });
  });

  it('is idempotent when already WON', async () => {
    ctx.prisma.deal.findFirst.mockResolvedValue(makeDeal({ status: 'WON' }));
    const result = await ctx.service.markDealWon(TENANT, 'deal_1');
    expect(result.status).toBe('WON');
    expect(ctx.prisma.deal.update).not.toHaveBeenCalled();
    expect(ctx.producer.publish).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when deal not in tenant', async () => {
    ctx.prisma.deal.findFirst.mockResolvedValue(null);
    await expect(
      ctx.service.markDealWon(OTHER_TENANT, 'deal_1')
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ─── moveDealToStage ─────────────────────────────────────────────────────────

describe('moveDealToStage', () => {
  let ctx: ReturnType<typeof makeService>;

  beforeEach(() => {
    ctx = makeService();
  });

  it('throws BusinessRuleError when stage is in different pipeline', async () => {
    ctx.prisma.deal.findFirst.mockResolvedValue(makeDeal());
    ctx.prisma.stage.findFirst.mockResolvedValue(
      makeStage({ id: 'stage_x', pipelineId: 'other_pipe' })
    );

    await expect(
      ctx.service.moveDealToStage(TENANT, 'deal_1', 'stage_x')
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('publishes deal.stage_changed with previousStageId and newStageId', async () => {
    ctx.prisma.deal.findFirst.mockResolvedValue(makeDeal());
    ctx.prisma.stage.findFirst.mockResolvedValue(
      makeStage({ id: 'stage_2', probability: 60 })
    );
    ctx.prisma.deal.update.mockResolvedValue(
      makeDeal({ stageId: 'stage_2', probability: 60 })
    );

    await ctx.service.moveDealToStage(TENANT, 'deal_1', 'stage_2');

    const [, event] = ctx.producer.publish.mock.calls[0];
    expect(event.type).toBe('deal.stage_changed');
    expect(event.payload).toMatchObject({
      dealId: 'deal_1',
      previousStageId: 'stage_1',
      newStageId: 'stage_2',
      ownerId: 'user_1',
    });
  });

  it('returns existing deal unchanged when stageId is the same', async () => {
    const existing = makeDeal({ stageId: 'stage_1' });
    ctx.prisma.deal.findFirst.mockResolvedValue(existing);
    ctx.prisma.stage.findFirst.mockResolvedValue(makeStage({ id: 'stage_1' }));

    const result = await ctx.service.moveDealToStage(TENANT, 'deal_1', 'stage_1');

    expect(result).toBe(existing);
    expect(ctx.prisma.deal.update).not.toHaveBeenCalled();
    expect(ctx.producer.publish).not.toHaveBeenCalled();
  });
});

// ─── getDealTimeline ─────────────────────────────────────────────────────────

describe('getDealTimeline', () => {
  let ctx: ReturnType<typeof makeService>;

  beforeEach(() => {
    ctx = makeService();
  });

  it('merges activities and notes sorted newest-first', async () => {
    ctx.prisma.deal.findFirst.mockResolvedValue(makeDeal());
    ctx.prisma.activity.findMany.mockResolvedValue([
      {
        id: 'a1',
        type: 'CALL',
        subject: 'Call with champion',
        description: 'discussed pricing',
        status: 'COMPLETED',
        priority: 'NORMAL',
        dueDate: null,
        outcome: 'positive',
        ownerId: 'user_1',
        createdAt: new Date('2026-03-02T12:00:00Z'),
      },
    ]);
    ctx.prisma.note.findMany.mockResolvedValue([
      {
        id: 'n1',
        content: 'Recap',
        isPinned: false,
        authorId: 'user_1',
        createdAt: new Date('2026-03-03T09:00:00Z'),
      },
      {
        id: 'n2',
        content: 'Older note',
        isPinned: true,
        authorId: 'user_1',
        createdAt: new Date('2026-02-01T09:00:00Z'),
      },
    ]);

    const page1 = await ctx.service.getDealTimeline(TENANT, 'deal_1', {
      page: 1,
      limit: 10,
    });

    expect(page1.total).toBe(3);
    expect(page1.data.map((e) => e.id)).toEqual([
      'note:n1',
      'activity:a1',
      'note:n2',
    ]);
  });

  it('paginates correctly', async () => {
    ctx.prisma.deal.findFirst.mockResolvedValue(makeDeal());
    ctx.prisma.activity.findMany.mockResolvedValue(
      Array.from({ length: 3 }, (_, i) => ({
        id: `a${i}`,
        type: 'TASK',
        subject: `task ${i}`,
        description: null,
        status: 'PLANNED',
        priority: 'NORMAL',
        dueDate: null,
        outcome: null,
        ownerId: 'user_1',
        createdAt: new Date(Date.UTC(2026, 0, i + 1)),
      }))
    );
    ctx.prisma.note.findMany.mockResolvedValue([]);

    const page1 = await ctx.service.getDealTimeline(TENANT, 'deal_1', {
      page: 1,
      limit: 2,
    });
    const page2 = await ctx.service.getDealTimeline(TENANT, 'deal_1', {
      page: 2,
      limit: 2,
    });

    expect(page1.data).toHaveLength(2);
    expect(page2.data).toHaveLength(1);
    expect(page1.total).toBe(3);
    expect(page1.totalPages).toBe(2);
    expect(page1.hasNextPage).toBe(true);
    expect(page2.hasPrevPage).toBe(true);
  });
});
