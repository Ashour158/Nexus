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
    async accountHealthScores(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const records = await ctx.prisma.accountHealthScore.findMany({ where, take: Math.min(limit, 100), skip: offset });
      return records.map(mapRecord);
    },
    async accountHealthScore(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where: any = { id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.accountHealthScore.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
  },
  Mutation: {
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
    async createAccountHealthScore(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const data = { ...input, tenantId: input.tenantId ?? ctx.tenantId ?? '' };
      const record = await ctx.prisma.accountHealthScore.create({ data });
      return mapRecord(record);
    },
    async updateAccountHealthScore(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.accountHealthScore.updateMany({ where, data: input });
      if (count === 0) throw new Error('NOT_FOUND');
      return mapRecord(await ctx.prisma.accountHealthScore.findUnique({ where: { id } }));
    },
    async deleteAccountHealthScore(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { id, tenantId: ctx.tenantId } : { id };
      const { count } = await ctx.prisma.accountHealthScore.deleteMany({ where });
      if (count === 0) throw new Error('NOT_FOUND');
      return true;
    },
  },
  Account: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const where: any = { id: reference.id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.account.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
    async healthRecord(parent: any, _args: unknown, ctx: GraphQLContext) {
      const record = await ctx.prisma.accountHealthScore.findUnique({ where: { accountId: parent.id } });
      return record ? mapRecord(record) : null;
    },
  },
  AccountHealthScore: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const where: any = { id: reference.id };
      if (ctx.tenantId) where.tenantId = ctx.tenantId;
      const record = await ctx.prisma.accountHealthScore.findFirst({ where });
      return record ? mapRecord(record) : null;
    },
  },
};
