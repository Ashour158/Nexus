import { describe, expect, it, vi } from 'vitest';
import { BusinessRuleError } from '@nexus/service-utils';
import { handleAutoQuoteDealStageChanged } from './auto-quote.consumer.js';

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    quoteAutomationRule: {
      findMany: vi.fn(async () => [
        {
          id: 'rule_1',
          trigger: 'deal_stage_changed',
          conditions: { stageId: 'stage_reviewed' },
          isActive: true,
          createdAt: new Date(),
        },
      ]),
    },
    rFQ: {
      findFirst: vi.fn(async () => ({
        id: 'rfq_1',
        tenantId: 'tenant_1',
        status: 'READY_FOR_QUOTE',
        dealId: 'deal_1',
        accountId: 'acct_1',
        convertedQuoteId: null,
      })),
    },
    ...overrides,
  };
}

function makeLog() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function makeEvent(payload: Record<string, unknown> = {}) {
  return {
    type: 'deal.stage_changed',
    tenantId: 'tenant_1',
    correlationId: 'corr_1',
    payload: {
      dealId: 'deal_1',
      accountId: 'acct_1',
      ownerId: 'seller_1',
      stageId: 'stage_reviewed',
      rfqId: 'rfq_1',
      ...payload,
    },
  };
}

describe('auto quote consumer authority', () => {
  it('rejects auto quote events without RFQ context', async () => {
    const prisma = makePrisma();
    const log = makeLog();
    const commercial = { convertRfq: vi.fn() };

    await handleAutoQuoteDealStageChanged(prisma as never, log, makeEvent({ rfqId: undefined }), commercial);

    expect(commercial.convertRfq).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ dealId: 'deal_1', accountId: 'acct_1', rfqId: '' }),
      'Auto quote skipped: missing commercial anchors'
    );
  });

  it('routes valid auto quote events through finance RFQ conversion authority', async () => {
    const prisma = makePrisma();
    const log = makeLog();
    const commercial = { convertRfq: vi.fn(async () => ({ rfqId: 'rfq_1', quoteId: 'quote_1' })) };

    await handleAutoQuoteDealStageChanged(prisma as never, log, makeEvent(), commercial);

    expect(commercial.convertRfq).toHaveBeenCalledWith(
      expect.objectContaining({
        audit: expect.objectContaining({
          actor: expect.objectContaining({ tenantId: 'tenant_1', userId: 'seller_1' }),
          requestId: 'corr_1',
          source: 'worker',
        }),
      }),
      'rfq_1'
    );
  });

  it('does not create duplicate quotes for already converted RFQs', async () => {
    const prisma = makePrisma({
      rFQ: {
        findFirst: vi.fn(async () => ({
          id: 'rfq_1',
          tenantId: 'tenant_1',
          status: 'CONVERTED',
          dealId: 'deal_1',
          accountId: 'acct_1',
          convertedQuoteId: 'quote_existing',
        })),
      },
    });
    const log = makeLog();
    const commercial = { convertRfq: vi.fn() };

    await handleAutoQuoteDealStageChanged(prisma as never, log, makeEvent(), commercial);

    expect(commercial.convertRfq).not.toHaveBeenCalled();
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ rfqId: 'rfq_1', convertedQuoteId: 'quote_existing' }),
      'Auto quote skipped: RFQ already converted'
    );
  });

  it('does not create a quote when finance authority rejects the RFQ state', async () => {
    const prisma = makePrisma();
    const log = makeLog();
    const commercial = { convertRfq: vi.fn(async () => {
      throw new BusinessRuleError('RFQ must be reviewed/responded before quote conversion');
    }) };

    await handleAutoQuoteDealStageChanged(prisma as never, log, makeEvent(), commercial);

    expect(commercial.convertRfq).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ rfqId: 'rfq_1', ruleId: 'rule_1' }),
      'Auto quote skipped by finance authority'
    );
  });
});
