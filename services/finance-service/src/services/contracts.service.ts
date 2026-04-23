import type { PaginatedResult } from '@nexus/shared-types';
import { BusinessRuleError, ConflictError, NotFoundError } from '@nexus/service-utils';
import type {
  ContractListQuery,
  CreateContractInput,
  SignContractInput,
  UpdateContractInput,
} from '@nexus/validation';
import { Prisma } from '../../../../node_modules/.prisma/finance-client/index.js';
import type { Contract } from '../../../../node_modules/.prisma/finance-client/index.js';
import type { FinancePrisma } from '../prisma.js';
import { toPaginatedResult } from '../lib/pagination.js';

type ContractListFilters = Omit<
  ContractListQuery,
  'page' | 'limit' | 'sortBy' | 'sortDir' | 'cursor'
>;

interface ListPagination {
  page: number;
  limit: number;
  sortBy?: string;
  sortDir: 'asc' | 'desc';
}

async function generateContractNumber(
  prisma: FinancePrisma,
  tenantId: string
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `CTR-${year}-`;
  const last = await prisma.contract.findFirst({
    where: { tenantId, contractNumber: { startsWith: prefix } },
    orderBy: { createdAt: 'desc' },
  });
  const seq = last ? Number(last.contractNumber.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(seq).padStart(6, '0')}`;
}

function buildWhere(
  tenantId: string,
  filters: ContractListFilters
): Prisma.ContractWhereInput {
  const where: Prisma.ContractWhereInput = { tenantId };
  if (filters.accountId) where.accountId = filters.accountId;
  if (filters.status) where.status = filters.status;
  if (filters.search?.trim()) {
    const q = filters.search.trim();
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { contractNumber: { contains: q, mode: 'insensitive' } },
    ];
  }
  return where;
}

export function createContractsService(prisma: FinancePrisma) {
  async function loadOrThrow(tenantId: string, id: string): Promise<Contract> {
    const row = await prisma.contract.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundError('Contract', id);
    return row;
  }

  return {
    async listContracts(
      tenantId: string,
      filters: ContractListFilters,
      pagination: ListPagination
    ): Promise<PaginatedResult<Contract>> {
      const where = buildWhere(tenantId, filters);
      const [total, rows] = await Promise.all([
        prisma.contract.count({ where }),
        prisma.contract.findMany({
          where,
          skip: (pagination.page - 1) * pagination.limit,
          take: pagination.limit,
          orderBy: { createdAt: pagination.sortDir },
        }),
      ]);
      return toPaginatedResult(rows, total, pagination.page, pagination.limit);
    },

    async getContractById(tenantId: string, id: string): Promise<Contract> {
      return loadOrThrow(tenantId, id);
    },

    async createContract(
      tenantId: string,
      data: CreateContractInput
    ): Promise<Contract> {
      const contractNumber = await generateContractNumber(prisma, tenantId);
      return prisma.contract.create({
        data: {
          tenantId,
          accountId: data.accountId,
          ownerId: data.ownerId,
          contractNumber,
          name: data.name,
          status: 'DRAFT',
          startDate: data.startDate ? new Date(data.startDate) : null,
          endDate: data.endDate ? new Date(data.endDate) : null,
          autoRenew: data.autoRenew,
          renewalTermDays: data.renewalTermDays,
          currency: data.currency,
          totalValue: new Prisma.Decimal(data.totalValue),
          terms: data.terms ?? null,
          lineItems: data.lineItems as unknown as Prisma.InputJsonValue,
          customFields: data.customFields as Prisma.InputJsonValue,
        },
      });
    },

    async updateContract(
      tenantId: string,
      id: string,
      data: UpdateContractInput
    ): Promise<Contract> {
      const existing = await loadOrThrow(tenantId, id);
      if (existing.status === 'ACTIVE' && data.totalValue !== undefined) {
        throw new BusinessRuleError('Cannot change value of an active contract');
      }
      const update: Prisma.ContractUpdateInput = { version: { increment: 1 } };
      if (data.accountId !== undefined) update.accountId = data.accountId;
      if (data.ownerId !== undefined) update.ownerId = data.ownerId;
      if (data.name !== undefined) update.name = data.name;
      if (data.status !== undefined) update.status = data.status;
      if (data.startDate !== undefined) {
        update.startDate = data.startDate ? new Date(data.startDate) : null;
      }
      if (data.endDate !== undefined) {
        update.endDate = data.endDate ? new Date(data.endDate) : null;
      }
      if (data.autoRenew !== undefined) update.autoRenew = data.autoRenew;
      if (data.renewalTermDays !== undefined) {
        update.renewalTermDays = data.renewalTermDays;
      }
      if (data.currency !== undefined) update.currency = data.currency;
      if (data.totalValue !== undefined) {
        update.totalValue = new Prisma.Decimal(data.totalValue);
      }
      if (data.terms !== undefined) update.terms = data.terms;
      if (data.lineItems !== undefined) {
        update.lineItems = data.lineItems as unknown as Prisma.InputJsonValue;
      }
      if (data.customFields !== undefined) {
        update.customFields = data.customFields as Prisma.InputJsonValue;
      }
      return prisma.contract.update({ where: { id }, data: update });
    },

    async signContract(
      tenantId: string,
      id: string,
      data: SignContractInput
    ): Promise<Contract> {
      const existing = await loadOrThrow(tenantId, id);
      if (existing.status === 'ACTIVE') {
        throw new ConflictError('Contract', 'already signed');
      }
      if (existing.status === 'EXPIRED' || existing.status === 'TERMINATED') {
        throw new BusinessRuleError('Cannot sign a closed contract');
      }
      return prisma.contract.update({
        where: { id },
        data: {
          status: 'ACTIVE',
          signedAt: new Date(),
          signedById: data.signedById,
          signatureData: (data.signatureData ?? {}) as Prisma.InputJsonValue,
          version: { increment: 1 },
        },
      });
    },

    async terminateContract(tenantId: string, id: string): Promise<Contract> {
      const existing = await loadOrThrow(tenantId, id);
      if (existing.status === 'TERMINATED') return existing;
      return prisma.contract.update({
        where: { id },
        data: { status: 'TERMINATED', version: { increment: 1 } },
      });
    },
  };
}

export type ContractsService = ReturnType<typeof createContractsService>;
