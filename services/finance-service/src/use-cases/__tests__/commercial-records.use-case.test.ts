import { describe, expect, it, vi } from 'vitest';
import { createTestEngineContext } from '@nexus/domain-core';
import { BusinessRuleError, ValidationError } from '@nexus/service-utils';
import { Prisma } from '../../../../../node_modules/.prisma/finance-client/index.js';
import { createCommercialRecordsUseCase } from '../commercial-records.use-case.js';

const ctx = createTestEngineContext({
  audit: {
    actor: {
      userId: 'usr_1',
      tenantId: 'tenant_1',
      roles: ['admin'],
      permissions: ['*'],
    },
    source: 'api',
    requestId: 'req_1',
  },
});

function makePricingResult(overrides: Record<string, unknown> = {}) {
  return {
    items: [{
      productId: 'prod_1',
      productName: 'Product',
      sku: 'SKU-1',
      quantity: 1,
      listPrice: 100,
      unitPrice: 100,
      discountPercent: 0,
      discountAmount: 0,
      total: 100,
      taxPercent: 0,
      taxAmount: 0,
      billingType: 'ONE_TIME',
    }],
    subtotal: 100,
    discountTotal: 0,
    taxTotal: 0,
    total: 100,
    appliedRules: [],
    floorPriceWarnings: [],
    approvalRequired: false,
    approvalReasons: [],
    ...overrides,
  };
}

function makeQuote(overrides: Record<string, unknown> = {}) {
  return {
    id: 'quote_1',
    quoteNumber: 'QUO-2026-00001',
    accountId: 'acct_1',
    contactId: 'contact_1',
    dealId: 'deal_1',
    ownerId: 'usr_1',
    status: 'ACCEPTED',
    approvalRequired: false,
    approvalStatus: null,
    expiresAt: new Date('2026-02-01T00:00:00.000Z'),
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

function makeUseCase(overrides: Record<string, unknown> = {}) {
  const prisma = {
    rFQ: {
      count: vi.fn(async () => 0),
      findMany: vi.fn(),
      create: vi.fn(async ({ data }) => ({ id: 'rfq_1', ...data })),
      findFirst: vi.fn(async () => ({
        id: 'rfq_1',
        rfqNumber: 'RFQ-000001',
        tenantId: 'tenant_1',
        accountId: 'acct_1',
        contactId: 'contact_1',
        dealId: 'deal_1',
        ownerId: 'usr_1',
        status: 'REVIEWING',
        currency: 'USD',
        lineItems: [{ productId: 'prod_1', quantity: 2, unitPrice: 100 }],
      })),
      update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
    },
    quote: {
      findFirst: vi.fn(async () => makeQuote()),
      findMany: vi.fn(async () => []),
      update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    quoteRevision: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => ({ id: 'rev_1', quoteId: 'quote_1', version: 1, status: 'ACCEPTED' })),
      create: vi.fn(async ({ data }) => ({ id: 'rev_created', ...data })),
    },
    quoteDocument: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => ({
        id: 'doc_1',
        contentBase64: Buffer.from('document').toString('base64'),
        contentType: 'text/html',
        fileName: 'quote.html',
        format: 'HTML',
        status: 'RENDERED',
        storageKey: null,
        renderedHtml: '<html></html>',
      })),
      create: vi.fn(async ({ data }) => ({ id: 'doc_1', ...data })),
    },
    quoteESignEnvelope: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      create: vi.fn(async ({ data }) => ({ id: 'env_1', ...data })),
      update: vi.fn(async ({ where, data }) => ({ id: where.id, quoteId: 'quote_1', ...data })),
    },
    discountRequest: {
      findFirst: vi.fn(async () => ({
        id: 'drq_1',
        tenantId: 'tenant_1',
        quoteId: 'quote_1',
        status: 'PENDING',
        requestedById: 'usr_1',
        approvalRequestId: 'approval_drq_1',
        requestedDiscountPercent: new Prisma.Decimal(15),
        requestedDiscountAmount: new Prisma.Decimal(15),
        reasonCode: 'COMPETITIVE_MATCH',
        reasonNotes: 'Competitive offer',
        winningProbabilityIfApproved: 80,
        customFields: { quoteRevisionId: 'rev_1' },
      })),
      update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
    },
    salesOrder: {
      count: vi.fn(async () => 0),
      create: vi.fn(async ({ data }) => ({ id: 'order_1', ...data })),
      findMany: vi.fn(async () => []),
    },
    quoteTemplate: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => ({ id: 'tpl_old', name: 'Old', contentType: 'text/html', body: '{{quoteNumber}}', tenantId: 'tenant_1' })),
      updateMany: vi.fn(async () => ({ count: 1 })),
      create: vi.fn(async ({ data }) => ({ id: 'tpl_1', ...data })),
      update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
    },
    outboxMessage: {
      create: vi.fn(async ({ data }) => ({ id: 'outbox_1', ...data })),
    },
    cpqTransitionLedger: {
      findUnique: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      create: vi.fn(async ({ data }) => ({ id: 'ledger_1', ...data })),
      update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
    },
    $transaction: vi.fn(async (fn) => fn({
      salesOrder: {
        create: vi.fn(async ({ data }) => ({ id: 'order_1', ...data })),
      },
      quote: {
        update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
      },
    })),
    ...overrides.prisma as object,
  };
  const quotes = {
    listQuotes: vi.fn(),
    getQuoteById: vi.fn(async () => makeQuote({ status: 'DRAFT' })),
    createQuote: vi.fn(async () => makeQuote({ id: 'quote_created', status: 'DRAFT' })),
    updateQuote: vi.fn(async () => makeQuote({ id: 'quote_1', status: 'DRAFT' })),
    sendQuote: vi.fn(),
    acceptQuote: vi.fn(),
    rejectQuote: vi.fn(),
    duplicateQuote: vi.fn(),
    voidQuote: vi.fn(),
    ...overrides.quotes as object,
  };
  const discountRequests = {
    reasonOptions: vi.fn(() => []),
    listDiscountRequests: vi.fn(),
    createDiscountRequest: vi.fn(async () => ({ id: 'drq_1' })),
    ...overrides.discountRequests as object,
  };
  const pricingEngine = {
    calculate: vi.fn(async () => makePricingResult(overrides.pricing as Record<string, unknown> | undefined)),
    ...overrides.pricingEngine as object,
  };
  const producer = {
    publish: vi.fn(async () => undefined),
    ...overrides.producer as object,
  };
  const checkDiscountApproval = vi.fn(async () => ({
    required: false,
    actualDiscountPercent: 0,
    thresholdPercent: 10,
  }));

  return {
    prisma,
    quotes,
    discountRequests,
    pricingEngine,
    producer,
    useCase: createCommercialRecordsUseCase({
      prisma: prisma as never,
      producer: producer as never,
      quotes: quotes as never,
      discountRequests: discountRequests as never,
      pricingEngine,
      checkDiscountApproval,
    }),
  };
}

