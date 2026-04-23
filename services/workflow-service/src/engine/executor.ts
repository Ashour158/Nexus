import type { NexusProducer } from '@nexus/kafka';
import type { WorkflowPrisma } from '../prisma.js';
import type { ExecutionContext, NodeResult, WorkflowEdge, WorkflowNode } from './types.js';
import { handleActionNode } from './nodes/action.node.js';
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
    let currentNodeId = execution.currentNodeId ?? nodes[0]?.id ?? null;

    const context: ExecutionContext = {
      tenantId: execution.tenantId,
      executionId: execution.id,
      workflowId: execution.workflowId,
      triggerPayload: (execution.triggerPayload ?? {}) as Record<string, unknown>,
      currentNodeId,
    };

    try {
      while (currentNodeId) {
        const node = nodeById.get(currentNodeId);
        if (!node) break;
        context.currentNodeId = currentNodeId;
        await this.prisma.workflowStep.create({
          data: {
            executionId: execution.id,
            nodeId: node.id,
            nodeType: node.type,
            status: 'RUNNING',
            input: context.triggerPayload,
            startedAt: new Date(),
          },
        });

        const result = await this.executeNode(node, context);
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
              currentNodeId: node.id,
              resumeAt: result.pauseUntil,
            },
          });
          return;
        }

        if (result.nextNodeId !== undefined) {
          currentNodeId = result.nextNodeId;
        } else {
          const edge = edges.find((e) => e.from === node.id);
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

  private async executeNode(
    node: WorkflowNode,
    context: ExecutionContext
  ): Promise<NodeResult> {
    switch (node.type) {
      case 'TRIGGER':
        return handleTriggerNode(node, context);
      case 'CONDITION':
        return handleConditionNode(node, context);
      case 'WAIT':
        return handleWaitNode(node, context);
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
        return handleForkNode(node, context);
      case 'JOIN':
        return handleJoinNode(node, context);
      case 'END':
        return handleEndNode(node, context);
      default:
        throw new Error(`Unsupported workflow node type: ${node.type}`);
    }
  }
}
