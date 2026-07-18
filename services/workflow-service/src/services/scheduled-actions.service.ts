/**
 * Time-delayed & date-relative automation actions (WF-DEPTH — Zoho Workflow-Rule
 * parity).
 *
 * An AutomationRule can, in addition to its INSTANT `actions`, carry:
 *   - `scheduledActions`: [{ delay: { value, unit }, action }] — fire N minutes /
 *     hours / days AFTER the trigger event.
 *   - `dateTriggers` (DateBasedTrigger rows): fire relative to a DATE FIELD on the
 *     record, e.g. "3 days before Deal.expectedCloseDate".
 *
 * Both are materialised as `ScheduledAutomationAction` rows with a `runAt`. A
 * poller (`startScheduledActionPoller`) claims due rows, RE-CHECKS the owning
 * rule's criteria against the captured payload snapshot, and — if it still matches
 * and the rule is still active — executes the action(s) through the SAME engine
 * node handlers an instant action uses. If the rule is gone/inactive or no longer
 * matches, the row is CANCELLED rather than fired (the "re-check on fire" cancel).
 *
 * Idempotency: every row has a stable `dedupeKey`. Delay actions upsert
 * create-only (one row per event+action). Date actions upsert on
 * `date:<triggerId>:<entityId>`, so a later record update RESCHEDULES (updates
 * runAt) rather than duplicating — and cancels the pending row when the rule no
 * longer matches or the date field is cleared.
 */
import type { WorkflowPrisma } from '../prisma.js';
import type { NotificationProducer } from '../engine/types.js';
import {
  buildRuleExecutionContext,
  executeAutomationAction,
  isSupportedActionType,
  type AutomationAction,
} from '../engine/automation-actions.js';
// NOTE: runtime-only cyclic import (both modules reference each other but only via
// call-time function bodies, so the ESM cycle resolves cleanly).
import { evaluateConditions } from './automation-rules.service.js';

export type DelayUnit = 'minutes' | 'hours' | 'days';
export const DELAY_UNITS: DelayUnit[] = ['minutes', 'hours', 'days'];
export const DATE_DIRECTIONS = ['before', 'after'] as const;

const UNIT_MS: Record<DelayUnit, number> = {
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
};

// ─── Shared helpers ─────────────────────────────────────────────────────────

/** Resolve the target record id from a domain-event payload. */
export function resolveEntityId(payload: Record<string, unknown>, module: string): string {
  const candidates = [
    payload.id,
    payload[`${module}Id`],
    payload.entityId,
    payload.recordId,
    (payload[module] as Record<string, unknown> | undefined)?.id,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 0) return c;
    if (typeof c === 'number') return String(c);
  }
  return '';
}

function unitMs(unit: unknown): number {
  return UNIT_MS[(String(unit) as DelayUnit)] ?? UNIT_MS.days;
}

/** Parse a { value, unit } delay into milliseconds (>= 0), or null if invalid. */
export function parseDelayMs(delay: unknown): number | null {
  if (!delay || typeof delay !== 'object') return null;
  const d = delay as { value?: unknown; unit?: unknown };
  const value = Number(d.value);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.floor(value) * unitMs(d.unit);
}

function coerceDate(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

// ─── field_update trigger matching ──────────────────────────────────────────

function looseEq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  // number/string tolerant comparison for values coming off JSON payloads
  if ((typeof a === 'number' || typeof a === 'string') && (typeof b === 'number' || typeof b === 'string')) {
    return String(a) === String(b);
  }
  return false;
}

function readField(payload: Record<string, unknown>, field: string): unknown {
  if (field in payload) return payload[field];
  return field.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object' && part in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, payload);
}

/**
 * Extract the {from,to,changed} view of a field from an update event payload,
 * tolerating the common conventions producers use:
 *   - payload.changes[field] = { from|old|previous|before, to|new|current|after }
 *   - payload.changedFields = ['field', ...]  (change flagged, no from/to)
 *   - payload.old|previous|before = { field: oldVal } (+ new value top-level/new)
 */
