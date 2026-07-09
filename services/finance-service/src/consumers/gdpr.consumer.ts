import { NexusConsumer } from '@nexus/kafka';
import type { FinancePrisma } from '../prisma.js';

export async function startGdprConsumer(prisma: FinancePrisma): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('finance-gdpr-group');

  consumer.on('gdpr.erasure.requested', async (event) => {
    const payload = (event.payload ?? {}) as {
      requestId?: string;
      tenantId?: string;
      subjectEmail?: string;
    };
    const tenantId = payload.tenantId;
    const subjectEmail = payload.subjectEmail;
    if (!tenantId || !subjectEmail) return;

    try {
      await prisma.invoice.updateMany({
        where: {
          tenantId,
          OR: [
            { notes: { contains: subjectEmail, mode: 'insensitive' } },
            { invoiceNumber: { contains: subjectEmail, mode: 'insensitive' } },
          ],
        },
        data: {
          notes: '[DELETED]',
        },
      });

      await prisma.quote.updateMany({
        where: {
          tenantId,
          OR: [
            { notes: { contains: subjectEmail, mode: 'insensitive' } },
            { name: { contains: subjectEmail, mode: 'insensitive' } },
          ],
        },
        data: {
          notes: '[DELETED]',
        },
      });
    } catch (err) {
      console.error('[GDPR] Finance-service erasure failed:', err);
    }
  });

  await consumer.subscribe(['gdpr.erasure.requested']);
  await consumer.start();
  return consumer;
}
