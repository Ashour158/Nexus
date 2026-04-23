import type { ClickHouseClient } from '@clickhouse/client';

export function createForecastAnalyticsService(client: ClickHouseClient) {
  return {
    async getWeightedPipeline(tenantId: string) {
      const res = await client.query({
        query: `
          SELECT sum(amount) AS pipelineValue
          FROM deal_events
          WHERE tenant_id = {tenantId:String}
            AND event_type IN ('deal.created', 'deal.updated', 'deal.stage_changed')
        `,
        format: 'JSONEachRow',
        query_params: { tenantId },
      });
      const row = ((await res.json()) as Array<Record<string, string | number>>)[0] ?? {};
      const pipelineValue = Number(row.pipelineValue ?? 0);
      return {
        weightedPipeline: pipelineValue,
        commit: pipelineValue * 0.6,
        bestCase: pipelineValue * 0.9,
      };
    },
  };
}
