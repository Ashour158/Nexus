import { NotFoundError } from '@nexus/service-utils';
import type { Prisma } from '../../../../node_modules/.prisma/billing-client/index.js';
import type { Plan } from '../../../../node_modules/.prisma/billing-client/index.js';
import type { BillingPrisma } from '../prisma.js';

export function createPlansService(prisma: BillingPrisma) {
  async function loadPlan(id: string): Promise<Plan> {
    const row = await prisma.plan.findFirst({ where: { id } });
    if (!row) throw new NotFoundError('Plan', id);
    return row;
  }

  return {
    async listPlans(): Promise<Plan[]> {
      return prisma.plan.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      });
    },

    async getPlanById(id: string): Promise<Plan> {
      return loadPlan(id);
    },

    async createPlan(data: {
      name: string;
      description?: string;
      stripePriceId?: string;
      intervalType: string;
      basePrice: Prisma.Decimal;
      currency?: string;
      maxSeats?: number;
      features?: Prisma.InputJsonValue;
    }): Promise<Plan> {
      return prisma.plan.create({
        data: {
          name: data.name,
          description: data.description ?? null,
          stripePriceId: data.stripePriceId ?? null,
          intervalType: data.intervalType,
          basePrice: data.basePrice,
          currency: data.currency ?? 'USD',
          maxSeats: data.maxSeats ?? null,
          features: data.features ?? [],
        },
      });
    },

    async updatePlan(
      id: string,
      data: Partial<{
        name: string;
        description: string | null;
        stripePriceId: string | null;
        intervalType: string;
        basePrice: Prisma.Decimal;
        currency: string;
        maxSeats: number | null;
        features: Prisma.InputJsonValue;
        isActive: boolean;
      }>
    ): Promise<Plan> {
      await loadPlan(id);
      return prisma.plan.update({
        where: { id },
        data: {
          ...data,
          version: { increment: 1 },
        },
      });
    },

    async deletePlan(id: string): Promise<Plan> {
      await loadPlan(id);
      return prisma.plan.update({
        where: { id },
        data: { isActive: false, version: { increment: 1 } },
      });
    },
  };
}
