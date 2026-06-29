import { GraphQLScalarType, Kind } from 'graphql';
import type { GraphQLContext } from './context.js';

const DateTimeScalar = new GraphQLScalarType({
  name: 'DateTime',
  description: 'DateTime scalar',
  parseValue(value) {
    if (typeof value === 'string' || typeof value === 'number') return new Date(value);
    return value;
  },
  serialize(value) {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') return value;
    return null;
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) return new Date(ast.value);
    return null;
  },
});

const JSONScalar = new GraphQLScalarType({
  name: 'JSON',
  description: 'JSON scalar',
  parseValue(value) {
    return value;
  },
  serialize(value) {
    return value;
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      try { return JSON.parse(ast.value); } catch { return null; }
    }
    return null;
  },
});

function tenantListWhere(ctx: GraphQLContext) {
  return ctx.tenantId ? { tenantId: ctx.tenantId } : {};
}

function tenantFirstWhere(id: string, ctx: GraphQLContext) {
  const where: any = { id };
  if (ctx.tenantId) where.tenantId = ctx.tenantId;
  return where;
}

function tenantUpdateWhere(id: string, ctx: GraphQLContext) {
  if (ctx.tenantId) return { id_tenantId: { id, tenantId: ctx.tenantId } };
  return { id };
}

export const resolvers = {
  DateTime: DateTimeScalar,
  JSON: JSONScalar,
  Query: {
    async territories(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      return ctx.prisma.territory.findMany({ where: tenantListWhere(ctx), take: Math.min(limit, 100), skip: offset });
    },
    async territory(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      return ctx.prisma.territory.findFirst({ where: tenantFirstWhere(id, ctx) });
    },
    async territoryRules(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      return ctx.prisma.territoryRule.findMany({ take: Math.min(limit, 100), skip: offset });
    },
    async territoryRule(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      return ctx.prisma.territoryRule.findUnique({ where: { id } });
    },
    async leadRoutingLogs(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      return ctx.prisma.leadRoutingLog.findMany({ where: tenantListWhere(ctx), take: Math.min(limit, 100), skip: offset });
    },
    async leadRoutingLog(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      return ctx.prisma.leadRoutingLog.findFirst({ where: tenantFirstWhere(id, ctx) });
    },
    async roundRobinStates(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      return ctx.prisma.roundRobinState.findMany({ where: tenantListWhere(ctx), take: Math.min(limit, 100), skip: offset });
    },
    async roundRobinState(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      return ctx.prisma.roundRobinState.findFirst({ where: tenantFirstWhere(id, ctx) });
    },
  },
  Mutation: {
    async createTerritory(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      return ctx.prisma.territory.create({ data: input });
    },
    async updateTerritory(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      return ctx.prisma.territory.update({ where: tenantUpdateWhere(id, ctx), data: input });
    },
    async deleteTerritory(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.territory.delete({ where: tenantUpdateWhere(id, ctx) });
      return true;
    },
    async createTerritoryRule(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      return ctx.prisma.territoryRule.create({ data: input });
    },
    async updateTerritoryRule(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      return ctx.prisma.territoryRule.update({ where: { id }, data: input });
    },
    async deleteTerritoryRule(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.territoryRule.delete({ where: { id } });
      return true;
    },
    async createLeadRoutingLog(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      return ctx.prisma.leadRoutingLog.create({ data: input });
    },
    async updateLeadRoutingLog(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      return ctx.prisma.leadRoutingLog.update({ where: tenantUpdateWhere(id, ctx), data: input });
    },
    async deleteLeadRoutingLog(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.leadRoutingLog.delete({ where: tenantUpdateWhere(id, ctx) });
      return true;
    },
    async createRoundRobinState(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      return ctx.prisma.roundRobinState.create({ data: input });
    },
    async updateRoundRobinState(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      return ctx.prisma.roundRobinState.update({ where: tenantUpdateWhere(id, ctx), data: input });
    },
    async deleteRoundRobinState(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.roundRobinState.delete({ where: tenantUpdateWhere(id, ctx) });
      return true;
    },
  },
  Territory: {
    async rules(parent: any, _args: unknown, ctx: GraphQLContext) {
      return ctx.prisma.territoryRule.findMany({ where: { territoryId: parent.id } });
    },
    async routingLogs(parent: any, _args: unknown, ctx: GraphQLContext) {
      return ctx.prisma.leadRoutingLog.findMany({ where: { matchedTerritoryId: parent.id } });
    },
  },
  TerritoryRule: {
    async territory(parent: any, _args: unknown, ctx: GraphQLContext) {
      return ctx.prisma.territory.findUnique({ where: { id: parent.territoryId } });
    },
  },
  LeadRoutingLog: {
    async territory(parent: any, _args: unknown, ctx: GraphQLContext) {
      if (!parent.matchedTerritoryId) return null;
      return ctx.prisma.territory.findUnique({ where: { id: parent.matchedTerritoryId } });
    },
  },
};
