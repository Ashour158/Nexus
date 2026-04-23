import type { ClickHouseClient } from '@clickhouse/client';

export function createActivityAnalyticsService(client: ClickHouseClient) {
  return {
    async getActivitySummary(tenantId: string) {
      const res = await client.query({
        query: `
          SELECT
            countIf(event_type = 'activity.created') AS createdCount,
            countIf(event_type = 'activity.completed') AS completedCount
          FROM activity_events
          WHERE tenant_id = {tenantId:String}
        `,
        format: 'JSONEachRow',
        query_params: { tenantId },
      });
      const row = ((await res.json()) as Array<Record<string, string | number>>)[0] ?? {};
      const createdCount = Number(row.createdCount ?? 0);
      const completedCount = Number(row.completedCount ?? 0);
      return {
        volume: createdCount,
        completionRate: createdCount > 0 ? (completedCount / createdCount) * 100 : 0,
        overdueRate: 0,
      };
    },
  };
}
