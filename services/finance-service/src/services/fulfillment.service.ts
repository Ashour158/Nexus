// ─── B1: Sales-Order fulfillment / delivery status ─────────────────────────
// CRM-level delivery tracking (partial + %-delivered + %-billed). NOT a WMS —
// no warehouse/bin/stock logistics. Each OrderFulfillment is one delivery event
// carrying a per-line delivered-quantity map; the order's own status advances as
// fulfillments progress (CONFIRMED → FULFILLING → FULFILLED). `percentBilled` is
// derived from the invoices linked to the order (Invoice.orderId).

import { Decimal } from 'decimal.js';
import type { EngineContext } from '@nexus/domain-core';
import { TOPICS, type NexusProducer } from '@nexus/kafka';
import { BusinessRuleError, NotFoundError, ValidationError } from '@nexus/service-utils';
import { Prisma } from '../../../../node_modules/.prisma/finance-client/index.js';
import type { FinancePrisma } from '../prisma.js';

export type OrderFulfillmentStatus = 'PENDING' | 'PARTIAL' | 'FULFILLED' | 'CANCELLED';

export type CreateFulfillmentInput = {
  deliveredQtyByLine: Record<string, number>;
  status?: OrderFulfillmentStatus;
  deliveredAt?: string;
  reference?: string;
  carrier?: string;
  trackingNumber?: string;
  notes?: string;
};

export type UpdateFulfillmentInput = {
  deliveredQtyByLine?: Record<string, number>;
  status?: OrderFulfillmentStatus;
  deliveredAt?: string | null;
  reference?: string;
  carrier?: string;
  trackingNumber?: string;
  notes?: string;
};

type OrderRow = {
  id: string;
  tenantId: string;
  orderNumber: string;
  accountId: string;
  status: string;
  total: Prisma.Decimal;
  currency: string;
  lineItems: unknown;
};

type FulfillmentRow = {
  id: string;
  status: string;
  deliveredQtyByLine: unknown;
};

function actor(ctx: EngineContext) {
  return ctx.audit.actor;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Stable per-line key: prefer an explicit line id, else productId, else index. */
function lineKey(line: Record<string, unknown>, index: number): string {
  const id = line.id ?? line.lineId ?? line.productId ?? line.sku;
  return id != null && String(id).length > 0 ? String(id) : `line-${index}`;
}

/** Ordered-quantity map keyed the same way `deliveredQtyByLine` is expected to key. */
function orderedQtyByLine(lineItems: unknown): Map<string, Decimal> {
  const out = new Map<string, Decimal>();
  const lines = Array.isArray(lineItems) ? lineItems : [];
  lines.forEach((raw, index) => {
    const line = asRecord(raw);
    const qty = new Decimal(String(line.quantity ?? line.qty ?? 0) || 0);
    out.set(lineKey(line, index), qty);
  });
  return out;
}

function sanitizeDeliveredMap(value: unknown): Record<string, number> {
  const src = asRecord(value);
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(src)) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) out[k] = n;
  }
  return out;
}

/**
 * Derives delivery/billing progress for an order from its fulfillments and the
 * invoices linked to it. All quantity/money math uses decimal.js.
 */
export function computeProgress(
  order: OrderRow,
  fulfillments: FulfillmentRow[],
  invoicedTotal: Decimal
): {
  percentDelivered: number;
  percentBilled: number;
  totalOrderedQty: number;
  totalDeliveredQty: number;
} {
  const ordered = orderedQtyByLine(order.lineItems);
  let totalOrdered = new Decimal(0);
  for (const qty of ordered.values()) totalOrdered = totalOrdered.plus(qty);

  // Aggregate delivered qty per line across all non-cancelled fulfillments,
  // capping each line at its ordered quantity so over-delivery never pushes the
  // percentage above 100.
  const deliveredPerLine = new Map<string, Decimal>();
  for (const f of fulfillments) {
    if (f.status === 'CANCELLED') continue;
    const map = sanitizeDeliveredMap(f.deliveredQtyByLine);
    for (const [key, qty] of Object.entries(map)) {
      deliveredPerLine.set(key, (deliveredPerLine.get(key) ?? new Decimal(0)).plus(qty));
    }
  }

  let totalDelivered = new Decimal(0);
  for (const [key, delivered] of deliveredPerLine.entries()) {
    const cap = ordered.get(key);
    // Lines that aren't in the order are ignored for the ordered-based %; count
    // them uncapped only when the order carries no line detail at all.
    const counted = cap ? Decimal.min(delivered, cap) : ordered.size === 0 ? delivered : new Decimal(0);
    totalDelivered = totalDelivered.plus(counted);
  }

  const percentDelivered = totalOrdered.gt(0)
    ? Decimal.min(totalDelivered.div(totalOrdered).times(100), 100).toDecimalPlaces(2).toNumber()
    : 0;

  const orderTotal = new Decimal(order.total.toString());
  const percentBilled = orderTotal.gt(0)
    ? Decimal.min(invoicedTotal.div(orderTotal).times(100), 100).toDecimalPlaces(2).toNumber()
    : 0;

  return {
    percentDelivered,
    percentBilled,
    totalOrderedQty: totalOrdered.toDecimalPlaces(6).toNumber(),
    totalDeliveredQty: totalDelivered.toDecimalPlaces(6).toNumber(),
  };
}

