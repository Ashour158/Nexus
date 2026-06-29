import { NexusConsumer } from '@nexus/kafka';
import type { CrmPrisma } from '../prisma.js';

export async function startGdprConsumer(prisma: CrmPrisma): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('crm-gdpr-group');

  consumer.on('gdpr.erasure.requested', async (event) => {
    const payload = (event.payload ?? {}) as {
      requestId?: string;
      tenantId?: string;
      subjectEmail?: string;
      subjectId?: string;
    };
    const tenantId = payload.tenantId;
    const subjectEmail = payload.subjectEmail;
    const subjectId = payload.subjectId;
    if (!tenantId) return;

    try {
      const contacts = await prisma.contact.findMany({
        where: {
          tenantId,
          ...(subjectEmail ? { email: subjectEmail } : {}),
          ...(subjectId ? { id: subjectId } : {}),
        },
        select: { id: true },
      });

      for (const contact of contacts) {
        await prisma.contact.update({
          where: { id: contact.id },
          data: {
            firstName: '[DELETED]',
            lastName: '[DELETED]',
            email: `deleted-${contact.id}@nexus-gdpr.invalid`,
            phone: null,
            linkedInUrl: null,
            address: null,
            city: null,
            country: null,
          },
        });
      }

      if (contacts.length > 0) {
        await prisma.activity.deleteMany({
          where: { tenantId, contactId: { in: contacts.map((c) => c.id) } },
        });
        await prisma.note.deleteMany({
          where: { tenantId, contactId: { in: contacts.map((c) => c.id) } },
        });
      }

      if (subjectEmail) {
        const leads = await prisma.lead.findMany({
          where: { tenantId, email: subjectEmail },
          select: { id: true },
        });
        for (const lead of leads) {
          await prisma.lead.update({
            where: { id: lead.id },
            data: {
              firstName: '[DELETED]',
              lastName: '[DELETED]',
              email: `deleted-${lead.id}@nexus-gdpr.invalid`,
              phone: null,
              company: null,
              address: null,
              city: null,
              country: null,
              linkedInUrl: null,
            },
          });
        }
      }
    } catch (err) {
      console.error('[GDPR] CRM-service erasure failed:', err);
    }
  });

  await consumer.subscribe(['gdpr.erasure.requested']);
  await consumer.start();
  return consumer;
}
