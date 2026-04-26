import type { ClickHouseClient } from '@clickhouse/client';

/**
 * Pipeline analytics from `deal_events` (ClickHouse).
 * `stageName` in funnel rows is intentionally blank — the web app resolves labels via crm-service using `stageId`.
 */
export function createPipelineAnalyticsService(client: ClickHouseClient) {
  return {
    async getPipelineSummary(
      tenantId: string,
      pipelineId?: string
    ): Promise<{
      totalDeals: number;
      totalValue: number;
      avgDealSize: number;
      avgDaysInPipeline: number;
    }> {
      const filter = pipelineId ? `AND pipeline_id = {pipelineId:String}` : '';
      const params = pipelineId ? { tenantId, pipelineId } : { tenantId };
      const res = await client.query({
        query: `
          WITH
            created AS (
              SELECT deal_id, min(occurred_at) AS created_at
              FROM deal_events
              WHERE tenant_id = {tenantId:String} ${filter}
                AND event_type = 'deal.created'
              GROUP BY deal_id
            ),
            closed AS (
              SELECT deal_id, max(occurred_at) AS closed_at
              FROM deal_events
              WHERE tenant_id = {tenantId:String} ${filter}
                AND event_type IN ('deal.won', 'deal.lost')
              GROUP BY deal_id
            ),
            deal_amount AS (
              SELECT deal_id, argMax(amount, occurred_at) AS amount
              FROM deal_events
              WHERE tenant_id = {tenantId:String} ${filter}
              GROUP BY deal_id
            )
          SELECT
            countDistinct(cl.deal_id) AS totalDeals,
            sum(da.amount) AS totalValue,
            if(
              countDistinct(cl.deal_id) = 0,
              0,
              sum(da.amount) / countDistinct(cl.deal_id)
            ) AS avgDealSize,
            avg(dateDiff('day', c.created_at, cl.closed_at)) AS avgDaysInPipeline
          FROM closed cl
          INNER JOIN created c ON c.deal_id = cl.deal_id
          INNER JOIN deal_amount da ON da.deal_id = cl.deal_id
        `,
        format: 'JSONEachRow',
        query_params: params,
      });
      const row = ((await res.json()) as Array<Record<string, string | number>>)[0] ?? {};
      return {
        totalDeals: Number(row.totalDeals ?? 0),
        totalValue: Number(row.totalValue ?? 0),
        avgDealSize: Number(row.avgDealSize ?? 0),
        avgDaysInPipeline: Number(row.avgDaysInPipeline ?? 0),
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
        stageName: '',
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
          WITH stage_entries AS (
            SELECT
              deal_id,
              stage_id,
              occurred_at AS entered_at,
              lead(occurred_at) OVER (PARTITION BY deal_id ORDER BY occurred_at ASC) AS exited_at
            FROM deal_events
            WHERE tenant_id = {tenantId:String}
              AND occurred_at >= parseDateTime64BestEffort({from:String})
              AND occurred_at <= parseDateTime64BestEffort({to:String})
              AND event_type IN ('deal.created', 'deal.stage_changed', 'deal.won', 'deal.lost')
          )
          SELECT
            stage_id AS stageId,
            avg(dateDiff('hour', entered_at, exited_at)) / 24.0 AS avgDays
          FROM stage_entries
          WHERE exited_at IS NOT NULL AND exited_at != entered_at
          GROUP BY stage_id
        `,
        format: 'JSONEachRow',
        query_params: { tenantId, from: period.from, to: period.to },
      });
      const rows = (await res.json()) as Array<Record<string, string | number>>;
      const avgDaysPerStage: Record<string, number> = {};
      let sumClose = 0;
      let nClose = 0;
      rows.forEach((r) => {
        const sid = String(r.stageId ?? '');
        const d = Number(r.avgDays ?? 0);
        avgDaysPerStage[sid] = d;
        sumClose += d;
        nClose += 1;
      });
      return {
        avgDaysToClose: nClose > 0 ? sumClose / nClose : 0,
        avgDaysPerStage,
      };
    },
  };
}
