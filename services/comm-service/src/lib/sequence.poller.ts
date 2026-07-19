import { runCrossTenant } from '@nexus/service-utils/prisma-tenant';
import type { CommPrisma } from '../prisma.js';
import type { createSequencesService } from '../services/sequences.service.js';

/**
 * Sequence-step poller (additive, FAIL-OPEN).
 *
 * `sequencesService.processSequenceQueue(tenantId)` already knows how to advance
 * a single tenant's ACTIVE enrollments through their due steps — but nothing was
 * ever calling it on a schedule, so enrolled contacts never actually progressed
 * unless a human hit `POST /sequences/process-queue`. This poller closes that
 * gap: on each tick it finds the distinct tenants that currently have due
 * enrollments and drives `processSequenceQueue` for each.
 *
 * SAFETY:
 *  - Each tick is wrapped in try/catch; a failing tick logs a warning and the
 *    poller lives to run again. It never crashes the service.
 *  - A reentrancy guard prevents overlapping ticks if one runs long.
 *  - The interval is `unref()`d so it never keeps the process alive on shutdown.
 *  - Per-tenant failures are isolated so one bad tenant can't stall the others.
 */

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes
const MAX_TENANTS_PER_TICK = 100;

export interface SequencePoller {
  stop(): void;
  /** Exposed for tests/manual runs: one pass, returns emails sent across tenants. */
  runOnce(): Promise<number>;
}

async function findDueTenants(prisma: CommPrisma): Promise<string[]> {
  // No tenant is set in ALS here (poller runs outside a request), so the tenant
  // extension passes through and this reads across all tenants.
  const rows = await prisma.sequenceEnrollment.groupBy({
    by: ['tenantId'],
    where: { status: 'ACTIVE', nextSendAt: { lte: new Date() } },
    _count: { _all: true },
    take: MAX_TENANTS_PER_TICK,
  });
  return rows.map((r) => r.tenantId);
}

export function startSequencePoller(
  prisma: CommPrisma,
  sequences: ReturnType<typeof createSequencesService>,
  log: { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void },
  opts: { intervalMs?: number } = {}
): SequencePoller {
  const intervalMs =
    opts.intervalMs ?? Number(process.env.SEQUENCE_POLL_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);

  let running = false;

  const runOnce = async (): Promise<number> => {
    if (running) return 0;
    running = true;
    let sent = 0;
    try {
      const tenants = await findDueTenants(prisma);
      for (const tenantId of tenants) {
        try {
          sent += await sequences.processSequenceQueue(tenantId);
        } catch (err) {
          log.warn({ err, tenantId }, '[sequence-poller] tenant tick failed; continuing');
        }
      }
      if (sent > 0) {
        log.info({ sent, tenants: tenants.length }, '[sequence-poller] advanced sequence steps');
      }
    } catch (err) {
      log.warn({ err }, '[sequence-poller] tick failed; continuing');
    } finally {
      running = false;
    }
    return sent;
  };

  const timer = setInterval(() => {
    void runCrossTenant('sequence-step advance sweep spans all tenants', runOnce);
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();

  return {
    stop() {
      clearInterval(timer);
    },
    runOnce,
  };
}
