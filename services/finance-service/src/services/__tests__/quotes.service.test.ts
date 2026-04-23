import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../../../../node_modules/.prisma/finance-client/index.js';
import { BusinessRuleError } from '@nexus/service-utils';
import { createQuotesService } from '../quotes.service.js';

const TENANT = 'tenant_1';

function makeQuote(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'q1',
    tenantId: TENANT,
    dealId: 'd1',
    accountId: 'a1',
    ownerId: 'u1',
    quoteNumber: 'QUO-2026-00001',
    name: 'Quote 1',
    status: 'DRAFT',
    version: 1,
    currency: 'USD',
    subtotal: new Prisma.Decimal(1000),
    discountAmount: new Prisma.Decimal(0),
    taxAmount: new Prisma.Decimal(0),
    total: new Prisma.Decimal(1000),
    lineItems: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makePrisma() {
  return {
    quote: {
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) => {
        if (where.id === 'sent') return makeQuote({ id: 'sent', status: 'SENT' });
        if (where.id === 'accepted') return makeQuote({ id: 'accepted', status: 'ACCEPTED' });
        if (where.id === 'expired') return null;
        return makeQuote({ id: where.id, status: 'DRAFT' });
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
        makeQuote({ id: where.id, ...data })
      ),
      count: vi.fn(async () => 3),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) =>
        makeQuote({ id: 'q_copy', ...data })
      ),
      updateMany: vi.fn(async () => ({ count: 2 })),
    },
  };
}

function makeProducer() {
  return { publish: vi.fn(async () => undefined) };
}

describe('sendQuote', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let producer: ReturnType<typeof makeProducer>;
  let svc: ReturnType<typeof createQuotesService>;

  beforeEach(() => {
    prisma = makePrisma();
    producer = makeProducer();
    svc = createQuotesService(prisma as never, producer as never);
  });

  it('throws BusinessRuleError when status is not DRAFT', async () => {
    prisma.quote.findFirst = vi.fn(async (_args: unknown) => makeQuote({ status: 'ACCEPTED' })) as never;
    await expect(svc.sendQuote(TENANT, 'q1')).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('sets sentAt to now, changes status to SENT', async () => {
    const res = await svc.sendQuote(TENANT, 'q1');
    expect((res as { status?: string }).status).toBe('SENT');
    expect((res as { sentAt?: Date }).sentAt).toBeTruthy();
  });

  it('publishes quote.sent event', async () => {
    await svc.sendQuote(TENANT, 'q1');
    expect(producer.publish).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ type: 'quote.sent' })
    );
  });
});

describe('acceptQuote', () => {
  let svc: ReturnType<typeof createQuotesService>;

  beforeEach(() => {
    svc = createQuotesService(makePrisma() as never, makeProducer() as never);
  });

  it('throws BusinessRuleError when status is not SENT', async () => {
    await expect(svc.acceptQuote(TENANT, 'q1')).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('sets acceptedAt, changes status to ACCEPTED', async () => {
    const svc2 = createQuotesService(
      {
        ...makePrisma(),
        quote: {
          ...makePrisma().quote,
          findFirst: vi.fn(async (_args: unknown) => makeQuote({ id: 'sent', status: 'SENT' })) as never,
        },
      } as never,
      makeProducer() as never
    );
    const res = await svc2.acceptQuote(TENANT, 'sent');
    expect((res as { status?: string }).status).toBe('ACCEPTED');
    expect((res as { acceptedAt?: Date }).acceptedAt).toBeTruthy();
  });
});

describe('duplicateQuote', () => {
  it('creates new DRAFT with status=DRAFT, version=1', async () => {
    const svc = createQuotesService(makePrisma() as never, makeProducer() as never);
    const res = await svc.duplicateQuote(TENANT, 'q1');
    expect((res as { status?: string }).status).toBe('DRAFT');
    expect((res as { version?: number }).version).toBe(1);
  });

  it('appends " (Copy)" to the name', async () => {
    const svc = createQuotesService(makePrisma() as never, makeProducer() as never);
    const res = await svc.duplicateQuote(TENANT, 'q1');
    expect((res as { name?: string }).name).toContain(' (Copy)');
  });

  it('copies all line items', async () => {
    const prisma = makePrisma();
    prisma.quote.findFirst = vi.fn(async (_args: unknown) => makeQuote({ lineItems: [{ p: 1 }, { p: 2 }] })) as never;
    const svc = createQuotesService(prisma as never, makeProducer() as never);
    const res = await svc.duplicateQuote(TENANT, 'q1');
    expect((res as { lineItems?: unknown[] }).lineItems).toEqual([{ p: 1 }, { p: 2 }]);
  });
});

describe('expireQuotes', () => {
  it('only expires SENT quotes past expiresAt', async () => {
    const prisma = makePrisma();
    const svc = createQuotesService(prisma as never, makeProducer() as never);
    await svc.expireQuotes(TENANT);
    expect(prisma.quote.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'SENT', expiresAt: expect.any(Object) }),
      })
    );
  });

  it('returns correct count of expired quotes', async () => {
    const svc = createQuotesService(makePrisma() as never, makeProducer() as never);
    const count = await svc.expireQuotes(TENANT);
    expect(count).toBe(2);
  });
});
