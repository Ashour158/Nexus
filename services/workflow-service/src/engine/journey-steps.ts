/**
 * CommandCenter journey step definitions + execution adapter.
 *
 * Journeys are step-based (not graph/edge-based like WorkflowTemplate) but they
 * REUSE the workflow node handlers for their side-effects: a journey ACTION /
 * EMAIL / SET_FIELD / assign step is executed through the very same
 * `handleActionNode` / `handleEmailNode` / … primitives the workflow engine uses,
 * and CONDITION/BRANCH evaluation reuses the same operator semantics as
 * `condition.node.ts` / `trigger.consumer.ts`.
 *
 * A journey step is a plain object:
 *   { id, type, config, nextStepId?, branches?: [{ condition, nextStepId }] }
 *
 * type ∈ WAIT | ACTION | EMAIL | CONDITION | BRANCH | GOAL | EXIT
 */
import type { ExecutionContext, NodeResult, WorkflowNode } from './types.js';
import { handleActionNode } from './nodes/action.node.js';
import { handleEmailNode } from './nodes/email.node.js';
import { handleNotifyNode } from './nodes/notify.node.js';
import { handleSetFieldNode } from './nodes/set-field.node.js';
import { handleAssignNode } from './nodes/assign.node.js';
import { handleCreateTaskNode } from './nodes/create-task.node.js';

export type JourneyStepType =
  | 'WAIT'
  | 'ACTION'
  | 'EMAIL'
  | 'CONDITION'
  | 'BRANCH'
  | 'GOAL'
  | 'EXIT';

export interface JourneyBranch {
  // A condition object { field, operator, value } evaluated against context, OR
  // the literal string 'default'/'else' for the fallback branch.
  condition: JourneyCondition | 'default' | 'else';
  nextStepId: string;
}

export interface JourneyStep {
  id: string;
  type: JourneyStepType;
  config?: Record<string, unknown>;
  nextStepId?: string | null;
  branches?: JourneyBranch[];
}

export interface JourneyCondition {
  field?: string;
  operator?: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in';
  value?: unknown;
}

/**
 * Outcome of executing a single journey step.
 *   - nextStepId: string  → advance to this step
 *   - nextStepId: null    → journey should complete (GOAL/EXIT or dangling)
 *   - resumeAt: Date      → WAIT; park the enrollment until then, resume at nextStepId
 */
export interface JourneyStepResult {
  nextStepId?: string | null;
  resumeAt?: Date | null;
  output?: Record<string, unknown>;
  /** GOAL vs EXIT distinction for the final enrollment status. */
  terminal?: 'COMPLETED' | 'EXITED';
}

// ── Shared operator evaluation (mirrors condition.node.ts / trigger.consumer) ──

function readField(payload: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, k) => {
    if (!acc || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[k];
  }, payload);
}

export function evaluateCondition(
  cond: JourneyCondition,
  context: Record<string, unknown>
): boolean {
  if (!cond.field || !cond.operator) return true;
  const actual = readField(context, cond.field);
  const expected = cond.value;
  switch (cond.operator) {
    case 'eq':
      return actual === expected;
    case 'neq':
      return actual !== expected;
    case 'gt':
      return Number(actual) > Number(expected);
    case 'gte':
      return Number(actual) >= Number(expected);
    case 'lt':
      return Number(actual) < Number(expected);
    case 'lte':
      return Number(actual) <= Number(expected);
    case 'contains':
      return String(actual).includes(String(expected));
    case 'in':
      return Array.isArray(expected) && (expected as unknown[]).includes(actual);
    default:
      return true;
  }
}

/**
 * Evaluate a { conditions?, match? } rule-set (used by entryTrigger + exitCriteria).
 */
export function evaluateRuleSet(
  ruleSet: unknown,
  context: Record<string, unknown>
): boolean {
  if (!ruleSet || typeof ruleSet !== 'object') return true;
  const rs = ruleSet as { conditions?: JourneyCondition[]; match?: 'all' | 'any' };
  const conditions = Array.isArray(rs.conditions) ? rs.conditions : [];
  if (conditions.length === 0) return true;
  const results = conditions.map((c) => evaluateCondition(c, context));
  return (rs.match ?? 'all') === 'any' ? results.some(Boolean) : results.every(Boolean);
}

// ── Parse / validate a steps array ──────────────────────────────────────────

export function parseSteps(value: unknown): JourneyStep[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (s): s is JourneyStep =>
      !!s && typeof s === 'object' && typeof (s as JourneyStep).id === 'string'
  );
}

// ── Step execution ───────────────────────────────────────────────────────────

