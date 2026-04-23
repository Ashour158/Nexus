import type { PaginatedResult } from '@nexus/shared-types';
import {
  BusinessRuleError,
  NotFoundError,
} from '@nexus/service-utils';
import type {
  CreateActivityInput,
  UpdateActivityInput,
} from '@nexus/validation';
import { NexusProducer, TOPICS } from '@nexus/kafka';
import { Prisma } from '../../../../node_modules/.prisma/crm-client/index.js';
import type { Activity } from '../../../../node_modules/.prisma/crm-client/index.js';
import type { CrmPrisma } from '../prisma.js';
import { toPaginatedResult } from '../lib/pagination.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Filters accepted by `listActivities` (Section 34.3). */
export interface ActivityListFilters {
  dealId?: string;
  contactId?: string;
  leadId?: string;
  accountId?: string;
  ownerId?: string;
  type?:
    | 'CALL'
    | 'EMAIL'
    | 'MEETING'
    | 'TASK'
    | 'DEMO'
    | 'LUNCH'
    | 'CONFERENCE'
    | 'FOLLOW_UP'
    | 'PROPOSAL'
    | 'NEGOTIATION'
    | 'NOTE';
  status?:
    | 'PLANNED'
    | 'IN_PROGRESS'
    | 'COMPLETED'
    | 'CANCELLED'
    | 'DEFERRED';
  dueBefore?: string;
  dueAfter?: string;
  /** When true, only activities whose dueDate has passed and status NOT IN [DONE, CANCELLED]. */
  overdue?: boolean;
}

export interface ActivityListPagination {
  page: number;
  limit: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'dueDate';
  sortDir: 'asc' | 'desc';
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildActivityWhere(
  tenantId: string,
  f: ActivityListFilters
): Prisma.ActivityWhereInput {
  const where: Prisma.ActivityWhereInput = { tenantId };
  if (f.dealId) where.dealId = f.dealId;
  if (f.contactId) where.contactId = f.contactId;
  if (f.leadId) where.leadId = f.leadId;
  if (f.accountId) where.accountId = f.accountId;
  if (f.ownerId) where.ownerId = f.ownerId;
  if (f.type) where.type = f.type;
  if (f.status) where.status = f.status;

  if (f.dueBefore || f.dueAfter) {
    const dueDate: Prisma.DateTimeFilter = {};
    if (f.dueBefore) dueDate.lte = new Date(f.dueBefore);
    if (f.dueAfter) dueDate.gte = new Date(f.dueAfter);
    where.dueDate = dueDate;
  }

  if (f.overdue) {
    const prev =
      typeof where.dueDate === 'object' && where.dueDate !== null
        ? (where.dueDate as Prisma.DateTimeFilter)
        : {};
    where.dueDate = { ...prev, lt: new Date() };
    // Spec: DONE (COMPLETED) / CANCELLED are excluded for overdue.
    where.status = { notIn: ['COMPLETED', 'CANCELLED'] };
  }

  return where;
}

function resolveSortField(
  s: ActivityListPagination['sortBy']
): keyof Prisma.ActivityOrderByWithRelationInput {
  switch (s) {
    case 'updatedAt':
    case 'dueDate':
      return s;
    case 'createdAt':
    default:
      return 'createdAt';
  }
}

// ─── Service Factory ────────────────────────────────────────────────────────

/**
 * Activities service (Section 34.3). Tenant-scoped CRUD for the CRM
 * `Activity` model with lifecycle operations (`complete`, `reschedule`,
 * soft-delete) and per-entity (`deal`/`contact`/`lead`) feeds.
 *
 * Publishes the following Kafka events on `TOPICS.ACTIVITIES`:
 * - `activity.created` — on `createActivity`
 * - `activity.completed` — on `completeActivity`
 */
export function createActivitiesService(
  prisma: CrmPrisma,
  producer: NexusProducer
) {
  async function loadOrThrow(tenantId: string, id: string): Promise<Activity> {
    const row = await prisma.activity.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundError('Activity', id);
    return row;
  }

  async function assertDealExists(tenantId: string, dealId: string) {
    const deal = await prisma.deal.findFirst({
      where: { id: dealId, tenantId },
      select: { id: true },
    });
    if (!deal) throw new NotFoundError('Deal', dealId);
  }

  async function assertContactExists(tenantId: string, contactId: string) {
    const c = await prisma.contact.findFirst({
      where: { id: contactId, tenantId },
      select: { id: true },
    });
    if (!c) throw new NotFoundError('Contact', contactId);
  }

  async function assertLeadExists(tenantId: string, leadId: string) {
    const l = await prisma.lead.findFirst({
      where: { id: leadId, tenantId },
      select: { id: true },
    });
    if (!l) throw new NotFoundError('Lead', leadId);
  }

  async function assertAccountExists(tenantId: string, accountId: string) {
    const a = await prisma.account.findFirst({
      where: { id: accountId, tenantId },
      select: { id: true },
    });
    if (!a) throw new NotFoundError('Account', accountId);
  }

  return {
    async listActivities(
      tenantId: string,
      filters: ActivityListFilters,
      pagination: ActivityListPagination
    ): Promise<PaginatedResult<Activity>> {
      const where = buildActivityWhere(tenantId, filters);
      const sortField = resolveSortField(pagination.sortBy);
      const orderBy: Prisma.ActivityOrderByWithRelationInput = {
        [sortField]: pagination.sortDir,
      };
      const { page, limit } = pagination;
      const [total, rows] = await Promise.all([
        prisma.activity.count({ where }),
        prisma.activity.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy,
        }),
      ]);
      return toPaginatedResult(rows, total, page, limit);
    },

