import { runCrossTenant } from '@nexus/service-utils/prisma-tenant';
import type { ActivitiesPrisma } from '../prisma.js';
import { ActivityStatus } from '../../../../node_modules/.prisma/activities-client/index.js';
import { NexusProducer, TOPICS } from '@nexus/kafka';

/**
 * Due-date reminder + overdue/SLA poller (additive, FAIL-OPEN).
 *
 * Periodically scans PLANNED / IN_PROGRESS activities and:
 *
 *  1. Reminders — for each activity whose reminder time has arrived and which has
 *     not yet been reminded, emits a `notification.created` event on
 *     {@link TOPICS.NOTIFICATIONS} (so the owner is nudged) and stamps
 *     `reminderSentAt`. The reminder time is `dueDate` minus a configurable lead
 *     window (there is no explicit per-activity reminder column in the schema).
 *
 *  2. Overdue — for each activity past its `dueDate` that has not yet been flagged
 *     overdue, emits an `activity.overdue` event on {@link TOPICS.ACTIVITIES} (so
 *     downstream can escalate) and stamps `overdueNotifiedAt`.
 *
 * Recurring activities are intentionally NOT handled here: the Activity schema has
 * no recurrence-rule / frequency column, so there is nothing to recur from.
 *
 * SAFETY:
 *  - The whole tick is wrapped in try/catch; a failing tick logs a warning and
 *    returns. It never throws out of the interval callback.
 *  - A reentrancy guard skips overlapping ticks while one is in flight.
 *  - The interval is `unref()`d so it never keeps the process alive on shutdown.
 *  - Emission is idempotent: the `reminderSentAt` / `overdueNotifiedAt` stamp is
 *    persisted BEFORE (well, immediately after) the publish, and the scan filters
 *    on `... = null`, so a restart or overlapping tick can never double-send.
 *  - Per-row failures are swallowed so one bad activity can't stall the tick.
 *  - Batched + capped so a large backlog can't monopolise the DB.
 */

const DEFAULT_INTERVAL_MS = Number(process.env.ACTIVITIES_REMINDER_POLL_MS ?? 60_000);
// How far before dueDate a reminder fires (there is no explicit reminder column).
const DEFAULT_LEAD_MS = Number(process.env.ACTIVITIES_REMINDER_LEAD_MS ?? 15 * 60_000);
const MAX_PER_TICK = Number(process.env.ACTIVITIES_REMINDER_BATCH ?? 500);

const ACTIVE_STATUSES: ActivityStatus[] = [ActivityStatus.PLANNED, ActivityStatus.IN_PROGRESS];

export interface RemindersPoller {
  stop(): void;
  /** Exposed for tests: run a single pass, returning how many of each were emitted. */
  runOnce(): Promise<{ reminded: number; overdue: number }>;
}

interface ScanRow {
  id: string;
  tenantId: string;
  ownerId: string;
  type: string;
  subject: string;
  dueDate: Date | null;
}

async function emitReminders(
  prisma: ActivitiesPrisma,
  producer: NexusProducer,
  leadMs: number
): Promise<number> {
  const now = Date.now();
  // Reminder fires when now >= dueDate - leadMs, i.e. dueDate <= now + leadMs.
  const cutoff = new Date(now + leadMs);
  const rows = (await prisma.activity.findMany({
    where: {
      deletedAt: null,
      status: { in: ACTIVE_STATUSES },
      reminderSentAt: null,
      dueDate: { not: null, lte: cutoff },
    },
    select: { id: true, tenantId: true, ownerId: true, type: true, subject: true, dueDate: true },
    take: MAX_PER_TICK,
    orderBy: { dueDate: 'asc' },
  })) as ScanRow[];

  let count = 0;
  for (const a of rows) {
    if (!a.dueDate) continue;
    try {
      // Stamp first so a crash after publish never resends; the scan filters on
      // `reminderSentAt = null`, and updateMany is a no-op if a concurrent tick
      // already claimed it (idempotent). Only publish for rows we actually claim.
      const claimed = await prisma.activity.updateMany({
        where: { id: a.id, reminderSentAt: null },
        data: { reminderSentAt: new Date() },
      });
      if (claimed.count === 0) continue;

      await producer.publish(TOPICS.NOTIFICATIONS, {
        type: 'notification.created',
        tenantId: a.tenantId,
        payload: {
          userId: a.ownerId,
          notificationType: 'ACTIVITY_REMINDER',
          title: `Reminder: ${a.subject}`,
          body: `Your ${a.type.toLowerCase()} "${a.subject}" is due ${a.dueDate.toISOString()}.`,
          entityType: 'activity',
          entityId: a.id,
          actionUrl: `/activities/${a.id}`,
        },
      });
      count += 1;
    } catch {
      // Never let a single row abort the scan. The stamp is already set, so this
      // reminder won't retry — acceptable for a best-effort nudge and avoids the
      // opposite (double-send) failure mode.
    }
  }
  return count;
}

async function emitOverdue(prisma: ActivitiesPrisma, producer: NexusProducer): Promise<number> {
  const now = new Date();
  const rows = (await prisma.activity.findMany({
    where: {
      deletedAt: null,
      status: { in: ACTIVE_STATUSES },
      overdueNotifiedAt: null,
      dueDate: { not: null, lt: now },
    },
    select: { id: true, tenantId: true, ownerId: true, type: true, subject: true, dueDate: true },
    take: MAX_PER_TICK,
    orderBy: { dueDate: 'asc' },
  })) as ScanRow[];

  let count = 0;
  for (const a of rows) {
    if (!a.dueDate) continue;
    try {
      const claimed = await prisma.activity.updateMany({
        where: { id: a.id, overdueNotifiedAt: null },
        data: { overdueNotifiedAt: new Date() },
      });
      if (claimed.count === 0) continue;

      const overdueMs = now.getTime() - a.dueDate.getTime();
      await producer.publish(TOPICS.ACTIVITIES, {
        type: 'activity.overdue',
        tenantId: a.tenantId,
        payload: {
          activityId: a.id,
          ownerId: a.ownerId,
          activityType: a.type,
          subject: a.subject,
          dueDate: a.dueDate.toISOString(),
          overdueMinutes: Math.floor(overdueMs / 60_000),
          detectedAt: now.toISOString(),
        },
      });
      count += 1;
    } catch {
      // Swallow per-row failures; the stamp already prevents re-emission.
    }
  }
  return count;
}

/**
 * Starts the reminders + overdue poller. Returns a handle to stop it. Guarded so a
 * failed start (or any tick) can never break the service — callers should treat a
 * thrown start as non-fatal.
 */
export function startRemindersPoller(
  prisma: ActivitiesPrisma,
  producer: NexusProducer,
  opts: { intervalMs?: number; leadMs?: number } = {}
): RemindersPoller {
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  const leadMs = opts.leadMs ?? DEFAULT_LEAD_MS;
  let running = false;

  const runOnce = async (): Promise<{ reminded: number; overdue: number }> => {
    try {
      const [reminded, overdue] = await Promise.all([
        emitReminders(prisma, producer, leadMs),
        emitOverdue(prisma, producer),
      ]);
      return { reminded, overdue };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[activities-reminders] poll tick failed; continuing', err);
      return { reminded: 0, overdue: 0 };
    }
  };

  const timer = setInterval(() => {
    if (running) return; // reentrancy guard: skip overlapping ticks
    running = true;
    void runCrossTenant('activity reminder sweep scans due activities across all tenants', runOnce).finally(() => {
      running = false;
    });
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();

  return {
    stop() {
      clearInterval(timer);
    },
    runOnce,
  };
}