/**
 * Execute one journey step. Side-effecting steps (ACTION/EMAIL) delegate to the
 * shared workflow node handlers, adapting the journey step to a WorkflowNode and
 * the enrollment `context` to an ExecutionContext.triggerPayload. Fail-open: a
 * side-effect failure is caught by the caller (journey-engine), which marks the
 * enrollment FAILED — it never throws out of this module for control-flow steps.
 */
export async function executeJourneyStep(
  step: JourneyStep,
  context: Record<string, unknown>,
  exec: ExecutionContext
): Promise<JourneyStepResult> {
  const node: WorkflowNode = {
    id: step.id,
    type: step.type as WorkflowNode['type'],
    config: step.config ?? {},
  };

  switch (step.type) {
    case 'WAIT': {
      const resumeAt = computeWaitResumeAt(step.config ?? {});
      return { resumeAt, nextStepId: step.nextStepId ?? null, output: { waitedUntil: resumeAt?.toISOString() } };
    }

    case 'CONDITION':
    case 'BRANCH': {
      const nextStepId = pickBranch(step, context);
      return { nextStepId, output: { branchedTo: nextStepId } };
    }

    case 'ACTION': {
      const result = await runAction(step, context, exec);
      return { nextStepId: step.nextStepId ?? null, output: result.output };
    }

    case 'EMAIL': {
      const result = await handleEmailNode(node, exec);
      return { nextStepId: step.nextStepId ?? null, output: result.output };
    }

    case 'GOAL':
      return { nextStepId: null, terminal: 'COMPLETED', output: { goal: step.config?.name ?? step.id } };

    case 'EXIT':
      return { nextStepId: null, terminal: 'EXITED', output: { exit: step.config?.reason ?? step.id } };

    default:
      // Unknown step type — skip forward rather than crash (fail-open).
      return { nextStepId: step.nextStepId ?? null, output: { skipped: true, reason: 'unknown_step_type' } };
  }
}

/**
 * ACTION step dispatch. `config.action` selects which reused workflow primitive
 * runs; defaults to a raw HTTP action (handleActionNode) for arbitrary webhooks.
 */
async function runAction(
  step: JourneyStep,
  _context: Record<string, unknown>,
  exec: ExecutionContext
): Promise<NodeResult> {
  const node: WorkflowNode = {
    id: step.id,
    type: 'ACTION',
    config: step.config ?? {},
  };
  const action = String((step.config ?? {}).action ?? 'http').toLowerCase();
  switch (action) {
    case 'notify':
      return handleNotifyNode(node, exec);
    case 'set_field':
    case 'setfield':
      return handleSetFieldNode(node, exec);
    case 'assign':
      return handleAssignNode(node, exec);
    case 'create_task':
    case 'task':
      return handleCreateTaskNode(node, exec);
    case 'http':
    default:
      return handleActionNode(node, exec);
  }
}

function pickBranch(step: JourneyStep, context: Record<string, unknown>): string | null {
  const branches = Array.isArray(step.branches) ? step.branches : [];
  for (const b of branches) {
    if (b.condition === 'default' || b.condition === 'else') continue;
    if (evaluateCondition(b.condition as JourneyCondition, context)) {
      return b.nextStepId;
    }
  }
  const fallback = branches.find((b) => b.condition === 'default' || b.condition === 'else');
  if (fallback) return fallback.nextStepId;
  // No branch matched → follow nextStepId if present, else end.
  return step.nextStepId ?? null;
}

/**
 * WAIT resume time. Supports { durationMs } | { untilDate: ISO } | the workflow
 * wait.node shorthand { amount, unit } / { delayDays } / { delayHours }.
 */
export function computeWaitResumeAt(
  config: Record<string, unknown>,
  now: Date = new Date()
): Date {
  const durationMs = config.durationMs;
  if (typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs > 0) {
    return new Date(now.getTime() + durationMs);
  }
  const untilDate = config.untilDate;
  if (typeof untilDate === 'string') {
    const d = new Date(untilDate);
    if (!Number.isNaN(d.getTime()) && d.getTime() > now.getTime()) return d;
  }
  if (typeof config.delayHours === 'number' && config.delayHours > 0) {
    return new Date(now.getTime() + config.delayHours * 3_600_000);
  }
  if (typeof config.delayDays === 'number' && config.delayDays > 0) {
    return new Date(now.getTime() + config.delayDays * 86_400_000);
  }
  if (typeof config.amount === 'number' && config.amount > 0) {
    const unit = config.unit;
    const unitMs = unit === 'days' ? 86_400_000 : unit === 'hours' ? 3_600_000 : 60_000;
    return new Date(now.getTime() + config.amount * unitMs);
  }
  // Default: 1 minute so a misconfigured WAIT never blocks forever.
  return new Date(now.getTime() + 60_000);
}
