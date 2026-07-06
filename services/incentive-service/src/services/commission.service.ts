import { Decimal } from 'decimal.js';
import type { IncentivePrisma } from '../prisma.js';

/** Shape of a won deal handed to the rules engine. */
export interface WonDeal {
  dealId: string;
  ownerId: string;
  amount: number | string;
  currency?: string;
  productId?: string;
  ownerRole?: string;
  /** Effective margin when the applicable plan is MARGIN-based. Falls back to amount. */
  marginAmount?: number | string;
  /** ISO timestamp of the win; used to derive periodMonth. Defaults to now. */
  occurredAt?: string;
}

type PlanBasis = 'REVENUE' | 'MARGIN';

function periodMonthFrom(iso?: string): string {
  const ts = iso ? Date.parse(iso) : NaN;
  const d = Number.isNaN(ts) ? new Date() : new Date(ts);
  return d.toISOString().slice(0, 7); // YYYY-MM (UTC)
}

/**
 * Selects the single best-matching rule for a deal from a plan's rules.
 *
 * A rule matches when every populated scoping column matches the deal, and the
 * base amount falls within any populated tier bounds. Among matches, the rule
 * with the highest `priority` wins (ties broken by the more specific rule —
 * more populated scoping columns — then higher rate).
 */
export function selectRule(
  rules: Array<{
    id: string;
    appliesToRole: string | null;
    ownerId: string | null;
    productId: string | null;
    ratePercent: Decimal | string | number;
    tierMinAmount: Decimal | string | number | null;
    tierMaxAmount: Decimal | string | number | null;
    priority: number;
  }>,
  deal: { ownerId: string; productId?: string; ownerRole?: string; baseAmount: Decimal },
) {
  const specificity = (r: { appliesToRole: string | null; ownerId: string | null; productId: string | null }) =>
    (r.appliesToRole ? 1 : 0) + (r.ownerId ? 1 : 0) + (r.productId ? 1 : 0);

  const matches = rules.filter((r) => {
    if (r.ownerId && r.ownerId !== deal.ownerId) return false;
    if (r.productId && r.productId !== deal.productId) return false;
    if (r.appliesToRole && r.appliesToRole !== deal.ownerRole) return false;
    if (r.tierMinAmount != null && deal.baseAmount.lt(new Decimal(String(r.tierMinAmount)))) return false;
    if (r.tierMaxAmount != null && deal.baseAmount.gt(new Decimal(String(r.tierMaxAmount)))) return false;
    return true;
  });

  matches.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    const sd = specificity(b) - specificity(a);
    if (sd !== 0) return sd;
    return new Decimal(String(b.ratePercent)).cmp(new Decimal(String(a.ratePercent)));
  });

  return matches[0] ?? null;
}