export function createFulfillmentService(prisma: FinancePrisma, producer: NexusProducer) {
  async function emit(ctx: EngineContext, type: string, aggregateId: string, payload: Record<string, unknown>) {
    const tenantId = actor(ctx).tenantId;
    const eventPayload = {
      type,
      tenantId,
      occurredAt: ctx.now.toISOString(),
      actorId: actor(ctx).userId,
      ...payload,
    };
    await prisma.outboxMessage.create({
      data: {
        topic: TOPICS.QUOTES,
        key: aggregateId,
        payload: eventPayload as Prisma.InputJsonValue,
        tenantId,
        aggregateType: 'order',
        aggregateId,
        eventType: type,
        correlationId: ctx.audit.correlationId ?? ctx.audit.requestId ?? type,
        headers: { eventType: type, source: 'finance-service', tenantId, aggregateType: 'order' } as Prisma.InputJsonValue,
        status: 'PENDING',
        retryCount: 0,
      },
    });
    await producer.publish(TOPICS.QUOTES, { type, tenantId, payload: eventPayload }).catch(() => undefined);
  }

  async function invoicedTotalFor(tenantId: string, orderId: string): Promise<Decimal> {
    const invoices = await prisma.invoice.findMany({
      where: { tenantId, orderId, status: { not: 'VOID' } },
      select: { total: true },
    });
    return invoices.reduce((acc, inv) => acc.plus(new Decimal(inv.total.toString())), new Decimal(0));
  }

  async function loadOrder(tenantId: string, orderId: string): Promise<OrderRow> {
    const order = await prisma.salesOrder.findFirst({ where: { id: orderId, tenantId } });
    if (!order) throw new NotFoundError('SalesOrder', orderId);
    return order as unknown as OrderRow;
  }

  /**
   * Recomputes an order's fulfillment progress and advances its status:
   *   any delivery      → FULFILLING
   *   fully delivered   → FULFILLED (stamps fulfilledAt)
   * Only orders that are already CONFIRMED/FULFILLING are advanced; DRAFT/
   * terminal orders are left untouched.
   */
  async function reconcileOrderStatus(ctx: EngineContext, order: OrderRow) {
    const tenantId = actor(ctx).tenantId;
    const [fulfillments, invoiced] = await Promise.all([
      prisma.orderFulfillment.findMany({ where: { tenantId, orderId: order.id } }),
      invoicedTotalFor(tenantId, order.id),
    ]);
    const progress = computeProgress(order, fulfillments as unknown as FulfillmentRow[], invoiced);

    let nextStatus = order.status;
    if (order.status === 'CONFIRMED' || order.status === 'FULFILLING') {
      if (progress.percentDelivered >= 100) nextStatus = 'FULFILLED';
      else if (progress.percentDelivered > 0) nextStatus = 'FULFILLING';
    }

    if (nextStatus !== order.status) {
      await prisma.salesOrder.update({
        where: { id: order.id },
        data: {
          status: nextStatus as never,
          fulfilledAt: nextStatus === 'FULFILLED' ? ctx.now : undefined,
        },
      });
      await emit(ctx, 'order.fulfillment.progressed', order.id, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        accountId: order.accountId,
        previousStatus: order.status,
        status: nextStatus,
        percentDelivered: progress.percentDelivered,
        percentBilled: progress.percentBilled,
      });
    }
    return progress;
  }

  return {
    async listFulfillments(ctx: EngineContext, orderId: string) {
      const tenantId = actor(ctx).tenantId;
      const order = await loadOrder(tenantId, orderId);
      const [fulfillments, invoiced] = await Promise.all([
        prisma.orderFulfillment.findMany({
          where: { tenantId, orderId },
          orderBy: { createdAt: 'desc' },
        }),
        invoicedTotalFor(tenantId, orderId),
      ]);
      const progress = computeProgress(order, fulfillments as unknown as FulfillmentRow[], invoiced);
      return {
        orderId,
        orderStatus: order.status,
        ...progress,
        fulfillments,
      };
    },

    async createFulfillment(ctx: EngineContext, orderId: string, input: CreateFulfillmentInput) {
      const tenantId = actor(ctx).tenantId;
      const order = await loadOrder(tenantId, orderId);
      if (order.status === 'CANCELLED' || order.status === 'CLOSED') {
        throw new BusinessRuleError(`Cannot record a fulfillment against a ${order.status} order`);
      }
      if (order.status === 'DRAFT' || order.status === 'PENDING_APPROVAL') {
        throw new BusinessRuleError('Order must be CONFIRMED before it can be fulfilled');
      }
      const delivered = sanitizeDeliveredMap(input.deliveredQtyByLine);
      if (Object.keys(delivered).length === 0 && input.status !== 'CANCELLED') {
        throw new ValidationError('Invalid fulfillment', {
          fieldErrors: { deliveredQtyByLine: ['At least one delivered line quantity is required'] },
          formErrors: [],
        });
      }

      const fulfillment = await prisma.orderFulfillment.create({
        data: {
          tenantId,
          orderId,
          status: (input.status ?? 'PARTIAL') as never,
          deliveredQtyByLine: delivered as Prisma.InputJsonValue,
          reference: input.reference ?? null,
          carrier: input.carrier ?? null,
          trackingNumber: input.trackingNumber ?? null,
          notes: input.notes ?? null,
          deliveredAt: input.deliveredAt ? new Date(input.deliveredAt) : ctx.now,
          createdById: actor(ctx).userId,
        },
      });

      const progress = await reconcileOrderStatus(ctx, order);
      await emit(ctx, 'order.fulfillment.created', orderId, {
        orderId,
        orderNumber: order.orderNumber,
        accountId: order.accountId,
        fulfillmentId: fulfillment.id,
        status: fulfillment.status,
        percentDelivered: progress.percentDelivered,
        percentBilled: progress.percentBilled,
      });
      return { fulfillment, ...progress };
    },

    async updateFulfillment(ctx: EngineContext, fulfillmentId: string, input: UpdateFulfillmentInput) {
      const tenantId = actor(ctx).tenantId;
      const existing = await prisma.orderFulfillment.findFirst({ where: { id: fulfillmentId, tenantId } });
      if (!existing) throw new NotFoundError('OrderFulfillment', fulfillmentId);

      const update: Prisma.OrderFulfillmentUpdateInput = {};
      if (input.deliveredQtyByLine !== undefined) {
        update.deliveredQtyByLine = sanitizeDeliveredMap(input.deliveredQtyByLine) as Prisma.InputJsonValue;
      }
      if (input.status !== undefined) update.status = input.status as never;
      if (input.deliveredAt !== undefined) {
        update.deliveredAt = input.deliveredAt ? new Date(input.deliveredAt) : null;
      }
      if (input.reference !== undefined) update.reference = input.reference;
      if (input.carrier !== undefined) update.carrier = input.carrier;
      if (input.trackingNumber !== undefined) update.trackingNumber = input.trackingNumber;
      if (input.notes !== undefined) update.notes = input.notes;

      const fulfillment = await prisma.orderFulfillment.update({ where: { id: existing.id }, data: update });
      const order = await loadOrder(tenantId, existing.orderId);
      const progress = await reconcileOrderStatus(ctx, order);
      await emit(ctx, 'order.fulfillment.updated', order.id, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        accountId: order.accountId,
        fulfillmentId: fulfillment.id,
        status: fulfillment.status,
        percentDelivered: progress.percentDelivered,
        percentBilled: progress.percentBilled,
      });
      return { fulfillment, ...progress };
    },
  };
}

export type FulfillmentService = ReturnType<typeof createFulfillmentService>;
