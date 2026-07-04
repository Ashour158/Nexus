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

    /**
     * Resume a PAUSED execution that is waiting on an APPROVAL_REQUEST node,
     * following the approved/rejected branch. Delegates idempotency + branch
     * selection to the executor. Returns true when a resume was performed.
     */
    async resumeFromApproval(executionId: string, outcome: 'approved' | 'rejected') {
      return executor.resumeFromApproval(executionId, outcome);
    },

    /**
     * Correlate an approval event back to the PAUSED workflow execution that
     * created it. We only ever edit workflow-service, so we cannot guarantee
     * the approval-service echoes our `workflowExecutionId` back in the event.
     * Two strategies, most reliable first:
     *   1. An explicit workflowExecutionId carried in the event payload (or its
     *      nested `data` / `metadata`). Verified to be a PAUSED execution.
     *   2. The approval `requestId`: the APPROVAL_REQUEST node stored the
     *      approval-service request id on its WorkflowStep output as
     *      `approvalRequestId`. Find that step, then its PAUSED execution.
     */
    async findPausedExecutionForApproval(
      tenantId: string,
      payload: Record<string, unknown>
    ): Promise<string | null> {
      const nested = (payload.data ?? payload.metadata) as Record<string, unknown> | undefined;
      const explicit =
        (payload.workflowExecutionId as string | undefined) ??
        (nested?.workflowExecutionId as string | undefined);

      if (typeof explicit === 'string' && explicit.length > 0) {
        const exec = await prisma.workflowExecution.findFirst({
          where: { id: explicit, tenantId, status: 'PAUSED' },
          select: { id: true },
        });
        if (exec) return exec.id;
      }

      const requestId =
        (payload.requestId as string | undefined) ??
        (payload.approvalRequestId as string | undefined) ??
        (nested?.requestId as string | undefined);
      if (typeof requestId !== 'string' || requestId.length === 0) return null;

      // The approval node persisted `approvalRequestId` on its step output.
      const step = await prisma.workflowStep.findFirst({
        where: {
          nodeType: 'APPROVAL_REQUEST',
          execution: { tenantId, status: 'PAUSED' },
          output: { path: ['approvalRequestId'], equals: requestId },
        },
        orderBy: { startedAt: 'desc' },
        select: { executionId: true },
      });
      return step?.executionId ?? null;
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

    async getExecutionLog(tenantId: string, id: string, limit = 100) {
      const row = await prisma.workflowExecution.findFirst({ where: { id, tenantId } });
      if (!row) throw new NotFoundError('WorkflowExecution', id);
      return prisma.workflowStep.findMany({
        where: { executionId: id },
        orderBy: { startedAt: 'asc' },
        take: Math.min(500, Math.max(1, limit)),
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
