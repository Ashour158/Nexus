import { TOPICS, type NexusProducer } from '@nexus/kafka';
import type { ApprovalPrisma } from '../prisma.js';
import type { Prisma } from '../../../../node_modules/.prisma/approval-client/index.js';

interface PolicyStep {
  order: number;
  approverType: 'USER' | 'ROLE' | 'MANAGER';
  approverId?: string;
  role?: string;
  canDelegate?: boolean;
}

export function createRequestsService(prisma: ApprovalPrisma, producer: NexusProducer) {
  return {
    async createRequest(
      tenantId: string,
      policyId: string,
      module: string,
      recordId: string,
      requestedBy: string,
      data: Record<string, unknown>
    ) {
      const policy = await prisma.approvalPolicy.findFirst({
        where: { id: policyId, tenantId, isActive: true },
      });
      if (!policy) return null;
      const steps = ((policy.steps as unknown[]) ?? []) as PolicyStep[];
      const created = await prisma.$transaction(async (tx) => {
        const req = await tx.approvalRequest.create({
          data: {
            tenantId,
            policyId,
            module,
            recordId,
            requestedBy,
            data: data as Prisma.InputJsonValue,
            status: 'PENDING',
            currentStep: 0,
          },
        });
        if (steps.length > 0) {
          await tx.approvalStep.createMany({
            data: steps.map((step, i) => ({
              requestId: req.id,
              order: step.order ?? i,
              approverId: step.approverId ?? requestedBy,
              status: 'PENDING',
            })),
          });
        }
        return req;
      });

      await producer.publish(TOPICS.WORKFLOWS, {
        type: 'approval.request.created',
        tenantId,
        payload: { requestId: created.id, module, recordId },
      });
      return this.getRequest(tenantId, created.id);
    },

    async getRequest(tenantId: string, id: string) {
      return prisma.approvalRequest.findFirst({
        where: { tenantId, id },
        include: { steps: { orderBy: { order: 'asc' } }, policy: true },
      });
    },

    async listRequests(
      tenantId: string,
      module: string | undefined,
      recordId: string | undefined,
      status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ESCALATED' | 'CANCELLED' | undefined,
      page: number,
      limit: number
    ) {
      const where = { tenantId, module, recordId, status };
      const [data, total] = await Promise.all([
        prisma.approvalRequest.findMany({
          where,
          include: { steps: true },
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.approvalRequest.count({ where }),
      ]);
      return { data, total, page, limit };
    },

    async listMyPendingRequests(
      tenantId: string,
      approverId: string,
      page: number,
      limit: number
    ) {
      const where = {
        tenantId,
        status: 'PENDING' as const,
        steps: { some: { approverId, status: 'PENDING' as const } },
      };
      const [data, total] = await Promise.all([
        prisma.approvalRequest.findMany({
          where,
          include: { steps: true },
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.approvalRequest.count({ where }),
      ]);
      return { data, total, page, limit };
    },

    async approve(
      tenantId: string,
      requestId: string,
      approverId: string,
      comment?: string
    ) {
      const req = await prisma.approvalRequest.findFirst({
        where: { tenantId, id: requestId },
        include: { steps: { orderBy: { order: 'asc' } } },
      });
      if (!req || req.status !== 'PENDING') return null;
      const pendingStep = req.steps.find(
        (s) => s.status === 'PENDING' && s.approverId === approverId
      );
      if (!pendingStep) return null;
      await prisma.approvalStep.update({
        where: { id: pendingStep.id },
        data: { status: 'APPROVED', comment, actionedAt: new Date() },
      });
      const allSteps = await prisma.approvalStep.findMany({
        where: { requestId },
        orderBy: { order: 'asc' },
      });
      const allApproved = allSteps.every((s) => s.status === 'APPROVED');
      if (allApproved) {
        await prisma.approvalRequest.update({
          where: { id: requestId },
          data: { status: 'APPROVED' },
        });
        await producer.publish(TOPICS.WORKFLOWS, {
          type: 'approval.request.approved',
          tenantId,
          payload: { requestId },
        });
      } else {
        await prisma.approvalRequest.update({
          where: { id: requestId },
          data: { currentStep: req.currentStep + 1 },
        });
        await producer.publish(TOPICS.WORKFLOWS, {
          type: 'approval.step.advanced',
          tenantId,
          payload: { requestId, currentStep: req.currentStep + 1 },
        });
      }
      return this.getRequest(tenantId, requestId);
    },

    async reject(
      tenantId: string,
      requestId: string,
      approverId: string,
      comment: string
    ) {
      const req = await prisma.approvalRequest.findFirst({
        where: { tenantId, id: requestId },
        include: { steps: true },
      });
      if (!req || req.status !== 'PENDING') return null;
      const pendingStep = req.steps.find(
        (s) => s.status === 'PENDING' && s.approverId === approverId
      );
      if (!pendingStep) return null;
      await prisma.$transaction([
        prisma.approvalStep.update({
          where: { id: pendingStep.id },
          data: { status: 'REJECTED', comment, actionedAt: new Date() },
        }),
        prisma.approvalRequest.update({
          where: { id: requestId },
          data: { status: 'REJECTED', comment },
        }),
      ]);
      await producer.publish(TOPICS.WORKFLOWS, {
        type: 'approval.request.rejected',
        tenantId,
        payload: { requestId, comment },
      });
      return this.getRequest(tenantId, requestId);
    },

    async cancel(
      tenantId: string,
      requestId: string,
      requestedBy: string,
      isAdmin: boolean
    ) {
      const req = await prisma.approvalRequest.findFirst({
        where: { tenantId, id: requestId },
      });
      if (!req) return null;
      if (!isAdmin && req.requestedBy !== requestedBy) return null;
      return prisma.approvalRequest.update({
        where: { id: requestId },
        data: { status: 'CANCELLED' },
      });
    },
  };
}
