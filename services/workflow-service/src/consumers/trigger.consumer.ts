import { NexusConsumer, TOPICS } from '@nexus/kafka';
import type { WorkflowPrisma } from '../prisma.js';
import { createExecutionsService } from '../services/executions.service.js';
import type { NexusProducer } from '@nexus/kafka';

export async function startTriggerConsumer(
  prisma: WorkflowPrisma,
  producer: NexusProducer
): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('workflow-service.triggers');
  const executions = createExecutionsService(prisma, producer);

  const onEvent = async (event: { type: string; tenantId: string; payload: Record<string, unknown> }) => {
    const active = await prisma.workflowTemplate.findMany({
      where: { tenantId: event.tenantId, trigger: event.type, isActive: true },
      select: { id: true },
    });
    for (const wf of active) {
      const execution = await executions.createExecution(
        event.tenantId,
        wf.id,
        event.type,
        event.payload
      );
      await executions.runExecution(execution.id);
    }
  };

  consumer.on('deal.created', onEvent);
  consumer.on('deal.stage_changed', onEvent);
  consumer.on('deal.won', onEvent);
  consumer.on('deal.lost', onEvent);
  consumer.on('lead.created', onEvent);
  consumer.on('activity.created', onEvent);
  consumer.on('activity.completed', onEvent);
  consumer.on('quote.created', onEvent);
  consumer.on('quote.sent', onEvent);
  consumer.on('quote.accepted', onEvent);
  consumer.on('quote.rejected', onEvent);

  await consumer.subscribe([
    TOPICS.DEALS,
    TOPICS.LEADS,
    TOPICS.ACTIVITIES,
    TOPICS.QUOTES,
    TOPICS.CONTACTS,
    TOPICS.ACCOUNTS,
    TOPICS.NOTIFICATIONS,
  ]);
  await consumer.start();
  return consumer;
}
