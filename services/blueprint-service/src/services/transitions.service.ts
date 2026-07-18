import { TOPICS, type NexusProducer } from '@nexus/kafka';
import { NexusError, NotFoundError, ValidationError } from '@nexus/service-utils';
import type { BlueprintPrisma } from '../prisma.js';
import { alsStore } from '../request-context.js';
import {
  executeAfterActions,
  fetchRecordSnapshot,
  type TransitionActionContext,
} from './transition-actions.service.js';
import {
  evalCriteria,
  isRoleAllowed,
  parseBeforeConditions,
  parseDuringConfig,
  validateDuring,
} from './transition-rules.js';

interface LoggerLike {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

function tenantId(): string {
  return alsStore.get('tenantId') as string;
}

/** Caller identity resolved from the JWT in the route layer. */
export interface Actor {
  userId?: string;
  roles: string[];
}

export interface CreateTransitionInput {
  name: string;
  fromStageId: string;
  toStageId: string;
  beforeConditions?: unknown;
  duringConfig?: unknown;
  afterActions?: unknown;
  slaMinutes?: number | null;
  escalationConfig?: unknown;
}

export type UpdateTransitionInput = Partial<CreateTransitionInput>;

export interface PerformTransitionInput {
  transitionId: string;
  data?: Record<string, unknown>;
  checklist?: Record<string, unknown>;
}

type HistoryEntry = {
  fromStageId: string;
  toStageId: string;
  transitionId: string;
  transitionName: string;
  byUserId?: string;
  at: string;
  data?: Record<string, unknown>;
};

export function createTransitionsService(
  prisma: BlueprintPrisma,
  producer: NexusProducer,
  log: LoggerLike
) {
  async function requirePlaybook(playbookId: string) {
    const pb = await prisma.playbook.findFirst({ where: { id: playbookId } });
    if (!pb) throw new NotFoundError('Playbook', playbookId);
    return pb;
  }

  async function getTransitionOr404(playbookId: string, id: string) {
    const row = await prisma.blueprintTransition.findFirst({ where: { id, playbookId } });
    if (!row) throw new NotFoundError('BlueprintTransition', id);
    return row;
  }

  return {
    // ─── CRUD (blueprints:manage) ──────────────────────────────────────────
    async list(playbookId: string) {
      await requirePlaybook(playbookId);
      return prisma.blueprintTransition.findMany({
        where: { playbookId },
        orderBy: [{ fromStageId: 'asc' }, { createdAt: 'asc' }],
      });
    },

    async create(playbookId: string, input: CreateTransitionInput) {
      await requirePlaybook(playbookId);
      const tid = tenantId();
      const row = await prisma.blueprintTransition.create({
        data: {
          tenantId: tid,
          playbookId,
          name: input.name,
          fromStageId: input.fromStageId,
          toStageId: input.toStageId,
          beforeConditions: (input.beforeConditions ?? {}) as object,
          duringConfig: (input.duringConfig ?? {}) as object,
          afterActions: (input.afterActions ?? {}) as object,
          slaMinutes: input.slaMinutes ?? null,
          escalationConfig: (input.escalationConfig ?? undefined) as object | undefined,
        },
      });
      await producer.publish(TOPICS.BLUEPRINT, {
        type: 'blueprint.transition.created',
        tenantId: tid,
        payload: { playbookId, transitionId: row.id, tenantId: tid },
      });
      return row;
    },

    async update(playbookId: string, id: string, input: UpdateTransitionInput) {
      await getTransitionOr404(playbookId, id);
      const data: Record<string, unknown> = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.fromStageId !== undefined) data.fromStageId = input.fromStageId;
      if (input.toStageId !== undefined) data.toStageId = input.toStageId;
      if (input.beforeConditions !== undefined) data.beforeConditions = input.beforeConditions as object;
      if (input.duringConfig !== undefined) data.duringConfig = input.duringConfig as object;
      if (input.afterActions !== undefined) data.afterActions = input.afterActions as object;
      if (input.slaMinutes !== undefined) data.slaMinutes = input.slaMinutes;
      if (input.escalationConfig !== undefined) data.escalationConfig = input.escalationConfig as object;
      const row = await prisma.blueprintTransition.update({ where: { id }, data });
      return row;
    },

    async delete(playbookId: string, id: string) {
      await getTransitionOr404(playbookId, id);
      await prisma.blueprintTransition.delete({ where: { id } });
    },

    // ─── Advance flow (blueprints:read) ────────────────────────────────────

    /**
     * Return the transitions the current user may run from a record's CURRENT
     * stage, each annotated with `allowed` + `blockedReasons` so a UI can render
     * enabled/disabled transition buttons and the During dialog requirements.
     *
     * Current stage resolution: the record's persisted BlueprintRecordState, or
     * the `?playbookId` + `?currentStageId` query fallback for a record that has
     * not entered the blueprint yet.
     */
    async availableTransitions(
      module: string,
      recordId: string,
      actor: Actor,
      fallback: { playbookId?: string; currentStageId?: string } = {}
    ) {
      const state = await prisma.blueprintRecordState.findFirst({ where: { module, recordId } });
      const playbookId = state?.playbookId ?? fallback.playbookId;
      const currentStageId = state?.currentStageId ?? fallback.currentStageId;

      if (!playbookId || !currentStageId) {
        return {
          module,
          recordId,
          playbookId: playbookId ?? null,
          currentStageId: currentStageId ?? null,
          hasState: !!state,
          transitions: [],
        };
      }

      const candidates = await prisma.blueprintTransition.findMany({
        where: { playbookId, fromStageId: currentStageId },
        orderBy: { createdAt: 'asc' },
      });

      // Fetch the record snapshot once for Before-criteria evaluation. When the
      // snapshot is unavailable we SKIP criteria (do not falsely block) and flag
      // it, so a CRM outage degrades gracefully to role-only gating.
      const snapshot =
        candidates.length > 0
          ? await fetchRecordSnapshot(module, recordId, tenantId(), log)
          : null;

      const transitions = candidates.map((t) => {
        const before = parseBeforeConditions(t.beforeConditions);
        const during = parseDuringConfig(t.duringConfig);
        const blockedReasons: string[] = [];

        if (!isRoleAllowed(before.allowedRoles, actor.roles)) {
          blockedReasons.push(
            `Requires one of these roles: ${before.allowedRoles.join(', ')}.`
          );
        }
        if (snapshot) {
          blockedReasons.push(...evalCriteria(before.criteria, snapshot));
        }

        return {
          id: t.id,
          name: t.name,
          fromStageId: t.fromStageId,
          toStageId: t.toStageId,
          slaMinutes: t.slaMinutes,
          allowed: blockedReasons.length === 0,
          blockedReasons,
          criteriaEvaluated: !!snapshot,
          during: {
            mandatoryFields: during.mandatoryFields,
            mandatoryActions: during.mandatoryActions,
            checklist: during.checklist,
            message: during.message,
          },
        };
      });

      return {
        module,
        recordId,
        playbookId,
        currentStageId,
        hasState: !!state,
        transitions,
      };
    },

    /**
     * Execute a transition for a record. Enforces Before (role + criteria),
     * validates During (mandatory fields / actions / checklist), then commits
     * the stage change, runs After actions, arms the SLA clock, and emits
     * `blueprint.transition.completed`.
     *
     * Throws:
     *   - 404 NotFound        — unknown transition
     *   - 409 STAGE_CONFLICT  — record is not at the transition's fromStage
     *   - 403 FORBIDDEN_TRANSITION — actor lacks an allowed role
     *   - 422 ValidationError — unmet Before criteria or During requirements
     */
    async performTransition(
      module: string,
      recordId: string,
      input: PerformTransitionInput,
      actor: Actor,
      correlationId?: string
    ) {
      const tid = tenantId();
      const transition = await prisma.blueprintTransition.findFirst({
        where: { id: input.transitionId },
      });
      if (!transition) throw new NotFoundError('BlueprintTransition', input.transitionId);

      const state = await prisma.blueprintRecordState.findFirst({ where: { module, recordId } });

      // Current-stage guard: an existing record must sit at fromStageId. A record
      // with no state yet enters the blueprint at this transition's fromStage.
      const currentStageId = state?.currentStageId ?? transition.fromStageId;
      if (currentStageId !== transition.fromStageId) {
        throw new NexusError(
          'STAGE_CONFLICT',
          `Record is at stage "${currentStageId}" but transition "${transition.name}" starts from "${transition.fromStageId}".`,
          409,
          { currentStageId, expectedFromStageId: transition.fromStageId }
        );
      }
      if (state && state.playbookId !== transition.playbookId) {
        throw new NexusError(
          'STAGE_CONFLICT',
          'Transition belongs to a different playbook than the record is currently in.',
          409,
          { recordPlaybookId: state.playbookId, transitionPlaybookId: transition.playbookId }
        );
      }

      const before = parseBeforeConditions(transition.beforeConditions);
      const during = parseDuringConfig(transition.duringConfig);
      const data = input.data ?? {};
      const checklist = input.checklist ?? {};

      // BEFORE — transition-owner role gate.
      if (!isRoleAllowed(before.allowedRoles, actor.roles)) {
        throw new NexusError(
          'FORBIDDEN_TRANSITION',
          `You do not hold a role permitted to run "${transition.name}".`,
          403,
          { allowedRoles: before.allowedRoles }
        );
      }

      // BEFORE — entry criteria against the record snapshot merged with submitted
      // During data (so criteria can reference just-entered values).
      const snapshot = await fetchRecordSnapshot(module, recordId, tid, log);
      if (snapshot) {
        const merged = { ...snapshot, ...data };
        const criteriaErrors = evalCriteria(before.criteria, merged);
        if (criteriaErrors.length > 0) {
          throw new ValidationError('Transition entry criteria not met', {
            phase: 'before',
            errors: criteriaErrors,
          });
        }
      }

      // DURING — mandatory fields / actions / checklist.
      const violations = validateDuring(during, data, checklist);
      if (violations.length > 0) {
        throw new ValidationError('Transition requirements not satisfied', {
          phase: 'during',
          violations,
        });
      }

      // ── Commit the stage change (upsert the record state). ────────────────
      const now = new Date();
      const historyEntry: HistoryEntry = {
        fromStageId: transition.fromStageId,
        toStageId: transition.toStageId,
        transitionId: transition.id,
        transitionName: transition.name,
        byUserId: actor.userId,
        at: now.toISOString(),
        data,
      };
      const priorHistory = Array.isArray(state?.history) ? (state!.history as unknown[]) : [];
      const nextHistory = [...priorHistory, historyEntry];

      // SLA clock: arm it when this transition declares an SLA for the stage it
      // enters, otherwise clear any prior clock.
      const hasSla = typeof transition.slaMinutes === 'number' && transition.slaMinutes > 0;
      const slaDueAt = hasSla
        ? new Date(now.getTime() + (transition.slaMinutes as number) * 60_000)
        : null;

      let recordState;
      if (state) {
        recordState = await prisma.blueprintRecordState.update({
          where: { id: state.id },
          data: {
            currentStageId: transition.toStageId,
            history: nextHistory as object,
            slaTransitionId: hasSla ? transition.id : null,
            slaDueAt,
            slaBreached: false,
            slaBreachedAt: null,
          },
        });
      } else {
        recordState = await prisma.blueprintRecordState.create({
          data: {
            tenantId: tid,
            module,
            recordId,
            playbookId: transition.playbookId,
            currentStageId: transition.toStageId,
            history: nextHistory as object,
            slaTransitionId: hasSla ? transition.id : null,
            slaDueAt,
            slaBreached: false,
            slaBreachedAt: null,
          },
        });
      }

      // ── AFTER — run configured field updates / tasks / alerts / functions. ─
      const actionCtx: TransitionActionContext = {
        tenantId: tid,
        module,
        recordId,
        fromStageId: transition.fromStageId,
        toStageId: transition.toStageId,
        transitionId: transition.id,
        actorId: actor.userId,
        correlationId,
      };
      let afterSummary;
      try {
        afterSummary = await executeAfterActions(transition.afterActions, actionCtx, producer, log);
      } catch (err) {
        log.error({ err }, 'blueprint afterActions execution error (suppressed)');
      }

      // ── Emit the completion event. ────────────────────────────────────────
      try {
        await producer.publish(TOPICS.BLUEPRINT, {
          type: 'blueprint.transition.completed',
          tenantId: tid,
          correlationId,
          payload: {
            module,
            recordId,
            playbookId: transition.playbookId,
            transitionId: transition.id,
            transitionName: transition.name,
            fromStageId: transition.fromStageId,
            toStageId: transition.toStageId,
            byUserId: actor.userId,
            slaDueAt: slaDueAt ? slaDueAt.toISOString() : null,
            at: now.toISOString(),
          },
        });
      } catch (err) {
        log.warn({ err }, 'blueprint.transition.completed publish failed');
      }

      return {
        state: recordState,
        transition: {
          id: transition.id,
          name: transition.name,
          fromStageId: transition.fromStageId,
          toStageId: transition.toStageId,
        },
        afterActions: afterSummary ?? null,
        slaDueAt: slaDueAt ? slaDueAt.toISOString() : null,
      };
    },

    /** Read a record's current blueprint state + history. */
    async getRecordState(module: string, recordId: string) {
      const state = await prisma.blueprintRecordState.findFirst({ where: { module, recordId } });
      if (!state) throw new NotFoundError('BlueprintRecordState', `${module}/${recordId}`);
      return state;
    },
  };
}

export type TransitionsService = ReturnType<typeof createTransitionsService>;
