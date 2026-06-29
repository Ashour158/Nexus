import { NexusConsumer, TOPICS } from '@nexus/kafka';
import type { ClickHouseClient } from '@clickhouse/client';
import {
  DealsSummaryProjection,
  ContactsSummaryProjection,
  ActivitiesSummaryProjection,
  PipelineVelocityProjection,
  QuotesSummaryProjection,
  InvoicesSummaryProjection,
  ContractsSummaryProjection,
} from '../projections/index.js';

export async function startAnalyticsConsumer(client: ClickHouseClient): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('analytics-service.events');
  const dealsProjection = new DealsSummaryProjection(client);
  const contactsProjection = new ContactsSummaryProjection(client);
  const activitiesProjection = new ActivitiesSummaryProjection(client);
  const velocityProjection = new PipelineVelocityProjection(client);
  const quotesProjection = new QuotesSummaryProjection(client);
  const invoicesProjection = new InvoicesSummaryProjection(client);
  const contractsProjection = new ContractsSummaryProjection(client);

  function asObj(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  }

  consumer.on('deal.created', async (event) => {
    const p = asObj(event.payload);
    await client.insert({
      table: 'deal_events',
      values: [{
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
      }],
      format: 'JSONEachRow',
    });
    await dealsProjection.project(event);
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
    await dealsProjection.project(event);
    await velocityProjection.project(event);
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
    await dealsProjection.project(event);
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
    await dealsProjection.project(event);
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
    await activitiesProjection.project(event);
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
    await activitiesProjection.project(event);
  });

  consumer.on('contact.created', async (event) => {
    await contactsProjection.project(event);
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
    await quotesProjection.project(event);
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
    await quotesProjection.project(event);
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
    await quotesProjection.project(event);
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
    await quotesProjection.project(event);
  });

  consumer.on('invoice.created', async (event) => {
    const p = asObj(event.payload);
    await client.insert({
      table: 'invoice_events',
      values: [{
        tenant_id: event.tenantId,
        invoice_id: String(p.invoiceId ?? ''),
        account_id: String(p.accountId ?? ''),
        event_type: event.type,
        total: Number(p.total ?? 0),
        currency: String(p.currency ?? 'USD'),
        status: 'DRAFT',
        occurred_at: event.timestamp,
      }],
      format: 'JSONEachRow',
    });
    await invoicesProjection.project(event);
  });

  consumer.on('invoice.sent', async (event) => {
    const p = asObj(event.payload);
    await client.insert({
      table: 'invoice_events',
      values: [{
        tenant_id: event.tenantId,
        invoice_id: String(p.invoiceId ?? ''),
        account_id: String(p.accountId ?? ''),
        event_type: event.type,
        total: Number(p.total ?? 0),
        currency: String(p.currency ?? 'USD'),
        status: 'SENT',
        occurred_at: event.timestamp,
      }],
      format: 'JSONEachRow',
    });
    await invoicesProjection.project(event);
  });

  consumer.on('invoice.paid', async (event) => {
    const p = asObj(event.payload);
    await client.insert({
      table: 'invoice_events',
      values: [{
        tenant_id: event.tenantId,
        invoice_id: String(p.invoiceId ?? ''),
        account_id: String(p.accountId ?? ''),
        event_type: event.type,
        total: Number(p.amount ?? p.total ?? 0),
        currency: String(p.currency ?? 'USD'),
        status: 'PAID',
        occurred_at: event.timestamp,
      }],
      format: 'JSONEachRow',
    });
    await invoicesProjection.project(event);
  });

  consumer.on('contract.created', async (event) => {
    await contractsProjection.project(event);
  });

  consumer.on('contract.signed', async (event) => {
    await contractsProjection.project(event);
  });

  consumer.on('contract.terminated', async (event) => {
    await contractsProjection.project(event);
  });

  await consumer.subscribe([TOPICS.DEALS, TOPICS.ACTIVITIES, TOPICS.QUOTES, TOPICS.CONTACTS, TOPICS.INVOICES, TOPICS.CONTRACTS]);
  await consumer.start();
  return consumer;
}
