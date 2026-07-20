import { buildEmailThreadHeaders } from '../lib/thread-headers.js';
import { BusinessRuleError, NotFoundError } from '@nexus/service-utils';
import type { Prisma } from '../../../../node_modules/.prisma/comm-client/index.js';
import type { EmailSequence, SequenceEnrollment } from '../../../../node_modules/.prisma/comm-client/index.js';
import type { CommPrisma } from '../prisma.js';
import { fetchContact, fetchContactEmail } from '../lib/crm-client.js';
import type { EmailChannel } from '../channels/smtp.channel.js';
import { createTemplatesService } from './templates.service.js';

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

type EmailSequenceWithSteps = Prisma.EmailSequenceGetPayload<{
  include: { steps: { orderBy: { stepNumber: 'asc' } } };
}>;

export function createSequencesService(
  prisma: CommPrisma,
  smtp: EmailChannel,
  templates: ReturnType<typeof createTemplatesService>
) {
  async function loadSequence(tenantId: string, id: string): Promise<EmailSequenceWithSteps> {
    const row = await prisma.emailSequence.findFirst({
      where: { id, tenantId },
      include: { steps: { orderBy: { stepNumber: 'asc' } } },
    });
    if (!row) throw new NotFoundError('EmailSequence', id);
    return row;
  }

  return {
    async createSequence(
      tenantId: string,
      data: {
        name: string;
        triggerType: string;
        steps: Array<{ stepNumber: number; delayDays: number; templateId: string }>;
      }
    ): Promise<EmailSequence> {
      return prisma.emailSequence.create({
        data: {
          tenantId,
          name: data.name,
          triggerType: data.triggerType,
          steps: {
            create: data.steps.map((s) => ({
              stepNumber: s.stepNumber,
              delayDays: s.delayDays,
              templateId: s.templateId,
            })),
          },
        },
        include: { steps: { orderBy: { stepNumber: 'asc' } } },
      });
    },

    async updateSequence(
      tenantId: string,
      id: string,
      data: Partial<{ name: string; triggerType: string; isActive: boolean }>
    ): Promise<EmailSequence> {
      await loadSequence(tenantId, id);
      return prisma.emailSequence.update({
        where: { id },
        data,
        include: { steps: { orderBy: { stepNumber: 'asc' } } },
      });
    },

    async deleteSequence(tenantId: string, id: string): Promise<void> {
      await loadSequence(tenantId, id);
      await prisma.emailSequence.delete({ where: { id } });
    },

    async listSequences(tenantId: string): Promise<EmailSequence[]> {
      return prisma.emailSequence.findMany({
        where: { tenantId },
        include: { steps: { orderBy: { stepNumber: 'asc' } } },
        orderBy: { createdAt: 'desc' },
      });
    },

    async getSequenceById(tenantId: string, id: string): Promise<EmailSequence> {
      return loadSequence(tenantId, id);
    },

    async enrollContact(
      tenantId: string,
      sequenceId: string,
      contactId: string
    ): Promise<SequenceEnrollment> {
      const seq = await loadSequence(tenantId, sequenceId);
      if (!seq.isActive) {
        throw new BusinessRuleError('Sequence is not active');
      }
      const skipCrm = process.env.COMM_ENROLL_SKIP_CRM === 'true';
      if (!skipCrm) {
        // Validate the contact against CRM via the internal mesh route. Only a
        // definitive 'not_found' blocks enrollment (fail-closed). A transport/auth
        // failure ('unavailable') must NOT block a legitimate enroll — mirror the
        // mesh's fail-open posture (email-sync / cadence skip on transport errors)
        // so a transient CRM blip can't wedge sequence enrollment.
        const lookup = await fetchContact(tenantId, contactId);
        if (lookup.outcome === 'not_found') {
          throw new BusinessRuleError('Contact not found for tenant');
        }
      }
      const first = seq.steps[0];
      if (!first) throw new BusinessRuleError('Sequence has no steps');
      const nextSendAt = addDays(new Date(), first.delayDays);
      return prisma.sequenceEnrollment.create({
        data: {
          tenantId,
          sequenceId,
          contactId,
          currentStep: 0,
          status: 'ACTIVE',
          nextSendAt,
        },
      });
    },

    async processSequenceQueue(tenantId: string): Promise<number> {
      const now = new Date();
      const enrollments = await prisma.sequenceEnrollment.findMany({
        where: {
          tenantId,
          status: 'ACTIVE',
          nextSendAt: { lte: now },
        },
        take: 25,
        include: {
          sequence: { include: { steps: { orderBy: { stepNumber: 'asc' } } } },
        },
      });
      let sent = 0;
      for (const en of enrollments) {
        const steps = en.sequence.steps;
        const step = steps[en.currentStep];
        if (!step) {
          await prisma.sequenceEnrollment.update({
            where: { id: en.id },
            data: { status: 'COMPLETED', nextSendAt: null },
          });
          continue;
        }
        const tpl = await prisma.emailTemplate.findFirst({
          where: { id: step.templateId, tenantId },
        });
        if (!tpl || !tpl.isActive) {
          await prisma.sequenceEnrollment.update({
            where: { id: en.id },
            data: { status: 'COMPLETED', nextSendAt: null },
          });
          continue;
        }
        const contact = await fetchContactEmail(tenantId, en.contactId);
        const emailTo = contact?.email?.trim();
        if (!emailTo) {
          await prisma.sequenceEnrollment.update({
            where: { id: en.id },
            data: { nextSendAt: addDays(now, 1) },
          });
          continue;
        }
        const rendered = templates.renderTemplate(
          tpl,
          {
            contactId: en.contactId,
            contactEmail: emailTo,
          },
          { fillMissingWith: '' }
        );
        const thread = buildEmailThreadHeaders({
          messageKey: `${en.id}-${en.currentStep}`,
          entityType: en.contactId ? 'contact' : null,
          entityId: en.contactId ?? null,
        });
        await smtp.send({
          to: emailTo,
          subject: rendered.subject,
          html: rendered.htmlBody,
          text: rendered.textBody,
          messageId: thread.messageId,
          references: thread.references,
        });
        sent += 1;
        const nextIdx = en.currentStep + 1;
        const nextStep = steps[nextIdx];
        if (!nextStep) {
          await prisma.sequenceEnrollment.update({
            where: { id: en.id },
            data: { status: 'COMPLETED', currentStep: nextIdx, nextSendAt: null },
          });
        } else {
          await prisma.sequenceEnrollment.update({
            where: { id: en.id },
            data: {
              currentStep: nextIdx,
              nextSendAt: addDays(now, nextStep.delayDays),
            },
          });
        }
      }
      return sent;
    },

    async unenroll(tenantId: string, enrollmentId: string): Promise<void> {
      const row = await prisma.sequenceEnrollment.findFirst({
        where: { id: enrollmentId, tenantId },
      });
      if (!row) throw new NotFoundError('SequenceEnrollment', enrollmentId);
      await prisma.sequenceEnrollment.update({
        where: { id: enrollmentId },
        data: { status: 'UNSUBSCRIBED', nextSendAt: null },
      });
    },

    async listEnrollments(
      tenantId: string,
      sequenceId: string
    ): Promise<SequenceEnrollment[]> {
      await loadSequence(tenantId, sequenceId);
      return prisma.sequenceEnrollment.findMany({
        where: { tenantId, sequenceId },
        orderBy: { enrolledAt: 'desc' },
      });
    },
  };
}
