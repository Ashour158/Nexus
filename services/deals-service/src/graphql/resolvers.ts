import { GraphQLScalarType, Kind } from 'graphql';
import { requireGqlPermission } from '@nexus/service-utils';
import type { GraphQLContext } from './context.js';

// Permission strings reused verbatim from the REST catalog (packages/service-utils
// rbac.ts) so GraphQL and REST gate on identical grants. Pipelines/stages/rooms/
// stakeholders/contacts/competitors are all deal-domain config → deals:* grants.
const DEALS_READ = 'deals:read';
const DEALS_CREATE = 'deals:create';
const DEALS_UPDATE = 'deals:update';
const DEALS_DELETE = 'deals:delete';
const QUOTES_READ = 'quotes:read';

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
    migration: 'Use finance-service RFQ/quote/DRQ/order workflow endpoints. Deals-service quote GraphQL is read-only.',
  };
  throw err;
}

function mapQuoteProjection(record: any): any {
  if (!record) return null;
  const total = record.totalAmount && typeof record.totalAmount === 'object' && typeof record.totalAmount.toNumber === 'function'
    ? record.totalAmount.toNumber()
    : Number(record.totalAmount ?? 0);
  const projectedAt = record.projectedAt ?? record.updatedAt ?? record.createdAt ?? new Date();
  return {
    id: record.quoteId,
    tenantId: record.tenantId,
    dealId: record.dealId ?? '',
    ownerId: '',
    quoteNumber: record.quoteNumber ?? record.quoteId,
    name: record.quoteNumber ?? record.quoteId,
    status: record.status,
    validUntil: record.validUntil ?? null,
    currency: record.currency ?? 'USD',
    subtotal: total,
    discountAmount: 0,
    taxAmount: 0,
    total,
    approvalStatus: null,
    approvedById: null,
    approvedAt: null,
    sentAt: null,
    viewedAt: null,
    acceptedAt: null,
    terms: null,
    notes: null,
    lineItems: [],
    customFields: {
      readModel: 'QuoteProjection',
      currentRevisionId: record.currentRevisionId ?? null,
      lastFinanceEventType: record.lastFinanceEventType ?? null,
      sourceEventId: record.sourceEventId ?? null,
      transitionLedgerId: record.transitionLedgerId ?? null,
    },
    version: record.projectionVersion ?? 1,
    createdAt: record.createdAt ?? projectedAt,
    updatedAt: record.updatedAt ?? projectedAt,
  };
}

