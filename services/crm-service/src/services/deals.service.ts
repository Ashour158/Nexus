import type { PaginatedResult, TimelineEvent } from '@nexus/shared-types';
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from '@nexus/service-utils';
import type {
  CreateDealInput,
  MeddicicDataInput,
  UpdateDealInput,
} from '@nexus/validation';
import { NexusProducer, TOPICS } from '@nexus/kafka';
import { Prisma } from '../../../../node_modules/.prisma/crm-client/index.js';
import type {
  Deal,
  DealContact,
} from '../../../../node_modules/.prisma/crm-client/index.js';
import type { CrmPrisma } from '../prisma.js';
import { recordFieldChanges } from '../lib/field-history.js';
import { toPaginatedResult } from '@nexus/shared-types';
import { updateDealDataQuality } from '../lib/data-quality.js';
import { computeDealHealth, deriveMeddicGaps } from '../lib/deal-health.engine.js';
import { scoreDeal } from '../lib/ai/scoring.service.js';
import { assertValidStageTransition } from '../lib/blueprint-client.js';
import {
  enforceValidationRules,
  applyFieldPermissions,
  maskFieldPermissions,
  mergeForValidation,
} from '../lib/write-guards.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Full deal read-shape for detail views (Section 34.2 `GET /deals/:id`). */
export type DealWithRelations = Prisma.DealGetPayload<{
  include: {
    account: true;
    pipeline: true;
    stage: true;
    contacts: { include: { contact: true } };
  };
}>;

/** Row shape returned by `listDealContacts` — join + Contact. */
export type DealContactWithContact = Prisma.DealContactGetPayload<{
  include: { contact: true };
}>;

/** Filters for `listDeals` (derived from `DealListQuerySchema`). */
export interface DealListFilters {
  pipelineId?: string;
  stageId?: string;
  ownerId?: string;
  accountId?: string;
  status?: 'OPEN' | 'WON' | 'LOST' | 'DORMANT';
  search?: string;
  minAmount?: number;
  maxAmount?: number;
  /** When true, soft-deleted (DORMANT) deals are included. Default false. */
  includeDeleted?: boolean;
}

/** Pagination + sort for `listDeals`. */
export interface DealListPagination {
  page: number;
  limit: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'amount' | 'expectedCloseDate';
  sortDir: 'asc' | 'desc';
}

/**
 * Per-request access context for read paths. Carries the ownership-scope `where`
 * fragment (from `applyOwnershipScope`) that must be intersected into every list
 * query, and the caller's roles for FieldPermission read-masking. Both are
 * optional so existing callers/tests behave exactly as before when omitted.
 */
