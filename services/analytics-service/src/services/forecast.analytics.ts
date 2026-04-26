import type { ClickHouseClient } from '@clickhouse/client';
import { Decimal } from 'decimal.js';

interface DealRow {
  deal_id: string;
  amount: string | number | null;
  stage_probability: string | number | null;
  owner_id: string;
  forecast_category: string | null;
  close_month: string | null;
}

export interface ForecastData {
  weightedPipeline: string;
  totalPipeline: string;
  winRate: string;
  forecastByMonth: Array<{
    month: string;
    weighted: string;
    total: string;
  }>;
}

export function createForecastAnalyticsService(client: ClickHouseClient) {
  return {
    async getWeightedPipeline(tenantId: string): Promise<ForecastData> {
      const res = await client.query({
        query: `
          SELECT
            deal_id,
            amount,
            stage_probability,
            owner_id,
            forecast_category,
            toStartOfMonth(expected_close_date) AS close_month
          FROM deals
          WHERE tenant_id = {tenantId:String}
            AND status = 'OPEN'
            AND expected_close_date IS NOT NULL
        `,
        format: 'JSONEachRow',
        query_params: { tenantId },
      });
      const deals = await res.json<DealRow>();

      let weightedPipeline = new Decimal(0);
      let totalPipeline = new Decimal(0);
      const byMonth: Record<string, { weighted: Decimal; total: Decimal }> = {};

      for (const deal of deals) {
        const amount = new Decimal(deal.amount ?? 0);
        const probability = new Decimal(deal.stage_probability ?? 0).div(100);
        const weighted = amount.mul(probability);
        weightedPipeline = weightedPipeline.plus(weighted);
        totalPipeline = totalPipeline.plus(amount);
        const month = deal.close_month ?? 'unknown';
        byMonth[month] = byMonth[month] ?? {
          weighted: new Decimal(0),
          total: new Decimal(0),
        };
        byMonth[month].weighted = byMonth[month].weighted.plus(weighted);
        byMonth[month].total = byMonth[month].total.plus(amount);
      }

      const winRateResult = await client.query({
        query: `
          SELECT
            countIf(status = 'WON') AS won,
            countIf(status IN ('WON', 'LOST')) AS total
          FROM deals
          WHERE tenant_id = {tenantId:String}
            AND actual_close_date >= now() - INTERVAL 12 MONTH
        `,
        format: 'JSONEachRow',
        query_params: { tenantId },
      });
      const [winRow] = await winRateResult.json<{ won: number; total: number }>();
      const winRate =
        winRow && winRow.total > 0
          ? new Decimal(winRow.won).div(winRow.total)
          : new Decimal(0.25);

      return {
        weightedPipeline: weightedPipeline.toFixed(2),
        totalPipeline: totalPipeline.toFixed(2),
        winRate: winRate.toFixed(4),
        forecastByMonth: Object.entries(byMonth)
          .map(([month, values]) => ({
            month,
            weighted: values.weighted.toFixed(2),
            total: values.total.toFixed(2),
          }))
          .sort((a, b) => a.month.localeCompare(b.month)),
      };
    },
  };
}
