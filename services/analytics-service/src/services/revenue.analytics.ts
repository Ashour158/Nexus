import type { ClickHouseClient } from '@clickhouse/client';

/**
 * Compute a half-open `[from, toExclusive)` UTC range for a full year or a
 * specific quarter.
 *
 * We deliberately return an EXCLUSIVE upper bound — the first instant of the
 * NEXT period — instead of naming the period's last day. The previous code built
 * the upper bound as `${year}-${endMonth}-31`, which yields non-existent dates
 * for 30-day quarter-end months (June 31 for Q2, Sept 31 for Q3). ClickHouse's
 * parser clamps those unpredictably, so Q2/Q3 revenue was silently mis-counted at
 * the boundary. By never naming a last day and comparing `occurred_at < toExclusive`,
 * no row is lost or double-counted at a period boundary.
 */
function periodRange(year: number, quarter?: number): { from: string; toExclusive: string } {
  const startMonth = quarter ? (quarter - 1) * 3 + 1 : 1; // 1-based first month
  const span = quarter ? 3 : 12; // number of months in the period
  const endExclusiveAbs = startMonth + span; // 1-based month index, may exceed 12
  const toYear = year + Math.floor((endExclusiveAbs - 1) / 12);
  const toMonth = ((endExclusiveAbs - 1) % 12) + 1;
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    from: `${year}-${pad(startMonth)}-01T00:00:00Z`,
    toExclusive: `${toYear}-${pad(toMonth)}-01T00:00:00Z`,
  };
}

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
      const { from, toExclusive } = periodRange(period.year, period.quarter);
      const res = await client.query({
        query: `
          SELECT
            sumIf(if(base_amount != 0, base_amount, amount), event_type = 'deal.won') AS totalRevenue,
            countIf(event_type = 'deal.won') AS wonDeals,
            countIf(event_type = 'deal.lost') AS lostDeals
          FROM deal_events
          WHERE tenant_id = {tenantId:String}
            AND occurred_at >= parseDateTime64BestEffort({from:String})
            AND occurred_at < parseDateTime64BestEffort({toExclusive:String})
        `,
        format: 'JSONEachRow',
        query_params: { tenantId, from, toExclusive },
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
      const { from, toExclusive } = periodRange(period.year, period.quarter);
      const res = await client.query({
        query: `
          SELECT
            owner_id AS ownerId,
            sumIf(if(base_amount != 0, base_amount, amount), event_type = 'deal.won') AS totalRevenue,
            countIf(event_type = 'deal.won') AS wonDeals,
            countIf(event_type = 'deal.lost') AS lostDeals
          FROM deal_events
          WHERE tenant_id = {tenantId:String}
            AND occurred_at >= parseDateTime64BestEffort({from:String})
            AND occurred_at < parseDateTime64BestEffort({toExclusive:String})
          GROUP BY owner_id
          ORDER BY totalRevenue DESC
        `,
        format: 'JSONEachRow',
        query_params: { tenantId, from, toExclusive },
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
