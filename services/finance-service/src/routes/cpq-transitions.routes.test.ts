import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { Prisma } from '../../../../node_modules/.prisma/finance-client/index.js';
import { registerCpqTransitionRoutes } from './cpq-transitions.routes.js';

function makeQuote(overrides: Record<string, unknown> = {}) {
  return {
    id: 'quote_1',
    tenantId: 'ten_test',
    quoteNumber: 'QUO-1',
    accountId: 'acct_1',
    contactId: 'contact_1',
    dealId: 'deal_1',
    ownerId: 'usr_test',
    status: 'ACCEPTED',
    approvalRequired: false,
    approvalStatus: null,
    expiresAt: new Date('2027-01-01T00:00:00.000Z'),
    currency: 'USD',
    subtotal: new Prisma.Decimal(100),
    taxAmount: new Prisma.Decimal(0),
    discountAmount: new Prisma.Decimal(0),
    total: new Prisma.Decimal(100),
    lineItems: [],
    version: 1,
    ...overrides,
  };
}

function createMockPrisma(overrides: Record<string, unknown> = {}) {
  const tx = {
    salesOrder: {
      create: vi.fn(async ({ data }) => ({ id: 'order_1', orderNumber: data.orderNumber, ...data })),
    },
    quote: {
      update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
    },
    quoteNumberConfig: {
      findUnique: vi.fn(async () => ({
        tenantId: 'ten_test',
        prefix: 'QUO',
        separator: '-',
        includeYear: true,
        padding: 5,
        nextSequence: 2,
        resetYearly: true,
        lastYear: new Date().getUTCFullYear(),
      })),
      create: vi.fn(),
      update: vi.fn(),
    },
    quoteLine: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async ({ data }) => ({ count: data.length })),
    },
    quoteRevision: {
      createMany: vi.fn(async () => ({ count: 1 })),
    },
  };
  return {
    rFQ: {
      count: vi.fn(async () => 0),
      findFirst: vi.fn(async () => ({
        id: 'rfq_1',
        rfqNumber: 'RFQ-1',
        tenantId: 'ten_test',
        accountId: 'acct_1',
        contactId: 'contact_1',
        dealId: 'deal_1',
        ownerId: 'usr_test',
        status: 'READY_FOR_QUOTE',
        currency: 'USD',
        lineItems: [{ productId: 'prod_1', quantity: 1, unitPrice: 100 }],
      })),
      update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
    },
    quote: {
      count: vi.fn(async () => 0),
      findFirst: vi.fn(async () => makeQuote()),
      update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
      create: vi.fn(async ({ data }) => ({ id: 'quote_created', quoteNumber: 'QUO-2', version: 1, status: 'DRAFT', total: new Prisma.Decimal(100), ...data })),
    },
    quoteRevision: {
      create: vi.fn(async ({ data }) => ({ id: 'rev_1', ...data })),
      findFirst: vi.fn(async () => ({ id: 'rev_1', quoteId: 'quote_1', version: 1, status: 'ACCEPTED' })),
    },
    quoteLine: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async ({ data }) => ({ count: data.length })),
    },
    quoteESignEnvelope: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }) => ({ id: 'env_1', ...data })),
    },
    quoteDocument: {
      findFirst: vi.fn(async () => ({ id: 'doc_1', quoteId: 'quote_1', status: 'RENDERED' })),
    },
    product: {
      findFirst: vi.fn(async () => ({ id: 'prod_1', name: 'Product', sku: 'SKU-1', listPrice: new Prisma.Decimal(100), currency: 'USD', billingType: 'ONE_TIME' })),
      findMany: vi.fn(async () => [{
        id: 'prod_1',
        tenantId: 'ten_test',
        name: 'Product',
        sku: 'SKU-1',
        listPrice: new Prisma.Decimal(100),
        currency: 'USD',
        billingType: 'ONE_TIME',
        taxable: true,
        pricingRules: [],
        priceTiers: [],
      }]),
    },
    currency: {
      findFirst: vi.fn(async () => ({ code: 'USD' })),
    },
    vendorProduct: {
      findMany: vi.fn(async () => []),
    },
    account: {
      findFirst: vi.fn(async () => ({
        id: 'acct_1',
        tenantId: 'ten_test',
        tier: 'SMB',
        annualRevenue: new Prisma.Decimal(0),
      })),
    },
    taxRate: {
      findFirst: vi.fn(async () => null),
    },
    taxZone: {
      findFirst: vi.fn(async () => null),
    },
    promoCode: {
      findFirst: vi.fn(async () => null),
    },
    priceTier: {
      findMany: vi.fn(async () => []),
    },
    quoteTemplate: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => null),
    },
    quoteApprovalTier: {
      findMany: vi.fn(async () => []),
    },
    salesOrder: {
      count: vi.fn(async () => 0),
      findMany: vi.fn(async () => []),
    },
    discountRequest: {
      create: vi.fn(),
      findFirst: vi.fn(async () => ({
        id: 'drq_1',
        tenantId: 'ten_test',
        quoteId: 'quote_1',
        status: 'DRAFT',
        approvalRequestId: null,
        requestedById: 'usr_test',
        reasonCode: 'COMPETITIVE_MATCH',
        reasonNotes: 'Competitive offer',
        winningProbabilityIfApproved: 80,
        customFields: { quoteRevisionId: 'rev_1' },
        requestedDiscountPercent: new Prisma.Decimal(12),
        requestedDiscountAmount: new Prisma.Decimal(12),
      })),
      findMany: vi.fn(async () => []),
      update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
    },
    outboxMessage: {
      create: vi.fn(async ({ data }) => ({ id: 'outbox_1', ...data })),
    },
    cpqTransitionLedger: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }) => ({ id: 'ledger_1', ...data })),
      update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
    },
    $transaction: vi.fn(async (fn) => fn(tx)),
    ...overrides,
  };
}

