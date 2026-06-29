import { GraphQLScalarType, Kind } from 'graphql';
import type { GraphQLContext } from './context.js';

const DateTime = new GraphQLScalarType({
  name: 'DateTime',
  serialize: (value) => (value instanceof Date ? value.toISOString() : value),
  parseValue: (value) => (typeof value === 'string' ? new Date(value) : value),
  parseLiteral: (ast) => (ast.kind === Kind.STRING ? new Date(ast.value) : null),
});

const JSONScalar = new GraphQLScalarType({
  name: 'JSON',
  serialize: (value) => value,
  parseValue: (value) => value,
  parseLiteral: (ast) => {
    if (ast.kind === Kind.STRING) return ast.value;
    if (ast.kind === Kind.INT) return parseInt(ast.value, 10);
    if (ast.kind === Kind.FLOAT) return parseFloat(ast.value);
    if (ast.kind === Kind.BOOLEAN) return ast.value;
    if (ast.kind === Kind.NULL) return null;
    return null;
  },
});

function mapRecord(record: any): any {
  if (!record) return null;
  const mapped: any = {};
  for (const key of Object.keys(record)) {
    const val = record[key];
    if (val && typeof val === 'object' && typeof val.toNumber === 'function') {
      mapped[key] = val.toNumber();
    } else {
      mapped[key] = val;
    }
  }
  return mapped;
}

function cpqMutationDisabled(): never {
  const err = new Error('Quote mutations have moved to finance-service authority.');
  (err as Error & { extensions?: Record<string, unknown> }).extensions = {
    code: 'CPQ_MUTATION_DISABLED',
    status: 410,
    migration: 'Use finance-service RFQ/quote/DRQ/order workflow endpoints and transitionCpqEntity authority.',
  };
  throw err;
}

