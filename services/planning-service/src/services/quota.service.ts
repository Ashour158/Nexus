import { Decimal } from 'decimal.js';
import type { PlanningPrisma } from '../prisma.js';

/**
 * First-class Quota CRUD (per-user / per-team, per-period) plus period-over-period
 * attainment history.
 *
 * Attainment "actuals" are the realized closed-won amount this service already
 * maintains from deal events:
 *   - {@link ForecastAggregate}.closedWonAmount — the live per-owner/period total
 *   - {@link ForecastSnapshot}.closedWonAmount   — the point-in-time daily series
 * Nothing is fabricated: if no deal events have been consumed for a period, the
 * actual is 0.
 */

export type QuotaOwnerType = 'USER' | 'TEAM';

export interface QuotaInput {
  ownerType?: QuotaOwnerType;
  ownerId: string;
  period: string;
  targetAmount: string | number;
  currency?: string;
}

function pct(actual: Decimal, target: Decimal): string {
  return target.gt(0) ? actual.div(target).mul(100).toFixed(2) : '0.00';
}

export function createQuotaService(prisma: PlanningPrisma) {
  /**
   * Realized closed-won for an owner+period. For TEAM quotas, the owner's deal
   * events are not individually attributable, so we fall back to the tenant-wide
   * team aggregate (scope-less sum across owners) for that period.
   */
  async function actualFor(
    tenantId: string,
    ownerType: QuotaOwnerType,
    ownerId: string,
    period: string
  ): Promise<Decimal> {
    if (ownerType === 'USER') {
      const agg = await prisma.forecastAggregate.findFirst({
        where: { tenantId, ownerId, period },
      });
      return new Decimal(agg?.closedWonAmount?.toString() ?? 0);
    }
    const aggs = await prisma.forecastAggregate.findMany({ where: { tenantId, period } });
    return aggs.reduce((s, a) => s.plus(new Decimal(a.closedWonAmount.toString())), new Decimal(0));
  }

  return {
    async list(
      tenantId: string,
      filter: { period?: string; ownerId?: string; ownerType?: QuotaOwnerType } = {}
    ) {
      return prisma.quota.findMany({
        where: {
          tenantId,
          ...(filter.period ? { period: filter.period } : {}),
          ...(filter.ownerId ? { ownerId: filter.ownerId } : {}),
          ...(filter.ownerType ? { ownerType: filter.ownerType } : {}),
        },
        orderBy: [{ period: 'desc' }, { ownerType: 'asc' }, { ownerId: 'asc' }],
      });
    },

    async get(tenantId: string, id: string) {
      return prisma.quota.findFirst({ where: { tenantId, id } });
    },

    async create(tenantId: string, input: QuotaInput) {
      return prisma.quota.create({
        data: {
          tenantId,
          ownerType: input.ownerType ?? 'USER',
          ownerId: input.ownerId,
          period: input.period,
          targetAmount: new Decimal(input.targetAmount).toFixed(2),
          currency: input.currency ?? 'USD',
        },
      });
    },

    async update(tenantId: string, id: string, input: Partial<QuotaInput>) {
      const existing = await prisma.quota.findFirst({ where: { tenantId, id } });
      if (!existing) return null;
      return prisma.quota.update({
        where: { id },
        data: {
          ownerType: input.ownerType,
          ownerId: input.ownerId,
          period: input.period,
          targetAmount:
            input.targetAmount !== undefined
              ? new Decimal(input.targetAmount).toFixed(2)
              : undefined,
          currency: input.currency,
        },
      });
    },

    async remove(tenantId: string, id: string): Promise<boolean> {
      const existing = await prisma.quota.findFirst({ where: { tenantId, id } });
      if (!existing) return false;
      await prisma.quota.delete({ where: { id } });
      return true;
    },

    /**
     * Period-over-period attainment for a quota's owner. Returns:
     *  - `quota`   — the quota being viewed (target/currency/period)
     *  - `trend`   — the intra-period daily series (from ForecastSnapshot) of
     *                closed-won and attainment %, so you can chart movement toward
     *                (or past) quota across the period
     *  - `periods` — every quota this owner holds (any period), each with its own
     *                target, realized closed-won, and attainment % — the true
     *                period-over-period comparison
     */
    async getAttainmentHistory(tenantId: string, id: string) {
      const quota = await prisma.quota.findFirst({ where: { tenantId, id } });
      if (!quota) return null;
      const ownerType = quota.ownerType as QuotaOwnerType;
      const target = new Decimal(quota.targetAmount.toString());

      // Intra-period daily trend from snapshots.
      const snapScope = ownerType === 'USER' ? 'owner' : 'team';
      const snapOwnerId = ownerType === 'USER' ? quota.ownerId : '';
      const snaps = await prisma.forecastSnapshot.findMany({
        where: { tenantId, scope: snapScope, ownerId: snapOwnerId, period: quota.period },
        orderBy: { asOf: 'asc' },
      });
      const trend = snaps.map((s) => {
        const closedWon = new Decimal(s.closedWonAmount.toString());
        return {
          asOf: s.asOf,
          closedWon: closedWon.toFixed(2),
          attainmentPct: pct(closedWon, target),
          wonDealCount: s.wonDealCount,
        };
      });

      // Period-over-period: this owner's attainment across all their quotas.
      const ownerQuotas = await prisma.quota.findMany({
        where: { tenantId, ownerType: quota.ownerType, ownerId: quota.ownerId },
        orderBy: { period: 'asc' },
      });
      const periods = [];
      for (const q of ownerQuotas) {
        const qTarget = new Decimal(q.targetAmount.toString());
        const actual = await actualFor(tenantId, ownerType, q.ownerId, q.period);
        periods.push({
          quotaId: q.id,
          period: q.period,
          target: qTarget.toFixed(2),
          closedWon: actual.toFixed(2),
          attainmentPct: pct(actual, qTarget),
          gapToQuota: Decimal.max(qTarget.minus(actual), 0).toFixed(2),
          currency: q.currency,
          current: q.id === quota.id,
        });
      }

      const currentActual = await actualFor(tenantId, ownerType, quota.ownerId, quota.period);
      return {
        quota: {
          id: quota.id,
          ownerType,
          ownerId: quota.ownerId,
          period: quota.period,
          target: target.toFixed(2),
          currency: quota.currency,
        },
        current: {
          closedWon: currentActual.toFixed(2),
          attainmentPct: pct(currentActual, target),
          gapToQuota: Decimal.max(target.minus(currentActual), 0).toFixed(2),
        },
        trend,
        periods,
      };
    },
  };
}

export type QuotaService = ReturnType<typeof createQuotaService>;
