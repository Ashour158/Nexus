import { describe, it, expect, vi, beforeEach } from 'vitest';
import { startQuoteExpiryPoller } from './quote-expiry.poller.js';

vi.mock('../services/quote-events.js', () => ({
  emitQuoteEvent: vi.fn().mockResolvedValue(undefined),
}));

function mockPrisma(candidates: any[], claimCounts: number[]) {
  let call = 0;
  return {
    quote: {
      findMany: vi.fn().mockResolvedValue(candidates),
      updateMany: vi.fn().mockImplementation(async () => ({ count: claimCounts[call++] ?? 0 })),
    },
  } as any;
}

const baseQuote = {
  id: 'q1',
  tenantId: 't1',
  dealId: 'd1',
  ownerId: 'o1',
  quoteNumber: 'Q-001',
  currency: 'USD',
  total: '100',
  validUntil: new Date(Date.now() - 1000),
  acceptedAt: null,
};

describe('quote-expiry poller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('expires a due in-flight quote and claims via updateMany', async () => {
    const prisma = mockPrisma([baseQuote], [1]);
    const poller = startQuoteExpiryPoller(prisma, { intervalMs: 60_000 });
    const count = await poller.runOnce();
    poller.stop();

    expect(count).toBe(1);
    expect(prisma.quote.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'q1', status: { in: ['SENT', 'VIEWED'] } }),
        data: expect.objectContaining({ status: 'EXPIRED' }),
      })
    );
  });

  it('does not double-fire when the claim returns count 0 (already expired)', async () => {
    const prisma = mockPrisma([baseQuote], [0]);
    const poller = startQuoteExpiryPoller(prisma, { intervalMs: 60_000 });
    const count = await poller.runOnce();
    poller.stop();

    expect(count).toBe(0);
  });

  it('returns 0 when there are no due quotes', async () => {
    const prisma = mockPrisma([], []);
    const poller = startQuoteExpiryPoller(prisma, { intervalMs: 60_000 });
    const count = await poller.runOnce();
    poller.stop();

    expect(count).toBe(0);
    expect(prisma.quote.updateMany).not.toHaveBeenCalled();
  });
});