function extractChange(
  payload: Record<string, unknown>,
  field: string
): { from: unknown; to: unknown; changed: boolean } {
  const changes = payload.changes as Record<string, unknown> | undefined;
  const entry = changes?.[field];
  if (entry && typeof entry === 'object') {
    const e = entry as Record<string, unknown>;
    const from = e.from ?? e.old ?? e.previous ?? e.before;
    const to = e.to ?? e.new ?? e.current ?? e.after ?? readField(payload, field);
    return { from, to, changed: true };
  }

  const changedFields = payload.changedFields;
  const flagged = Array.isArray(changedFields) && (changedFields as unknown[]).includes(field);

  const oldObj = (payload.old ?? payload.previous ?? payload.before) as
    | Record<string, unknown>
    | undefined;
  const newObj = (payload.new ?? payload.current ?? payload.after) as
    | Record<string, unknown>
    | undefined;
  const from = oldObj && field in oldObj ? oldObj[field] : undefined;
  const to = (newObj && field in newObj ? newObj[field] : undefined) ?? readField(payload, field);
  const changed = flagged || (from !== undefined && !looseEq(from, to));
  return { from, to, changed };
}

/**
 * Whether a `field_update` rule should fire for this payload. `fieldUpdate` is
 * `{ field, from?, to? }`. Returns true (does not block) when the config is absent
 * so a mis-typed trigger never silently kills an otherwise-valid rule.
 */
export function matchesFieldUpdate(triggerConfig: unknown, payload: Record<string, unknown>): boolean {
  const fu = (triggerConfig as { fieldUpdate?: unknown } | null | undefined)?.fieldUpdate as
    | { field?: unknown; from?: unknown; to?: unknown }
    | undefined;
  if (!fu || typeof fu.field !== 'string' || fu.field.length === 0) return true;

  const { from, to, changed } = extractChange(payload, fu.field);
  if (fu.to !== undefined && !looseEq(to, fu.to)) return false;
  if (fu.from !== undefined) {
    if (from === undefined) return false; // required prior value unknown → not confirmed
    if (!looseEq(from, fu.from)) return false;
  }
  // No to/from constraint → require that the field actually changed.
  if (fu.to === undefined && fu.from === undefined) return changed;
  return true;
}

// ─── Enqueue: delay-based scheduled actions ─────────────────────────────────

interface RuleForScheduling {
  id: string;
  tenantId: string;
  conditions: unknown;
  scheduledActions: unknown;
}

/**
 * Materialise a matched rule's `scheduledActions` as future ScheduledAutomationAction
 * rows. Idempotent per (rule,event,index). Best-effort — never throws into the
 * consumer path.
 */
export async function enqueueDelayedActions(
  prisma: WorkflowPrisma,
  args: {
    tenantId: string;
    module: string;
    eventId: string;
    rule: RuleForScheduling;
    payload: Record<string, unknown>;
  }
): Promise<number> {
  const list = Array.isArray(args.rule.scheduledActions) ? args.rule.scheduledActions : [];
  if (list.length === 0) return 0;

  const entityId = resolveEntityId(args.payload, args.module);
  const now = Date.now();
  let queued = 0;

  for (let i = 0; i < list.length; i++) {
    const entry = list[i] as { delay?: unknown; action?: unknown } | undefined;
    const delayMs = parseDelayMs(entry?.delay);
    const action = entry?.action as AutomationAction | undefined;
    if (delayMs === null || !action || typeof action.type !== 'string') continue;

    const dedupeKey = `delay:${args.rule.id}:${args.eventId}:${i}`;
    try {
      await prisma.scheduledAutomationAction.upsert({
        where: { dedupeKey },
        create: {
          tenantId: args.tenantId,
          ruleId: args.rule.id,
          module: args.module,
          entityId,
          eventId: args.eventId,
          origin: 'delay',
          dedupeKey,
          runAt: new Date(now + delayMs),
          action: action as object,
          payload: args.payload as object,
          status: 'PENDING',
        },
        update: {}, // one shot per (rule,event,index) — never reschedule a delay row
      });
      queued++;
    } catch {
      // best-effort; a lost race just means it's already queued
    }
  }
  return queued;
}

