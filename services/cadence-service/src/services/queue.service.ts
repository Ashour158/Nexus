import { runCrossTenant } from '@nexus/service-utils/prisma-tenant';
import { createHash } from 'node:crypto';
import { TOPICS, type NexusProducer } from '@nexus/kafka';
import type { CadencePrisma } from '../prisma.js';

/**
 * Deterministically pick the A/B bucket for an enrollment.
 *
 * The previous implementation used `enrollment.id.length % 2`, but cuid ids are
 * effectively fixed-length so that expression almost always resolved to the same
 * value — the split was heavily skewed and not random. Instead we hash the
 * enrollment id and use the low bit of the digest, which is uniformly distributed
 * (~50/50) while remaining stable for a given enrollment (so re-processing a step
 * never flips the variant).
 */
function pickVariant(enrollmentId: string): 'A' | 'B' {
  const digest = createHash('sha256').update(enrollmentId).digest();
  return (digest[0] & 1) === 1 ? 'B' : 'A';
}

export function createQueueService(prisma: CadencePrisma, producer: NexusProducer) {
  async function resolveEmail(enrollment: {
    objectType: string;
    objectId: string;
    tenantId: string;
  }): Promise<string | null> {
    const token = process.env.INTERNAL_SERVICE_TOKEN ?? '';
    if (enrollment.objectType === 'CONTACT') {
      const url = `${process.env.CRM_SERVICE_URL ?? 'http://localhost:3001'}/api/v1/contacts/${enrollment.objectId}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }).catch(() => null);
      if (!res?.ok) return null;
      const json = (await res.json().catch(() => null)) as { data?: { email?: string | null } } | null;
      return json?.data?.email ?? null;
    }
    if (enrollment.objectType === 'LEAD') {
      const url = `${process.env.CRM_SERVICE_URL ?? 'http://localhost:3001'}/api/v1/leads/${enrollment.objectId}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }).catch(() => null);
      if (!res?.ok) return null;
      const json = (await res.json().catch(() => null)) as { data?: { email?: string | null } } | null;
      return json?.data?.email ?? null;
    }
    return null;
  }

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
          // Only run the A/B split when a B variant is actually configured for
          // this step; otherwise always use A.
          const hasVariantB = step.variantB !== null && step.variantB !== undefined;
          const variant = hasVariantB ? pickVariant(enrollment.id) : 'A';
          const useB = variant === 'B';
          const payload = useB
            ? (step.variantB as { subject?: string; body?: string })
            : { subject: step.subject, body: step.body };

          const email = await resolveEmail(enrollment);
          if (!email) {
            status = 'SKIPPED';
            result = 'no email found for contact/lead';
          } else {
            await fetch(`${process.env.COMM_SERVICE_URL}/api/v1/internal/outbox/email-broadcast`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-service-token': process.env.INTERNAL_SERVICE_TOKEN ?? '',
              },
              body: JSON.stringify({
                tenantId: enrollment.tenantId,
                recipients: [email],
                subject: payload.subject ?? 'Cadence email',
                htmlBody: payload.body ?? '',
              }),
            }).catch(() => undefined);
          }

          await prisma.stepExecution.update({
            where: { id: execution.id },
            data: { variant },
          });
        } else if (step.type === 'CALL_TASK' || step.type === 'LINKEDIN_TASK') {
          // Create the task via the CRM internal automation route (service-token
          // guarded, tenant taken from the body) — this is the supported
          // service-to-service write path; the plain /api/v1/activities route is
          // end-user-JWT gated and would 401 for a service caller.
          await fetch(`${process.env.CRM_SERVICE_URL}/api/v1/internal/automation/activities`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-service-token': process.env.INTERNAL_SERVICE_TOKEN ?? '',
              'x-tenant-id': enrollment.tenantId,
            },
            body: JSON.stringify({
              tenantId: enrollment.tenantId,
              type: 'TASK',
              subject: step.taskTitle ?? `${step.type} task`,
              ownerId: enrollment.ownerId,
              contactId: enrollment.objectType === 'CONTACT' ? enrollment.objectId : undefined,
              leadId: enrollment.objectType === 'LEAD' ? enrollment.objectId : undefined,
              priority: 'NORMAL',
              customFields: { source: 'cadence', cadenceId: enrollment.cadenceId, enrollmentId: enrollment.id },
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
            scheduledAt: new Date(
              Date.now() + (next.delayDays ?? 0) * 24 * 60 * 60 * 1000 + (next.delayHours ?? 0) * 60 * 60 * 1000
            ),
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
      void runCrossTenant('cadence step runner processes due enrollments across all tenants', processQueue).catch(() => undefined);
    }, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }

  return { processQueue, startQueueWorker };
}
