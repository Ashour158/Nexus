import Stripe from 'stripe';
import { Decimal } from 'decimal.js';
import type { BillingPrisma } from '../prisma.js';
import { money, toDecimal } from './billing-math.js';

/**
 * Stripe integration for billing-service (RR-C3).
 *
 * Everything here is gated behind STRIPE_SECRET_KEY. `getStripe()` returns a
 * configured `Stripe` client, or `null` when the key is unset — in which case
 * every caller must fall back to its prior no-op behaviour (local mirror only).
 * This keeps unconfigured environments byte-for-byte unchanged while making the
 * provisioning + dunning paths real and idempotent once a (test-mode) key is set.
 *
 * No key is ever hardcoded, and no call is made unless `getStripe()` returns
 * non-null. All money is converted to Stripe minor units decimal-safely.
 */

export interface LoggerLike {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

// Pin the Stripe API version to match the inbound webhook handler so the
// event shapes we produce and the ones we verify agree.
const STRIPE_API_VERSION = '2024-06-20';

let cachedStripe: Stripe | null = null;
let cachedKey: string | undefined;
let warnedStubMode = false;

/**
 * Returns a configured Stripe client, or `null` when STRIPE_SECRET_KEY is unset.
 * When unset, logs a single clear warning that billing is running in stub mode
 * (no outbound charges) and thereafter stays quiet.
 */
export function getStripe(log?: LoggerLike): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    if (!warnedStubMode) {
      warnedStubMode = true;
      log?.warn(
        'STRIPE_SECRET_KEY unset — billing is in STUB MODE: no Stripe customers/subscriptions are provisioned and dunning does not charge cards. Set STRIPE_SECRET_KEY (test mode: sk_test_...) to enable outbound billing.'
      );
    }
    return null;
  }
  // Re-use the client unless the key changed (e.g. rotated in a long-lived proc).
  if (cachedStripe && cachedKey === key) return cachedStripe;
  cachedStripe = new Stripe(key, { apiVersion: STRIPE_API_VERSION });
  cachedKey = key;
  return cachedStripe;
}

/** Test hook: reset memoised client + warn latch (used by unit tests). */
export function __resetStripeForTest(): void {
  cachedStripe = null;
  cachedKey = undefined;
  warnedStubMode = false;
}

