import type { PaginatedResult } from '@nexus/shared-types';
import { NotFoundError } from '@nexus/service-utils';
import type { CreateCompanyInput, UpdateCompanyInput, CompanyListQuery } from '@nexus/validation';
import { Prisma } from '../../../../node_modules/.prisma/contacts-client/index.js';
import type { Company } from '../../../../node_modules/.prisma/contacts-client/index.js';
import type { ContactsPrisma } from '../prisma.js';
import { toPaginatedResult } from '@nexus/shared-types';

type CompanyListFilters = Omit<CompanyListQuery, 'page' | 'limit' | 'sortBy' | 'sortDir' | 'cursor'>;

interface ListPagination {
  page: number;
  limit: number;
  sortBy?: string;
  sortDir: 'asc' | 'desc';
}

function buildWhere(tenantId: string, filters: CompanyListFilters): Prisma.CompanyWhereInput {
  const where: Prisma.CompanyWhereInput = { tenantId };
  if (filters.ownerId) where.ownerId = filters.ownerId;
  if (filters.type) where.type = filters.type;
  if (filters.industry) where.industry = { contains: filters.industry, mode: 'insensitive' };
  if (filters.isActive !== undefined) where.isActive = filters.isActive;
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

function resolveSortField(sortBy: string | undefined): keyof Prisma.CompanyOrderByWithRelationInput {
  const allowed = new Set(['createdAt', 'updatedAt', 'name']);
  return (sortBy && allowed.has(sortBy) ? sortBy : 'createdAt') as keyof Prisma.CompanyOrderByWithRelationInput;
}

export function createCompaniesService(prisma: ContactsPrisma) {
  async function loadOrThrow(tenantId: string, id: string): Promise<Company> {
    const row = await prisma.company.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundError('Company', id);
    return row;
  }

  return {
    async listCompanies(
      tenantId: string,
      filters: CompanyListFilters,
      pagination: ListPagination
    ): Promise<PaginatedResult<Company>> {
      const where = buildWhere(tenantId, filters);
      const sortField = resolveSortField(pagination.sortBy);
      const orderBy: Prisma.CompanyOrderByWithRelationInput = { [sortField]: pagination.sortDir };
      const [total, rows] = await Promise.all([
        prisma.company.count({ where }),
        prisma.company.findMany({
    where, skip: (pagination.page - 1) * pagination.limit, take: pagination.limit, orderBy }),
      ]);
      return toPaginatedResult(rows, total, pagination.page, pagination.limit);
    },

    async getCompanyById(tenantId: string, id: string): Promise<Company> {
      return loadOrThrow(tenantId, id);
    },

    async createCompany(tenantId: string, data: CreateCompanyInput): Promise<Company> {
      return prisma.company.create({
        data: {
          tenantId,
          ownerId: data.ownerId,
          name: data.name,
          website: data.website ?? null,
          phone: data.phone ?? null,
          email: data.email ?? null,
          industry: data.industry ?? null,
          type: data.type ?? 'CUSTOMER',
          size: data.size ?? null,
          annualRevenue: data.annualRevenue ? new Prisma.Decimal(data.annualRevenue) : null,
          employeeCount: data.employeeCount ?? null,
          country: data.country ?? null,
          city: data.city ?? null,
          address: data.address ?? null,
          zipCode: data.zipCode ?? null,
          linkedInUrl: data.linkedInUrl ?? null,
          description: data.description ?? null,
          customFields: data.customFields as Prisma.InputJsonValue,
          tags: data.tags,
        },
      });
    },

    async updateCompany(tenantId: string, id: string, data: UpdateCompanyInput): Promise<Company> {
      await loadOrThrow(tenantId, id);
      const update: Prisma.CompanyUpdateInput = {};
      const scalarFields = [
        'name', 'website', 'phone', 'email', 'industry', 'type', 'size',
        'employeeCount', 'country', 'city', 'address', 'zipCode', 'linkedInUrl',
        'description', 'ownerId',
      ] as const;
      for (const f of scalarFields) {
        if (data[f] !== undefined) (update as Record<string, unknown>)[f] = data[f];
      }
      if (data.isActive !== undefined) update.isActive = data.isActive;
      if (data.annualRevenue !== undefined) update.annualRevenue = new Prisma.Decimal(data.annualRevenue);
      if (data.customFields !== undefined) update.customFields = data.customFields as Prisma.InputJsonValue;
      if (data.tags !== undefined) update.tags = data.tags;
      return prisma.company.update({ where: { id }, data: update });
    },

    async deleteCompany(tenantId: string, id: string): Promise<void> {
      await loadOrThrow(tenantId, id);
      await prisma.company.update({ where: { id }, data: { isActive: false } });
    },
  };
}

export type CompaniesService = ReturnType<typeof createCompaniesService>;
