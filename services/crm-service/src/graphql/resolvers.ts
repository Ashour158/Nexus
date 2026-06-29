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

export const resolvers = {
  DateTime,
  JSON: JSONScalar,
  Query: {
    async contacts(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const records = await ctx.prisma.contact.findMany({ where, take: Math.min(limit, 100), skip: offset });
      return records.map(mapRecord);
    },
    async contact(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where: any = { id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.contact.findFirst({ where });
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
    async deals(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const records = await ctx.prisma.deal.findMany({ where, take: Math.min(limit, 100), skip: offset });
      return records.map(mapRecord);
    },
    async deal(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where: any = { id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.deal.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
    async activities(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const records = await ctx.prisma.activity.findMany({ where, take: Math.min(limit, 100), skip: offset });
      return records.map(mapRecord);
    },
    async activity(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where: any = { id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.activity.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
    async pipelines(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const records = await ctx.prisma.pipeline.findMany({ where, take: Math.min(limit, 100), skip: offset });
      return records.map(mapRecord);
    },
    async pipeline(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where: any = { id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.pipeline.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
    async stages(_parent: unknown, { pipelineId }: { pipelineId: string }, ctx: GraphQLContext) {
      const where: any = { pipelineId };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const records = await ctx.prisma.stage.findMany({ where });
      return records.map(mapRecord);
    },
    async stage(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where: any = { id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.stage.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
    async notes(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const records = await ctx.prisma.note.findMany({ where, take: Math.min(limit, 100), skip: offset });
      return records.map(mapRecord);
    },
    async note(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where: any = { id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.note.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
    async leads(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const records = await ctx.prisma.lead.findMany({ where, take: Math.min(limit, 100), skip: offset });
      return records.map(mapRecord);
    },
    async lead(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where: any = { id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.lead.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
  },
  Mutation: {
    async createContact(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const data = { ...input, tenantId: input.tenantId ?? ctx.tenantId ?? '' };
      const record = await ctx.prisma.contact.create({ data });
      return mapRecord(record);
    },
    async updateContact(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.contact.updateMany({ where, data: input });
      if (count === 0) throw new Error('NOT_FOUND');
      return mapRecord(await ctx.prisma.contact.findUnique({ where: { id } }));
    },
    async deleteContact(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.contact.deleteMany({ where });
      if (count === 0) throw new Error('NOT_FOUND');
      return true;
    },
    async createAccount(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const data = { ...input, tenantId: input.tenantId ?? ctx.tenantId ?? '' };
      const record = await ctx.prisma.account.create({ data });
      return mapRecord(record);
    },
    async updateAccount(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.account.updateMany({ where, data: input });
      if (count === 0) throw new Error('NOT_FOUND');
      return mapRecord(await ctx.prisma.account.findUnique({ where: { id } }));
    },
    async deleteAccount(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.account.deleteMany({ where });
      if (count === 0) throw new Error('NOT_FOUND');
      return true;
    },
    async createDeal(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const data = { ...input, tenantId: input.tenantId ?? ctx.tenantId ?? '' };
      const record = await ctx.prisma.deal.create({ data });
      return mapRecord(record);
    },
    async updateDeal(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.deal.updateMany({ where, data: input });
      if (count === 0) throw new Error('NOT_FOUND');
      return mapRecord(await ctx.prisma.deal.findUnique({ where: { id } }));
    },
    async deleteDeal(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.deal.deleteMany({ where });
      if (count === 0) throw new Error('NOT_FOUND');
      return true;
    },
    async createActivity(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const data = { ...input, tenantId: input.tenantId ?? ctx.tenantId ?? '' };
      const record = await ctx.prisma.activity.create({ data });
      return mapRecord(record);
    },
    async updateActivity(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.activity.updateMany({ where, data: input });
      if (count === 0) throw new Error('NOT_FOUND');
      return mapRecord(await ctx.prisma.activity.findUnique({ where: { id } }));
    },
    async deleteActivity(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.activity.deleteMany({ where });
      if (count === 0) throw new Error('NOT_FOUND');
      return true;
    },
    async createPipeline(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const data = { ...input, tenantId: input.tenantId ?? ctx.tenantId ?? '' };
      const record = await ctx.prisma.pipeline.create({ data });
      return mapRecord(record);
    },
    async updatePipeline(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.pipeline.updateMany({ where, data: input });
      if (count === 0) throw new Error('NOT_FOUND');
      return mapRecord(await ctx.prisma.pipeline.findUnique({ where: { id } }));
    },
    async deletePipeline(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.pipeline.deleteMany({ where });
      if (count === 0) throw new Error('NOT_FOUND');
      return true;
    },
    async createStage(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const data = { ...input, tenantId: input.tenantId ?? ctx.tenantId ?? '' };
      const record = await ctx.prisma.stage.create({ data });
      return mapRecord(record);
    },
    async updateStage(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.stage.updateMany({ where, data: input });
      if (count === 0) throw new Error('NOT_FOUND');
      return mapRecord(await ctx.prisma.stage.findUnique({ where: { id } }));
    },
    async deleteStage(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.stage.deleteMany({ where });
      if (count === 0) throw new Error('NOT_FOUND');
      return true;
    },
    async createNote(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const data = { ...input, tenantId: input.tenantId ?? ctx.tenantId ?? '' };
      const record = await ctx.prisma.note.create({ data });
      return mapRecord(record);
    },
    async updateNote(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.note.updateMany({ where, data: input });
      if (count === 0) throw new Error('NOT_FOUND');
      return mapRecord(await ctx.prisma.note.findUnique({ where: { id } }));
    },
    async deleteNote(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.note.deleteMany({ where });
      if (count === 0) throw new Error('NOT_FOUND');
      return true;
    },
    async createLead(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const data = { ...input, tenantId: input.tenantId ?? ctx.tenantId ?? '' };
      const record = await ctx.prisma.lead.create({ data });
      return mapRecord(record);
    },
    async updateLead(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.lead.updateMany({ where, data: input });
      if (count === 0) throw new Error('NOT_FOUND');
      return mapRecord(await ctx.prisma.lead.findUnique({ where: { id } }));
    },
    async deleteLead(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.lead.deleteMany({ where });
      if (count === 0) throw new Error('NOT_FOUND');
      return true;
    },
  },
  Contact: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const where: any = { id: reference.id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.contact.findFirst({ where });
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
  Deal: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const where: any = { id: reference.id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.deal.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
  },
  Activity: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const where: any = { id: reference.id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.activity.findFirst({ where });
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
  Note: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const where: any = { id: reference.id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.note.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
  },
  Lead: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const where: any = { id: reference.id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.lead.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
  },
};
