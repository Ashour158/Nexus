import { NexusConsumer, TOPICS } from '@nexus/kafka';
import type { WorkflowPrisma } from '../prisma.js';
import { createExecutionsService } from '../services/executions.service.js';
import type { NexusProducer } from '@nexus/kafka';

interface BranchStartPayload {
  executionId: string;
  parentExecutionId?: string;
  branchNodeId?: string;
}

export async function startBranchConsumer(
  prisma: WorkflowPrisma,
  producer: NexusProducer
): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('workflow-service.branches');
  const executions = createExecutionsService(prisma, producer);

  consumer.on('workflow.branch.start', async (event) => {
    const payload = event.payload as BranchStartPayload;
    if (!payload?.executionId) return;
    await executions.runExecution(payload.executionId);
  });

  await consumer.subscribe([TOPICS.WORKFLOWS]);
  await consumer.start();
  return consumer;
}
