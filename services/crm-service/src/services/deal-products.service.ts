import { NexusProducer, TOPICS } from '@nexus/kafka';
import { NotFoundError } from '@nexus/service-utils';
import { Prisma } from '../../../../node_modules/.prisma/crm-client/index.js';
import type { DealProduct } from '../../../../node_modules/.prisma/crm-client/index.js';
import type { CrmPrisma } from '../prisma.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CreateDealProductInput {
  productId?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
}

export interface UpdateDealProductInput {
  productId?: string | null;
  name?: string;
  quantity?: number;
  unitPrice?: number;
  discountPercent?: number;
}

/**
 * Interactive-transaction client type as provided by the replica-wrapper
 * `$transaction(fn)` overload. Not assignable to `CrmPrisma` (missing
 * `$transaction`/`$extends`/etc.), so we derive it from the callback arg.
 */
type TxClient = Parameters<Parameters<CrmPrisma['$transaction']>[0]>[0];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** lineTotal = quantity * unitPrice * (1 - discountPercent/100), rounded to 2dp. */
function computeLineTotal(
  quantity: Prisma.Decimal | number,
  unitPrice: Prisma.Decimal | number,
  discountPercent: Prisma.Decimal | number
): Prisma.Decimal {
  const q = new Prisma.Decimal(quantity);
  const p = new Prisma.Decimal(unitPrice);
  const d = new Prisma.Decimal(discountPercent);
  const factor = new Prisma.Decimal(1).minus(d.dividedBy(100));
  return q.times(p).times(factor).toDecimalPlaces(2);
}

// ─── Service Factory ────────────────────────────────────────────────────────

/**
 * Deal line-items service. Owns `DealProduct` rows and keeps `Deal.amount`
 * in sync as the sum of every line's `lineTotal` (in the deal's currency).
 * Every write recomputes the roll-up inside a transaction and emits
 * `deal.updated` so downstream forecast/analytics stay consistent.
 */
export function createDealProductsService(prisma: CrmPrisma, producer: NexusProducer) {
  async function loadDealOrThrow(tenantId: string, dealId: string) {
    const deal = await prisma.deal.findFirst({ where: { id: dealId, tenantId } });
    if (!deal) throw new NotFoundError('Deal', dealId);
    return deal;
  }

  async function loadProductOrThrow(tenantId: string, id: string): Promise<DealProduct> {
    const row = await prisma.dealProduct.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundError('DealProduct', id);
    return row;
  }

  /**
   * Recomputes `Deal.amount = sum(lineTotal)` for the deal. Runs against the
   * passed transaction client. Typed loosely because the interactive-tx client
   * from the replica-wrapper `$transaction` overload is not assignable to
   * `CrmPrisma` (same limitation noted for the optimistic-lock path).
   */
  async function recomputeDealAmount(
    tx: TxClient,
    tenantId: string,
    dealId: string
  ): Promise<void> {
    const agg = await tx.dealProduct.aggregate({
      where: { tenantId, dealId },
      _sum: { lineTotal: true },
    });
    const total = agg._sum.lineTotal ?? new Prisma.Decimal(0);
    await tx.deal.update({
      where: { id: dealId },
      data: { amount: total },
    });
  }

  async function emitDealAmountChanged(tenantId: string, dealId: string): Promise<void> {
    const deal = await prisma.deal.findFirst({ where: { id: dealId, tenantId } });
    if (!deal) return;
    await producer.publish(TOPICS.DEALS, {
      type: 'deal.updated',
      tenantId,
      payload: {
        dealId: deal.id,
        ownerId: deal.ownerId,
        accountId: deal.accountId,
        pipelineId: deal.pipelineId,
        stageId: deal.stageId,
        status: deal.status,
        amount: Number(deal.amount.toFixed(2)),
        currency: deal.currency,
        changedFields: ['amount'],
      },
    });
  }

  return {
    async listByDeal(tenantId: string, dealId: string): Promise<DealProduct[]> {
      await loadDealOrThrow(tenantId, dealId);
      return prisma.dealProduct.findMany({
        where: { tenantId, dealId },
        orderBy: { createdAt: 'asc' },
      });
    },

    async create(
      tenantId: string,
      dealId: string,
      input: CreateDealProductInput
    ): Promise<DealProduct> {
      const deal = await loadDealOrThrow(tenantId, dealId);
      const discountPercent = input.discountPercent ?? 0;
      const lineTotal = computeLineTotal(input.quantity, input.unitPrice, discountPercent);

      const created = await prisma.$transaction(async (tx: TxClient) => {
        const row = await tx.dealProduct.create({
          data: {
            tenantId,
            dealId,
            productId: input.productId ?? null,
            name: input.name,
            quantity: new Prisma.Decimal(input.quantity),
            unitPrice: new Prisma.Decimal(input.unitPrice),
            discountPercent: new Prisma.Decimal(discountPercent),
            lineTotal,
            currency: deal.currency,
          },
        });
        await recomputeDealAmount(tx, tenantId, dealId);
        return row;
      });

      await emitDealAmountChanged(tenantId, dealId);
      return created;
    },

    async update(
      tenantId: string,
      id: string,
      input: UpdateDealProductInput
    ): Promise<DealProduct> {
      const existing = await loadProductOrThrow(tenantId, id);

      const quantity = input.quantity ?? existing.quantity;
      const unitPrice = input.unitPrice ?? existing.unitPrice;
      const discountPercent = input.discountPercent ?? existing.discountPercent;
      const lineTotal = computeLineTotal(quantity, unitPrice, discountPercent);

      const data: Prisma.DealProductUpdateInput = { lineTotal };
      if (input.productId !== undefined) data.productId = input.productId;
      if (input.name !== undefined) data.name = input.name;
      if (input.quantity !== undefined) data.quantity = new Prisma.Decimal(input.quantity);
      if (input.unitPrice !== undefined) data.unitPrice = new Prisma.Decimal(input.unitPrice);
      if (input.discountPercent !== undefined) {
        data.discountPercent = new Prisma.Decimal(input.discountPercent);
      }

      const updated = await prisma.$transaction(async (tx: TxClient) => {
        const row = await tx.dealProduct.update({ where: { id }, data });
        await recomputeDealAmount(tx, tenantId, existing.dealId);
        return row;
      });

      await emitDealAmountChanged(tenantId, existing.dealId);
      return updated;
    },

    async remove(tenantId: string, id: string): Promise<{ id: string; dealId: string }> {
      const existing = await loadProductOrThrow(tenantId, id);
      await prisma.$transaction(async (tx: TxClient) => {
        await tx.dealProduct.delete({ where: { id } });
        await recomputeDealAmount(tx, tenantId, existing.dealId);
      });
      await emitDealAmountChanged(tenantId, existing.dealId);
      return { id, dealId: existing.dealId };
    },
  };
}
