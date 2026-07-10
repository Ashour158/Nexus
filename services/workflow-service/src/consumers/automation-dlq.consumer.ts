import { NexusConsumer } from '@nexus/kafka';
import type { NexusProducer } from '@nexus/kafka';
import type { WorkflowPrisma } from '../prisma.js';
import { AUTOMATION_MODULES, createAutomationRulesService } from '../services/automation-rules.service.js';
import { AUTOMATION_TOPICS, makeAutomationHandler } from './automation.consumer.js';

/**
 * AU-4 replay path. When the live automation consumer exhausts its retries on a
 * transient failure, the ORIGINAL event is parked on `<topic>.dlq` (by the
 * NexusConsumer DLQ machinery, with the error + original topic/partition/offset in
 * the message headers). This consumer subscribes to those `.dlq` topics and
 * re-drives each parked event through the SAME `handleEvent` path once the
 * underlying issue is resolved.
 *
 * Replay is safe/idempotent: `handleEvent` skips runs that already reached
 * SUCCESS/PARTIAL and only re-executes runs left in FAILED (where no action had
 * succeeded, so nothing is double-applied).
 *
 * Guardrails:
 *   - `dlqEnabled: false` here — a still-broken event is NOT forwarded to a
 *     `.dlq.dlq`; it is logged and the offset advances, so replay cannot loop
 *     forever. Operators re-park by re-processing after a real fix.
 *   - Opt-in via `AUTOMATION_DLQ_REPLAY_ENABLED=true` (off by default) so replay
 *     runs deliberately, not as a silent background reprocessor.
 */
export async function startAutomationDlqReplayConsumer(
  prisma: WorkflowPrisma,
  producer?: NexusProducer
): Promise<NexusConsumer> {
  const consumer = new NexusConsumer({
    groupId: 'workflow-service.automation-rules.dlq-replay',
    dlqEnabled: false,
    maxRetries: Number(process.env.AUTOMATION_DLQ_REPLAY_RETRIES ?? 1),
  });
  const rules = createAutomationRulesService(prisma, producer);
  const onEvent = makeAutomationHandler(rules);

  const allEvents = new Set<string>(Object.values(AUTOMATION_MODULES).flat());
  for (const type of allEvents) {
    consumer.on(type, onEvent as never);
  }

  await consumer.subscribe(AUTOMATION_TOPICS.map((t) => `${t}.dlq`));
  await consumer.start();
  return consumer;
}
