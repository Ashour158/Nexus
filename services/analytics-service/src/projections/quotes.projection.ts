import type { ClickHouseClient } from '@clickhouse/client';
import type { NexusKafkaEvent } from '@nexus/shared-types';

export class QuotesSummaryProjection {
  constructor(private readonly client: ClickHouseClient) {}

  async project(event: NexusKafkaEvent): Promise<void> {
    const payload = event.payload as Record<string, unknown>;
    const tenantId = event.tenantId;
    const accountId = String(payload.accountId ?? '');
    const dealId = String(payload.dealId ?? '');
    const total = Number(payload.total ?? 0);

    // Upsert into quotes_summary using a simple INSERT (ReplacingMergeTree handles dedup)
    await this.client.insert({
      table: 'quotes_summary',
      values: [
        {
          tenant_id: tenantId,
          account_id: accountId,
          deal_id: dealId,
          status: this.inferStatus(event.type),
          total,
          quote_count: 1,
          updated_at: event.timestamp,
        },
      ],
      format: 'JSONEachRow',
    });
  }

  private inferStatus(eventType: string): string {
    switch (eventType) {
      case 'quote.created':
        return 'DRAFT';
      case 'quote.sent':
        return 'SENT';
      case 'quote.accepted':
        return 'ACCEPTED';
      case 'quote.rejected':
        return 'REJECTED';
      default:
        return 'UNKNOWN';
    }
  }
}
