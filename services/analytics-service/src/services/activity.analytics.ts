import type { ClickHouseClient } from '@clickhouse/client';

export function createActivityAnalyticsService(client: ClickHouseClient) {
  return {
    async getActivitySummary(tenantId: string) {
      const res = await client.query({
        query: `
          SELECT
            countIf(event_type = 'activity.created') AS createdCount,
            countIf(event_type = 'activity.completed') AS completedCount,
            countIf(event_type = 'activity.overdue') AS overdueCount
          FROM activity_events
          WHERE tenant_id = {tenantId:String}
        `,
        format: 'JSONEachRow',
        query_params: { tenantId },
      });
      const row = ((await res.json()) as Array<Record<string, string | number>>)[0] ?? {};
      const createdCount = Number(row.createdCount ?? 0);
      const completedCount = Number(row.completedCount ?? 0);
      const overdueCount = Number(row.overdueCount ?? 0);
      return {
        volume: createdCount,
        completionRate: createdCount > 0 ? (completedCount / createdCount) * 100 : 0,
        overdueRate: createdCount > 0 ? (overdueCount / createdCount) * 100 : 0,
      };
    },

    async getActivityByType(
      tenantId: string,
      period: { from: string; to: string }
    ): Promise<Array<{ activityType: string; count: number; completionRate: number }>> {
      const res = await client.query({
        query: `
          SELECT
            activity_type AS activityType,
            countIf(event_type = 'activity.created') AS createdCount,
            countIf(event_type = 'activity.completed') AS completedCount
          FROM activity_events
          WHERE tenant_id = {tenantId:String}
            AND occurred_at >= parseDateTime64BestEffort({from:String})
            AND occurred_at <= parseDateTime64BestEffort({to:String})
          GROUP BY activity_type
          ORDER BY createdCount DESC
        `,
        format: 'JSONEachRow',
        query_params: { tenantId, from: period.from, to: period.to },
      });
      const rows = (await res.json()) as Array<Record<string, string | number>>;
      return rows.map((r) => {
        const created = Number(r.createdCount ?? 0);
        const completed = Number(r.completedCount ?? 0);
        return {
          activityType: String(r.activityType ?? ''),
          count: created,
          completionRate: created > 0 ? (completed / created) * 100 : 0,
        };
      });
    },
  };
}
