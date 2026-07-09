import { Decimal } from 'decimal.js';
import type { PlanningPrisma } from '../prisma.js';

/**
 * Rep per-deal forecast categorization + manager override.
 *
 * A rep submits a category per deal for a period (`repCategory`); a manager may
 * override it (`managerCategory`). The EFFECTIVE category is
 * `managerCategory ?? repCategory`. Persisted + audited (managerId + updatedAt).
 *
 * The rollup sums by effective category into the standard buckets with the
 * commit ⊆ best_case ⊆ pipeline containment used across the forecast surface.
 */

export const FORECAST_CATEGORIES = ['commit', 'best_case', 'pipeline', 'omitted', 'closed'] as const;
export type ForecastEntryCategory = (typeof FORECAST_CATEGORIES)[number];

export function isForecastCategory(v: unknown): v is ForecastEntryCategory {
  return typeof v === 'string' && (FORECAST_CATEGORIES as readonly string[]).includes(v);
}

interface EntryInput {
  dealId: string;
  amount: string | number;
  category: ForecastEntryCategory;
}

export function createForecastEntryService(prisma: PlanningPrisma) {
  return {
    /**
     * Rep submits (upserts) per-deal categories for a period. Idempotent on
     * (tenant, period, dealId): re-submitting overwrites the rep's category and
     * amount but leaves any manager override untouched.
     */
    async submitEntries(
      tenantId: string,
      ownerId: string,
      period: string,
      entries: EntryInput[]
    ) {
      const results = [];
      for (const e of entries) {
        const amount = new Decimal(e.amount ?? 0).toFixed(2);
        const row = await prisma.forecastDealEntry.upsert({
          where: { tenantId_period_dealId: { tenantId, period, dealId: e.dealId } },
          update: { ownerId, amount, repCategory: e.category },
          create: {
            tenantId,
            period,
            ownerId,
            dealId: e.dealId,
            amount,
            repCategory: e.category,
          },
        });
        results.push(row);
      }
      return results;
    },

    /**
     * Manager overrides the category of a single deal entry (audited). Passing a
     * null category clears the override (reverts to the rep's category).
     */
    async overrideEntry(
      tenantId: string,
      period: string,
      dealId: string,
      managerId: string,
      managerCategory: ForecastEntryCategory | null,
      note?: string
    ) {
      const existing = await prisma.forecastDealEntry.findFirst({
        where: { tenantId, period, dealId },
      });
      if (!existing) return null;
      return prisma.forecastDealEntry.update({
        where: { tenantId_period_dealId: { tenantId, period, dealId } },
        data: {
          managerCategory,
          managerId,
          note: note ?? existing.note,
        },
      });
    },

    async listEntries(tenantId: string, period: string, ownerId?: string) {
      return prisma.forecastDealEntry.findMany({
        where: { tenantId, period, ...(ownerId ? { ownerId } : {}) },
        orderBy: [{ ownerId: 'asc' }, { updatedAt: 'desc' }],
      });
    },

    /**
     * Roll up entries by EFFECTIVE category (managerCategory ?? repCategory),
     * per owner and as a team total, with commit ⊆ best_case ⊆ pipeline.
     */
    async getEntryRollup(tenantId: string, period: string, ownerId?: string) {
      const rows = await prisma.forecastDealEntry.findMany({
        where: { tenantId, period, ...(ownerId ? { ownerId } : {}) },
      });
      const byOwner = new Map<
        string,
        { commit: Decimal; bestCase: Decimal; pipeline: Decimal; omitted: Decimal; closed: Decimal }
      >();
      for (const r of rows) {
        const cat = (r.managerCategory ?? r.repCategory) as ForecastEntryCategory;
        const amt = new Decimal(r.amount.toString());
        const acc =
          byOwner.get(r.ownerId) ??
          {
            commit: new Decimal(0),
            bestCase: new Decimal(0),
            pipeline: new Decimal(0),
            omitted: new Decimal(0),
            closed: new Decimal(0),
          };
        if (cat === 'commit') acc.commit = acc.commit.plus(amt);
        else if (cat === 'best_case') acc.bestCase = acc.bestCase.plus(amt);
        else if (cat === 'pipeline') acc.pipeline = acc.pipeline.plus(amt);
        else if (cat === 'omitted') acc.omitted = acc.omitted.plus(amt);
        else if (cat === 'closed') acc.closed = acc.closed.plus(amt);
        byOwner.set(r.ownerId, acc);
      }

      const owners = [...byOwner.entries()].map(([owner, a]) => {
        const bestCaseTotal = a.commit.plus(a.bestCase);
        const pipelineTotal = a.commit.plus(a.bestCase).plus(a.pipeline);
        return {
          ownerId: owner,
          commit: a.commit.toFixed(2),
          bestCase: bestCaseTotal.toFixed(2),
          pipeline: pipelineTotal.toFixed(2),
          omitted: a.omitted.toFixed(2),
          closed: a.closed.toFixed(2),
        };
      });
      owners.sort((x, y) => x.ownerId.localeCompare(y.ownerId));

      const totals = owners.reduce(
        (acc, o) => ({
          commit: acc.commit.plus(o.commit),
          bestCase: acc.bestCase.plus(o.bestCase),
          pipeline: acc.pipeline.plus(o.pipeline),
          omitted: acc.omitted.plus(o.omitted),
          closed: acc.closed.plus(o.closed),
        }),
        {
          commit: new Decimal(0),
          bestCase: new Decimal(0),
          pipeline: new Decimal(0),
          omitted: new Decimal(0),
          closed: new Decimal(0),
        }
      );

      return {
        period,
        owners,
        teamTotal: {
          commit: totals.commit.toFixed(2),
          bestCase: totals.bestCase.toFixed(2),
          pipeline: totals.pipeline.toFixed(2),
          omitted: totals.omitted.toFixed(2),
          closed: totals.closed.toFixed(2),
        },
      };
    },
  };
}

export type ForecastEntryService = ReturnType<typeof createForecastEntryService>;
