import { runCrossTenant } from '@nexus/service-utils/prisma-tenant';
import { TOPICS, type NexusProducer } from '@nexus/kafka';
import type { PrismaClient } from '../../../../node_modules/.prisma/blueprint-client/index.js';
import {
  executeEscalation,
  type TransitionActionContext,
} from '../services/transition-actions.service.js';

interface LoggerLike {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

/**
 * SLA breach poller.
 *
 * Every `intervalMs` it scans `BlueprintRecordState` for records whose SLA clock
 * (`slaDueAt`) has elapsed while still un-breached, ACROSS ALL TENANTS. It uses
 * the RAW (non-tenant-extended) Prisma client on purpose: this is a global
 * background sweep, not a request, so there is no tenant in AsyncLocalStorage —
 * every read/write is instead pinned with an explicit `tenantId` taken from the
 * row itself, so no cross-tenant write can occur.
 *
 * For each breach it: marks the row breached (idempotent via `updateMany` guarded
 * on `slaBreached: false`), emits `blueprint.sla.breached`, and runs the owning
 * transition's `escalationConfig`. Everything is guarded so a single bad row can
 * never stop the loop.
 */
export interface SlaPoller {
  stop: () => void;
  /** Run one sweep immediately (also used by tests). Returns rows breached. */
  runOnce: () => Promise<number>;
}

export function startSlaPoller(
  rawPrisma: PrismaClient,
  producer: NexusProducer,
  log: LoggerLike,
  opts: { intervalMs?: number; batchSize?: number } = {}
): SlaPoller {
  const intervalMs = opts.intervalMs ?? Number(process.env.BLUEPRINT_SLA_POLL_MS ?? 60_000);
  const batchSize = opts.batchSize ?? 100;
  let running = false;

  async function processRow(row: {
    id: string;
    tenantId: string;
    module: string;
    recordId: string;
    playbookId: string;
    currentStageId: string;
    slaTransitionId: string | null;
    slaDueAt: Date | null;
  }): Promise<boolean> {
    // Claim the breach atomically: only the update that flips `slaBreached`
    // false→true proceeds, so concurrent sweeps can't double-fire escalations.
    const claim = await rawPrisma.blueprintRecordState.updateMany({
      where: { id: row.id, tenantId: row.tenantId, slaBreached: false },
      data: { slaBreached: true, slaBreachedAt: new Date() },
    });
    if (claim.count === 0) return false;

    const transition = row.slaTransitionId
      ? await rawPrisma.blueprintTransition.findFirst({
          where: { id: row.slaTransitionId, tenantId: row.tenantId },
        })
      : null;

    const ctx: TransitionActionContext = {
      tenantId: row.tenantId,
      module: row.module,
      recordId: row.recordId,
      fromStageId: row.currentStageId,
      toStageId: row.currentStageId,
      transitionId: row.slaTransitionId ?? '',
    };

    try {
      await producer.publish(TOPICS.BLUEPRINT, {
        type: 'blueprint.sla.breached',
        tenantId: row.tenantId,
        payload: {
          module: row.module,
          recordId: row.recordId,
          playbookId: row.playbookId,
          stageId: row.currentStageId,
          transitionId: row.slaTransitionId,
          slaDueAt: row.slaDueAt ? row.slaDueAt.toISOString() : null,
          breachedAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      log.warn({ err, id: row.id }, 'blueprint.sla.breached publish failed');
    }

    if (transition?.escalationConfig) {
      try {
        await executeEscalation(transition.escalationConfig, ctx, producer, log);
      } catch (err) {
        log.error({ err, id: row.id }, 'blueprint SLA escalation error (suppressed)');
      }
    }
    return true;
  }

  async function runOnce(): Promise<number> {
    const due = await rawPrisma.blueprintRecordState.findMany({
      where: { slaBreached: false, slaDueAt: { not: null, lte: new Date() } },
      take: batchSize,
      orderBy: { slaDueAt: 'asc' },
    });
    let breached = 0;
    for (const row of due) {
      try {
        if (await processRow(row)) breached++;
      } catch (err) {
        log.error({ err, id: row.id }, 'blueprint SLA row processing error (suppressed)');
      }
    }
    if (breached > 0) log.info({ breached }, 'blueprint SLA poller flagged breached records');
    return breached;
  }

  async function tick(): Promise<void> {
    if (running) return; // never overlap sweeps
    running = true;
    try {
      await runOnce();
    } catch (err) {
      log.error({ err }, 'blueprint SLA poller sweep error (suppressed)');
    } finally {
      running = false;
    }
  }

  const timer = setInterval(() => {
    void runCrossTenant('blueprint SLA breach scan spans all tenants', tick);
  }, intervalMs);
  // Do not keep the event loop alive solely for the poller.
  if (typeof timer.unref === 'function') timer.unref();

  log.info({ intervalMs }, 'blueprint SLA poller started');

  return {
    stop: () => clearInterval(timer),
    runOnce,
  };
}