export interface ReadAccessContext {
  /** Ownership-scope Prisma `where` fragment (`{}` = all, `{ ownerId: ... }`, etc.). */
  ownershipWhere?: Record<string, unknown>;
  /** Caller roles from the JWT, used for field-level read masking. */
  roles?: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildDealListWhere(
  tenantId: string,
  filters: DealListFilters
): Prisma.DealWhereInput {
  const where: Prisma.DealWhereInput = { tenantId };

  if (filters.status) {
    where.status = filters.status;
  } else if (!filters.includeDeleted) {
    where.status = { not: 'DORMANT' };
  }

  if (filters.includeDeleted) {
    where.deletedAt = {};
  }

  if (filters.pipelineId) where.pipelineId = filters.pipelineId;
  if (filters.stageId) where.stageId = filters.stageId;
  if (filters.ownerId) where.ownerId = filters.ownerId;
  if (filters.accountId) where.accountId = filters.accountId;

  if (filters.search?.trim()) {
    where.name = { contains: filters.search.trim(), mode: 'insensitive' };
  }

  if (filters.minAmount !== undefined || filters.maxAmount !== undefined) {
    const amount: Prisma.DecimalFilter = {};
    if (filters.minAmount !== undefined) amount.gte = new Prisma.Decimal(filters.minAmount);
    if (filters.maxAmount !== undefined) amount.lte = new Prisma.Decimal(filters.maxAmount);
    where.amount = amount;
  }

  return where;
}

function resolveSortField(
  sortBy: DealListPagination['sortBy']
): keyof Prisma.DealOrderByWithRelationInput {
  switch (sortBy) {
    case 'amount':
    case 'expectedCloseDate':
    case 'updatedAt':
      return sortBy;
    case 'createdAt':
    default:
      return 'createdAt';
  }
}

function decimalToNumber(value: Prisma.Decimal): number {
  return Number(value.toFixed(2));
}

function dealSnapshotForHistory(d: Deal): Record<string, unknown> {
  return {
    name: d.name,
    amount: d.amount.toFixed(2),
    stageId: d.stageId,
    pipelineId: d.pipelineId,
    probability: d.probability,
    expectedCloseDate: d.expectedCloseDate?.toISOString() ?? null,
    ownerId: d.ownerId,
    accountId: d.accountId,
    closeReason: d.closeReason ?? null,
    lostReason: d.lostReason ?? null,
    status: d.status,
  };
}

function computeMeddicicScore(data: MeddicicDataInput): number {
  const individual =
    data.metrics.score +
    data.decisionCriteria.score +
    data.decisionProcess.score +
    data.paperProcess.score +
    data.identifyPain.score;
  const boolScores =
    (data.economicBuyer.identified ? 100 : 0) +
    (data.champion.identified ? 100 : 0) +
    (data.competition.identified ? 100 : 0);
  return Math.round((individual + boolScores) / 8);
}

// ─── Service Factory ────────────────────────────────────────────────────────

/**
 * Deals service (Section 34.2) — all business logic for `/api/v1/deals`.
 *
 * Publishes Kafka events via {@link NexusProducer}:
 * - `deal.created` on `createDeal`
 * - `deal.stage_changed` on `moveDealToStage`
 * - `deal.won` on `markDealWon`
 * - `deal.lost` on `markDealLost`
 */
export function createDealsService(prisma: CrmPrisma, producer: NexusProducer) {
  /** Loads a deal scoped to the tenant or throws `NotFoundError`. */
  async function loadDealOrThrow(tenantId: string, id: string): Promise<Deal> {
    const row = await prisma.deal.findFirst({ where: { id, tenantId } });
    if (!row) {
      throw new NotFoundError('Deal', id);
    }
    return row;
  }

  /**
   * Counts how many times a deal's `expectedCloseDate` was pushed *later* using
   * the field-change log (populated on deal writes). A push is a change where
   * both old and new values parse as dates and the new date is later than the
   * old. Fail-open: any read/parse error yields 0 so scoring never breaks.
   */
  async function countCloseDatePushes(tenantId: string, dealId: string): Promise<number> {
    try {
      const changes = await prisma.fieldChangeLog.findMany({
        where: { tenantId, objectType: 'deal', objectId: dealId, fieldName: 'expectedCloseDate' },
        orderBy: { changedAt: 'asc' },
        select: { oldValue: true, newValue: true },
      });
      let pushes = 0;
      for (const change of changes) {
        if (!change.oldValue || !change.newValue) continue;
        const oldTime = new Date(change.oldValue).getTime();
        const newTime = new Date(change.newValue).getTime();
        if (Number.isFinite(oldTime) && Number.isFinite(newTime) && newTime > oldTime) {
          pushes += 1;
        }
      }
      return pushes;
    } catch {
      return 0;
    }
  }

  /** Loads a deal with all detail relations or throws `NotFoundError`. */
  async function loadDealWithRelations(
    tenantId: string,
    id: string
  ): Promise<DealWithRelations> {
    const row = await prisma.deal.findFirst({
      where: { id, tenantId },
      include: {
        account: true,
        pipeline: true,
        stage: true,
        contacts: { include: { contact: true } },
      },
    });
    if (!row) {
      throw new NotFoundError('Deal', id);
    }
    return row;
  }

  return {
    /**
     * Lists deals for a tenant with optional filters and pagination.
     * Soft-deleted (`DORMANT`) deals are excluded unless `filters.includeDeleted`
     * is true or the caller explicitly filters by `status=DORMANT`.
     */
    async listDeals(
      tenantId: string,
      filters: DealListFilters,
      pagination: DealListPagination,
      access?: ReadAccessContext
    ): Promise<PaginatedResult<Deal>> {
      // Intersect the ownership-scope fragment with the filter-derived where.
      // `own`/`team` add an `ownerId` constraint; `all` (or omitted) adds nothing.
      // This is ADDITIVE to the tenantId isolation already baked into where.
      const where = {
        ...buildDealListWhere(tenantId, filters),
        ...(access?.ownershipWhere ?? {}),
      } as Prisma.DealWhereInput;
      const { page, limit, sortDir } = pagination;
      const sortField = resolveSortField(pagination.sortBy);
      const orderBy: Prisma.DealOrderByWithRelationInput = {
        [sortField]: sortDir,
      };

      const [total, rows] = await Promise.all([
        prisma.deal.count({ where }),
        prisma.deal.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy,
        }),
      ]);

      const masked = (await maskFieldPermissions(
        prisma,
        tenantId,
        'deal',
        rows as unknown as Record<string, unknown>[],
        access?.roles
      )) as unknown as Deal[];

      return toPaginatedResult(masked, total, page, limit);
    },

