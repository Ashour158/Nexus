import { chDateTime } from '../lib/ch-datetime.js';
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
        const amount = Number(p.amount ?? 0);
        const probability = Number(p.probability ?? 0);
        // base_amount / base_currency are stamped onto the payload by the consumer
        // (converted to the tenant base currency). Fall back to raw amount 1:1.
        const baseAmount = Number(p.base_amount ?? amount);
        const baseCurrency = String(p.base_currency ?? p.currency ?? '');
        await (this.clickhouse as any).insert({
          table: this.table,
          values: [{
            tenant_id: event.tenantId,
            pipeline_id: String(p.pipelineId ?? ''),
            stage_id: String(p.stageId ?? ''),
            owner_id: String(p.ownerId ?? ''),
            territory: String(p.territory ?? ''),
            total_amount: amount,
            deal_count: 1,
            weighted_amount: amount * (probability / 100),
            avg_probability: probability,
            base_total_amount: baseAmount,
            base_weighted_amount: baseAmount * (probability / 100),
            base_currency: baseCurrency,
            updated_at: chDateTime(event.timestamp),
          }],
          format: 'JSONEachRow',
        });
        break;
      }
    }
  }
}
