import { chDateTime } from '../lib/ch-datetime.js';
import type { ClickHouseClient } from '@clickhouse/client';
import type { NexusKafkaEvent } from '@nexus/shared-types';

export class InvoicesSummaryProjection {
  constructor(private readonly client: ClickHouseClient) {}

  async project(event: NexusKafkaEvent): Promise<void> {
    const payload = event.payload as Record<string, unknown>;
    const tenantId = event.tenantId;
    const accountId = String(payload.accountId ?? '');
    const total = Number(payload.total ?? payload.amount ?? 0);
    const status = this.inferStatus(event.type);
    // base_amount / base_currency are stamped onto the payload by the consumer.
    const baseTotal = Number(payload.base_amount ?? total);
    const baseCurrency = String(payload.base_currency ?? payload.currency ?? '');

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
          base_total_amount: baseTotal,
          base_paid_amount: status === 'PAID' ? baseTotal : 0,
          base_currency: baseCurrency,
          updated_at: chDateTime(event.timestamp),
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
