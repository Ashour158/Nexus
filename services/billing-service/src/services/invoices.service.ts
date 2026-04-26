import { Decimal } from 'decimal.js';
import { TOPICS, type NexusProducer } from '@nexus/kafka';
import { NotFoundError } from '@nexus/service-utils';
import type { BillingInvoice } from '../../../../node_modules/.prisma/billing-client/index.js';
import type { BillingPrisma } from '../prisma.js';

const OVERAGE_UNIT: Record<string, string> = {
  api_calls: '0.0001',
  storage_gb: '0.5',
  emails_sent: '0.001',
};

export function createBillingInvoicesService(prisma: BillingPrisma, producer: NexusProducer) {
  async function loadInvoice(tenantId: string, id: string): Promise<BillingInvoice> {
    const row = await prisma.billingInvoice.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundError('BillingInvoice', id);
    return row;
  }

  return {
    async listInvoices(
      tenantId: string,
      pagination: { page: number; limit: number }
    ): Promise<{ items: BillingInvoice[]; total: number }> {
      const { page, limit } = pagination;
      const [total, items] = await Promise.all([
        prisma.billingInvoice.count({ where: { tenantId } }),
        prisma.billingInvoice.findMany({
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
      ]);
      return { items, total };
    },

    async getInvoice(tenantId: string, id: string): Promise<BillingInvoice> {
      return loadInvoice(tenantId, id);
    },

    async generateInvoice(tenantId: string, subscriptionId: string): Promise<BillingInvoice> {
      const sub = await prisma.subscription.findFirst({
        where: { id: subscriptionId, tenantId },
        include: { plan: true },
      });
      if (!sub) throw new NotFoundError('Subscription', subscriptionId);

      const periodStart = sub.currentPeriodStart;
      const periodEnd = sub.currentPeriodEnd;
      const usage = await prisma.usageRecord.findMany({
        where: {
          tenantId,
          subscriptionId: sub.id,
          recordedAt: { gte: periodStart, lte: periodEnd },
        },
      });

      const base = new Decimal(sub.plan.basePrice.toString()).mul(sub.seats);
      let overage = new Decimal(0);
      const lineItems: Array<{ description: string; qty: number; unitPrice: string; total: string }> = [
        {
          description: `${sub.plan.name} (${sub.plan.intervalType}) × ${sub.seats} seat(s)`,
          qty: sub.seats,
          unitPrice: sub.plan.basePrice.toString(),
          total: new Decimal(sub.plan.basePrice.toString()).mul(sub.seats).toFixed(2),
        },
      ];

      const byMetric = new Map<string, number>();
      for (const u of usage) {
        byMetric.set(u.metric, (byMetric.get(u.metric) ?? 0) + u.quantity);
      }
      for (const [metric, qty] of byMetric) {
        const rate = OVERAGE_UNIT[metric];
        if (!rate) continue;
        const unit = new Decimal(rate);
        const lineTotal = unit.mul(qty);
        overage = overage.plus(lineTotal);
        lineItems.push({
          description: `Overage: ${metric}`,
          qty,
          unitPrice: rate,
          total: lineTotal.toFixed(2),
        });
      }

      const amount = base.plus(overage);
      const inv = await prisma.billingInvoice.create({
        data: {
          tenantId,
          subscriptionId: sub.id,
          amount: amount.toFixed(2),
          currency: sub.plan.currency,
          status: 'OPEN',
          periodStart,
          periodEnd,
          dueAt: new Date(periodEnd.getTime() + 14 * 86400_000),
          lineItems,
        },
      });
      await producer.publish(TOPICS.BILLING, {
        type: 'billing.invoice.generated',
        tenantId,
        payload: {
          invoiceId: inv.id,
          tenantId,
          subscriptionId: sub.id,
          amount: Number(inv.amount),
        },
      });
      return inv;
    },

    async markPaid(tenantId: string, id: string, paidAt?: Date): Promise<BillingInvoice> {
      await loadInvoice(tenantId, id);
      const inv = await prisma.billingInvoice.update({
        where: { id },
        data: {
          status: 'PAID',
          paidAt: paidAt ?? new Date(),
          version: { increment: 1 },
        },
      });
      await producer.publish(TOPICS.BILLING, {
        type: 'billing.invoice.paid',
        tenantId,
        payload: { invoiceId: inv.id, tenantId, paidAt: (inv.paidAt ?? new Date()).toISOString() },
      });
      return inv;
    },

    async voidInvoice(tenantId: string, id: string): Promise<BillingInvoice> {
      await loadInvoice(tenantId, id);
      const inv = await prisma.billingInvoice.update({
        where: { id },
        data: { status: 'VOID', version: { increment: 1 } },
      });
      await producer.publish(TOPICS.BILLING, {
        type: 'billing.invoice.voided',
        tenantId,
        payload: { invoiceId: inv.id, tenantId },
      });
      return inv;
    },
  };
}