export const resolvers = {
  DateTime,
  JSON: JSONScalar,
  Query: {
    async products(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const records = await ctx.prisma.product.findMany({ where, take: Math.min(limit, 100), skip: offset });
      return records.map(mapRecord);
    },
    async product(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where: any = { id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.product.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
    async priceTiers(_parent: unknown, { productId, limit = 20, offset = 0 }: { productId?: string; limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where: any = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      if (productId) where.productId = productId;
      const records = await ctx.prisma.priceTier.findMany({ where, take: Math.min(limit, 100), skip: offset });
      return records.map(mapRecord);
    },
    async priceTier(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where: any = { id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.priceTier.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
    async promoCodes(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const records = await ctx.prisma.promoCode.findMany({ where, take: Math.min(limit, 100), skip: offset });
      return records.map(mapRecord);
    },
    async promoCode(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where: any = { id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.promoCode.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
    async accounts(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const records = await ctx.prisma.account.findMany({ where, take: Math.min(limit, 100), skip: offset });
      return records.map(mapRecord);
    },
    async account(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where: any = { id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.account.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
    async quotes(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const records = await ctx.prisma.quote.findMany({ where, take: Math.min(limit, 100), skip: offset });
      return records.map(mapRecord);
    },
    async quote(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where: any = { id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.quote.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
    async invoices(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const records = await ctx.prisma.invoice.findMany({ where, take: Math.min(limit, 100), skip: offset });
      return records.map(mapRecord);
    },
    async invoice(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where: any = { id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.invoice.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
    async contracts(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const records = await ctx.prisma.contract.findMany({ where, take: Math.min(limit, 100), skip: offset });
      return records.map(mapRecord);
    },
    async contract(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where: any = { id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.contract.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
    async subscriptions(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const records = await ctx.prisma.subscription.findMany({ where, take: Math.min(limit, 100), skip: offset });
      return records.map(mapRecord);
    },
    async subscription(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where: any = { id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.subscription.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
    async payments(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const records = await ctx.prisma.payment.findMany({ where, take: Math.min(limit, 100), skip: offset });
      return records.map(mapRecord);
    },
    async payment(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where: any = { id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.payment.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
    async currencies(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const records = await ctx.prisma.currency.findMany({ where, take: Math.min(limit, 100), skip: offset });
      return records.map(mapRecord);
    },
    async currency(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where: any = { id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.currency.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
    async taxZones(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const records = await ctx.prisma.taxZone.findMany({ where, take: Math.min(limit, 100), skip: offset });
      return records.map(mapRecord);
    },
    async taxZone(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where: any = { id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.taxZone.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
    async taxRates(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const records = await ctx.prisma.taxRate.findMany({ where, take: Math.min(limit, 100), skip: offset });
      return records.map(mapRecord);
    },
    async taxRate(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where: any = { id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.taxRate.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
  },
  Mutation: {
    async createProduct(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const data = { ...input, tenantId: input.tenantId ?? ctx.tenantId ?? '' };
      const record = await ctx.prisma.product.create({ data });
      return mapRecord(record);
    },
    async updateProduct(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.product.updateMany({ where, data: input });
      if (count === 0) throw new Error('NOT_FOUND');
      return mapRecord(await ctx.prisma.product.findUnique({ where: { id } }));
    },
    async deleteProduct(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.product.deleteMany({ where });
      if (count === 0) throw new Error('NOT_FOUND');
      return true;
    },
    async createPriceTier(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const data = { ...input, tenantId: input.tenantId ?? ctx.tenantId ?? '' };
      const record = await ctx.prisma.priceTier.create({ data });
      return mapRecord(record);
    },
    async updatePriceTier(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.priceTier.updateMany({ where, data: input });
      if (count === 0) throw new Error('NOT_FOUND');
      return mapRecord(await ctx.prisma.priceTier.findUnique({ where: { id } }));
    },
    async deletePriceTier(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.priceTier.deleteMany({ where });
      if (count === 0) throw new Error('NOT_FOUND');
      return true;
    },
    async createPromoCode(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const data = { ...input, tenantId: input.tenantId ?? ctx.tenantId ?? '' };
      const record = await ctx.prisma.promoCode.create({ data });
      return mapRecord(record);
    },
    async updatePromoCode(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.promoCode.updateMany({ where, data: input });
      if (count === 0) throw new Error('NOT_FOUND');
      return mapRecord(await ctx.prisma.promoCode.findUnique({ where: { id } }));
    },
    async deletePromoCode(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.promoCode.deleteMany({ where });
      if (count === 0) throw new Error('NOT_FOUND');
      return true;
    },
    async createQuote(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      void input;
      void ctx;
      cpqMutationDisabled();
    },
    async updateQuote(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      void id;
      void input;
      void ctx;
      cpqMutationDisabled();
    },
    async deleteQuote(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      void id;
      void ctx;
      cpqMutationDisabled();
    },
    async createInvoice(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const data = { ...input, tenantId: input.tenantId ?? ctx.tenantId ?? '' };
      const record = await ctx.prisma.invoice.create({ data });
      return mapRecord(record);
    },
    async updateInvoice(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.invoice.updateMany({ where, data: input });
      if (count === 0) throw new Error('NOT_FOUND');
      return mapRecord(await ctx.prisma.invoice.findUnique({ where: { id } }));
    },
    async deleteInvoice(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.invoice.deleteMany({ where });
      if (count === 0) throw new Error('NOT_FOUND');
      return true;
    },
    async createContract(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const data = { ...input, tenantId: input.tenantId ?? ctx.tenantId ?? '' };
      const record = await ctx.prisma.contract.create({ data });
      return mapRecord(record);
    },
    async updateContract(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.contract.updateMany({ where, data: input });
      if (count === 0) throw new Error('NOT_FOUND');
      return mapRecord(await ctx.prisma.contract.findUnique({ where: { id } }));
    },
    async deleteContract(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.contract.deleteMany({ where });
      if (count === 0) throw new Error('NOT_FOUND');
      return true;
    },
    async createSubscription(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const data = { ...input, tenantId: input.tenantId ?? ctx.tenantId ?? '' };
      const record = await ctx.prisma.subscription.create({ data });
      return mapRecord(record);
    },
    async updateSubscription(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.subscription.updateMany({ where, data: input });
      if (count === 0) throw new Error('NOT_FOUND');
      return mapRecord(await ctx.prisma.subscription.findUnique({ where: { id } }));
    },
    async deleteSubscription(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.subscription.deleteMany({ where });
      if (count === 0) throw new Error('NOT_FOUND');
      return true;
    },
    async createPayment(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const data = { ...input, tenantId: input.tenantId ?? ctx.tenantId ?? '' };
      const record = await ctx.prisma.payment.create({ data });
      return mapRecord(record);
    },
    async updatePayment(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.payment.updateMany({ where, data: input });
      if (count === 0) throw new Error('NOT_FOUND');
      return mapRecord(await ctx.prisma.payment.findUnique({ where: { id } }));
    },
    async deletePayment(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.payment.deleteMany({ where });
      if (count === 0) throw new Error('NOT_FOUND');
      return true;
    },
    async createCurrency(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const data = { ...input, tenantId: input.tenantId ?? ctx.tenantId ?? '' };
      const record = await ctx.prisma.currency.create({ data });
      return mapRecord(record);
    },
    async updateCurrency(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.currency.updateMany({ where, data: input });
      if (count === 0) throw new Error('NOT_FOUND');
      return mapRecord(await ctx.prisma.currency.findUnique({ where: { id } }));
    },
    async deleteCurrency(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.currency.deleteMany({ where });
      if (count === 0) throw new Error('NOT_FOUND');
      return true;
    },
    async createTaxZone(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const data = { ...input, tenantId: input.tenantId ?? ctx.tenantId ?? '' };
      const record = await ctx.prisma.taxZone.create({ data });
      return mapRecord(record);
    },
    async updateTaxZone(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.taxZone.updateMany({ where, data: input });
      if (count === 0) throw new Error('NOT_FOUND');
      return mapRecord(await ctx.prisma.taxZone.findUnique({ where: { id } }));
    },
    async deleteTaxZone(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.taxZone.deleteMany({ where });
      if (count === 0) throw new Error('NOT_FOUND');
      return true;
    },
    async createTaxRate(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const data = { ...input, tenantId: input.tenantId ?? ctx.tenantId ?? '' };
      const record = await ctx.prisma.taxRate.create({ data });
      return mapRecord(record);
    },
    async updateTaxRate(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.taxRate.updateMany({ where, data: input });
      if (count === 0) throw new Error('NOT_FOUND');
      return mapRecord(await ctx.prisma.taxRate.findUnique({ where: { id } }));
    },
    async deleteTaxRate(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.taxRate.deleteMany({ where });
      if (count === 0) throw new Error('NOT_FOUND');
      return true;
    },
  },
  Product: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const where: any = { id: reference.id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.product.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
  },
  PriceTier: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const where: any = { id: reference.id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.priceTier.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
  },
  PromoCode: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const where: any = { id: reference.id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.promoCode.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
  },
  Account: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const where: any = { id: reference.id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.account.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
  },
  Quote: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const where: any = { id: reference.id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.quote.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
  },
  Invoice: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const where: any = { id: reference.id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.invoice.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
  },
  Contract: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const where: any = { id: reference.id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.contract.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
  },
  Subscription: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const where: any = { id: reference.id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.subscription.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
  },
  Payment: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const where: any = { id: reference.id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.payment.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
  },
  Currency: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const where: any = { id: reference.id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.currency.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
  },
  TaxZone: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const where: any = { id: reference.id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.taxZone.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
  },
  TaxRate: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const where: any = { id: reference.id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.taxRate.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
  },
};