/** Decimal-safe conversion of a major-unit amount to Stripe integer minor units. */
export function toMinorUnits(amount: unknown): number {
  return money(toDecimal(amount)).times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

/** Maps an internal plan interval to a Stripe recurring {interval, interval_count}. */
function toStripeRecurring(interval: string): {
  interval: Stripe.PriceCreateParams.Recurring.Interval;
  interval_count: number;
} {
  switch (interval.trim().toUpperCase()) {
    case 'ANNUAL':
    case 'YEARLY':
      return { interval: 'year', interval_count: 1 };
    case 'QUARTERLY':
      return { interval: 'month', interval_count: 3 };
    case 'WEEKLY':
      return { interval: 'week', interval_count: 1 };
    case 'DAILY':
      return { interval: 'day', interval_count: 1 };
    default:
      return { interval: 'month', interval_count: 1 };
  }
}

export interface StripePlanRef {
  id: string;
  name: string;
  amount: unknown; // Prisma.Decimal | number | string
  currency: string;
  interval: string;
  stripePriceId: string | null;
}

/**
 * Finds a previously-provisioned Stripe customer id for a tenant/account by
 * scanning the account's existing subscriptions' metadata. Returns null if none
 * has been provisioned yet. (There is no first-class `stripeCustomerId` column;
 * the id is persisted in Subscription.metadata.stripeCustomerId — see report.)
 */
export async function findStoredStripeCustomerId(
  prisma: BillingPrisma,
  tenantId: string,
  accountId: string
): Promise<string | null> {
  // Scan recent subscriptions for the account and read the id out of metadata in
  // JS — avoids brittle JSON `not: null` filters that vary across Prisma clients.
  const rows = await prisma.subscription.findMany({
    where: { tenantId, customerId: accountId },
    select: { metadata: true },
    take: 25,
    orderBy: { createdAt: 'desc' },
  });
  for (const row of rows) {
    const meta = row.metadata as Record<string, unknown> | null | undefined;
    const id = meta?.stripeCustomerId;
    if (typeof id === 'string' && id.length > 0) return id;
  }
  return null;
}

/**
 * Ensures a Stripe Customer exists for (tenant, account). Reuses a stored id
 * when present, otherwise creates one with an idempotency key so repeated calls
 * (retries / concurrent ticks) never create duplicate customers.
 *
 * Persistence of the returned id is the caller's responsibility (stored in the
 * Subscription.metadata it is about to write) so this stays write-model-agnostic.
 */
export async function ensureStripeCustomer(
  stripe: Stripe,
  prisma: BillingPrisma,
  log: LoggerLike,
  args: { tenantId: string; accountId: string; name?: string; email?: string }
): Promise<string> {
  const existing = await findStoredStripeCustomerId(prisma, args.tenantId, args.accountId);
  if (existing) return existing;

  const customer = await stripe.customers.create(
    {
      name: args.name,
      email: args.email,
      metadata: { tenantId: args.tenantId, accountId: args.accountId, source: 'nexus-billing' },
    },
    // Idempotent per (tenant, account): a retry returns the same customer.
    { idempotencyKey: `nexus_cust_${args.tenantId}_${args.accountId}` }
  );
  log.info({ tenantId: args.tenantId, accountId: args.accountId, stripeCustomerId: customer.id }, 'Provisioned Stripe customer');
  return customer.id;
}

/**
 * Ensures a Stripe Price exists for a plan. Uses `plan.stripePriceId` when set;
 * otherwise creates a recurring Price (with an inline product) from the plan's
 * amount/currency/interval, persists it back to `plan.stripePriceId`, and returns
 * it. Idempotent on the plan definition.
 */
export async function ensureStripePrice(
  stripe: Stripe,
  prisma: BillingPrisma,
  log: LoggerLike,
  tenantId: string,
  plan: StripePlanRef
): Promise<string> {
  if (plan.stripePriceId && plan.stripePriceId.length > 0) return plan.stripePriceId;

  const recurring = toStripeRecurring(plan.interval);
  const unitAmount = toMinorUnits(plan.amount);
  const currency = (plan.currency || 'USD').toLowerCase();

  const price = await stripe.prices.create(
    {
      unit_amount: unitAmount,
      currency,
      recurring,
      product_data: { name: plan.name || `Nexus plan ${plan.id}` },
      metadata: { tenantId, planId: plan.id, source: 'nexus-billing' },
    },
    { idempotencyKey: `nexus_price_${plan.id}_${unitAmount}_${currency}_${recurring.interval}${recurring.interval_count}` }
  );

  // Persist for reuse. Explicit tenant scope (poller/consumer run without ALS).
  try {
    await prisma.plan.updateMany({
      where: { id: plan.id, tenantId },
      data: { stripePriceId: price.id },
    });
  } catch (err) {
    log.warn({ err, planId: plan.id, stripePriceId: price.id }, 'Failed to persist stripePriceId on plan (will re-create next time)');
  }
  log.info({ planId: plan.id, stripePriceId: price.id }, 'Provisioned Stripe price for plan');
  return price.id;
}

export interface ProvisionResult {
  stripeSubId: string | null;
  stripeCustomerId: string | null;
  stripeStatus: string | null;
  stripeLatestInvoiceId: string | null;
}

/**
 * Provisions a real Stripe Subscription for a finance-mirrored subscription.
 *
 * - Ensures customer + price exist (idempotent).
 * - Creates the subscription with `payment_behavior: 'default_incomplete'` so the
 *   "no card yet" path is graceful: Stripe leaves the subscription `incomplete`
 *   and produces an open invoice/PaymentIntent that can be paid once a payment
 *   method is attached (and later retried by dunning).
 * - Idempotent on the finance subscription id via a Stripe idempotency key, so a
 *   re-delivered finance event never double-provisions.
 */
export async function provisionStripeSubscription(
  stripe: Stripe,
  prisma: BillingPrisma,
  log: LoggerLike,
  args: {
    tenantId: string;
    accountId: string;
    financeSubscriptionId: string;
    plan: StripePlanRef;
    quantity?: number;
  }
): Promise<ProvisionResult> {
  const stripeCustomerId = await ensureStripeCustomer(stripe, prisma, log, {
    tenantId: args.tenantId,
    accountId: args.accountId,
  });
  const priceId = await ensureStripePrice(stripe, prisma, log, args.tenantId, args.plan);

  const subscription = await stripe.subscriptions.create(
    {
      customer: stripeCustomerId,
      items: [{ price: priceId, quantity: Math.max(1, Math.trunc(args.quantity ?? 1)) }],
      // Graceful "no card yet": subscription stays `incomplete` with an open
      // invoice rather than failing when no default payment method exists.
      payment_behavior: 'default_incomplete',
      collection_method: 'charge_automatically',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      metadata: {
        tenantId: args.tenantId,
        accountId: args.accountId,
        financeSubscriptionId: args.financeSubscriptionId,
        source: 'nexus-billing',
      },
      expand: ['latest_invoice'],
    },
    { idempotencyKey: `nexus_sub_${args.financeSubscriptionId}` }
  );

  const latest = subscription.latest_invoice;
  const latestInvoiceId = typeof latest === 'string' ? latest : latest?.id ?? null;

  log.info(
    { financeSubscriptionId: args.financeSubscriptionId, stripeSubId: subscription.id, stripeStatus: subscription.status },
    'Provisioned Stripe subscription'
  );

  return {
    stripeSubId: subscription.id,
    stripeCustomerId,
    stripeStatus: subscription.status,
    stripeLatestInvoiceId: latestInvoiceId,
  };
}

export interface DunningChargeResult {
  attempted: boolean; // did we make a real Stripe call?
  recovered: boolean; // did the invoice get paid?
  stripePaymentIntentId: string | null;
  amountPaid: string | null; // major units, 2dp
  currency: string | null;
}

/**
 * Attempts to collect payment for a subscription's outstanding Stripe invoice as
 * part of dunning. Calls `stripe.invoices.pay()` (which charges the customer's
 * default payment method) with a per-attempt idempotency key so a retried tick
 * never double-charges. Returns whether the invoice is now paid.
 *
 * Only invoices that carry a `stripeInvoiceId` can be retried against Stripe;
 * locally-only renewal invoices (no Stripe mirror) return `attempted:false` so
 * the caller falls back to the event-only retry path.
 */
export async function attemptDunningCharge(
  stripe: Stripe,
  prisma: BillingPrisma,
  log: LoggerLike,
  args: { tenantId: string; subscriptionId: string; attempt: number; now: Date }
): Promise<DunningChargeResult> {
  const none: DunningChargeResult = {
    attempted: false,
    recovered: false,
    stripePaymentIntentId: null,
    amountPaid: null,
    currency: null,
  };

  const invoice = await prisma.invoice.findFirst({
    where: {
      tenantId: args.tenantId,
      subscriptionId: args.subscriptionId,
      status: { in: ['OPEN', 'PAST_DUE'] },
      stripeInvoiceId: { not: null },
      deletedAt: null,
    },
    orderBy: { dueDate: 'asc' },
  });
  if (!invoice?.stripeInvoiceId) return none;

  try {
    const paid = await stripe.invoices.pay(
      invoice.stripeInvoiceId,
      {},
      { idempotencyKey: `nexus_dun_${invoice.id}_${args.attempt}` }
    );

    const pi = paid.payment_intent;
    const stripePaymentIntentId = typeof pi === 'string' ? pi : pi?.id ?? null;

    if (paid.status === 'paid') {
      // Reconcile: mark local invoice PAID (idempotent — only if not already),
      // and record a COMPLETED payment for auditability. Webhook path is a no-op
      // afterwards because it checks `status !== 'PAID'` (no double-marking).
      await prisma.invoice.updateMany({
        where: { id: invoice.id, tenantId: args.tenantId, status: { in: ['OPEN', 'PAST_DUE'] } },
        data: { status: 'PAID', paidAt: args.now },
      });

      if (stripePaymentIntentId) {
        const existingPayment = await prisma.payment.findFirst({
          where: { tenantId: args.tenantId, stripePaymentIntentId },
        });
        if (!existingPayment) {
          await prisma.payment.create({
            data: {
              tenantId: args.tenantId,
              invoiceId: invoice.id,
              amount: money(toDecimal((paid.amount_paid ?? 0) / 100)).toFixed(2),
              currency: (paid.currency ?? invoice.currency ?? 'usd').toUpperCase(),
              method: 'STRIPE',
              status: 'COMPLETED',
              stripePaymentIntentId,
              completedAt: args.now,
              metadata: { source: 'dunning.invoice.pay', dunningAttempt: args.attempt },
            },
          });
        }
      }

      return {
        attempted: true,
        recovered: true,
        stripePaymentIntentId,
        amountPaid: money(toDecimal((paid.amount_paid ?? 0) / 100)).toFixed(2),
        currency: (paid.currency ?? invoice.currency ?? 'usd').toUpperCase(),
      };
    }

    // Invoice still open/uncollectible after the attempt — a genuine retry that
    // did not recover. Caller continues the dunning schedule.
    return { attempted: true, recovered: false, stripePaymentIntentId, amountPaid: null, currency: null };
  } catch (err) {
    // Card declines surface as StripeCardError; treat any pay() failure as a
    // non-recovering attempt so the dunning schedule advances normally.
    log.warn({ err, invoiceId: invoice.id, subscriptionId: args.subscriptionId }, 'Dunning invoices.pay() failed');
    return { attempted: true, recovered: false, stripePaymentIntentId: null, amountPaid: null, currency: null };
  }
}
