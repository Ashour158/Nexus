import type { ClickHouseClient } from '@clickhouse/client';
import { ReadModelProjection } from '@nexus/cqrs';
import type { NexusKafkaEvent } from '@nexus/shared-types';

export class DealsSummaryProjection extends ReadModelProjection {
  constructor(client: ClickHouseClient) {
    super(client as any, 'deals_summary');
  }

  async project(event: NexusKafkaEvent): Promise<void> {
    const p = event.payload as Record<string, unknown>;
    switch (event.type) {
      case 'deal.created':
      case 'deal.stage_changed':
      case 'deal.won':
      case 'deal.lost': {
        await (this.clickhouse as any).insert({
          table: this.table,
          values: [{
            tenant_id: event.tenantId,
            pipeline_id: String(p.pipelineId ?? ''),
            stage_id: String(p.stageId ?? ''),
            owner_id: String(p.ownerId ?? ''),
            territory: String(p.territory ?? ''),
            total_amount: Number(p.amount ?? 0),
            deal_count: 1,
            weighted_amount: Number(p.amount ?? 0) * (Number(p.probability ?? 0) / 100),
            avg_probability: Number(p.probability ?? 0),
            updated_at: event.timestamp,
          }],
          format: 'JSONEachRow',
        });
        break;
      }
    }
  }
}