export const resolvers = {
  DateTime,
  JSON: JSONScalar,
  Query: {
    async deals(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      requireGqlPermission(ctx, DEALS_READ);
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const records = await ctx.prisma.deal.findMany({ where, take: Math.min(limit, 100), skip: offset });
      return records.map(mapRecord);
    },
    async deal(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      requireGqlPermission(ctx, DEALS_READ);
      const where: any = { id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.deal.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
    async pipelines(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      requireGqlPermission(ctx, DEALS_READ);
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const records = await ctx.prisma.pipeline.findMany({ where, take: Math.min(limit, 100), skip: offset });
      return records.map(mapRecord);
    },
    async pipeline(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      requireGqlPermission(ctx, DEALS_READ);
      const where: any = { id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.pipeline.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
    async stages(_parent: unknown, { pipelineId }: { pipelineId: string }, ctx: GraphQLContext) {
      requireGqlPermission(ctx, DEALS_READ);
      const where: any = { pipelineId };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const records = await ctx.prisma.stage.findMany({ where });
      return records.map(mapRecord);
    },
    async stage(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      requireGqlPermission(ctx, DEALS_READ);
      const where: any = { id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.stage.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
    async dealContacts(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      requireGqlPermission(ctx, DEALS_READ);
      const records = await ctx.prisma.dealContact.findMany({ take: Math.min(limit, 100), skip: offset });
      return records.map(mapRecord);
    },
    async dealContact(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      requireGqlPermission(ctx, DEALS_READ);
      const record = await ctx.prisma.dealContact.findUnique({ where: { id } });
      return record ? mapRecord(record) : null;
    },
    async dealStakeholders(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      requireGqlPermission(ctx, DEALS_READ);
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const records = await ctx.prisma.dealStakeholder.findMany({ where, take: Math.min(limit, 100), skip: offset });
      return records.map(mapRecord);
    },
    async dealStakeholder(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      requireGqlPermission(ctx, DEALS_READ);
      const where: any = { id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.dealStakeholder.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
    async dealRooms(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      requireGqlPermission(ctx, DEALS_READ);
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const records = await ctx.prisma.dealRoom.findMany({ where, take: Math.min(limit, 100), skip: offset });
      return records.map(mapRecord);
    },
    async dealRoom(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      requireGqlPermission(ctx, DEALS_READ);
      const where: any = { id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.dealRoom.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
    async quotes(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      requireGqlPermission(ctx, QUOTES_READ);
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const records = await ctx.prisma.quoteProjection.findMany({ where, take: Math.min(limit, 100), skip: offset });
      return records.map(mapQuoteProjection);
    },
    async quote(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      requireGqlPermission(ctx, QUOTES_READ);
      const where: any = { quoteId: id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.quoteProjection.findFirst({ where });
      return mapQuoteProjection(record);
    },
    async competitors(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      requireGqlPermission(ctx, DEALS_READ);
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const records = await ctx.prisma.competitor.findMany({ where, take: Math.min(limit, 100), skip: offset });
      return records.map(mapRecord);
    },
    async competitor(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      requireGqlPermission(ctx, DEALS_READ);
      const where: any = { id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.competitor.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
  },
  Mutation: {
    async createDeal(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      requireGqlPermission(ctx, DEALS_CREATE);
      const data = { ...input, tenantId: input.tenantId ?? ctx.tenantId ?? '' };
      const record = await ctx.prisma.deal.create({ data });
      return mapRecord(record);
    },
    async updateDeal(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      requireGqlPermission(ctx, DEALS_UPDATE);
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.deal.updateMany({ where, data: input });
      if (count === 0) throw new Error('NOT_FOUND');
      return mapRecord(await ctx.prisma.deal.findUnique({ where: { id } }));
    },
    async deleteDeal(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      requireGqlPermission(ctx, DEALS_DELETE);
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.deal.deleteMany({ where });
      if (count === 0) throw new Error('NOT_FOUND');
      return true;
    },
    async createPipeline(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      requireGqlPermission(ctx, DEALS_CREATE);
      const data = { ...input, tenantId: input.tenantId ?? ctx.tenantId ?? '' };
      const record = await ctx.prisma.pipeline.create({ data });
      return mapRecord(record);
    },
    async updatePipeline(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      requireGqlPermission(ctx, DEALS_UPDATE);
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.pipeline.updateMany({ where, data: input });
      if (count === 0) throw new Error('NOT_FOUND');
      return mapRecord(await ctx.prisma.pipeline.findUnique({ where: { id } }));
    },
    async deletePipeline(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      requireGqlPermission(ctx, DEALS_DELETE);
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.pipeline.deleteMany({ where });
      if (count === 0) throw new Error('NOT_FOUND');
      return true;
    },
    async createStage(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      requireGqlPermission(ctx, DEALS_CREATE);
      const data = { ...input, tenantId: input.tenantId ?? ctx.tenantId ?? '' };
      const record = await ctx.prisma.stage.create({ data });
      return mapRecord(record);
    },
    async updateStage(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      requireGqlPermission(ctx, DEALS_UPDATE);
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.stage.updateMany({ where, data: input });
      if (count === 0) throw new Error('NOT_FOUND');
      return mapRecord(await ctx.prisma.stage.findUnique({ where: { id } }));
    },
    async deleteStage(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      requireGqlPermission(ctx, DEALS_DELETE);
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.stage.deleteMany({ where });
      if (count === 0) throw new Error('NOT_FOUND');
      return true;
    },
    async createDealContact(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      requireGqlPermission(ctx, DEALS_UPDATE);
      const record = await ctx.prisma.dealContact.create({ data: input });
      return mapRecord(record);
    },
    async updateDealContact(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      requireGqlPermission(ctx, DEALS_UPDATE);
      const record = await ctx.prisma.dealContact.update({ where: { id }, data: input });
      return mapRecord(record);
    },
    async deleteDealContact(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      requireGqlPermission(ctx, DEALS_UPDATE);
      await ctx.prisma.dealContact.delete({ where: { id } });
      return true;
    },
    async createDealStakeholder(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      requireGqlPermission(ctx, DEALS_UPDATE);
      const data = { ...input, tenantId: input.tenantId ?? ctx.tenantId ?? '' };
      const record = await ctx.prisma.dealStakeholder.create({ data });
      return mapRecord(record);
    },
    async updateDealStakeholder(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      requireGqlPermission(ctx, DEALS_UPDATE);
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.dealStakeholder.updateMany({ where, data: input });
      if (count === 0) throw new Error('NOT_FOUND');
      return mapRecord(await ctx.prisma.dealStakeholder.findUnique({ where: { id } }));
    },
    async deleteDealStakeholder(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      requireGqlPermission(ctx, DEALS_UPDATE);
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.dealStakeholder.deleteMany({ where });
      if (count === 0) throw new Error('NOT_FOUND');
      return true;
    },
    async createDealRoom(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      requireGqlPermission(ctx, DEALS_CREATE);
      const data = { ...input, tenantId: input.tenantId ?? ctx.tenantId ?? '' };
      const record = await ctx.prisma.dealRoom.create({ data });
      return mapRecord(record);
    },
    async updateDealRoom(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      requireGqlPermission(ctx, DEALS_UPDATE);
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.dealRoom.updateMany({ where, data: input });
      if (count === 0) throw new Error('NOT_FOUND');
      return mapRecord(await ctx.prisma.dealRoom.findUnique({ where: { id } }));
    },
    async deleteDealRoom(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      requireGqlPermission(ctx, DEALS_DELETE);
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.dealRoom.deleteMany({ where });
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
    async createCompetitor(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      requireGqlPermission(ctx, DEALS_CREATE);
      const data = { ...input, tenantId: input.tenantId ?? ctx.tenantId ?? '' };
      const record = await ctx.prisma.competitor.create({ data });
      return mapRecord(record);
    },
    async updateCompetitor(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      requireGqlPermission(ctx, DEALS_UPDATE);
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.competitor.updateMany({ where, data: input });
      if (count === 0) throw new Error('NOT_FOUND');
      return mapRecord(await ctx.prisma.competitor.findUnique({ where: { id } }));
    },
    async deleteCompetitor(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      requireGqlPermission(ctx, DEALS_DELETE);
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.competitor.deleteMany({ where });
      if (count === 0) throw new Error('NOT_FOUND');
      return true;
    },
  },
  Deal: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const where: any = { id: reference.id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.deal.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
  },
  Pipeline: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const where: any = { id: reference.id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.pipeline.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
  },
  Stage: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const where: any = { id: reference.id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.stage.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
  },
  DealContact: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const record = await ctx.prisma.dealContact.findUnique({ where: { id: reference.id } });
      return record ? mapRecord(record) : null;
    },
  },
  DealStakeholder: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const where: any = { id: reference.id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.dealStakeholder.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
  },
  DealRoom: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const where: any = { id: reference.id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.dealRoom.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
  },
  Quote: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const where: any = { quoteId: reference.id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.quoteProjection.findFirst({ where });
      return mapQuoteProjection(record);
    },
  },
  Competitor: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const where: any = { id: reference.id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.competitor.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
  },
};
