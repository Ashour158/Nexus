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

/** First non-empty trimmed string among the candidates, else ''. */
function firstString(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === 'string' && v.trim().length > 0) return v;
  }
  return '';
}

/** First finite number among the candidates, else null. */
function firstNumber(...values: unknown[]): number | null {
  for (const v of values) {
    const n = getNumber(v);
    if (n !== null) return n;
  }
  return null;
}

type AutoQuoteEventLike = {
  type?: string;
  tenantId?: string;
  correlationId?: string;
  payload?: Record<string, unknown>;
};

type ApprovalActionInput = {
  approvalRequestId?: string;
  idempotencyKey?: string;
  correlationId?: string;
};

type RenderActionInput = {
  templateId?: string;
  format: 'HTML' | 'PDF' | 'DOCX';
};

// The convert method is required (legacy behavior + the default action); the
// richer capabilities are optional so a partial mock (tests) still satisfies the
// contract, and each action handler feature-detects before dispatching.
type AutoQuoteAuthority = {
  convertRfq(ctx: EngineContext, rfqId: string): Promise<unknown>;
  submitQuoteForApproval?(ctx: EngineContext, quoteId: string, input: ApprovalActionInput): Promise<unknown>;
  renderQuoteDocument?(ctx: EngineContext, quoteId: string, input: RenderActionInput): Promise<unknown>;
};

type RuleLike = {
  id: string;
  templateId?: string | null;
  priceBookId?: string | null;
  conditions?: unknown;
  actions?: unknown;
};

type ExecOptions = { producer?: NexusProducer };

type EvtCtx = {
  tenantId: string;
  dealId: string;
  accountId: string;
  rfqId: string;
  ownerId: string;
  amount: number;
  stageId: string | null;
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
      correlationId: event.correlationId,
      source: 'worker',
    },
    now: new Date(),
  };
}

function resolveEvtCtx(event: AutoQuoteEventLike): EvtCtx {
  const p = event.payload ?? {};
  return {
    tenantId: String(event.tenantId ?? ''),
    dealId: firstString(p.dealId),
    accountId: firstString(p.accountId),
    rfqId: firstString(p.rfqId),
    ownerId: firstString(p.ownerId, p.actorId) || 'system',
    amount: firstNumber(p.amount, p.dealValue, p.total) ?? 0,
    stageId: firstString(p.stageId, p.stage) || null,
  };
}

/**
 * Condition matcher that accepts BOTH the admin-UI condition keys
 * (`stage` / `minAmount` / `maxAmount`) and the internal keys
 * (`stageId` / `dealValueMin` / `dealValueMax`) so rules authored in the UI
 * actually gate the consumer.
 */
function matchesConditions(conditions: Record<string, unknown>, evt: EvtCtx): boolean {
  const expectedStage = firstString(conditions.stageId, conditions.stage) || null;
  if (expectedStage && expectedStage !== evt.stageId) return false;

  const min = firstNumber(conditions.dealValueMin, conditions.minAmount);
  const max = firstNumber(conditions.dealValueMax, conditions.maxAmount);
  if (min !== null && evt.amount < min) return false;
  if (max !== null && evt.amount > max) return false;

  return true;
}

// ─── Action handlers ─────────────────────────────────────────────────────────

/** create_quote — convert the source RFQ. Returns the produced quoteId (or ''). */
async function runCreateQuote(
  prisma: FinancePrisma,
  log: LoggerLike,
  ctx: EngineContext,
  rule: RuleLike,
  evt: EvtCtx,
  authority: AutoQuoteAuthority
): Promise<string> {
  if (!evt.rfqId) {
    log.warn({ ruleId: rule.id, dealId: evt.dealId }, 'Auto quote create_quote skipped: no RFQ context');
    return '';
  }
  const rfq = await prisma.rFQ.findFirst({ where: { id: evt.rfqId, tenantId: evt.tenantId } });
  if (!rfq) {
    log.warn({ tenantId: evt.tenantId, dealId: evt.dealId, rfqId: evt.rfqId, ruleId: rule.id }, 'Auto quote skipped: RFQ not found');
    return '';
  }
  if (String(rfq.convertedQuoteId ?? '') || String(rfq.status) === 'CONVERTED') {
    log.info(
      { tenantId: evt.tenantId, dealId: evt.dealId, rfqId: evt.rfqId, convertedQuoteId: rfq.convertedQuoteId, ruleId: rule.id },
      'Auto quote skipped: RFQ already converted'
    );
    return String(rfq.convertedQuoteId ?? '');
  }
  try {
    const result = await authority.convertRfq(ctx, evt.rfqId);
    log.info({ tenantId: evt.tenantId, dealId: evt.dealId, rfqId: evt.rfqId, ruleId: rule.id, result }, 'Auto quote routed through finance authority');
    return result && typeof result === 'object'
      ? firstString((result as Record<string, unknown>).quoteId)
      : '';
  } catch (err) {
    if (err instanceof BusinessRuleError || err instanceof ValidationError) {
      log.warn({ err, tenantId: evt.tenantId, dealId: evt.dealId, rfqId: evt.rfqId, ruleId: rule.id }, 'Auto quote skipped by finance authority');
      return '';
    }
    throw err;
  }
}

