import { chDateTime } from '../lib/ch-datetime.js';
import type { ClickHouseClient } from '@clickhouse/client';
import { ReadModelProjection } from '@nexus/cqrs';
import type { NexusKafkaEvent } from '@nexus/shared-types';

export class ContactsSummaryProjection extends ReadModelProjection {
  constructor(client: ClickHouseClient) {
    super(client as any, 'contacts_summary');
  }

  async project(event: NexusKafkaEvent): Promise<void> {
    const p = event.payload as Record<string, unknown>;
    switch (event.type) {
      case 'contact.created': {
        await (this.clickhouse as any).insert({
          table: this.table,
          values: [{
            tenant_id: event.tenantId,
            account_id: String(p.accountId ?? ''),
            industry: String(p.industry ?? ''),
            region: String(p.region ?? ''),
            contact_count: 1,
            active_count: 1,
            updated_at: chDateTime(event.timestamp),
          }],
          format: 'JSONEachRow',
        });
        break;
      }
    }
  }
}
