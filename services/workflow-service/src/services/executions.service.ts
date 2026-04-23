import { NotFoundError } from '@nexus/service-utils';
import type { WorkflowPrisma } from '../prisma.js';
import { WorkflowExecutor } from '../engine/executor.js';
import type { NexusProducer } from '@nexus/kafka';

export function createExecutionsService(prisma: WorkflowPrisma, producer: NexusProducer) {
  const executor = new WorkflowExecutor(prisma, producer);

  return {
    async createExecution(
      tenantId: string,
      workflowId: string,
      triggerType: string,
      triggerPayload: Record<string, unknown>
    ) {
      return prisma.workflowExecution.create({
        data: {
          tenantId,
          workflowId,
          triggerType,
          triggerPayload: triggerPayload as object,
          status: 'RUNNING',
        },
      });
    },

    async runExecution(executionId: string) {
      await executor.run(executionId);
    },

    async listExecutions(tenantId: string, page: number, limit: number) {
      const p = Math.max(1, page);
      const l = Math.min(100, Math.max(1, limit));
      const skip = (p - 1) * l;
      const [total, data] = await prisma.$transaction([
        prisma.workflowExecution.count({ where: { tenantId } }),
        prisma.workflowExecution.findMany({
          where: { tenantId },
          skip,
          take: l,
          orderBy: { startedAt: 'desc' },
        }),
      ]);
      return { data, total, page: p, limit: l, totalPages: Math.max(1, Math.ceil(total / l)) };
    },

    async getExecution(tenantId: string, id: string) {
      const row = await prisma.workflowExecution.findFirst({
        where: { id, tenantId },
        include: { steps: true },
      });
      if (!row) throw new NotFoundError('WorkflowExecution', id);
      return row;
    },

    async getExecutionLog(tenantId: string, id: string) {
      const row = await prisma.workflowExecution.findFirst({ where: { id, tenantId } });
      if (!row) throw new NotFoundError('WorkflowExecution', id);
      return prisma.workflowStep.findMany({
        where: { executionId: id },
        orderBy: { startedAt: 'asc' },
      });
    },

    async cancelExecution(tenantId: string, id: string) {
      const row = await prisma.workflowExecution.findFirst({ where: { id, tenantId } });
      if (!row) throw new NotFoundError('WorkflowExecution', id);
      if (row.status !== 'RUNNING' && row.status !== 'PAUSED') return row;
      return prisma.workflowExecution.update({
        where: { id },
        data: { status: 'CANCELLED', completedAt: new Date() },
      });
    },

    async resumePausedExecutions() {
      const rows = await prisma.workflowExecution.findMany({
        where: { status: 'PAUSED', resumeAt: { lte: new Date() } },
        select: { id: true },
      });
      for (const r of rows) {
        await executor.resume(r.id);
      }
      return rows.length;
    },
  };
}

export type ExecutionsService = ReturnType<typeof createExecutionsService>;