/** assign_owner — reassign a quote owner (tenant-scoped). */
async function runAssignOwner(
  prisma: FinancePrisma,
  log: LoggerLike,
  action: Record<string, unknown>,
  rule: RuleLike,
  evt: EvtCtx,
  quoteId: string
): Promise<void> {
  const ownerId = firstString(action.ownerId, action.assigneeId, action.userId);
  const targetQuote = quoteId || firstString(action.quoteId);
  if (!ownerId || !targetQuote) {
    log.warn({ ruleId: rule.id, quoteId: targetQuote, ownerId }, 'Auto quote assign_owner skipped: missing owner or quote');
    return;
  }
  await prisma.quote.updateMany({
    where: { id: targetQuote, tenantId: evt.tenantId },
    data: { ownerId },
  });
  log.info({ ruleId: rule.id, quoteId: targetQuote, ownerId }, 'Auto quote assigned owner');
}

/** request_approval — submit a quote into the CPQ approval flow. */
async function runRequestApproval(
  log: LoggerLike,
  ctx: EngineContext,
  action: Record<string, unknown>,
  rule: RuleLike,
  quoteId: string,
  authority: AutoQuoteAuthority
): Promise<void> {
  const targetQuote = quoteId || firstString(action.quoteId);
  if (!targetQuote) {
    log.warn({ ruleId: rule.id }, 'Auto quote request_approval skipped: no quote');
    return;
  }
  if (typeof authority.submitQuoteForApproval !== 'function') {
    log.warn({ ruleId: rule.id, quoteId: targetQuote }, 'Auto quote request_approval skipped: capability unavailable');
    return;
  }
  await authority.submitQuoteForApproval(ctx, targetQuote, {
    approvalRequestId: firstString(action.approvalRequestId) || undefined,
    idempotencyKey: `auto-approval:${targetQuote}`,
    correlationId: ctx.audit.correlationId,
  });
  log.info({ ruleId: rule.id, quoteId: targetQuote }, 'Auto quote requested approval');
}

/** render_template — enqueue a quote document render (template from action or rule). */
async function runRenderTemplate(
  log: LoggerLike,
  ctx: EngineContext,
  action: Record<string, unknown>,
  rule: RuleLike,
  quoteId: string,
  authority: AutoQuoteAuthority
): Promise<void> {
  const targetQuote = quoteId || firstString(action.quoteId);
  if (!targetQuote) {
    log.warn({ ruleId: rule.id }, 'Auto quote render_template skipped: no quote');
    return;
  }
  if (typeof authority.renderQuoteDocument !== 'function') {
    log.warn({ ruleId: rule.id, quoteId: targetQuote }, 'Auto quote render_template skipped: capability unavailable');
    return;
  }
  const templateId = firstString(action.templateId, rule.templateId) || undefined;
  const rawFormat = firstString(action.format).toUpperCase();
  const format: RenderActionInput['format'] = rawFormat === 'HTML' || rawFormat === 'DOCX' ? rawFormat : 'PDF';
  await authority.renderQuoteDocument(ctx, targetQuote, { templateId, format });
  log.info({ ruleId: rule.id, quoteId: targetQuote, templateId, format }, 'Auto quote rendered template');
}

