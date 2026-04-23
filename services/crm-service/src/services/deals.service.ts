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
  Quote,
} from '../../../../node_modules/.prisma/crm-client/index.js';
import type { CrmPrisma } from '../prisma.js';
import { toPaginatedResult } from '../lib/pagination.js';

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

/** AI-insights payload for `GET /deals/:id/ai-insights` (Section 34.2). */
export interface DealAiInsights {
  dealId: string;
  aiWinProbability: number | null;
  aiInsights: unknown;
}

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
      pagination: DealListPagination
    ): Promise<PaginatedResult<Deal>> {
      const where = buildDealListWhere(tenantId, filters);
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

      return toPaginatedResult(rows, total, page, limit);
    },

    /**
     * Returns a deal with `account`, `pipeline`, `stage`, and `contacts.contact`.
     * Throws `NotFoundError` if the deal is not in the tenant.
     */
    async getDealById(tenantId: string, id: string): Promise<DealWithRelations> {
      return loadDealWithRelations(tenantId, id);
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
          contacts:
            uniqueContactIds.length > 0
              ? {
                  create: uniqueContactIds.map((contactId, idx) => ({
                    contactId,
                    isPrimary: idx === 0,
                  })),
                }
              : undefined,
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
      data: UpdateDealInput
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

      return prisma.deal.update({
        where: { id },
        data: updateData,
      });
    },

    /**
     * Soft-deletes the deal by setting `status=DORMANT` and recording a
     * deletion timestamp in `customFields._deletedAt`. The row is preserved
     * so relations (activities, notes, quotes) remain intact.
     */
    async deleteDeal(tenantId: string, id: string): Promise<void> {
      const existing = await loadDealOrThrow(tenantId, id);
      if (existing.status === 'DORMANT') {
        return;
      }
      const customFields =
        (existing.customFields as Record<string, unknown> | null) ?? {};
      await prisma.deal.update({
        where: { id },
        data: {
          status: 'DORMANT',
          customFields: {
            ...customFields,
            _deletedAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
          version: { increment: 1 },
        },
      });
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
      return prisma.deal.update({
        where: { id },
        data: {
          meddicicData: meddicicData as Prisma.InputJsonValue,
          meddicicScore: score,
          version: { increment: 1 },
        },
      });
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

    /**
     * Lists quotes attached to the deal, newest first. Tenant scoping is
     * enforced on the `Quote` model directly (it carries `tenantId`).
     */
    async listDealQuotes(
      tenantId: string,
      dealId: string,
      pagination: { page: number; limit: number }
    ): Promise<PaginatedResult<Quote>> {
      await loadDealOrThrow(tenantId, dealId);
      const { page, limit } = pagination;
      const where: Prisma.QuoteWhereInput = { tenantId, dealId };
      const [total, rows] = await Promise.all([
        prisma.quote.count({ where }),
        prisma.quote.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
      ]);
      return toPaginatedResult(rows, total, page, limit);
    },

    /**
     * Returns the deal's AI win probability and insights blob (populated by
     * the AI service in later phases; returns `null` / `{}` defaults until
     * then — see Section 32 for the event flow).
     */
    async getDealAiInsights(
      tenantId: string,
      dealId: string
    ): Promise<DealAiInsights> {
      const deal = await loadDealOrThrow(tenantId, dealId);
      return {
        dealId: deal.id,
        aiWinProbability: deal.aiWinProbability ?? null,
        aiInsights: deal.aiInsights,
      };
    },
  };
}

export type DealsService = ReturnType<typeof createDealsService>;
