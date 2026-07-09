/**
 * CommandCenter journey progression engine + scheduler.
 *
 * A JourneyEnrollment advances step-by-step through its journey's ordered steps.
 * WAIT steps park the enrollment (`resumeAt`); a guarded scheduler picks up due
 * enrollments and advances them. Everything is idempotent + fail-open: a failing
 * step marks the single enrollment FAILED and the scheduler keeps running.
 *
 * Reuse:
 *   - Step side-effects run through the shared workflow node handlers
 *     (see journey-steps.ts → handleActionNode / handleEmailNode / …).
 *   - The scheduler mirrors the idempotent claim + guard pattern of
 *     schedule-trigger.ts / the paused-resume poller in index.ts:
 *     setInterval + unref + reentrancy guard + env-configurable tick, and an
 *     atomic `updateMany` claim so no enrollment is advanced twice.
 */
import type { NexusProducer } from '@nexus/kafka';
import type { WorkflowPrisma } from '../prisma.js';
import type { ExecutionContext } from '../engine/types.js';
import {
  executeJourneyStep,
  evaluateRuleSet,
  parseSteps,
  type JourneyStep,
} from '../engine/journey-steps.js';

const JOURNEY_TOPIC = 'nexus.automation.workflows';

type Logger = {
  warn: (obj: unknown, msg?: string) => void;
  info?: (obj: unknown, msg?: string) => void;
};

// Max steps advanced in a single scheduler pass for one enrollment, so a badly
// linked journey (loop of instantaneous steps) cannot spin forever in one tick.
const MAX_STEPS_PER_PASS = 50;

function stepMap(steps: JourneyStep[]): Map<string, JourneyStep> {
  return new Map(steps.map((s) => [s.id, s]));
}

async function emit(
  producer: NexusProducer,
  type: string,
  tenantId: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    await producer.publish(JOURNEY_TOPIC, { type, tenantId, payload });
  } catch {
    // Event emission is best-effort — never let it fail progression.
  }
}

/**
 * Advance a single ACTIVE enrollment as far as it can go right now (until it
 * hits a WAIT, completes/exits, or fails). Idempotent: the caller claims the
 * enrollment (resumeAt) before invoking this; each step transition is persisted.
 */
