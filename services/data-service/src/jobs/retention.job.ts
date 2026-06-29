import type { DataPrisma } from '../prisma.js';
import { createRecycleService } from '../services/recycle.service.js';

/**
 * Scheduled retention/purging job.
 * Runs every 24 hours to purge expired recycle bin items.
 * In production this should be invoked by a cron scheduler (e.g. node-cron, Kubernetes CronJob).
 */
export function startRetentionJob(prisma: DataPrisma, intervalMs = 24 * 60 * 60 * 1000) {
  const recycle = createRecycleService(prisma);

  async function run() {
    try {
      const result = await recycle.purgeExpired();
      console.log(`[retention] Purged ${result.count} expired recycle bin items`);
    } catch (err) {
      console.error('[retention] Purge failed:', err);
    }
  }

  // Run immediately on startup, then on interval
  void run();
  const timer = setInterval(() => void run(), intervalMs);

  return {
    stop() {
      clearInterval(timer);
    },
  };
}
