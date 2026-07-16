import { chDateTime } from '../lib/ch-datetime.js';
import type { ClickHouseClient } from '@clickhouse/client';
import { ReadModelProjection } from '@nexus/cqrs';
import type { NexusKafkaEvent } from '@nexus/shared-types';

export class PipelineVelocityProjection extends ReadModelProjection {
  constructor(client: ClickHouseClient) {
    super(client as any, 'pipeline_velocity');
  }

  async project(event: NexusKafkaEvent): Promise<void> {
    const p = event.payload as Record<string, unknown>;
    switch (event.type) {
      case 'deal.stage_changed': {
        await (this.clickhouse as any).insert({
          table: this.table,
          values: [{
            tenant_id: event.tenantId,
            pipeline_id: String(p.pipelineId ?? ''),
            stage_id: String(p.newStageId ?? ''),
            stage_name: String(p.stageName ?? ''),
            avg_days_in_stage: 0,
            conversion_rate: 0,
            exit_count: 1,
            enter_count: 1,
            updated_at: chDateTime(event.timestamp),
          }],
          format: 'JSONEachRow',
        });
        break;
      }
    }
  }
}
