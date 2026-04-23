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
import { toPaginatedResult } from '../lib/pagination.js';

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

async function generateInvoiceNumber(
  prisma: FinancePrisma,
  tenantId: string
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  const lastInvoice = await prisma.invoice.findFirst({
    where: { tenantId, invoiceNumber: { startsWith: prefix } },
    orderBy: { createdAt: 'desc' },
  });
  const seq = lastInvoice
    ? Number(lastInvoice.invoiceNumber.slice(prefix.length)) + 1
    : 1;
  return `${prefix}${String(seq).padStart(6, '0')}`;
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
      const invoiceNumber = await generateInvoiceNumber(prisma, tenantId);

      const created = await prisma.invoice.create({
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

      await producer
        .publish(TOPICS.INVOICES, {
          type: 'invoice.created',
          tenantId,
          payload: {
            invoiceId: created.id,
            accountId: created.accountId,
            total: Number(created.total.toFixed(2)),
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
        const totalPaid = allPayments.reduce(
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
