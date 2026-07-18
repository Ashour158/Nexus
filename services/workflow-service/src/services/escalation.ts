/**
 * Escalation Rules (WF-DEPTH — Zoho "Escalation Rules": time-based, tiered).
 *
 * An EscalationRule defines an ordered ladder of tiers for a module. When a record
 * needs escalating (an unanswered case, an unattended big deal), an
 * EscalationInstance is opened against the rule; a poller walks the instance up the
 * ladder, firing each tier's action at its `afterMinutes` mark (measured from the
 * instance's `startedAt`). Resolving the instance (record replied/closed) stops the
 * ladder before the remaining tiers fire.
 *
 * Tier actions reuse the SAME engine node handlers automation rules use:
 *   - NOTIFY     → publish `notification.requested` (via the NOTIFY node)
 *   - REASSIGN   → ASSIGN node → CRM internal assign command
 *   - SET_FIELD  → SET_FIELD node → CRM internal set-field command
 *   - CREATE_TASK→ CREATE_TASK node → CRM internal activity command
 *
 * The poller runs without a request context; every query is pinned to the row's
 * own `tenantId`, and instances are atomically CLAIMED (ACTIVE→FIRING) so no tier
 * fires twice across overlapping ticks or replicas.
 */
import { NotFoundError, ValidationError } from '@nexus/service-utils';
import type { WorkflowPrisma } from '../prisma.js';
import type { NotificationProducer } from '../engine/types.js';
import {
  buildRuleExecutionContext,
  executeAutomationAction,
  type AutomationAction,
} from '../engine/automation-actions.js';
import type { RuleCondition } from './automation-rules.service.js';

/** The action a tier may take. */
export const TIER_ACTIONS = ['NOTIFY', 'REASSIGN', 'SET_FIELD', 'CREATE_TASK'] as const;
export type TierAction = (typeof TIER_ACTIONS)[number];

export interface EscalationTier {
  afterMinutes: number;
  action: TierAction;
  /** Action target: recipient user id (NOTIFY), new owner id (REASSIGN), etc. */
  target?: string;
  /** Action params: e.g. { field, value } for SET_FIELD, { subject } for CREATE_TASK. */
  params?: Record<string, unknown>;
}

export interface EscalationRuleInput {
  module: string;
  name: string;
  criteria?: RuleCondition[];
  tiers: EscalationTier[];
  businessHoursOnly?: boolean;
  isActive?: boolean;
}

// ─── Business-hours shifting ─────────────────────────────────────────────────

const BH_START = Number(process.env.ESCALATION_BUSINESS_HOUR_START ?? 9); // inclusive, UTC
const BH_END = Number(process.env.ESCALATION_BUSINESS_HOUR_END ?? 17); // exclusive, UTC

/** Whether `d` falls inside business hours (Mon–Fri, [BH_START, BH_END) UTC). */
function isBusinessTime(d: Date): boolean {
  const day = d.getUTCDay(); // 0 Sun … 6 Sat
  if (day === 0 || day === 6) return false;
  const hour = d.getUTCHours();
  return hour >= BH_START && hour < BH_END;
}

/**
 * Shift a fire time into the next business-hours window when the rule is
 * business-hours-only. If already inside a window, returns it unchanged. Advances
 * hour-by-hour (bounded) so a weekend/after-hours time lands at the next window's
 * open. Deterministic and side-effect-free.
 */
export function nextBusinessTime(d: Date): Date {
  if (BH_END <= BH_START) return d; // misconfigured → don't shift
  const out = new Date(d.getTime());
  // Bound the walk (≈ up to ~10 days of hours) so it can never loop unbounded.
  for (let i = 0; i < 24 * 10; i++) {
    if (isBusinessTime(out)) return out;
    const day = out.getUTCDay();
    const hour = out.getUTCHours();
    if (day === 0 || day === 6 || hour >= BH_END) {
      // Jump to next day's open.
      out.setUTCDate(out.getUTCDate() + 1);
      out.setUTCHours(BH_START, 0, 0, 0);
    } else {
      // Before open on a weekday → move to open the same day.
      out.setUTCHours(BH_START, 0, 0, 0);
    }
  }
  return out;
}

