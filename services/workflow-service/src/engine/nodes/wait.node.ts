import type { ExecutionContext, NodeResult, WorkflowNode } from '../types.js';

export async function handleWaitNode(
  node: WorkflowNode,
  _context: ExecutionContext
): Promise<NodeResult> {
  const cfg = (node.config ?? {}) as {
    amount?: number;
    unit?: 'minutes' | 'hours' | 'days';
    delayDays?: number;
    delayHours?: number;
  };

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
    pauseUntil,
    output: outputMeta,
  };
}
