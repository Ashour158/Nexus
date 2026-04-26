import { Decimal } from 'decimal.js';
import type { PlanningPrisma } from '../prisma.js';

interface QuotaTargetInput {
  ownerId: string;
  targetValue: string | number;
  currency?: string;
}

interface QuotaPlanInput {
  name: string;
  year: number;
  quarter?: number | null;
  type?: 'REVENUE' | 'DEAL_COUNT' | 'ACTIVITY_COUNT' | 'NEW_LOGOS';
  currency?: string;
  isActive?: boolean;
  targets?: QuotaTargetInput[];
}

function periodParams(plan: { year: number; quarter: number | null }): { year: number; quarter?: number } {
  return plan.quarter ? { year: plan.year, quarter: plan.quarter } : { year: plan.year };
}

export function createQuotasService(prisma: PlanningPrisma) {
  return {
    async listPlans(tenantId: string, year?: number) {
      return prisma.quotaPlan.findMany({
        where: { tenantId, year, isActive: true },
        include: { targets: true },
        orderBy: [{ year: 'desc' }, { quarter: 'desc' }],
      });
    },

    async createPlan(tenantId: string, input: QuotaPlanInput) {
      return prisma.$transaction(async (tx) => {
        const plan = await tx.quotaPlan.create({
          data: {
            tenantId,
            name: input.name,
            year: input.year,
            quarter: input.quarter ?? null,
            type: input.type ?? 'REVENUE',
            currency: input.currency ?? 'USD',
            isActive: input.isActive ?? true,
          },
        });
        if (input.targets?.length) {
          await tx.quotaTarget.createMany({
            data: input.targets.map((target) => ({
              tenantId,
              planId: plan.id,
              ownerId: target.ownerId,
              targetValue: new Decimal(target.targetValue).toFixed(2),
              currency: target.currency ?? input.currency ?? 'USD',
            })),
          });
        }
        return tx.quotaPlan.findFirst({
          where: { tenantId, id: plan.id },
          include: { targets: true },
        });
      });
    },

    async updatePlan(tenantId: string, id: string, input: Partial<QuotaPlanInput>) {
      const existing = await prisma.quotaPlan.findFirst({ where: { tenantId, id } });
      if (!existing) return null;
      return prisma.$transaction(async (tx) => {
        await tx.quotaPlan.update({
          where: { id },
          data: {
            name: input.name,
            year: input.year,
            quarter: input.quarter,
            type: input.type,
            currency: input.currency,
            isActive: input.isActive,
          },
        });
        for (const target of input.targets ?? []) {
          await tx.quotaTarget.upsert({
            where: { planId_ownerId: { planId: id, ownerId: target.ownerId } },
            update: {
              targetValue: new Decimal(target.targetValue).toFixed(2),
              currency: target.currency ?? input.currency ?? existing.currency,
            },
            create: {
              tenantId,
              planId: id,
              ownerId: target.ownerId,
              targetValue: new Decimal(target.targetValue).toFixed(2),
              currency: target.currency ?? input.currency ?? existing.currency,
            },
          });
        }
        return tx.quotaPlan.findFirst({
          where: { tenantId, id },
          include: { targets: true },
        });
      });
    },

    async getPlanAttainment(tenantId: string, planId: string) {
      const plan = await prisma.quotaPlan.findFirst({
        where: { tenantId, id: planId },
        include: { targets: true },
      });
      if (!plan) return null;
      const analyticsUrl = process.env.ANALYTICS_SERVICE_URL ?? 'http://localhost:3008';
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(periodParams(plan))) {
        params.set(key, String(value));
      }
      const responseBody = (await fetch(`${analyticsUrl}/api/v1/analytics/revenue/by-rep?${params.toString()}`, {
        headers: { Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN ?? ''}` },
      })
        .then((res) => (res.ok ? res.json() : { data: [] }))
        .catch(() => ({ data: [] as Array<{ ownerId: string; totalRevenue: number | string }> }))) as {
        data?: Array<{ ownerId: string; totalRevenue: number | string }>;
      };
      const actualByOwner = new Map<string, Decimal>();
      for (const row of responseBody.data ?? []) {
        actualByOwner.set(row.ownerId, new Decimal(row.totalRevenue ?? 0));
      }
      return plan.targets.map((target) => {
        const quota = new Decimal(target.targetValue.toString());
        const actual = actualByOwner.get(target.ownerId) ?? new Decimal(0);
        const attainmentPct = quota.gt(0) ? actual.div(quota).mul(100) : new Decimal(0);
        return {
          ownerId: target.ownerId,
          target: quota.toFixed(2),
          actual: actual.toFixed(2),
          attainmentPct: attainmentPct.toFixed(2),
          currency: target.currency,
        };
      });
    },

    async whatIfClose(tenantId: string, ownerId: string, dealAmounts: Array<string | number>) {
      const now = new Date();
      const plan = await prisma.quotaPlan.findFirst({
        where: { tenantId, year: now.getFullYear(), isActive: true, targets: { some: { ownerId } } },
        include: { targets: { where: { ownerId } } },
        orderBy: [{ quarter: 'desc' }, { createdAt: 'desc' }],
      });
      const target = plan?.targets[0];
      const currentRows = plan ? await this.getPlanAttainment(tenantId, plan.id) : [];
      const current = new Decimal(currentRows?.find((row) => row.ownerId === ownerId)?.actual ?? 0);
      const selected = dealAmounts.reduce((sum, amount) => sum.plus(amount), new Decimal(0));
      const quota = new Decimal(target?.targetValue?.toString() ?? 0);
      const projected = current.plus(selected);
      return {
        ownerId,
        current: current.toFixed(2),
        selected: selected.toFixed(2),
        projected: projected.toFixed(2),
        quota: quota.toFixed(2),
        projectedAttainmentPct: quota.gt(0) ? projected.div(quota).mul(100).toFixed(2) : '0.00',
      };
    },
  };
}
