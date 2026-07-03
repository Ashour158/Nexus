import { NexusConsumer, TOPICS } from '@nexus/kafka';
import type { ClickHouseClient } from '@clickhouse/client';
import type { NexusKafkaEvent } from '@nexus/shared-types';
import {
  DealsSummaryProjection,
  ContactsSummaryProjection,
  ActivitiesSummaryProjection,
  PipelineVelocityProjection,
  QuotesSummaryProjection,
  InvoicesSummaryProjection,
  ContractsSummaryProjection,
} from '../projections/index.js';
import { ratesService } from '../services/rates.service.js';

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

  /**
   * Convert an amount into the tenant base currency and stamp base_amount /
   * base_currency onto the event payload so downstream projections reuse the
   * exact same converted value. Fully guarded by ratesService (never throws).
   */
  async function attachBaseAmount(
    event: NexusKafkaEvent,
    amountKey: 'amount' | 'total'
  ): Promise<{ baseAmount: number; baseCurrency: string; currency: string }> {
    const p = asObj(event.payload);
    const rawAmount = Number(p[amountKey] ?? p.amount ?? p.total ?? 0);
    const currency = String(p.currency ?? 'USD');
    const { baseAmount, baseCurrency } = await ratesService.convertToBase(
      event.tenantId,
      rawAmount,
      currency
    );
    // Stamp onto the payload so projections read the already-converted value.
    p.base_amount = baseAmount;
    p.base_currency = baseCurrency;
    return { baseAmount, baseCurrency, currency };
  }

  consumer.on('deal.created', async (event) => {
    const p = asObj(event.payload);
    const { baseAmount, baseCurrency } = await attachBaseAmount(event, 'amount');
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
        base_amount: baseAmount,
        base_currency: baseCurrency,
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
        base_amount: 0,
        base_currency: 'USD',
        occurred_at: event.timestamp,
      }],
      format: 'JSONEachRow',
    });
    await dealsProjection.project(event);
    await velocityProjection.project(event);
  });

  consumer.on('deal.won', async (event) => {
    const p = asObj(event.payload);
    const { baseAmount, baseCurrency } = await attachBaseAmount(event, 'amount');
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
        base_amount: baseAmount,
        base_currency: baseCurrency,
        occurred_at: event.timestamp,
      }],
      format: 'JSONEachRow',
    });
    await dealsProjection.project(event);
  });

  consumer.on('deal.lost', async (event) => {
    const p = asObj(event.payload);
    const { baseAmount, baseCurrency } = await attachBaseAmount(event, 'amount');
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
        base_amount: baseAmount,
        base_currency: baseCurrency,
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

  const projectQuoteEvent = async (event: NexusKafkaEvent): Promise<void> => {
    const p = asObj(event.payload);
    const { baseAmount, baseCurrency } = await attachBaseAmount(event, 'total');
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
        base_amount: baseAmount,
        base_currency: baseCurrency,
        occurred_at: event.timestamp,
      }],
      format: 'JSONEachRow',
    });
    await quotesProjection.project(event);
  };

  consumer.on('quote.created', projectQuoteEvent);
  consumer.on('quote.sent', projectQuoteEvent);
  consumer.on('quote.accepted', projectQuoteEvent);
  consumer.on('quote.rejected', projectQuoteEvent);

  const projectInvoiceEvent = (status: string) => async (event: NexusKafkaEvent): Promise<void> => {
    const p = asObj(event.payload);
    // invoice.paid may carry `amount` instead of `total`; normalize before converting.
    const rawTotal = Number(p.amount ?? p.total ?? 0);
    p.total = rawTotal;
    const { baseAmount, baseCurrency } = await attachBaseAmount(event, 'total');
    await client.insert({
      table: 'invoice_events',
      values: [{
        tenant_id: event.tenantId,
        invoice_id: String(p.invoiceId ?? ''),
        account_id: String(p.accountId ?? ''),
        event_type: event.type,
        total: rawTotal,
        currency: String(p.currency ?? 'USD'),
        base_amount: baseAmount,
        base_currency: baseCurrency,
        status,
        occurred_at: event.timestamp,
      }],
      format: 'JSONEachRow',
    });
    await invoicesProjection.project(event);
  };

  consumer.on('invoice.created', projectInvoiceEvent('DRAFT'));
  consumer.on('invoice.sent', projectInvoiceEvent('SENT'));
  consumer.on('invoice.paid', projectInvoiceEvent('PAID'));

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
