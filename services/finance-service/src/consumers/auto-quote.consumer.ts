import { NexusConsumer, NexusProducer, TOPICS } from '@nexus/kafka';
import type { EngineContext } from '@nexus/domain-core';
import { BusinessRuleError, ValidationError } from '@nexus/service-utils';
import type { FinancePrisma } from '../prisma.js';
import { CpqPricingEngine } from '../cpq/pricing-engine.js';
import { createCommercialRecordsUseCase } from '../use-cases/commercial-records.use-case.js';
import { createQuotesService } from '../services/quotes.service.js';
import { createDiscountRequestsService } from '../services/discount-requests.service.js';
import { checkDiscountApproval } from '../lib/discount-approval.js';

interface LoggerLike {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

function getNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

type AutoQuoteEventLike = {
  type?: string;
  tenantId?: string;
  correlationId?: string;
  payload?: Record<string, unknown>;
};

type AutoQuoteAuthority = {
  convertRfq(ctx: EngineContext, rfqId: string): Promise<unknown>;
};

function defaultAuthority(prisma: FinancePrisma, producer: NexusProducer): AutoQuoteAuthority {
  return createCommercialRecordsUseCase({
    prisma,
    producer,
    quotes: createQuotesService(prisma, producer),
    discountRequests: createDiscountRequestsService(prisma, producer),
    pricingEngine: new CpqPricingEngine(prisma),
    checkDiscountApproval,
  });
}

function engineContextForAutoQuote(event: AutoQuoteEventLike, actorId: string): EngineContext {
  return {
    audit: {
      actor: {
        tenantId: String(event.tenantId ?? ''),
        userId: actorId,
        roles: ['SYSTEM'],
        permissions: ['quotes:create', 'rfqs:update'],
      },
      requestId: event.correlationId ?? `auto-quote:${String(event.payload?.rfqId ?? event.payload?.dealId ?? '')}`,
      source: 'worker',
    },
    now: new Date(),
  };
}

export async function handleAutoQuoteDealStageChanged(
  prisma: FinancePrisma,
  log: LoggerLike,
  event: AutoQuoteEventLike,
  authority: AutoQuoteAuthority
) {
  if (event.type && event.type !== 'deal.stage_changed') return;
  const payload = event.payload ?? {};
  const tenantId = String(event.tenantId ?? '');
  const dealId = String(payload.dealId ?? '');
  const accountId = String(payload.accountId ?? '');
  const rfqId = String(payload.rfqId ?? '');
  const actorId = String(payload.ownerId ?? payload.actorId ?? 'system');

  if (!tenantId || !dealId || !accountId || !rfqId) {
    log.warn({ tenantId, dealId, accountId, rfqId }, 'Auto quote skipped: missing commercial anchors');
    return;
  }

  const rules = await prisma.quoteAutomationRule.findMany({
    where: { tenantId, isActive: true, trigger: 'deal_stage_changed' },
    orderBy: { createdAt: 'asc' },
  });
  if (rules.length === 0) return;

  for (const rule of rules) {
    const conditions = (rule.conditions ?? {}) as Record<string, unknown>;
    const stageId = typeof payload.stageId === 'string' ? payload.stageId : null;
    const expectedStage = typeof conditions.stageId === 'string' ? conditions.stageId : null;
    if (expectedStage && expectedStage !== stageId) continue;

    const dealValue = getNumber(payload.amount) ?? 0;
    const min = getNumber(conditions.dealValueMin);
    const max = getNumber(conditions.dealValueMax);
    if (min !== null && dealValue < min) continue;
    if (max !== null && dealValue > max) continue;

    const rfq = await prisma.rFQ.findFirst({ where: { id: rfqId, tenantId } });
    if (!rfq) {
      log.warn({ tenantId, dealId, accountId, rfqId, ruleId: rule.id }, 'Auto quote skipped: RFQ not found');
      continue;
    }
    if (String(rfq.convertedQuoteId ?? '') || String(rfq.status) === 'CONVERTED') {
      log.info(
        { tenantId, dealId, rfqId, convertedQuoteId: rfq.convertedQuoteId, ruleId: rule.id },
        'Auto quote skipped: RFQ already converted'
      );
      continue;
    }

    try {
      const result = await authority.convertRfq(engineContextForAutoQuote(event, actorId), rfqId);
      log.info({ tenantId, dealId, rfqId, ruleId: rule.id, result }, 'Auto quote routed through finance authority');
    } catch (err) {
      if (err instanceof BusinessRuleError || err instanceof ValidationError) {
        log.warn({ err, tenantId, dealId, rfqId, ruleId: rule.id }, 'Auto quote skipped by finance authority');
        continue;
      }
      throw err;
    }
  }
}

export async function startAutoQuoteConsumer(
  prisma: FinancePrisma,
  log: LoggerLike,
  producer: NexusProducer = new NexusProducer('finance-service.auto-quote')
): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('finance-service.auto-quote');
  const authority = defaultAuthority(prisma, producer);

  consumer.on('deal.stage_changed', async (event) => {
    await handleAutoQuoteDealStageChanged(prisma, log, {
      type: event.type,
      tenantId: event.tenantId,
      correlationId: event.correlationId,
      payload: event.payload as Record<string, unknown>,
    }, authority);
  });

  await consumer.subscribe([TOPICS.DEALS]);
  await consumer.start();
  return consumer;
}

