import type { CadencePrisma } from '../prisma.js';
import type { Prisma } from '../../../../node_modules/.prisma/cadence-client/index.js';

export function createCadencesService(prisma: CadencePrisma) {
  return {
    async listCadences(tenantId: string) {
      const rows = await prisma.cadenceTemplate.findMany({
        where: { tenantId, isActive: true },
        include: { _count: { select: { steps: true, enrollments: true } } },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map((r) => ({
        ...r,
        stepCount: r._count.steps,
        enrollmentCount: r._count.enrollments,
      }));
    },

    async getCadence(tenantId: string, id: string) {
      return prisma.cadenceTemplate.findFirst({
        where: { tenantId, id },
        include: { steps: { orderBy: { position: 'asc' } } },
      });
    },

    async createCadence(
      tenantId: string,
      input: {
        name: string;
        description?: string;
        objectType: 'CONTACT' | 'LEAD';
        isActive?: boolean;
        exitOnReply?: boolean;
        exitOnMeeting?: boolean;
        steps: Array<{
          position: number;
          type: 'EMAIL' | 'CALL_TASK' | 'LINKEDIN_TASK' | 'SMS' | 'WAIT';
          delayDays?: number;
          subject?: string;
          body?: string;
          taskTitle?: string;
          variantB?: Record<string, unknown>;
        }>;
      }
    ) {
      return prisma.$transaction(async (tx) => {
        const cadence = await tx.cadenceTemplate.create({
          data: {
            tenantId,
            name: input.name,
            description: input.description ?? null,
            objectType: input.objectType,
            isActive: input.isActive ?? true,
            exitOnReply: input.exitOnReply ?? true,
            exitOnMeeting: input.exitOnMeeting ?? true,
          },
        });
        if (input.steps.length > 0) {
          await tx.cadenceStep.createMany({
            data: input.steps.map((s) => ({
              cadenceId: cadence.id,
              position: s.position,
              type: s.type,
              delayDays: s.delayDays ?? 0,
              subject: s.subject ?? null,
              body: s.body ?? null,
              taskTitle: s.taskTitle ?? null,
              variantB: (s.variantB ?? undefined) as Prisma.InputJsonValue | undefined,
            })),
          });
        }
        return cadence;
      });
    },

    async updateCadence(
      tenantId: string,
      id: string,
      input: Partial<{
        name: string;
        description: string | null;
        objectType: 'CONTACT' | 'LEAD';
        isActive: boolean;
        exitOnReply: boolean;
        exitOnMeeting: boolean;
      }>
    ) {
      const existing = await prisma.cadenceTemplate.findFirst({ where: { tenantId, id } });
      if (!existing) return null;
      return prisma.cadenceTemplate.update({ where: { id }, data: input });
    },

    async deleteCadence(tenantId: string, id: string) {
      const existing = await prisma.cadenceTemplate.findFirst({ where: { tenantId, id } });
      if (!existing) return null;
      return prisma.cadenceTemplate.update({
        where: { id },
        data: { isActive: false },
      });
    },

    async getAnalytics(tenantId: string, cadenceId: string) {
      const [enrollments, steps, executions] = await Promise.all([
        prisma.cadenceEnrollment.findMany({ where: { tenantId, cadenceId } }),
        prisma.cadenceStep.findMany({ where: { cadenceId }, orderBy: { position: 'asc' } }),
        prisma.stepExecution.findMany({
          where: { enrollment: { tenantId, cadenceId } },
        }),
      ]);
      const totalEnrollments = enrollments.length;
      const perStep = steps.map((s) => {
        const stepExec = executions.filter((e) => e.stepPosition === s.position);
        const reached = stepExec.length;
        const exited = enrollments.filter(
          (e) => e.status === 'EXITED' && e.currentStep === s.position
        ).length;
        const sent = s.type === 'EMAIL' ? stepExec.filter((e) => e.status === 'EXECUTED').length : 0;
        return {
          position: s.position,
          type: s.type,
          reached,
          completionRate: totalEnrollments ? reached / totalEnrollments : 0,
          exitRate: totalEnrollments ? exited / totalEnrollments : 0,
          emailExecutions: sent,
        };
      });
      return { totalEnrollments, perStep };
    },
  };
}