export async function advanceEnrollment(
  prisma: WorkflowPrisma,
  producer: NexusProducer,
  enrollmentId: string,
  logger: Logger
): Promise<void> {
  const enrollment = await prisma.commandJourneyEnrollment.findUnique({
    where: { id: enrollmentId },
    include: { journey: true },
  });
  if (!enrollment || enrollment.status !== 'ACTIVE') return;

  const journey = enrollment.journey;
  // A journey that is no longer ACTIVE stops progressing its enrollments.
  if (journey.status !== 'ACTIVE') return;

  const steps = parseSteps(journey.steps);
  const byId = stepMap(steps);
  const context = (enrollment.context ?? {}) as Record<string, unknown>;

  const exec: ExecutionContext = {
    tenantId: enrollment.tenantId,
    executionId: enrollment.id, // reuse enrollment id as the correlation id
    workflowId: journey.id,
    triggerPayload: context,
    currentNodeId: enrollment.currentStepId ?? null,
  };

  let currentStepId: string | null = enrollment.currentStepId ?? steps[0]?.id ?? null;

  try {
    // Early-exit: exitCriteria is evaluated before every step.
    for (let i = 0; i < MAX_STEPS_PER_PASS; i++) {
      if (!currentStepId) {
        await complete(prisma, producer, enrollment.id, enrollment.tenantId, journey.id, 'COMPLETED');
        return;
      }

      if (journey.exitCriteria && evaluateRuleSet(journey.exitCriteria, context)) {
        await complete(prisma, producer, enrollment.id, enrollment.tenantId, journey.id, 'EXITED');
        return;
      }

      const step = byId.get(currentStepId);
      if (!step) {
        // Dangling pointer — treat as normal completion.
        await complete(prisma, producer, enrollment.id, enrollment.tenantId, journey.id, 'COMPLETED');
        return;
      }

      exec.currentNodeId = currentStepId;
      const result = await executeJourneyStep(step, context, exec);

      await emit(producer, 'journey.step', enrollment.tenantId, {
        journeyId: journey.id,
        enrollmentId: enrollment.id,
        entityType: enrollment.entityType,
        entityId: enrollment.entityId,
        stepId: step.id,
        stepType: step.type,
        output: result.output ?? {},
      });

      // WAIT — park the enrollment until resumeAt, pointing at the next step.
      if (result.resumeAt) {
        await prisma.commandJourneyEnrollment.update({
          where: { id: enrollment.id },
          data: {
            currentStepId: result.nextStepId ?? null,
            resumeAt: result.resumeAt,
            lastStepAt: new Date(),
          },
        });
        return;
      }

      // Terminal step (GOAL/EXIT).
      if (result.terminal) {
        await complete(
          prisma,
          producer,
          enrollment.id,
          enrollment.tenantId,
          journey.id,
          result.terminal
        );
        return;
      }

      const nextStepId = result.nextStepId ?? null;
      await prisma.commandJourneyEnrollment.update({
        where: { id: enrollment.id },
        data: { currentStepId: nextStepId, lastStepAt: new Date(), resumeAt: null },
      });

      if (!nextStepId) {
        await complete(prisma, producer, enrollment.id, enrollment.tenantId, journey.id, 'COMPLETED');
        return;
      }
      currentStepId = nextStepId;
    }

    // Hit the per-pass cap — leave it ACTIVE with resumeAt=now so the next tick
    // continues it, rather than looping forever in this call.
    await prisma.commandJourneyEnrollment.update({
      where: { id: enrollment.id },
      data: { resumeAt: new Date(), lastStepAt: new Date() },
    });
  } catch (err) {
    // Fail-open: mark just this enrollment FAILED; never crash the scheduler.
    logger.warn({ err, enrollmentId: enrollment.id }, 'Journey enrollment step failed');
    await prisma.commandJourneyEnrollment
      .update({
        where: { id: enrollment.id },
        data: {
          status: 'FAILED',
          error: err instanceof Error ? err.message : String(err),
          resumeAt: null,
        },
      })
      .catch(() => undefined);
    await emit(producer, 'journey.failed', enrollment.tenantId, {
      journeyId: journey.id,
      enrollmentId: enrollment.id,
      entityType: enrollment.entityType,
      entityId: enrollment.entityId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function complete(
  prisma: WorkflowPrisma,
  producer: NexusProducer,
  enrollmentId: string,
  tenantId: string,
  journeyId: string,
  status: 'COMPLETED' | 'EXITED'
): Promise<void> {
  const updated = await prisma.commandJourneyEnrollment.updateMany({
    where: { id: enrollmentId, status: 'ACTIVE' },
    data: { status, currentStepId: null, resumeAt: null, lastStepAt: new Date() },
  });
  if (updated.count === 0) return; // already terminal — no duplicate event
  await emit(producer, 'journey.completed', tenantId, {
    journeyId,
    enrollmentId,
    status,
  });
}

/**
 * Scheduler: advance ACTIVE enrollments whose `resumeAt` is due.
 *
 * Mirrors schedule-trigger.ts:
 *   - setInterval + .unref() so the timer never keeps the process alive.
 *   - Reentrancy guard skips a tick if the previous one is still running.
 *   - Whole tick body try/caught; a transient failure just logs.
 *   - Each due enrollment is atomically CLAIMED (updateMany that pushes resumeAt
 *     forward) so only one tick / process instance advances it — no double-run.
 */
export function startJourneyScheduler(
  prisma: WorkflowPrisma,
  producer: NexusProducer,
  logger: Logger,
  intervalMs = Number(process.env.JOURNEY_SCHEDULE_TICK_MS ?? '30000')
): NodeJS.Timeout {
  const tickMs = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 30_000;
  const batchSize = Number(process.env.JOURNEY_SCHEDULE_BATCH ?? '50');
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const now = new Date();
      const due = await prisma.commandJourneyEnrollment.findMany({
        where: {
          status: 'ACTIVE',
          resumeAt: { lte: now },
        },
        select: { id: true, resumeAt: true },
        take: Number.isFinite(batchSize) && batchSize > 0 ? batchSize : 50,
      });

      for (const e of due) {
        // Idempotent claim: push resumeAt forward only if it still equals the
        // value we read. Whoever wins the claim advances the enrollment. This
        // guards against overlapping ticks and multiple service instances.
        const claim = await prisma.commandJourneyEnrollment.updateMany({
          where: { id: e.id, status: 'ACTIVE', resumeAt: e.resumeAt },
          data: { resumeAt: new Date(now.getTime() + tickMs) },
        });
        if (claim.count === 0) continue; // lost the race

        try {
          await advanceEnrollment(prisma, producer, e.id, logger);
        } catch (err) {
          logger.warn({ err, enrollmentId: e.id }, 'Journey advance failed');
        }
      }
    } catch (err) {
      logger.warn({ err }, 'Journey scheduler tick failed');
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
