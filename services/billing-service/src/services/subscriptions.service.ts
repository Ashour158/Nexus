import { TOPICS, type NexusProducer } from '@nexus/kafka';
import { BusinessRuleError, NotFoundError } from '@nexus/service-utils';
import type { Prisma } from '../../../../node_modules/.prisma/billing-client/index.js';
import type { Plan, Subscription, UsageRecord } from '../../../../node_modules/.prisma/billing-client/index.js';
import type { BillingPrisma } from '../prisma.js';

function addPeriod(start: Date, intervalType: string): Date {
  const d = new Date(start);
  if (intervalType === 'annual') {
    d.setUTCFullYear(d.getUTCFullYear() + 1);
  } else {
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return d;
}

export function createSubscriptionsService(prisma: BillingPrisma, producer: NexusProducer) {
  async function loadSubscription(tenantId: string): Promise<Subscription & { plan: Plan }> {
    const row = await prisma.subscription.findFirst({
      where: { tenantId },
      include: { plan: true },
    });
    if (!row) throw new NotFoundError('Subscription', tenantId);
    return row;
  }

  return {
    async getSubscription(tenantId: string): Promise<Subscription & { plan: Plan }> {
      return loadSubscription(tenantId);
    },

    async createSubscription(
      tenantId: string,
      data: {
        planId: string;
        stripeCustomerId?: string;
        seats?: number;
        trialDays?: number;
      }
    ): Promise<Subscription> {
      const existing = await prisma.subscription.findFirst({ where: { tenantId } });
      if (existing) {
        throw new BusinessRuleError('Tenant already has a subscription');
      }
      const plan = await prisma.plan.findFirst({ where: { id: data.planId, isActive: true } });
      if (!plan) throw new NotFoundError('Plan', data.planId);

      const now = new Date();
      const trialDays = data.trialDays ?? 0;
      const trialEndsAt = trialDays > 0 ? new Date(now.getTime() + trialDays * 86400_000) : null;
      const currentPeriodStart = now;
      const currentPeriodEnd = addPeriod(now, plan.intervalType);
      const status = trialDays > 0 ? 'TRIALING' : 'ACTIVE';

      const sub = await prisma.subscription.create({
        data: {
          tenantId,
          planId: plan.id,
          stripeCustomerId: data.stripeCustomerId ?? null,
          seats: data.seats ?? 1,
          trialEndsAt,
          currentPeriodStart,
          currentPeriodEnd,
          status,
        },
      });
      await producer.publish(TOPICS.BILLING, {
        type: 'billing.subscription.created',
        tenantId,
        payload: {
          subscriptionId: sub.id,
          tenantId,
          planId: sub.planId,
          status: sub.status,
        },
      });
      return sub;
    },

    async updateSubscription(
      tenantId: string,
      data: { planId?: string; seats?: number; cancelAtPeriodEnd?: boolean }
    ): Promise<Subscription> {
      const existing = await loadSubscription(tenantId);
      const update: Prisma.SubscriptionUpdateInput = { version: { increment: 1 } };
      if (data.planId !== undefined) {
        const p = await prisma.plan.findFirst({ where: { id: data.planId, isActive: true } });
        if (!p) throw new NotFoundError('Plan', data.planId);
        update.plan = { connect: { id: data.planId } };
      }
      if (data.seats !== undefined) update.seats = data.seats;
      if (data.cancelAtPeriodEnd !== undefined) update.cancelAtPeriodEnd = data.cancelAtPeriodEnd;
      const sub = await prisma.subscription.update({
        where: { id: existing.id },
        data: update,
      });
      await producer.publish(TOPICS.BILLING, {
        type: 'billing.subscription.updated',
        tenantId,
        payload: {
          subscriptionId: sub.id,
          tenantId,
          planId: sub.planId,
          status: sub.status,
        },
      });
      return sub;
    },

    async cancelSubscription(tenantId: string): Promise<Subscription> {
      const existing = await loadSubscription(tenantId);
      const sub = await prisma.subscription.update({
        where: { id: existing.id },
        data: { cancelAtPeriodEnd: true, version: { increment: 1 } },
      });
      await producer.publish(TOPICS.BILLING, {
        type: 'billing.subscription.canceled',
        tenantId,
        payload: { subscriptionId: sub.id, tenantId },
      });
      return sub;
    },

    async recordUsage(
      tenantId: string,
      data: { metric: string; quantity: number }
    ): Promise<UsageRecord> {
      const existing = await prisma.subscription.findFirst({ where: { tenantId } });
      if (!existing) throw new NotFoundError('Subscription', tenantId);
      return prisma.usageRecord.create({
        data: {
          tenantId,
          subscriptionId: existing.id,
          metric: data.metric,
          quantity: data.quantity,
        },
      });
    },

    async getUsageSummary(
      tenantId: string,
      period: { from: string; to: string }
    ): Promise<Array<{ metric: string; total: number }>> {
      const from = new Date(period.from);
      const to = new Date(period.to);
      const rows = await prisma.usageRecord.groupBy({
        by: ['metric'],
        where: {
          tenantId,
          recordedAt: { gte: from, lte: to },
        },
        _sum: { quantity: true },
      });
      return rows.map((r: { metric: string; _sum: { quantity: number | null } }) => ({
        metric: r.metric,
        total: r._sum.quantity ?? 0,
      }));
    },
  };
}
