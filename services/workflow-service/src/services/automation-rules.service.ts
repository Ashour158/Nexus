import { NotFoundError } from '@nexus/service-utils';
import type { WorkflowPrisma } from '../prisma.js';
import {
  SUPPORTED_ACTION_TYPES,
  buildRuleExecutionContext,
  executeAutomationAction,
  isSupportedActionType,
  type AutomationAction,
} from '../engine/automation-actions.js';

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

export function createAutomationRulesService(prisma: WorkflowPrisma) {
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
      return prisma.automationRule.create({
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
    },

    async update(tenantId: string, id: string, data: Partial<AutomationRuleInput>) {
      await this.get(tenantId, id);
      return prisma.automationRule.update({
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
     * actions of every match. Fail-open per rule; idempotent per (ruleId,eventId).
     */
    async handleEvent(input: {
      tenantId: string;
      module: string;
      triggerEvent: string;
      eventId: string;
      payload: Record<string, unknown>;
    }): Promise<void> {
      const rules = await prisma.automationRule.findMany({
        where: {
          tenantId: input.tenantId,
          module: input.module,
          triggerEvent: input.triggerEvent,
          isActive: true,
        },
      });
      for (const rule of rules) {
        try {
          if (!evaluateConditions(rule.conditions, input.payload)) continue;

          // Idempotency guard: claim (ruleId, eventId). Unique-constraint clash ⇒
          // already handled this event for this rule → skip.
          let run;
          try {
            run = await prisma.automationRuleRun.create({
              data: {
                tenantId: input.tenantId,
                ruleId: rule.id,
                eventId: input.eventId,
                status: 'RUNNING',
              },
            });
          } catch {
            continue; // duplicate (ruleId,eventId) — already processed
          }

          await this.executeRule(rule.id, run.id, input.tenantId, input.eventId, rule.actions, input.payload);
        } catch (err) {
          // Fail-open: a single bad rule never blocks the others or the consumer.
          console.error(`[automation] rule ${rule.id} failed on ${input.triggerEvent}:`, err);
        }
      }
    },

    /** Execute a matched rule's actions sequentially and finalise its run row. */
    async executeRule(
      ruleId: string,
      runId: string,
      tenantId: string,
      eventId: string,
      actionsJson: unknown,
      payload: Record<string, unknown>
    ): Promise<void> {
      const actions = Array.isArray(actionsJson) ? (actionsJson as AutomationAction[]) : [];
      const ctx = buildRuleExecutionContext(tenantId, ruleId, eventId, payload);
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
    },
  };
}

export type AutomationRulesService = ReturnType<typeof createAutomationRulesService>;
