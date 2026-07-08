import { TOPICS, type NexusProducer } from '@nexus/kafka';
import type { ApprovalPrisma } from '../prisma.js';
import type { Prisma } from '../../../../node_modules/.prisma/approval-client/index.js';
import { resolveManager, resolveRoleApprover } from './approver-resolver.js';

type QuorumMode = 'ALL' | 'ANY' | 'N_OF_M';

interface PolicyStep {
  order: number;
  approverType: 'USER' | 'ROLE' | 'MANAGER';
  approverId?: string;
  role?: string;
  canDelegate?: boolean;
  // Quorum config for the level (all PolicySteps sharing the same `order`).
  // Optional: when unset the level behaves as ALL (legacy all-must-approve).
  quorumMode?: QuorumMode;
  quorumSize?: number;
}

// A materialized step carries the level's quorum config. Only the fields the
// level logic needs are typed here so it works against Prisma rows.
interface LevelStep {
  order: number;
  status: string;
  quorumMode?: string | null;
  quorumSize?: number | null;
}

type LevelOutcome = 'PENDING' | 'SATISFIED' | 'FAILED';

/**
 * Normalize a level's quorum config from its steps. All steps at an order share
 * the same config; we read it from the first step and coerce to safe values.
 * ALL   => every step must be APPROVED.
 * ANY   => at least one APPROVED (quorumSize forced to 1).
 * N_OF_M => at least `quorumSize` APPROVED (clamped to [1, level size]).
 */
function levelQuorum(steps: LevelStep[]): { mode: QuorumMode; size: number } {
  const total = steps.length;
  const rawMode = (steps[0]?.quorumMode ?? 'ALL') as QuorumMode;
  const mode: QuorumMode =
    rawMode === 'ANY' || rawMode === 'N_OF_M' || rawMode === 'ALL' ? rawMode : 'ALL';
  if (mode === 'ALL') return { mode, size: total };
  if (mode === 'ANY') return { mode, size: 1 };
  // N_OF_M: clamp requested size into [1, total]; default to total when missing.
  const requested = steps[0]?.quorumSize ?? total;
  const size = Math.max(1, Math.min(total, requested));
  return { mode, size };
}

/**
 * Evaluate a single level (all steps sharing one `order`).
 *   SATISFIED — approvals already meet quorum.
 *   FAILED    — enough rejects/skips that the remaining pending + approved can
 *               no longer reach quorum (early-reject rule).
 *   PENDING   — still resolvable, not yet satisfied.
 * DELEGATED steps are re-pointed (a fresh PENDING step exists at the same
 * order) so they count as neither approved nor a live vote here.
 */
function evaluateLevel(steps: LevelStep[]): LevelOutcome {
  if (steps.length === 0) return 'SATISFIED';
  const { size } = levelQuorum(steps);
  const approved = steps.filter((s) => s.status === 'APPROVED').length;
  const pending = steps.filter((s) => s.status === 'PENDING').length;
  if (approved >= size) return 'SATISFIED';
  // Best achievable = current approvals + everything still pending.
  if (approved + pending < size) return 'FAILED';
  return 'PENDING';
}

