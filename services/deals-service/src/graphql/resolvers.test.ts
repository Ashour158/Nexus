import { describe, expect, it, vi } from 'vitest';
import { resolvers } from './resolvers.js';

function makeContext() {
  return {
    tenantId: 'tenant_1',
    userId: 'user_1',
    // Verified-token claims the resolver guards read (quotes:read for reads).
    permissions: ['quotes:read', 'deals:read', 'deals:create', 'deals:update', 'deals:delete'],
    roles: ['SALES_REP'],
    prisma: {
      quote: {
        create: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        updateMany: vi.fn(),
        deleteMany: vi.fn(),
      },
      quoteProjection: {
        findMany: vi.fn(async () => [{
          id: 'proj_1',
          tenantId: 'tenant_1',
          quoteId: 'quote_1',
          dealId: 'deal_1',
          quoteNumber: 'QUO-1',
          status: 'APPROVED',
          currency: 'USD',
          totalAmount: { toNumber: () => 120 },
          projectionVersion: 2,
          projectedAt: new Date('2026-01-01T00:00:00.000Z'),
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        }]),
        findFirst: vi.fn(async () => ({
          id: 'proj_1',
          tenantId: 'tenant_1',
          quoteId: 'quote_1',
          dealId: 'deal_1',
          quoteNumber: 'QUO-1',
          status: 'APPROVED',
          currency: 'USD',
          totalAmount: { toNumber: () => 120 },
          projectionVersion: 2,
          projectedAt: new Date('2026-01-01T00:00:00.000Z'),
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        })),
      },
    },
  };
}

describe('deals GraphQL CPQ authority', () => {
  it('reads quotes from QuoteProjection rather than legacy quote tables', async () => {
    const ctx = makeContext();

    const records = await resolvers.Query.quotes(null, { limit: 10, offset: 0 }, ctx as never);
    const record = await resolvers.Query.quote(null, { id: 'quote_1' }, ctx as never);

    expect(records[0]).toEqual(expect.objectContaining({ id: 'quote_1', status: 'APPROVED', total: 120 }));
    expect(record).toEqual(expect.objectContaining({ id: 'quote_1', quoteNumber: 'QUO-1' }));
    expect(ctx.prisma.quote.findMany).not.toHaveBeenCalled();
    expect(ctx.prisma.quote.findFirst).not.toHaveBeenCalled();
    expect(ctx.prisma.quoteProjection.findMany).toHaveBeenCalled();
    expect(ctx.prisma.quoteProjection.findFirst).toHaveBeenCalled();
  });

  it('rejects direct quote mutations because finance-service owns CPQ authority', async () => {
    const ctx = makeContext();

    await expect(
      resolvers.Mutation.createQuote(null, { input: { name: 'Unsafe quote' } }, ctx as never)
    ).rejects.toMatchObject({
      message: 'Quote mutations have moved to finance-service authority.',
      extensions: expect.objectContaining({ code: 'CPQ_MUTATION_DISABLED', status: 410 }),
    });
    await expect(
      resolvers.Mutation.updateQuote(null, { id: 'quote_1', input: { status: 'APPROVED' } }, ctx as never)
    ).rejects.toMatchObject({
      message: 'Quote mutations have moved to finance-service authority.',
      extensions: expect.objectContaining({ code: 'CPQ_MUTATION_DISABLED', status: 410 }),
    });
    await expect(
      resolvers.Mutation.deleteQuote(null, { id: 'quote_1' }, ctx as never)
    ).rejects.toMatchObject({
      message: 'Quote mutations have moved to finance-service authority.',
      extensions: expect.objectContaining({ code: 'CPQ_MUTATION_DISABLED', status: 410 }),
    });

    expect(ctx.prisma.quote.create).not.toHaveBeenCalled();
    expect(ctx.prisma.quote.updateMany).not.toHaveBeenCalled();
    expect(ctx.prisma.quote.deleteMany).not.toHaveBeenCalled();
  });
});