    /**
     * Returns a deal with `account`, `pipeline`, `stage`, and `contacts.contact`.
     * Throws `NotFoundError` if the deal is not in the tenant.
     */
    async getDealById(
      tenantId: string,
      id: string,
      access?: ReadAccessContext
    ): Promise<DealWithRelations> {
      const row = await loadDealWithRelations(tenantId, id);
      return (await maskFieldPermissions(
        prisma,
        tenantId,
        'deal',
        row as unknown as Record<string, unknown>,
        access?.roles
      )) as unknown as DealWithRelations;
    },

    /**
     * Creates a deal for a tenant, validates that `accountId`, `pipelineId`,
     * and `stageId` all belong to the same tenant and that the stage is a
     * member of the given pipeline. Links optional `contactIds` via
     * `DealContact`. Publishes `deal.created` to `TOPICS.DEALS`.
     */
    async createDeal(tenantId: string, data: CreateDealInput): Promise<Deal> {
      const [account, pipeline, stage] = await Promise.all([
        prisma.account.findFirst({ where: { id: data.accountId, tenantId } }),
        prisma.pipeline.findFirst({ where: { id: data.pipelineId, tenantId } }),
        prisma.stage.findFirst({ where: { id: data.stageId, tenantId } }),
      ]);
      if (!account) throw new NotFoundError('Account', data.accountId);
      if (!pipeline) throw new NotFoundError('Pipeline', data.pipelineId);
      if (!stage) throw new NotFoundError('Stage', data.stageId);
      if (stage.pipelineId !== pipeline.id) {
        throw new BusinessRuleError('Stage does not belong to the given pipeline');
      }

      const uniqueContactIds = [...new Set(data.contactIds ?? [])];
      if (uniqueContactIds.length > 0) {
        const contactRows = await prisma.contact.findMany({
          where: { id: { in: uniqueContactIds }, tenantId },
          select: { id: true },
        });
        if (contactRows.length !== uniqueContactIds.length) {
          throw new NotFoundError('Contact', 'invalid');
        }
      }

      const probability = data.probability ?? stage.probability;

      // Enforce active validation rules (fail-open: no rules / eval error => allow).
      await enforceValidationRules(prisma, tenantId, 'deal', data as Record<string, unknown>);

      const created = await prisma.deal.create({
        data: {
          tenantId,
          ownerId: data.ownerId,
          accountId: data.accountId,
          pipelineId: data.pipelineId,
          stageId: data.stageId,
          name: data.name,
          amount: new Prisma.Decimal(data.amount ?? 0),
          currency: data.currency ?? 'USD',
          probability,
          expectedCloseDate: data.expectedCloseDate
            ? new Date(data.expectedCloseDate)
            : null,
          source: data.source ?? null,
          campaignId: data.campaignId ?? null,
          customFields: (data.customFields ?? {}) as Prisma.InputJsonValue,
          tags: data.tags ?? [],
          ...(uniqueContactIds.length > 0
            ? {
                contacts: {
                  create: uniqueContactIds.map((contactId, idx) => ({
                    tenantId,
                    contactId,
                    isPrimary: idx === 0,
                  })),
                },
              }
            : {}),
        },
      });

      await producer.publish(TOPICS.DEALS, {
        type: 'deal.created',
        tenantId,
        payload: {
          dealId: created.id,
          ownerId: created.ownerId,
          accountId: created.accountId,
          amount: decimalToNumber(created.amount),
          currency: created.currency,
          pipelineId: created.pipelineId,
          stageId: created.stageId,
        },
      });

      updateDealDataQuality(prisma, created.id).catch(() => undefined);

      return created;
    },