// ─── Enqueue: date-based triggers ───────────────────────────────────────────

interface DateTrigger {
  id: string;
  dateField: string;
  offset: number;
  unit: string;
  direction: string;
  isActive: boolean;
}

interface RuleWithDateTriggers extends RuleForScheduling {
  actions: unknown;
  dateTriggers?: DateTrigger[];
}

/**
 * (Re)schedule a date_time rule's actions relative to a record date field.
 * Called for every matching record event carrying the anchor field:
 *   - conditionsMatch && valid date → upsert a row at (anchor ± offset), updating
 *     runAt if the date moved (reschedule).
 *   - !conditionsMatch OR date cleared → cancel any still-PENDING row (the record
 *     no longer qualifies, so the future action is withdrawn).
 */
export async function scheduleDateTriggers(
  prisma: WorkflowPrisma,
  args: {
    tenantId: string;
    module: string;
    eventId: string;
    rule: RuleWithDateTriggers;
    payload: Record<string, unknown>;
    conditionsMatch: boolean;
  }
): Promise<void> {
  const triggers = (args.rule.dateTriggers ?? []).filter((t) => t.isActive);
  if (triggers.length === 0) return;

  const entityId = resolveEntityId(args.payload, args.module);
  const actions = Array.isArray(args.rule.actions) ? (args.rule.actions as AutomationAction[]) : [];

  for (const t of triggers) {
    const dedupeKey = `date:${t.id}:${entityId || 'unknown'}`;
    const anchor = coerceDate(readField(args.payload, t.dateField));

    // No longer qualifies (or the anchor date was cleared) → withdraw pending fire.
    if (!args.conditionsMatch || !anchor || !entityId) {
      await prisma.scheduledAutomationAction
        .updateMany({
          where: { dedupeKey, status: 'PENDING' },
          data: { status: 'CANCELLED', error: !anchor ? 'anchor_date_missing' : 'criteria_no_longer_match', firedAt: new Date() },
        })
        .catch(() => undefined);
      continue;
    }

    const sign = String(t.direction) === 'after' ? 1 : -1;
    const runAt = new Date(anchor.getTime() + sign * Math.max(0, t.offset) * unitMs(t.unit));

    try {
      await prisma.scheduledAutomationAction.upsert({
        where: { dedupeKey },
        create: {
          tenantId: args.tenantId,
          ruleId: args.rule.id,
          module: args.module,
          entityId,
          eventId: args.eventId,
          origin: 'date',
          dedupeKey,
          runAt,
          action: actions as object, // whole action list fired at the anchor time
          payload: args.payload as object,
          status: 'PENDING',
        },
        update: {
          // Reschedule an as-yet-unfired row when the date/payload changed.
          runAt,
          action: actions as object,
          payload: args.payload as object,
          eventId: args.eventId,
        },
      });
    } catch {
      // best-effort
    }
  }
}

// ─── The poller ─────────────────────────────────────────────────────────────

type Logger = {
  warn: (obj: unknown, msg?: string) => void;
  info?: (obj: unknown, msg?: string) => void;
};

/** Cancel a scheduled row with a reason (record no longer matches / rule gone). */
async function cancel(prisma: WorkflowPrisma, id: string, reason: string): Promise<void> {
  await prisma.scheduledAutomationAction
    .update({ where: { id }, data: { status: 'CANCELLED', error: reason, firedAt: new Date() } })
    .catch(() => undefined);
}

/**
 * Fire one claimed (status=FIRING) scheduled row: re-check the rule, then run the
 * action(s) through the shared engine handlers. Sets the row DONE / FAILED /
 * CANCELLED. Never throws.
 */
