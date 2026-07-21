import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../../../../node_modules/.prisma/finance-client/index.js';
import { createInvoicesService } from '../invoices.service.js';

const TENANT = 'tenant-a';
const NOW = new Date('2026-07-20T12:00:00.000Z');

function invoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'invoice-1',
    tenantId: TENANT,
    accountId: 'account-1',
    subscriptionId: null,
    contractId: null,
    orderId: null,
    quoteId: null,
    invoiceNumber: 'INV-2026-000001',
    status: 'SENT',
    currency: 'USD',
    subtotal: new Prisma.Decimal(100),
    discountAmount: new Prisma.Decimal(0),
    taxAmount: new Prisma.Decimal(0),
    total: new Prisma.Decimal(100),
    paidAmount: new Prisma.Decimal(0),
    dueDate: null,
    paidAt: null,
    lineItems: [],
    notes: null,
    customFields: {},
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function order() {
  return {
    id: 'order-1',
    tenantId: TENANT,
    accountId: 'account-1',
    quoteId: 'quote-1',
    orderNumber: 'ORD-2026-00001',
    currency: 'USD',
    subtotal: new Prisma.Decimal(90),
    discountAmount: new Prisma.Decimal(0),
    taxAmount: new Prisma.Decimal(10),
    total: new Prisma.Decimal(100),
    lineItems: [{ description: 'Annual plan', quantity: 1, unitPrice: 90 }],
  };
}

function producer() {
  return { publish: vi.fn(async () => undefined) };
}

