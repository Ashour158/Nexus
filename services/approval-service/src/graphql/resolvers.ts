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
    async approvalPolicies(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      return ctx.prisma.approvalPolicy.findMany({ where: tenantListWhere(ctx), take: Math.min(limit, 100), skip: offset });
    },
    async approvalPolicy(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      return ctx.prisma.approvalPolicy.findFirst({ where: tenantFirstWhere(id, ctx) });
    },
    async approvalRequests(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      return ctx.prisma.approvalRequest.findMany({ where: tenantListWhere(ctx), take: Math.min(limit, 100), skip: offset });
    },
    async approvalRequest(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      return ctx.prisma.approvalRequest.findFirst({ where: tenantFirstWhere(id, ctx) });
    },
    async approvalSteps(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      return ctx.prisma.approvalStep.findMany({ take: Math.min(limit, 100), skip: offset });
    },
    async approvalStep(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      return ctx.prisma.approvalStep.findUnique({ where: { id } });
    },
  },
  Mutation: {
    async createApprovalPolicy(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      return ctx.prisma.approvalPolicy.create({ data: input });
    },
    async updateApprovalPolicy(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      return ctx.prisma.approvalPolicy.update({ where: tenantUpdateWhere(id, ctx), data: input });
    },
    async deleteApprovalPolicy(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.approvalPolicy.delete({ where: tenantUpdateWhere(id, ctx) });
      return true;
    },
    async createApprovalRequest(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      return ctx.prisma.approvalRequest.create({ data: input });
    },
    async updateApprovalRequest(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      return ctx.prisma.approvalRequest.update({ where: tenantUpdateWhere(id, ctx), data: input });
    },
    async deleteApprovalRequest(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.approvalRequest.delete({ where: tenantUpdateWhere(id, ctx) });
      return true;
    },
    async createApprovalStep(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      return ctx.prisma.approvalStep.create({ data: input });
    },
    async updateApprovalStep(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      return ctx.prisma.approvalStep.update({ where: { id }, data: input });
    },
    async deleteApprovalStep(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.approvalStep.delete({ where: { id } });
      return true;
    },
  },
  ApprovalPolicy: {
    async requests(parent: any, _args: unknown, ctx: GraphQLContext) {
      return ctx.prisma.approvalRequest.findMany({ where: { policyId: parent.id } });
    },
  },
  ApprovalRequest: {
    async policy(parent: any, _args: unknown, ctx: GraphQLContext) {
      return ctx.prisma.approvalPolicy.findUnique({ where: { id: parent.policyId } });
    },
    async steps(parent: any, _args: unknown, ctx: GraphQLContext) {
      return ctx.prisma.approvalStep.findMany({ where: { requestId: parent.id } });
    },
  },
};
