import { TOPICS, type NexusProducer } from '@nexus/kafka';
import type { ApprovalPrisma } from '../prisma.js';
import type { Prisma } from '../../../../node_modules/.prisma/approval-client/index.js';
import { resolveManager, resolveRoleApprover } from './approver-resolver.js';

interface PolicyStep {
  order: number;
  approverType: 'USER' | 'ROLE' | 'MANAGER';
  approverId?: string;
  role?: string;
  canDelegate?: boolean;
}

/**
 * Resolve the effective approverId for a policy step. Always returns a usable
 * (non-empty) id — falls back to `requestedBy` when the approverType cannot be
 * resolved, preserving the pre-existing behavior. Never throws.
 */
async function resolveStepApprover(
  step: PolicyStep,
  tenantId: string,
  requestedBy: string
): Promise<string> {
  try {
    const type = step.approverType ?? 'USER';
    if (type === 'ROLE' && step.role) {
      const resolved = await resolveRoleApprover(tenantId, step.role);
      if (resolved) return resolved;
    } else if (type === 'MANAGER') {
      const resolved = await resolveManager(tenantId, requestedBy);
      if (resolved) return resolved;
    }
  } catch {
    /* fall through to default */
  }
  return step.approverId ?? requestedBy;
}

function getRequestInternal(prisma: ApprovalPrisma, tenantId: string, id: string) {
  return prisma.approvalRequest.findFirst({
    where: { tenantId, id },
    include: { steps: { orderBy: { order: 'asc' } }, policy: true },
  });
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
      // Resolve ROLE / MANAGER approvers up front (guarded, best-effort I/O).
      // Falls back to step.approverId ?? requestedBy when resolution fails so
      // the existing path is never broken.
      const resolvedApprovers = await Promise.all(
        steps.map((step) => resolveStepApprover(step, tenantId, requestedBy))
      );
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
              approverId: resolvedApprovers[i] ?? step.approverId ?? requestedBy,
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
      return getRequestInternal(prisma, tenantId, id);
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
      // Step ordering gate: a step may only be approved once every step with a
      // lower `order` is resolved (APPROVED / SKIPPED / DELEGATED — DELEGATED
      // steps are re-pointed but still pending, so treat only non-PENDING lower
      // steps as cleared). Reject out-of-order approvals.
      const hasEarlierPending = req.steps.some(
        (s) => s.order < pendingStep.order && s.status === 'PENDING'
      );
      if (hasEarlierPending) return null;
      await prisma.approvalStep.update({
        where: { id: pendingStep.id },
        data: { status: 'APPROVED', comment, actionedAt: new Date() },
      });
      const allSteps = await prisma.approvalStep.findMany({
        where: { requestId },
        orderBy: { order: 'asc' },
        take: 100,
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
          payload: {
            requestId,
            module: req.module,
            recordId: req.recordId,
            entityType: (req.data as Record<string, unknown>)?.entityType,
            entityId: (req.data as Record<string, unknown>)?.entityId,
            data: req.data,
          },
        });
      } else {
        // Advance currentStep in order: point it at the lowest-ordered step
        // that is still PENDING. Falls back to the incremented value if none.
        const nextPending = allSteps
          .filter((s) => s.status === 'PENDING')
          .sort((a, b) => a.order - b.order)[0];
        const nextStep = nextPending ? nextPending.order : req.currentStep + 1;
        await prisma.approvalRequest.update({
          where: { id: requestId },
          data: { currentStep: nextStep },
        });
        await producer.publish(TOPICS.WORKFLOWS, {
          type: 'approval.step.advanced',
          tenantId,
          payload: { requestId, currentStep: nextStep },
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
        payload: {
          requestId,
          module: req.module,
          recordId: req.recordId,
          entityType: (req.data as Record<string, unknown>)?.entityType,
          entityId: (req.data as Record<string, unknown>)?.entityId,
          data: req.data,
          comment,
        },
      });
      return this.getRequest(tenantId, requestId);
    },

    /**
     * Delegate the current pending step to another approver. Honors the
     * PolicyStep.canDelegate flag for the matching step order — rejects when the
     * step is not delegable. Sets the step status to DELEGATED and re-points its
     * approverId to `delegateTo`. Returns { error } discriminants so the route
     * can map to the right HTTP status.
     */
    async delegate(
      tenantId: string,
      requestId: string,
      approverId: string,
      delegateTo: string,
      comment?: string
    ): Promise<
      | { error: 'NOT_FOUND' | 'NOT_APPROVER' | 'NOT_DELEGABLE' | 'INVALID_TARGET' }
      | { request: Awaited<ReturnType<typeof getRequestInternal>>; error?: undefined }
    > {
      if (!delegateTo || delegateTo === approverId) return { error: 'INVALID_TARGET' };
      const req = await prisma.approvalRequest.findFirst({
        where: { tenantId, id: requestId },
        include: { steps: { orderBy: { order: 'asc' } }, policy: true },
      });
      if (!req || req.status !== 'PENDING') return { error: 'NOT_FOUND' };
      const pendingStep = req.steps.find(
        (s) => s.status === 'PENDING' && s.approverId === approverId
      );
      if (!pendingStep) return { error: 'NOT_APPROVER' };
      // Look up the matching PolicyStep (by order) to check canDelegate.
      const policySteps = ((req.policy?.steps as unknown[]) ?? []) as PolicyStep[];
      const policyStep = policySteps.find((s) => (s.order ?? 0) === pendingStep.order);
      if (!policyStep?.canDelegate) return { error: 'NOT_DELEGABLE' };
      await prisma.approvalStep.update({
        where: { id: pendingStep.id },
        data: { status: 'DELEGATED', approverId: delegateTo, comment: comment ?? null },
      });
      // Create a fresh PENDING step for the delegate at the same order so the
      // request can still be actioned by the delegate.
      await prisma.approvalStep.create({
        data: {
          requestId,
          order: pendingStep.order,
          approverId: delegateTo,
          status: 'PENDING',
        },
      });
      await producer.publish(TOPICS.WORKFLOWS, {
        type: 'approval.step.delegated',
        tenantId,
        payload: {
          requestId,
          module: req.module,
          recordId: req.recordId,
          order: pendingStep.order,
          from: approverId,
          to: delegateTo,
        },
      });
      return { request: await getRequestInternal(prisma, tenantId, requestId) };
    },

    /**
     * Escalation sweep: find PENDING requests older than `olderThan` and mark
     * the request + its still-pending steps as ESCALATED. Guarded per-request so
     * one bad row never aborts the whole sweep, and Kafka publish failures are
     * swallowed. Returns the number of requests escalated.
     */
    async escalatePending(olderThan: Date): Promise<number> {
      const stale = await prisma.approvalRequest.findMany({
        where: { status: 'PENDING', createdAt: { lt: olderThan } },
        include: { steps: true },
        take: 100,
      });
      let escalated = 0;
      for (const req of stale) {
        try {
          await prisma.$transaction([
            prisma.approvalStep.updateMany({
              where: { requestId: req.id, status: 'PENDING' },
              data: { status: 'SKIPPED' },
            }),
            prisma.approvalRequest.update({
              where: { id: req.id },
              data: { status: 'ESCALATED' },
            }),
          ]);
          escalated += 1;
          try {
            await producer.publish(TOPICS.WORKFLOWS, {
              type: 'approval.request.escalated',
              tenantId: req.tenantId,
              payload: {
                requestId: req.id,
                module: req.module,
                recordId: req.recordId,
                currentStep: req.currentStep,
              },
            });
          } catch {
            /* Kafka hiccup — status already persisted, ignore */
          }
        } catch {
          /* DB hiccup on one request — continue with the rest */
        }
      }
      return escalated;
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
