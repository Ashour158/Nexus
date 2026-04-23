import type { ExecutionContext, NodeResult, WorkflowNode } from '../types.js';
import { handleActionNode } from './action.node.js';

export async function handleNotifyNode(
  node: WorkflowNode,
  context: ExecutionContext
): Promise<NodeResult> {
  const cfg = (node.config ?? {}) as {
    userIdField?: string;
    title?: string;
    body?: string;
    actionUrl?: string;
  };
  const base = process.env.NOTIFICATION_SERVICE_URL ?? 'http://localhost:3003/api/v1';
  const userId = String(context.triggerPayload[cfg.userIdField ?? 'ownerId'] ?? '');
  return handleActionNode(
    {
      ...node,
      config: {
        url: `${base}/notifications`,
        method: 'POST',
        body: {
          userId,
          type: 'workflow.notify',
          title: cfg.title ?? 'Workflow notification',
          body: cfg.body ?? 'Workflow step executed',
          actionUrl: cfg.actionUrl,
          metadata: { executionId: context.executionId },
        },
      },
    },
    context
  );
}
