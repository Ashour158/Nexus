import { NexusConsumer, TOPICS } from '@nexus/kafka';
import type { NexusProducer } from '@nexus/kafka';
import type { BillingPrisma } from '../prisma.js';

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

/**
 * Best-effort Stripe mirror. Skips cleanly (returns null) when STRIPE_SECRET_KEY
 * is unset — billing must never require Stripe to be configured. Any Stripe
 * failure is swallowed so the local mirror still succeeds.
 */
async function maybeCreateStripeSubscription(
  log: LoggerLike,
  args: { planName: string; amount: number; currency: string; interval: string; customerRef: string }
): Promise<{ stripeSubId: string | null }> {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    log.info('Stripe not configured (STRIPE_SECRET_KEY unset); mirroring finance subscription locally only');
    return { stripeSubId: null };
  }
  try {
    // Stripe provisioning is intentionally left as a guarded hook. We avoid
    // making live calls (customer/price/subscription creation) unless a
    // dedicated provisioning path is wired up, so a configured key alone does
    // not trigger side effects during the finance→billing mirror.
    log.info({ customerRef: args.customerRef }, 'Stripe configured; provisioning hook is a no-op for finance mirror');
    return { stripeSubId: null };
  } catch (err) {
    log.warn({ err }, 'Stripe provisioning failed; continuing with local mirror only');
    return { stripeSubId: null };
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
): Promise<string> {
  const existing = await prisma.plan.findFirst({
    where: { tenantId, name: args.name },
  });
  if (existing) return existing.id;
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
    return created.id;
  } catch {
    // Concurrent create (unique [tenantId, name]) — re-read.
    const race = await prisma.plan.findFirst({ where: { tenantId, name: args.name } });
    if (race) return race.id;
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

  const planId = await ensurePlan(prisma, tenantId, {
    name: planName,
    amount: planAmount,
    currency,
    interval,
  });

  const stripe = await maybeCreateStripeSubscription(log, {
    planName,
    amount: planAmount,
    currency,
    interval,
    customerRef: accountId,
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
