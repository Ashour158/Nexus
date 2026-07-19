import { runCrossTenant } from '@nexus/service-utils/prisma-tenant';
import type { createWebhooksService } from '../services/webhooks.service.js';

type Webhooks = ReturnType<typeof createWebhooksService>;

/**
 * DB-backed outbound webhook delivery poller (additive, FAIL-OPEN).
 *
 * `enqueueFromDomainEvent` inserts PENDING `WebhookDelivery` rows when a
 * subscribed domain event arrives, but nothing drives their delivery. This
 * poller periodically calls {@link Webhooks.processDeliveryQueue}, which:
 *   - picks up PENDING deliveries and RETRYING ones whose `nextRetryAt` is due,
 *   - POSTs the signed payload (HMAC-SHA256 in `X-Nexus-Signature`) to the
 *     subscriber URL, isolated per-delivery,
 *   - logs the attempt (status, http status, response, attemptCount), and
 *   - schedules an exponential-backoff retry or marks FAILED past the cap.
 *
 * SAFETY:
 *  - Reentrancy guard: overlapping ticks are skipped, so a slow batch never
 *    stacks up concurrent delivery passes.
 *  - The whole tick is wrapped in try/catch; a failing tick logs and returns.
 *  - The interval is `unref()`d so it never keeps the process alive on shutdown.
 *  - Interval is env-configurable via WEBHOOK_DELIVERY_INTERVAL_MS.
 */

const DEFAULT_INTERVAL_MS = 5_000;

export interface WebhookDeliveryPoller {
  stop(): void;
  /** Exposed for tests: run a single delivery pass, returning rows processed. */
  runOnce(): Promise<number>;
}

export function startWebhookDeliveryPoller(
  webhooks: Webhooks,
  opts: { intervalMs?: number; batchSize?: number } = {}
): WebhookDeliveryPoller {
  const intervalMs =
    opts.intervalMs ?? Number(process.env.WEBHOOK_DELIVERY_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);
  const batchSize = opts.batchSize ?? Number(process.env.WEBHOOK_DELIVERY_BATCH ?? 25);

  let running = false;

  const runOnce = async (): Promise<number> => {
    // Reentrancy guard — never overlap delivery passes.
    if (running) return 0;
    running = true;
    try {
      return await webhooks.processDeliveryQueue(batchSize);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[webhook-delivery] tick failed; continuing', err);
      return 0;
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => {
    void runCrossTenant('webhook delivery queue drain spans all tenants', runOnce);
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
