import { NexusConsumer } from '@nexus/kafka';
import type { ApprovalPrisma } from '../prisma.js';

/**
 * GDPR erasure consumer for approval-service.
 * Anonymizes approval requests that reference the erased contact email.
 */
export async function startGdprConsumer(prisma: ApprovalPrisma): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('approval-service.gdpr');

  consumer.on('gdpr.erasure.requested', async (event) => {
    const payload = event.payload as Record<string, unknown>;
    const tenantId = event.tenantId;
    const email = String(payload.email ?? '');
    if (!email) return;

    const redacted = '[REDACTED]';

    // Anonymize comments that may contain email
    const requests = await prisma.approvalRequest.findMany({
      where: { tenantId },
      select: { id: true, comment: true },
    });
    for (const req of requests) {
      if (req.comment && req.comment.includes(email)) {
        await prisma.approvalRequest.update({
          where: { id: req.id },
          data: { comment: redacted },
        });
      }
    }
  });

  // auth-service publishes erasure to a topic literally named
  // 'gdpr.erasure.requested' (routes/gdpr.routes.ts), NOT to the audit topic —
  // this consumer subscribed AUDIT and so never received a single erasure, while
  // the crm/comm/finance GDPR consumers (which subscribe the literal topic) all
  // worked. Personal data in approvals therefore survived an erasure request.
  await consumer.subscribe(['gdpr.erasure.requested']);
  await consumer.start();
  return consumer;
}