/** Compute the due time for tier index `i` relative to `startedAt`. */
function tierFireAt(startedAt: Date, tiers: EscalationTier[], i: number, businessHoursOnly: boolean): Date {
  const mins = Math.max(0, Number(tiers[i]?.afterMinutes ?? 0));
  const raw = new Date(startedAt.getTime() + mins * 60_000);
  return businessHoursOnly ? nextBusinessTime(raw) : raw;
}

function normaliseTiers(raw: unknown): EscalationTier[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t) => t as EscalationTier)
    .filter((t) => t && (TIER_ACTIONS as readonly string[]).includes(t.action));
}

// ─── Tier action → engine action mapping ─────────────────────────────────────

/**
 * Build the declarative AutomationAction (+ the payload context) for a tier. Reuses
 * the automation engine node handlers, so escalation NOTIFY/REASSIGN/SET_FIELD/
 * CREATE_TASK behave identically to the same automation-rule actions.
 */
function buildTierAction(
  tier: EscalationTier,
  recordId: string,
  recordData: Record<string, unknown>
): { action: AutomationAction; payload: Record<string, unknown> } | null {
  // Base payload: the record snapshot + a guaranteed id, plus a well-known key the
  // NOTIFY node can read the escalation recipient from.
  const payload: Record<string, unknown> = { ...recordData, id: recordId };
  const params = tier.params ?? {};

  switch (tier.action) {
    case 'NOTIFY': {
      if (tier.target) payload.__escalationRecipient = tier.target;
      return {
        payload,
        action: {
          type: 'NOTIFY',
          config: {
            userIdField: '__escalationRecipient',
            title: (params.title as string) ?? 'Escalation',
            body: (params.body as string) ?? 'A record has escalated and needs attention.',
            entityIdField: 'id',
          },
        },
      };
    }
    case 'REASSIGN': {
      return {
        payload,
        action: {
          type: 'ASSIGN',
          config: {
            entity: (params.entity as string) ?? undefined,
            idField: 'id',
            userId: tier.target, // literal new owner
          },
        },
      };
    }
    case 'SET_FIELD': {
      const field = (params.field as string) ?? tier.target;
      if (!field) return null;
      return {
        payload,
        action: {
          type: 'SET_FIELD',
          config: {
            entity: (params.entity as string) ?? undefined,
            idField: 'id',
            field,
            value: params.value,
          },
        },
      };
    }
    case 'CREATE_TASK': {
      return {
        payload,
        action: {
          type: 'CREATE_TASK',
          config: {
            subject: (params.subject as string) ?? 'Escalation follow-up',
            ownerIdField: tier.target ? '__escalationRecipient' : 'ownerId',
            dealIdField: 'id',
            dueInHours: Number(params.dueInHours ?? 24),
          },
        },
      };
    }
    default:
      return null;
  }
}

// ─── CRUD service ────────────────────────────────────────────────────────────

