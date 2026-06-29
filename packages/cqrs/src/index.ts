import type { NexusKafkaEvent } from '@nexus/shared-types';

export interface ReadModel {
  id: string;
  tenantId: string;
  version: number;
  updatedAt: Date;
}

export interface ClickHouseClient {
  query(options: { query: string; format?: string }): Promise<{ json<T>(): Promise<T> }>;
  insert(options: { table: string; values: unknown[]; format?: string }): Promise<void>;
}

/**
 * ReadModelProjection — base class for CQRS projections into ClickHouse.
 * Consumers call `project(event)` which routes to the appropriate handler.
 */
export abstract class ReadModelProjection<T extends ReadModel = ReadModel> {
  constructor(
    protected readonly clickhouse: ClickHouseClient,
    protected readonly table: string
  ) {}

  abstract project(event: NexusKafkaEvent): Promise<void>;

  protected async upsert(row: T): Promise<void> {
    await this.clickhouse.insert({
      table: this.table,
      values: [row],
      format: 'JSONEachRow',
    });
  }

  protected async exec(query: string): Promise<void> {
    await this.clickhouse.query({ query });
  }
}

export interface DealsSummaryRow {
  tenantId: string;
  pipelineId: string;
  stageId: string;
  ownerId: string;
  territory?: string;
  totalAmount: number;
  dealCount: number;
  weightedAmount: number;
  avgProbability: number;
  updatedAt: Date;
}

export interface ContactsSummaryRow {
  tenantId: string;
  accountId?: string;
  industry?: string;
  region?: string;
  contactCount: number;
  activeCount: number;
  updatedAt: Date;
}

export interface ActivitiesSummaryRow {
  tenantId: string;
  ownerId: string;
  type: string;
  status: string;
  activityCount: number;
  overdueCount: number;
  updatedAt: Date;
}

export interface PipelineVelocityRow {
  tenantId: string;
  pipelineId: string;
  stageId: string;
  stageName: string;
  avgDaysInStage: number;
  conversionRate: number;
  exitCount: number;
  enterCount: number;
  updatedAt: Date;
}
