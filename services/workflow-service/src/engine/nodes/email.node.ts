import type { ExecutionContext, NodeResult, WorkflowNode } from '../types.js';
import { handleActionNode } from './action.node.js';

export async function handleEmailNode(
  node: WorkflowNode,
  context: ExecutionContext
): Promise<NodeResult> {
  const cfg = (node.config ?? {}) as {
    to?: string;
    subject?: string;
    body?: string;
  };
  const base = process.env.NOTIFICATION_SERVICE_URL ?? 'http://localhost:3003/api/v1';
  return handleActionNode(
    {
      ...node,
      config: {
        url: `${base}/notifications`,
        method: 'POST',
        body: {
          channel: 'EMAIL',
          to: cfg.to,
          subject: cfg.subject ?? 'Workflow email',
          body: cfg.body ?? '',
          executionId: context.executionId,
        },
      },
    },
    context
  );
}