    /**
     * Partially updates a deal. Any of `accountId`, `pipelineId`, `stageId`
     * included in `data` are re-validated against the tenant; if both
     * `pipelineId` and `stageId` change, they are checked for consistency.
     * Stage changes do NOT publish `deal.stage_changed` here — callers should
     * use `moveDealToStage` for that transition.
     */
    async updateDeal(
      tenantId: string,
      id: string,
      data: UpdateDealInput,
      actor?: { userId: string; userEmail?: string },
      roles?: string[]
    ): Promise<Deal> {
      const existing = await loadDealOrThrow(tenantId, id);

      if (data.accountId && data.accountId !== existing.accountId) {
        const account = await prisma.account.findFirst({
          where: { id: data.accountId, tenantId },
        });
        if (!account) throw new NotFoundError('Account', data.accountId);
      }

      const targetPipelineId = data.pipelineId ?? existing.pipelineId;
      const targetStageId = data.stageId ?? existing.stageId;

      if (data.pipelineId || data.stageId) {
        const [pipeline, stage] = await Promise.all([
          prisma.pipeline.findFirst({ where: { id: targetPipelineId, tenantId } }),
          prisma.stage.findFirst({ where: { id: targetStageId, tenantId } }),
        ]);
        if (!pipeline) throw new NotFoundError('Pipeline', targetPipelineId);
        if (!stage) throw new NotFoundError('Stage', targetStageId);
        if (stage.pipelineId !== pipeline.id) {
          throw new BusinessRuleError('Stage does not belong to the given pipeline');
        }
      }

      // Blueprint validation when stage actually changes
      if (data.stageId && data.stageId !== existing.stageId) {
        const [contacts, activities] = await Promise.all([
          prisma.dealContact.findMany({ where: { dealId: id }, include: { contact: true } }),
          prisma.activity.findMany({ where: { dealId: id, tenantId } }),
        ]);
        const safeContacts = contacts ?? [];
        const safeActivities = activities ?? [];
        await assertValidStageTransition(tenantId, targetPipelineId, existing.stageId, data.stageId, {
          amount: Number(existing.amount),
          name: existing.name,
          expectedCloseDate: existing.expectedCloseDate?.toISOString(),
          probability: existing.probability,
          contactId: safeContacts.find(c => c.isPrimary)?.contactId,
          linkedContacts: safeContacts.map(c => ({ id: c.contactId })),
          completedActivityTypes: safeActivities.filter(a => a.status === 'COMPLETED').map(a => a.type),
          activities: safeActivities.map(a => ({ type: a.type, completed: a.status === 'COMPLETED' })),
        });
      }

      // Terminal-state guard (BL-13): a generic update must not silently change
      // the lifecycle status of a closed deal, nor jump a deal to a terminal state
      // (that must go through winDeal/loseDeal, which stamp the close date + emit
      // the won/lost events, and reopenDeal to move a closed deal back to OPEN).
      if (data.status !== undefined && data.status !== existing.status) {
        const TERMINAL = ['WON', 'LOST'];
        if (TERMINAL.includes(existing.status)) {
          throw new BusinessRuleError(
            `Deal is ${existing.status} — reopen it before changing status`
          );
        }
        if (TERMINAL.includes(data.status)) {
          throw new BusinessRuleError(
            `Use the win/lose action to move a deal to ${data.status}`
          );
        }
      }

      const updateData: Prisma.DealUpdateInput = {
        version: { increment: 1 },
      };
      if (data.name !== undefined) updateData.name = data.name;
      if (data.amount !== undefined) updateData.amount = new Prisma.Decimal(data.amount);
      if (data.currency !== undefined) updateData.currency = data.currency;
      if (data.probability !== undefined) updateData.probability = data.probability;
      if (data.expectedCloseDate !== undefined) {
        updateData.expectedCloseDate = data.expectedCloseDate
          ? new Date(data.expectedCloseDate)
          : null;
      }
      if (data.source !== undefined) updateData.source = data.source;
      if (data.campaignId !== undefined) updateData.campaignId = data.campaignId;
      if (data.customFields !== undefined) {
        updateData.customFields = data.customFields as Prisma.InputJsonValue;
      }
      if (data.tags !== undefined) updateData.tags = data.tags;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.lostReason !== undefined) updateData.lostReason = data.lostReason;
      if (data.closeReason !== undefined) updateData.closeReason = data.closeReason;
      if (data.forecastCategory !== undefined) {
        updateData.forecastCategory = data.forecastCategory;
      }
      if (data.meddicicData !== undefined) {
        updateData.meddicicData = data.meddicicData as Prisma.InputJsonValue;
      }
      if (data.ownerId !== undefined) updateData.ownerId = data.ownerId;
      if (data.accountId !== undefined) {
        updateData.account = { connect: { id: data.accountId } };
      }
      if (data.pipelineId !== undefined) {
        updateData.pipeline = { connect: { id: data.pipelineId } };
      }
      if (data.stageId !== undefined) {
        updateData.stage = { connect: { id: data.stageId } };
      }