/** send_notification — publish a notification request onto the platform topic. */
async function runSendNotification(
  log: LoggerLike,
  action: Record<string, unknown>,
  rule: RuleLike,
  evt: EvtCtx,
  quoteId: string,
  producer?: NexusProducer
): Promise<void> {
  if (!producer) {
    log.warn({ ruleId: rule.id }, 'Auto quote send_notification skipped: no producer');
    return;
  }
  try {
    await producer.publish(TOPICS.NOTIFICATIONS, {
      type: 'notification.requested',
      tenantId: evt.tenantId,
      payload: {
        channel: firstString(action.channel) || 'in_app',
        template: firstString(action.template, action.templateId) || 'quote_automation',
        recipientId: firstString(action.recipientId, action.userId) || evt.ownerId,
        dealId: evt.dealId || undefined,
        quoteId: quoteId || firstString(action.quoteId) || undefined,
        message: firstString(action.message) || undefined,
        ruleId: rule.id,
      },
    });
  } catch (err) {
    // Don't claim success on a swallowed failure — log and bail.
    log.warn({ ruleId: rule.id, dealId: evt.dealId, quoteId, err }, 'Auto quote send_notification publish failed');
    return;
  }
  log.info({ ruleId: rule.id, dealId: evt.dealId, quoteId }, 'Auto quote sent notification');
}

/**
 * Executes a rule's `actions[]` in order, dispatching by `type`. A rule with no
 * explicit actions falls back to the legacy behavior (convert the RFQ). A quoteId
 * produced by an earlier `create_quote` action threads into later actions so
 * assign_owner / request_approval / render_template / send_notification can target
 * the freshly created quote. Each action is fail-open — one bad action never
 * aborts the rest of the rule.
 */
async function executeRuleActions(
  prisma: FinancePrisma,
  log: LoggerLike,
  event: AutoQuoteEventLike,
  rule: RuleLike,
  evt: EvtCtx,
  authority: AutoQuoteAuthority,
  options: ExecOptions
): Promise<void> {
  const ctx = engineContextForAutoQuote(event, evt.ownerId);
  const declared = Array.isArray(rule.actions) ? (rule.actions as unknown[]) : [];
  const effective = declared.length > 0 ? declared : [{ type: 'create_quote' }];

  let quoteId = '';
  for (const rawAction of effective) {
    const action = (rawAction && typeof rawAction === 'object' ? rawAction : {}) as Record<string, unknown>;
    const type = String(action.type ?? '');
    try {
      switch (type) {
        case 'create_quote': {
          const produced = await runCreateQuote(prisma, log, ctx, rule, evt, authority);
          if (produced) quoteId = produced;
          break;
        }
        case 'assign_owner':
          await runAssignOwner(prisma, log, action, rule, evt, quoteId);
          break;
        case 'request_approval':
          await runRequestApproval(log, ctx, action, rule, quoteId, authority);
          break;
        case 'render_template':
          await runRenderTemplate(log, ctx, action, rule, quoteId, authority);
          break;
        case 'send_notification':
          await runSendNotification(log, action, rule, evt, quoteId, options.producer);
          break;
        default:
          log.warn({ ruleId: rule.id, type }, 'Auto quote: unsupported action type');
      }
    } catch (err) {
      // Fail-open per action so a single failing action doesn't abort the rule.
      log.warn({ err, ruleId: rule.id, type }, 'Auto quote action failed (fail-open)');
    }
  }
}

/** Shared trigger runner: load active rules for the trigger, filter, execute. */
async function runAutomationForTrigger(
  prisma: FinancePrisma,
  log: LoggerLike,
  event: AutoQuoteEventLike,
  authority: AutoQuoteAuthority,
  trigger: string,
  options: ExecOptions
): Promise<void> {
  const evt = resolveEvtCtx(event);
  if (!evt.tenantId) return;
  const rules = await prisma.quoteAutomationRule.findMany({
    where: { tenantId: evt.tenantId, isActive: true, trigger },
    orderBy: { createdAt: 'asc' },
  });
  if (rules.length === 0) return;
  for (const rule of rules) {
    if (!matchesConditions((rule.conditions ?? {}) as Record<string, unknown>, evt)) continue;
    await executeRuleActions(prisma, log, event, rule as RuleLike, evt, authority, options);
  }
}

/**
 * deal.stage_changed → `deal_stage_changed` rules. Keeps the stricter commercial
 * anchor guard (requires an RFQ) since this trigger's default action converts an
 * existing RFQ.
 */
