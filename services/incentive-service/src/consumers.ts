import type { NexusConsumer } from '@nexus/kafka';
import { TOPICS } from '@nexus/kafka';
import type { createContestsService } from './services/contests.service.js';
import type { createBadgesService } from './services/badges.service.js';
import type { createMetricsService } from './services/metrics.service.js';
import type { createCommissionService } from './services/commission.service.js';

type Contests = ReturnType<typeof createContestsService>;
type Badges = ReturnType<typeof createBadgesService>;
type Metrics = ReturnType<typeof createMetricsService>;
type Commission = ReturnType<typeof createCommissionService>;

interface IncentiveEvent {
  type: string;
  tenantId: string;
  timestamp?: string;
  payload?: unknown;
}

function eventDay(event: IncentiveEvent): string {
  const ts = typeof event.timestamp === 'string' ? Date.parse(event.timestamp) : NaN;
  const d = Number.isNaN(ts) ? new Date() : new Date(ts);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

/**
 * Run one event handler with full isolation: a failure (bad payload, DB down,
 * etc.) is logged and swallowed so it can neither crash the consumer loop nor
 * block sibling handlers. This is the "guard, log, continue" contract.
 */
async function guard(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(`[incentive] handler "${label}" failed:`, err instanceof Error ? err.message : err);
  }
}

/**
 * Registers the event-driven contest/badge handlers on an already-constructed
 * consumer. The caller owns subscribe()/start(); this only wires `.on(...)`.
 *
 * Events → contest metrics:
 *   deal.won          → DEALS_WON_COUNT (+1), DEALS_WON_REVENUE (+amount), NEW_LOGOS (+1)
 *   lead.converted    → LEADS_CONVERTED (+1)
 *   activity.completed→ ACTIVITIES_COMPLETED (+1)
 *
 * Events → badge counters (MetricCounter) then checkAndAward:
 *   lead.created      → LEADS_CREATED (cumulative)
 *   lead.converted    → LEADS_CONVERTED (cumulative)
 *   activity.created  → ACTIVITY_STREAK (consecutive-day)
 *   activity.completed→ ACTIVITIES_COMPLETED (cumulative)
 */
