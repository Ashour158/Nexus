import { NexusConsumer } from '@nexus/kafka';
import type { CommPrisma } from '../prisma.js';

export async function startGdprConsumer(prisma: CommPrisma): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('comm-gdpr-group');

  consumer.on('gdpr.erasure.requested', async (event) => {
    const payload = (event.payload ?? {}) as {
      tenantId?: string;
      subjectEmail?: string;
    };
    const tenantId = payload.tenantId;
    const subjectEmail = payload.subjectEmail;
    if (!tenantId || !subjectEmail) return;

    try {
      await (prisma as any).commOutbox.deleteMany({
        where: {
          tenantId,
          OR: [{ to: subjectEmail }, { body: { contains: subjectEmail, mode: 'insensitive' } }],
        },
      });
      await prisma.sequenceEnrollment.deleteMany({
        where: { tenantId, contactId: subjectEmail },
      }).catch(() => null);
    } catch (err) {
      console.error('[GDPR] Comm-service erasure failed:', err);
    }
  });

  await consumer.subscribe(['gdpr.erasure.requested']);
  await consumer.start();
  return consumer;
}