function makeProducer() {
  return {
    publish: vi.fn(async () => undefined),
  };
}

function createTestApp(prisma: ReturnType<typeof createMockPrisma>) {
  const app = Fastify();
  app.addHook('preHandler', async (request) => {
    (request as any).user = { tenantId: 'ten_test', sub: 'usr_test', email: 'test@example.com', roles: ['ADMIN'], permissions: ['*'] };
  });
  registerCpqTransitionRoutes(app, prisma as never, makeProducer() as never);
  return app;
}

describe('CPQ transition route', () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
  });

  it('rejects mutating transitions without an idempotency key', async () => {
    const app = createTestApp(prisma);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/cpq/transitions',
      payload: { entity: 'rfq', entityId: 'rfq_1', action: 'CONVERT_TO_QUOTE' },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload).error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects invalid entity and action combinations', async () => {
    const app = createTestApp(prisma);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/cpq/transitions',
      payload: { entity: 'rfq', entityId: 'rfq_1', action: 'CONVERT_TO_ORDER', idempotencyKey: 'idem_1' },
    });

    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.payload).error.code).toBe('BUSINESS_RULE');
  });

  it('converts reviewed RFQs through the transition contract', async () => {
    const app = createTestApp(prisma);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/cpq/transitions',
      headers: { 'x-correlation-id': 'corr_1' },
      payload: { entity: 'rfq', entityId: 'rfq_1', action: 'CONVERT_TO_QUOTE', idempotencyKey: 'idem_1' },
    });

    expect(res.statusCode, res.payload).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data).toEqual(expect.objectContaining({
      previousStatus: 'READY_FOR_QUOTE',
      nextStatus: 'CONVERTED',
      allowedNextActions: [],
      correlationId: 'corr_1',
      idempotencyKey: 'idem_1',
    }));
    expect(body.data.entitySnapshot).toEqual(expect.objectContaining({ rfqId: 'rfq_1', quoteId: 'quote_created' }));
  });

  it('submits RFQs for review through the transition contract', async () => {
    prisma = createMockPrisma({
      rFQ: {
        count: vi.fn(async () => 0),
        findFirst: vi.fn(async () => ({
          id: 'rfq_1',
          rfqNumber: 'RFQ-1',
          tenantId: 'ten_test',
          accountId: 'acct_1',
          contactId: 'contact_1',
          dealId: 'deal_1',
          ownerId: 'usr_test',
          status: 'DRAFT',
          currency: 'USD',
          lineItems: [{ productId: 'prod_1', quantity: 1, unitPrice: 100 }],
        })),
        update: vi.fn(async ({ where, data }) => ({
          id: where.id,
          rfqNumber: 'RFQ-1',
          tenantId: 'ten_test',
          accountId: 'acct_1',
          contactId: 'contact_1',
          dealId: 'deal_1',
          ownerId: 'usr_test',
          currency: 'USD',
          lineItems: [{ productId: 'prod_1', quantity: 1, unitPrice: 100 }],
          ...data,
        })),
      },
    });
    const app = createTestApp(prisma);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/cpq/transitions',
      headers: { 'x-correlation-id': 'corr_rfq_submit' },
      payload: { entity: 'rfq', entityId: 'rfq_1', action: 'SUBMIT_FOR_REVIEW', idempotencyKey: 'rfq_submit_1' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).data).toEqual(expect.objectContaining({
      previousStatus: 'DRAFT',
      nextStatus: 'SENT',
      correlationId: 'corr_rfq_submit',
      transitionLedgerId: 'ledger_1',
    }));
    expect(prisma.rFQ.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'SENT' }),
    }));
    expect(prisma.outboxMessage.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        aggregateType: 'rfq',
        aggregateId: 'rfq_1',
        eventType: 'rfq.submitted_for_review',
      }),
    }));
  });

  it('returns the stored transition result for duplicate idempotency keys', async () => {
    prisma = createMockPrisma({
      cpqTransitionLedger: {
        findFirst: vi.fn(async () => ({
          id: 'ledger_1',
          status: 'SUCCEEDED',
          result: { rfqId: 'rfq_1', quoteId: 'quote_existing', transitionLedgerId: 'ledger_1' },
          error: null,
        })),
        create: vi.fn(),
        update: vi.fn(),
      },
    });
    const app = createTestApp(prisma);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/cpq/transitions',
      headers: { 'x-correlation-id': 'corr_dup' },
      payload: { entity: 'rfq', entityId: 'rfq_1', action: 'CONVERT_TO_QUOTE', idempotencyKey: 'idem_1' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.transitionLedgerId).toBe('ledger_1');
    expect(body.data.entitySnapshot).toEqual({ rfqId: 'rfq_1', quoteId: 'quote_existing', transitionLedgerId: 'ledger_1' });
    expect(prisma.quote.create).not.toHaveBeenCalled();
    expect(prisma.cpqTransitionLedger.create).not.toHaveBeenCalled();
  });

  it('stores failed transition attempts in the ledger', async () => {
    prisma = createMockPrisma({
      quote: {
        count: vi.fn(async () => 0),
        findFirst: vi.fn(async () => makeQuote({ status: 'DRAFT' })),
        update: vi.fn(),
        create: vi.fn(),
      },
    });
    const app = createTestApp(prisma);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/cpq/transitions',
      payload: { entity: 'quote', entityId: 'quote_1', action: 'CONVERT_TO_ORDER', idempotencyKey: 'idem_failed' },
    });

    expect(res.statusCode).toBe(422);
    expect(prisma.cpqTransitionLedger.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'FAILED' }),
    }));
  });

  it('rejects stale quote to order transitions', async () => {
    prisma = createMockPrisma({
      quoteRevision: {
        findFirst: vi.fn(async () => ({ id: 'rev_2', quoteId: 'quote_1', version: 2, status: 'ACCEPTED' })),
      },
    });
    const app = createTestApp(prisma);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/cpq/transitions',
      headers: { 'x-correlation-id': 'corr_2' },
      payload: { entity: 'quote', entityId: 'quote_1', action: 'CONVERT_TO_ORDER', idempotencyKey: 'idem_2' },
    });

    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.payload).error.code).toBe('BUSINESS_RULE');
  });

  it('sends an approved quote through the transition contract', async () => {
    prisma = createMockPrisma({
      quote: {
        count: vi.fn(async () => 0),
        findFirst: vi.fn(async () => makeQuote({ status: 'APPROVED', approvalStatus: 'APPROVED' })),
        update: vi.fn(async ({ where, data }) => makeQuote({ id: where.id, status: 'SENT', ...data })),
        create: vi.fn(),
      },
      quoteRevision: {
        create: vi.fn(async ({ data }) => ({ id: 'rev_2', ...data })),
        findFirst: vi.fn(async () => ({ id: 'rev_1', quoteId: 'quote_1', version: 1, status: 'APPROVED' })),
      },
    });
    const app = createTestApp(prisma);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/cpq/transitions',
      headers: { 'x-correlation-id': 'corr_send' },
      payload: { entity: 'quote', entityId: 'quote_1', action: 'SEND_TO_CUSTOMER', idempotencyKey: 'send_1' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data).toEqual(expect.objectContaining({
      previousStatus: 'APPROVED',
      nextStatus: 'SENT',
      correlationId: 'corr_send',
    }));
  });

  it('submits a DRQ transition for approval through finance authority', async () => {
    const app = createTestApp(prisma);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/cpq/transitions',
      headers: { 'x-correlation-id': 'corr_drq' },
      payload: {
        entity: 'drq',
        entityId: 'drq_1',
        action: 'SUBMIT_FOR_APPROVAL',
        idempotencyKey: 'drq_submit_1',
        payload: {
          quoteRevisionId: 'rev_1',
          approvalRequestId: 'approval_drq_1',
        },
      },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).data).toEqual(expect.objectContaining({
      previousStatus: 'DRAFT',
      nextStatus: 'PENDING',
      correlationId: 'corr_drq',
      transitionLedgerId: 'ledger_1',
    }));
    expect(prisma.discountRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'PENDING', approvalRequestId: 'approval_drq_1' }),
    }));
    expect(prisma.outboxMessage.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        aggregateType: 'discount_request',
        aggregateId: 'drq_1',
        eventType: 'drq.requested',
      }),
    }));
  });
});