    async getActivityById(tenantId: string, id: string): Promise<Activity> {
      return loadOrThrow(tenantId, id);
    },

    async createActivity(
      tenantId: string,
      data: CreateActivityInput
    ): Promise<Activity> {
      // Validate that any referenced parent belongs to the tenant.
      const checks: Promise<void>[] = [];
      if (data.dealId) checks.push(assertDealExists(tenantId, data.dealId));
      if (data.contactId) checks.push(assertContactExists(tenantId, data.contactId));
      if (data.leadId) checks.push(assertLeadExists(tenantId, data.leadId));
      if (data.accountId) checks.push(assertAccountExists(tenantId, data.accountId));
      await Promise.all(checks);

      const created = await prisma.activity.create({
        data: {
          tenantId,
          ownerId: data.ownerId,
          type: data.type,
          subject: data.subject,
          description: data.description ?? null,
          priority: data.priority,
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          startDate: data.startDate ? new Date(data.startDate) : null,
          endDate: data.endDate ? new Date(data.endDate) : null,
          duration: data.duration ?? null,
          dealId: data.dealId ?? null,
          contactId: data.contactId ?? null,
          leadId: data.leadId ?? null,
          accountId: data.accountId ?? null,
          customFields: data.customFields as Prisma.InputJsonValue,
        },
      });

      await producer
        .publish(TOPICS.ACTIVITIES, {
          type: 'activity.created',
          tenantId,
          payload: {
            activityId: created.id,
            type: created.type,
            ownerId: created.ownerId,
            dealId: created.dealId ?? undefined,
            contactId: created.contactId ?? undefined,
            leadId: created.leadId ?? undefined,
            dueDate: created.dueDate?.toISOString() ?? undefined,
          },
        })
        .catch(() => undefined);

      return created;
    },

    async updateActivity(
      tenantId: string,
      id: string,
      data: UpdateActivityInput
    ): Promise<Activity> {
      await loadOrThrow(tenantId, id);

      if (data.dealId) await assertDealExists(tenantId, data.dealId);
      if (data.contactId) await assertContactExists(tenantId, data.contactId);
      if (data.leadId) await assertLeadExists(tenantId, data.leadId);
      if (data.accountId) await assertAccountExists(tenantId, data.accountId);

      const updateData: Prisma.ActivityUpdateInput = {};
      if (data.type !== undefined) updateData.type = data.type;
      if (data.subject !== undefined) updateData.subject = data.subject;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.priority !== undefined) updateData.priority = data.priority;
      if (data.dueDate !== undefined)
        updateData.dueDate = data.dueDate === null ? null : new Date(data.dueDate);
      if (data.startDate !== undefined)
        updateData.startDate =
          data.startDate === null ? null : new Date(data.startDate);
      if (data.endDate !== undefined)
        updateData.endDate = data.endDate === null ? null : new Date(data.endDate);
      if (data.duration !== undefined) updateData.duration = data.duration;
      if (data.outcome !== undefined) updateData.outcome = data.outcome;
      if (data.dealId !== undefined)
        updateData.deal = data.dealId
          ? { connect: { id: data.dealId } }
          : { disconnect: true };
      if (data.contactId !== undefined)
        updateData.contact = data.contactId
          ? { connect: { id: data.contactId } }
          : { disconnect: true };
      if (data.leadId !== undefined)
        updateData.lead = data.leadId
          ? { connect: { id: data.leadId } }
          : { disconnect: true };
      if (data.accountId !== undefined)
        updateData.account = data.accountId
          ? { connect: { id: data.accountId } }
          : { disconnect: true };
      if (data.customFields !== undefined)
        updateData.customFields = data.customFields as Prisma.InputJsonValue;

