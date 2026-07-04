import { GraphQLScalarType, Kind } from 'graphql';
import type { GraphQLContext } from './context.js';
import { computeLeadScore } from '../scoring.js';

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

export const resolvers = {
  DateTime,
  JSON: JSONScalar,
  Query: {
    async leads(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      // Exclude soft-deleted rows, matching the REST convention.
      const where: any = { deletedAt: null };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const records = await ctx.prisma.lead.findMany({ where, take: Math.min(limit, 100), skip: offset });
      return records.map(mapRecord);
    },
    async lead(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where: any = { id, deletedAt: null };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.lead.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
    async leadScores(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const records = await ctx.prisma.leadScore.findMany({ where, take: Math.min(limit, 100), skip: offset });
      return records.map(mapRecord);
    },
    async leadScore(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where: any = { id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.leadScore.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
    async leadScoringRules(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const records = await ctx.prisma.leadScoringRule.findMany({ where, take: Math.min(limit, 100), skip: offset });
      return records.map(mapRecord);
    },
    async leadScoringRule(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where: any = { id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.leadScoringRule.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
    async leadRoutingEvents(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const records = await ctx.prisma.leadRoutingEvent.findMany({ where, take: Math.min(limit, 100), skip: offset });
      return records.map(mapRecord);
    },
    async leadRoutingEvent(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where: any = { id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.leadRoutingEvent.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
  },
  Mutation: {
    async createLead(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const tenantId = input.tenantId ?? ctx.tenantId ?? '';
      // Configurable scoring rules drive the score (fail-open to a default).
      const score = await computeLeadScore(ctx.prisma, tenantId || null, input);
      const data = { ...input, tenantId, score };
      const record = await ctx.prisma.lead.create({ data });
      return mapRecord(record);
    },
    async updateLead(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const existing = await ctx.prisma.lead.findFirst({ where: { ...where, deletedAt: null } });
      if (!existing) throw new Error('NOT_FOUND');
      // Re-score using configurable rules over the merged (existing + patch) lead.
      const score = await computeLeadScore(ctx.prisma, ctx.tenantId, { ...existing, ...input });
      const { count } = await ctx.prisma.lead.updateMany({ where, data: { ...input, score } });
      if (count === 0) throw new Error('NOT_FOUND');
      return mapRecord(await ctx.prisma.lead.findUnique({ where: { id } }));
    },
    async deleteLead(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      // Soft-delete, matching the REST service behavior (was a hard deleteMany).
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.lead.updateMany({
        where: { ...where, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (count === 0) throw new Error('NOT_FOUND');
      return true;
    },
    async createLeadScore(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const data = { ...input, tenantId: input.tenantId ?? ctx.tenantId ?? '' };
      const record = await ctx.prisma.leadScore.create({ data });
      return mapRecord(record);
    },
    async updateLeadScore(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.leadScore.updateMany({ where, data: input });
      if (count === 0) throw new Error('NOT_FOUND');
      return mapRecord(await ctx.prisma.leadScore.findUnique({ where: { id } }));
    },
    async deleteLeadScore(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.leadScore.deleteMany({ where });
      if (count === 0) throw new Error('NOT_FOUND');
      return true;
    },
    async createLeadScoringRule(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const data = { ...input, tenantId: input.tenantId ?? ctx.tenantId ?? '' };
      const record = await ctx.prisma.leadScoringRule.create({ data });
      return mapRecord(record);
    },
    async updateLeadScoringRule(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.leadScoringRule.updateMany({ where, data: input });
      if (count === 0) throw new Error('NOT_FOUND');
      return mapRecord(await ctx.prisma.leadScoringRule.findUnique({ where: { id } }));
    },
    async deleteLeadScoringRule(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.leadScoringRule.deleteMany({ where });
      if (count === 0) throw new Error('NOT_FOUND');
      return true;
    },
    async createLeadRoutingEvent(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const data = { ...input, tenantId: input.tenantId ?? ctx.tenantId ?? '' };
      const record = await ctx.prisma.leadRoutingEvent.create({ data });
      return mapRecord(record);
    },
    async updateLeadRoutingEvent(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.leadRoutingEvent.updateMany({ where, data: input });
      if (count === 0) throw new Error('NOT_FOUND');
      return mapRecord(await ctx.prisma.leadRoutingEvent.findUnique({ where: { id } }));
    },
    async deleteLeadRoutingEvent(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.leadRoutingEvent.deleteMany({ where });
      if (count === 0) throw new Error('NOT_FOUND');
      return true;
    },
  },
  Lead: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const where: any = { id: reference.id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.lead.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
    async scoreRecord(parent: any, _args: unknown, ctx: GraphQLContext) {
      const record = await ctx.prisma.leadScore.findUnique({ where: { leadId: parent.id } });
      return record ? mapRecord(record) : null;
    },
  },
  LeadScore: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const where: any = { id: reference.id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.leadScore.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
  },
  LeadScoringRule: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const where: any = { id: reference.id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.leadScoringRule.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
  },
  LeadRoutingEvent: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const where: any = { id: reference.id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.leadRoutingEvent.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
  },
};
