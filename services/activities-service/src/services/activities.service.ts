import type { PaginatedResult } from '@nexus/shared-types';
import { NotFoundError } from '@nexus/service-utils';
import type { CreateActivityInput, UpdateActivityInput, ActivityListQuery } from '@nexus/validation';
import { NexusProducer, TOPICS } from '@nexus/kafka';
import { Prisma } from '../../../../node_modules/.prisma/activities-client/index.js';
import type { Activity } from '../../../../node_modules/.prisma/activities-client/index.js';
import type { ActivitiesPrisma } from '../prisma.js';
import { toPaginatedResult } from '@nexus/shared-types';

export type ActivityListFilters = Omit<ActivityListQuery, 'page' | 'limit' | 'sortBy' | 'sortDir' | 'cursor'>;

interface ListPagination {
  page: number;
  limit: number;
  sortBy?: string;
  sortDir: 'asc' | 'desc';
}

function buildWhere(tenantId: string, filters: ActivityListFilters): Prisma.ActivityWhereInput {
  const where: Prisma.ActivityWhereInput = { tenantId };
  if (filters.dealId) where.dealId = filters.dealId;
  if (filters.contactId) where.contactId = filters.contactId;
  if (filters.leadId) where.leadId = filters.leadId;
  if (filters.accountId) where.accountId = filters.accountId;
  if (filters.ownerId) where.ownerId = filters.ownerId;
  if (filters.type) where.type = filters.type;
  if (filters.status) where.status = filters.status;
  if (filters.dueBefore) where.dueDate = { lte: new Date(filters.dueBefore) };
  if (filters.dueAfter) where.dueDate = { gte: new Date(filters.dueAfter) };
  if (filters.overdue) where.dueDate = { lt: new Date() };
  return where;
}

export function createActivitiesService(prisma: ActivitiesPrisma, producer: NexusProducer) {
  async function loadOrThrow(tenantId: string, id: string): Promise<Activity> {
    const row = await prisma.activity.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundError('Activity', id);
    return row;
  }

  return {
    async listActivities(tenantId: string, filters: ActivityListFilters, pagination: ListPagination): Promise<PaginatedResult<Activity>> {
      const where = buildWhere(tenantId, filters);
      const [total, rows] = await Promise.all([
        prisma.activity.count({ where }),
        prisma.activity.findMany({ where, skip: (pagination.page - 1) * pagination.limit, take: pagination.limit, orderBy: { createdAt: 'desc' } }),
      ]);
      return toPaginatedResult(rows, total, pagination.page, pagination.limit);
    },

    async getActivityById(tenantId: string, id: string): Promise<Activity> {
      return loadOrThrow(tenantId, id);
    },

    async createActivity(tenantId: string, data: CreateActivityInput): Promise<Activity> {
      const created = await prisma.activity.create({
        data: {
          tenantId,
          ownerId: data.ownerId,
          type: data.type,
          subject: data.subject,
          description: data.description ?? null,
          priority: data.priority ?? 'NORMAL',
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
      await producer.publish(TOPICS.ACTIVITIES, {
        type: 'activity.created',
        tenantId,
        payload: { activityId: created.id, type: created.type, ownerId: created.ownerId },
      }).catch(() => undefined);
      return created;
    },

    async updateActivity(tenantId: string, id: string, data: UpdateActivityInput): Promise<Activity> {
      await loadOrThrow(tenantId, id);
      const update: Prisma.ActivityUpdateInput = {};
      if (data.type !== undefined) update.type = data.type;
      if (data.subject !== undefined) update.subject = data.subject;
      if (data.description !== undefined) update.description = data.description;
      if (data.status !== undefined) update.status = data.status;
      if (data.priority !== undefined) update.priority = data.priority;
      if (data.dueDate !== undefined) update.dueDate = data.dueDate ? new Date(data.dueDate) : null;
      if (data.startDate !== undefined) update.startDate = data.startDate ? new Date(data.startDate) : null;
      if (data.endDate !== undefined) update.endDate = data.endDate ? new Date(data.endDate) : null;
      if (data.duration !== undefined) update.duration = data.duration;
      if (data.outcome !== undefined) update.outcome = data.outcome;
      if (data.dealId !== undefined) update.dealId = data.dealId;
      if (data.contactId !== undefined) update.contactId = data.contactId;
      if (data.leadId !== undefined) update.leadId = data.leadId;
      if (data.accountId !== undefined) update.accountId = data.accountId;
      if (data.customFields !== undefined) update.customFields = data.customFields as Prisma.InputJsonValue;
      return prisma.activity.update({ where: { id }, data: update });
    },

    async deleteActivity(tenantId: string, id: string): Promise<void> {
      await loadOrThrow(tenantId, id);
      await prisma.activity.delete({ where: { id } });
    },

    async completeActivity(tenantId: string, id: string, outcome: string): Promise<Activity> {
      await loadOrThrow(tenantId, id);
      return prisma.activity.update({ where: { id }, data: { status: 'COMPLETED', outcome } });
    },

    async rescheduleActivity(tenantId: string, id: string, dueDate: string): Promise<Activity> {
      await loadOrThrow(tenantId, id);
      return prisma.activity.update({ where: { id }, data: { dueDate: new Date(dueDate), status: 'PLANNED' } });
    },

    async getUpcomingActivities(tenantId: string, ownerId: string, daysAhead: number, opts: { limit?: number } = {}): Promise<Activity[]> {
      const from = new Date();
      const to = new Date();
      to.setDate(to.getDate() + daysAhead);
      const limit = Math.min(200, opts.limit ?? 50);
      return prisma.activity.findMany({
        where: { tenantId, ownerId, dueDate: { gte: from, lte: to }, status: { in: ['PLANNED', 'IN_PROGRESS'] } },
        orderBy: { dueDate: 'asc' },
        take: limit,
      });
    },
  };
}

export type ActivitiesService = ReturnType<typeof createActivitiesService>;
