import { NexusConsumer } from '@nexus/kafka';
import type { NexusProducer } from '@nexus/kafka';
import type { WorkflowPrisma } from '../prisma.js';
import { AUTOMATION_MODULES } from '../services/automation-rules.service.js';
import { AUTOMATION_TOPICS, moduleForEvent } from './automation.consumer.js';
import { createScoringService, SCORING_MODULES } from '../services/scoring.js';
import { evaluateThresholdAlerts } from '../services/threshold-alerts.js';
import { resolveEntityId } from '../services/scheduled-actions.service.js';

/**
 * Record-scoring + threshold-alert consumer (WF-DEPTH).
 *
 * Independent of the automation-rules consumer (its own group id). For every
 * relevant domain event it:
 *   1. recomputes the record's score — but only when the tenant has active scoring
 *      rules for the module (otherwise a pure no-op), and
 *   2. evaluates the tenant's active threshold alerts for the module, firing a
 *      notification on a rising-edge crossing (deduped per record).
 *
 * Fail-open: any error is swallowed (logged) so scoring/threshold work never DLQs a
 * domain event or blocks the other consumers. An unconfigured tenant is untouched.
 */
export async function startRecordScoringConsumer(
  prisma: WorkflowPrisma,
  producer?: NexusProducer,
  logger?: { warn: (obj: unknown, msg?: string) => void }
): Promise<NexusConsumer> {
  const consumer = new NexusConsumer({
    groupId: 'workflow-service.record-scoring',
    // Best-effort side work — do not retain/replay domain events on failure.
    dlqEnabled: false,
    maxRetries: 0,
  });
  const scoring = createScoringService(prisma);
  const scoringModules = new Set<string>(SCORING_MODULES as unknown as string[]);

  const onEvent = async (event: {
    type: string;
    tenantId: string;
    payload: Record<string, unknown>;
    [key: string]: unknown;
  }): Promise<void> => {
    try {
      if (!event.tenantId || !event.type) return;
      const module = moduleForEvent(event.type);
      const payload = (event.payload ?? {}) as Record<string, unknown>;

      // 1) Scoring — only leads/deals/contacts/accounts, only if rules exist.
      if (scoringModules.has(module)) {
        const recordId = resolveEntityId(payload, module);
        if (recordId && (await scoring.hasActiveRules(event.tenantId, module))) {
          await scoring.recompute(event.tenantId, module, recordId, payload);
        }
      }

      // 2) Threshold / big-deal alerts — any module, edge-triggered + deduped.
      await evaluateThresholdAlerts(prisma, producer, { tenantId: event.tenantId, module, payload });
    } catch (err) {
      logger?.warn({ err, type: event.type }, 'record-scoring consumer event failed');
    }
  };

  // Register for every catalogued trigger event across all modules (a superset —
  // the handler itself gates on module + active config).
  const allEvents = new Set<string>(Object.values(AUTOMATION_MODULES).flat());
  for (const type of allEvents) {
    consumer.on(type, onEvent as never);
  }

  await consumer.subscribe(AUTOMATION_TOPICS);
  await consumer.start();
  return consumer;
}
