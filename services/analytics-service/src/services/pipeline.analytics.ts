import type { ClickHouseClient } from '@clickhouse/client';

export function createPipelineAnalyticsService(client: ClickHouseClient) {
  return {
    async getPipelineSummary(tenantId: string, pipelineId?: string): Promise<{
      totalDeals: number;
      totalValue: number;
      avgDealSize: number;
      avgDaysInPipeline: number;
    }> {
      const filter = pipelineId ? `AND pipeline_id = {pipelineId:String}` : '';
      const params = pipelineId ? { tenantId, pipelineId } : { tenantId };
      const res = await client.query({
        query: `
          SELECT
            countDistinct(deal_id) AS totalDeals,
            sum(amount) AS totalValue,
            if(totalDeals = 0, 0, totalValue / totalDeals) AS avgDealSize
          FROM deal_events
          WHERE tenant_id = {tenantId:String} ${filter}
        `,
        format: 'JSONEachRow',
        query_params: params,
      });
      const row = ((await res.json()) as Array<Record<string, string | number>>)[0] ?? {};
      return {
        totalDeals: Number(row.totalDeals ?? 0),
        totalValue: Number(row.totalValue ?? 0),
        avgDealSize: Number(row.avgDealSize ?? 0),
        avgDaysInPipeline: 0,
      };
    },

    async getFunnelConversion(
      tenantId: string,
      period: { from: string; to: string }
    ): Promise<
      Array<{
        stageId: string;
        stageName: string;
        count: number;
        value: number;
        conversionRate: number;
      }>
    > {
      const res = await client.query({
        query: `
          SELECT stage_id AS stageId, countDistinct(deal_id) AS count, sum(amount) AS value
          FROM deal_events
          WHERE tenant_id = {tenantId:String}
            AND occurred_at >= parseDateTime64BestEffort({from:String})
            AND occurred_at <= parseDateTime64BestEffort({to:String})
          GROUP BY stage_id
          ORDER BY count DESC
        `,
        format: 'JSONEachRow',
        query_params: { tenantId, from: period.from, to: period.to },
      });
      const rows = (await res.json()) as Array<Record<string, string | number>>;
      const max = Math.max(1, ...rows.map((r) => Number(r.count ?? 0)));
      return rows.map((r) => ({
        stageId: String(r.stageId ?? ''),
        stageName: String(r.stageId ?? ''),
        count: Number(r.count ?? 0),
        value: Number(r.value ?? 0),
        conversionRate: (Number(r.count ?? 0) / max) * 100,
      }));
    },

    async getDealVelocity(
      tenantId: string,
      period: { from: string; to: string }
    ): Promise<{ avgDaysToClose: number; avgDaysPerStage: Record<string, number> }> {
      const res = await client.query({
        query: `
          SELECT stage_id AS stageId, avg(1.0) AS avgDays
          FROM deal_events
          WHERE tenant_id = {tenantId:String}
            AND occurred_at >= parseDateTime64BestEffort({from:String})
            AND occurred_at <= parseDateTime64BestEffort({to:String})
          GROUP BY stage_id
        `,
        format: 'JSONEachRow',
        query_params: { tenantId, from: period.from, to: period.to },
      });
      const rows = (await res.json()) as Array<Record<string, string | number>>;
      const avgDaysPerStage: Record<string, number> = {};
      rows.forEach((r) => {
        avgDaysPerStage[String(r.stageId ?? '')] = Number(r.avgDays ?? 0);
      });
      return { avgDaysToClose: 0, avgDaysPerStage };
    },
  };
}
