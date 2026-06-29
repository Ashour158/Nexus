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
    async savedReports(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      return ctx.prisma.savedReport.findMany({ where: tenantListWhere(ctx), take: Math.min(limit, 100), skip: offset });
    },
    async savedReport(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      return ctx.prisma.savedReport.findFirst({ where: tenantFirstWhere(id, ctx) });
    },
    async reportSchedules(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      return ctx.prisma.reportSchedule.findMany({ where: tenantListWhere(ctx), take: Math.min(limit, 100), skip: offset });
    },
    async reportSchedule(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      return ctx.prisma.reportSchedule.findFirst({ where: tenantFirstWhere(id, ctx) });
    },
    async dashboards(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      return ctx.prisma.dashboard.findMany({ where: tenantListWhere(ctx), take: Math.min(limit, 100), skip: offset });
    },
    async dashboard(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      return ctx.prisma.dashboard.findFirst({ where: tenantFirstWhere(id, ctx) });
    },
    async dashboardWidgets(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      return ctx.prisma.dashboardWidget.findMany({ where: tenantListWhere(ctx), take: Math.min(limit, 100), skip: offset });
    },
    async dashboardWidget(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      return ctx.prisma.dashboardWidget.findFirst({ where: tenantFirstWhere(id, ctx) });
    },
    async pipelineSnapshots(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      return ctx.prisma.pipelineSnapshot.findMany({ where: tenantListWhere(ctx), take: Math.min(limit, 100), skip: offset });
    },
    async pipelineSnapshot(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      return ctx.prisma.pipelineSnapshot.findFirst({ where: tenantFirstWhere(id, ctx) });
    },
  },
  Mutation: {
    async createSavedReport(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      return ctx.prisma.savedReport.create({ data: input });
    },
    async updateSavedReport(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      return ctx.prisma.savedReport.update({ where: tenantUpdateWhere(id, ctx), data: input });
    },
    async deleteSavedReport(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.savedReport.delete({ where: tenantUpdateWhere(id, ctx) });
      return true;
    },
    async createReportSchedule(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      return ctx.prisma.reportSchedule.create({ data: input });
    },
    async updateReportSchedule(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      return ctx.prisma.reportSchedule.update({ where: tenantUpdateWhere(id, ctx), data: input });
    },
    async deleteReportSchedule(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.reportSchedule.delete({ where: tenantUpdateWhere(id, ctx) });
      return true;
    },
    async createDashboard(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      return ctx.prisma.dashboard.create({ data: input });
    },
    async updateDashboard(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      return ctx.prisma.dashboard.update({ where: tenantUpdateWhere(id, ctx), data: input });
    },
    async deleteDashboard(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.dashboard.delete({ where: tenantUpdateWhere(id, ctx) });
      return true;
    },
    async createDashboardWidget(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      return ctx.prisma.dashboardWidget.create({ data: input });
    },
    async updateDashboardWidget(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      return ctx.prisma.dashboardWidget.update({ where: tenantUpdateWhere(id, ctx), data: input });
    },
    async deleteDashboardWidget(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.dashboardWidget.delete({ where: tenantUpdateWhere(id, ctx) });
      return true;
    },
    async createPipelineSnapshot(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      return ctx.prisma.pipelineSnapshot.create({ data: input });
    },
    async updatePipelineSnapshot(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      return ctx.prisma.pipelineSnapshot.update({ where: tenantUpdateWhere(id, ctx), data: input });
    },
    async deletePipelineSnapshot(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.pipelineSnapshot.delete({ where: tenantUpdateWhere(id, ctx) });
      return true;
    },
  },
  SavedReport: {
    async schedules(parent: any, _args: unknown, ctx: GraphQLContext) {
      return ctx.prisma.reportSchedule.findMany({ where: { reportId: parent.id } });
    },
  },
  ReportSchedule: {
    async report(parent: any, _args: unknown, ctx: GraphQLContext) {
      return ctx.prisma.savedReport.findUnique({ where: { id: parent.reportId } });
    },
  },
  Dashboard: {
    async widgets(parent: any, _args: unknown, ctx: GraphQLContext) {
      return ctx.prisma.dashboardWidget.findMany({ where: { dashboardId: parent.id } });
    },
  },
  DashboardWidget: {
    async dashboard(parent: any, _args: unknown, ctx: GraphQLContext) {
      return ctx.prisma.dashboard.findUnique({ where: { id: parent.dashboardId } });
    },
  },
};
