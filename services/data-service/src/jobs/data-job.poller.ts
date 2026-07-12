import type { NexusProducer } from '@nexus/kafka';
import type { DataPrisma } from '../prisma.js';
import { createDataJobService } from '../services/data-job.service.js';

/**
 * Background poller for ScheduledDataJob rows. Every tick it runs any active job
 * whose `nextRunAt` has passed, records a DataJobRun, and advances the schedule.
 *
 * Mirrors the repo's established poller pattern (retention.job / reporting
 * schedule-runner):
 *   - `setInterval(...).unref()` so the timer never keeps the process alive.
 *   - a reentrancy guard so a slow tick can't overlap the next fire and
 *     double-run due jobs.
 *   - each job is tenant-pinned via its own row (data-job.service.runDue).
 */
export function startDataJobPoller(
  prisma: DataPrisma,
  producer?: NexusProducer,
  intervalMs = 60 * 1000
) {
  const service = createDataJobService(prisma, producer);
  let running = false;

  async function tick() {
    if (running) return;
    running = true;
    try {
      const count = await service.runDue();
      if (count > 0) console.log(`[data-job] ran ${count} due job(s)`);
    } catch (err) {
      console.error('[data-job] poller tick failed:', err);
    } finally {
      running = false;
    }
  }

  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();

  return {
    stop() {
      clearInterval(timer);
    },
  };
}
