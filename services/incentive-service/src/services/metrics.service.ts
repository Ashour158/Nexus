import { Decimal } from 'decimal.js';
import type { IncentivePrisma } from '../prisma.js';

/**
 * Tracks per-tenant/owner cumulative metric counters that back event-driven
 * badge metrics which previously referenced data the service never stored
 * (LEADS_CREATED, LEADS_CONVERTED, ACTIVITY_STREAK, ACTIVITIES_COMPLETED, ...).
 *
 * Everything here is tenant-scoped and additive: the legacy deal.won badge
 * path (which passes an ad-hoc value straight to badges.checkAndAward) keeps
 * working untouched.
 */
export function createMetricsService(prisma: IncentivePrisma) {
  return {
    /**
     * Increment a cumulative counter and return its new numeric value.
     * Upserts atomically on the (tenantId, ownerId, metric) unique key.
     */
    async increment(tenantId: string, ownerId: string, metric: string, delta = 1): Promise<number> {
      const row = await prisma.metricCounter.upsert({
        where: { tenantId_ownerId_metric: { tenantId, ownerId, metric } },
        update: { value: { increment: new Decimal(delta).toFixed(2) } },
        create: { tenantId, ownerId, metric, value: new Decimal(delta).toFixed(2) },
      });
      return Number(row.value);
    },

    /**
     * Record activity on `eventDate` (YYYY-MM-DD, tenant-agnostic UTC day) and
     * return the current consecutive-day streak length. Same-day repeats do not
     * advance the streak; a one-day gap continues it; any larger gap resets to 1.
     */
    async recordStreak(tenantId: string, ownerId: string, eventDate: string): Promise<number> {
      const metric = 'ACTIVITY_STREAK';
      const existing = await prisma.metricCounter.findUnique({
        where: { tenantId_ownerId_metric: { tenantId, ownerId, metric } },
      });

      let streak = 1;
      if (existing?.lastEventDate) {
        if (existing.lastEventDate === eventDate) {
          streak = existing.streakValue; // same day, no change
        } else {
          const prev = Date.parse(existing.lastEventDate);
          const cur = Date.parse(eventDate);
          const dayMs = 24 * 60 * 60 * 1000;
          const gapDays = Math.round((cur - prev) / dayMs);
          streak = gapDays === 1 ? existing.streakValue + 1 : 1;
        }
      }

      await prisma.metricCounter.upsert({
        where: { tenantId_ownerId_metric: { tenantId, ownerId, metric } },
        update: { streakValue: streak, lastEventDate: eventDate, value: streak },
        create: { tenantId, ownerId, metric, streakValue: streak, lastEventDate: eventDate, value: streak },
      });
      return streak;
    },
  };
}

export type MetricsService = ReturnType<typeof createMetricsService>;
