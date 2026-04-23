import type { ClickHouseClient } from '@clickhouse/client';

export function createRevenueAnalyticsService(client: ClickHouseClient) {
  return {
    async getRevenueSummary(
      tenantId: string,
      period: { year: number; quarter?: number }
    ): Promise<{
      totalRevenue: number;
      wonDeals: number;
      lostDeals: number;
      winRate: number;
      avgSalePrice: number;
    }> {
      const startMonth = period.quarter ? (period.quarter - 1) * 3 + 1 : 1;
      const endMonth = period.quarter ? startMonth + 2 : 12;
      const from = `${period.year}-${String(startMonth).padStart(2, '0')}-01T00:00:00Z`;
      const to = `${period.year}-${String(endMonth).padStart(2, '0')}-31T23:59:59Z`;
      const res = await client.query({
        query: `
          SELECT
            sumIf(amount, event_type = 'deal.won') AS totalRevenue,
            countIf(event_type = 'deal.won') AS wonDeals,
            countIf(event_type = 'deal.lost') AS lostDeals
          FROM deal_events
          WHERE tenant_id = {tenantId:String}
            AND occurred_at >= parseDateTime64BestEffort({from:String})
            AND occurred_at <= parseDateTime64BestEffort({to:String})
        `,
        format: 'JSONEachRow',
        query_params: { tenantId, from, to },
      });
      const row = ((await res.json()) as Array<Record<string, string | number>>)[0] ?? {};
      const wonDeals = Number(row.wonDeals ?? 0);
      const lostDeals = Number(row.lostDeals ?? 0);
      const totalRevenue = Number(row.totalRevenue ?? 0);
      const totalClosed = wonDeals + lostDeals;
      return {
        totalRevenue,
        wonDeals,
        lostDeals,
        winRate: totalClosed > 0 ? (wonDeals / totalClosed) * 100 : 0,
        avgSalePrice: wonDeals > 0 ? totalRevenue / wonDeals : 0,
      };
    },

    async getRevenueByRep(
      tenantId: string,
      period: { year: number; quarter?: number }
    ): Promise<Array<{ ownerId: string; totalRevenue: number; wonDeals: number; winRate: number }>> {
      const startMonth = period.quarter ? (period.quarter - 1) * 3 + 1 : 1;
      const endMonth = period.quarter ? startMonth + 2 : 12;
      const from = `${period.year}-${String(startMonth).padStart(2, '0')}-01T00:00:00Z`;
      const to = `${period.year}-${String(endMonth).padStart(2, '0')}-31T23:59:59Z`;
      const res = await client.query({
        query: `
          SELECT
            owner_id AS ownerId,
            sumIf(amount, event_type = 'deal.won') AS totalRevenue,
            countIf(event_type = 'deal.won') AS wonDeals,
            countIf(event_type = 'deal.lost') AS lostDeals
          FROM deal_events
          WHERE tenant_id = {tenantId:String}
            AND occurred_at >= parseDateTime64BestEffort({from:String})
            AND occurred_at <= parseDateTime64BestEffort({to:String})
          GROUP BY owner_id
          ORDER BY totalRevenue DESC
        `,
        format: 'JSONEachRow',
        query_params: { tenantId, from, to },
      });
      const rows = (await res.json()) as Array<Record<string, string | number>>;
      return rows.map((r) => {
        const won = Number(r.wonDeals ?? 0);
        const lost = Number(r.lostDeals ?? 0);
        const total = won + lost;
        return {
          ownerId: String(r.ownerId ?? ''),
          totalRevenue: Number(r.totalRevenue ?? 0),
          wonDeals: won,
          winRate: total > 0 ? (won / total) * 100 : 0,
        };
      });
    },
  };
}