export function createEscalationService(prisma: WorkflowPrisma) {
  return {
    async list(tenantId: string, filters: { module?: string; isActive?: boolean }) {
      return prisma.escalationRule.findMany({
        where: {
          tenantId,
          ...(filters.module ? { module: filters.module } : {}),
          ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
        },
        orderBy: { createdAt: 'desc' },
      });
    },

    async get(tenantId: string, id: string) {
      const row = await prisma.escalationRule.findFirst({ where: { id, tenantId } });
      if (!row) throw new NotFoundError('Escalation rule not found');
      return row;
    },

    async create(tenantId: string, createdBy: string, data: EscalationRuleInput) {
      const tiers = normaliseTiers(data.tiers);
      if (tiers.length === 0) throw new ValidationError('An escalation rule needs at least one valid tier');
      return prisma.escalationRule.create({
        data: {
          tenantId,
          createdBy,
          module: data.module,
          name: data.name,
          criteria: (data.criteria ?? undefined) as object | undefined,
          tiers: tiers as object,
          businessHoursOnly: data.businessHoursOnly ?? false,
          isActive: data.isActive ?? true,
        },
      });
    },

    async update(tenantId: string, id: string, data: Partial<EscalationRuleInput>) {
      await this.get(tenantId, id);
      const tiers = data.tiers !== undefined ? normaliseTiers(data.tiers) : undefined;
      if (tiers !== undefined && tiers.length === 0) {
        throw new ValidationError('An escalation rule needs at least one valid tier');
      }
      return prisma.escalationRule.update({
        where: { id },
        data: {
          ...(data.module !== undefined ? { module: data.module } : {}),
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.criteria !== undefined ? { criteria: data.criteria as object } : {}),
          ...(tiers !== undefined ? { tiers: tiers as object } : {}),
          ...(data.businessHoursOnly !== undefined ? { businessHoursOnly: data.businessHoursOnly } : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        },
      });
    },

    async remove(tenantId: string, id: string) {
      await this.get(tenantId, id);
      await prisma.escalationRule.delete({ where: { id } });
      return { id };
    },

    async toggle(tenantId: string, id: string) {
      const row = await this.get(tenantId, id);
      return prisma.escalationRule.update({ where: { id }, data: { isActive: !row.isActive } });
    },

    /** List a rule's escalation instances (newest first). */
    async listInstances(tenantId: string, ruleId: string, status?: string) {
      await this.get(tenantId, ruleId);
      return prisma.escalationInstance.findMany({
        where: { tenantId, ruleId, ...(status ? { status } : {}) },
        orderBy: { startedAt: 'desc' },
      });
    },

    /**
     * Open an escalation instance for a record against a rule. Sets the first tier's
     * due time (`nextFireAt`). Idempotent-ish: if an ACTIVE instance already exists
     * for (rule, record) it is returned unchanged rather than duplicated.
     */
    async startInstance(
      tenantId: string,
      ruleId: string,
      module: string | undefined,
      recordId: string,
      recordData: Record<string, unknown> = {}
    ) {
      const rule = await this.get(tenantId, ruleId);
      const tiers = normaliseTiers(rule.tiers);
      if (tiers.length === 0) throw new ValidationError('Rule has no valid tiers to escalate through');

      const existing = await prisma.escalationInstance.findFirst({
        where: { tenantId, ruleId, recordId, status: 'ACTIVE' },
      });
      if (existing) return existing;

      const startedAt = new Date();
      const nextFireAt = tierFireAt(startedAt, tiers, 0, rule.businessHoursOnly);
      return prisma.escalationInstance.create({
        data: {
          tenantId,
          ruleId,
          module: module ?? rule.module,
          recordId,
          recordData: recordData as object,
          startedAt,
          currentTier: 0,
          nextFireAt,
          status: 'ACTIVE',
        },
      });
    },

    /** Stop an escalation instance early (record replied/closed). */
    async resolveInstance(tenantId: string, instanceId: string) {
      const row = await prisma.escalationInstance.findFirst({ where: { id: instanceId, tenantId } });
      if (!row) throw new NotFoundError('Escalation instance not found');
      if (row.status !== 'ACTIVE') return row;
      return prisma.escalationInstance.update({
        where: { id: instanceId },
        data: { status: 'RESOLVED', resolvedAt: new Date() },
      });
    },
  };
}

export type EscalationService = ReturnType<typeof createEscalationService>;

// ─── Firing one tier ─────────────────────────────────────────────────────────

type Logger = {
  warn: (obj: unknown, msg?: string) => void;
  info?: (obj: unknown, msg?: string) => void;
};

/**
 * Fire the current tier of a CLAIMED (status=FIRING) instance, then advance it:
 * compute the next tier's due time, or mark COMPLETED after the last tier. Re-reads
 * the owning rule (tenant-pinned) so an inactive/deleted rule stops the ladder.
 * Never throws — the poller keeps running.
 */
