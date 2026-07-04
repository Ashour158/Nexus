// Guarded AI (re)scoring poller (additive, FAIL-SAFE).
//
// Mirrors the rotten-deals poller pattern: periodically (re)scores OPEN deals
// and active leads with the explainable predictive model, and runs at-risk
// detection on deals (which emits guarded `deal.at_risk` events). This keeps the
// aiWinProbability / aiConversionProbability + aiInsights columns fresh even for
// records that aren't touched via the event stream.
//
// SAFETY (identical guarantees to rotten-deals.poller.ts):
//  - the whole tick is wrapped in try/catch; a failing tick logs and returns.
//  - the interval is unref()'d so it never keeps the process alive.
//  - per-record failures are swallowed (scoreDeal/scoreLead are themselves
//    fail-open) so one bad record can't stall the tick.
//  - batched + capped so a large backlog can't monopolise the DB.

import type { CrmPrisma } from '../../prisma.js';
import type { NexusProducer } from '@nexus/kafka';
import { scoreDeal, scoreLead, detectAtRiskDeal } from './scoring.service.js';

const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6h
const MAX_PER_TICK = 300;

export interface AiScoringPoller {
  stop(): void;
  /** Exposed for tests: run one pass, return counts. */
  runOnce(): Promise<{ deals: number; leads: number; atRisk: number }>;
}

async function scoreBatch(
  prisma: CrmPrisma,
  producer: NexusProducer
): Promise<{ deals: number; leads: number; atRisk: number }> {
  // Oldest-scored first (nulls first) so we always make progress on the backlog.
  const deals = await prisma.deal.findMany({
    where: { status: 'OPEN' },
    select: { id: true, tenantId: true },
    orderBy: [{ aiScoredAt: { sort: 'asc', nulls: 'first' } }],
    take: MAX_PER_TICK,
  });

  let dealCount = 0;
  let atRiskCount = 0;
  for (const d of deals) {
    const res = await scoreDeal(prisma, d.tenantId, d.id);
    if (res) dealCount += 1;
    const risk = await detectAtRiskDeal(prisma, d.tenantId, d.id, producer);
    if (risk.atRisk) atRiskCount += 1;
  }

  const leads = await prisma.lead.findMany({
    where: { status: { in: ['NEW', 'ASSIGNED', 'WORKING', 'QUALIFIED'] } },
    select: { id: true, tenantId: true },
    orderBy: [{ aiScoredAt: { sort: 'asc', nulls: 'first' } }],
    take: MAX_PER_TICK,
  });
  let leadCount = 0;
  for (const l of leads) {
    const res = await scoreLead(prisma, l.tenantId, l.id);
    if (res) leadCount += 1;
  }

  return { deals: dealCount, leads: leadCount, atRisk: atRiskCount };
}

export function startAiScoringPoller(
  prisma: CrmPrisma,
  producer: NexusProducer,
  opts: { intervalMs?: number } = {}
): AiScoringPoller {
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;

  const runOnce = async (): Promise<{ deals: number; leads: number; atRisk: number }> => {
    try {
      return await scoreBatch(prisma, producer);
    } catch (err) {
      console.warn('[ai-scoring] poller tick failed; continuing', err);
      return { deals: 0, leads: 0, atRisk: 0 };
    }
  };

  const timer = setInterval(() => {
    void runOnce();
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();

  return {
    stop() {
      clearInterval(timer);
    },
    runOnce,
  };
}
