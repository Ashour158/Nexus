import { Decimal } from 'decimal.js';
import type { BillingPrisma } from '../prisma.js';

/** Coerce any Prisma.Decimal | number | string | null into a decimal.js Decimal. */
export function toDecimal(value: unknown): Decimal {
  if (value == null) return new Decimal(0);
  if (value instanceof Decimal) return value;
  try {
    return new Decimal((value as { toString(): string }).toString());
  } catch {
    return new Decimal(0);
  }
}

/** Round a Decimal to 2dp for currency amounts, returned as a Decimal. */
export function money(value: Decimal | number | string): Decimal {
  return toDecimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export interface InvoiceBalance {
  amount: string;
  paid: string;
  credited: string;
  outstanding: string;
}

/**
 * Computes an invoice's balance, Decimal-safe:
 *   outstanding = amount − COMPLETED payments − ISSUED credit notes  (floored at 0)
 *
 * A credit note reduces the outstanding balance without ever mutating the
 * invoice's `amount` (COM-06).
 */
export function computeInvoiceBalance(invoice: {
  amount: unknown;
  payments?: { amount: unknown; status: string }[];
  creditNotes?: { amount: unknown; status: string }[];
}): InvoiceBalance {
  const amount = money(toDecimal(invoice.amount));
  const paid = (invoice.payments ?? [])
    .filter((p) => p.status === 'COMPLETED')
    .reduce((sum, p) => sum.plus(toDecimal(p.amount)), new Decimal(0));
  const credited = (invoice.creditNotes ?? [])
    .filter((c) => c.status === 'ISSUED')
    .reduce((sum, c) => sum.plus(toDecimal(c.amount)), new Decimal(0));
  const outstanding = Decimal.max(amount.minus(paid).minus(credited), new Decimal(0));
  return {
    amount: amount.toFixed(2),
    paid: money(paid).toFixed(2),
    credited: money(credited).toFixed(2),
    outstanding: money(outstanding).toFixed(2),
  };
}

export interface MeteredLine {
  metric: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  recordIds: string[];
}

/**
 * Aggregates a subscription's UNBILLED usage records (billedInvoiceId = null)
 * within a period into per-metric metered line items. `amount = Σ(quantity ×
 * unitPrice)` per record, so mixed per-unit prices within a metric are honoured.
 * Runs outside a request context, so tenantId is filtered explicitly.
 */
export async function aggregateUnbilledUsage(
  prisma: BillingPrisma,
  args: { tenantId: string; subscriptionId: string; from: Date; to: Date }
): Promise<{ lines: MeteredLine[]; total: Decimal; recordIds: string[] }> {
  const records = await prisma.usageRecord.findMany({
    where: {
      tenantId: args.tenantId,
      subscriptionId: args.subscriptionId,
      billedInvoiceId: null,
      ts: { gte: args.from, lte: args.to },
    },
  });

  const byMetric = new Map<
    string,
    { qty: Decimal; amount: Decimal; unit: Decimal; ids: string[] }
  >();
  const allIds: string[] = [];
  let total = new Decimal(0);

  for (const rec of records) {
    const qty = toDecimal(rec.quantity);
    const unit = toDecimal(rec.unitPrice ?? 0);
    const lineAmount = qty.times(unit);
    total = total.plus(lineAmount);
    allIds.push(rec.id);
    const cur = byMetric.get(rec.metric) ?? {
      qty: new Decimal(0),
      amount: new Decimal(0),
      unit,
      ids: [],
    };
    cur.qty = cur.qty.plus(qty);
    cur.amount = cur.amount.plus(lineAmount);
    cur.ids.push(rec.id);
    byMetric.set(rec.metric, cur);
  }

  const lines: MeteredLine[] = [...byMetric.entries()].map(([metric, v]) => ({
    metric,
    quantity: v.qty.toString(),
    unitPrice: v.unit.toFixed(6),
    amount: money(v.amount).toFixed(2),
    recordIds: v.ids,
  }));

  return { lines, total: money(total), recordIds: allIds };
}
