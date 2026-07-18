import { NexusConsumer, TOPICS } from '@nexus/kafka';
import type { NexusProducer } from '@nexus/kafka';
import type { BillingPrisma } from '../prisma.js';
import { getStripe, provisionStripeSubscription, type StripePlanRef } from '../lib/stripe.js';

interface LoggerLike {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

const noopLogger: LoggerLike = {
  info: (...args: unknown[]) => console.info('[billing.finance-subscription]', ...args),
  warn: (...args: unknown[]) => console.warn('[billing.finance-subscription]', ...args),
  error: (...args: unknown[]) => console.error('[billing.finance-subscription]', ...args),
};

// Shape of the finance `subscription.created` domain event payload
// (published by finance-service on TOPICS.CONTRACTS). Everything is optional
// on the wire; the handler guards each field.
type FinanceSubscriptionPayload = {
  subscriptionId?: string;
  accountId?: string;
  productId?: string;
  planName?: string;
  status?: string;
  quantity?: number;
  unitPrice?: number;
  currency?: string;
  billingPeriod?: string;
  mrr?: number;
  arr?: number;
  startDate?: string;
  nextBillingDate?: string | null;
  sourceOrderId?: string;
  sourceOrderNumber?: string | null;
  sourceQuoteId?: string;
  sourceQuoteNumber?: string | null;
};

type SubscriptionEventLike = {
  type?: string;
  tenantId?: string;
  correlationId?: string;
  payload?: unknown;
};

function toStr(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function toNum(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toDate(value: unknown, fallback: Date): Date {
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return fallback;
}

// Maps a finance billingPeriod to a billing Plan interval.
function planInterval(period: string): string {
  const p = period.trim().toUpperCase();
  if (p === 'ANNUAL' || p === 'YEARLY' || p === 'QUARTERLY' || p === 'WEEKLY') return p;
  return 'MONTHLY';
}

// Advances a date by one billing period, used to derive currentPeriodEnd.
function periodEnd(start: Date, period: string): Date {
  const end = new Date(start);
  switch (period.trim().toUpperCase()) {
    case 'ANNUAL':
    case 'YEARLY':
      end.setUTCFullYear(end.getUTCFullYear() + 1);
      break;
    case 'QUARTERLY':
      end.setUTCMonth(end.getUTCMonth() + 3);
      break;
    case 'WEEKLY':
      end.setUTCDate(end.getUTCDate() + 7);
      break;
    default:
      end.setUTCMonth(end.getUTCMonth() + 1);
  }
  return end;
}

interface StripeMirrorResult {
  stripeSubId: string | null;
  stripeCustomerId: string | null;
  stripeStatus: string | null;
  stripeLatestInvoiceId: string | null;
}

/**
 * Provisions a real Stripe Subscription for the finance-mirrored subscription.
 * Safe no-op (returns all-null) when STRIPE_SECRET_KEY is unset — billing must
 * never require Stripe to be configured. Any Stripe failure is swallowed so the
 * local mirror still succeeds; provisioning is idempotent on the finance sub id.
 */
async function maybeCreateStripeSubscription(
  prisma: BillingPrisma,
  log: LoggerLike,
  args: {
    tenantId: string;
    accountId: string;
    financeSubscriptionId: string;
    quantity: number;
    plan: StripePlanRef;
  }
): Promise<StripeMirrorResult> {
  const empty: StripeMirrorResult = {
    stripeSubId: null,
    stripeCustomerId: null,
    stripeStatus: null,
    stripeLatestInvoiceId: null,
  };
  const stripe = getStripe(log);
  if (!stripe) {
    // Stub mode: getStripe() already warned once. Mirror locally only.
    return empty;
  }
  try {
    return await provisionStripeSubscription(stripe, prisma, log, {
      tenantId: args.tenantId,
      accountId: args.accountId,
      financeSubscriptionId: args.financeSubscriptionId,
      quantity: args.quantity,
      plan: args.plan,
    });
  } catch (err) {
    log.warn({ err, financeSubscriptionId: args.financeSubscriptionId }, 'Stripe provisioning failed; continuing with local mirror only');
    return empty;
  }
}

/**
 * Ensures a billing Plan exists for the finance product/plan and returns its id.
 * Plans are keyed by (tenantId, name); name is derived from the finance plan.
 */
async function ensurePlan(
  prisma: BillingPrisma,
  tenantId: string,
  args: { name: string; amount: number; currency: string; interval: string }
): Promise<{ id: string; stripePriceId: string | null }> {
  const existing = await prisma.plan.findFirst({
    where: { tenantId, name: args.name },
  });
  if (existing) return { id: existing.id, stripePriceId: existing.stripePriceId };
  try {
    const created = await prisma.plan.create({
      data: {
        tenantId,
        name: args.name,
        amount: args.amount,
        currency: args.currency,
        interval: args.interval,
      },
    });
    return { id: created.id, stripePriceId: created.stripePriceId };
  } catch {
    // Concurrent create (unique [tenantId, name]) — re-read.
    const race = await prisma.plan.findFirst({ where: { tenantId, name: args.name } });
    if (race) return { id: race.id, stripePriceId: race.stripePriceId };
    throw new Error(`Failed to ensure billing plan "${args.name}"`);
  }
}

export async function handleFinanceSubscriptionCreated(
  prisma: BillingPrisma,
  log: LoggerLike,
  event: SubscriptionEventLike
): Promise<void> {
  if (event.type && event.type !== 'subscription.created') return;
  const payload = (event.payload ?? {}) as FinanceSubscriptionPayload;
  const tenantId = toStr(event.tenantId ?? (payload as Record<string, unknown>).tenantId);
  const financeSubscriptionId = toStr(payload.subscriptionId);
  const accountId = toStr(payload.accountId);

  if (!tenantId || !financeSubscriptionId || !accountId) {
    log.warn({ tenantId, financeSubscriptionId, accountId }, 'Skipping finance subscription mirror: missing anchors');
    return;
  }

  // Idempotency: one billing Subscription per finance subscription id.
  const already = await prisma.subscription.findFirst({
    where: {
      tenantId,
      metadata: { path: ['financeSubscriptionId'], equals: financeSubscriptionId },
      deletedAt: null,
    },
  });
  if (already) {
    log.info({ financeSubscriptionId, billingSubscriptionId: already.id }, 'Finance subscription already mirrored; skipping');
    return;
  }

  const currency = toStr(payload.currency) || 'USD';
  const billingPeriod = toStr(payload.billingPeriod) || 'MONTHLY';
  const interval = planInterval(billingPeriod);
  const quantity = Math.max(1, Math.trunc(toNum(payload.quantity, 1)));
  const unitPrice = toNum(payload.unitPrice, 0);
  // Plan amount reflects the per-period charge (unit * quantity).
  const planAmount = Number((unitPrice * quantity).toFixed(2));
  const planName = toStr(payload.planName) || `Finance plan ${toStr(payload.productId) || financeSubscriptionId}`;

  const start = toDate(payload.startDate, new Date());
  const end = toDate(payload.nextBillingDate, periodEnd(start, billingPeriod));

  const plan = await ensurePlan(prisma, tenantId, {
    name: planName,
    amount: planAmount,
    currency,
    interval,
  });
  const planId = plan.id;

  const stripe = await maybeCreateStripeSubscription(prisma, log, {
    tenantId,
    accountId,
    financeSubscriptionId,
    quantity,
    plan: {
      id: plan.id,
      name: planName,
      amount: planAmount,
      currency,
      interval,
      stripePriceId: plan.stripePriceId,
    },
  });

  try {
    const created = await prisma.subscription.create({
      data: {
        tenantId,
        customerId: accountId,
        planId,
        status: toStr(payload.status) || 'ACTIVE',
        currentPeriodStart: start,
        currentPeriodEnd: end,
        stripeSubId: stripe.stripeSubId,
        metadata: {
          financeSubscriptionId,
          financeProductId: toStr(payload.productId) || null,
          financeOrderId: toStr(payload.sourceOrderId) || null,
          financeOrderNumber: payload.sourceOrderNumber ?? null,
          financeQuoteId: toStr(payload.sourceQuoteId) || null,
          financeQuoteNumber: payload.sourceQuoteNumber ?? null,
          source: 'finance-service.subscription.created',
          mrr: toNum(payload.mrr, planAmount),
          arr: toNum(payload.arr, planAmount * 12),
          // Stripe linkage (null in stub mode). stripeCustomerId is persisted
          // here because there is no first-class column for it.
          stripeCustomerId: stripe.stripeCustomerId,
          stripeStatus: stripe.stripeStatus,
          stripeLatestInvoiceId: stripe.stripeLatestInvoiceId,
        },
      },
    });
    log.info(
      { financeSubscriptionId, billingSubscriptionId: created.id, planId },
      'Mirrored finance subscription into billing (SoR = finance-service)'
    );
  } catch (err) {
    log.error({ err, financeSubscriptionId }, 'Failed to mirror finance subscription into billing');
    throw err;
  }
}

export async function startFinanceSubscriptionConsumer(
  prisma: BillingPrisma,
  log: LoggerLike = noopLogger,
  _producer?: NexusProducer
): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('billing-service.finance-subscription');

  consumer.on('subscription.created', async (event) => {
    await handleFinanceSubscriptionCreated(prisma, log, {
      type: event.type,
      tenantId: event.tenantId,
      correlationId: event.correlationId,
      payload: (event as { payload?: unknown }).payload,
    });
  });

  await consumer.subscribe([TOPICS.CONTRACTS]);
  await consumer.start();
  return consumer;
}
