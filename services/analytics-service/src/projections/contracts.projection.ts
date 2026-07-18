import { chDateTime } from '../lib/ch-datetime.js';
import type { ClickHouseClient } from '@clickhouse/client';
import type { NexusKafkaEvent } from '@nexus/shared-types';

export class ContractsSummaryProjection {
  constructor(private readonly client: ClickHouseClient) {}

  async project(event: NexusKafkaEvent): Promise<void> {
    const payload = event.payload as Record<string, unknown>;
    const tenantId = event.tenantId;
    const accountId = String(payload.accountId ?? '');
    const value = Number(payload.value ?? payload.total ?? 0);
    const status = this.inferStatus(event.type);

    await this.client.insert({
      table: 'contracts_summary',
      values: [
        {
          tenant_id: tenantId,
          account_id: accountId,
          status,
          total_value: value,
          contract_count: 1,
          updated_at: chDateTime(event.timestamp),
        },
      ],
      format: 'JSONEachRow',
    });
  }

  private inferStatus(eventType: string): string {
    switch (eventType) {
      case 'contract.created':
        return 'DRAFT';
      case 'contract.signed':
        return 'ACTIVE';
      case 'contract.terminated':
        return 'TERMINATED';
      default:
        return 'UNKNOWN';
    }
  }
}
