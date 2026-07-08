import type { ExecutionContext, NodeResult, WorkflowEdge, WorkflowNode } from '../types.js';

export async function handleWaitNode(
  node: WorkflowNode,
  _context: ExecutionContext,
  edges: WorkflowEdge[]
): Promise<NodeResult> {
  const cfg = (node.config ?? {}) as {
    amount?: number;
    unit?: 'minutes' | 'hours' | 'days';
    delayDays?: number;
    delayHours?: number;
  };

  // Resolve the node to continue from once the delay elapses: the WAIT node's
  // outgoing edge target (prefer an unconditional edge, else the first edge).
  // The execution is persisted with THIS as its currentNodeId while paused, so
  // on resume the executor re-enters the node AFTER the wait — not the wait
  // node itself (which would re-arm the timer and stall forever).
  const outgoing = edges.filter((e) => e.from === node.id);
  const nextNodeId = (outgoing.find((e) => !e.condition) ?? outgoing[0])?.to ?? null;

  // No onward edge — a terminal WAIT has nothing to wait for. Complete now
  // rather than pausing (pausing with a null target would park the execution
  // back on the wait node and stall). Returning null + no pauseUntil lets the
  // executor follow its normal "no next node" path to COMPLETED.
  if (!nextNodeId) {
    return {
      nextNodeId: null,
      output: { status: 'COMPLETED', reason: 'WAIT node has no outgoing edge' },
    };
  }

  let pauseUntil: Date;
  let resumeAtIso: string;
  let outputMeta: Record<string, unknown>;

  if (typeof cfg.delayHours === 'number' && cfg.delayHours > 0) {
    const ms = cfg.delayHours * 60 * 60 * 1000;
    pauseUntil = new Date(Date.now() + ms);
    resumeAtIso = pauseUntil.toISOString();
    outputMeta = { status: 'PAUSED', resumeAt: resumeAtIso, delayHours: cfg.delayHours };
  } else if (typeof cfg.delayDays === 'number' && cfg.delayDays >= 0) {
    const ms = cfg.delayDays * 24 * 60 * 60 * 1000;
    pauseUntil = new Date(Date.now() + ms);
    resumeAtIso = pauseUntil.toISOString();
    outputMeta = { status: 'PAUSED', resumeAt: resumeAtIso, delayDays: cfg.delayDays };
  } else {
    const amount = Math.max(1, cfg.amount ?? 1);
    const unitMs =
      cfg.unit === 'days'
        ? 24 * 60 * 60 * 1000
        : cfg.unit === 'hours'
          ? 60 * 60 * 1000
          : 60 * 1000;
    pauseUntil = new Date(Date.now() + amount * unitMs);
    resumeAtIso = pauseUntil.toISOString();
    outputMeta = {
      status: 'PAUSED',
      resumeAt: resumeAtIso,
      amount,
      unit: cfg.unit ?? 'minutes',
    };
  }

  return {
    // Persisted as the execution's currentNodeId while paused, so the resume
    // poller continues FROM the node after the wait instead of re-entering it.
    nextNodeId,
    pauseUntil,
    output: outputMeta,
  };
}
