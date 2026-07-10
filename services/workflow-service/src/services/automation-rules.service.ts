import { NotFoundError } from '@nexus/service-utils';
import { TOPICS } from '@nexus/kafka';
import type { WorkflowPrisma } from '../prisma.js';
import type { NotificationProducer } from '../engine/types.js';
import {
  SUPPORTED_ACTION_TYPES,
  buildRuleExecutionContext,
  executeAutomationAction,
  isSupportedActionType,
  simulateAutomationAction,
  type AutomationAction,
} from '../engine/automation-actions.js';
import { ActionHttpError } from '../engine/nodes/action.node.js';

// ─── Loop-guard + rate-cap tunables (AU-5) ──────────────────────────────────

/** Max cause-chain depth before a rule is refused (event-storm circuit breaker). */
const MAX_CAUSATION_DEPTH = Number(process.env.AUTOMATION_MAX_CAUSATION_DEPTH ?? 5);
/** Per-tenant rule-execution budget within the sliding window. */
const TENANT_RATE_MAX = Number(process.env.AUTOMATION_TENANT_RATE_MAX ?? 500);
const TENANT_RATE_WINDOW_MS = Number(process.env.AUTOMATION_TENANT_RATE_WINDOW_MS ?? 60_000);

/**
 * In-memory per-tenant sliding-window rate limiter for rule executions (AU-5).
 * Per-instance (not shared across replicas) — a coarse safety cap against runaway
 * fan-out, not a precise quota. Deliberately dependency-free so it cannot itself
 * become a failure point in the consumer loop.
 */
const tenantExecWindows = new Map<string, number[]>();
function tryAcquireTenantBudget(tenantId: string): boolean {
  const now = Date.now();
  const cutoff = now - TENANT_RATE_WINDOW_MS;
  const hits = (tenantExecWindows.get(tenantId) ?? []).filter((t) => t > cutoff);
  if (hits.length >= TENANT_RATE_MAX) {
    tenantExecWindows.set(tenantId, hits);
    return false;
  }
  hits.push(now);
  tenantExecWindows.set(tenantId, hits);
  return true;
}

/**
 * Thrown by `handleEvent` when one or more matched rules hit a *transient*
 * processing failure (5xx/429 after node-level retries, network/timeout, or an
 * unexpected error such as a DB fault). Propagated out of the consumer so the
 * NexusConsumer retry+DLQ machinery retains the event for replay (AU-4). A purely
 * *permanent* failure (4xx bad-request, unsupported action, bad config) is NOT
 * transient — it is recorded on the run row and dropped, never DLQ'd, because a
 * retry can never succeed.
 */
export class AutomationProcessingError extends Error {
  constructor(
    message: string,
    public readonly failedRuleIds: string[]
  ) {
    super(message);
    this.name = 'AutomationProcessingError';
  }
}

/** Classify an action error: transient (worth retry/DLQ) vs permanent. */
function isTransientError(err: unknown): boolean {
  if (err instanceof ActionHttpError) return err.status >= 500 || err.status === 429;
  if (err instanceof Error) {
    // Config/validation style messages are permanent; anything else (DB, network,
    // timeout, unexpected) is treated as transient so it gets a retry + DLQ.
    if (/unsupported|unknown automation action|missing|invalid|not writable|4\d\d/i.test(err.message)) {
      return false;
    }
    return true;
  }
  return true;
}

// ─── Condition evaluation ───────────────────────────────────────────────────

export type ConditionOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'in'
  | 'not_in'
  | 'exists'
  | 'not_exists'
  | 'is_empty'
  | 'is_not_empty';

export interface RuleCondition {
  field: string;
  operator: ConditionOperator;
  value?: unknown;
}

export const SUPPORTED_OPERATORS: ConditionOperator[] = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
  'in',
  'not_in',
  'exists',
  'not_exists',
  'is_empty',
  'is_not_empty',
];

/** Resolve a possibly dot-pathed field against the payload (e.g. "deal.amount"). */
function resolveField(payload: Record<string, unknown>, field: string): unknown {
  if (field in payload) return payload[field];
  return field.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object' && part in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, payload);
}

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
}

