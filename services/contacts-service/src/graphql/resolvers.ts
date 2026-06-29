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
    async consentRecords(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const records = await ctx.prisma.consentRecord.findMany({ where, take: Math.min(limit, 100), skip: offset });
      return records.map(mapRecord);
    },
    async consentRecord(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where: any = { id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.consentRecord.findFirst({ where });
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
    async companies(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const records = await ctx.prisma.company.findMany({ where, take: Math.min(limit, 100), skip: offset });
      return records.map(mapRecord);
    },
    async company(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where: any = { id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.company.findFirst({ where });
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
    async createConsentRecord(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const data = { ...input, tenantId: input.tenantId ?? ctx.tenantId ?? '' };
      const record = await ctx.prisma.consentRecord.create({ data });
      return mapRecord(record);
    },
    async updateConsentRecord(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.consentRecord.updateMany({ where, data: input });
      if (count === 0) throw new Error('NOT_FOUND');
      return mapRecord(await ctx.prisma.consentRecord.findUnique({ where: { id } }));
    },
    async deleteConsentRecord(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.consentRecord.deleteMany({ where });
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
    async createCompany(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const data = { ...input, tenantId: input.tenantId ?? ctx.tenantId ?? '' };
      const record = await ctx.prisma.company.create({ data });
      return mapRecord(record);
    },
    async updateCompany(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.company.updateMany({ where, data: input });
      if (count === 0) throw new Error('NOT_FOUND');
      return mapRecord(await ctx.prisma.company.findUnique({ where: { id } }));
    },
    async deleteCompany(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.company.deleteMany({ where });
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
  },
  Contact: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const where: any = { id: reference.id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.contact.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
  },
  ConsentRecord: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const where: any = { id: reference.id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.consentRecord.findFirst({ where });
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
  Company: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const where: any = { id: reference.id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.company.findFirst({ where });
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
};