describe('money ledger regression protection', () => {
  it('publishes invoice.paid exactly once for one mark-paid action', async () => {
    // Catches the finance outage where one domain action emitted duplicate money events.
    const kafka = producer();
    const updated = invoice({
      status: 'PAID',
      paidAmount: new Prisma.Decimal(100),
      paidAt: NOW,
    });
    const prisma = {
      invoice: {
        findFirst: vi.fn(async () => invoice()),
        update: vi.fn(async () => updated),
      },
    };
    const service = createInvoicesService(prisma as never, kafka as never);

    await service.markPaid(TENANT, 'invoice-1');

    expect(prisma.invoice.update).toHaveBeenCalledTimes(1);
    expect(kafka.publish).toHaveBeenCalledTimes(1);
    expect(kafka.publish).toHaveBeenCalledWith(
      'nexus.finance.payments',
      expect.objectContaining({
        type: 'invoice.paid',
        tenantId: TENANT,
        payload: expect.objectContaining({
          invoiceId: 'invoice-1',
          amount: 100,
        }),
      })
    );
  });

  it('keeps decimal line totals, three-way discounts, tax, and invoice total balanced', async () => {
    // Catches native-float drift such as 0.1 + 0.2 and repeating percentage splits.
    const kafka = producer();
    const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) =>
      invoice({ id: 'invoice-rounding', ...data })
    );
    const tx = {
      $queryRaw: vi.fn(async () => [{ nextSequence: 2 }]),
      invoice: { create },
    };
    const prisma = {
      $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const service = createInvoicesService(prisma as never, kafka as never);

    await service.createInvoice(TENANT, {
      accountId: 'account-1',
      currency: 'USD',
      lineItems: [
        { description: 'A', quantity: 1, unitPrice: 0.1, discountPercent: 33.3333, taxPercent: 15 },
        { description: 'B', quantity: 1, unitPrice: 0.2, discountPercent: 33.3333, taxPercent: 15 },
        { description: 'C', quantity: 1, unitPrice: 0.3, discountPercent: 33.3333, taxPercent: 15 },
      ],
      customFields: {},
    } as never);

    const data = create.mock.calls[0][0].data as {
      subtotal: Prisma.Decimal;
      discountAmount: Prisma.Decimal;
      taxAmount: Prisma.Decimal;
      total: Prisma.Decimal;
    };
    expect(data.subtotal.toFixed(2)).toBe('0.60');
    expect(data.discountAmount.toFixed(2)).toBe('0.20');
    expect(data.taxAmount.toFixed(2)).toBe('0.06');
    expect(data.total.toFixed(2)).toBe('0.46');
    expect(
      data.subtotal.minus(data.discountAmount).plus(data.taxAmount).equals(data.total)
    ).toBe(true);
  });

  it('returns the existing order invoice on a sequential retry without another row or event', async () => {
    // Catches request retries creating a second invoice and a second invoice.created event.
    const kafka = producer();
    let existing: ReturnType<typeof invoice> | null = null;
    const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      existing = invoice({ id: 'invoice-from-order', ...data });
      return existing;
    });
    const tx = {
      $queryRaw: vi.fn(async () => [{ nextSequence: 2 }]),
      invoice: { create },
    };
    const prisma = {
      salesOrder: { findFirst: vi.fn(async () => order()) },
      invoice: { findFirst: vi.fn(async () => existing) },
      $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const service = createInvoicesService(prisma as never, kafka as never);

    const first = await service.createInvoiceFromOrder(TENANT, 'order-1');
    const retry = await service.createInvoiceFromOrder(TENANT, 'order-1');

    expect(retry).toBe(first);
    expect(create).toHaveBeenCalledTimes(1);
    expect(kafka.publish).toHaveBeenCalledTimes(1);
  });

  it('does not double-charge when the same payment reference is retried', async () => {
    // Catches transport retries recording the same external payment twice.
    const kafka = producer();
    const payments: Array<Record<string, unknown>> = [];
    const createPayment = vi.fn(async ({ data }: {
      data: Record<string, unknown>;
    }) => {
      const row = { id: `payment-${payments.length + 1}`, ...data };
      payments.push(row);
      return row;
    });
    const updateInvoice = vi.fn(async ({ data }: {
      data: Record<string, unknown>;
    }) => invoice({ ...data }));
    const tx = {
      payment: {
        create: createPayment,
        findMany: vi.fn(async () => payments),
      },
      invoice: { update: updateInvoice },
    };
    const prisma = {
      invoice: { findFirst: vi.fn(async () => invoice()) },
      $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const service = createInvoicesService(prisma as never, kafka as never);
    const command = {
      amount: 50,
      currency: 'USD',
      method: 'BANK_TRANSFER',
      reference: 'bank-transfer-123',
    } as never;

    await service.recordPayment(TENANT, 'invoice-1', command);
    await service.recordPayment(TENANT, 'invoice-1', command);

    expect(createPayment).toHaveBeenCalledTimes(1);
    expect(payments).toHaveLength(1);
    expect(updateInvoice).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'PARTIAL',
        paidAmount: expect.objectContaining({ toFixed: expect.any(Function) }),
      }),
    }));
    expect(kafka.publish).not.toHaveBeenCalled();
  });

  it('does not create two invoices when the same order is invoiced concurrently', async () => {
    // Catches both callers passing the pre-transaction existence check and committing duplicates.
    const kafka = producer();
    let nextSequence = 2;
    let createdCount = 0;
    const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) =>
      invoice({ id: `invoice-${++createdCount}`, ...data })
    );
    const tx = {
      $queryRaw: vi.fn(async () => [{ nextSequence: nextSequence++ }]),
      invoice: { create },
    };
    const prisma = {
      salesOrder: { findFirst: vi.fn(async () => order()) },
      invoice: { findFirst: vi.fn(async () => null) },
      $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const service = createInvoicesService(prisma as never, kafka as never);

    const [first, second] = await Promise.all([
      service.createInvoiceFromOrder(TENANT, 'order-1'),
      service.createInvoiceFromOrder(TENANT, 'order-1'),
    ]);

    expect(create).toHaveBeenCalledTimes(1);
    expect(second.id).toBe(first.id);
    expect(kafka.publish).toHaveBeenCalledTimes(1);
  });
});
