import type { PrismaClient } from '../../../../node_modules/.prisma/accounts-client/index.js';

/**
 * Minimal logger shape so the health service can log without depending on a
 * concrete logger implementation.
 */
interface LoggerLike {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

/**
 * The subset of a deal event we care about for health scoring. All fields are
 * optional so a malformed / partial event never throws — callers guard on
 * `accountId` before applying.
 */
export interface DealHealthEvent {
  /** Canonical event type, e.g. `deal.created` / `deal.won` / `deal.lost`. */
  type: string;
  tenantId?: string;
  accountId?: string;
  amount?: number;
}

/** Days without a won deal after which we treat the account as "gone cold". */
const WON_STALENESS_DAYS = 90;

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function num(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/**
 * Normalise a raw deal-event payload into a {@link DealHealthEvent}. Pulls
 * `accountId`, `tenantId` and `amount` from either the event root or its
 * payload, tolerating string/number variants. Returns `null` when there is no
 * usable event type.
 */
export function toDealHealthEvent(
  eventType: string | undefined,
  tenantId: string | undefined,
  payload: Record<string, unknown> | undefined
): DealHealthEvent | null {
  const type = str(eventType);
  if (!type) return null;
  const p = payload ?? {};
  return {
    type,
    tenantId: str(tenantId) ?? str(p.tenantId),
    accountId: str(p.accountId),
    amount: num(p.amount),
  };
}

/**
 * Derive a churn probability (0..1) and coarse risk level from the running
 * deal counters plus how long it has been since the last won deal.
 *
 * Heuristic (intentionally simple + explainable):
 *  - Open deals are a strong signal of life → they pull churn down.
 *  - A recent won deal pulls churn down; a stale / never-won account pulls it up.
 *  - Lost deals with nothing open nudge churn up.
 */
export function computeChurn(input: {
  openDealsCount: number;
  wonDealsCount: number;
  lostDealsCount: number;
  daysSinceWon: number | null;
}): { churnProbability: number; score: number; riskLevel: string } {
  const { openDealsCount, wonDealsCount, lostDealsCount, daysSinceWon } = input;

  let churn = 0.5; // neutral prior

  // Active pipeline is the biggest health signal.
  if (openDealsCount > 0) {
    churn -= Math.min(0.35, 0.15 + openDealsCount * 0.05);
  } else {
    churn += 0.2;
  }

  // Won history — recent wins are reassuring, stale/absent wins are not.
  if (wonDealsCount > 0 && daysSinceWon !== null) {
    if (daysSinceWon <= WON_STALENESS_DAYS) {
      churn -= 0.2;
    } else {
      churn += 0.15;
    }
  } else if (wonDealsCount === 0) {
    churn += 0.1;
  }

  // Losses with no open pipeline are a warning sign.
  if (lostDealsCount > 0 && openDealsCount === 0) {
    churn += Math.min(0.2, lostDealsCount * 0.05);
  }

  const churnProbability = Math.max(0, Math.min(1, Number(churn.toFixed(3))));
  const score = Math.round((1 - churnProbability) * 100);
  const riskLevel = churnProbability >= 0.66 ? 'high' : churnProbability >= 0.33 ? 'medium' : 'low';

  return { churnProbability, score, riskLevel };
}

/**
 * Apply a single deal event to the account's {@link AccountHealthScore},
 * upserting the row. Runs against the **base** (un-tenant-extended) Prisma
 * client and passes `tenantId` explicitly, so it is safe to call outside a
 * request context (e.g. from a Kafka consumer).
 *
 * Fully guarded: any DB/logic error is logged and swallowed so the caller's
 * consumer loop can never crash. Skips silently when the event has no
 * `accountId`.
 */
export async function applyDealHealthEvent(
  prisma: PrismaClient,
  log: LoggerLike,
  event: DealHealthEvent
): Promise<void> {
  try {
    const { tenantId, accountId, type } = event;
    if (!tenantId || !accountId) {
      // Missing anchors — nothing we can scope to. Skip.
      return;
    }

    // Only these events move the counters.
    const isCreated = type === 'deal.created';
    const isWon = type === 'deal.won';
    const isLost = type === 'deal.lost';
    const isStageChanged = type === 'deal.stage_changed';
    if (!isCreated && !isWon && !isLost && !isStageChanged) return;

    // Ensure the account exists and belongs to this tenant before we create a
    // health row for it (defends against cross-tenant / orphan events).
    const account = await prisma.account.findFirst({
      where: { id: accountId, tenantId },
      select: { id: true },
    });
    if (!account) {
      log.warn(
        { tenantId, accountId, type },
        'accounts health: deal event for unknown account, skipping'
      );
      return;
    }

    const existing = await prisma.accountHealthScore.findUnique({
      where: { accountId },
    });

    // A stage change on its own does not change won/lost/open totals here (the
    // deals-service owns open/closed transitions), so we only re-score.
    let openDealsCount = existing?.openDealsCount ?? 0;
    let wonDealsCount = existing?.wonDealsCount ?? 0;
    let lostDealsCount = existing?.lostDealsCount ?? 0;
    let lastWonAt: Date | null =
      (existing?.signals as Record<string, unknown> | null)?.lastWonAt != null
        ? new Date(String((existing!.signals as Record<string, unknown>).lastWonAt))
        : null;

    const now = new Date();

    if (isCreated) {
      openDealsCount += 1;
    } else if (isWon) {
      wonDealsCount += 1;
      openDealsCount = Math.max(0, openDealsCount - 1);
      lastWonAt = now;
    } else if (isLost) {
      lostDealsCount += 1;
      openDealsCount = Math.max(0, openDealsCount - 1);
    }

    const daysSinceWon =
      lastWonAt != null
        ? Math.max(0, Math.floor((now.getTime() - lastWonAt.getTime()) / 86_400_000))
        : null;

    const { churnProbability, score, riskLevel } = computeChurn({
      openDealsCount,
      wonDealsCount,
      lostDealsCount,
      daysSinceWon,
    });

    const signals = {
      lastWonAt: lastWonAt ? lastWonAt.toISOString() : null,
      lastEventType: type,
      lastAmount: event.amount ?? null,
      lastScoredAt: now.toISOString(),
    };

    await prisma.accountHealthScore.upsert({
      where: { accountId },
      create: {
        tenantId,
        accountId,
        openDealsCount,
        wonDealsCount,
        lostDealsCount,
        churnProbability,
        score,
        riskLevel,
        signals,
        scoredAt: now,
      },
      update: {
        openDealsCount,
        wonDealsCount,
        lostDealsCount,
        churnProbability,
        score,
        riskLevel,
        signals,
        scoredAt: now,
      },
    });

    log.info(
      { tenantId, accountId, type, openDealsCount, wonDealsCount, lostDealsCount, churnProbability },
      'accounts health: updated'
    );
  } catch (err) {
    // Never rethrow — a DB hiccup must not crash the consumer loop.
    log.error({ err, event }, 'accounts health: applyDealHealthEvent failed (suppressed)');
  }
}
