import { NexusConsumer, TOPICS } from '@nexus/kafka';
import type { ActivityCreatedEvent, DealWonEvent, QuoteSentEvent } from '@nexus/shared-types';
import { fetchContactEmail, fetchDealPrimaryContactEmail } from '../lib/crm-client.js';
import { fetchUserEmail } from '../lib/auth-client.js';
import { buildIcs } from '../lib/ics.js';
import type { createOutboxService } from '../services/outbox.service.js';
import type { createTemplatesService } from '../services/templates.service.js';
import type { EmailChannel } from '../channels/smtp.channel.js';
import type { CommPrisma } from '../prisma.js';
import type { EmailTemplate } from '../../../../node_modules/.prisma/comm-client/index.js';

export interface TriggerConsumerDeps {
  prisma: CommPrisma;
  outbox: ReturnType<typeof createOutboxService>;
  templates: ReturnType<typeof createTemplatesService>;
  /** Optional direct SMTP channel — required to attach calendar invites. */
  smtp?: EmailChannel;
  log: { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void };
}

/** Stable, host-qualified Message-ID for outbound thread correlation. */
function meetingMessageId(activityId: string): string {
  return `<meeting-${activityId}@nexuscrm>`;
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

    const startsAt = payload.dueDate ? new Date(payload.dueDate) : null;
    const subject = 'Meeting invitation';
    const html =
      `<p>A meeting has been scheduled${startsAt ? ` for ${startsAt.toUTCString()}` : ''}.</p>` +
      `<p>Please find the calendar invitation attached.</p>`;

    // Build a valid RFC-5545 invite. Fail-open: if anything goes wrong we still
    // fall back to a plain queued email so the notification is never lost.
    let ics: string | null = null;
    if (startsAt && !Number.isNaN(startsAt.getTime())) {
      try {
        const organizerEmail = await fetchUserEmail(tenantId, payload.ownerId).catch(() => undefined);
        ics = buildIcs({
          uid: `meeting-${payload.activityId}@nexuscrm`,
          start: startsAt,
          summary: subject,
          description: `Meeting created in Nexus CRM (activity ${payload.activityId}).`,
          organizerEmail: organizerEmail ?? undefined,
          attendeeEmails: [email],
        });
      } catch (err) {
        deps.log.warn({ err, activityId: payload.activityId }, 'meeting: ICS build failed; sending without invite');
      }
    }

    // With an ICS we must send directly (the outbox has no attachment column);
    // otherwise use the normal queued path.
    if (ics && deps.smtp) {
      try {
        await deps.smtp.send({
          to: email,
          subject,
          html,
          text: html.replace(/<[^>]+>/g, ' '),
          ics: { content: ics, method: 'REQUEST' },
          messageId: meetingMessageId(payload.activityId),
        });
        return;
      } catch (err) {
        deps.log.warn({ err, activityId: payload.activityId }, 'meeting: ICS send failed; falling back to queued email');
      }
    }

    await deps.outbox.queueEmail(tenantId, {
      to: email,
      subject,
      htmlBody: html,
      entityType: 'DEAL',
      entityId: payload.dealId ?? undefined,
    });
    await deps.outbox.processQueue(tenantId);
  });

  // Direct send requests (e.g. auth password-reset fallback outbox). Queue
  // through the durable comm outbox so the send survives restarts and shows
  // up in the operator-visible outbox state.
  consumer.on('email.send.requested', async (event) => {
    const { tenantId } = event;
    const payload = event.payload as { to?: string; subject?: string; htmlBody?: string };
    if (!payload.to || !payload.subject || !payload.htmlBody) {
      deps.log.warn({ tenantId }, 'email.send.requested: missing to/subject/htmlBody; dropping');
      return;
    }
    await deps.outbox.queueEmail(tenantId, {
      to: payload.to,
      subject: payload.subject,
      htmlBody: payload.htmlBody,
    });
    await deps.outbox.processQueue(tenantId);
  });

  await consumer.subscribe([TOPICS.QUOTES, TOPICS.DEALS, TOPICS.ACTIVITIES, TOPICS.EMAIL_SEND]);
  await consumer.start();
  deps.log.info('comm-service trigger consumer running');
  return consumer;
}