export function createCommissionService(prisma: IncentivePrisma) {
  return {
    // ── Plans + rules CRUD ────────────────────────────────────────────────
    async listPlans(tenantId: string) {
      return prisma.commissionPlan.findMany({
        where: { tenantId },
        include: { rules: { orderBy: { priority: 'desc' } } },
        orderBy: { createdAt: 'desc' },
      });
    },

    async getPlan(tenantId: string, id: string) {
      return prisma.commissionPlan.findFirst({
        where: { tenantId, id },
        include: { rules: { orderBy: { priority: 'desc' } } },
      });
    },

    async createPlan(
      tenantId: string,
      input: {
        name: string;
        description?: string;
        isActive?: boolean;
        basis?: PlanBasis;
        effectiveFrom?: string;
        effectiveTo?: string;
        rules?: Array<{
          appliesToRole?: string;
          ownerId?: string;
          productId?: string;
          ratePercent: string | number;
          tierMinAmount?: string | number;
          tierMaxAmount?: string | number;
          priority?: number;
        }>;
      },
    ) {
      return prisma.commissionPlan.create({
        data: {
          tenantId,
          name: input.name,
          description: input.description ?? null,
          isActive: input.isActive ?? true,
          basis: input.basis ?? 'REVENUE',
          effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : null,
          effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
          rules: {
            create: (input.rules ?? []).map((r) => ({
              tenantId,
              appliesToRole: r.appliesToRole ?? null,
              ownerId: r.ownerId ?? null,
              productId: r.productId ?? null,
              ratePercent: new Decimal(r.ratePercent).toFixed(3),
              tierMinAmount: r.tierMinAmount === undefined ? null : new Decimal(r.tierMinAmount).toFixed(2),
              tierMaxAmount: r.tierMaxAmount === undefined ? null : new Decimal(r.tierMaxAmount).toFixed(2),
              priority: r.priority ?? 0,
            })),
          },
        },
        include: { rules: { orderBy: { priority: 'desc' } } },
      });
    },

    async updatePlan(
      tenantId: string,
      id: string,
      input: {
        name?: string;
        description?: string;
        isActive?: boolean;
        basis?: PlanBasis;
        effectiveFrom?: string | null;
        effectiveTo?: string | null;
      },
    ) {
      // Tenant guard: only update rows in this tenant.
      const existing = await prisma.commissionPlan.findFirst({ where: { tenantId, id } });
      if (!existing) return null;
      return prisma.commissionPlan.update({
        where: { id },
        data: {
          name: input.name,
          description: input.description,
          isActive: input.isActive,
          basis: input.basis,
          effectiveFrom:
            input.effectiveFrom === undefined ? undefined : input.effectiveFrom ? new Date(input.effectiveFrom) : null,
          effectiveTo:
            input.effectiveTo === undefined ? undefined : input.effectiveTo ? new Date(input.effectiveTo) : null,
        },
        include: { rules: { orderBy: { priority: 'desc' } } },
      });
    },

    async deletePlan(tenantId: string, id: string) {
      const existing = await prisma.commissionPlan.findFirst({ where: { tenantId, id } });
      if (!existing) return null;
      await prisma.commissionPlan.delete({ where: { id } });
      return { id };
    },

    async addRule(
      tenantId: string,
      planId: string,
      input: {
        appliesToRole?: string;
        ownerId?: string;
        productId?: string;
        ratePercent: string | number;
        tierMinAmount?: string | number;
        tierMaxAmount?: string | number;
        priority?: number;
      },
    ) {
      const plan = await prisma.commissionPlan.findFirst({ where: { tenantId, id: planId } });
      if (!plan) return null;
      return prisma.commissionRule.create({
        data: {
          planId,
          tenantId,
          appliesToRole: input.appliesToRole ?? null,
          ownerId: input.ownerId ?? null,
          productId: input.productId ?? null,
          ratePercent: new Decimal(input.ratePercent).toFixed(3),
          tierMinAmount: input.tierMinAmount === undefined ? null : new Decimal(input.tierMinAmount).toFixed(2),
          tierMaxAmount: input.tierMaxAmount === undefined ? null : new Decimal(input.tierMaxAmount).toFixed(2),
          priority: input.priority ?? 0,
        },
      });
    },

    async deleteRule(tenantId: string, ruleId: string) {
      const existing = await prisma.commissionRule.findFirst({ where: { tenantId, id: ruleId } });
      if (!existing) return null;
      await prisma.commissionRule.delete({ where: { id: ruleId } });
      return { id: ruleId };
    },

    // ── Statements read + transitions ─────────────────────────────────────
    async listStatements(
      tenantId: string,
      filter: { ownerId?: string; periodMonth?: string; status?: 'PENDING' | 'APPROVED' | 'PAID' } = {},
    ) {
      return prisma.commissionStatement.findMany({
        take: 500,
        where: {
          tenantId,
          ownerId: filter.ownerId,
          periodMonth: filter.periodMonth,
          status: filter.status,
        },
        orderBy: { createdAt: 'desc' },
      });
    },

    async approveStatement(tenantId: string, id: string, approvedBy: string) {
      const existing = await prisma.commissionStatement.findFirst({ where: { tenantId, id } });
      if (!existing) return null;
      if (existing.status !== 'PENDING') {
        throw new Error(`Cannot approve a statement in status ${existing.status}`);
      }
      return prisma.commissionStatement.update({
        where: { id },
        data: { status: 'APPROVED', approvedAt: new Date(), approvedBy },
      });
    },

    async payStatement(tenantId: string, id: string) {
      const existing = await prisma.commissionStatement.findFirst({ where: { tenantId, id } });
      if (!existing) return null;
      if (existing.status !== 'APPROVED') {
        throw new Error(`Cannot pay a statement in status ${existing.status}; approve it first`);
      }
      return prisma.commissionStatement.update({
        where: { id },
        data: { status: 'PAID', paidAt: new Date() },
      });
    },

    // ── Rules engine: compute + persist a statement for a won deal ─────────
    /**
     * Given a won deal, find the applicable active plan for the tenant, select
     * the best matching rule, compute the commission, and create a
     * CommissionStatement. Idempotent per [tenantId, dealId]: a replayed
     * deal.won event is a no-op (returns the existing statement).
     *
     * Returns the statement, or null when no active/effective plan+rule applies.
     */
    async computeForWonDeal(tenantId: string, deal: WonDeal) {
      if (!tenantId || !deal.dealId || !deal.ownerId) return null;

      // Idempotency: bail early if already computed for this deal.
      const already = await prisma.commissionStatement.findUnique({
        where: { tenantId_dealId: { tenantId, dealId: deal.dealId } },
      });
      if (already) return already;

      const now = deal.occurredAt ? new Date(deal.occurredAt) : new Date();
      const plans = await prisma.commissionPlan.findMany({
        take: 100,
        where: {
          tenantId,
          isActive: true,
          AND: [
            { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: now } }] },
            { OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] },
          ],
        },
        include: { rules: true },
        orderBy: { createdAt: 'desc' },
      });

      const revenue = new Decimal(String(deal.amount ?? 0));
      // Evaluate plans in order; first plan with a matching rule wins.
      for (const plan of plans) {
        const basis = plan.basis as PlanBasis;
        const baseAmount =
          basis === 'MARGIN' && deal.marginAmount !== undefined
            ? new Decimal(String(deal.marginAmount))
            : revenue;
        const rule = selectRule(plan.rules, {
          ownerId: deal.ownerId,
          productId: deal.productId,
          ownerRole: deal.ownerRole,
          baseAmount,
        });
        if (!rule) continue;

        const ratePercent = new Decimal(String(rule.ratePercent));
        const commissionAmount = baseAmount.mul(ratePercent).div(100);

        // Guard the create against a race/replay via the unique constraint.
        try {
          return await prisma.commissionStatement.create({
            data: {
              tenantId,
              ownerId: deal.ownerId,
              dealId: deal.dealId,
              planId: plan.id,
              ruleId: rule.id,
              baseAmount: baseAmount.toFixed(2),
              ratePercent: ratePercent.toFixed(3),
              commissionAmount: commissionAmount.toFixed(2),
              currency: deal.currency ?? 'USD',
              status: 'PENDING',
              periodMonth: periodMonthFrom(deal.occurredAt),
            },
          });
        } catch (err) {
          // Unique-constraint violation → another worker/replay won the race.
          const existing = await prisma.commissionStatement.findUnique({
            where: { tenantId_dealId: { tenantId, dealId: deal.dealId } },
          });
          if (existing) return existing;
          throw err;
        }
      }

      return null; // no applicable plan/rule
    },
  };
}