/** Distinct level orders present in a set of steps, ascending. */
function levelOrders(steps: LevelStep[]): number[] {
  return [...new Set(steps.map((s) => s.order))].sort((a, b) => a - b);
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
          // A "level" = all steps sharing the same `order`. Quorum config is a
          // per-level property; if multiple PolicySteps at the same order set
          // it, the first one wins (they are expected to agree). Legacy policies
          // omit these fields entirely -> schema defaults (ALL / null) apply,
          // reproducing all-must-approve behavior.
          const orderKey = (step: PolicyStep, i: number) => step.order ?? i;
          const quorumByOrder = new Map<number, { mode: QuorumMode; size: number | null }>();
          steps.forEach((step, i) => {
            const ord = orderKey(step, i);
            if (!quorumByOrder.has(ord) && step.quorumMode) {
              quorumByOrder.set(ord, {
                mode: step.quorumMode,
                size: step.quorumSize ?? null,
              });
            }
          });
          await tx.approvalStep.createMany({
            data: steps.map((step, i) => {
              const ord = orderKey(step, i);
              const q = quorumByOrder.get(ord);
              return {
                requestId: req.id,
                order: ord,
                approverId: resolvedApprovers[i] ?? step.approverId ?? requestedBy,
                status: 'PENDING' as const,
                quorumMode: (q?.mode ?? 'ALL') as QuorumMode,
                quorumSize: q?.mode === 'N_OF_M' ? q.size : null,
              };
            }),
          });
        }
        return req;
      });

      // Carry the resolved approvers on the event so notification-service can alert
      // them (NOT-14) without a follow-up call back into this service.
      const approverIds = Array.from(new Set(resolvedApprovers.filter((a): a is string => Boolean(a))));
      await producer.publish(TOPICS.WORKFLOWS, {
        type: 'approval.request.created',
        tenantId,
        payload: { requestId: created.id, module, recordId, approverIds },
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
      // Group steps into levels (by `order`) and evaluate the just-actioned
      // level's quorum. Legacy single-approver ALL levels reduce to the old
      // "every step APPROVED" behavior exactly.
      const stepsByOrder = (ord: number) => allSteps.filter((s) => s.order === ord);
      const currentLevel = evaluateLevel(stepsByOrder(pendingStep.order));
      if (currentLevel === 'FAILED') {
        // Level can no longer reach quorum -> reject the whole request.
        await prisma.approvalRequest.update({
          where: { id: requestId },
          data: { status: 'REJECTED', comment: comment ?? null },
        });
        await producer.publish(TOPICS.WORKFLOWS, {
          type: 'approval.request.rejected',
          tenantId,
          payload: {
            requestId,
            // requester userId — lets notification-service alert who raised it (NOT-01).
            requestedBy: req.requestedBy,
            module: req.module,
            recordId: req.recordId,
            entityType: (req.data as Record<string, unknown>)?.entityType,
            entityId: (req.data as Record<string, unknown>)?.entityId,
            data: req.data,
            comment,
          },
        });
        return this.getRequest(tenantId, requestId);
      }
      const orders = levelOrders(allSteps);
      const allLevelsSatisfied = orders.every(
        (ord) => evaluateLevel(stepsByOrder(ord)) === 'SATISFIED'
      );
      if (allLevelsSatisfied) {
        await prisma.approvalRequest.update({
          where: { id: requestId },
          data: { status: 'APPROVED' },
        });
        await producer.publish(TOPICS.WORKFLOWS, {
          type: 'approval.request.approved',
          tenantId,
          payload: {
            requestId,
            // requester userId — lets notification-service alert who raised it (NOT-01).
            requestedBy: req.requestedBy,
            module: req.module,
            recordId: req.recordId,
            entityType: (req.data as Record<string, unknown>)?.entityType,
            entityId: (req.data as Record<string, unknown>)?.entityId,
            data: req.data,
          },
        });
      } else {
        // Advance currentStep to the lowest level order that is not yet
        // SATISFIED (i.e. the level still awaiting quorum). Falls back to the
        // incremented value when none remain unresolved.
        const nextLevel = orders.find(
          (ord) => evaluateLevel(stepsByOrder(ord)) !== 'SATISFIED'
        );
        const nextStep = nextLevel ?? req.currentStep + 1;
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
        include: { steps: { orderBy: { order: 'asc' } } },
      });
      if (!req || req.status !== 'PENDING') return null;
      const pendingStep = req.steps.find(
        (s) => s.status === 'PENDING' && s.approverId === approverId
      );
      if (!pendingStep) return null;
      // Record this reject, then re-evaluate the level's quorum. Under a quorum
      // level (ANY / N_OF_M) a single reject does NOT necessarily kill the
      // request — it only fails once the remaining approvals can no longer meet
      // quorum. Legacy single-approver ALL levels fail immediately, as before.
      await prisma.approvalStep.update({
        where: { id: pendingStep.id },
        data: { status: 'REJECTED', comment, actionedAt: new Date() },
      });
      const allSteps = await prisma.approvalStep.findMany({
        where: { requestId },
        orderBy: { order: 'asc' },
        take: 100,
      });
      const stepsByOrder = (ord: number) => allSteps.filter((s) => s.order === ord);
      const levelOutcome = evaluateLevel(stepsByOrder(pendingStep.order));
      if (levelOutcome !== 'FAILED') {
        // Quorum still reachable — keep the request PENDING and advance
        // currentStep to the earliest unsatisfied level (unchanged if this one
        // is still open). Idempotent: does not re-touch resolved levels.
        const orders = levelOrders(allSteps);
        const nextLevel = orders.find(
          (ord) => evaluateLevel(stepsByOrder(ord)) !== 'SATISFIED'
        );
        if (nextLevel !== undefined && nextLevel !== req.currentStep) {
          await prisma.approvalRequest.update({
            where: { id: requestId },
            data: { currentStep: nextLevel },
          });
        }
        return this.getRequest(tenantId, requestId);
      }
      // Level can no longer reach quorum -> request REJECTED.
      await prisma.approvalRequest.update({
        where: { id: requestId },
        data: { status: 'REJECTED', comment },
      });
      await producer.publish(TOPICS.WORKFLOWS, {
        type: 'approval.request.rejected',
        tenantId,
        payload: {
          requestId,
          // requester userId — lets notification-service alert who raised it (NOT-01).
          requestedBy: req.requestedBy,
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
      // request can still be actioned by the delegate. Carry the level's quorum
      // config forward so the level model still evaluates correctly.
      await prisma.approvalStep.create({
        data: {
          requestId,
          order: pendingStep.order,
          approverId: delegateTo,
          status: 'PENDING',
          quorumMode: pendingStep.quorumMode,
          quorumSize: pendingStep.quorumSize,
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
