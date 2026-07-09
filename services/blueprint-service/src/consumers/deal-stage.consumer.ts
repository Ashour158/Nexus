import { NexusConsumer, TOPICS } from '@nexus/kafka';
import type { NexusProducer } from '@nexus/kafka';
import type { BlueprintPrisma } from '../prisma.js';
import { executeEntryActions, type StageEntryContext } from '../services/stage-actions.service.js';

interface LoggerLike {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

type StageChangedEventLike = {
  type?: string;
  tenantId?: string;
  correlationId?: string;
  payload?: Record<string, unknown>;
};

function num(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Core handler for a `deal.stage_changed` event: look up the PlaybookStage that
 * matches the deal's *new* stage (scoped to the tenant) and execute its
 * `entryActions`. Fully guarded — DB or action failures are logged and never
 * rethrown, so a failure here can never crash the consumer loop.
 */
export async function handleDealStageChanged(
  prisma: BlueprintPrisma,
  producer: NexusProducer,
  log: LoggerLike,
  event: StageChangedEventLike
): Promise<void> {
  try {
    if (event.type && event.type !== 'deal.stage_changed') return;
    const payload = event.payload ?? {};
    const tenantId = str(event.tenantId) ?? str(payload.tenantId);
    const dealId = str(payload.dealId);
    const newStageId = str(payload.newStageId) ?? str(payload.stageId) ?? str(payload.toStageId);
    const pipelineId = str(payload.pipelineId);

    if (!tenantId || !dealId || !newStageId) {
      log.warn({ tenantId, dealId, newStageId }, 'blueprint stage-entry skipped: missing anchors');
      return;
    }

    // The event carries no pipelineId today, so resolve the stage by
    // (tenant, stageId). If a pipelineId is present we narrow via the parent
    // playbook. Explicit tenantId in the where clause guards against the
    // consumer running outside a request-scoped tenant context.
    const stages = await prisma.playbookStage.findMany({
      where: {
        tenantId,
        stageId: newStageId,
        ...(pipelineId ? { playbook: { pipelineId, isActive: true } } : {}),
      },
    });

    if (stages.length === 0) {
      log.info({ tenantId, dealId, newStageId }, 'blueprint stage-entry: no matching playbook stage');
      return;
    }

    const ctx: StageEntryContext = {
      tenantId,
      dealId,
      newStageId,
      ownerId: str(payload.ownerId),
      amount: num(payload.amount),
      correlationId: event.correlationId,
    };

    for (const stage of stages) {
      const count = await executeEntryActions(stage.entryActions, ctx, producer, log);
      log.info(
        { tenantId, dealId, stageId: stage.id, actions: count },
        'blueprint executed stage entry actions'
      );
    }
  } catch (err) {
    // Belt-and-suspenders: nothing in this handler should throw, but if it
    // does we swallow it so the Kafka consumer loop keeps running.
    log.error({ err }, 'blueprint deal-stage consumer handler error (suppressed)');
  }
}

/**
 * Start the deal stage-change consumer. Subscribes to the DEALS topic and runs
 * playbook stage `entryActions` on `deal.stage_changed`. The caller should wrap
 * this in try/catch — if Kafka is unavailable the service must keep running.
 */
export async function startDealStageConsumer(
  prisma: BlueprintPrisma,
  producer: NexusProducer,
  log: LoggerLike
): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('blueprint-service.deal-stage');

  consumer.on('deal.stage_changed', async (event) => {
    await handleDealStageChanged(prisma, producer, log, {
      type: event.type,
      tenantId: event.tenantId,
      correlationId: event.correlationId,
      payload: event.payload as Record<string, unknown>,
    });
  });

  await consumer.subscribe([TOPICS.DEALS]);
  await consumer.start();
  return consumer;
}
