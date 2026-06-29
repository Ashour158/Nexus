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
    async cadenceTemplates(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      return ctx.prisma.cadenceTemplate.findMany({ where: tenantListWhere(ctx), take: Math.min(limit, 100), skip: offset });
    },
    async cadenceTemplate(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      return ctx.prisma.cadenceTemplate.findFirst({ where: tenantFirstWhere(id, ctx) });
    },
    async cadenceSteps(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      return ctx.prisma.cadenceStep.findMany({ take: Math.min(limit, 100), skip: offset });
    },
    async cadenceStep(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      return ctx.prisma.cadenceStep.findUnique({ where: { id } });
    },
    async cadenceEnrollments(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      return ctx.prisma.cadenceEnrollment.findMany({ where: tenantListWhere(ctx), take: Math.min(limit, 100), skip: offset });
    },
    async cadenceEnrollment(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      return ctx.prisma.cadenceEnrollment.findFirst({ where: tenantFirstWhere(id, ctx) });
    },
    async stepExecutions(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      return ctx.prisma.stepExecution.findMany({ take: Math.min(limit, 100), skip: offset });
    },
    async stepExecution(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      return ctx.prisma.stepExecution.findUnique({ where: { id } });
    },
  },
  Mutation: {
    async createCadenceTemplate(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      return ctx.prisma.cadenceTemplate.create({ data: input });
    },
    async updateCadenceTemplate(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      return ctx.prisma.cadenceTemplate.update({ where: tenantUpdateWhere(id, ctx), data: input });
    },
    async deleteCadenceTemplate(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.cadenceTemplate.delete({ where: tenantUpdateWhere(id, ctx) });
      return true;
    },
    async createCadenceStep(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      return ctx.prisma.cadenceStep.create({ data: input });
    },
    async updateCadenceStep(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      return ctx.prisma.cadenceStep.update({ where: { id }, data: input });
    },
    async deleteCadenceStep(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.cadenceStep.delete({ where: { id } });
      return true;
    },
    async createCadenceEnrollment(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      return ctx.prisma.cadenceEnrollment.create({ data: input });
    },
    async updateCadenceEnrollment(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      return ctx.prisma.cadenceEnrollment.update({ where: tenantUpdateWhere(id, ctx), data: input });
    },
    async deleteCadenceEnrollment(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.cadenceEnrollment.delete({ where: tenantUpdateWhere(id, ctx) });
      return true;
    },
    async createStepExecution(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      return ctx.prisma.stepExecution.create({ data: input });
    },
    async updateStepExecution(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      return ctx.prisma.stepExecution.update({ where: { id }, data: input });
    },
    async deleteStepExecution(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.stepExecution.delete({ where: { id } });
      return true;
    },
  },
  CadenceTemplate: {
    async steps(parent: any, _args: unknown, ctx: GraphQLContext) {
      return ctx.prisma.cadenceStep.findMany({ where: { cadenceId: parent.id } });
    },
    async enrollments(parent: any, _args: unknown, ctx: GraphQLContext) {
      return ctx.prisma.cadenceEnrollment.findMany({ where: { cadenceId: parent.id } });
    },
  },
  CadenceStep: {
    async cadence(parent: any, _args: unknown, ctx: GraphQLContext) {
      return ctx.prisma.cadenceTemplate.findUnique({ where: { id: parent.cadenceId } });
    },
  },
  CadenceEnrollment: {
    async cadence(parent: any, _args: unknown, ctx: GraphQLContext) {
      return ctx.prisma.cadenceTemplate.findUnique({ where: { id: parent.cadenceId } });
    },
    async executions(parent: any, _args: unknown, ctx: GraphQLContext) {
      return ctx.prisma.stepExecution.findMany({ where: { enrollmentId: parent.id } });
    },
  },
  StepExecution: {
    async enrollment(parent: any, _args: unknown, ctx: GraphQLContext) {
      return ctx.prisma.cadenceEnrollment.findUnique({ where: { id: parent.enrollmentId } });
    },
  },
};