export function evaluateCondition(
  condition: RuleCondition,
  payload: Record<string, unknown>
): boolean {
  const actual = resolveField(payload, condition.field);
  const expected = condition.value;

  switch (condition.operator) {
    case 'eq':
      return actual === expected;
    case 'neq':
      return actual !== expected;
    case 'gt':
      return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
    case 'gte':
      return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
    case 'lt':
      return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
    case 'lte':
      return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
    case 'contains':
      if (Array.isArray(actual)) return actual.includes(expected as never);
      return typeof actual === 'string' && actual.includes(String(expected));
    case 'not_contains':
      if (Array.isArray(actual)) return !actual.includes(expected as never);
      return typeof actual === 'string' ? !actual.includes(String(expected)) : true;
    case 'starts_with':
      return typeof actual === 'string' && actual.startsWith(String(expected));
    case 'ends_with':
      return typeof actual === 'string' && actual.endsWith(String(expected));
    case 'in':
      return Array.isArray(expected) && expected.includes(actual as never);
    case 'not_in':
      return Array.isArray(expected) && !expected.includes(actual as never);
    case 'exists':
      return actual !== undefined && actual !== null;
    case 'not_exists':
      return actual === undefined || actual === null;
    case 'is_empty':
      return isEmpty(actual);
    case 'is_not_empty':
      return !isEmpty(actual);
    default:
      return false;
  }
}

/** AND-combine an array of conditions. Empty/invalid ⇒ matches (fires always). */
export function evaluateConditions(
  conditions: unknown,
  payload: Record<string, unknown>
): boolean {
  if (!Array.isArray(conditions) || conditions.length === 0) return true;
  return (conditions as RuleCondition[]).every((c) => {
    if (!c || typeof c.field !== 'string' || typeof c.operator !== 'string') return true;
    return evaluateCondition(c, payload);
  });
}

// ─── Meta catalog (for admin UI pickers) ────────────────────────────────────

/**
 * Catalog of supported modules and their trigger events. Derived from the domain
 * events actually published across the platform. This is the contract the admin
 * UI renders pickers from.
 */
export const AUTOMATION_MODULES: Record<string, string[]> = {
  lead: [
    'lead.created',
    'lead.updated',
    'lead.assigned',
    'lead.converted',
    'lead.captured',
    'lead.archived',
    'lead.restored',
  ],
  contact: ['contact.created', 'contact.updated', 'contact.archived', 'contact.merged', 'contact.restored'],
  account: ['account.created', 'account.updated', 'account.archived', 'account.merged', 'account.restored'],
  deal: [
    'deal.created',
    'deal.updated',
    'deal.stage_changed',
    'deal.won',
    'deal.lost',
    'deal.assigned',
    'deal.at_risk',
    'deal.rotten',
    'deal.reopened',
    'deal.archived',
    'deal.restored',
    'deal.team.updated',
  ],
  activity: ['activity.created', 'activity.completed', 'activity.overdue'],
  quote: [
    'quote.created',
    'quote.updated',
    'quote.sent',
    'quote.accepted',
    'quote.rejected',
    'quote.approved',
    'quote.expired',
    'quote.viewed',
    'quote.signed',
    'quote.voided',
  ],
  rfq: ['rfq.created', 'rfq.submitted_for_review', 'rfq.ready_for_quote', 'rfq.converted_to_quote', 'rfq.cancelled'],
  invoice: ['invoice.created', 'invoice.sent', 'invoice.paid'],
  payment: ['payment.received'],
  contract: ['contract.created', 'contract.signed', 'contract.terminated'],
  subscription: [
    'subscription.created',
    'subscription.renewed',
    'subscription.cancelled',
    'subscription.past_due',
    'subscription.dunning',
  ],
  commission: ['commission.calculated', 'commission.approved', 'commission.clawback'],
  ticket: [
    'ticket.created',
    'ticket.updated',
    'ticket.assigned',
    'ticket.status_changed',
    'ticket.resolved',
    'ticket.closed',
    'ticket.reopened',
    'ticket.comment_added',
    'ticket.sla.breached',
  ],
  campaign: [
    'campaign.created',
    'campaign.updated',
    'campaign.launched',
    'campaign.status_changed',
    'campaign.member_added',
  ],
  approval: [
    'approval.request.created',
    'approval.request.approved',
    'approval.request.rejected',
    'approval.request.escalated',
  ],
  sla: ['sla.breached'],
};