export async function handleAutoQuoteDealStageChanged(
  prisma: FinancePrisma,
  log: LoggerLike,
  event: AutoQuoteEventLike,
  authority: AutoQuoteAuthority,
  options: ExecOptions = {}
) {
  if (event.type && event.type !== 'deal.stage_changed') return;
  const evt = resolveEvtCtx(event);

  if (!evt.tenantId || !evt.dealId || !evt.accountId || !evt.rfqId) {
    log.warn(
      { tenantId: evt.tenantId, dealId: evt.dealId, accountId: evt.accountId, rfqId: evt.rfqId },
      'Auto quote skipped: missing commercial anchors'
    );
    return;
  }

  const rules = await prisma.quoteAutomationRule.findMany({
    where: { tenantId: evt.tenantId, isActive: true, trigger: 'deal_stage_changed' },
    orderBy: { createdAt: 'asc' },
  });
  if (rules.length === 0) return;

  for (const rule of rules) {
    if (!matchesConditions((rule.conditions ?? {}) as Record<string, unknown>, evt)) continue;
    await executeRuleActions(prisma, log, event, rule as RuleLike, evt, authority, options);
  }
}

/** deal.created → `deal_created` rules. */
export async function handleAutoQuoteDealCreated(
  prisma: FinancePrisma,
  log: LoggerLike,
  event: AutoQuoteEventLike,
  authority: AutoQuoteAuthority,
  options: ExecOptions = {}
) {
  if (event.type && event.type !== 'deal.created') return;
  await runAutomationForTrigger(prisma, log, event, authority, 'deal_created', options);
}

/** rfq.created → `rfq_received` rules. */
export async function handleAutoQuoteRfqReceived(
  prisma: FinancePrisma,
  log: LoggerLike,
  event: AutoQuoteEventLike,
  authority: AutoQuoteAuthority,
  options: ExecOptions = {}
) {
  if (event.type && event.type !== 'rfq.created') return;
  await runAutomationForTrigger(prisma, log, event, authority, 'rfq_received', options);
}

/** quote.discount_request.created → `discount_requested` rules. */
export async function handleAutoQuoteDiscountRequested(
  prisma: FinancePrisma,
  log: LoggerLike,
  event: AutoQuoteEventLike,
  authority: AutoQuoteAuthority,
  options: ExecOptions = {}
) {
  if (event.type && event.type !== 'quote.discount_request.created') return;
  await runAutomationForTrigger(prisma, log, event, authority, 'discount_requested', options);
}

export async function startAutoQuoteConsumer(
  prisma: FinancePrisma,
  log: LoggerLike,
  producer: NexusProducer = new NexusProducer('finance-service.auto-quote')
): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('finance-service.auto-quote');
  const authority = defaultAuthority(prisma, producer);
  const options: ExecOptions = { producer };

  const toEvent = (event: { type?: string; tenantId?: string; correlationId?: string; payload?: unknown }): AutoQuoteEventLike => ({
    type: event.type,
    tenantId: event.tenantId,
    correlationId: event.correlationId,
    payload: event.payload as Record<string, unknown>,
  });

  consumer.on('deal.stage_changed', async (event) => {
    await handleAutoQuoteDealStageChanged(prisma, log, toEvent(event), authority, options);
  });
  consumer.on('deal.created', async (event) => {
    await handleAutoQuoteDealCreated(prisma, log, toEvent(event), authority, options);
  });
  consumer.on('rfq.created', async (event) => {
    await handleAutoQuoteRfqReceived(prisma, log, toEvent(event), authority, options);
  });
  consumer.on('quote.discount_request.created', async (event) => {
    await handleAutoQuoteDiscountRequested(prisma, log, toEvent(event), authority, options);
  });

  // NOTE: the `quote_expiring` trigger is intentionally not wired here — it is a
  // time-based condition with no source event to subscribe to. It should be driven
  // by a scheduled scan (follow-up) that emits a `quote.expiring` event this
  // consumer can then route like the others.

  // deal.stage_changed / deal.created flow on the DEALS topic; rfq.created and
  // quote.discount_request.created are finance's own events on the QUOTES topic.
  await consumer.subscribe([TOPICS.DEALS, TOPICS.QUOTES]);
  await consumer.start();
  return consumer;
}