export function registerIncentiveConsumers(
  consumer: NexusConsumer,
  deps: { contests: Contests; badges: Badges; metrics: Metrics; commission: Commission },
): void {
  const { contests, badges, metrics, commission } = deps;

  // ── deal.won: keep legacy badge path AND drive contests + NEW_LOGOS ────────
  consumer.on('deal.won', async (event) => {
    const e = event as unknown as IncentiveEvent;
    const payload = (e.payload ?? {}) as {
      ownerId?: string;
      amount?: number | string;
      dealId?: string;
      id?: string;
      currency?: string;
      productId?: string;
      ownerRole?: string;
      marginAmount?: number | string;
      // Deal-team splits emitted by crm-service on won deals. Optional: absent on
      // legacy events / deals with no team → commission falls back to owner-100%.
      teamSplits?: Array<{
        userId?: string;
        role?: string;
        splitType?: string;
        splitPercent?: number | string;
      }>;
    };
    if (!e.tenantId || !payload.ownerId) return;
    const amount = Number(payload.amount ?? 0);

    // Badge path. The legacy code passed a hardcoded count of 1 on every win,
    // so cumulative badges (deal_10 = gte 10) could never fire. Track a running
    // count so those award correctly; first_deal (gte 1) still awards on win 1.
    await guard('deal.won:badges', async () => {
      const totalWon = await metrics.increment(e.tenantId, payload.ownerId!, 'DEALS_WON_COUNT', 1);
      await badges.checkAndAward(e.tenantId, payload.ownerId!, 'DEALS_WON_COUNT', totalWon);
      // 'DEAL_VALUE' is the legacy metric key; 'DEALS_WON_REVENUE' matches the
      // seeded big_deal badge condition. Both are checked so neither regresses.
      await badges.checkAndAward(e.tenantId, payload.ownerId!, 'DEAL_VALUE', amount);
      await badges.checkAndAward(e.tenantId, payload.ownerId!, 'DEALS_WON_REVENUE', amount);
    });

    // Contest metrics.
    await guard('deal.won:contests', async () => {
      await contests.applyEvent(e.tenantId, 'DEALS_WON_COUNT', payload.ownerId!, 1);
      if (amount > 0) await contests.applyEvent(e.tenantId, 'DEALS_WON_REVENUE', payload.ownerId!, amount);
      await contests.applyEvent(e.tenantId, 'NEW_LOGOS', payload.ownerId!, 1);
    });

    // Commission: compute + persist a statement for the won deal. Idempotent
    // per [tenantId, dealId], so a replayed deal.won will not double-write.
    await guard('deal.won:commission', async () => {
      const dealId = payload.dealId ?? payload.id;
      if (!dealId) return; // no deal identity → cannot make an idempotent statement
      await commission.computeForWonDeal(e.tenantId, {
        dealId,
        ownerId: payload.ownerId!,
        amount,
        currency: payload.currency,
        productId: payload.productId,
        ownerRole: payload.ownerRole,
        marginAmount: payload.marginAmount,
        occurredAt: e.timestamp,
        // When present with ≥1 valid REVENUE split, commission is credited per
        // revenue-split member; otherwise the engine falls back to owner-100%.
        teamSplits: payload.teamSplits
          ?.filter((s): s is { userId: string; role?: string; splitType?: string; splitPercent?: number | string } =>
            typeof s?.userId === 'string',
          )
          .map((s) => ({
            userId: s.userId,
            role: s.role,
            splitType: s.splitType,
            splitPercent: s.splitPercent,
          })),
      });
    });
  });

  // ── deal.created: wired for completeness. There is no ContestMetric for
  // "deals created" today, so this is an intentional no-op placeholder; when
  // such a metric is added, incrementing it here is a one-line change.
  consumer.on('deal.created', async () => {
    /* no-op: no matching contest metric yet */
  });

  // ── lead.created: cumulative counter → LEADS_CREATED badges ────────────────
  consumer.on('lead.created', async (event) => {
    const e = event as unknown as IncentiveEvent;
    const payload = (e.payload ?? {}) as { ownerId?: string };
    if (!e.tenantId || !payload.ownerId) return;
    await guard('lead.created:badges', async () => {
      const total = await metrics.increment(e.tenantId, payload.ownerId!, 'LEADS_CREATED', 1);
      await badges.checkAndAward(e.tenantId, payload.ownerId!, 'LEADS_CREATED', total);
    });
  });

  // ── lead.converted: contest metric + cumulative counter → LEADS_CONVERTED ──
  consumer.on('lead.converted', async (event) => {
    const e = event as unknown as IncentiveEvent;
    const payload = (e.payload ?? {}) as { ownerId?: string };
    if (!e.tenantId || !payload.ownerId) return;
    await guard('lead.converted:contests', async () => {
      await contests.applyEvent(e.tenantId, 'LEADS_CONVERTED', payload.ownerId!, 1);
    });
    await guard('lead.converted:badges', async () => {
      const total = await metrics.increment(e.tenantId, payload.ownerId!, 'LEADS_CONVERTED', 1);
      await badges.checkAndAward(e.tenantId, payload.ownerId!, 'LEADS_CONVERTED', total);
    });
  });

  // ── activity.created: consecutive-day streak → ACTIVITY_STREAK badges ──────
  consumer.on('activity.created', async (event) => {
    const e = event as unknown as IncentiveEvent;
    const payload = (e.payload ?? {}) as { ownerId?: string };
    if (!e.tenantId || !payload.ownerId) return;
    await guard('activity.created:streak', async () => {
      const streak = await metrics.recordStreak(e.tenantId, payload.ownerId!, eventDay(e));
      await badges.checkAndAward(e.tenantId, payload.ownerId!, 'ACTIVITY_STREAK', streak);
    });
  });

  // ── activity.completed: contest metric + cumulative counter → badges ───────
  consumer.on('activity.completed', async (event) => {
    const e = event as unknown as IncentiveEvent;
    const payload = (e.payload ?? {}) as { ownerId?: string };
    if (!e.tenantId || !payload.ownerId) return;
    await guard('activity.completed:contests', async () => {
      await contests.applyEvent(e.tenantId, 'ACTIVITIES_COMPLETED', payload.ownerId!, 1);
    });
    await guard('activity.completed:badges', async () => {
      const total = await metrics.increment(e.tenantId, payload.ownerId!, 'ACTIVITIES_COMPLETED', 1);
      await badges.checkAndAward(e.tenantId, payload.ownerId!, 'ACTIVITIES_COMPLETED', total);
    });
  });
}

/** Topics the incentive service must subscribe to for event-driven metrics. */
export const INCENTIVE_TOPICS = [TOPICS.DEALS, TOPICS.LEADS, TOPICS.ACTIVITIES] as const;
