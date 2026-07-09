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
        autoEnrollTrigger?: string | null;
        steps: Array<{
          position: number;
          type: 'EMAIL' | 'CALL_TASK' | 'LINKEDIN_TASK' | 'SMS' | 'WAIT';
          delayDays?: number;
          delayHours?: number;
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
            autoEnrollTrigger: input.autoEnrollTrigger ?? null,
          },
        });
        if (input.steps.length > 0) {
          await tx.cadenceStep.createMany({
            data: input.steps.map((s) => ({
              cadenceId: cadence.id,
              position: s.position,
              type: s.type,
              delayDays: s.delayDays ?? 0,
              delayHours: s.delayHours ?? 0,
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
        autoEnrollTrigger: string | null;
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
        prisma.cadenceEnrollment.findMany({ where: { tenantId, cadenceId }, take: 5000 }),
        prisma.cadenceStep.findMany({ where: { cadenceId }, orderBy: { position: 'asc' }, take: 100 }),
        prisma.stepExecution.findMany({
          where: { enrollment: { tenantId, cadenceId } },
          take: 5000,
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
        // Per-variant outcome counts so an A/B step can be analyzed. Derived
        // from the StepExecution.variant column already recorded by the worker.
        const variantStats = (variant: 'A' | 'B') => {
          const rows = stepExec.filter((e) => e.variant === variant);
          return {
            reached: rows.length,
            executed: rows.filter((e) => e.status === 'EXECUTED').length,
            skipped: rows.filter((e) => e.status === 'SKIPPED').length,
            failed: rows.filter((e) => e.status === 'FAILED').length,
          };
        };
        const hasVariantB = s.variantB !== null && s.variantB !== undefined;
        return {
          position: s.position,
          type: s.type,
          reached,
          completionRate: totalEnrollments ? reached / totalEnrollments : 0,
          exitRate: totalEnrollments ? exited / totalEnrollments : 0,
          emailExecutions: sent,
          abTest: hasVariantB
            ? { enabled: true, variantA: variantStats('A'), variantB: variantStats('B') }
            : { enabled: false },
        };
      });
      return { totalEnrollments, perStep };
    },
  };
}
