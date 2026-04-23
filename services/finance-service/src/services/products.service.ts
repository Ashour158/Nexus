import type { PaginatedResult } from '@nexus/shared-types';
import { ConflictError, NotFoundError } from '@nexus/service-utils';
import type {
  CreateProductInput,
  ProductListQuery,
  UpdateProductInput,
} from '@nexus/validation';
import { Prisma } from '../../../../node_modules/.prisma/finance-client/index.js';
import type {
  PriceTier,
  Product,
} from '../../../../node_modules/.prisma/finance-client/index.js';
import type { FinancePrisma } from '../prisma.js';
import { toPaginatedResult } from '../lib/pagination.js';

export type ProductWithTiers = Prisma.ProductGetPayload<{ include: { priceTiers: true } }>;

type ProductListFilters = Omit<
  ProductListQuery,
  'page' | 'limit' | 'sortBy' | 'sortDir' | 'cursor'
>;

interface ListPagination {
  page: number;
  limit: number;
  sortBy?: string;
  sortDir: 'asc' | 'desc';
}

function buildWhere(
  tenantId: string,
  filters: ProductListFilters
): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = { tenantId };
  if (filters.type) where.type = filters.type;
  if (filters.isActive !== undefined) where.isActive = filters.isActive;
  if (filters.search?.trim()) {
    const q = filters.search.trim();
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { sku: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
    ];
  }
  return where;
}

function resolveSortField(
  sortBy: string | undefined
): keyof Prisma.ProductOrderByWithRelationInput {
  const allowed = new Set(['createdAt', 'updatedAt', 'name', 'listPrice', 'sku']);
  return (
    (sortBy && allowed.has(sortBy) ? sortBy : 'createdAt') as keyof Prisma.ProductOrderByWithRelationInput
  );
}

export function createProductsService(prisma: FinancePrisma) {
  async function loadOrThrow(tenantId: string, id: string): Promise<ProductWithTiers> {
    const row = await prisma.product.findFirst({
      where: { id, tenantId },
      include: { priceTiers: true },
    });
    if (!row) throw new NotFoundError('Product', id);
    return row;
  }

  return {
    async listProducts(
      tenantId: string,
      filters: ProductListFilters,
      pagination: ListPagination
    ): Promise<PaginatedResult<ProductWithTiers>> {
      const where = buildWhere(tenantId, filters);
      const sortField = resolveSortField(pagination.sortBy);
      const orderBy: Prisma.ProductOrderByWithRelationInput = {
        [sortField]: pagination.sortDir,
      };
      const [total, rows] = await Promise.all([
        prisma.product.count({ where }),
        prisma.product.findMany({
          where,
          include: { priceTiers: true },
          skip: (pagination.page - 1) * pagination.limit,
          take: pagination.limit,
          orderBy,
        }),
      ]);
      return toPaginatedResult(rows, total, pagination.page, pagination.limit);
    },

    async getProductById(tenantId: string, id: string): Promise<ProductWithTiers> {
      return loadOrThrow(tenantId, id);
    },

    async createProduct(
      tenantId: string,
      data: CreateProductInput
    ): Promise<ProductWithTiers> {
      const existing = await prisma.product.findFirst({
        where: { tenantId, sku: data.sku },
      });
      if (existing) throw new ConflictError('Product', 'sku');

      return prisma.product.create({
        data: {
          tenantId,
          sku: data.sku,
          name: data.name,
          description: data.description ?? null,
          type: data.type,
          category: data.category ?? null,
          currency: data.currency,
          listPrice: new Prisma.Decimal(data.listPrice),
          cost: data.cost !== undefined ? new Prisma.Decimal(data.cost) : null,
          billingType: data.billingType,
          billingPeriod: data.billingPeriod ?? null,
          taxable: data.taxable,
          taxCode: data.taxCode ?? null,
          isActive: data.isActive,
          pricingRules: data.pricingRules as unknown as Prisma.InputJsonValue,
          customFields: data.customFields as Prisma.InputJsonValue,
          priceTiers: {
            create: data.priceTiers.map((t) => ({
              tenantId,
              name: t.name,
              minQty: t.minQty,
              maxQty: t.maxQty ?? null,
              unitPrice: new Prisma.Decimal(t.unitPrice),
            })),
          },
        },
        include: { priceTiers: true },
      });
    },

    async updateProduct(
      tenantId: string,
      id: string,
      data: UpdateProductInput
    ): Promise<ProductWithTiers> {
      await loadOrThrow(tenantId, id);
      if (data.sku) {
        const dup = await prisma.product.findFirst({
          where: { tenantId, sku: data.sku, NOT: { id } },
        });
        if (dup) throw new ConflictError('Product', 'sku');
      }
      const update: Prisma.ProductUpdateInput = {};
      if (data.sku !== undefined) update.sku = data.sku;
      if (data.name !== undefined) update.name = data.name;
      if (data.description !== undefined) update.description = data.description;
      if (data.type !== undefined) update.type = data.type;
      if (data.category !== undefined) update.category = data.category;
      if (data.currency !== undefined) update.currency = data.currency;
      if (data.listPrice !== undefined) {
        update.listPrice = new Prisma.Decimal(data.listPrice);
      }
      if (data.cost !== undefined) {
        update.cost = data.cost === null ? null : new Prisma.Decimal(data.cost);
      }
      if (data.billingType !== undefined) update.billingType = data.billingType;
      if (data.billingPeriod !== undefined) update.billingPeriod = data.billingPeriod;
      if (data.taxable !== undefined) update.taxable = data.taxable;
      if (data.taxCode !== undefined) update.taxCode = data.taxCode;
      if (data.isActive !== undefined) update.isActive = data.isActive;
      if (data.pricingRules !== undefined) {
        update.pricingRules = data.pricingRules as unknown as Prisma.InputJsonValue;
      }
      if (data.customFields !== undefined) {
        update.customFields = data.customFields as Prisma.InputJsonValue;
      }

      await prisma.product.update({ where: { id }, data: update });

      if (data.priceTiers !== undefined) {
        await prisma.$transaction([
          prisma.priceTier.deleteMany({ where: { productId: id } }),
          ...data.priceTiers.map((t): Prisma.PrismaPromise<PriceTier> =>
            prisma.priceTier.create({
              data: {
                tenantId,
                productId: id,
                name: t.name,
                minQty: t.minQty,
                maxQty: t.maxQty ?? null,
                unitPrice: new Prisma.Decimal(t.unitPrice),
              },
            })
          ),
        ]);
      }

      return loadOrThrow(tenantId, id);
    },

    /** Soft-deletes by setting `isActive=false`. */
    async deleteProduct(tenantId: string, id: string): Promise<void> {
      await loadOrThrow(tenantId, id);
      await prisma.product.update({ where: { id }, data: { isActive: false } });
    },

    async listActiveProducts(tenantId: string): Promise<Product[]> {
      return prisma.product.findMany({
        where: { tenantId, isActive: true },
        orderBy: { name: 'asc' },
      });
    },
  };
}

export type ProductsService = ReturnType<typeof createProductsService>;