export async function fireScheduledAction(
  prisma: WorkflowPrisma,
  producer: NotificationProducer | undefined,
  row: {
    id: string;
    tenantId: string;
    ruleId: string;
    eventId: string;
    action: unknown;
    payload: unknown;
  },
  logger: Logger
): Promise<'DONE' | 'FAILED' | 'CANCELLED'> {
  try {
    const rule = await prisma.automationRule.findFirst({
      where: { id: row.ruleId, tenantId: row.tenantId },
      select: { id: true, isActive: true, conditions: true },
    });
    if (!rule || !rule.isActive) {
      await cancel(prisma, row.id, 'rule_inactive_or_deleted');
      return 'CANCELLED';
    }

    const payload = (row.payload ?? {}) as Record<string, unknown>;
    // Re-check on fire — the core Zoho behaviour: if the record no longer matches
    // the rule criteria, the scheduled action is cancelled rather than executed.
    if (!evaluateConditions(rule.conditions, payload)) {
      await cancel(prisma, row.id, 'criteria_no_longer_match');
      return 'CANCELLED';
    }

    const actions = Array.isArray(row.action)
      ? (row.action as AutomationAction[])
      : [row.action as AutomationAction];
    const ctx = buildRuleExecutionContext(row.tenantId, row.ruleId, row.eventId, payload, producer);

    const errors: string[] = [];
    let executed = 0;
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      if (!action || !isSupportedActionType(action.type)) {
        errors.push(`action[${i}]: unsupported type "${action?.type}"`);
        continue;
      }
      try {
        await executeAutomationAction(action, ctx, i);
        executed++;
      } catch (err) {
        errors.push(`action[${i}] (${action.type}): ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const status = executed > 0 || errors.length === 0 ? 'DONE' : 'FAILED';
    await prisma.scheduledAutomationAction.update({
      where: { id: row.id },
      data: { status, error: errors.length ? errors.join('; ').slice(0, 2000) : null, firedAt: new Date() },
    });
    // Keep the rule's run bookkeeping in step so scheduled fires are observable.
    await prisma.automationRule
      .update({ where: { id: row.ruleId }, data: { runCount: { increment: 1 }, lastRunAt: new Date() } })
      .catch(() => undefined);
    return status;
  } catch (err) {
    logger.warn({ err, id: row.id }, 'Scheduled automation action fire failed');
    await prisma.scheduledAutomationAction
      .update({
        where: { id: row.id },
        data: { status: 'FAILED', error: err instanceof Error ? err.message : String(err), firedAt: new Date() },
      })
      .catch(() => undefined);
    return 'FAILED';
  }
}

/**
 * Poller: execute ScheduledAutomationAction rows whose `runAt` is due.
 *
 * Mirrors the journey scheduler / schedule-trigger guards:
 *   - setInterval + .unref() so the timer never keeps the process alive.
 *   - Reentrancy guard skips a tick if the previous is still running.
 *   - Whole tick try/caught; a transient failure just logs.
 *   - Each due row is atomically CLAIMED (PENDING → FIRING via updateMany) so no
 *     row is fired twice across overlapping ticks or multiple instances.
 */
export function startScheduledActionPoller(
  prisma: WorkflowPrisma,
  producer: NotificationProducer | undefined,
  logger: Logger,
  intervalMs = Number(process.env.SCHEDULED_ACTION_TICK_MS ?? '30000')
): NodeJS.Timeout {
  const tickMs = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 30_000;
  const batchSize = Number(process.env.SCHEDULED_ACTION_BATCH ?? '100');
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const now = new Date();
      const due = await prisma.scheduledAutomationAction.findMany({
        where: { status: 'PENDING', runAt: { lte: now } },
        orderBy: { runAt: 'asc' },
        take: Number.isFinite(batchSize) && batchSize > 0 ? batchSize : 100,
      });

      for (const row of due) {
        // Atomic claim: only the tick that flips PENDING→FIRING runs it.
        const claim = await prisma.scheduledAutomationAction.updateMany({
          where: { id: row.id, status: 'PENDING' },
          data: { status: 'FIRING' },
        });
        if (claim.count === 0) continue; // lost the race

        await fireScheduledAction(prisma, producer, row, logger);
      }
    } catch (err) {
      logger.warn({ err }, 'Scheduled action poller tick failed');
    } finally {
      running = false;
    }
  };

  const handle = setInterval(() => {
    void tick();
  }, tickMs);
  if (typeof handle.unref === 'function') handle.unref();
  return handle;
}