export async function fireEscalationTier(
  prisma: WorkflowPrisma,
  producer: NotificationProducer | undefined,
  instance: {
    id: string;
    tenantId: string;
    ruleId: string;
    module: string;
    recordId: string;
    recordData: unknown;
    startedAt: Date;
    currentTier: number;
  },
  logger: Logger
): Promise<'ADVANCED' | 'COMPLETED' | 'CANCELLED' | 'FAILED'> {
  try {
    const rule = await prisma.escalationRule.findFirst({
      where: { id: instance.ruleId, tenantId: instance.tenantId },
      select: { isActive: true, tiers: true, businessHoursOnly: true },
    });
    if (!rule || !rule.isActive) {
      await prisma.escalationInstance
        .update({ where: { id: instance.id }, data: { status: 'RESOLVED', resolvedAt: new Date() } })
        .catch(() => undefined);
      return 'CANCELLED';
    }

    const tiers = normaliseTiers(rule.tiers);
    const tier = tiers[instance.currentTier];
    if (!tier) {
      await prisma.escalationInstance
        .update({ where: { id: instance.id }, data: { status: 'COMPLETED' } })
        .catch(() => undefined);
      return 'COMPLETED';
    }

    // Fire the tier action through the shared engine handlers.
    const recordData = (instance.recordData ?? {}) as Record<string, unknown>;
    const built = buildTierAction(tier, instance.recordId, recordData);
    if (built) {
      const ctx = buildRuleExecutionContext(
        instance.tenantId,
        instance.ruleId,
        `escalation:${instance.id}:tier${instance.currentTier}`,
        built.payload,
        producer
      );
      try {
        await executeAutomationAction(built.action, ctx, instance.currentTier);
      } catch (err) {
        // A single tier action failing must not wedge the ladder — log and still
        // advance so later tiers get their chance.
        logger.warn({ err, instanceId: instance.id, tier: instance.currentTier }, 'Escalation tier action failed');
      }
    }

    // Advance: next tier's due time, or COMPLETED after the last tier.
    const nextTier = instance.currentTier + 1;
    if (nextTier >= tiers.length) {
      await prisma.escalationInstance.update({
        where: { id: instance.id },
        data: { status: 'COMPLETED', currentTier: nextTier },
      });
      return 'COMPLETED';
    }

    const nextFireAt = tierFireAt(instance.startedAt, tiers, nextTier, rule.businessHoursOnly);
    await prisma.escalationInstance.update({
      where: { id: instance.id },
      data: { currentTier: nextTier, nextFireAt, status: 'ACTIVE' },
    });
    return 'ADVANCED';
  } catch (err) {
    logger.warn({ err, instanceId: instance.id }, 'Escalation tier fire failed');
    // Return the instance to ACTIVE so a later tick can retry the claim.
    await prisma.escalationInstance
      .updateMany({ where: { id: instance.id, status: 'FIRING' }, data: { status: 'ACTIVE' } })
      .catch(() => undefined);
    return 'FAILED';
  }
}

// ─── The poller ──────────────────────────────────────────────────────────────

/**
 * Poller: fire due escalation tiers. Mirrors the scheduled-action poller guards —
 * setInterval + .unref(), a reentrancy guard, whole-tick try/catch, and an atomic
 * ACTIVE→FIRING claim per instance so a tier is never fired twice across
 * overlapping ticks or replicas. Runs without a request context; every query is
 * pinned to the instance's own tenantId.
 */
export function startEscalationPoller(
  prisma: WorkflowPrisma,
  producer: NotificationProducer | undefined,
  logger: Logger,
  intervalMs = Number(process.env.ESCALATION_TICK_MS ?? '60000')
): NodeJS.Timeout {
  const tickMs = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 60_000;
  const batchSize = Number(process.env.ESCALATION_BATCH ?? '100');
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const now = new Date();
      const due = await prisma.escalationInstance.findMany({
        where: { status: 'ACTIVE', nextFireAt: { lte: now } },
        orderBy: { nextFireAt: 'asc' },
        take: Number.isFinite(batchSize) && batchSize > 0 ? batchSize : 100,
      });

      for (const instance of due) {
        // Atomic claim: only the tick that flips ACTIVE→FIRING runs it.
        const claim = await prisma.escalationInstance.updateMany({
          where: { id: instance.id, status: 'ACTIVE' },
          data: { status: 'FIRING' },
        });
        if (claim.count === 0) continue; // lost the race
        await fireEscalationTier(prisma, producer, instance, logger);
      }
    } catch (err) {
      logger.warn({ err }, 'Escalation poller tick failed');
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
