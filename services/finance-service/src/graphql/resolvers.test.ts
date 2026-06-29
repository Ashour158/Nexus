import { describe, expect, it, vi } from 'vitest';
import { resolvers } from './resolvers.js';

function makeContext() {
  return {
    tenantId: 'tenant_1',
    userId: 'user_1',
    prisma: {
      quote: {
        create: vi.fn(),
        updateMany: vi.fn(),
        deleteMany: vi.fn(),
      },
    },
  };
}

describe('finance GraphQL CPQ authority', () => {
  it('rejects direct standalone quote creation through GraphQL', async () => {
    const ctx = makeContext();

    await expect(
      resolvers.Mutation.createQuote(null, { input: { name: 'Unsafe quote' } }, ctx as never)
    ).rejects.toMatchObject({
      message: 'Quote mutations have moved to finance-service authority.',
      extensions: expect.objectContaining({ code: 'CPQ_MUTATION_DISABLED', status: 410 }),
    });

    expect(ctx.prisma.quote.create).not.toHaveBeenCalled();
  });

  it('rejects direct quote updates through GraphQL', async () => {
    const ctx = makeContext();

    await expect(
      resolvers.Mutation.updateQuote(null, { id: 'quote_1', input: { status: 'APPROVED' } }, ctx as never)
    ).rejects.toMatchObject({
      message: 'Quote mutations have moved to finance-service authority.',
      extensions: expect.objectContaining({ code: 'CPQ_MUTATION_DISABLED', status: 410 }),
    });

    expect(ctx.prisma.quote.updateMany).not.toHaveBeenCalled();
  });

  it('rejects direct quote deletion through GraphQL', async () => {
    const ctx = makeContext();

    await expect(
      resolvers.Mutation.deleteQuote(null, { id: 'quote_1' }, ctx as never)
    ).rejects.toMatchObject({
      message: 'Quote mutations have moved to finance-service authority.',
      extensions: expect.objectContaining({ code: 'CPQ_MUTATION_DISABLED', status: 410 }),
    });

    expect(ctx.prisma.quote.deleteMany).not.toHaveBeenCalled();
  });
});
