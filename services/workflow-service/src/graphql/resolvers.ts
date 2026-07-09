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
    async workflowTemplates(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      return ctx.prisma.workflowTemplate.findMany({ where: tenantListWhere(ctx), take: Math.min(limit, 100), skip: offset });
    },
    async workflowTemplate(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      return ctx.prisma.workflowTemplate.findFirst({ where: tenantFirstWhere(id, ctx) });
    },
    async workflowExecutions(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      return ctx.prisma.workflowExecution.findMany({ where: tenantListWhere(ctx), take: Math.min(limit, 100), skip: offset });
    },
    async workflowExecution(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      return ctx.prisma.workflowExecution.findFirst({ where: tenantFirstWhere(id, ctx) });
    },
    async journeys(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      return ctx.prisma.journey.findMany({ where: tenantListWhere(ctx), take: Math.min(limit, 100), skip: offset });
    },
    async journey(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      return ctx.prisma.journey.findFirst({ where: tenantFirstWhere(id, ctx) });
    },
    async journeyEnrollments(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      return ctx.prisma.journeyEnrollment.findMany({ where: tenantListWhere(ctx), take: Math.min(limit, 100), skip: offset });
    },
    async journeyEnrollment(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      return ctx.prisma.journeyEnrollment.findFirst({ where: tenantFirstWhere(id, ctx) });
    },
  },
  Mutation: {
    async createWorkflowTemplate(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      return ctx.prisma.workflowTemplate.create({ data: input });
    },
    async updateWorkflowTemplate(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      return ctx.prisma.workflowTemplate.update({ where: tenantUpdateWhere(id, ctx), data: input });
    },
    async deleteWorkflowTemplate(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.workflowTemplate.delete({ where: tenantUpdateWhere(id, ctx) });
      return true;
    },
    async createWorkflowExecution(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      return ctx.prisma.workflowExecution.create({ data: input });
    },
    async updateWorkflowExecution(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      return ctx.prisma.workflowExecution.update({ where: tenantUpdateWhere(id, ctx), data: input });
    },
    async deleteWorkflowExecution(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.workflowExecution.delete({ where: tenantUpdateWhere(id, ctx) });
      return true;
    },
    async createJourney(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      return ctx.prisma.journey.create({ data: input });
    },
    async updateJourney(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      return ctx.prisma.journey.update({ where: tenantUpdateWhere(id, ctx), data: input });
    },
    async deleteJourney(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.journey.delete({ where: tenantUpdateWhere(id, ctx) });
      return true;
    },
    async createJourneyEnrollment(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      return ctx.prisma.journeyEnrollment.create({ data: input });
    },
    async updateJourneyEnrollment(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      return ctx.prisma.journeyEnrollment.update({ where: { id }, data: input });
    },
    async deleteJourneyEnrollment(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.journeyEnrollment.delete({ where: { id } });
      return true;
    },
  },
  WorkflowTemplate: {
    async executions(parent: any, _args: unknown, ctx: GraphQLContext) {
      return ctx.prisma.workflowExecution.findMany({ where: { workflowId: parent.id } });
    },
  },
  WorkflowExecution: {
    async workflow(parent: any, _args: unknown, ctx: GraphQLContext) {
      return ctx.prisma.workflowTemplate.findUnique({ where: { id: parent.workflowId } });
    },
    async steps(parent: any, _args: unknown, ctx: GraphQLContext) {
      return ctx.prisma.workflowStep.findMany({ where: { executionId: parent.id } });
    },
    async branchChildren(parent: any, _args: unknown, ctx: GraphQLContext) {
      return ctx.prisma.workflowExecution.findMany({ where: { parentExecId: parent.id } });
    },
  },
  Journey: {
    async enrollments(parent: any, _args: unknown, ctx: GraphQLContext) {
      return ctx.prisma.journeyEnrollment.findMany({ where: { journeyId: parent.id } });
    },
  },
  JourneyEnrollment: {
    async journey(parent: any, _args: unknown, ctx: GraphQLContext) {
      return ctx.prisma.journey.findUnique({ where: { id: parent.journeyId } });
    },
  },
};
