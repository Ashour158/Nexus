import type { NexusProducer } from '@nexus/kafka';
import type { WorkflowPrisma } from '../prisma.js';
import type { ExecutionContext, NodeResult, WorkflowEdge, WorkflowNode } from './types.js';
import { handleActionNode } from './nodes/action.node.js';
import { handleApprovalRequestNode } from './nodes/approval-request.node.js';
import { handleAssignNode } from './nodes/assign.node.js';
import { handleConditionNode } from './nodes/condition.node.js';
import { handleCreateActivityNode } from './nodes/create-activity.node.js';
import { handleCreateTaskNode } from './nodes/create-task.node.js';
import { handleEmailNode } from './nodes/email.node.js';
import { handleEndNode } from './nodes/end.node.js';
import { handleForkNode } from './nodes/fork.node.js';
import { handleJoinNode } from './nodes/join.node.js';
import { handleNotifyNode } from './nodes/notify.node.js';
import { handleSetFieldNode } from './nodes/set-field.node.js';
import { handleTriggerNode } from './nodes/trigger.node.js';
import { handleSlaCheckNode } from './nodes/sla-check.node.js';
import { handleValidationRuleNode } from './nodes/validation-rule.node.js';
import { handleWaitNode } from './nodes/wait.node.js';
import { handleWebhookNode } from './nodes/webhook.node.js';

function asNodes(value: unknown): WorkflowNode[] {
  return Array.isArray(value) ? (value as WorkflowNode[]) : [];
}
function asEdges(value: unknown): WorkflowEdge[] {
  return Array.isArray(value) ? (value as WorkflowEdge[]) : [];
}

export class WorkflowExecutor {
  constructor(
    private readonly prisma: WorkflowPrisma,
    private readonly producer: NexusProducer
  ) {}

  async run(executionId: string): Promise<void> {
    const execution = await this.prisma.workflowExecution.findUnique({
      where: { id: executionId },
      include: { workflow: true },
    });
    if (!execution) return;

    const nodes = asNodes(execution.workflow.nodes);
    const edges = asEdges(execution.workflow.edges);
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    let currentNodeId: string | null = execution.currentNodeId ?? nodes[0]?.id ?? null;

    const context: ExecutionContext = {
      tenantId: execution.tenantId,
      executionId: execution.id,
      workflowId: execution.workflowId,
      triggerPayload: (execution.triggerPayload ?? {}) as Record<string, unknown>,
      currentNodeId,
      producer: this.producer,
    };

    const visitedCount = new Map<string, number>();
    const CYCLE_LIMIT = 100;

    try {
      while (currentNodeId) {
        const node = nodeById.get(currentNodeId);
        if (!node) break;
        context.currentNodeId = currentNodeId;

        // Cycle detection — safety cap
        const visits = (visitedCount.get(currentNodeId) ?? 0) + 1;
        visitedCount.set(currentNodeId, visits);
        if (visits > CYCLE_LIMIT) {
          throw new Error(`Cycle limit exceeded at node ${currentNodeId}`);
        }
        await this.prisma.workflowStep.create({
          data: {
            executionId: execution.id,
            nodeId: node.id,
            nodeType: node.type,
            status: 'RUNNING',
            input: context.triggerPayload as object,
            startedAt: new Date(),
          },
        });

        const result = await this.executeNode(node, context, edges);
        const latestStep = await this.prisma.workflowStep.findFirst({
          where: { executionId: execution.id, nodeId: node.id },
          orderBy: { startedAt: 'desc' },
        });
        if (latestStep) {
          await this.prisma.workflowStep.update({
            where: { id: latestStep.id },
            data: {
              status: 'COMPLETED',
              output: (result.output ?? {}) as object,
              completedAt: new Date(),
            },
          });
        }

        if (result.pauseUntil) {
          await this.prisma.workflowExecution.update({
            where: { id: execution.id },
            data: {
              status: 'PAUSED',
              currentNodeId: result.nextNodeId ?? node.id,
              resumeAt: result.pauseUntil,
            },
          });
          return;
        }

        if (result.nextNodeId !== undefined) {
          currentNodeId = result.nextNodeId;
        } else {
          // Follow unconditional outgoing edge; if multiple exist, pick first
          const outgoing = edges.filter((e) => e.from === node.id);
          const edge = outgoing.find((e) => !e.condition) ?? outgoing[0];
          currentNodeId = edge?.to ?? null;
        }

        await this.prisma.workflowExecution.update({
          where: { id: execution.id },
          data: { currentNodeId },
        });
      }

      await this.prisma.workflowExecution.update({
        where: { id: execution.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          currentNodeId: null,
          resumeAt: null,
        },
      });
      await this.producer.publish('nexus.automation.workflows', {
        type: 'workflow.completed' as never,
        tenantId: execution.tenantId,
        payload: { executionId: execution.id, workflowId: execution.workflowId } as never,
      });

      if (execution.parentExecId) {
        await this.prisma.workflowExecution.update({
          where: { id: execution.parentExecId },
          data: { resumeAt: new Date() }, // resume parent immediately after child branch completes
        });
        await this.resume(execution.parentExecId);
      }
    } catch (err) {
      await this.prisma.workflowExecution.update({
        where: { id: execution.id },
        data: {
          status: 'FAILED',
          error: err instanceof Error ? err.message : String(err),
          completedAt: new Date(),
        },
      });
      const step = await this.prisma.workflowStep.findFirst({
        where: { executionId: execution.id },
        orderBy: { startedAt: 'desc' },
      });
      if (step) {
        await this.prisma.workflowStep.update({
          where: { id: step.id },
          data: {
            status: 'FAILED',
            error: err instanceof Error ? err.message : String(err),
            completedAt: new Date(),
          },
        });
      }
      throw err;
    }
  }

