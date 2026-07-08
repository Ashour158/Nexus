import { Decimal } from 'decimal.js';
import type { PaginatedResult } from '@nexus/shared-types';
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from '@nexus/service-utils';
import type {
  CreateInvoiceInput,
  InvoiceLineItemInput,
  InvoiceListQuery,
  RecordPaymentInput,
  UpdateInvoiceInput,
} from '@nexus/validation';
import { NexusProducer, TOPICS } from '@nexus/kafka';
import { Prisma } from '../../../../node_modules/.prisma/finance-client/index.js';
import type {
  Invoice,
  Payment,
} from '../../../../node_modules/.prisma/finance-client/index.js';
import type { FinancePrisma } from '../prisma.js';
import { toPaginatedResult } from '@nexus/shared-types';
import { allocateDocumentNumber, type SqlRunner } from '../lib/document-sequence.js';

type InvoiceListFilters = Omit<
  InvoiceListQuery,
  'page' | 'limit' | 'sortBy' | 'sortDir' | 'cursor'
>;

interface ListPagination {
  page: number;
  limit: number;
  sortBy?: string;
  sortDir: 'asc' | 'desc';
}

interface InvoiceTotals {
  subtotal: Decimal;
  discountAmount: Decimal;
  taxAmount: Decimal;
  total: Decimal;
}

function computeTotals(items: InvoiceLineItemInput[]): InvoiceTotals {
  let subtotal = new Decimal(0);
  let discountTotal = new Decimal(0);
  let taxTotal = new Decimal(0);

  for (const item of items) {
    const lineSubtotal = new Decimal(item.quantity).times(item.unitPrice);
    const lineDiscount = lineSubtotal.times(item.discountPercent).dividedBy(100);
    const afterDiscount = lineSubtotal.minus(lineDiscount);
    const lineTax = afterDiscount.times(item.taxPercent).dividedBy(100);

    subtotal = subtotal.plus(lineSubtotal);
    discountTotal = discountTotal.plus(lineDiscount);
    taxTotal = taxTotal.plus(lineTax);
  }

  const total = subtotal.minus(discountTotal).plus(taxTotal);
  return {
    subtotal,
    discountAmount: discountTotal,
    taxAmount: taxTotal,
    total,
  };
}

function toPrismaDecimal(d: Decimal): Prisma.Decimal {
  return new Prisma.Decimal(d.toFixed(2));
}

// BL-04: allocate invoice numbers via the atomic DocumentSequence counter
// (race-free, gapless) instead of the old `findFirst desc + slice + 1`, which
// let concurrent creates read the same last number and collide on the unique
// constraint. Accepts any SqlRunner so the caller can allocate inside the same
// transaction as the invoice insert.
async function generateInvoiceNumber(
  client: SqlRunner,
  tenantId: string
): Promise<string> {
  const year = new Date().getFullYear();
  const seq = await allocateDocumentNumber(client, tenantId, 'invoice', String(year));
  return `INV-${year}-${String(seq).padStart(6, '0')}`;
}

function buildWhere(
  tenantId: string,
  filters: InvoiceListFilters
): Prisma.InvoiceWhereInput {
  const where: Prisma.InvoiceWhereInput = { tenantId };
  if (filters.accountId) where.accountId = filters.accountId;
  if (filters.status) where.status = filters.status;
  if (filters.fromDate || filters.toDate) {
    where.createdAt = {
      ...(filters.fromDate ? { gte: new Date(filters.fromDate) } : {}),
      ...(filters.toDate ? { lte: new Date(filters.toDate) } : {}),
    };
  }
  if (filters.search?.trim()) {
    where.invoiceNumber = { contains: filters.search.trim(), mode: 'insensitive' };
  }
  return where;
}

