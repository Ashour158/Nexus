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
  /**
   * Deal-team splits emitted by crm-service on `deal.won`. When present with at
   * least one valid REVENUE split whose percentages are sane (see
   * normalizeRevenueSplits), commission is credited per revenue-split member on
   * their proportional slice of the deal amount/margin. When absent, empty, or
   * malformed, the engine falls back to full credit for `ownerId` at 100%.
   */
  teamSplits?: TeamSplit[];
}

/** A single deal-team split member as emitted by crm-service. */
export interface TeamSplit {
  userId: string;
  role?: string;
  /** "revenue" | "overlay" (case-insensitive). */
  splitType?: string;
  /** 0-100. */
  splitPercent?: number | string;
}

/**
 * Validate + normalize teamSplits into the set of revenue-split members to
 * credit. Returns null (→ caller falls back to owner-100%) when the array is
 * absent, has no usable revenue member, or is malformed / under-allocated.
 *
 * Rules (fail-safe toward the legacy single-owner behavior):
 *  - Only REVENUE splits participate in the revenue pool. OVERLAY splits are
 *    intentionally NOT credited here (see overlay decision in the change note).
 *  - Every revenue split must have a userId and a finite percent in (0, 100].
 *  - Revenue percentages must sum to ~100 (±0.5 tolerance). If they sum to
 *    < ~100 (under-allocated) or the array is malformed, return null so the
 *    caller credits owner-100% instead of a partial amount.
 */
export function normalizeRevenueSplits(
  splits: TeamSplit[] | undefined,
): Array<{ userId: string; percent: Decimal }> | null {
  if (!Array.isArray(splits) || splits.length === 0) return null;

  const revenue: Array<{ userId: string; percent: Decimal }> = [];
  for (const s of splits) {
    const type = String(s?.splitType ?? 'revenue').toLowerCase();
    if (type !== 'revenue') continue; // overlay/other → not part of the revenue pool
    if (!s?.userId || typeof s.userId !== 'string') return null; // malformed
    let percent: Decimal;
    try {
      percent = new Decimal(String(s.splitPercent));
    } catch {
      return null; // malformed percent
    }
    if (!percent.isFinite() || percent.lte(0) || percent.gt(100)) return null;
    revenue.push({ userId: s.userId, percent });
  }

  if (revenue.length === 0) return null; // no revenue member → fall back to owner

  const sum = revenue.reduce((acc, r) => acc.plus(r.percent), new Decimal(0));
  // Reject under-allocation and anything outside a small tolerance around 100.
  // (Over-allocation would over-pay; under-allocation would under-pay — both
  // are safer handled as owner-100% fallback.)
  if (sum.minus(100).abs().gt(new Decimal('0.5'))) return null;

  return revenue;
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

    // ── Rules engine: compute + persist statement(s) for a won deal ────────
    /**
     * Given a won deal, find the applicable active plan for the tenant, select
     * the best matching rule, compute the commission, and persist a
     * CommissionStatement per credited rep.
     *
     * Split-aware credit:
     *  - When `deal.teamSplits` carries a valid set of REVENUE splits (see
     *    normalizeRevenueSplits), one statement is created per revenue-split
     *    member, computed on that member's proportional slice of the base
     *    amount (e.g. amount 15000, member A 60% → base 9000; member B 40% →
     *    base 6000). Each member's rule is selected for THAT member (their own
     *    ownerId/role), so per-rep rate scoping still applies.
     *  - Otherwise (absent/empty/malformed/under-allocated splits) it falls back
     *    to the exact legacy behavior: full credit to `ownerId` at 100%.
     *
     * OVERLAY splits are intentionally not credited here — see the change note.
     *
     * Idempotent per [tenantId, dealId, ownerId]: a replayed deal.won cannot
     * double-credit any rep. Returns the array of statements created/existing
     * for this deal (may be empty when no plan/rule applies to any member).
     */
    async computeForWonDeal(tenantId: string, deal: WonDeal) {
      if (!tenantId || !deal.dealId || !deal.ownerId) return null;

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

      // Decide the set of reps to credit and each one's revenue weight.
      // Fallback (null) → owner at 100%, preserving the legacy single-owner path.
      const revenueSplits = normalizeRevenueSplits(deal.teamSplits);
      const members: Array<{ ownerId: string; ownerRole?: string; weight: Decimal; splitType: string | null }> =
        revenueSplits === null
          ? [{ ownerId: deal.ownerId, ownerRole: deal.ownerRole, weight: new Decimal(100), splitType: null }]
          : revenueSplits.map((r) => ({
              ownerId: r.userId,
              // Role scoping for split members isn't emitted per-member today;
              // reuse the deal owner's role as the best available signal.
              ownerRole: deal.ownerRole,
              weight: r.percent,
              splitType: 'REVENUE',
            }));

      const results = [];
      for (const m of members) {
        const stmt = await computeMemberStatement(prisma, tenantId, deal, plans, m);
        if (stmt) results.push(stmt);
      }
      return results;
    },
  };
}

/**
 * Compute + persist a single rep's statement for a deal on their revenue slice.
 * Idempotent per [tenantId, dealId, ownerId]. Returns the statement or null when
 * no active plan/rule matches this member.
 */
async function computeMemberStatement(
  prisma: IncentivePrisma,
  tenantId: string,
  deal: WonDeal,
  plans: Array<{ id: string; basis: string; rules: Parameters<typeof selectRule>[0] }>,
  member: { ownerId: string; ownerRole?: string; weight: Decimal; splitType: string | null },
) {
  // Idempotency: bail early if this rep is already credited for this deal.
  const already = await prisma.commissionStatement.findUnique({
    where: { tenantId_dealId_ownerId: { tenantId, dealId: deal.dealId, ownerId: member.ownerId } },
  });
  if (already) return already;

  const weightFraction = member.weight.div(100);
  const fullRevenue = new Decimal(String(deal.amount ?? 0));
  const fullMargin = deal.marginAmount !== undefined ? new Decimal(String(deal.marginAmount)) : null;

  for (const plan of plans) {
    const basis = plan.basis as PlanBasis;
    const fullBase = basis === 'MARGIN' && fullMargin !== null ? fullMargin : fullRevenue;
    // The member is credited on their proportional slice of the base amount.
    const baseAmount = fullBase.mul(weightFraction);

    const rule = selectRule(plan.rules, {
      ownerId: member.ownerId,
      productId: deal.productId,
      ownerRole: member.ownerRole,
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
          ownerId: member.ownerId,
          dealId: deal.dealId,
          planId: plan.id,
          ruleId: rule.id,
          splitType: member.splitType,
          splitPercent: member.splitType === null ? null : member.weight.toFixed(3),
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
        where: { tenantId_dealId_ownerId: { tenantId, dealId: deal.dealId, ownerId: member.ownerId } },
      });
      if (existing) return existing;
      throw err;
    }
  }

  return null; // no applicable plan/rule for this member
}
