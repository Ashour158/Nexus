import { runCrossTenant } from '@nexus/service-utils/prisma-tenant';
import type { CommPrisma } from '../prisma.js';
import type { createOutboxService } from '../services/outbox.service.js';

/**
 * Outbox processor poller (additive, FAIL-OPEN).
 *
 * `outboxService.processQueue(tenantId)` already knows how to send a single
 * tenant's QUEUED CommOutbox rows via SMTP/SMS and emit `email.sent` — but
 * nothing was ever calling it on a schedule, so queued emails only left the
 * building when a human hit `POST /outbox/process-queue`. This poller closes
 * that gap: on each tick it finds the distinct tenants that currently have
 * QUEUED rows and drives `processQueue` for each.
 *
 * SAFETY:
 *  - Each tick is wrapped in try/catch; a failing tick logs a warning and the
 *    poller lives to run again. It never crashes the service.
 *  - A reentrancy guard prevents overlapping ticks if one runs long.
 *  - The interval is `unref()`d so it never keeps the process alive on shutdown.
 *  - Per-tenant failures are isolated so one bad tenant can't stall the others.
 *  - When SMTP is unconfigured the channel is a dev no-op, so sends succeed as
 *    no-ops and the email.sent event + Activity projection still fire.
 */

const DEFAULT_INTERVAL_MS = 30 * 1000; // every 30 seconds
const MAX_TENANTS_PER_TICK = 100;

export interface OutboxPoller {
  stop(): void;
  /** Exposed for tests/manual runs: one pass, returns rows sent across tenants. */
  runOnce(): Promise<number>;
}

async function findQueuedTenants(prisma: CommPrisma): Promise<string[]> {
  // No tenant is set in ALS here (poller runs outside a request), so the tenant
  // extension passes through and this reads across all tenants.
  const rows = await (prisma as any).commOutbox.groupBy({
    by: ['tenantId'],
    where: { status: 'QUEUED' },
    _count: { _all: true },
    take: MAX_TENANTS_PER_TICK,
  });
  return rows.map((r: { tenantId: string }) => r.tenantId);
}

export function startOutboxPoller(
  prisma: CommPrisma,
  outbox: ReturnType<typeof createOutboxService>,
  log: { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void },
  opts: { intervalMs?: number } = {}
): OutboxPoller {
  const intervalMs =
    opts.intervalMs ?? Number(process.env.OUTBOX_POLL_MS ?? DEFAULT_INTERVAL_MS);

  let running = false;

  const runOnce = async (): Promise<number> => {
    if (running) return 0;
    running = true;
    let sent = 0;
    try {
      const tenants = await findQueuedTenants(prisma);
      for (const tenantId of tenants) {
        try {
          const result = await outbox.processQueue(tenantId);
          sent += result.sent;
        } catch (err) {
          log.warn({ err, tenantId }, '[outbox-poller] tenant tick failed; continuing');
        }
      }
      if (sent > 0) {
        log.info({ sent, tenants: tenants.length }, '[outbox-poller] flushed queued messages');
      }
    } catch (err) {
      log.warn({ err }, '[outbox-poller] tick failed; continuing');
    } finally {
      running = false;
    }
    return sent;
  };

  const timer = setInterval(() => {
    void runCrossTenant('comm email outbox drain spans all tenants', runOnce);
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();

  return {
    stop() {
      clearInterval(timer);
    },
    runOnce,
  };
}
