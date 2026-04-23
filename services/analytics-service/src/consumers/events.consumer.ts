import { NexusConsumer, TOPICS } from '@nexus/kafka';
import type { ClickHouseClient } from '@clickhouse/client';

export async function startAnalyticsConsumer(client: ClickHouseClient): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('analytics-service.events');

  function asObj(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  }

  consumer.on('deal.created', async (event) => {
    const p = asObj(event.payload);
    await client.insert({
      table: 'deal_events',
      values: [
        {
          tenant_id: event.tenantId,
          deal_id: String(p.dealId ?? ''),
          owner_id: String(p.ownerId ?? ''),
          account_id: String(p.accountId ?? ''),
          pipeline_id: String(p.pipelineId ?? ''),
          stage_id: String(p.stageId ?? ''),
          event_type: event.type,
          amount: Number(p.amount ?? 0),
          currency: String(p.currency ?? 'USD'),
          occurred_at: event.timestamp,
        },
      ],
      format: 'JSONEachRow',
    });
  });
  consumer.on('deal.stage_changed', async (event) => {
    const p = asObj(event.payload);
    await client.insert({
      table: 'deal_events',
      values: [{
        tenant_id: event.tenantId,
        deal_id: String(p.dealId ?? ''),
        owner_id: String(p.ownerId ?? ''),
        account_id: '',
        pipeline_id: String(p.pipelineId ?? ''),
        stage_id: String(p.stageId ?? ''),
        event_type: event.type,
        amount: 0,
        currency: 'USD',
        occurred_at: event.timestamp,
      }],
      format: 'JSONEachRow',
    });
  });
  consumer.on('deal.won', async (event) => {
    const p = asObj(event.payload);
    await client.insert({
      table: 'deal_events',
      values: [{
        tenant_id: event.tenantId,
        deal_id: String(p.dealId ?? ''),
        owner_id: String(p.ownerId ?? ''),
        account_id: String(p.accountId ?? ''),
        pipeline_id: '',
        stage_id: '',
        event_type: event.type,
        amount: Number(p.amount ?? 0),
        currency: String(p.currency ?? 'USD'),
        occurred_at: event.timestamp,
      }],
      format: 'JSONEachRow',
    });
  });
  consumer.on('deal.lost', async (event) => {
    const p = asObj(event.payload);
    await client.insert({
      table: 'deal_events',
      values: [{
        tenant_id: event.tenantId,
        deal_id: String(p.dealId ?? ''),
        owner_id: String(p.ownerId ?? ''),
        account_id: String(p.accountId ?? ''),
        pipeline_id: '',
        stage_id: '',
        event_type: event.type,
        amount: Number(p.amount ?? 0),
        currency: String(p.currency ?? 'USD'),
        occurred_at: event.timestamp,
      }],
      format: 'JSONEachRow',
    });
  });
  consumer.on('activity.created', async (event) => {
    const p = asObj(event.payload);
    await client.insert({
      table: 'activity_events',
      values: [{
        tenant_id: event.tenantId,
        activity_id: String(p.activityId ?? ''),
        owner_id: String(p.ownerId ?? ''),
        deal_id: String(p.dealId ?? ''),
        activity_type: String(p.type ?? ''),
        event_type: event.type,
        occurred_at: event.timestamp,
      }],
      format: 'JSONEachRow',
    });
  });
  consumer.on('activity.completed', async (event) => {
    const p = asObj(event.payload);
    await client.insert({
      table: 'activity_events',
      values: [{
        tenant_id: event.tenantId,
        activity_id: String(p.activityId ?? ''),
        owner_id: String(p.ownerId ?? ''),
        deal_id: String(p.dealId ?? ''),
        activity_type: String(p.type ?? ''),
        event_type: event.type,
        occurred_at: event.timestamp,
      }],
      format: 'JSONEachRow',
    });
  });
  consumer.on('quote.created', async (event) => {
    const p = asObj(event.payload);
    await client.insert({
      table: 'quote_events',
      values: [{
        tenant_id: event.tenantId,
        quote_id: String(p.quoteId ?? ''),
        deal_id: String(p.dealId ?? ''),
        account_id: String(p.accountId ?? ''),
        event_type: event.type,
        total: Number(p.total ?? 0),
        currency: String(p.currency ?? 'USD'),
        occurred_at: event.timestamp,
      }],
      format: 'JSONEachRow',
    });
  });
  consumer.on('quote.sent', async (event) => {
    const p = asObj(event.payload);
    await client.insert({
      table: 'quote_events',
      values: [{
        tenant_id: event.tenantId,
        quote_id: String(p.quoteId ?? ''),
        deal_id: String(p.dealId ?? ''),
        account_id: String(p.accountId ?? ''),
        event_type: event.type,
        total: Number(p.total ?? 0),
        currency: String(p.currency ?? 'USD'),
        occurred_at: event.timestamp,
      }],
      format: 'JSONEachRow',
    });
  });
  consumer.on('quote.accepted', async (event) => {
    const p = asObj(event.payload);
    await client.insert({
      table: 'quote_events',
      values: [{
        tenant_id: event.tenantId,
        quote_id: String(p.quoteId ?? ''),
        deal_id: String(p.dealId ?? ''),
        account_id: String(p.accountId ?? ''),
        event_type: event.type,
        total: Number(p.total ?? 0),
        currency: String(p.currency ?? 'USD'),
        occurred_at: event.timestamp,
      }],
      format: 'JSONEachRow',
    });
  });
  consumer.on('quote.rejected', async (event) => {
    const p = asObj(event.payload);
    await client.insert({
      table: 'quote_events',
      values: [{
        tenant_id: event.tenantId,
        quote_id: String(p.quoteId ?? ''),
        deal_id: String(p.dealId ?? ''),
        account_id: String(p.accountId ?? ''),
        event_type: event.type,
        total: Number(p.total ?? 0),
        currency: String(p.currency ?? 'USD'),
        occurred_at: event.timestamp,
      }],
      format: 'JSONEachRow',
    });
  });

  await consumer.subscribe([TOPICS.DEALS, TOPICS.ACTIVITIES, TOPICS.QUOTES]);
  await consumer.start();
  return consumer;
}
