import type { ExecutionContext, NodeResult, WorkflowNode } from '../types.js';

export async function handleWaitNode(
  node: WorkflowNode,
  _context: ExecutionContext
): Promise<NodeResult> {
  const cfg = (node.config ?? {}) as { amount?: number; unit?: 'minutes' | 'hours' | 'days' };
  const amount = Math.max(1, cfg.amount ?? 1);
  const unitMs =
    cfg.unit === 'days'
      ? 24 * 60 * 60 * 1000
      : cfg.unit === 'hours'
        ? 60 * 60 * 1000
        : 60 * 1000;
  return { pauseUntil: new Date(Date.now() + amount * unitMs), output: { amount, unit: cfg.unit ?? 'minutes' } };
}
