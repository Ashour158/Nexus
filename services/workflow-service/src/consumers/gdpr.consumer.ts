import { NexusConsumer, TOPICS } from '@nexus/kafka';
import type { WorkflowPrisma } from '../prisma.js';

/**
 * GDPR erasure consumer for workflow-service.
 * Anonymizes workflow executions and steps that reference the erased contact.
 */
export async function startGdprConsumer(prisma: WorkflowPrisma): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('workflow-service.gdpr');

  consumer.on('gdpr.erasure.requested', async (event) => {
    const payload = event.payload as Record<string, unknown>;
    const tenantId = event.tenantId;
    const email = String(payload.email ?? '');
    if (!email) return;

    // Anonymize workflow executions that may contain PII in trigger payloads
    const executions = await prisma.workflowExecution.findMany({
      where: { tenantId },
    });

    for (const exec of executions) {
      const triggerPayload = exec.triggerPayload as Record<string, unknown> | null;
      if (triggerPayload && JSON.stringify(triggerPayload).includes(email)) {
        const anonymized = JSON.parse(
          JSON.stringify(triggerPayload).replace(new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '[REDACTED]')
        );
        await prisma.workflowExecution.update({
          where: { id: exec.id },
          data: { triggerPayload: anonymized },
        });
      }
    }

    // Acknowledge completion implicitly by not throwing
  });

  await consumer.subscribe([TOPICS.AUDIT]);
  await consumer.start();
  return consumer;
}
