import type { PaginatedResult } from '@nexus/shared-types';
import { NotFoundError } from '@nexus/service-utils';
import type { CreateAccountInput, UpdateAccountInput, AccountListQuery } from '@nexus/validation';
import { NexusProducer, TOPICS } from '@nexus/kafka';
import { Prisma } from '../../../../node_modules/.prisma/contacts-client/index.js';
import type { Account, Contact } from '../../../../node_modules/.prisma/contacts-client/index.js';
import type { ContactsPrisma } from '../prisma.js';
import { toPaginatedResult } from '@nexus/shared-types';

type AccountListFilters = Omit<AccountListQuery, 'page' | 'limit' | 'sortBy' | 'sortDir' | 'cursor'>;

interface ListPagination {
  page: number;
  limit: number;
  sortBy?: string;
  sortDir: 'asc' | 'desc';
}

function buildWhere(tenantId: string, filters: AccountListFilters): Prisma.AccountWhereInput {
  const where: Prisma.AccountWhereInput = { tenantId };
  if (filters.ownerId) where.ownerId = filters.ownerId;
  if (filters.type) where.type = filters.type;
  if (filters.tier) where.tier = filters.tier;
  if (filters.status) where.status = filters.status;
  if (filters.industry) where.industry = { contains: filters.industry, mode: 'insensitive' };
  if (filters.search?.trim()) {
    const q = filters.search.trim();
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { website: { contains: q, mode: 'insensitive' } },
    ];
  }
  return where;
}

function resolveSortField(sortBy: string | undefined): keyof Prisma.AccountOrderByWithRelationInput {
  const allowed = new Set(['createdAt', 'updatedAt', 'name']);
  return (sortBy && allowed.has(sortBy) ? sortBy : 'createdAt') as keyof Prisma.AccountOrderByWithRelationInput;
}

export function createAccountsService(prisma: ContactsPrisma, producer: NexusProducer) {
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
      const orderBy: Prisma.AccountOrderByWithRelationInput = { [sortField]: pagination.sortDir };
      const [total, rows] = await Promise.all([
        prisma.account.count({ where }),
        prisma.account.findMany({
    where, skip: (pagination.page - 1) * pagination.limit, take: pagination.limit, orderBy }),
      ]);
      return toPaginatedResult(rows, total, pagination.page, pagination.limit);
    },

    async getAccountById(tenantId: string, id: string): Promise<Account> {
      return loadOrThrow(tenantId, id);
    },

    async createAccount(tenantId: string, data: CreateAccountInput): Promise<Account> {
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
          type: data.type ?? 'PROSPECT',
          tier: data.tier ?? 'SMB',
          status: data.status ?? 'ACTIVE',
          annualRevenue: data.annualRevenue ? new Prisma.Decimal(data.annualRevenue) : null,
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
      await producer.publish(TOPICS.ACCOUNTS, {
        type: 'account.created',
        tenantId,
        payload: { accountId: created.id, name: created.name },
      }).catch(() => undefined);
      return created;
    },

    async updateAccount(tenantId: string, id: string, data: UpdateAccountInput): Promise<Account> {
      await loadOrThrow(tenantId, id);
      const update: Prisma.AccountUpdateInput = {};
      const scalarFields: (keyof UpdateAccountInput)[] = [
        'name', 'website', 'phone', 'email', 'industry', 'type', 'tier', 'status',
        'employeeCount', 'country', 'city', 'address', 'zipCode', 'linkedInUrl',
        'description', 'sicCode', 'naicsCode', 'ownerId',
      ];
      for (const f of scalarFields) {
        if (data[f] !== undefined) (update as Record<string, unknown>)[f] = data[f];
      }
      if (data.annualRevenue !== undefined) update.annualRevenue = new Prisma.Decimal(data.annualRevenue);
      if (data.parentAccountId !== undefined) update.parentAccount = data.parentAccountId ? { connect: { id: data.parentAccountId } } : { disconnect: true };
      if (data.customFields !== undefined) update.customFields = data.customFields as Prisma.InputJsonValue;
      if (data.tags !== undefined) update.tags = data.tags;
      return prisma.account.update({ where: { id }, data: update });
    },

    async deleteAccount(tenantId: string, id: string): Promise<void> {
      await loadOrThrow(tenantId, id);
      await prisma.account.update({ where: { id }, data: { status: 'INACTIVE' } });
    },

    async listAccountContacts(
      tenantId: string,
      accountId: string,
      pagination: { page: number; limit: number; search?: string }
    ): Promise<PaginatedResult<Contact>> {
      await loadOrThrow(tenantId, accountId);
      const where: Prisma.ContactWhereInput = { tenantId, accountId };
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
    where, skip: (pagination.page - 1) * pagination.limit, take: pagination.limit, orderBy: { createdAt: 'desc' } }),
      ]);
      return toPaginatedResult(rows, total, pagination.page, pagination.limit);
    },
  };
}

export type AccountsService = ReturnType<typeof createAccountsService>;
