import { TOPICS, type NexusProducer } from '@nexus/kafka';
import type { CadencePrisma } from '../prisma.js';

export function createQueueService(prisma: CadencePrisma, producer: NexusProducer) {
  async function processQueue() {
    const due = await prisma.stepExecution.findMany({
      where: { status: 'PENDING', scheduledAt: { lte: new Date() } },
      include: { enrollment: { include: { cadence: true } } },
      orderBy: { scheduledAt: 'asc' },
      take: 100,
    });
    for (const execution of due) {
      const enrollment = execution.enrollment;
      if (enrollment.status !== 'ACTIVE') {
        await prisma.stepExecution.update({
          where: { id: execution.id },
          data: { status: 'SKIPPED', executedAt: new Date(), result: 'inactive enrollment' },
        });
        continue;
      }
      const step = await prisma.cadenceStep.findFirst({
        where: { cadenceId: enrollment.cadenceId, position: execution.stepPosition },
      });
      if (!step) continue;
      let status: 'EXECUTED' | 'FAILED' | 'SKIPPED' = 'EXECUTED';
      let result = 'ok';
      try {
        if (step.type === 'EMAIL') {
          const useB = enrollment.id.length % 2 === 1 && step.variantB !== null;
          const variant = useB ? 'B' : 'A';
          const payload = useB
            ? (step.variantB as { subject?: string; body?: string })
            : { subject: step.subject, body: step.body };
          await fetch(`${process.env.COMM_SERVICE_URL}/api/v1/emails`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN ?? ''}`,
            },
            body: JSON.stringify({
              to: [`owner+${enrollment.ownerId}@example.com`],
              subject: payload.subject ?? 'Cadence email',
              htmlBody: payload.body ?? '',
            }),
          }).catch(() => undefined);
          await prisma.stepExecution.update({
            where: { id: execution.id },
            data: { variant },
          });
        } else if (step.type === 'CALL_TASK' || step.type === 'LINKEDIN_TASK') {
          await fetch(`${process.env.CRM_SERVICE_URL}/api/v1/activities`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN ?? ''}`,
            },
            body: JSON.stringify({
              type: 'TASK',
              subject: step.taskTitle ?? `${step.type} task`,
              ownerId: enrollment.ownerId,
              contactId: enrollment.objectType === 'CONTACT' ? enrollment.objectId : undefined,
              leadId: enrollment.objectType === 'LEAD' ? enrollment.objectId : undefined,
              priority: 'NORMAL',
              customFields: {},
            }),
          }).catch(() => undefined);
        } else if (step.type === 'SMS') {
          status = 'SKIPPED';
          result = 'sms not integrated';
        }
      } catch (err) {
        status = 'FAILED';
        result = err instanceof Error ? err.message : String(err);
      }

      await prisma.stepExecution.update({
        where: { id: execution.id },
        data: { status, executedAt: new Date(), result },
      });

      const next = await prisma.cadenceStep.findFirst({
        where: { cadenceId: enrollment.cadenceId, position: execution.stepPosition + 1 },
      });
      if (!next) {
        await prisma.cadenceEnrollment.update({
          where: { id: enrollment.id },
          data: { status: 'COMPLETED' },
        });
      } else {
        await prisma.stepExecution.create({
          data: {
            enrollmentId: enrollment.id,
            stepPosition: next.position,
            stepType: next.type,
            scheduledAt: new Date(Date.now() + (next.delayDays ?? 0) * 24 * 60 * 60 * 1000),
            status: 'PENDING',
          },
        });
        await prisma.cadenceEnrollment.update({
          where: { id: enrollment.id },
          data: { currentStep: next.position },
        });
      }
      await producer.publish(TOPICS.WORKFLOWS, {
        type: 'cadence.step.processed',
        tenantId: enrollment.tenantId,
        payload: { enrollmentId: enrollment.id, stepPosition: execution.stepPosition, status },
      });
    }
    return { processed: due.length };
  }

  function startQueueWorker() {
    const timer = setInterval(() => {
      void processQueue().catch(() => undefined);
    }, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }

  return { processQueue, startQueueWorker };
}
