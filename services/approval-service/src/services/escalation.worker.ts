import type { NexusProducer } from '@nexus/kafka';
import type { ApprovalPrisma } from '../prisma.js';
import { createRequestsService } from './requests.service.js';

/**
 * Periodic escalation poller. Every `intervalMs` it sweeps PENDING approval
 * requests older than `APPROVAL_ESCALATION_HOURS` (default 48) and marks them
 * ESCALATED. Fully guarded: the sweep itself never throws (see
 * requestsService.escalatePending), and the tick is wrapped so a stray error
 * can never crash the process or stop the interval.
 *
 * Returns a stop() handle; a no-op when escalation is disabled.
 */
export function startEscalationWorker(
  prisma: ApprovalPrisma,
  producer: NexusProducer
): { stop: () => void } {
  const hours = Number(process.env.APPROVAL_ESCALATION_HOURS ?? '48');
  const intervalMs = Number(process.env.APPROVAL_ESCALATION_INTERVAL_MS ?? '900000'); // 15 min

  // Disabled when hours <= 0 or non-finite config.
  if (!Number.isFinite(hours) || hours <= 0 || !Number.isFinite(intervalMs) || intervalMs <= 0) {
    return { stop: () => undefined };
  }

  const requests = createRequestsService(prisma, producer);

  const tick = async () => {
    try {
      const olderThan = new Date(Date.now() - hours * 60 * 60 * 1000);
      const count = await requests.escalatePending(olderThan);
      if (count > 0) {
        console.log(`[approval-service] escalated ${count} stale approval request(s)`);
      }
    } catch (err) {
      // Never let the poller die on a DB/Kafka hiccup.
      console.warn('[approval-service] escalation tick failed;', err);
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, intervalMs);
  // Don't keep the event loop alive solely for this timer.
  if (typeof timer.unref === 'function') timer.unref();

  return { stop: () => clearInterval(timer) };
}