describe('commercial records use case', () => {
  it('requires a DRQ payload when CPQ flags quote approval', async () => {
    const { useCase } = makeUseCase({ pricing: { approvalRequired: true } });

    await expect(useCase.createQuote(ctx, {
      dealId: 'deal_1',
      accountId: 'acct_1',
      ownerId: 'usr_1',
      name: 'Quote',
      currency: 'USD',
      rfqId: 'rfq_1',
      items: [{ productId: 'prod_1', quantity: 1 }],
      appliedPromos: [],
      customFields: { approvalPolicyId: 'policy_1' },
    })).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects RFQ creation without a dealId', async () => {
    const { useCase } = makeUseCase();

    await expect(useCase.createRfq(ctx, {
      title: 'RFQ without deal',
      accountId: 'acct_1',
      lineItems: [{ productId: 'prod_1', quantity: 1, unitPrice: 100 }],
    })).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects RFQ creation without an accountId', async () => {
    const { useCase } = makeUseCase();

    await expect(useCase.createRfq(ctx, {
      title: 'RFQ without account',
      dealId: 'deal_1',
      accountId: '',
      lineItems: [{ productId: 'prod_1', quantity: 1, unitPrice: 100 }],
    })).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects RFQ creation without normalized line items', async () => {
    const { useCase } = makeUseCase();

    await expect(useCase.createRfq(ctx, {
      title: 'RFQ without lines',
      dealId: 'deal_1',
      accountId: 'acct_1',
      lineItems: [],
    })).rejects.toBeInstanceOf(ValidationError);
  });

  it('blocks direct quote creation without RFQ context', async () => {
    const { useCase } = makeUseCase();

    await expect(useCase.createQuote(ctx, {
      dealId: 'deal_1',
      accountId: 'acct_1',
      ownerId: 'usr_1',
      name: 'Standalone quote',
      currency: 'USD',
      items: [{ productId: 'prod_1', quantity: 1 }],
      appliedPromos: [],
      customFields: { approvalPolicyId: 'policy_1' },
    })).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('creates a quote and a discount request when CPQ approval data is complete', async () => {
    const { useCase, discountRequests, prisma } = makeUseCase({ pricing: { approvalRequired: true } });

    const result = await useCase.createQuote(ctx, {
      dealId: 'deal_1',
      accountId: 'acct_1',
      ownerId: 'usr_1',
      name: 'Quote',
      currency: 'USD',
      rfqId: 'rfq_1',
      items: [{ productId: 'prod_1', quantity: 1 }],
      appliedPromos: [],
      customFields: { approvalPolicyId: 'policy_1' },
      discountRequest: {
        quoteRevisionId: 'rev_1',
        requestedDiscountPercent: 20,
        reasonCode: 'COMPETITIVE_MATCH',
        reasonNotes: 'Competitive offer',
        winningProbabilityIfApproved: 80,
        customFields: { approverHierarchy: [{ level: 1, approverId: 'mgr_1' }] },
      },
    });

    expect(result.discountRequest).toEqual({ id: 'drq_1' });
    expect(discountRequests.createDiscountRequest).toHaveBeenCalledWith(
      'tenant_1',
      expect.objectContaining({ quoteId: 'quote_created', reasonCode: 'COMPETITIVE_MATCH' }),
      'usr_1'
    );
    expect(prisma.outboxMessage.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        topic: expect.any(String),
        key: 'quote_created',
        tenantId: 'tenant_1',
        aggregateType: 'quote',
        aggregateId: 'quote_created',
        eventType: 'quote.created',
        status: 'PENDING',
      }),
    }));
  });

  it('converts an RFQ through pricing into a linked quote', async () => {
    const { useCase, pricingEngine, quotes, prisma } = makeUseCase();

    const result = await useCase.convertRfq(ctx, 'rfq_1');

    expect(result).toEqual({ rfqId: 'rfq_1', quoteId: 'quote_created' });
    expect(pricingEngine.calculate).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant_1', dealId: 'deal_1' }));
    expect(quotes.createQuote).toHaveBeenCalledWith('tenant_1', expect.objectContaining({
      rfqId: 'rfq_1',
      customFields: expect.objectContaining({ rfqId: 'rfq_1', approvalPolicyId: expect.any(String) }),
    }), expect.any(Object));
    expect(prisma.rFQ.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'CONVERTED' }) }));
    expect(prisma.outboxMessage.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ aggregateId: expect.stringMatching(/rfq_1|quote_created/) }),
    }));
  });

  it('submits a draft RFQ for review through the transition ledger', async () => {
    const { useCase, prisma, producer } = makeUseCase({
      prisma: {
        rFQ: {
          findFirst: vi.fn(async () => ({
            id: 'rfq_1',
            rfqNumber: 'RFQ-000001',
            tenantId: 'tenant_1',
            accountId: 'acct_1',
            contactId: 'contact_1',
            dealId: 'deal_1',
            ownerId: 'usr_1',
            status: 'DRAFT',
            currency: 'USD',
            lineItems: [{ productId: 'prod_1', quantity: 1, unitPrice: 100 }],
          })),
          update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
        },
      },
    });

    const result = await useCase.submitRfqForReview(ctx, 'rfq_1', { idempotencyKey: 'rfq_submit_1' });

    expect(result.status).toBe('SENT');
    expect(prisma.cpqTransitionLedger.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ entity: 'rfq', action: 'SUBMIT_FOR_REVIEW', idempotencyKey: 'rfq_submit_1' }),
    }));
    expect(producer.publish).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ type: 'rfq.submitted_for_review' }));
  });

  it('starts RFQ review only after submission', async () => {
    const { useCase, producer } = makeUseCase({
      prisma: {
        rFQ: {
          findFirst: vi.fn(async () => ({
            id: 'rfq_1',
            rfqNumber: 'RFQ-000001',
            tenantId: 'tenant_1',
            accountId: 'acct_1',
            dealId: 'deal_1',
            ownerId: 'usr_1',
            status: 'SENT',
            currency: 'USD',
            lineItems: [{ productId: 'prod_1', quantity: 1, unitPrice: 100 }],
          })),
          update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
        },
      },
    });

    const result = await useCase.startRfqReview(ctx, 'rfq_1', { idempotencyKey: 'rfq_review_1' });

    expect(result.status).toBe('REVIEWING');
    expect(producer.publish).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ type: 'rfq.review_started' }));
  });

  it('rejects starting RFQ review from draft', async () => {
    const { useCase } = makeUseCase({
      prisma: {
        rFQ: {
          findFirst: vi.fn(async () => ({
            id: 'rfq_1',
            tenantId: 'tenant_1',
            accountId: 'acct_1',
            dealId: 'deal_1',
            ownerId: 'usr_1',
            status: 'DRAFT',
            lineItems: [{ productId: 'prod_1', quantity: 1 }],
          })),
        },
      },
    });

    await expect(useCase.startRfqReview(ctx, 'rfq_1', { idempotencyKey: 'rfq_review_bad' })).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('returns an RFQ for changes with a reason', async () => {
    const { useCase, prisma, producer } = makeUseCase({
      prisma: {
        rFQ: {
          findFirst: vi.fn(async () => ({
            id: 'rfq_1',
            rfqNumber: 'RFQ-000001',
            tenantId: 'tenant_1',
            accountId: 'acct_1',
            dealId: 'deal_1',
            ownerId: 'usr_1',
            status: 'REVIEWING',
            currency: 'USD',
            lineItems: [{ productId: 'prod_1', quantity: 1 }],
          })),
          update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
        },
      },
    });

    const result = await useCase.returnRfqForChanges(ctx, 'rfq_1', 'Missing technical requirement', { idempotencyKey: 'rfq_return_1' });

    expect(result.status).toBe('DRAFT');
    expect(prisma.rFQ.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'DRAFT', internalNotes: expect.stringContaining('Missing technical requirement') }),
    }));
    expect(producer.publish).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ type: 'rfq.returned' }));
  });

  it('marks an RFQ ready for quote from review', async () => {
    const { useCase, producer } = makeUseCase();

    const result = await useCase.markRfqReadyForQuote(ctx, 'rfq_1', { idempotencyKey: 'rfq_ready_1' });

    expect(result.status).toBe('RESPONDED');
    expect(producer.publish).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ type: 'rfq.ready_for_quote' }));
  });

  it('cancels an active RFQ but rejects cancel after conversion', async () => {
    const { useCase, producer } = makeUseCase({
      prisma: {
        rFQ: {
          findFirst: vi.fn(async () => ({
            id: 'rfq_1',
            rfqNumber: 'RFQ-000001',
            tenantId: 'tenant_1',
            accountId: 'acct_1',
            dealId: 'deal_1',
            ownerId: 'usr_1',
            status: 'SENT',
            currency: 'USD',
            lineItems: [{ productId: 'prod_1', quantity: 1 }],
          })),
          update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
        },
      },
    });

    const cancelled = await useCase.cancelRfq(ctx, 'rfq_1', 'Customer paused request', { idempotencyKey: 'rfq_cancel_1' });
    expect(cancelled.status).toBe('CANCELLED');
    expect(producer.publish).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ type: 'rfq.cancelled' }));

    const converted = makeUseCase({
      prisma: {
        rFQ: {
          findFirst: vi.fn(async () => ({ id: 'rfq_2', tenantId: 'tenant_1', status: 'CONVERTED', lineItems: [] })),
        },
      },
    });
    await expect(converted.useCase.cancelRfq(ctx, 'rfq_2', 'Too late', { idempotencyKey: 'rfq_cancel_bad' })).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('rejects RFQ conversion while RFQ is still draft', async () => {
    const { useCase } = makeUseCase({
      prisma: {
        rFQ: {
          findFirst: vi.fn(async () => ({
            id: 'rfq_1',
            rfqNumber: 'RFQ-000001',
            tenantId: 'tenant_1',
            accountId: 'acct_1',
            dealId: 'deal_1',
            ownerId: 'usr_1',
            status: 'DRAFT',
            currency: 'USD',
            lineItems: [{ productId: 'prod_1', quantity: 1, unitPrice: 100 }],
          })),
        },
      },
    });

    await expect(useCase.convertRfq(ctx, 'rfq_1')).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('requires DRQ requests to reference a quote revision', async () => {
    const { useCase } = makeUseCase();

    await expect(useCase.createDiscountRequest(ctx, {
      quoteId: 'quote_1',
      requestedDiscountPercent: 12,
      reasonCode: 'COMPETITIVE_MATCH',
      reasonNotes: 'Customer provided a validated competitor offer.',
      winningProbabilityIfApproved: 75,
      customFields: { approverHierarchy: [{ level: 1, approverId: 'mgr_1' }] },
    } as never)).rejects.toBeInstanceOf(ValidationError);
  });

  it('submits a DRQ for approval through the CPQ transition ledger without changing quote totals', async () => {
    const { useCase, prisma, producer } = makeUseCase({
      prisma: {
        quote: {
          findFirst: vi.fn(async () => makeQuote({ status: 'DRAFT', total: new Prisma.Decimal(100) })),
          update: vi.fn(),
        },
        discountRequest: {
          findFirst: vi.fn(async () => ({
            id: 'drq_1',
            tenantId: 'tenant_1',
            quoteId: 'quote_1',
            status: 'DRAFT',
            requestedById: 'usr_1',
            approvalRequestId: null,
            requestedDiscountPercent: new Prisma.Decimal(15),
            requestedDiscountAmount: new Prisma.Decimal(15),
            reasonCode: 'COMPETITIVE_MATCH',
            reasonNotes: 'Competitive offer',
            winningProbabilityIfApproved: 80,
            customFields: { quoteRevisionId: 'rev_1', approverHierarchy: [{ level: 1, approverId: 'mgr_1' }] },
          })),
          update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
        },
      },
    });

    const result = await useCase.submitDiscountRequestForApproval(ctx, 'drq_1', {
      approvalRequestId: 'approval_drq_1',
      idempotencyKey: 'drq_submit_1',
      correlationId: 'corr_drq',
    });

    expect(result).toEqual(expect.objectContaining({ id: 'drq_1', status: 'PENDING' }));
    expect(prisma.cpqTransitionLedger.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ entity: 'drq', action: 'SUBMIT_FOR_APPROVAL', idempotencyKey: 'drq_submit_1' }),
    }));
    expect(prisma.discountRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'PENDING', approvalRequestId: 'approval_drq_1' }),
    }));
    expect(prisma.quote.update).not.toHaveBeenCalled();
    expect(producer.publish).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ type: 'drq.requested' }));
  });

  it('rejects order conversion when the quote revision is stale or superseded', async () => {
    const { useCase } = makeUseCase({
      prisma: {
        quoteRevision: {
          findFirst: vi.fn(async () => ({ id: 'rev_2', quoteId: 'quote_1', version: 2, status: 'DRAFT' })),
        },
      },
    });

    await expect(useCase.convertQuoteToOrder(ctx, 'quote_1')).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('rejects quote-derived order creation through the manual order path', async () => {
    const { useCase, prisma } = makeUseCase();

    await expect(useCase.createOrder(ctx, {
      accountId: 'acct_1',
      quoteId: 'quote_1',
      ownerId: 'usr_1',
      name: 'Bypass order',
      status: 'DRAFT',
      currency: 'USD',
      subtotal: 100,
      taxAmount: 0,
      discountAmount: 0,
      total: 100,
      lineItems: [],
      customFields: { sourceType: 'QUOTE' },
    })).rejects.toBeInstanceOf(BusinessRuleError);
    expect(prisma.salesOrder.create).not.toHaveBeenCalled();
  });

  it('blocks quote to order conversion when an e-sign envelope is still open', async () => {
    const { useCase } = makeUseCase({
      prisma: {
        quoteESignEnvelope: {
          findFirst: vi.fn(async () => ({ id: 'env_1' })),
        },
      },
    });

    await expect(useCase.convertQuoteToOrder(ctx, 'quote_1')).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('validates uploaded DOCX templates before creation', async () => {
    const { useCase } = makeUseCase();

    await expect(useCase.createQuoteTemplate(ctx, {
      name: 'Bad DOCX',
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      contentBase64: Buffer.from('not-a-docx').toString('base64'),
    })).rejects.toBeInstanceOf(ValidationError);
  });

  it('renders a quote document with default template variables and publishes an event', async () => {
    const { useCase, prisma, producer } = makeUseCase();

    const document = await useCase.renderQuoteDocument(ctx, 'quote_1', { format: 'HTML' });

    expect(document).toEqual(expect.objectContaining({ id: 'doc_1', format: 'HTML', status: 'RENDERED' }));
    expect(prisma.quoteDocument.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId: 'tenant_1',
        quoteId: 'quote_1',
        fileName: 'QUO-2026-00001-v1.html',
        contentBase64: expect.any(String),
      }),
    }));
    expect(producer.publish).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ type: 'quote.document.rendered' }));
    expect(prisma.outboxMessage.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        aggregateId: 'doc_1',
        headers: expect.objectContaining({ eventType: 'quote.document.rendered' }),
      }),
    }));
  });

  it('returns binary download payload when rendered content is embedded', async () => {
    const { useCase } = makeUseCase();

    const result = await useCase.downloadQuoteDocument(ctx, 'doc_1');

    expect(result.kind).toBe('binary');
    if (result.kind === 'binary') {
      expect(result.content.toString('utf8')).toBe('document');
      expect(result.fileName).toBe('quote.html');
    }
  });

  it('creates a signature envelope only after quote send and records audit trail', async () => {
    const { useCase, prisma, producer } = makeUseCase({
      prisma: {
        quote: {
          findFirst: vi.fn(async () => makeQuote({ status: 'SENT' })),
          update: vi.fn(),
        },
      },
    });

    const envelope = await useCase.sendQuoteForSignature(ctx, 'quote_1', {
      recipientName: 'Salma Nova',
      recipientEmail: 'salma@example.com',
      provider: 'INTERNAL',
    });

    expect(envelope).toEqual(expect.objectContaining({ id: 'env_1', status: 'SENT' }));
    expect(prisma.quoteESignEnvelope.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId: 'tenant_1',
        quoteId: 'quote_1',
        recipientEmail: 'salma@example.com',
        auditTrail: expect.any(Array),
      }),
    }));
    expect(producer.publish).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ type: 'quote.signature_requested' }));
  });

  it('accepts the quote when a signature envelope is signed', async () => {
    const { useCase, prisma, producer } = makeUseCase({
      prisma: {
        quoteESignEnvelope: {
          findFirst: vi.fn(async () => ({
            id: 'env_1',
            tenantId: 'tenant_1',
            quoteId: 'quote_1',
            auditTrail: [],
            viewedAt: null,
            signedAt: null,
            declinedAt: null,
            declinedReason: null,
          })),
          findMany: vi.fn(async () => []),
          create: vi.fn(),
          update: vi.fn(async ({ where, data }) => ({ id: where.id, quoteId: 'quote_1', ...data })),
        },
        quote: {
          findFirst: vi.fn(async () => makeQuote({ status: 'SENT' })),
          update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
        },
      },
    });

    await useCase.updateQuoteSignature(ctx, 'env_1', { status: 'SIGNED' });

    expect(prisma.quote.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'quote_1' },
      data: expect.objectContaining({ status: 'ACCEPTED', acceptedAt: ctx.now }),
    }));
    expect(producer.publish).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ type: 'quote.signed' }));
  });

  it('approves a pending quote through the CPQ transition authority', async () => {
    const { useCase, prisma, producer } = makeUseCase({
      prisma: {
        quote: {
          findFirst: vi.fn(async () => makeQuote({ status: 'PENDING_APPROVAL', approvalRequired: true, approvalStatus: 'PENDING' })),
          update: vi.fn(async ({ where, data }) => ({ id: where.id, status: 'APPROVED', ...data })),
        },
      },
    });

    const result = await useCase.approveQuoteFromApproval(ctx, 'quote_1', {
      approvalRequestId: 'approval_1',
      idempotencyKey: 'approval_1.approved',
      approvedById: 'mgr_1',
    });

    expect(result.status).toBe('APPROVED');
    expect(prisma.quote.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'quote_1' },
      data: expect.objectContaining({ status: 'APPROVED', approvalStatus: 'APPROVED' }),
    }));
    expect(producer.publish).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ type: 'quote.approved' }));
  });

  it('rejects quote send when approval has not completed', async () => {
    const { useCase } = makeUseCase({
      prisma: {
        quote: {
          findFirst: vi.fn(async () => makeQuote({ status: 'PENDING_APPROVAL', approvalRequired: true, approvalStatus: 'PENDING' })),
          update: vi.fn(),
        },
      },
    });

    await expect(useCase.transitionCpqEntity({
      tenantId: 'tenant_1',
      actorId: 'usr_1',
      entity: 'quote',
      entityId: 'quote_1',
      action: 'SEND_TO_CUSTOMER',
      idempotencyKey: 'send_1',
    })).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('creates a new quote revision when approved DRQ is applied', async () => {
    const { useCase, prisma, producer } = makeUseCase({
      prisma: {
        quote: {
          findFirst: vi.fn(async () => makeQuote({ status: 'PENDING_APPROVAL', version: 1, discountAmount: new Prisma.Decimal(0), total: new Prisma.Decimal(100) })),
          update: vi.fn(async ({ where, data }) => ({ id: where.id, version: 2, status: 'DRAFT', ...data })),
        },
        quoteRevision: {
          findFirst: vi.fn(async () => ({ id: 'rev_1', quoteId: 'quote_1', version: 1, status: 'PENDING_APPROVAL' })),
          create: vi.fn(async ({ data }) => ({ id: 'rev_2', ...data })),
        },
      },
    });

    const result = await useCase.approveDiscountRequestFromApproval(ctx, 'drq_1', {
      approvalRequestId: 'approval_drq_1',
      idempotencyKey: 'approval_drq_1.approved',
      approvedById: 'mgr_1',
    });

    expect(result.discountRequest.status).toBe('APPROVED');
    expect(prisma.quoteRevision.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        quoteId: 'quote_1',
        version: 2,
        reason: 'discount_request.approved',
      }),
    }));
    expect(producer.publish).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ type: 'quote.revision_created' }));
  });

  it('records successful CPQ transitions in the durable ledger', async () => {
    const { useCase, prisma } = makeUseCase({
      prisma: {
        quote: {
          findFirst: vi.fn(async () => makeQuote({ status: 'PENDING_APPROVAL', approvalRequired: true, approvalStatus: 'PENDING' })),
          update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
        },
      },
    });

    await useCase.approveQuoteFromApproval(ctx, 'quote_1', {
      approvalRequestId: 'approval_quote_1',
      idempotencyKey: 'approval_quote_1.approved',
      approvedById: 'mgr_1',
    });

    expect(prisma.cpqTransitionLedger.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId: 'tenant_1',
        entity: 'quote',
        entityId: 'quote_1',
        action: 'APPROVE',
        idempotencyKey: 'approval_quote_1.approved',
        status: 'STARTED',
      }),
    }));
    expect(prisma.cpqTransitionLedger.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'SUCCEEDED',
        nextStatus: 'APPROVED',
      }),
    }));
  });

  it('returns stored DRQ approval result without creating a duplicate quote revision', async () => {
    const stored = {
      discountRequest: { id: 'drq_1', status: 'APPROVED' },
      quote: { id: 'quote_1', status: 'DRAFT', version: 2 },
      revision: { id: 'rev_2', version: 2 },
    };
    const { useCase, prisma } = makeUseCase({
      prisma: {
        cpqTransitionLedger: {
          findUnique: vi.fn(async () => ({ id: 'ledger_1', status: 'SUCCEEDED', result: stored, error: null })),
          create: vi.fn(),
          update: vi.fn(),
        },
        quoteRevision: {
          findFirst: vi.fn(),
          create: vi.fn(),
        },
      },
    });

    const result = await useCase.approveDiscountRequestFromApproval(ctx, 'drq_1', {
      approvalRequestId: 'approval_drq_1',
      idempotencyKey: 'approval_drq_1.approved',
      approvedById: 'mgr_1',
    });

    expect(result).toEqual(stored);
    expect(prisma.quoteRevision.create).not.toHaveBeenCalled();
    expect(prisma.cpqTransitionLedger.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate in-progress CPQ transitions safely', async () => {
    const { useCase } = makeUseCase({
      prisma: {
        cpqTransitionLedger: {
          findUnique: vi.fn(async () => ({ id: 'ledger_started', status: 'STARTED', result: null, error: null })),
          create: vi.fn(),
          update: vi.fn(),
        },
      },
    });

    await expect(useCase.approveQuoteFromApproval(ctx, 'quote_1', {
      approvalRequestId: 'approval_quote_1',
      idempotencyKey: 'approval_quote_1.approved',
      approvedById: 'mgr_1',
    })).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('stores failed CPQ transitions deterministically', async () => {
    const { useCase, prisma } = makeUseCase({
      prisma: {
        quote: {
          findFirst: vi.fn(async () => makeQuote({ status: 'DRAFT', approvalRequired: false, approvalStatus: null })),
          update: vi.fn(),
        },
      },
    });

    await expect(useCase.approveQuoteFromApproval(ctx, 'quote_1', {
      approvalRequestId: 'approval_quote_1',
      idempotencyKey: 'approval_quote_1.approved',
      approvedById: 'mgr_1',
    })).rejects.toBeInstanceOf(BusinessRuleError);

    expect(prisma.cpqTransitionLedger.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'FAILED',
        error: expect.any(Object),
      }),
    }));
  });

  it('returns stored quote-to-order result without creating a duplicate order', async () => {
    const storedOrder = { id: 'order_1', orderNumber: 'SO-2026-00001', status: 'CONFIRMED' };
    const { useCase, prisma } = makeUseCase({
      prisma: {
        cpqTransitionLedger: {
          findUnique: vi.fn(async () => ({ id: 'ledger_order', status: 'SUCCEEDED', result: storedOrder, error: null })),
          create: vi.fn(),
          update: vi.fn(),
        },
        $transaction: vi.fn(),
      },
    });

    const result = await useCase.convertQuoteToOrder(ctx, 'quote_1', { idempotencyKey: 'quote_1.to_order' });

    expect(result).toEqual(storedOrder);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns transitionLedgerId and emits it in quote accepted events', async () => {
    const { useCase, prisma } = makeUseCase({
      prisma: {
        quote: {
          findFirst: vi.fn(async () => makeQuote({ status: 'SENT' })),
          update: vi.fn(),
        },
      },
      quotes: {
        acceptQuote: vi.fn(async () => makeQuote({ id: 'quote_1', status: 'ACCEPTED' })),
      },
    });

    const quote = await useCase.acceptQuote(ctx, 'quote_1', { idempotencyKey: 'quote_1.accept' });

    expect(quote).toEqual(expect.objectContaining({ transitionLedgerId: 'ledger_1' }));
    expect(prisma.outboxMessage.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        payload: expect.objectContaining({
          metadata: expect.objectContaining({
            transitionLedgerId: 'ledger_1',
            idempotencyKey: 'quote_1.accept',
          }),
        }),
      }),
    }));
    expect(prisma.cpqTransitionLedger.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'SUCCEEDED', result: expect.objectContaining({ transitionLedgerId: 'ledger_1' }) }),
    }));
  });

  it('returns stored accepted quote for duplicate legacy accept without mutating again', async () => {
    const stored = { id: 'quote_1', status: 'ACCEPTED', transitionLedgerId: 'ledger_accept' };
    const acceptQuote = vi.fn();
    const { useCase, prisma } = makeUseCase({
      prisma: {
        cpqTransitionLedger: {
          findUnique: vi.fn(async () => ({ id: 'ledger_accept', status: 'SUCCEEDED', result: stored, error: null })),
          create: vi.fn(),
          update: vi.fn(),
        },
      },
      quotes: { acceptQuote },
    });

    const result = await useCase.acceptQuote(ctx, 'quote_1', { idempotencyKey: 'quote_1.accept' });

    expect(result).toEqual(stored);
    expect(acceptQuote).not.toHaveBeenCalled();
    expect(prisma.cpqTransitionLedger.create).not.toHaveBeenCalled();
  });

  it('routes legacy void helper through transition validation and ledger', async () => {
    const { useCase, prisma, quotes } = makeUseCase({
      prisma: {
        quote: {
          findFirst: vi.fn(async () => makeQuote({ status: 'SENT' })),
          update: vi.fn(),
        },
      },
      quotes: {
        voidQuote: vi.fn(async () => makeQuote({ id: 'quote_1', status: 'VOID' })),
      },
    });

    await useCase.voidQuote(ctx, 'quote_1', 'Customer cancelled', { idempotencyKey: 'quote_1.void' });

    expect(quotes.voidQuote).toHaveBeenCalled();
    expect(prisma.cpqTransitionLedger.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'VOID', entity: 'quote', idempotencyKey: 'quote_1.void' }),
    }));
  });

  it('routes legacy reject helper through transition validation and ledger', async () => {
    const { useCase, prisma, quotes } = makeUseCase({
      prisma: {
        quote: {
          findFirst: vi.fn(async () => makeQuote({ status: 'VIEWED' })),
          update: vi.fn(),
        },
      },
      quotes: {
        rejectQuote: vi.fn(async () => makeQuote({ id: 'quote_1', status: 'REJECTED' })),
      },
    });

    await useCase.rejectQuote(ctx, 'quote_1', 'Customer selected another vendor', { idempotencyKey: 'quote_1.reject' });

    expect(quotes.rejectQuote).toHaveBeenCalled();
    expect(prisma.cpqTransitionLedger.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'REJECT', entity: 'quote', idempotencyKey: 'quote_1.reject' }),
    }));
  });

  it('expires an active expired quote through the transition ledger', async () => {
    const { useCase, prisma } = makeUseCase({
      prisma: {
        quote: {
          findFirst: vi.fn(async () => makeQuote({
            status: 'SENT',
            expiresAt: new Date(ctx.now.getTime() - 60_000),
          })),
          findMany: vi.fn(async () => []),
          update: vi.fn(async ({ where, data }) => ({ id: where.id, status: 'EXPIRED', transitionLedgerId: undefined, ...data })),
        },
        quoteRevision: {
          findFirst: vi.fn(async () => ({ id: 'rev_1', quoteId: 'quote_1', version: 1, status: 'SENT' })),
          create: vi.fn(async ({ data }) => ({ id: 'rev_expired', ...data })),
        },
      },
    });

    const quote = await useCase.expireQuote(ctx, 'quote_1', { idempotencyKey: 'quote_1.expire' });

    expect(quote).toEqual(expect.objectContaining({ status: 'EXPIRED', transitionLedgerId: 'ledger_1' }));
    expect(prisma.quote.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'EXPIRED' }),
    }));
    expect(prisma.outboxMessage.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        payload: expect.objectContaining({
          type: 'quote.expired',
          metadata: expect.objectContaining({
            transitionLedgerId: 'ledger_1',
            idempotencyKey: 'quote_1.expire',
          }),
        }),
      }),
    }));
  });

  it('rejects quote expiry before the expiry date unless forced by system authority', async () => {
    const { useCase } = makeUseCase({
      prisma: {
        quote: {
          findFirst: vi.fn(async () => makeQuote({
            status: 'SENT',
            expiresAt: new Date(ctx.now.getTime() + 60_000),
          })),
          findMany: vi.fn(async () => []),
          update: vi.fn(),
        },
        quoteRevision: {
          findFirst: vi.fn(async () => ({ id: 'rev_1', quoteId: 'quote_1', version: 1, status: 'SENT' })),
          create: vi.fn(),
        },
      },
    });

    await expect(useCase.expireQuote(ctx, 'quote_1', { idempotencyKey: 'quote_1.expire' }))
      .rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('blocks quote expiry for accepted quotes', async () => {
    const { useCase } = makeUseCase({
      prisma: {
        quote: {
          findFirst: vi.fn(async () => makeQuote({
            status: 'ACCEPTED',
            expiresAt: new Date(ctx.now.getTime() - 60_000),
          })),
          findMany: vi.fn(async () => []),
          update: vi.fn(),
        },
      },
    });

    await expect(useCase.expireQuote(ctx, 'quote_1', { idempotencyKey: 'quote_1.expire' }))
      .rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('returns stored quote expiry result for duplicate idempotency keys', async () => {
    const stored = { id: 'quote_1', status: 'EXPIRED', transitionLedgerId: 'ledger_expire' };
    const { useCase, prisma } = makeUseCase({
      prisma: {
        cpqTransitionLedger: {
          findUnique: vi.fn(async () => ({ id: 'ledger_expire', status: 'SUCCEEDED', result: stored, error: null })),
          findMany: vi.fn(async () => []),
          create: vi.fn(),
          update: vi.fn(),
        },
      },
    });

    const result = await useCase.expireQuote(ctx, 'quote_1', { idempotencyKey: 'quote_1.expire' });

    expect(result).toEqual(stored);
    expect(prisma.quote.update).not.toHaveBeenCalled();
    expect(prisma.cpqTransitionLedger.create).not.toHaveBeenCalled();
  });

  it('batch expires candidates per quote without updateMany', async () => {
    const { useCase, prisma } = makeUseCase({
      prisma: {
        quote: {
          findMany: vi.fn(async () => [
            makeQuote({ id: 'quote_1', status: 'SENT', expiresAt: new Date(ctx.now.getTime() - 60_000) }),
            makeQuote({ id: 'quote_2', status: 'SENT', expiresAt: new Date(ctx.now.getTime() - 60_000) }),
          ]),
          findFirst: vi.fn(async ({ where }) => makeQuote({
            id: where.id,
            status: 'SENT',
            expiresAt: new Date(ctx.now.getTime() - 60_000),
          })),
          update: vi.fn(async ({ where, data }) => ({ id: where.id, status: 'EXPIRED', ...data })),
          updateMany: vi.fn(),
        },
        quoteRevision: {
          findFirst: vi.fn(async () => ({ id: 'rev_1', quoteId: 'quote_1', version: 1, status: 'SENT' })),
          create: vi.fn(async ({ data }) => ({ id: 'rev_expired', ...data })),
        },
      },
    });

    const result = await useCase.expireQuotes(ctx, { limit: 10 });

    expect(result.expiredCount).toBe(2);
    expect(result.failedCount).toBe(0);
    expect(prisma.quote.update).toHaveBeenCalledTimes(2);
    expect(prisma.quote.updateMany).not.toHaveBeenCalled();
    expect(prisma.cpqTransitionLedger.create).toHaveBeenCalledTimes(2);
  });

  it('batch expiry collects partial failures instead of stopping the batch', async () => {
    const { useCase } = makeUseCase({
      prisma: {
        quote: {
          findMany: vi.fn(async () => [
            makeQuote({ id: 'quote_1', status: 'SENT', expiresAt: new Date(ctx.now.getTime() - 60_000) }),
            makeQuote({ id: 'quote_2', status: 'SENT', expiresAt: new Date(ctx.now.getTime() - 60_000) }),
          ]),
          findFirst: vi.fn(async ({ where }) => makeQuote({
            id: where.id,
            status: where.id === 'quote_2' ? 'ACCEPTED' : 'SENT',
            expiresAt: new Date(ctx.now.getTime() - 60_000),
          })),
          update: vi.fn(async ({ where, data }) => ({ id: where.id, status: 'EXPIRED', ...data })),
        },
        quoteRevision: {
          findFirst: vi.fn(async () => ({ id: 'rev_1', quoteId: 'quote_1', version: 1, status: 'SENT' })),
          create: vi.fn(async ({ data }) => ({ id: 'rev_expired', ...data })),
        },
      },
    });

    const result = await useCase.expireQuotes(ctx, { limit: 10 });

    expect(result.expiredCount).toBe(1);
    expect(result.failedCount + result.skippedCount).toBe(1);
  });

  it('marks stale STARTED CPQ transition ledgers as failed timeout', async () => {
    const { useCase, prisma } = makeUseCase({
      prisma: {
        cpqTransitionLedger: {
          findUnique: vi.fn(async () => null),
          findMany: vi.fn(async () => [{
            id: 'ledger_stuck',
            tenantId: 'tenant_1',
            entity: 'quote',
            entityId: 'quote_1',
            action: 'EXPIRE',
            status: 'STARTED',
            createdAt: new Date(ctx.now.getTime() - 30 * 60_000),
          }]),
          create: vi.fn(),
          update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
        },
      },
    });

    const result = await useCase.reconcileStuckCpqTransitions(ctx, { olderThanMinutes: 15, limit: 25 });

    expect(result.recoveredCount).toBe(1);
    expect(prisma.cpqTransitionLedger.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: 'STARTED',
        createdAt: expect.objectContaining({ lt: expect.any(Date) }),
      }),
      take: 25,
    }));
    expect(prisma.cpqTransitionLedger.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'ledger_stuck' },
      data: expect.objectContaining({
        status: 'FAILED',
        error: expect.objectContaining({
          code: 'TRANSITION_TIMEOUT',
          message: 'Transition remained STARTED beyond recovery threshold.',
        }),
      }),
    }));
  });

  it('leaves non-stale or completed CPQ transition ledgers untouched during reconciliation', async () => {
    const { useCase, prisma } = makeUseCase({
      prisma: {
        cpqTransitionLedger: {
          findUnique: vi.fn(async () => null),
          findMany: vi.fn(async () => []),
          create: vi.fn(),
          update: vi.fn(),
        },
      },
    });

    const result = await useCase.reconcileStuckCpqTransitions(ctx, { olderThanMinutes: 15, limit: 10 });

    expect(result.recoveredCount).toBe(0);
    expect(prisma.cpqTransitionLedger.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'STARTED' }),
      take: 10,
    }));
    expect(prisma.cpqTransitionLedger.update).not.toHaveBeenCalled();
  });
});
