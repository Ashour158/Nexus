import { Decimal } from 'decimal.js';
import { NexusProducer, TOPICS } from '@nexus/kafka';
import type { BillingPrisma } from '../prisma.js';
import { aggregateUnbilledUsage, computeInvoiceBalance, money, toDecimal } from './billing-math.js';

/**
 * Subscription lifecycle poller (COM-05): renewals + dunning.
 *
 * FAIL-SAFE + reentrancy-guarded, mirroring quote-expiry.poller. Every mutation
 * is *claimed* with `updateMany(where: <expected precondition>)` so a concurrent
 * tick / restart that already acted sees `count === 0` and never double-fires.
 * Renewal invoices carry a deterministic number (`SUB-<sub>-<periodEnd>`) so the
 * unique `[tenantId, number]` constraint makes re-invoicing a period a no-op.
 *
 * Each tick performs four passes:
 *   1. detectPastDue — ACTIVE subs with an overdue unpaid invoice → PAST_DUE.
 *   2. renewals      — due periods with autoRenew → advance + invoice + emit.
 *   3. cancelAtPeriodEnd — due periods flagged to cancel → CANCELLED.
 *   4. dunning       — PAST_DUE subs → day 1/3/5/7 retries, then EXPIRE.
 *
 * No external payment API is called (Stripe is cred-gated); this models the
 * state machine + events + retry scheduling only.
 */

