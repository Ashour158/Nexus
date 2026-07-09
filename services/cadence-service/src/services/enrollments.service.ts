import { TOPICS, type NexusProducer } from '@nexus/kafka';
import type { CadencePrisma } from '../prisma.js';

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
            scheduledAt: new Date(Date.now() + (first.delayDays ?? 0) * 24 * 60 * 60 * 1000),
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
