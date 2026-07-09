import type { GraphQLContext } from './context.js';

export const resolvers = {
  Query: {
    async pipelineAnalytics(_parent: unknown, { tenantId, pipelineId }: { tenantId: string; pipelineId?: string }, _ctx: GraphQLContext) {
      return {
        id: `pipeline-${tenantId}-${pipelineId ?? 'all'}`,
        tenantId,
        pipelineId: pipelineId ?? null,
        totalDeals: 0,
        totalValue: '0',
        avgDealSize: '0',
        winRate: '0',
        avgSalesCycleDays: 0,
        stageBreakdown: {},
        updatedAt: new Date().toISOString(),
      };
    },
    async revenueAnalytics(_parent: unknown, { tenantId, period }: { tenantId: string; period: string }, _ctx: GraphQLContext) {
      return {
        id: `revenue-${tenantId}-${period}`,
        tenantId,
        period,
        revenue: '0',
        newRevenue: '0',
        expansionRevenue: '0',
        churnedRevenue: '0',
        netRevenueRetention: '0',
        updatedAt: new Date().toISOString(),
      };
    },
    async activityAnalytics(_parent: unknown, { tenantId, ownerId }: { tenantId: string; ownerId?: string }, _ctx: GraphQLContext) {
      return {
        id: `activity-${tenantId}-${ownerId ?? 'all'}`,
        tenantId,
        ownerId: ownerId ?? null,
        totalActivities: 0,
        emailsSent: 0,
        callsMade: 0,
        meetingsHeld: 0,
        tasksCompleted: 0,
        updatedAt: new Date().toISOString(),
      };
    },
    async forecastAnalytics(_parent: unknown, { tenantId, period }: { tenantId: string; period: string }, _ctx: GraphQLContext) {
      return {
        id: `forecast-${tenantId}-${period}`,
        tenantId,
        period,
        weightedForecast: '0',
        bestCaseForecast: '0',
        commitForecast: '0',
        pipelineCoverage: '0',
        updatedAt: new Date().toISOString(),
      };
    },
    async analyticsHealth() {
      return { status: 'ok', service: 'analytics-service' };
    },
  },
  Mutation: {
    async trackEvent() {
      return true;
    },
  },
};
