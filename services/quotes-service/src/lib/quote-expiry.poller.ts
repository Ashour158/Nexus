import type { QuotesPrisma } from '../prisma.js';
import { emitQuoteEvent } from '../services/quote-events.js';
import { buildEventPayload } from '../services/quote-lifecycle.js';

/**
 * Quote-expiry poller (additive, FAIL-SAFE, reentrancy-guarded).
 *
 * Periodically finds quotes whose `validUntil` has elapsed while still in
 * SENT (or VIEWED) status and marks them EXPIRED, emitting a `quote.expired`
 * event per quote.
 *
 * SAFETY / IDEMPOTENCY:
 *  - Each quote is *claimed* with `updateMany({ where: { id, status: <in-flight> }})`.
 *    updateMany returns `count`; a concurrent poller / restart that already
 *    flipped the row sees count === 0 and never double-fires the event.
 *  - The whole tick is wrapped in try/catch; a failing tick logs and returns 0.
 *  - `running` guards against overlapping ticks (a slow tick can't stack).
 *  - The interval is `unref()`d so it never keeps the process alive.
 *  - Per-quote failures are swallowed so one bad row can't stall the tick.
 *  - Batched + capped so a large backlog can't monopolise the DB.
 */

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000; // every 15 minutes
const MAX_QUOTES_PER_TICK = 500;

// Statuses considered "in flight" and therefore expirable.
const EXPIRABLE_STATUSES = ['SENT', 'VIEWED'] as const;

export interface QuoteExpiryPoller {
  stop(): void;
  /** Exposed for tests: run a single expiry pass and return the expired count. */
  runOnce(): Promise<number>;
}

async function expireDueQuotes(prisma: QuotesPrisma): Promise<number> {
  const now = new Date();

  // Candidate quotes: in-flight, non-deleted, with an elapsed validity window.
  // The soft-delete + tenant extensions do not apply here because the poller
  // runs outside a request context (no tenant ALS), so we filter explicitly.
  const candidates = await prisma.quote.findMany({
    where: {
      status: { in: [...EXPIRABLE_STATUSES] },
      deletedAt: null,
      validUntil: { not: null, lt: now },
    },
    select: {
      id: true,
      tenantId: true,
      dealId: true,
      ownerId: true,
      quoteNumber: true,
      currency: true,
      total: true,
      validUntil: true,
      acceptedAt: true,
    },
    take: MAX_QUOTES_PER_TICK,
    orderBy: { validUntil: 'asc' },
  });

  if (candidates.length === 0) return 0;

  let expiredCount = 0;

  for (const quote of candidates) {
    try {
      // Claim the row: only flip if it is still in an expirable status. A
      // concurrent tick / restart that already flipped it sees count === 0.
      const claim = await prisma.quote.updateMany({
        where: { id: quote.id, status: { in: [...EXPIRABLE_STATUSES] } },
        data: { status: 'EXPIRED', expiredAt: now },
      });
      if (claim.count === 0) continue; // someone else already expired it

      expiredCount += 1;

      // Fire-and-forget the lifecycle event. Never let emission abort the tick.
      await emitQuoteEvent(
        'quote.expired',
        quote.tenantId,
        buildEventPayload({ ...quote, status: 'EXPIRED' })
      );
    } catch {
      // Swallow per-quote failures; continue the scan.
    }
  }

  return expiredCount;
}

/**
 * Starts the expiry poller. Returns a handle to stop it. Guarded so a failure
 * to start (or any tick failure) can never break the service — callers should
 * treat a thrown start as non-fatal.
 */
export function startQuoteExpiryPoller(
  prisma: QuotesPrisma,
  opts: { intervalMs?: number } = {}
): QuoteExpiryPoller {
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  let running = false;

  const runOnce = async (): Promise<number> => {
    if (running) return 0; // reentrancy guard: skip if a tick is still in flight
    running = true;
    try {
      return await expireDueQuotes(prisma);
    } catch (err) {
      console.warn('[quote-expiry] expiry tick failed; continuing', err);
      return 0;
    } finally {
      running = false;
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
