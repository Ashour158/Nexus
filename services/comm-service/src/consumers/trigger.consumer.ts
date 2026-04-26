import { NexusConsumer, TOPICS } from '@nexus/kafka';
import type { ActivityCreatedEvent, DealWonEvent, QuoteSentEvent } from '@nexus/shared-types';
import { fetchContactEmail, fetchDealPrimaryContactEmail } from '../lib/crm-client.js';
import { fetchUserEmail } from '../lib/auth-client.js';
import type { createOutboxService } from '../services/outbox.service.js';
import type { createTemplatesService } from '../services/templates.service.js';
import type { CommPrisma } from '../prisma.js';
import type { EmailTemplate } from '../../../../node_modules/.prisma/comm-client/index.js';

export interface TriggerConsumerDeps {
  prisma: CommPrisma;
  outbox: ReturnType<typeof createOutboxService>;
  templates: ReturnType<typeof createTemplatesService>;
  log: { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void };
}

function renderSafe(
  templates: ReturnType<typeof createTemplatesService>,
  tpl: EmailTemplate,
  vars: Record<string, string>
) {
  return templates.renderTemplate(tpl, vars, { fillMissingWith: '' });
}

export async function startTriggerConsumer(deps: TriggerConsumerDeps): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('comm-service-triggers');

  consumer.on('quote.sent', async (event) => {
    const { tenantId } = event;
    const payload = event.payload as QuoteSentEvent['payload'];
    const to =
      payload.recipientEmail?.trim() ||
      (await fetchDealPrimaryContactEmail(tenantId, payload.dealId));
    if (!to) {
      deps.log.warn({ tenantId, quoteId: payload.quoteId }, 'quote.sent: no recipient email');
      return;
    }
    const tpl = await deps.prisma.emailTemplate.findFirst({
      where: { tenantId, category: 'QUOTE', isActive: true },
    });
    const vars: Record<string, string> = {
      quoteId: payload.quoteId,
      dealId: payload.dealId,
      total: String(payload.total),
      currency: 'USD',
    };
    const subject = tpl ? renderSafe(deps.templates, tpl, vars).subject : `Quote ${payload.quoteId} is ready`;
    const html = tpl
      ? renderSafe(deps.templates, tpl, vars).htmlBody
      : `<p>Your quote <strong>${payload.quoteId}</strong> for deal <strong>${payload.dealId}</strong> is ready.</p><p>Total: USD ${payload.total}</p>`;
    await deps.outbox.queueEmail(tenantId, {
      to,
      subject,
      htmlBody: html,
      entityType: 'QUOTE',
      entityId: payload.quoteId,
      templateId: tpl?.id,
    });
    await deps.outbox.processQueue(tenantId);
  });

  consumer.on('deal.won', async (event) => {
    const { tenantId } = event;
    const payload = event.payload as DealWonEvent['payload'];
    const ownerEmail = await fetchUserEmail(tenantId, payload.ownerId);
    if (!ownerEmail) {
      deps.log.warn({ tenantId, dealId: payload.dealId }, 'deal.won: owner email not resolved');
      return;
    }
    const tpl = await deps.prisma.emailTemplate.findFirst({
      where: { tenantId, category: 'DEAL_WON', isActive: true },
    });
    const vars: Record<string, string> = {
      dealId: payload.dealId,
      amount: String(payload.amount),
      currency: payload.currency,
    };
    const subject = tpl ? renderSafe(deps.templates, tpl, vars).subject : `Deal won: ${payload.dealId}`;
    const html = tpl
      ? renderSafe(deps.templates, tpl, vars).htmlBody
      : `<p>Congratulations — deal <strong>${payload.dealId}</strong> is won.</p><p>${payload.currency} ${payload.amount}</p>`;
    await deps.outbox.queueEmail(tenantId, {
      to: ownerEmail,
      subject,
      htmlBody: html,
      entityType: 'DEAL',
      entityId: payload.dealId,
      templateId: tpl?.id,
    });
    await deps.outbox.processQueue(tenantId);
  });

  consumer.on('activity.created', async (event) => {
    const payload = event.payload as ActivityCreatedEvent['payload'];
    if (payload.type !== 'MEETING') return;
    const { tenantId } = event;
    let email: string | undefined;
    if (payload.dealId) {
      email = await fetchDealPrimaryContactEmail(tenantId, payload.dealId);
    }
    if (!email && payload.contactId) {
      const c = await fetchContactEmail(tenantId, payload.contactId);
      email = c?.email ?? undefined;
    }
    if (!email) return;
    await deps.outbox.queueEmail(tenantId, {
      to: email,
      subject: 'Meeting scheduled (calendar placeholder)',
      htmlBody: `<p>A meeting activity was created (${payload.activityId}). Calendar invite attachment is not generated in this build.</p>`,
      entityType: 'DEAL',
      entityId: payload.dealId ?? undefined,
    });
    await deps.outbox.processQueue(tenantId);
  });

  await consumer.subscribe([TOPICS.QUOTES, TOPICS.DEALS, TOPICS.ACTIVITIES]);
  await consumer.start();
  deps.log.info('comm-service trigger consumer running');
  return consumer;
}
