import { describe, expect, it, vi } from 'vitest';
import { createQuotesService } from './quotes.service.js';

function makePrisma() {
  return {
    quote: {
      count: vi.fn(async () => 1),
      findMany: vi.fn(async () => [{ id: 'quote_1', tenantId: 'tenant_1' }]),
      findFirst: vi.fn(async () => ({ id: 'quote_1', tenantId: 'tenant_1' })),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
}

describe('deals quote read model service', () => {
  it('keeps quote reads compatible', async () => {
    const prisma = makePrisma();
    const service = createQuotesService(prisma as never);

    const result = await service.listQuotes('tenant_1', {}, { page: 1, limit: 20, sortDir: 'desc' });

    expect(result.data).toEqual([{ id: 'quote_1', tenantId: 'tenant_1' }]);
    expect(prisma.quote.findMany).toHaveBeenCalled();
  });

  it('disables direct quote projection writes outside finance authority', async () => {
    const prisma = makePrisma();
    const service = createQuotesService(prisma as never);

    await expect(service.syncQuoteFromEvent('tenant_1', { id: 'quote_1' })).rejects.toMatchObject({
      message: 'Quote mutations have moved to finance-service authority.',
    });

    expect(prisma.quote.create).not.toHaveBeenCalled();
    expect(prisma.quote.update).not.toHaveBeenCalled();
  });
});