export function createInvoicesService(
  prisma: FinancePrisma,
  producer: NexusProducer
) {
  async function loadOrThrow(tenantId: string, id: string): Promise<Invoice> {
    const row = await prisma.invoice.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundError('Invoice', id);
    return row;
  }

  return {
    async listInvoices(
      tenantId: string,
      filters: InvoiceListFilters,
      pagination: ListPagination
    ): Promise<PaginatedResult<Invoice>> {
      const where = buildWhere(tenantId, filters);
      const [total, rows] = await Promise.all([
        prisma.invoice.count({ where }),
        prisma.invoice.findMany({
          where,
          skip: (pagination.page - 1) * pagination.limit,
          take: pagination.limit,
          orderBy: { createdAt: pagination.sortDir },
        }),
      ]);
      return toPaginatedResult(rows, total, pagination.page, pagination.limit);
    },

    async getInvoiceById(tenantId: string, id: string) {
      return prisma.invoice.findFirst({
        where: { id, tenantId },
        include: { payments: true },
      });
    },

    async createInvoice(
      tenantId: string,
      data: CreateInvoiceInput
    ): Promise<Invoice> {
      if (data.lineItems.length === 0) {
        throw new BusinessRuleError('Invoice must have at least one line item');
      }
      const totals = computeTotals(data.lineItems);

      // BL-04: allocate the invoice number and insert atomically so concurrent
      // creates never collide and a failed insert never burns a number.
      const created = await prisma.$transaction(async (tx) => {
        const invoiceNumber = await generateInvoiceNumber(tx, tenantId);
        return tx.invoice.create({
          data: {
            tenantId,
            accountId: data.accountId,
            subscriptionId: data.subscriptionId ?? null,
            contractId: data.contractId ?? null,
            invoiceNumber,
            status: 'DRAFT',
            currency: data.currency,
            subtotal: toPrismaDecimal(totals.subtotal),
            discountAmount: toPrismaDecimal(totals.discountAmount),
            taxAmount: toPrismaDecimal(totals.taxAmount),
            total: toPrismaDecimal(totals.total),
            dueDate: data.dueDate ? new Date(data.dueDate) : null,
            lineItems: data.lineItems as unknown as Prisma.InputJsonValue,
            notes: data.notes ?? null,
            customFields: data.customFields as Prisma.InputJsonValue,
          },
        });
      });

      await producer
        .publish(TOPICS.INVOICES, {
          type: 'invoice.created',
          tenantId,
          payload: {
            invoiceId: created.id,
            accountId: created.accountId,
            orderId: created.orderId ?? null,
            total: Number(created.total.toFixed(2)),
            dueDate: (created.dueDate ?? created.createdAt).toISOString(),
          },
        })
        .catch(() => undefined);

      return created;
    },

    /**
     * BL-02: create an invoice FROM a confirmed SalesOrder. The money is derived
     * server-side from the order (subtotal / tax / discount / total / currency /
     * line items are copied verbatim) — the client cannot supply totals here — and
     * `invoice.orderId` (plus the upstream `quoteId`, if any) is set so the
     * won-deal → order → invoice chain is linked end-to-end. Idempotent per order:
     * if a non-void invoice already exists for the order it is returned unchanged.
     */
    async createInvoiceFromOrder(
      tenantId: string,
      orderId: string,
      opts: { dueDate?: string; notes?: string } = {}
    ): Promise<Invoice> {
      const order = await prisma.salesOrder.findFirst({
        where: { id: orderId, tenantId },
      });
      if (!order) throw new NotFoundError('SalesOrder', orderId);

      // Idempotency: don't re-invoice an order that already has a live invoice.
      const existing = await prisma.invoice.findFirst({
        where: { tenantId, orderId, status: { not: 'VOID' } },
      });
      if (existing) return existing;

      const created = await prisma.$transaction(async (tx) => {
        const invoiceNumber = await generateInvoiceNumber(tx, tenantId);
        return tx.invoice.create({
          data: {
            tenantId,
            accountId: order.accountId,
            orderId: order.id,
            quoteId: order.quoteId ?? null,
            invoiceNumber,
            status: 'DRAFT',
            // Server-derived money — copied from the order, never from the client.
            currency: order.currency,
            subtotal: order.subtotal,
            discountAmount: order.discountAmount,
            taxAmount: order.taxAmount,
            total: order.total,
            dueDate: opts.dueDate ? new Date(opts.dueDate) : null,
            lineItems: order.lineItems as Prisma.InputJsonValue,
            notes: opts.notes ?? null,
            customFields: {
              sourceOrderId: order.id,
              sourceOrderNumber: order.orderNumber,
              sourceQuoteId: order.quoteId ?? null,
            } as Prisma.InputJsonValue,
          },
        });
      });

      await producer
        .publish(TOPICS.INVOICES, {
          type: 'invoice.created',
          tenantId,
          payload: {
            invoiceId: created.id,
            accountId: created.accountId,
            orderId: created.orderId ?? null,
            quoteId: created.quoteId ?? null,
            total: Number(created.total.toFixed(2)),
            currency: created.currency,
            dueDate: (created.dueDate ?? created.createdAt).toISOString(),
          },
        })
        .catch(() => undefined);

      return created;
    },

    async updateInvoice(
      tenantId: string,
      id: string,
      data: UpdateInvoiceInput
    ): Promise<Invoice> {
      const existing = await loadOrThrow(tenantId, id);
      if (existing.status === 'PAID' && data.lineItems) {
        throw new BusinessRuleError('Cannot modify line items on a paid invoice');
      }

      const update: Prisma.InvoiceUpdateInput = {};
      if (data.status !== undefined) update.status = data.status;
      if (data.dueDate !== undefined) {
        update.dueDate = data.dueDate ? new Date(data.dueDate) : null;
      }
      if (data.notes !== undefined) update.notes = data.notes;
      if (data.customFields !== undefined) {
        update.customFields = data.customFields as Prisma.InputJsonValue;
      }
      if (data.lineItems !== undefined) {
        const totals = computeTotals(data.lineItems);
        update.lineItems = data.lineItems as unknown as Prisma.InputJsonValue;
        update.subtotal = toPrismaDecimal(totals.subtotal);
        update.discountAmount = toPrismaDecimal(totals.discountAmount);
        update.taxAmount = toPrismaDecimal(totals.taxAmount);
        update.total = toPrismaDecimal(totals.total);
      }
      return prisma.invoice.update({ where: { id }, data: update });
    },

    async sendInvoice(tenantId: string, id: string): Promise<Invoice> {
      const existing = await loadOrThrow(tenantId, id);
      if (existing.status !== 'DRAFT') {
        throw new BusinessRuleError('Only draft invoices can be sent');
      }
      const updated = await prisma.invoice.update({
        where: { id },
        data: { status: 'SENT' },
      });
      await producer
        .publish(TOPICS.INVOICES, {
          type: 'invoice.sent',
          tenantId,
          payload: {
            invoiceId: updated.id,
            accountId: updated.accountId,
            total: Number(updated.total.toFixed(2)),
            sentAt: updated.updatedAt.toISOString(),
          },
        })
        .catch(() => undefined);
      return updated;
    },

    async markPaid(tenantId: string, id: string): Promise<Invoice> {
      const existing = await loadOrThrow(tenantId, id);
      if (existing.status === 'VOID') {
        throw new BusinessRuleError('Cannot mark a voided invoice as paid');
      }
      if (existing.status === 'PAID') {
        throw new ConflictError('Invoice', 'already paid');
      }
      const updated = await prisma.invoice.update({
        where: { id },
        data: { status: 'PAID', paidAt: new Date(), paidAmount: existing.total },
      });
      await producer
        .publish(TOPICS.PAYMENTS, {
          type: 'invoice.paid',
          tenantId,
          payload: {
            invoiceId: updated.id,
            accountId: updated.accountId,
            amount: Number(updated.total.toFixed(2)),
            markedPaid: true,
          },
        })
        .catch(() => undefined);
      return updated;
    },

    async voidInvoice(tenantId: string, id: string): Promise<Invoice> {
      const existing = await loadOrThrow(tenantId, id);
      if (existing.status === 'PAID') {
        throw new BusinessRuleError('Cannot void a paid invoice');
      }
      return prisma.invoice.update({ where: { id }, data: { status: 'VOID' } });
    },

    async recordPayment(
      tenantId: string,
      invoiceId: string,
      data: RecordPaymentInput
    ): Promise<Payment> {
      const invoice = await loadOrThrow(tenantId, invoiceId);
      if (invoice.status === 'VOID') {
        throw new BusinessRuleError('Cannot record payment on a voided invoice');
      }
      if (invoice.status === 'PAID') {
        throw new ConflictError('Invoice', 'paid');
      }

      const { payment, updated } = await prisma.$transaction(async (tx) => {
        const p = await tx.payment.create({
          data: {
            tenantId,
            invoiceId,
            amount: new Prisma.Decimal(data.amount),
            currency: data.currency,
            method: data.method,
            status: 'COMPLETED',
            reference: data.reference ?? null,
            gateway: data.gateway ?? null,
            gatewayRef: data.gatewayRef ?? null,
            paidAt: data.paidAt ? new Date(data.paidAt) : new Date(),
            notes: data.notes ?? null,
          },
        });

        const allPayments = await tx.payment.findMany({
          where: { invoiceId, tenantId, status: 'COMPLETED' },
        });
        // COM-02: payments made in a currency other than the invoice's must NOT
        // be summed 1:1 against the invoice total — doing so mis-computes the
        // paid / partial / paid state. No FX rate is threaded into this path, so
        // only same-currency payments count toward the paid total; any
        // mismatched-currency payments are excluded and flagged for follow-up.
        const invoiceCurrency = invoice.currency;
        const mismatchedPayments = allPayments.filter(
          (pmt) => pmt.currency !== invoiceCurrency
        );
        if (mismatchedPayments.length > 0) {
          console.warn(
            '[invoices.service] Excluding foreign-currency payments from paid-total (no FX conversion available)',
            {
              invoiceId,
              invoiceCurrency,
              mismatched: mismatchedPayments.map((pmt) => ({
                id: pmt.id,
                currency: pmt.currency,
                amount: pmt.amount.toString(),
              })),
            }
          );
        }
        const totalPaid = allPayments
          .filter((pmt) => pmt.currency === invoiceCurrency)
          .reduce(
            (acc, cur) => acc.plus(new Decimal(cur.amount.toString())),
            new Decimal(0)
          );
        const invoiceTotal = new Decimal(invoice.total.toString());

        let newStatus: Prisma.InvoiceUpdateInput['status'];
        if (totalPaid.greaterThanOrEqualTo(invoiceTotal)) newStatus = 'PAID';
        else if (totalPaid.greaterThan(0)) newStatus = 'PARTIAL';
        else newStatus = invoice.status;

        const u = await tx.invoice.update({
          where: { id: invoiceId },
          data: {
            status: newStatus,
            paidAmount: new Prisma.Decimal(totalPaid.toFixed(2)),
            paidAt:
              newStatus === 'PAID'
                ? data.paidAt
                  ? new Date(data.paidAt)
                  : new Date()
                : invoice.paidAt,
          },
        });
        return { payment: p, updated: u };
      });

      if (updated.status === 'PAID') {
        await producer
          .publish(TOPICS.PAYMENTS, {
            type: 'invoice.paid',
            tenantId,
            payload: {
              invoiceId: updated.id,
              accountId: updated.accountId,
              amount: Number(updated.total.toFixed(2)),
            },
          })
          .catch(() => undefined);
      }

      return payment;
    },

    async listPayments(tenantId: string, invoiceId: string): Promise<Payment[]> {
      await loadOrThrow(tenantId, invoiceId);
      return prisma.payment.findMany({
        where: { invoiceId, tenantId },
        orderBy: { createdAt: 'desc' },
      });
    },
  };
}

export type InvoicesService = ReturnType<typeof createInvoicesService>;
