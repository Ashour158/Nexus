import { NexusConsumer, TOPICS } from '@nexus/kafka';
import type { InAppChannel } from '../channels/in-app.channel.js';
import type { EmailChannel } from '../channels/email.channel.js';
import type { SmsChannel } from '../channels/sms.channel.js';
import type { PushChannel } from '../channels/push.channel.js';
import type { WhatsAppChannel } from '../channels/whatsapp.channel.js';
import { renderActionEmail } from '../channels/email.channel.js';
import type { PreferencesService } from '../services/preferences.service.js';

interface OwnerLookup {
  (
    tenantId: string,
    userId: string
  ): Promise<{ email?: string; name?: string; phone?: string; deviceToken?: string }>;
}

interface LeadConsumerDeps {
  inApp: InAppChannel;
  email: EmailChannel;
  sms: SmsChannel;
  push: PushChannel;
  whatsapp: WhatsAppChannel;
  prefs: PreferencesService;
  lookupOwner: OwnerLookup;
  log: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
}

/**
 * Payload shape of the `lead.assigned` event emitted by crm-service when a lead
 * is (re)assigned to an owner. `lead.assigned` is not part of the shared
 * `NexusKafkaEvent` union, so we describe its payload locally and read it
 * defensively. Lead events use `leadId` + `ownerId` field names (see
 * services/crm-service/src/services/leads.service.ts).
 */
interface LeadAssignedPayload {
  leadId?: string;
  ownerId?: string;
  name?: string;
  company?: string;
  assignedBy?: string;
}

/**
 * Best-effort SMS + push + WhatsApp fan-out. Channels are already guarded no-ops
 * when unconfigured; this isolates any failure so one channel can never block the
 * other or the consumer. WhatsApp reuses the recipient's phone number and is only
 * attempted when the channel is configured.
 *
 * Per-channel opt-out (NOT-11) is enforced here via fail-open preference checks.
 */
async function fanOutSmsPush(
  deps: Pick<LeadConsumerDeps, 'sms' | 'push' | 'whatsapp' | 'prefs' | 'log'>,
  recipient: { tenantId: string; userId: string; phone?: string; deviceToken?: string },
  msg: { title: string; body: string; actionUrl?: string }
): Promise<void> {
  const { tenantId, userId } = recipient;
  const [smsOn, pushOn, whatsappOn] = await Promise.all([
    deps.prefs.isChannelEnabled(tenantId, userId, 'SMS'),
    deps.prefs.isChannelEnabled(tenantId, userId, 'PUSH'),
    deps.prefs.isChannelEnabled(tenantId, userId, 'WHATSAPP'),
  ]);
  await Promise.allSettled([
    recipient.phone && smsOn
      ? deps.sms
          .send({ to: recipient.phone, body: `${msg.title}: ${msg.body}` })
          .catch((err) => deps.log.error({ err }, 'sms fan-out failed'))
      : Promise.resolve(),
    recipient.deviceToken && pushOn
      ? deps.push
          .send({
            to: recipient.deviceToken,
            title: msg.title,
            body: msg.body,
            actionUrl: msg.actionUrl,
          })
          .catch((err) => deps.log.error({ err }, 'push fan-out failed'))
      : Promise.resolve(),
    recipient.phone && whatsappOn && deps.whatsapp.isConfigured()
      ? deps.whatsapp
          .send({ to: recipient.phone, body: `${msg.title}: ${msg.body}` })
          .catch((err) => deps.log.error({ err }, 'whatsapp fan-out failed'))
      : Promise.resolve(),
  ]);
}

/**
 * Lead events → notifications. Handles lead.assigned: notify the new owner they
 * have been assigned a lead. Idempotency + retry/DLQ are handled by
 * NexusConsumer; we additionally guard on required fields so a malformed event
 * can never throw and stall the loop (fail-open).
 */
export async function startLeadConsumer(deps: LeadConsumerDeps): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('notification-service.leads');

  consumer.on('lead.assigned', async (event) => {
    // `lead.assigned` is not in the shared NexusKafkaEvent union, so we read the
    // event shape generically. The handler is only dispatched for this type.
    const evt = event as { tenantId: string; payload?: unknown };
    const payload = (evt.payload ?? {}) as LeadAssignedPayload;
    if (!payload.leadId || !payload.ownerId) return;

    const label =
      payload.name ??
      (payload.company ? `at ${payload.company}` : undefined) ??
      payload.leadId;
    const title = '👤 New lead assigned to you';
    const body = `You've been assigned lead ${label}. Reach out while it's hot.`;
    await deps.inApp.send({
      tenantId: evt.tenantId,
      userId: payload.ownerId,
      type: 'LEAD_ASSIGNED',
      title,
      body,
      entityType: 'lead',
      entityId: payload.leadId,
      actionUrl: `/leads/${payload.leadId}`,
      metadata: {
        name: payload.name,
        company: payload.company,
        assignedBy: payload.assignedBy,
      },
    });
    const owner = await deps.lookupOwner(evt.tenantId, payload.ownerId);
    if (
      owner.email &&
      (await deps.prefs.isChannelEnabled(evt.tenantId, payload.ownerId, 'EMAIL'))
    ) {
      await deps.email.send({
        to: owner.email,
        subject: title,
        html: renderActionEmail({
          heading: title,
          body,
          actionLabel: 'View lead',
          actionUrl: `/leads/${payload.leadId}`,
        }),
      });
    }
    await fanOutSmsPush(
      deps,
      { tenantId: evt.tenantId, userId: payload.ownerId, ...owner },
      { title, body, actionUrl: `/leads/${payload.leadId}` }
    );
  });

  await consumer.subscribe([TOPICS.LEADS]);
  await consumer.start();
  return consumer;
}
