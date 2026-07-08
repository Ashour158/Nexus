import type { WorkflowPrisma } from '../prisma.js';
import type { NexusProducer } from '@nexus/kafka';
import { createSlaService } from './sla.service.js';

/**
 * SLA breach scanner.
 *
 * A setInterval poller (mirroring the resumeAt poller in index.ts) that
 * periodically asks the SLA service to scan active definitions and
 * record/escalate breaches for in-flight entities that have exceeded their
 * `timeLimitHours`.
 *
 * Guards:
 *   - The whole scan body is wrapped in try/catch so a transient DB/Kafka
 *     outage logs a warning and the poller lives to run again.
 *   - The scan itself is idempotent (see slaService.scanBreaches), so overlapping
 *     or repeated runs cannot create duplicate breaches.
 *
 * Returns the interval handle so callers can clear it on shutdown if desired.
 */
export function startSlaScanner(
  prisma: WorkflowPrisma,
  logger: { warn: (obj: unknown, msg?: string) => void; info?: (obj: unknown, msg?: string) => void },
  intervalMs = 60_000,
  producer?: NexusProducer
): NodeJS.Timeout {
  // Producer is threaded through so a newly-recorded breach emits `sla.breached`
  // (NOT-03). Optional so existing callers/tests keep working without one.
  const sla = createSlaService(prisma, producer);

  const handle = setInterval(async () => {
    try {
      const result = await sla.scanBreaches();
      if (result.created > 0 || result.escalated > 0) {
        logger.info?.(result, 'SLA scan recorded breaches');
      }
    } catch (err) {
      logger.warn({ err }, 'SLA breach scan failed');
    }
  }, intervalMs);

  // Do not keep the event loop alive solely for the scanner.
  if (typeof handle.unref === 'function') handle.unref();
  return handle;
}