      return prisma.activity.update({
        where: { id },
        data: updateData,
      });
    },

    /**
     * Soft-delete — flips `status` to `CANCELLED` so audits and the activity
     * feed still reflect the row. Per spec we explicitly do not hard delete.
     */
    async deleteActivity(tenantId: string, id: string): Promise<void> {
      const existing = await loadOrThrow(tenantId, id);
      if (existing.status === 'CANCELLED') return;
      await prisma.activity.update({
        where: { id },
        data: { status: 'CANCELLED' },
      });
    },

    async completeActivity(
      tenantId: string,
      id: string,
      outcome: string
    ): Promise<Activity> {
      const existing = await loadOrThrow(tenantId, id);
      if (existing.status === 'COMPLETED') {
        throw new BusinessRuleError('Activity is already completed');
      }
      if (existing.status === 'CANCELLED') {
        throw new BusinessRuleError(
          'Activity has been cancelled and cannot be completed'
        );
      }

      const now = new Date();
      const updated = await prisma.activity.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          outcome,
          endDate: existing.endDate ?? now,
        },
      });

      await producer
        .publish(TOPICS.ACTIVITIES, {
          type: 'activity.completed',
          tenantId,
          payload: {
            activityId: updated.id,
            type: updated.type,
            ownerId: updated.ownerId,
            dealId: updated.dealId ?? undefined,
            outcome,
          },
        })
        .catch(() => undefined);

      return updated;
    },

    async rescheduleActivity(
      tenantId: string,
      id: string,
      newDueDate: string
    ): Promise<Activity> {
      const existing = await loadOrThrow(tenantId, id);
      if (existing.status === 'COMPLETED' || existing.status === 'CANCELLED') {
        throw new BusinessRuleError(
          `Cannot reschedule an activity in status ${existing.status}`
        );
      }
      return prisma.activity.update({
        where: { id },
        data: { dueDate: new Date(newDueDate) },
      });
    },

    async listActivitiesForDeal(
      tenantId: string,
      dealId: string,
      pagination: { page: number; limit: number }
    ): Promise<PaginatedResult<Activity>> {
      await assertDealExists(tenantId, dealId);
      const { page, limit } = pagination;
      const where: Prisma.ActivityWhereInput = { tenantId, dealId };
      const [total, rows] = await Promise.all([
        prisma.activity.count({ where }),
        prisma.activity.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
      ]);
      return toPaginatedResult(rows, total, page, limit);
    },

    async listActivitiesForContact(
      tenantId: string,
      contactId: string,
      pagination: { page: number; limit: number }
    ): Promise<PaginatedResult<Activity>> {
      await assertContactExists(tenantId, contactId);
      const { page, limit } = pagination;
      const where: Prisma.ActivityWhereInput = { tenantId, contactId };
      const [total, rows] = await Promise.all([
        prisma.activity.count({ where }),
        prisma.activity.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
      ]);
      return toPaginatedResult(rows, total, page, limit);
    },

    async listActivitiesForLead(
      tenantId: string,
      leadId: string,
      pagination: { page: number; limit: number }
    ): Promise<PaginatedResult<Activity>> {
      await assertLeadExists(tenantId, leadId);
      const { page, limit } = pagination;
      const where: Prisma.ActivityWhereInput = { tenantId, leadId };
      const [total, rows] = await Promise.all([
        prisma.activity.count({ where }),
        prisma.activity.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
      ]);
      return toPaginatedResult(rows, total, page, limit);
    },

    async getUpcomingActivities(
      tenantId: string,
      ownerId: string,
      daysAhead: number
    ): Promise<Activity[]> {
      const now = new Date();
      const cutoff = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
      return prisma.activity.findMany({
        where: {
          tenantId,
          ownerId,
          status: { in: ['PLANNED', 'IN_PROGRESS'] },
          dueDate: { gte: now, lte: cutoff },
        },
        orderBy: { dueDate: 'asc' },
        take: 50,
      });
    },
  };
}

export type ActivitiesService = ReturnType<typeof createActivitiesService>;
