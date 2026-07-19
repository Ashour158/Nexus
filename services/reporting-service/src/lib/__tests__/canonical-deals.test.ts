import { describe, expect, it } from 'vitest';
import { buildWinLossReport, summarizeDeals } from '../canonical-deals.js';

describe('canonical deal outcome metrics', () => {
  const deals = [
    {
      id: 'open-terminal-stage',
      status: 'OPEN',
      stage: 'Closed Won',
      amount: 100,
      probability: 100,
      updatedAt: '2026-07-01T00:00:00.000Z',
    },
    {
      id: 'won-nonterminal-stage',
      status: 'WON',
      stage: 'Proposal',
      amount: 200,
      probability: 50,
      wonAt: '2026-07-02T00:00:00.000Z',
    },
    {
      id: 'lost',
      status: 'LOST',
      stage: 'Negotiation',
      amount: 300,
      lostReason: 'Price',
      lostAt: '2026-07-03T00:00:00.000Z',
    },
  ];

  it('uses status only and never counts open pipeline as revenue', () => {
    expect(summarizeDeals(deals)).toMatchObject({
      totalDeals: 3,
      openDeals: 1,
      wonDeals: 1,
      lostDeals: 1,
      wonAmount: 200,
      lostAmount: 300,
      pipelineValue: 100,
      weightedPipeline: 100,
      totalRevenue: 200,
      winRatePct: 50,
    });
  });

  it('uses the same canonical counts in win/loss', () => {
    const report = buildWinLossReport(
      deals,
      new Date('2026-07-01T00:00:00.000Z'),
      new Date('2026-07-31T23:59:59.999Z')
    );
    expect(report.summary).toMatchObject({
      totalDeals: 2,
      openDeals: 1,
      wonDeals: 1,
      lostDeals: 1,
      winRatePct: 50,
      wonAmount: 200,
      lostAmount: 300,
    });
    expect(report.lostReasons).toEqual([{ reason: 'Price', count: 1 }]);
  });
});
