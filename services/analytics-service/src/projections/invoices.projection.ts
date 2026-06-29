import type { ClickHouseClient } from '@clickhouse/client';
import type { NexusKafkaEvent } from '@nexus/shared-types';

export class InvoicesSummaryProjection {
  constructor(private readonly client: ClickHouseClient) {}

  async project(event: NexusKafkaEvent): Promise<void> {
    const payload = event.payload as Record<string, unknown>;
    const tenantId = event.tenantId;
    const accountId = String(payload.accountId ?? '');
    const total = Number(payload.total ?? 0);
    const status = this.inferStatus(event.type);

    await this.client.insert({
      table: 'invoices_summary',
      values: [
        {
          tenant_id: tenantId,
          account_id: accountId,
          status,
          total_amount: total,
          invoice_count: 1,
          paid_amount: status === 'PAID' ? total : 0,
          overdue_count: status === 'OVERDUE' ? 1 : 0,
          updated_at: event.timestamp,
        },
      ],
      format: 'JSONEachRow',
    });
  }

  private inferStatus(eventType: string): string {
    switch (eventType) {
      case 'invoice.created':
        return 'DRAFT';
      case 'invoice.sent':
        return 'SENT';
      case 'invoice.paid':
        return 'PAID';
      default:
        return 'UNKNOWN';
    }
  }
}
