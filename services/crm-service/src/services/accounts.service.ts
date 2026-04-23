import type {
  AccountHealthInsight,
  PaginatedResult,
  TimelineEvent,
} from '@nexus/shared-types';
import { NotFoundError } from '@nexus/service-utils';
import type {
  AccountListQuery,
  CreateAccountInput,
  UpdateAccountInput,
} from '@nexus/validation';
import { NexusProducer, TOPICS } from '@nexus/kafka';
import { Prisma } from '../../../../node_modules/.prisma/crm-client/index.js';
import type {
  Account,
  Contact,
  Deal,
} from '../../../../node_modules/.prisma/crm-client/index.js';
import type { CrmPrisma } from '../prisma.js';
import { toPaginatedResult } from '../lib/pagination.js';

// ─── Types ──────────────────────────────────────────────────────────────────

type AccountListFilters = Omit<AccountListQuery, 'page' | 'limit' | 'sortBy' | 'sortDir' | 'cursor'>;

interface ListPagination {
  page: number;
  limit: number;
  sortBy?: string;
  sortDir: 'asc' | 'desc';
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildWhere(
  tenantId: string,
  filters: AccountListFilters
): Prisma.AccountWhereInput {
  const where: Prisma.AccountWhereInput = { tenantId };
  if (filters.ownerId) where.ownerId = filters.ownerId;
  if (filters.type) where.type = filters.type;
  if (filters.tier) where.tier = filters.tier;
  if (filters.status) where.status = filters.status;
  if (filters.industry) where.industry = filters.industry;
  if (filters.search?.trim()) {
    const q = filters.search.trim();
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { website: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
    ];
  }
  return where;
}

function resolveSortField(
  sortBy: string | undefined
): keyof Prisma.AccountOrderByWithRelationInput {
  const allowed = new Set(['createdAt', 'updatedAt', 'name', 'annualRevenue']);
  return (
    (sortBy && allowed.has(sortBy) ? sortBy : 'createdAt') as keyof Prisma.AccountOrderByWithRelationInput
  );
}

/**
 * Computes a simple 0–100 health score from signals available on the CRM side
 * (Section 32). The finance-service owns the richer MRR/usage-based scorer;
 * this is the CRM-local fallback returned by `GET /accounts/:id/health`.
 */
function computeHealth(
  account: Account,
  daysSinceLastTouch: number | null
): AccountHealthInsight {
  let score = 70;
  const factors: AccountHealthInsight['factors'] = [];

  if (typeof account.npsScore === 'number') {
    const npsFactor = Math.max(-40, Math.min(40, account.npsScore / 2));
    score += npsFactor;
    factors.push({
      code: 'NPS',
      label: 'Net Promoter Score',
      value: account.npsScore,
      impact: npsFactor > 0 ? 'POSITIVE' : npsFactor < 0 ? 'NEGATIVE' : 'NEUTRAL',
    });
  }

  if (daysSinceLastTouch !== null) {
    const touchPenalty = Math.min(25, Math.max(0, daysSinceLastTouch - 30));
    score -= touchPenalty;
    factors.push({
      code: 'LAST_TOUCH',
      label: 'Days since last customer touch',
      value: daysSinceLastTouch,
      impact: touchPenalty > 15 ? 'NEGATIVE' : touchPenalty > 0 ? 'NEUTRAL' : 'POSITIVE',
    });
  }

  if (account.status === 'AT_RISK') {
    score -= 20;
    factors.push({ code: 'STATUS', label: 'Status', value: 'AT_RISK', impact: 'NEGATIVE' });
  } else if (account.status === 'CHURNED') {
    score = Math.min(score, 20);
    factors.push({ code: 'STATUS', label: 'Status', value: 'CHURNED', impact: 'NEGATIVE' });
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const status: AccountHealthInsight['status'] =
    score >= 75 ? 'HEALTHY' : score >= 50 ? 'AT_RISK' : score >= 25 ? 'CHURNING' : 'UNKNOWN';

  return {
    accountId: account.id,
    score,
    status,
    npsScore: account.npsScore,
    daysSinceLastTouch,
    openSupportTickets: null,
    factors,
    computedAt: new Date().toISOString(),
  };
}

// ─── Service Factory ────────────────────────────────────────────────────────

export function createAccountsService(prisma: CrmPrisma, producer: NexusProducer) {
  async function loadOrThrow(tenantId: string, id: string): Promise<Account> {
    const row = await prisma.account.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundError('Account', id);
    return row;
  }

  return {
    async listAccounts(
      tenantId: string,
      filters: AccountListFilters,
      pagination: ListPagination
    ): Promise<PaginatedResult<Account>> {
      const where = buildWhere(tenantId, filters);
      const sortField = resolveSortField(pagination.sortBy);
      const orderBy: Prisma.AccountOrderByWithRelationInput = {
        [sortField]: pagination.sortDir,
      };
      const [total, rows] = await Promise.all([
        prisma.account.count({ where }),
        prisma.account.findMany({
          where,
          skip: (pagination.page - 1) * pagination.limit,
          take: pagination.limit,
          orderBy,
        }),
      ]);
      return toPaginatedResult(rows, total, pagination.page, pagination.limit);
    },

    async getAccountById(tenantId: string, id: string): Promise<Account> {
      return loadOrThrow(tenantId, id);
    },

    async createAccount(tenantId: string, data: CreateAccountInput): Promise<Account> {
      if (data.parentAccountId) {
        const parent = await prisma.account.findFirst({
          where: { id: data.parentAccountId, tenantId },
        });
        if (!parent) throw new NotFoundError('Account', data.parentAccountId);
      }
      const created = await prisma.account.create({
        data: {
          tenantId,
          ownerId: data.ownerId,
          parentAccountId: data.parentAccountId ?? null,
          name: data.name,
          website: data.website ?? null,
          phone: data.phone ?? null,
          email: data.email ?? null,
          industry: data.industry ?? null,
          type: data.type,
          tier: data.tier,
          status: data.status,
          annualRevenue:
            data.annualRevenue !== undefined ? new Prisma.Decimal(data.annualRevenue) : null,
          employeeCount: data.employeeCount ?? null,
          country: data.country ?? null,
          city: data.city ?? null,
          address: data.address ?? null,
          zipCode: data.zipCode ?? null,
          linkedInUrl: data.linkedInUrl ?? null,
          description: data.description ?? null,
          sicCode: data.sicCode ?? null,
          naicsCode: data.naicsCode ?? null,
          customFields: data.customFields as Prisma.InputJsonValue,
          tags: data.tags,
        },
      });
      await producer
        .publish(TOPICS.ACCOUNTS, {
          type: 'contact.created',
          tenantId,
          payload: { contactId: created.id, accountId: created.id, email: created.email ?? undefined },
        })
        .catch(() => undefined);
      return created;
    },

    async updateAccount(
      tenantId: string,
      id: string,
      data: UpdateAccountInput
    ): Promise<Account> {
      await loadOrThrow(tenantId, id);
      const update: Prisma.AccountUpdateInput = {};
      if (data.name !== undefined) update.name = data.name;
      if (data.ownerId !== undefined) update.ownerId = data.ownerId;
      if (data.parentAccountId !== undefined) {
        update.parentAccount = data.parentAccountId
          ? { connect: { id: data.parentAccountId } }
          : { disconnect: true };
      }
      if (data.website !== undefined) update.website = data.website;
      if (data.phone !== undefined) update.phone = data.phone;
      if (data.email !== undefined) update.email = data.email;
      if (data.industry !== undefined) update.industry = data.industry;
      if (data.type !== undefined) update.type = data.type;
      if (data.tier !== undefined) update.tier = data.tier;
      if (data.status !== undefined) update.status = data.status;
      if (data.annualRevenue !== undefined) {
        update.annualRevenue = new Prisma.Decimal(data.annualRevenue);
      }
      if (data.employeeCount !== undefined) update.employeeCount = data.employeeCount;
      if (data.country !== undefined) update.country = data.country;
      if (data.city !== undefined) update.city = data.city;
      if (data.address !== undefined) update.address = data.address;
      if (data.zipCode !== undefined) update.zipCode = data.zipCode;
      if (data.linkedInUrl !== undefined) update.linkedInUrl = data.linkedInUrl;
      if (data.description !== undefined) update.description = data.description;
      if (data.sicCode !== undefined) update.sicCode = data.sicCode;
      if (data.naicsCode !== undefined) update.naicsCode = data.naicsCode;
      if (data.customFields !== undefined) {
        update.customFields = data.customFields as Prisma.InputJsonValue;
      }
      if (data.tags !== undefined) update.tags = data.tags;

      return prisma.account.update({ where: { id }, data: update });
    },

    /**
     * Deletes an account. Refuses when open (non-lost/dormant) deals or active
     * contacts reference it; callers should reassign first. Returns the
     * deleted row.
     */
    async deleteAccount(tenantId: string, id: string): Promise<void> {
      await loadOrThrow(tenantId, id);
      const openDealCount = await prisma.deal.count({
        where: { accountId: id, tenantId, status: { in: ['OPEN', 'WON'] } },
      });
      if (openDealCount > 0) {
        throw new NotFoundError('Account.deletable', id);
      }
      await prisma.account.delete({ where: { id } });
    },

    async listAccountContacts(
      tenantId: string,
      id: string,
      pagination: { page: number; limit: number; search?: string }
    ): Promise<PaginatedResult<Contact>> {
      await loadOrThrow(tenantId, id);
      const where: Prisma.ContactWhereInput = { accountId: id, tenantId };
      if (pagination.search?.trim()) {
        const q = pagination.search.trim();
        where.OR = [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ];
      }
      const [total, rows] = await Promise.all([
        prisma.contact.count({ where }),
        prisma.contact.findMany({
          where,
          skip: (pagination.page - 1) * pagination.limit,
          take: pagination.limit,
          orderBy: { createdAt: 'desc' },
        }),
      ]);
      return toPaginatedResult(rows, total, pagination.page, pagination.limit);
    },

    async listAccountDeals(
      tenantId: string,
      id: string,
      pagination: {
        page: number;
        limit: number;
        status?: 'OPEN' | 'WON' | 'LOST' | 'DORMANT';
        pipelineId?: string;
      }
    ): Promise<PaginatedResult<Deal>> {
      await loadOrThrow(tenantId, id);
      const where: Prisma.DealWhereInput = { accountId: id, tenantId };
      if (pagination.status) where.status = pagination.status;
      else where.status = { not: 'DORMANT' };
      if (pagination.pipelineId) where.pipelineId = pagination.pipelineId;

      const [total, rows] = await Promise.all([
        prisma.deal.count({ where }),
        prisma.deal.findMany({
          where,
          skip: (pagination.page - 1) * pagination.limit,
          take: pagination.limit,
          orderBy: { createdAt: 'desc' },
        }),
      ]);
      return toPaginatedResult(rows, total, pagination.page, pagination.limit);
    },

    async getAccountTimeline(
      tenantId: string,
      id: string,
      pagination: { page: number; limit: number }
    ): Promise<PaginatedResult<TimelineEvent>> {
      await loadOrThrow(tenantId, id);
      const [activities, notes] = await Promise.all([
        prisma.activity.findMany({
          where: { accountId: id, tenantId },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.note.findMany({
          where: { accountId: id, tenantId },
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
          metadata: { status: a.status, priority: a.priority, dueDate: a.dueDate?.toISOString() },
        })),
        ...notes.map<TimelineEvent>((n) => ({
          id: `note:${n.id}`,
          type: 'NOTE',
          at: n.createdAt.toISOString(),
          title: n.isPinned ? 'Pinned note' : 'Note',
          description: n.content,
          actorId: n.authorId,
          metadata: { isPinned: n.isPinned },
        })),
      ];
      events.sort((a, b) => (a.at < b.at ? 1 : -1));
      const total = events.length;
      const slice = events.slice(
        (pagination.page - 1) * pagination.limit,
        pagination.page * pagination.limit
      );
      return toPaginatedResult(slice, total, pagination.page, pagination.limit);
    },

    async getAccountHealth(tenantId: string, id: string): Promise<AccountHealthInsight> {
      const account = await loadOrThrow(tenantId, id);
      const latest = await prisma.activity.findFirst({
        where: { accountId: id, tenantId, status: 'COMPLETED' },
        orderBy: { createdAt: 'desc' },
      });
      const daysSince = latest
        ? Math.floor((Date.now() - latest.createdAt.getTime()) / (1000 * 60 * 60 * 24))
        : null;
      return computeHealth(account, daysSince);
    },
  };
}

export type AccountsService = ReturnType<typeof createAccountsService>;
