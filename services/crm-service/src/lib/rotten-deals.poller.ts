import type { CrmPrisma } from '../prisma.js';
import { NexusProducer, TOPICS } from '@nexus/kafka';

/**
 * Stage-gating rotten-deal detector (additive, FAIL-SAFE).
 *
 * Periodically scans OPEN deals and flags those that have sat idle in their
 * current stage longer than the stage's `rottenDays`. Idle time is measured
 * from the deal's `updatedAt` (the last mutation, which stage moves bump) as a
 * proxy for stage-entry time. For each newly-rotten deal we publish a
 * `deal.rotten` event to {@link TOPICS.DEALS}. Nothing is deleted, and no save
 * is ever hard-failed by this poller.
 *
 * SAFETY:
 *  - The whole tick is wrapped in try/catch; a failing tick logs and returns.
 *  - The interval is `unref()`d so it never keeps the process alive on shutdown.
 *  - Per-deal publish failures are swallowed so one bad deal can't stall the tick.
 *  - Batched + capped so a large backlog can't monopolise the DB.
 */

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // hourly
const MAX_DEALS_PER_TICK = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface RottenDealsPoller {
  stop(): void;
  /** Exposed for tests: run a single detection pass and return the rotten count. */
  runOnce(): Promise<number>;
}

async function detectRottenDeals(
  prisma: CrmPrisma,
  producer: NexusProducer
): Promise<number> {
  // Only OPEN, non-deleted deals can rot. The soft-delete extension already
  // filters deletedAt on reads.
  const deals = await prisma.deal.findMany({
    where: { status: 'OPEN' },
    select: {
      id: true,
      tenantId: true,
      ownerId: true,
      accountId: true,
      stageId: true,
      updatedAt: true,
    },
    take: MAX_DEALS_PER_TICK,
    orderBy: { updatedAt: 'asc' },
  });

  if (deals.length === 0) return 0;

  const stageIds = [...new Set(deals.map((d) => d.stageId))];
  const stages = await prisma.stage.findMany({
    where: { id: { in: stageIds } },
    select: { id: true, rottenDays: true },
  });
  const rottenDaysByStage = new Map<string, number>();
  for (const s of stages) rottenDaysByStage.set(s.id, s.rottenDays);

  const now = Date.now();
  let rottenCount = 0;

  for (const deal of deals) {
    const rottenDays = rottenDaysByStage.get(deal.stageId);
    // No stage / no threshold configured => cannot rot.
    if (rottenDays === undefined || rottenDays <= 0) continue;

    const idleDays = Math.floor((now - deal.updatedAt.getTime()) / DAY_MS);
    if (idleDays < rottenDays) continue;

    rottenCount += 1;
    try {
      await producer.publish(TOPICS.DEALS, {
        type: 'deal.rotten',
        tenantId: deal.tenantId,
        payload: {
          dealId: deal.id,
          ownerId: deal.ownerId,
          accountId: deal.accountId,
          stageId: deal.stageId,
          idleDays,
          rottenDays,
          detectedAt: new Date().toISOString(),
        },
      });
    } catch {
      // Never let a single publish failure abort the scan.
    }
  }

  return rottenCount;
}

/**
 * Starts the rotten-deal poller. Returns a handle to stop it. The poller is
 * guarded so a failure to start (or any tick failure) can never break the
 * service — callers should treat a thrown start as non-fatal.
 */
export function startRottenDealsPoller(
  prisma: CrmPrisma,
  producer: NexusProducer,
  opts: { intervalMs?: number } = {}
): RottenDealsPoller {
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;

  const runOnce = async (): Promise<number> => {
    try {
      return await detectRottenDeals(prisma, producer);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[rotten-deals] detection tick failed; continuing', err);
      return 0;
    }
  };

  const timer = setInterval(() => {
    void runOnce();
  }, intervalMs);
  // Do not keep the event loop alive.
  if (typeof timer.unref === 'function') timer.unref();

  return {
    stop() {
      clearInterval(timer);
    },
    runOnce,
  };
}
