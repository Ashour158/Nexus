import type { NexusProducer } from '@nexus/kafka';
import type { WorkflowPrisma } from '../prisma.js';
import { createExecutionsService } from './executions.service.js';

/**
 * Scheduled / cron workflow trigger.
 *
 * Workflows only ever started from domain events (see trigger.consumer.ts).
 * This adds time-based starts: any active WorkflowTemplate whose
 * `trigger === 'schedule'` is fired on a timer when it becomes due.
 *
 * Supported schedule formats — declared on the template's
 * `triggerConditions.schedule` object (Node built-ins only, no cron dep):
 *
 *   1. Fixed interval, in minutes:
 *        { "schedule": { "intervalMinutes": 15 } }
 *      Fires every N minutes (minimum 1).
 *
 *   2. Daily at a fixed local time (24h HH:MM):
 *        { "schedule": { "dailyAt": "09:30" } }
 *      Fires once per day at that wall-clock time (server local time).
 *
 * `triggerConditions` may still carry the normal `{ rules, match }` filter used
 * by the event trigger; it is honoured against the synthetic payload.
 *
 * Idempotency / restart safety:
 *   Each due template's `nextRunAt` is computed and persisted, and firing is
 *   claimed with a conditional `updateMany` on the *current* `nextRunAt`. Only
 *   one tick (across restarts / overlapping runs) wins the claim, so a schedule
 *   never double-fires. `lastRunAt` records the last successful start.
 *
 * Guards (mirroring startSlaScanner / the resumeAt poller in index.ts):
 *   - setInterval + .unref() so the timer never keeps the process alive.
 *   - A reentrancy guard skips a tick if the previous one is still running.
 *   - The whole tick body is try/caught; a transient failure just logs.
 */

interface ScheduleConfig {
  intervalMinutes?: number;
  dailyAt?: string; // "HH:MM" 24h, server local time
}

function parseSchedule(triggerConditions: unknown): ScheduleConfig | null {
  if (!triggerConditions || typeof triggerConditions !== 'object') return null;
  const sched = (triggerConditions as { schedule?: unknown }).schedule;
  if (!sched || typeof sched !== 'object') return null;
  const s = sched as Record<string, unknown>;

  if (typeof s.intervalMinutes === 'number' && Number.isFinite(s.intervalMinutes)) {
    const minutes = Math.max(1, Math.floor(s.intervalMinutes));
    return { intervalMinutes: minutes };
  }
  if (typeof s.dailyAt === 'string' && /^\d{1,2}:\d{2}$/.test(s.dailyAt.trim())) {
    return { dailyAt: s.dailyAt.trim() };
  }
  return null;
}

/**
 * Compute the next fire time strictly after `from` for the given schedule.
 * Returns null if the schedule is unparseable.
 */
export function computeNextRunAt(
  schedule: ScheduleConfig,
  from: Date = new Date()
): Date | null {
  if (schedule.intervalMinutes) {
    return new Date(from.getTime() + schedule.intervalMinutes * 60_000);
  }
  if (schedule.dailyAt) {
    const [hStr, mStr] = schedule.dailyAt.split(':');
    const hour = Number(hStr);
    const minute = Number(mStr);
    if (
      !Number.isInteger(hour) || hour < 0 || hour > 23 ||
      !Number.isInteger(minute) || minute < 0 || minute > 59
    ) {
      return null;
    }
    const next = new Date(from);
    next.setSeconds(0, 0);
    next.setHours(hour, minute, 0, 0);
    if (next.getTime() <= from.getTime()) {
      next.setDate(next.getDate() + 1); // already passed today → tomorrow
    }
    return next;
  }
  return null;
}

export function startScheduleTrigger(
  prisma: WorkflowPrisma,
  producer: NexusProducer,
  logger: { warn: (obj: unknown, msg?: string) => void; info?: (obj: unknown, msg?: string) => void },
  intervalMs = Number(process.env.WORKFLOW_SCHEDULE_TICK_MS ?? '60000')
): NodeJS.Timeout {
  const executions = createExecutionsService(prisma, producer);
  const tickMs = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 60_000;
  let running = false; // reentrancy guard

  const tick = async () => {
    if (running) return; // previous tick still in flight — skip
    running = true;
    try {
      const now = new Date();
      const templates = await prisma.workflowTemplate.findMany({
        where: { trigger: 'schedule', isActive: true },
        select: { id: true, tenantId: true, triggerConditions: true, nextRunAt: true },
        take: 200,
      });

      for (const tpl of templates) {
        const schedule = parseSchedule(tpl.triggerConditions);
        if (!schedule) continue; // trigger === 'schedule' but no valid schedule config

        // Backfill nextRunAt on first sight so it isn't fired immediately.
        if (!tpl.nextRunAt) {
          const seeded = computeNextRunAt(schedule, now);
          if (seeded) {
            await prisma.workflowTemplate.updateMany({
              where: { id: tpl.id, nextRunAt: null },
              data: { nextRunAt: seeded },
            });
          }
          continue;
        }

        if (tpl.nextRunAt.getTime() > now.getTime()) continue; // not due yet

        // Idempotency: atomically claim this fire by advancing nextRunAt only if
        // it still equals the value we read. Whoever wins the claim runs it.
        const upcoming = computeNextRunAt(schedule, now);
        if (!upcoming) continue;
        const claim = await prisma.workflowTemplate.updateMany({
          where: { id: tpl.id, nextRunAt: tpl.nextRunAt },
          data: { nextRunAt: upcoming, lastRunAt: now },
        });
        if (claim.count === 0) continue; // lost the race — another tick fired it

        try {
          const payload: Record<string, unknown> = {
            scheduledAt: now.toISOString(),
            workflowId: tpl.id,
            trigger: 'schedule',
          };
          // Reuse the exact start path the event trigger uses.
          const execution = await executions.createExecution(
            tpl.tenantId,
            tpl.id,
            'schedule',
            payload
          );
          await executions.runExecution(execution.id);
        } catch (err) {
          logger.warn({ err, workflowId: tpl.id }, 'Scheduled workflow start failed');
        }
      }
    } catch (err) {
      logger.warn({ err }, 'Schedule trigger tick failed');
    } finally {
      running = false;
    }
  };

  const handle = setInterval(() => {
    void tick();
  }, tickMs);
  if (typeof handle.unref === 'function') handle.unref();
  return handle;
}