      // FieldPermission: strip scalar fields the caller may not write (fail-open).
      // Relation-connect keys (account/pipeline/stage) and `version` never match
      // a FieldPermission row, so they are left untouched.
      const permResult = await applyFieldPermissions(
        prisma,
        tenantId,
        'deal',
        updateData as Record<string, unknown>,
        roles
      );
      const safeUpdateData = permResult.update as Prisma.DealUpdateInput;

      // Validation rules run against the post-write record. Build the candidate
      // from the raw scalar patch merged onto the existing row, dropping any
      // fields the FieldPermission guard stripped.
      const patchForValidation: Record<string, unknown> = { ...(data as Record<string, unknown>) };
      for (const stripped of permResult.stripped) delete patchForValidation[stripped];
      await enforceValidationRules(
        prisma,
        tenantId,
        'deal',
        mergeForValidation(existing as Record<string, unknown>, patchForValidation)
      );

      const updated = await prisma.deal.update({
        where: { id },
        data: safeUpdateData,
      });

      if (actor) {
        await recordFieldChanges(
          prisma,
          tenantId,
          'deal',
          id,
          dealSnapshotForHistory(existing),
          dealSnapshotForHistory(updated),
          actor.userId,
          actor.userEmail
        );
      }

      await producer.publish(TOPICS.DEALS, {
        type: 'deal.updated',
        tenantId,
        payload: {
          dealId: updated.id,
          ownerId: updated.ownerId,
          accountId: updated.accountId,
          pipelineId: updated.pipelineId,
          stageId: updated.stageId,
          status: updated.status,
          amount: decimalToNumber(updated.amount),
          currency: updated.currency,
          changedFields: Object.keys(updateData).filter((field) => field !== 'version'),
        },
      });

      updateDealDataQuality(prisma, id).catch(() => undefined);

