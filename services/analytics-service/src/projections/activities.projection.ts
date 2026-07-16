import { chDateTime } from '../lib/ch-datetime.js';
import type { ClickHouseClient } from '@clickhouse/client';
import { ReadModelProjection } from '@nexus/cqrs';
import type { NexusKafkaEvent } from '@nexus/shared-types';

export class ActivitiesSummaryProjection extends ReadModelProjection {
  constructor(client: ClickHouseClient) {
    super(client as any, 'activities_summary');
  }

  async project(event: NexusKafkaEvent): Promise<void> {
    const p = event.payload as Record<string, unknown>;
    switch (event.type) {
      case 'activity.created':
      case 'activity.completed': {
        await (this.clickhouse as any).insert({
          table: this.table,
          values: [{
            tenant_id: event.tenantId,
            owner_id: String(p.ownerId ?? ''),
            type: String(p.type ?? ''),
            status: String(p.status ?? ''),
            activity_count: 1,
            overdue_count: 0,
            updated_at: chDateTime(event.timestamp),
          }],
          format: 'JSONEachRow',
        });
        break;
      }
    }
  }
}