interface LoggerLike {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

const noopLogger: LoggerLike = {
  info: (...a) => console.info('[billing.subscription-poller]', ...a),
  warn: (...a) => console.warn('[billing.subscription-poller]', ...a),
  error: (...a) => console.error('[billing.subscription-poller]', ...a),
};

const DEFAULT_INTERVAL_MS = Number(process.env.SUBSCRIPTION_POLLER_INTERVAL_MS ?? 60 * 60 * 1000); // hourly
const MAX_PER_TICK = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

// Dunning retry schedule: days after entering PAST_DUE at which retries fire.
// After the last attempt elapses, the subscription is expired.
const DUNNING_RETRY_DAYS = [1, 3, 5, 7];

function advancePeriod(start: Date, interval: string): Date {
  const end = new Date(start);
  switch (interval.trim().toUpperCase()) {
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
    case 'DAILY':
      end.setUTCDate(end.getUTCDate() + 1);
      break;
    default:
      end.setUTCMonth(end.getUTCMonth() + 1);
  }
  return end;
}

function periodStamp(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

export interface PollerCounts {
  pastDue: number;
  renewed: number;
  cancelled: number;
  dunningRetries: number;
  expired: number;
}

export interface SubscriptionPoller {
  stop(): void;
  runOnce(): Promise<PollerCounts>;
}

// ─── Pass 1: detect overdue invoices → PAST_DUE ─────────────────────────────────
async function detectPastDue(
  prisma: BillingPrisma,
  producer: NexusProducer,
  log: LoggerLike,
  now: Date
): Promise<number> {
  const overdue = await prisma.invoice.findMany({
    where: {
      status: { in: ['OPEN', 'PAST_DUE'] },
      deletedAt: null,
      subscriptionId: { not: null },
      dueDate: { not: null, lt: now },
    },
    include: { payments: true, creditNotes: true },
    take: MAX_PER_TICK,
  });

  let count = 0;
  for (const inv of overdue) {
    try {
      const balance = computeInvoiceBalance(inv);
      if (new Decimal(balance.outstanding).lessThanOrEqualTo(0)) continue; // settled
      if (!inv.subscriptionId) continue;

      // Claim: only flip an ACTIVE/TRIALING subscription into PAST_DUE.
      const claim = await prisma.subscription.updateMany({
        where: {
          id: inv.subscriptionId,
          status: { in: ['ACTIVE', 'TRIALING'] },
          deletedAt: null,
        },
        data: { status: 'PAST_DUE', pastDueSince: now, dunningAttempts: 0, lastDunningAt: null },
      });
      if (claim.count === 0) continue;

      if (inv.status !== 'PAST_DUE') {
        await prisma.invoice.updateMany({
          where: { id: inv.id, status: 'OPEN' },
          data: { status: 'PAST_DUE' },
        });
      }
      count += 1;

      await producer.publish(TOPICS.PAYMENTS, {
        type: 'subscription.past_due',
        tenantId: inv.tenantId,
        payload: { subscriptionId: inv.subscriptionId, invoiceId: inv.id, outstanding: balance.outstanding },
      });
    } catch (err) {
      log.warn({ err, invoiceId: inv.id }, 'detectPastDue: skipping invoice');
    }
  }
  return count;
}

// ─── Pass 2: renewals ───────────────────────────────────────────────────────────
async function renewDue(
  prisma: BillingPrisma,
  producer: NexusProducer,
  log: LoggerLike,
  now: Date
): Promise<number> {
  const due = await prisma.subscription.findMany({
    where: {
      status: { in: ['ACTIVE', 'TRIALING'] },
      autoRenew: true,
      cancelAtPeriodEnd: false,
      deletedAt: null,
      currentPeriodEnd: { lte: now },
    },
    include: { plan: true },
    take: MAX_PER_TICK,
    orderBy: { currentPeriodEnd: 'asc' },
  });

  let count = 0;
  for (const sub of due) {
    try {
      const oldEnd = sub.currentPeriodEnd;
      const oldStart = sub.currentPeriodStart;
      const newStart = oldEnd;
      const newEnd = advancePeriod(oldEnd, sub.plan?.interval ?? 'MONTHLY');

      // Claim the renewal: advance ONLY if the period boundary is unchanged.
      const claim = await prisma.subscription.updateMany({
        where: {
          id: sub.id,
          currentPeriodEnd: oldEnd,
          status: { in: ['ACTIVE', 'TRIALING'] },
        },
        data: {
          currentPeriodStart: newStart,
          currentPeriodEnd: newEnd,
          status: 'ACTIVE',
        },
      });
      if (claim.count === 0) continue; // another tick already renewed it

      // Base recurring charge + metered usage for the period just ended.
      const base = money(toDecimal(sub.plan?.amount ?? 0));
      const usage = await aggregateUnbilledUsage(prisma, {
        tenantId: sub.tenantId,
        subscriptionId: sub.id,
        from: oldStart,
        to: oldEnd,
      });
      const total = money(base.plus(usage.total));

      const lineItems = [
        {
          description: `${sub.plan?.name ?? 'Subscription'} (${oldStart.toISOString().slice(0, 10)} → ${oldEnd.toISOString().slice(0, 10)})`,
          quantity: 1,
          unitPrice: base.toNumber(),
        },
        ...usage.lines.map((l) => ({
          description: `Usage: ${l.metric}`,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice),
        })),
      ];

      const number = `SUB-${sub.id}-${periodStamp(oldEnd)}`;
      let invoiceId: string | null = null;
      try {
        const invoice = await prisma.invoice.create({
          data: {
            tenantId: sub.tenantId,
            subscriptionId: sub.id,
            customerId: sub.customerId,
            number,
            amount: total.toFixed(2),
            currency: sub.plan?.currency ?? 'USD',
            status: 'OPEN',
            dueDate: newStart,
            lineItems,
          },
        });
        invoiceId = invoice.id;
      } catch (err) {
        // Unique [tenantId, number] → this period was already invoiced. Idempotent.
        if ((err as { code?: string }).code === 'P2002') {
          log.info({ subscriptionId: sub.id, number }, 'Renewal invoice already exists; skipping');
        } else {
          throw err;
        }
      }

      // Mark the metered usage records as billed against the new invoice.
      if (invoiceId && usage.recordIds.length > 0) {
        await prisma.usageRecord.updateMany({
          where: { id: { in: usage.recordIds }, billedInvoiceId: null },
          data: { billedInvoiceId: invoiceId, billedAt: now },
        });
      }

      count += 1;
      await producer.publish(TOPICS.PAYMENTS, {
        type: 'subscription.renewed',
        tenantId: sub.tenantId,
        payload: {
          subscriptionId: sub.id,
          planId: sub.planId,
          invoiceId,
          invoiceNumber: number,
          currentPeriodStart: newStart.toISOString(),
          currentPeriodEnd: newEnd.toISOString(),
          amount: total.toFixed(2),
          currency: sub.plan?.currency ?? 'USD',
        },
      });
      if (invoiceId) {
        await producer.publish(TOPICS.INVOICES, {
          type: 'invoice.created',
          tenantId: sub.tenantId,
          payload: {
            invoiceId,
            number,
            subscriptionId: sub.id,
            customerId: sub.customerId,
            amount: total.toFixed(2),
            currency: sub.plan?.currency ?? 'USD',
            source: 'subscription.renewal',
          },
        });
      }
    } catch (err) {
      log.warn({ err, subscriptionId: sub.id }, 'renewDue: skipping subscription');
    }
  }
  return count;
}

// ─── Pass 3: cancelAtPeriodEnd ──────────────────────────────────────────────────
async function cancelAtPeriodEnd(
  prisma: BillingPrisma,
  producer: NexusProducer,
  log: LoggerLike,
  now: Date
): Promise<number> {
  const due = await prisma.subscription.findMany({
    where: {
      cancelAtPeriodEnd: true,
      status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] },
      deletedAt: null,
      currentPeriodEnd: { lte: now },
    },
    take: MAX_PER_TICK,
  });

  let count = 0;
  for (const sub of due) {
    try {
      const claim = await prisma.subscription.updateMany({
        where: { id: sub.id, cancelAtPeriodEnd: true, status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } },
        data: { status: 'CANCELLED', cancelledAt: now },
      });
      if (claim.count === 0) continue;
      count += 1;
      await producer.publish(TOPICS.PAYMENTS, {
        type: 'subscription.cancelled',
        tenantId: sub.tenantId,
        payload: { subscriptionId: sub.id, reason: 'cancel_at_period_end' },
      });
    } catch (err) {
      log.warn({ err, subscriptionId: sub.id }, 'cancelAtPeriodEnd: skipping subscription');
    }
  }
  return count;
}