  async resume(executionId: string): Promise<void> {
    const execution = await this.prisma.workflowExecution.findUnique({
      where: { id: executionId },
    });
    if (!execution || execution.status !== 'PAUSED') return;
    if (!execution.resumeAt || execution.resumeAt.getTime() > Date.now()) return;
    await this.prisma.workflowExecution.update({
      where: { id: executionId },
      data: { status: 'RUNNING', resumeAt: null },
    });
    await this.run(executionId);
  }

  /**
   * Resume a PAUSED execution that is waiting on an APPROVAL_REQUEST node.
   *
   * The execution is paused with `currentNodeId` pointing at the approval node.
   * On resume we advance from that node along the approved- or rejected-branch
   * edge (identified by the edge's `condition` label), falling back to the
   * default unconditional edge when the workflow does not model branches.
   *
   * Idempotent: only a PAUSED execution whose `currentNodeId` is still the
   * approval node is resumed. Flipping the status to RUNNING (in a conditional
   * update) is the guard that prevents a duplicate approval event from
   * double-resuming the same execution.
   *
   * Returns `true` when this call performed the resume, `false` when it was a
   * no-op (not found / not paused / already resumed).
   */
  async resumeFromApproval(
    executionId: string,
    outcome: 'approved' | 'rejected'
  ): Promise<boolean> {
    const execution = await this.prisma.workflowExecution.findUnique({
      where: { id: executionId },
      include: { workflow: true },
    });
    if (!execution || execution.status !== 'PAUSED') return false;

    const nodes = asNodes(execution.workflow.nodes);
    const edges = asEdges(execution.workflow.edges);
    const approvalNodeId = execution.currentNodeId;
    if (!approvalNodeId) return false;
    const approvalNode = nodes.find((n) => n.id === approvalNodeId);
    // Only resume executions that are genuinely parked on an approval node.
    if (!approvalNode || approvalNode.type !== 'APPROVAL_REQUEST') return false;

    // Pick the next node: prefer an edge whose condition matches the outcome
    // (e.g. condition 'approved'/'rejected', or 'true'/'false'), else the
    // default unconditional edge, else any outgoing edge.
    const outgoing = edges.filter((e) => e.from === approvalNodeId);
    const wantLabels =
      outcome === 'approved'
        ? ['approved', 'approve', 'true', 'yes']
        : ['rejected', 'reject', 'false', 'no', 'denied'];
    const labelled = outgoing.find(
      (e) => typeof e.condition === 'string' && wantLabels.includes(e.condition.trim().toLowerCase())
    );
    const nextNodeId =
      labelled?.to ?? outgoing.find((e) => !e.condition)?.to ?? outgoing[0]?.to ?? null;

    // Idempotency guard: atomically claim the resume. Only one event wins the
    // transition PAUSED -> RUNNING for this specific approval node.
    const claim = await this.prisma.workflowExecution.updateMany({
      where: { id: executionId, status: 'PAUSED', currentNodeId: approvalNodeId },
      data: { status: 'RUNNING', currentNodeId: nextNodeId, resumeAt: null },
    });
    if (claim.count === 0) return false; // lost the race / already resumed

    // Record the approval outcome as a step for traceability.
    try {
      await this.prisma.workflowStep.create({
        data: {
          executionId,
          nodeId: approvalNodeId,
          nodeType: 'APPROVAL_REQUEST',
          status: 'COMPLETED',
          input: {} as object,
          output: { approvalOutcome: outcome, resolvedNextNodeId: nextNodeId } as object,
          startedAt: new Date(),
          completedAt: new Date(),
        },
      });
    } catch {
      // Step logging is best-effort; never block the resume on it.
    }

    if (!nextNodeId) {
      // No onward edge — treat the approval as the terminal step.
      await this.prisma.workflowExecution.update({
        where: { id: executionId },
        data: { status: 'COMPLETED', completedAt: new Date(), currentNodeId: null, resumeAt: null },
      });
      return true;
    }

    await this.run(executionId);
    return true;
  }

  private async executeNode(
    node: WorkflowNode,
    context: ExecutionContext,
    edges: WorkflowEdge[]
  ): Promise<NodeResult> {
    switch (node.type) {
      case 'TRIGGER':
        return handleTriggerNode(node, context);
      case 'CONDITION':
        return handleConditionNode(node, context, edges);
      case 'WAIT':
        return handleWaitNode(node, context, edges);
      case 'ACTION':
        return handleActionNode(node, context);
      case 'EMAIL':
        return handleEmailNode(node, context);
      case 'WEBHOOK':
        return handleWebhookNode(node, context);
      case 'SET_FIELD':
        return handleSetFieldNode(node, context);
      case 'CREATE_ACTIVITY':
        return handleCreateActivityNode(node, context);
      case 'CREATE_TASK':
        return handleCreateTaskNode(node, context);
      case 'ASSIGN':
        return handleAssignNode(node, context);
      case 'NOTIFY':
        return handleNotifyNode(node, context);
      case 'FORK':
        return handleForkNode(node, context, this.prisma, this.producer);
      case 'JOIN':
        return handleJoinNode(node, context, this.prisma);
      case 'END':
        return handleEndNode(node, context);
      case 'APPROVAL_REQUEST':
        return handleApprovalRequestNode(node, context);
      case 'VALIDATION_RULE':
        return handleValidationRuleNode(node, context, edges);
      case 'SLA_CHECK':
        return handleSlaCheckNode(node, context, edges);
      default:
        throw new Error(`Unsupported workflow node type: ${String(node.type)}`);
    }
  }
}
  