      return updated;
    },

    /** Duplicate deal fields excluding contacts / activities / notes / deal room relations. */
    async cloneDeal(
      tenantId: string,
      sourceId: string,
      cloneName?: string
    ): Promise<Deal> {
      const source = await loadDealOrThrow(tenantId, sourceId);
      return prisma.deal.create({
        data: {
          tenantId,
          ownerId: source.ownerId,
          accountId: source.accountId,
          pipelineId: source.pipelineId,
          stageId: source.stageId,
          name:
            cloneName?.trim() && cloneName.trim().length > 0
              ? cloneName.trim()
              : `${source.name} (Copy)`,
          amount: source.amount,
          currency: source.currency,
          probability: source.probability,
          expectedCloseDate: source.expectedCloseDate,
          actualCloseDate: null,
          status: 'OPEN',
          lostReason: null,
          lostDetail: null,
          closeReason: null,
          forecastCategory: source.forecastCategory,
          meddicicScore: source.meddicicScore,
          meddicicData: source.meddicicData as Prisma.InputJsonValue,
          competitors: source.competitors,
          source: source.source,
          campaignId: source.campaignId,
          customFields: source.customFields as Prisma.InputJsonValue,
          tags: source.tags,
          version: 1,
        },
      });
    },

    /**
     * Soft-deletes the deal by setting `deletedAt`. The row is preserved
     * so relations (activities, notes, quotes) remain intact.
     */
    async deleteDeal(tenantId: string, id: string): Promise<void> {
      const existing = await loadDealOrThrow(tenantId, id);
      if (existing.deletedAt) {
        return;
      }
      await prisma.deal.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          version: { increment: 1 },
        },
      });
      await producer.publish(TOPICS.DEALS, {
        type: 'deal.archived',
        tenantId,
        payload: {
          dealId: existing.id,
          ownerId: existing.ownerId,
          accountId: existing.accountId,
          status: existing.status,
        },
      });
    },

    async restoreDeal(tenantId: string, id: string): Promise<Deal> {
      const result = await prisma.deal.updateMany({
        where: { id, tenantId, deletedAt: { not: null } },
        data: { deletedAt: null },
      });
      if (result.count === 0) throw new NotFoundError('Deal', id);
      const restored = await prisma.deal.findFirstOrThrow({ where: { id, tenantId } });
      await producer.publish(TOPICS.DEALS, {
        type: 'deal.restored',
        tenantId,
        payload: {
          dealId: restored.id,
          ownerId: restored.ownerId,
          accountId: restored.accountId,
          status: restored.status,
        },
      });
      return restored;
    },

    /**
     * Moves a deal to a new stage atomically. Validates that:
     * - the deal exists in the tenant,
     * - the target stage exists in the tenant,
     * - the target stage belongs to the deal's current pipeline.
     *
     * Updates `probability` to the stage default, bumps `version`, and
     * publishes `deal.stage_changed` to `TOPICS.DEALS`.
     */
    async moveDealToStage(
      tenantId: string,
      id: string,
      stageId: string
    ): Promise<Deal> {
      const existing = await loadDealOrThrow(tenantId, id);
      const stage = await prisma.stage.findFirst({
        where: { id: stageId, tenantId },
      });
      if (!stage) {
        throw new NotFoundError('Stage', stageId);
      }
      if (stage.pipelineId !== existing.pipelineId) {
        throw new BusinessRuleError(
          'Target stage does not belong to the deal pipeline'
        );
      }
      if (existing.stageId === stageId) {
        return existing;
      }

      // Blueprint validation: enforce stage-transition rules
      const [contacts, activities] = await Promise.all([
        prisma.dealContact.findMany({ where: { dealId: id }, include: { contact: true } }),
        prisma.activity.findMany({ where: { dealId: id, tenantId } }),
      ]);
      const safeContacts = contacts ?? [];
      const safeActivities = activities ?? [];
      await assertValidStageTransition(tenantId, existing.pipelineId, existing.stageId, stageId, {
        amount: Number(existing.amount),
        name: existing.name,
        expectedCloseDate: existing.expectedCloseDate?.toISOString(),
        probability: existing.probability,
        contactId: safeContacts.find(c => c.isPrimary)?.contactId,
        linkedContacts: safeContacts.map(c => ({ id: c.contactId })),
        completedActivityTypes: safeActivities.filter(a => a.status === 'COMPLETED').map(a => a.type),
        activities: safeActivities.map(a => ({ type: a.type, completed: a.status === 'COMPLETED' })),
      });

      const updated = await prisma.deal.update({
        where: { id },
        data: {
          stageId,
          probability: stage.probability,
          version: { increment: 1 },
        },
      });

      await producer.publish(TOPICS.DEALS, {
        type: 'deal.stage_changed',
        tenantId,
        payload: {
          dealId: updated.id,
          previousStageId: existing.stageId,
          newStageId: stage.id,
          ownerId: updated.ownerId,
          amount: decimalToNumber(updated.amount),
          rottenDays: stage.rottenDays,
          stageChangedAt: new Date().toISOString(),
        },
      });

      return updated;
    },

    /**
     * Marks a deal as won: sets `status=WON`, `actualCloseDate=now`, and
     * probability=100. Publishes `deal.won` to `TOPICS.DEALS` so downstream
     * services (finance, analytics, notifications) can react.
     */
    async markDealWon(tenantId: string, id: string): Promise<Deal> {
      const existing = await loadDealOrThrow(tenantId, id);
      if (existing.status === 'WON') {
        return existing;
      }
      if (existing.status === 'LOST') {
        throw new BusinessRuleError('Cannot mark a lost deal as won');
      }

      const updated = await prisma.deal.update({
        where: { id },
        data: {
          status: 'WON',
          actualCloseDate: new Date(),
          probability: 100,
          forecastCategory: 'CLOSED',
          version: { increment: 1 },
        },
      });

      await producer.publish(TOPICS.DEALS, {
        type: 'deal.won',
        tenantId,
        payload: {
          dealId: updated.id,
          ownerId: updated.ownerId,
          accountId: updated.accountId,
          amount: decimalToNumber(updated.amount),
          currency: updated.currency,
        },
      });

      return updated;
    },

    /**
     * Marks a deal as lost: sets `status=LOST`, `actualCloseDate=now`,
     * stores `lostReason` and `lostDetail`. Publishes `deal.lost`.
     */
    async markDealLost(
      tenantId: string,
      id: string,
      reason: string,
      detail?: string
    ): Promise<Deal> {
      const existing = await loadDealOrThrow(tenantId, id);
      if (existing.status === 'LOST') {
        return existing;
      }
      if (existing.status === 'WON') {
        throw new BusinessRuleError('Cannot mark a won deal as lost');
      }

      const updated = await prisma.deal.update({
        where: { id },
        data: {
          status: 'LOST',
          actualCloseDate: new Date(),
          probability: 0,
          forecastCategory: 'OMITTED',
          lostReason: reason,
          lostDetail: detail ?? null,
          closeReason: reason,
          version: { increment: 1 },
        },
      });

      await producer.publish(TOPICS.DEALS, {
        type: 'deal.lost',
        tenantId,
        payload: {
          dealId: updated.id,
          ownerId: updated.ownerId,
          reason,
          amount: decimalToNumber(updated.amount),
        },
      });

      return updated;
    },

    /**
     * Replaces `meddicicData` on the deal and recomputes `meddicicScore`
     * as an aggregate of per-dimension scores plus boolean identifications.
     */
    async updateMeddic(
      tenantId: string,
      id: string,
      meddicicData: MeddicicDataInput
    ): Promise<Deal> {
      await loadDealOrThrow(tenantId, id);
      const score = computeMeddicicScore(meddicicData);
      const updated = await prisma.deal.update({
        where: { id },
        data: {
          meddicicData: meddicicData as Prisma.InputJsonValue,
          meddicicScore: score,
          version: { increment: 1 },
        },
      });
      await producer.publish(TOPICS.DEALS, {
        type: 'deal.meddic_updated',
        tenantId,
        payload: {
          dealId: updated.id,
          ownerId: updated.ownerId,
          accountId: updated.accountId,
          meddicicScore: score,
        },
      });
      return updated;
    },

    /**
     * Deterministic "scoring insights" for a deal (Section 34.2 →
     * `GET /deals/:id/scoring-insights`). Surfaces only signals that already
     * exist on the record — NO AI/ML. Delegates the health scoring to the
     * deterministic {@link computeDealHealth} engine, which weighs activity
     * recency/frequency, stage idle time vs `rottenDays`, MEDDIC completeness,
     * close-date slippage, data quality and probability alignment into a
     * 0-100 `healthScore` + label + next-best-action recommendations.
     *
     * Fully fail-open at the route layer; this method only reads existing data.
     */
    async getDealScoringInsights(tenantId: string, id: string) {
      const deal = await prisma.deal.findFirst({
        where: { id, tenantId },
        include: { stage: true },
      });
      if (!deal) {
        throw new NotFoundError('Deal', id);
      }

      const now = Date.now();
      const DAY_MS = 24 * 60 * 60 * 1000;

      // Stage age proxied by updatedAt (stage moves bump updatedAt), matching
      // the rotten-deals poller convention.
      const stageAgeDays = Math.max(
        0,
        Math.floor((now - deal.updatedAt.getTime()) / DAY_MS)
      );
      const rottenDays = deal.stage?.rottenDays ?? null;

      // Days since the most recent activity on this deal (null if none) plus the
      // trailing-30-day activity count for the frequency signal. Both fail-open.
      const thirtyDaysAgo = new Date(now - 30 * DAY_MS);
      const [lastActivity, activityCountLast30Days, closeDatePushCount] = await Promise.all([
        prisma.activity.findFirst({
          where: { dealId: id, tenantId },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
        prisma.activity.count({
          where: { dealId: id, tenantId, createdAt: { gte: thirtyDaysAgo } },
        }),
        countCloseDatePushes(tenantId, id),
      ]);
      const daysSinceLastActivity = lastActivity
        ? Math.max(0, Math.floor((now - lastActivity.createdAt.getTime()) / DAY_MS))
        : null;

      const isWon = deal.status === 'WON';
      const isLost = deal.status === 'LOST';
      const isOpen = deal.status === 'OPEN';

      const dataQualityScore = deal.dataQualityScore ?? null;
      const meddicScore = deal.meddicicScore ?? null;
      const meddic = (deal.meddicicData ?? {}) as Record<string, unknown>;
      const meddicGaps = deriveMeddicGaps(meddic);
      const stageExpectedProbability = deal.stage?.probability ?? null;

      const healthResult = computeDealHealth({
        status: deal.status,
        stageAgeDays,
        rottenDays,
        daysSinceLastActivity,
        activityCountLast30Days,
        meddicScore,
        dataQualityScore,
        probability: deal.probability,
        stageExpectedProbability,
        expectedCloseDate: deal.expectedCloseDate?.toISOString() ?? null,
        closeDatePushCount,
        stageName: deal.stage?.name ?? null,
        meddicGaps,
      });

      // Explainable AI win prediction (additive, fail-open). Recomputes +
      // persists aiWinProbability / aiInsights; a failure yields null and the
      // deterministic signals below are still returned unchanged.
      const ai = await scoreDeal(prisma, tenantId, deal.id).catch(() => null);

      return {
        dealId: deal.id,
        healthScore: healthResult.healthScore,
        health: healthResult.health,
        ai: ai
          ? {
              winProbability: ai.probability,
              score: ai.aiScore,
              insights: ai.insights,
            }
          : null,
        signals: {
          status: deal.status,
          isOpen,
          isWon,
          isLost,
          dataQualityScore,
          meddicScore,
          meddic,
          meddicGaps,
          stageId: deal.stageId,
          stageName: deal.stage?.name ?? null,
          stageAgeDays,
          rottenDays,
          isRotten:
            rottenDays != null && rottenDays > 0 ? stageAgeDays >= rottenDays : false,
          daysSinceLastActivity,
          activityCountLast30Days,
          closeDatePushCount,
          probability: deal.probability,
          stageExpectedProbability,
          amount: decimalToNumber(deal.amount),
          currency: deal.currency,
          expectedCloseDate: deal.expectedCloseDate?.toISOString() ?? null,
          subScores: healthResult.subScores,
          contributions: healthResult.contributions,
          weights: healthResult.weights,
        },
        recommendations: healthResult.recommendations,
      };
    },

    /**
     * Returns a chronological timeline (newest first) of activities and
     * notes linked to the deal, merged into a unified `TimelineEvent[]`
     * and paginated in-memory.
     */
    async getDealTimeline(
      tenantId: string,
      id: string,
      pagination: { page: number; limit: number }
    ): Promise<PaginatedResult<TimelineEvent>> {
      await loadDealOrThrow(tenantId, id);
      const { page, limit } = pagination;

      const [activities, notes] = await Promise.all([
        prisma.activity.findMany({
          where: { dealId: id, tenantId },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.note.findMany({
          where: { dealId: id, tenantId },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

      const events: TimelineEvent[] = [
        ...activities.map<TimelineEvent>((a) => ({
          id: `activity:${a.id}`,
          type: 'ACTIVITY',
          at: a.createdAt.toISOString(),
          title: `${a.type}: ${a.subject}`,
          description: a.description ?? undefined,
          actorId: a.ownerId,
          metadata: {
            activityId: a.id,
            activityType: a.type,
            status: a.status,
            priority: a.priority,
            dueDate: a.dueDate?.toISOString(),
            outcome: a.outcome,
          },
        })),
        ...notes.map<TimelineEvent>((n) => ({
          id: `note:${n.id}`,
          type: 'NOTE',
          at: n.createdAt.toISOString(),
          title: n.isPinned ? 'Pinned note' : 'Note',
          description: n.content,
          actorId: n.authorId,
          metadata: { noteId: n.id, isPinned: n.isPinned },
        })),
      ];

      events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

      const total = events.length;
      const slice = events.slice((page - 1) * limit, page * limit);
      return toPaginatedResult(slice, total, page, limit);
    },

    /**
     * Adds a contact to a deal (both must be in the tenant). If `isPrimary`
     * is true, demotes any other primary on the same deal inside a single
     * transaction. Throws `ConflictError` if the link already exists.
     */
    async addContactToDeal(
      tenantId: string,
      dealId: string,
      contactId: string,
      role?: string,
      isPrimary = false
    ): Promise<DealContact> {
      await loadDealOrThrow(tenantId, dealId);
      const contact = await prisma.contact.findFirst({
        where: { id: contactId, tenantId },
      });
      if (!contact) {
        throw new NotFoundError('Contact', contactId);
      }

      const existing = await prisma.dealContact.findFirst({
        where: { dealId, contactId },
      });
      if (existing) {
        throw new ConflictError('DealContact', 'contactId');
      }

      const [, created] = await prisma.$transaction([
        isPrimary
          ? prisma.dealContact.updateMany({
              where: { dealId, isPrimary: true },
              data: { isPrimary: false },
            })
          : prisma.dealContact.updateMany({
              where: { dealId, id: '__noop__' },
              data: {},
            }),
        prisma.dealContact.create({
          data: {
            tenantId,
            dealId,
            contactId,
            role: role ?? null,
            isPrimary,
          },
        }),
      ]);

      return created;
    },

    /**
     * Removes a contact from a deal. Verifies tenant access via the deal,
     * then deletes the `DealContact` join row. No-op if the link does not
     * exist (idempotent).
     */
    async removeContactFromDeal(
      tenantId: string,
      dealId: string,
      contactId: string
    ): Promise<void> {
      await loadDealOrThrow(tenantId, dealId);
      await prisma.dealContact.deleteMany({
        where: { dealId, contactId },
      });
    },

    /**
     * Returns the contacts linked to the deal (via `DealContact`). Tenant
     * access is validated through the parent `Deal`.
     */
    async listDealContacts(
      tenantId: string,
      dealId: string
    ): Promise<DealContactWithContact[]> {
      await loadDealOrThrow(tenantId, dealId);
      return prisma.dealContact.findMany({
        where: { dealId },
        include: { contact: true },
        orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }],
      });
    },

  };
}

export type DealsService = ReturnType<typeof createDealsService>;