// ─── Pass 4: dunning ────────────────────────────────────────────────────────────
async function runDunning(
  prisma: BillingPrisma,
  producer: NexusProducer,
  log: LoggerLike,
  now: Date
): Promise<{ retries: number; expired: number }> {
  const pastDue = await prisma.subscription.findMany({
    where: { status: 'PAST_DUE', deletedAt: null },
    take: MAX_PER_TICK,
  });

  let retries = 0;
  let expired = 0;

  for (const sub of pastDue) {
    try {
      const since = sub.pastDueSince ?? sub.updatedAt;
      const daysElapsed = (now.getTime() - since.getTime()) / DAY_MS;
      const attempts = sub.dunningAttempts;

      // Terminal: all scheduled retries elapsed → expire.
      if (attempts >= DUNNING_RETRY_DAYS.length) {
        const lastDay = DUNNING_RETRY_DAYS[DUNNING_RETRY_DAYS.length - 1];
        if (daysElapsed >= lastDay) {
          const claim = await prisma.subscription.updateMany({
            where: { id: sub.id, status: 'PAST_DUE', dunningAttempts: attempts },
            data: { status: 'EXPIRED', cancelledAt: now },
          });
          if (claim.count === 0) continue;
          expired += 1;
          await producer.publish(TOPICS.PAYMENTS, {
            type: 'subscription.dunning',
            tenantId: sub.tenantId,
            payload: { subscriptionId: sub.id, phase: 'final', outcome: 'expired', attempts },
          });
          await producer.publish(TOPICS.PAYMENTS, {
            type: 'subscription.cancelled',
            tenantId: sub.tenantId,
            payload: { subscriptionId: sub.id, reason: 'dunning_exhausted' },
          });
        }
        continue;
      }

      // Is the next scheduled retry due?
      const dueDay = DUNNING_RETRY_DAYS[attempts];
      if (daysElapsed < dueDay) continue;

      // Claim the attempt increment so concurrent ticks fire it once.
      const claim = await prisma.subscription.updateMany({
        where: { id: sub.id, status: 'PAST_DUE', dunningAttempts: attempts },
        data: { dunningAttempts: attempts + 1, lastDunningAt: now },
      });
      if (claim.count === 0) continue;
      retries += 1;

      await producer.publish(TOPICS.PAYMENTS, {
        type: 'subscription.payment_retry',
        tenantId: sub.tenantId,
        payload: {
          subscriptionId: sub.id,
          attempt: attempts + 1,
          maxAttempts: DUNNING_RETRY_DAYS.length,
          scheduledDay: dueDay,
        },
      });
      await producer.publish(TOPICS.PAYMENTS, {
        type: 'subscription.dunning',
        tenantId: sub.tenantId,
        payload: {
          subscriptionId: sub.id,
          phase: 'retry',
          attempt: attempts + 1,
          maxAttempts: DUNNING_RETRY_DAYS.length,
        },
      });
    } catch (err) {
      log.warn({ err, subscriptionId: sub.id }, 'runDunning: skipping subscription');
    }
  }
  return { retries, expired };
}

async function tick(
  prisma: BillingPrisma,
  producer: NexusProducer,
  log: LoggerLike
): Promise<PollerCounts> {
  const now = new Date();
  const pastDue = await detectPastDue(prisma, producer, log, now);
  const renewed = await renewDue(prisma, producer, log, now);
  const cancelled = await cancelAtPeriodEnd(prisma, producer, log, now);
  const dunning = await runDunning(prisma, producer, log, now);
  return { pastDue, renewed, cancelled, dunningRetries: dunning.retries, expired: dunning.expired };
}

export function startSubscriptionPoller(
  prisma: BillingPrisma,
  producer: NexusProducer,
  opts: { intervalMs?: number; log?: LoggerLike } = {}
): SubscriptionPoller {
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  const log = opts.log ?? noopLogger;
  let running = false;

  const runOnce = async (): Promise<PollerCounts> => {
    const empty: PollerCounts = { pastDue: 0, renewed: 0, cancelled: 0, dunningRetries: 0, expired: 0 };
    if (running) return empty;
    running = true;
    try {
      return await tick(prisma, producer, log);
    } catch (err) {
      log.warn({ err }, 'subscription poller tick failed; continuing');
      return empty;
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => {
    void runOnce();
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();

  return {
    stop() {
      clearInterval(timer);
    },
    runOnce,
  };
}