export function buildMetaCatalog() {
  return {
    modules: Object.entries(AUTOMATION_MODULES).map(([module, triggerEvents]) => ({
      module,
      triggerEvents,
    })),
    actionTypes: SUPPORTED_ACTION_TYPES,
    operators: SUPPORTED_OPERATORS,
  };
}

// ─── CRUD + execution service ───────────────────────────────────────────────

export interface AutomationRuleInput {
  name: string;
  description?: string;
  module: string;
  triggerEvent: string;
  conditions?: RuleCondition[];
  actions?: AutomationAction[];
  isActive?: boolean;
}

/** Field-level snapshot of a rule (conditions + actions + meta) for versioning. */
function ruleSnapshot(rule: {
  name: string;
  description: string | null;
  module: string;
  triggerEvent: string;
  conditions: unknown;
  actions: unknown;
  isActive: boolean;
}) {
  return {
    name: rule.name,
    description: rule.description ?? null,
    module: rule.module,
    triggerEvent: rule.triggerEvent,
    conditions: rule.conditions,
    actions: rule.actions,
    isActive: rule.isActive,
  };
}

export function createAutomationRulesService(
  prisma: WorkflowPrisma,
  producer?: NotificationProducer
) {
  /** Append a monotonic version snapshot of `rule` within a transaction. */
  async function writeVersion(
    tx: {
      automationRuleVersion: {
        findFirst: (args: unknown) => Promise<{ version: number } | null>;
        create: (args: unknown) => Promise<unknown>;
      };
    },
    rule: Parameters<typeof ruleSnapshot>[0] & { id: string; tenantId: string },
    createdBy: string,
    reason: string
  ): Promise<number> {
    const last = await tx.automationRuleVersion.findFirst({
      where: { ruleId: rule.id },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const version = (last?.version ?? 0) + 1;
    await tx.automationRuleVersion.create({
      data: {
        tenantId: rule.tenantId,
        ruleId: rule.id,
        version,
        snapshot: ruleSnapshot(rule) as object,
        reason,
        createdBy,
      },
    });
    return version;
  }

  return {
    async list(
      tenantId: string,
      filters: { module?: string; triggerEvent?: string; isActive?: boolean }
    ) {
      return prisma.automationRule.findMany({
        where: {
          tenantId,
          ...(filters.module ? { module: filters.module } : {}),
          ...(filters.triggerEvent ? { triggerEvent: filters.triggerEvent } : {}),
          ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
        },
        orderBy: { createdAt: 'desc' },
      });
    },

    async get(tenantId: string, id: string) {
      const row = await prisma.automationRule.findFirst({ where: { id, tenantId } });
      if (!row) throw new NotFoundError('Automation rule not found');
      return row;
    },

    async create(tenantId: string, createdBy: string, data: AutomationRuleInput) {
      // Rule + its first version (v1) written atomically so history always exists.
      return prisma.$transaction(async (tx: any) => {
        const rule = await tx.automationRule.create({
          data: {
            tenantId,
            createdBy,
            name: data.name,
            description: data.description,
            module: data.module,
            triggerEvent: data.triggerEvent,
            conditions: (data.conditions ?? []) as object,
            actions: (data.actions ?? []) as object,
            isActive: data.isActive ?? true,
          },
        });
        await writeVersion(tx, rule, createdBy, 'create');
        return rule;
      });
    },

    async update(
      tenantId: string,
      id: string,
      data: Partial<AutomationRuleInput>,
      actor = 'system'
    ) {
      await this.get(tenantId, id);
      // Update the rule and snapshot the resulting state (AU-3 versioning) so the
      // pre-edit state remains recoverable via rollback.
      return prisma.$transaction(async (tx: any) => {
        const rule = await tx.automationRule.update({
          where: { id },
          data: {
            ...(data.name !== undefined ? { name: data.name } : {}),
            ...(data.description !== undefined ? { description: data.description } : {}),
            ...(data.module !== undefined ? { module: data.module } : {}),
            ...(data.triggerEvent !== undefined ? { triggerEvent: data.triggerEvent } : {}),
            ...(data.conditions !== undefined ? { conditions: data.conditions as object } : {}),
            ...(data.actions !== undefined ? { actions: data.actions as object } : {}),
            ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
          },
        });
        await writeVersion(tx, rule, actor, 'update');
        return rule;
      });
    },

    /** List a rule's version history (newest first). */
    async listVersions(tenantId: string, id: string) {
      await this.get(tenantId, id);
      return prisma.automationRuleVersion.findMany({
        where: { tenantId, ruleId: id },
        orderBy: { version: 'desc' },
      });
    },

    /** Fetch a single version snapshot by version number. */
    async getVersion(tenantId: string, id: string, version: number) {
      await this.get(tenantId, id);
      const row = await prisma.automationRuleVersion.findFirst({
        where: { tenantId, ruleId: id, version },
      });
      if (!row) throw new NotFoundError(`Version ${version} not found for rule`);
      return row;
    },

    /**
     * Restore a prior version's snapshot (AU-3 rollback). The *current* state is
     * snapshotted first (reason 'pre-rollback') so nothing is lost, then the rule
     * is patched to the target snapshot and that restored state is itself recorded
     * as a new version (reason 'rollback:<v>'). All atomic.
     */
    async rollback(tenantId: string, id: string, version: number, actor = 'system') {
      const current = await this.get(tenantId, id);
      const target = await prisma.automationRuleVersion.findFirst({
        where: { tenantId, ruleId: id, version },
      });
      if (!target) throw new NotFoundError(`Version ${version} not found for rule`);
      const snap = target.snapshot as ReturnType<typeof ruleSnapshot>;

      return prisma.$transaction(async (tx: any) => {
        // 1) preserve the pre-rollback state
        await writeVersion(tx, current, actor, 'pre-rollback');
        // 2) restore the target snapshot's authored fields
        const rule = await tx.automationRule.update({
          where: { id },
          data: {
            name: snap.name,
            description: snap.description,
            module: snap.module,
            triggerEvent: snap.triggerEvent,
            conditions: snap.conditions as object,
            actions: snap.actions as object,
            isActive: snap.isActive,
          },
        });
        // 3) record the restored state as its own version
        const newVersion = await writeVersion(tx, rule, actor, `rollback:${version}`);
        return { rule, restoredFrom: version, newVersion };
      });
    },

    /**
     * Dry-run a rule against a supplied sample payload (AU-3). Evaluates each
     * condition (reporting per-condition + overall match) and, if matched,
     * *simulates* every action — resolving its target URL/body/event WITHOUT any
     * side effect. Never touches the run log or idempotency guard.
     */
    async test(
      tenantId: string,
      id: string,
      samplePayload: Record<string, unknown>
    ) {
      const rule = await this.get(tenantId, id);
      const conditionsArr = Array.isArray(rule.conditions)
        ? (rule.conditions as unknown as RuleCondition[])
        : [];
      const conditionResults = conditionsArr.map((c) => ({
        condition: c,
        matched:
          !c || typeof c.field !== 'string' || typeof c.operator !== 'string'
            ? true
            : evaluateCondition(c, samplePayload),
      }));
      const matched = conditionResults.every((c) => c.matched);

      const actions = Array.isArray(rule.actions) ? (rule.actions as unknown as AutomationAction[]) : [];
      // Build a simulate context: producer intentionally omitted — no publish path.
      const ctx = buildRuleExecutionContext(tenantId, rule.id, 'test', samplePayload, undefined, {
        simulate: true,
      });

      const actionResults: Array<{ index: number; type: string; wouldDo: unknown; error?: string }> = [];
      if (matched) {
        for (let i = 0; i < actions.length; i++) {
          const action = actions[i];
          if (!action || !isSupportedActionType(action.type)) {
            actionResults.push({ index: i, type: String(action?.type), wouldDo: null, error: 'unsupported action type' });
            continue;
          }
          try {
            const res = await simulateAutomationAction(action, ctx, i);
            actionResults.push({ index: i, type: action.type, wouldDo: res.output });
          } catch (err) {
            actionResults.push({
              index: i,
              type: action.type,
              wouldDo: null,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }

      return {
        ruleId: rule.id,
        matched,
        conditions: conditionResults,
        actions: actionResults,
        note: 'Dry-run only — no side effects were performed and no run was recorded.',
      };
    },

    async remove(tenantId: string, id: string) {
      await this.get(tenantId, id);
      await prisma.automationRule.delete({ where: { id } });
      return { id };
    },

    async toggle(tenantId: string, id: string) {
      const row = await this.get(tenantId, id);
      return prisma.automationRule.update({
        where: { id },
        data: { isActive: !row.isActive },
      });
    },

    async listRuns(tenantId: string, id: string, limit = 50) {
      await this.get(tenantId, id);
      return prisma.automationRuleRun.findMany({
        where: { tenantId, ruleId: id },
        orderBy: { ranAt: 'desc' },
        take: limit,
      });
    },

    /**
     * Core evaluation entrypoint — invoked by the Kafka automation consumer for
     * every relevant domain event. Loads active rules matching
     * (tenantId, module, triggerEvent), evaluates conditions, and executes the
     * actions of every match.
     *
     * Semantics:
     *   - Fail-open PER RULE: a permanently-failing rule (4xx/bad config) never
     *     blocks the others; the failure is recorded on its run row.
     *   - THROWS `AutomationProcessingError` at the end if ANY matched rule hit a
     *     *transient* failure, so the consumer's retry+DLQ machinery retains the
     *     event for replay (AU-4). "No rule matched" ⇒ returns normally (drop).
     *   - Idempotent per (ruleId, eventId), but a prior FAILED run (0 actions
     *     succeeded) is retried — safe, because nothing succeeded so no side effect
     *     is duplicated. SUCCESS/PARTIAL/RUNNING are never re-run.
     *   - Loop guard (AU-5): refuses execution when the event's causationDepth has
     *     reached the limit, and applies a per-tenant execution rate cap.
     */
    async handleEvent(input: {
      tenantId: string;
      module: string;
      triggerEvent: string;
      eventId: string;
      payload: Record<string, unknown>;
      causationDepth?: number;
      rootEventId?: string;
    }): Promise<void> {
      const causationDepth = input.causationDepth ?? 0;
      const rootEventId = input.rootEventId ?? input.eventId;

      const rules = await prisma.automationRule.findMany({
        where: {
          tenantId: input.tenantId,
          module: input.module,
          triggerEvent: input.triggerEvent,
          isActive: true,
        },
      });
      if (rules.length === 0) return; // no rule matched — fine, drop

      // AU-5 loop guard: a mutation-triggered cascade that reached the depth limit
      // is refused wholesale. Record SKIPPED runs for audit + emit one signal.
      if (causationDepth >= MAX_CAUSATION_DEPTH) {
        console.warn(
          `[automation] loop guard tripped: ${input.triggerEvent} depth ${causationDepth} >= ${MAX_CAUSATION_DEPTH} (root ${rootEventId}, tenant ${input.tenantId})`
        );
        for (const rule of rules) {
          if (!evaluateConditions(rule.conditions, input.payload)) continue;
          await this.recordSkip(input.tenantId, rule.id, input.eventId, `loop_guard: depth ${causationDepth} >= ${MAX_CAUSATION_DEPTH}`);
        }
        await this.emitSignal(input.tenantId, 'automation.loop_guard.tripped', {
          triggerEvent: input.triggerEvent,
          module: input.module,
          causationDepth,
          rootEventId,
          limit: MAX_CAUSATION_DEPTH,
        });
        return;
      }

      const transientFailures: string[] = [];

      for (const rule of rules) {
        try {
          if (!evaluateConditions(rule.conditions, input.payload)) continue;

          // AU-5 per-tenant rate cap. Over budget ⇒ skip (recorded), never DLQ.
          if (!tryAcquireTenantBudget(input.tenantId)) {
            console.warn(`[automation] tenant ${input.tenantId} rate cap hit — skipping rule ${rule.id}`);
            await this.recordSkip(input.tenantId, rule.id, input.eventId, 'rate_cap');
            await this.emitSignal(input.tenantId, 'automation.rate_cap.tripped', {
              ruleId: rule.id,
              triggerEvent: input.triggerEvent,
              limit: TENANT_RATE_MAX,
              windowMs: TENANT_RATE_WINDOW_MS,
            });
            continue;
          }

          // Idempotency guard with retry-of-FAILED. Claim (ruleId, eventId):
          //   - existing SUCCESS/PARTIAL/RUNNING → skip (done / in-flight).
          //   - existing FAILED → reset to RUNNING and retry (no side effect was
          //     committed, so replay is safe).
          //   - none → create RUNNING (a create race → skip).
          const existing = await prisma.automationRuleRun.findUnique({
            where: { ruleId_eventId: { ruleId: rule.id, eventId: input.eventId } },
          });
          let runId: string;
          if (existing) {
            if (existing.status !== 'FAILED') continue; // terminal or in-flight
            await prisma.automationRuleRun.update({
              where: { id: existing.id },
              data: { status: 'RUNNING', error: null },
            });
            runId = existing.id;
          } else {
            try {
              const run = await prisma.automationRuleRun.create({
                data: { tenantId: input.tenantId, ruleId: rule.id, eventId: input.eventId, status: 'RUNNING' },
              });
              runId = run.id;
            } catch {
              continue; // concurrent create won the claim
            }
          }

          const outcome = await this.executeRule(
            rule.id,
            runId,
            input.tenantId,
            input.eventId,
            rule.actions,
            input.payload,
            causationDepth,
            rootEventId
          );
          if (outcome.hadTransientFailure) {
            transientFailures.push(rule.id);
          }
        } catch (err) {
          // An unexpected error (e.g. DB fault) around a single rule is transient
          // — record it so the whole event is retained for replay.
          transientFailures.push(rule.id);
          console.error(`[automation] rule ${rule.id} errored on ${input.triggerEvent}:`, err);
        }
      }

      if (transientFailures.length > 0) {
        throw new AutomationProcessingError(
          `Transient automation failures for ${transientFailures.length} rule(s) on ${input.triggerEvent}`,
          transientFailures
        );
      }
    },

    /** Record a non-executed outcome (loop guard / rate cap) for audit. Best-effort. */
    async recordSkip(tenantId: string, ruleId: string, eventId: string, reason: string): Promise<void> {
      try {
        await prisma.automationRuleRun.upsert({
          where: { ruleId_eventId: { ruleId, eventId } },
          create: { tenantId, ruleId, eventId, status: 'SKIPPED', error: reason },
          update: {}, // never override a real outcome for the same (rule,event)
        });
      } catch (err) {
        console.error(`[automation] recordSkip failed for rule ${ruleId}:`, err);
      }
    },

    /** Emit an observability signal on the workflows topic. Best-effort. */
    async emitSignal(tenantId: string, type: string, payload: Record<string, unknown>): Promise<void> {
      if (!producer) return;
      try {
        await producer.publish(TOPICS.WORKFLOWS, { type, tenantId, payload });
      } catch (err) {
        console.error(`[automation] emitSignal ${type} failed:`, err);
      }
    },

    /**
     * Execute a matched rule's actions sequentially and finalise its run row.
     * Returns whether any action failed *transiently* (→ event retained for DLQ).
     */
    async executeRule(
      ruleId: string,
      runId: string,
      tenantId: string,
      eventId: string,
      actionsJson: unknown,
      payload: Record<string, unknown>,
      causationDepth = 0,
      rootEventId?: string
    ): Promise<{ status: string; hadTransientFailure: boolean }> {
      const actions = Array.isArray(actionsJson) ? (actionsJson as AutomationAction[]) : [];
      const ctx = buildRuleExecutionContext(tenantId, ruleId, eventId, payload, producer, {
        causationDepth,
        rootEventId: rootEventId ?? eventId,
      });
      const errors: string[] = [];
      let executed = 0;
      let hadTransientFailure = false;

      for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        if (!action || !isSupportedActionType(action.type)) {
          errors.push(`action[${i}]: unsupported type "${action?.type}"`); // permanent
          continue;
        }
        try {
          await executeAutomationAction(action, ctx, i);
          executed++;
        } catch (err) {
          errors.push(`action[${i}] (${action.type}): ${err instanceof Error ? err.message : String(err)}`);
          if (isTransientError(err)) hadTransientFailure = true;
        }
      }

      const status =
        errors.length === 0 ? 'SUCCESS' : executed > 0 ? 'PARTIAL' : 'FAILED';

      await prisma.$transaction([
        prisma.automationRuleRun.update({
          where: { id: runId },
          data: { status, error: errors.length ? errors.join('; ').slice(0, 2000) : null },
        }),
        prisma.automationRule.update({
          where: { id: ruleId },
          data: { runCount: { increment: 1 }, lastRunAt: new Date() },
        }),
      ]);

      return { status, hadTransientFailure };
    },
  };
}

export type AutomationRulesService = ReturnType<typeof createAutomationRulesService>;
