import { TOPICS, type NexusProducer } from '@nexus/kafka';
import type { CadencePrisma } from '../prisma.js';

/** Total wait before a step fires: delayDays*24h + delayHours, in milliseconds. */
export function stepDelayMs(step: { delayDays?: number | null; delayHours?: number | null }): number {
  const days = step.delayDays ?? 0;
  const hours = step.delayHours ?? 0;
  return days * 24 * 60 * 60 * 1000 + hours * 60 * 60 * 1000;
}

export function createEnrollmentsService(prisma: CadencePrisma, producer: NexusProducer) {
  return {
    async enroll(
      tenantId: string,
      cadenceId: string,
      objectType: 'CONTACT' | 'LEAD',
      objectId: string,
      ownerId: string
    ) {
      const existing = await prisma.cadenceEnrollment.findFirst({
        where: { tenantId, cadenceId, objectId, status: 'ACTIVE' },
      });
      if (existing) throw new Error('Already enrolled');
      const cadence = await prisma.cadenceTemplate.findFirst({
        where: { id: cadenceId, tenantId, isActive: true },
        include: { steps: { orderBy: { position: 'asc' } } },
      });
      if (!cadence) throw new Error('Cadence not found');
      const first = cadence.steps[0];
      const enrolled = await prisma.cadenceEnrollment.create({
        data: {
          tenantId,
          cadenceId,
          objectType,
          objectId,
          ownerId,
          status: 'ACTIVE',
          currentStep: first?.position ?? 0,
        },
      });
      if (first) {
        await prisma.stepExecution.create({
          data: {
            enrollmentId: enrolled.id,
            stepPosition: first.position,
            stepType: first.type,
            scheduledAt: new Date(Date.now() + stepDelayMs(first)),
            status: 'PENDING',
            variant: 'A',
          },
        });
      }
      await producer.publish(TOPICS.WORKFLOWS, {
        type: 'cadence.enrolled',
        tenantId,
        payload: { enrollmentId: enrolled.id, cadenceId, objectType, objectId },
      });
      return enrolled;
    },

    async listEnrollments(
      tenantId: string,
      cadenceId: string | undefined,
      objectId: string | undefined,
      status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'EXITED' | undefined,
      page: number,
      limit: number
    ) {
      const where = { tenantId, cadenceId, objectId, status };
      const [data, total] = await Promise.all([
        prisma.cadenceEnrollment.findMany({
          where,
          include: { cadence: true },
          orderBy: { enrolledAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.cadenceEnrollment.count({ where }),
      ]);
      return { data, total, page, limit };
    },

    async pauseEnrollment(tenantId: string, enrollmentId: string) {
      return prisma.cadenceEnrollment.updateMany({
        where: { tenantId, id: enrollmentId },
        data: { status: 'PAUSED' },
      });
    },

    async resumeEnrollment(tenantId: string, enrollmentId: string) {
      const updated = await prisma.cadenceEnrollment.updateMany({
        where: { tenantId, id: enrollmentId },
        data: { status: 'ACTIVE' },
      });
      const next = await prisma.stepExecution.findFirst({
        where: { enrollmentId, status: 'PENDING' },
        orderBy: { scheduledAt: 'asc' },
      });
      if (next) {
        await prisma.stepExecution.update({
          where: { id: next.id },
          data: { scheduledAt: new Date() },
        });
      }
      return updated;
    },

    async exitEnrollment(tenantId: string, enrollmentId: string, reason: string) {
      return prisma.cadenceEnrollment.updateMany({
        where: { tenantId, id: enrollmentId },
        data: { status: 'EXITED', exitReason: reason, exitedAt: new Date() },
      });
    },

    /**
     * Force an ACTIVE enrollment's next PENDING step to run on the next poller
     * tick by pulling its scheduledAt forward to now (skipping any remaining
     * WAIT delay). The step runner picks it up and advances the chain from
     * there. Returns { advanced: boolean } — false when the enrollment is not
     * active or has no pending step.
     */
    async advanceEnrollment(tenantId: string, enrollmentId: string): Promise<{ advanced: boolean }> {
      const enrollment = await prisma.cadenceEnrollment.findFirst({
        where: { tenantId, id: enrollmentId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!enrollment) return { advanced: false };
      const next = await prisma.stepExecution.findFirst({
        where: { enrollmentId, status: 'PENDING' },
        orderBy: { scheduledAt: 'asc' },
      });
      if (!next) return { advanced: false };
      await prisma.stepExecution.update({ where: { id: next.id }, data: { scheduledAt: new Date() } });
      return { advanced: true };
    },

    /**
     * Rule-based auto-enroll hook (B11). Enrolls one entity into every active
     * cadence whose `autoEnrollTrigger` matches `trigger` and whose objectType
     * matches the entity. Idempotent per (cadence, object): an existing ACTIVE
     * enrollment is skipped (not an error). Fully guarded — a single failing
     * enrollment never aborts the others. Returns the ids of cadences the entity
     * was newly enrolled into.
     */
    async autoEnroll(
      tenantId: string,
      trigger: string,
      entity: { objectType: 'CONTACT' | 'LEAD'; objectId: string; ownerId: string }
    ): Promise<{ enrolledCadenceIds: string[]; skipped: number }> {
      const cadences = await prisma.cadenceTemplate.findMany({
        where: {
          tenantId,
          isActive: true,
          autoEnrollTrigger: trigger,
          objectType: entity.objectType,
        },
        include: { steps: { orderBy: { position: 'asc' } } },
      });
      const enrolledCadenceIds: string[] = [];
      let skipped = 0;
      for (const cadence of cadences) {
        try {
          const existing = await prisma.cadenceEnrollment.findFirst({
            where: { tenantId, cadenceId: cadence.id, objectId: entity.objectId, status: 'ACTIVE' },
            select: { id: true },
          });
          if (existing) {
            skipped += 1;
            continue;
          }
          const first = cadence.steps[0];
          const enrolled = await prisma.cadenceEnrollment.create({
            data: {
              tenantId,
              cadenceId: cadence.id,
              objectType: entity.objectType,
              objectId: entity.objectId,
              ownerId: entity.ownerId,
              status: 'ACTIVE',
              currentStep: first?.position ?? 0,
            },
          });
          if (first) {
            await prisma.stepExecution.create({
              data: {
                enrollmentId: enrolled.id,
                stepPosition: first.position,
                stepType: first.type,
                scheduledAt: new Date(Date.now() + stepDelayMs(first)),
                status: 'PENDING',
                variant: 'A',
              },
            });
          }
          await producer
            .publish(TOPICS.WORKFLOWS, {
              type: 'cadence.enrolled',
              tenantId,
              payload: { enrollmentId: enrolled.id, cadenceId: cadence.id, objectType: entity.objectType, objectId: entity.objectId, auto: true, trigger },
            })
            .catch(() => undefined);
          enrolledCadenceIds.push(cadence.id);
        } catch {
          // unique-constraint race or transient error: skip this cadence only
          skipped += 1;
        }
      }
      return { enrolledCadenceIds, skipped };
    },

    /**
     * Exit every ACTIVE enrollment for the given contact/lead whose cadence
     * template has the matching exit flag enabled.
     *
     * `flag` selects which template setting gates the exit ('exitOnReply' or
     * 'exitOnMeeting'). Fully guarded: any DB error is swallowed so a Kafka
     * consumer or internal endpoint driving this never crashes the service.
     * Returns the number of enrollments that were exited.
     */
    async exitEnrollmentsForObject(
      tenantId: string,
      objectId: string,
      flag: 'exitOnReply' | 'exitOnMeeting',
      reason: string
    ): Promise<number> {
      if (!tenantId || !objectId) return 0;
      try {
        const rows = await prisma.cadenceEnrollment.findMany({
          where: {
            tenantId,
            objectId,
            status: 'ACTIVE',
            cadence: { [flag]: true },
          },
          select: { id: true },
        });
        if (rows.length === 0) return 0;
        const result = await prisma.cadenceEnrollment.updateMany({
          where: {
            tenantId,
            id: { in: rows.map((r) => r.id) },
            status: 'ACTIVE',
          },
          data: { status: 'EXITED', exitReason: reason, exitedAt: new Date() },
        });
        return result.count;
      } catch {
        return 0;
      }
    },
  };
}
