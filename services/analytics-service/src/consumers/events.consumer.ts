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
        probability: Number(p.probability ?? 0),
        forecast_category: String(p.forecastCategory ?? ''),
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
        forecast_category: String(p.forecastCategory ?? ''),
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
        forecast_category: String(p.forecastCategory ?? 'CLOSED'),
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
        forecast_category: String(p.forecastCategory ?? 'CLOSED'),
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

  // ── Leads (nexus.crm.leads) ────────────────────────────────────────────────
  const projectLeadEvent = async (event: NexusKafkaEvent): Promise<void> => {
    const p = asObj(event.payload);
    await client.insert({
      table: 'lead_events',
      values: [{
        tenant_id: event.tenantId,
        lead_id: String(p.leadId ?? p.id ?? ''),
        owner_id: String(p.ownerId ?? ''),
        status: String(p.status ?? p.to ?? ''),
        source: String(p.source ?? ''),
        company: String(p.company ?? ''),
        event_type: event.type,
        occurred_at: event.timestamp,
      }],
      format: 'JSONEachRow',
    });
  };
  consumer.on('lead.created', projectLeadEvent);
  consumer.on('lead.captured', projectLeadEvent);
  consumer.on('lead.assigned', projectLeadEvent);
  consumer.on('lead.updated', projectLeadEvent);
  consumer.on('lead.converted', projectLeadEvent);

  // ── Contacts (nexus.crm.contacts) — raw event stream ───────────────────────
  const projectContactRawEvent = async (event: NexusKafkaEvent): Promise<void> => {
    const p = asObj(event.payload);
    await client.insert({
      table: 'contact_events',
      values: [{
        tenant_id: event.tenantId,
        contact_id: String(p.contactId ?? p.id ?? ''),
        account_id: String(p.accountId ?? ''),
        owner_id: String(p.ownerId ?? ''),
        event_type: event.type,
        occurred_at: event.timestamp,
      }],
      format: 'JSONEachRow',
    });
  };
  // contact.created already drives contactsProjection above; also mirror it (and
  // updates/deletes) into the raw contact_events read-model for self-serve BI.
  consumer.on('contact.created', projectContactRawEvent);
  consumer.on('contact.updated', projectContactRawEvent);
  consumer.on('contact.deleted', projectContactRawEvent);

  // ── Accounts (nexus.crm.accounts) ──────────────────────────────────────────
  const projectAccountEvent = async (event: NexusKafkaEvent): Promise<void> => {
    const p = asObj(event.payload);
    await client.insert({
      table: 'account_events',
      values: [{
        tenant_id: event.tenantId,
        account_id: String(p.accountId ?? p.id ?? ''),
        owner_id: String(p.ownerId ?? ''),
        name: String(p.name ?? ''),
        industry: String(p.industry ?? ''),
        event_type: event.type,
        occurred_at: event.timestamp,
      }],
      format: 'JSONEachRow',
    });
  };
  consumer.on('account.created', projectAccountEvent);
  consumer.on('account.updated', projectAccountEvent);
  consumer.on('account.archived', projectAccountEvent);

  // ── Orders (nexus.finance.quotes topic) ────────────────────────────────────
  const projectOrderEvent = async (event: NexusKafkaEvent): Promise<void> => {
    const p = asObj(event.payload);
    const { baseAmount, baseCurrency } = await attachBaseAmount(event, 'total');
    await client.insert({
      table: 'order_events',
      values: [{
        tenant_id: event.tenantId,
        order_id: String(p.orderId ?? p.id ?? ''),
        account_id: String(p.accountId ?? ''),
        deal_id: String(p.dealId ?? ''),
        quote_id: String(p.quoteId ?? ''),
        event_type: event.type,
        status: String(p.status ?? ''),
        total: Number(p.total ?? 0),
        currency: String(p.currency ?? 'USD'),
        base_amount: baseAmount,
        base_currency: baseCurrency,
        occurred_at: event.timestamp,
      }],
      format: 'JSONEachRow',
    });
  };
  consumer.on('order.created', projectOrderEvent);
  // Orders born from a quote conversion are emitted as `quote.converted_to_order`
  // (finance commercial-records use-case), not `order.created` — subscribe it so
  // the order_events read-model captures quote-originated orders.
  consumer.on('quote.converted_to_order', projectOrderEvent);
  consumer.on('order.updated', projectOrderEvent);

  // ── Tickets (nexus.ticket.events) ──────────────────────────────────────────
  // Best-effort status inference from the event type (payloads carry different
  // shapes per transition). Counts by event_type stay honest regardless.
  const ticketStatusFor = (event: NexusKafkaEvent, p: Record<string, unknown>): string => {
    if (p.to !== undefined && p.to !== null) return String(p.to);
    switch (event.type as string) {
      case 'ticket.created':
        return 'OPEN';
      case 'ticket.resolved':
        return 'RESOLVED';
      case 'ticket.closed':
        return 'CLOSED';
      case 'ticket.reopened':
        return 'OPEN';
      default:
        return String(p.status ?? '');
    }
  };
  const projectTicketEvent = async (event: NexusKafkaEvent): Promise<void> => {
    const p = asObj(event.payload);
    await client.insert({
      table: 'ticket_events',
      values: [{
        tenant_id: event.tenantId,
        ticket_id: String(p.ticketId ?? p.id ?? ''),
        number: String(p.number ?? ''),
        priority: String(p.priority ?? ''),
        status: ticketStatusFor(event, p),
        assignee_id: String(p.assigneeId ?? ''),
        account_id: String(p.accountId ?? ''),
        event_type: event.type,
        occurred_at: event.timestamp,
      }],
      format: 'JSONEachRow',
    });
  };
  consumer.on('ticket.created', projectTicketEvent);
  consumer.on('ticket.updated', projectTicketEvent);
  consumer.on('ticket.assigned', projectTicketEvent);
  consumer.on('ticket.status_changed', projectTicketEvent);
  consumer.on('ticket.resolved', projectTicketEvent);
  consumer.on('ticket.closed', projectTicketEvent);
  consumer.on('ticket.reopened', projectTicketEvent);

  // ── Campaigns (nexus.analytics.events topic) ───────────────────────────────
  const projectCampaignEvent = async (event: NexusKafkaEvent): Promise<void> => {
    const p = asObj(event.payload);
    await client.insert({
      table: 'campaign_events',
      values: [{
        tenant_id: event.tenantId,
        campaign_id: String(p.campaignId ?? p.id ?? ''),
        name: String(p.name ?? ''),
        type: String(p.type ?? ''),
        status: String(p.to ?? p.status ?? ''),
        owner_id: String(p.ownerId ?? ''),
        budget: Number(p.budget ?? 0),
        event_type: event.type,
        occurred_at: event.timestamp,
      }],
      format: 'JSONEachRow',
    });
  };
  consumer.on('campaign.created', projectCampaignEvent);
  consumer.on('campaign.updated', projectCampaignEvent);
  consumer.on('campaign.status_changed', projectCampaignEvent);
  consumer.on('campaign.launched', projectCampaignEvent);

  // ── Subscriptions (nexus.finance.contracts topic) ──────────────────────────
  const projectSubscriptionEvent = async (event: NexusKafkaEvent): Promise<void> => {
    const p = asObj(event.payload);
    const mrr = Number(p.mrr ?? 0);
    // Convert MRR to base currency (attachBaseAmount reads `total`).
    p.total = mrr;
    const { baseAmount, baseCurrency } = await attachBaseAmount(event, 'total');
    await client.insert({
      table: 'subscription_events',
      values: [{
        tenant_id: event.tenantId,
        subscription_id: String(p.subscriptionId ?? p.id ?? ''),
        account_id: String(p.accountId ?? ''),
        product_id: String(p.productId ?? ''),
        plan_name: String(p.planName ?? ''),
        status: String(p.status ?? ''),
        mrr,
        arr: Number(p.arr ?? 0),
        currency: String(p.currency ?? 'USD'),
        base_amount: baseAmount,
        base_currency: baseCurrency,
        event_type: event.type,
        occurred_at: event.timestamp,
      }],
      format: 'JSONEachRow',
    });
  };
  consumer.on('subscription.created', projectSubscriptionEvent);
  consumer.on('subscription.cancelled', projectSubscriptionEvent);

  // ── Commissions (nexus.finance.commissions topic) ──────────────────────────
  const projectCommissionEvent = async (event: NexusKafkaEvent): Promise<void> => {
    const p = asObj(event.payload);
    const amount = Number(p.finalAmount ?? p.amount ?? 0);
    p.total = amount;
    const { baseAmount, baseCurrency } = await attachBaseAmount(event, 'total');
    await client.insert({
      table: 'commission_events',
      values: [{
        tenant_id: event.tenantId,
        commission_id: String(p.commissionId ?? p.id ?? ''),
        user_id: String(p.userId ?? ''),
        deal_id: String(p.dealId ?? ''),
        status: String(p.status ?? event.type.replace('commission.', '')),
        amount,
        currency: String(p.currency ?? 'USD'),
        base_amount: baseAmount,
        base_currency: baseCurrency,
        event_type: event.type,
        occurred_at: event.timestamp,
      }],
      format: 'JSONEachRow',
    });
  };
  consumer.on('commission.calculated', projectCommissionEvent);
  consumer.on('commission.approved', projectCommissionEvent);
  consumer.on('commission.clawback', projectCommissionEvent);

  await consumer.subscribe([
    TOPICS.DEALS,
    TOPICS.ACTIVITIES,
    TOPICS.QUOTES,
    TOPICS.CONTACTS,
    TOPICS.INVOICES,
    TOPICS.CONTRACTS,
    TOPICS.LEADS,
    TOPICS.ACCOUNTS,
    TOPICS.COMMISSIONS,
    TOPICS.ANALYTICS,
    'nexus.ticket.events',
  ]);
  await consumer.start();
  return consumer;
}
