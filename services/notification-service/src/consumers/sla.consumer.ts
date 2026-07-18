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

interface SlaConsumerDeps {
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
 * Payload shape of the `sla.breached` event emitted by workflow-service's SLA
 * scanner when a new breach is recorded (see
 * services/workflow-service/src/services/sla.service.ts). Not part of the shared
 * `NexusKafkaEvent` union, so we read it defensively.
 */
interface SlaBreachedPayload {
  slaId?: string;
  slaName?: string;
  entityType?: string;
  entityId?: string;
  ownerId?: string;
  hoursElapsed?: number;
  hoursAllowed?: number;
  executionId?: string;
  detectedAt?: string;
}

/**
 * Best-effort SMS + push + WhatsApp fan-out. Channels are already guarded no-ops
 * when unconfigured; per-channel opt-out (NOT-11) is enforced via fail-open
 * preference checks. Genuine send failures propagate (NOT-05) so the consumer
 * retries / DLQs, while an unconfigured channel stays a silent no-op.
 */
async function fanOutSmsPush(
  deps: Pick<SlaConsumerDeps, 'sms' | 'push' | 'whatsapp' | 'prefs'>,
  recipient: { tenantId: string; userId: string; phone?: string; deviceToken?: string },
  msg: { title: string; body: string; actionUrl?: string }
): Promise<void> {
  const { tenantId, userId } = recipient;
  const [smsOn, pushOn, whatsappOn] = await Promise.all([
    deps.prefs.isChannelEnabled(tenantId, userId, 'SMS'),
    deps.prefs.isChannelEnabled(tenantId, userId, 'PUSH'),
    deps.prefs.isChannelEnabled(tenantId, userId, 'WHATSAPP'),
  ]);
  await Promise.all([
    recipient.phone && smsOn
      ? deps.sms.send({ to: recipient.phone, body: `${msg.title}: ${msg.body}` })
      : Promise.resolve(),
    recipient.deviceToken && pushOn
      ? deps.push.send({
          to: recipient.deviceToken,
          title: msg.title,
          body: msg.body,
          actionUrl: msg.actionUrl,
        })
      : Promise.resolve(),
    recipient.phone && whatsappOn && deps.whatsapp.isConfigured()
      ? deps.whatsapp.send({ to: recipient.phone, body: `${msg.title}: ${msg.body}` })
      : Promise.resolve(),
  ]);
}

/**
 * SLA breach → owner notification (NOT-03). Before this consumer, workflow-service
 * recorded an `slaBreach` row but published nothing, so an owner about to blow an
 * SLA was never alerted. The NexusConsumer dedupes by eventId (and the scanner is
 * idempotent), so a breach is announced once. Guards on required fields so a
 * malformed event can never throw and stall the loop.
 */
export async function startSlaConsumer(deps: SlaConsumerDeps): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('notification-service.sla');

  consumer.on('sla.breached', async (event) => {
    const evt = event as { tenantId: string; eventId?: string; payload?: unknown };
    const payload = (evt.payload ?? {}) as SlaBreachedPayload;
    // Without an owner there is no one to notify — skip cleanly.
    if (!payload.ownerId || !payload.entityId) return;
    const entityType = payload.entityType ?? 'record';
    const entityId = payload.entityId;
    const slaName = payload.slaName ? `"${payload.slaName}"` : 'an SLA';
    const title = '⏳ SLA breached';
    const body = `${slaName} was breached on ${entityType} ${entityId}. It needs attention.`;
    const actionUrl = `/${entityType}s/${entityId}`;
    await deps.inApp.send({
      eventId: evt.eventId,
      tenantId: evt.tenantId,
      userId: payload.ownerId,
      type: 'SLA_BREACHED',
      title,
      body,
      entityType,
      entityId,
      actionUrl,
      metadata: {
        slaId: payload.slaId,
        slaName: payload.slaName,
        hoursElapsed: payload.hoursElapsed,
        hoursAllowed: payload.hoursAllowed,
        executionId: payload.executionId,
        detectedAt: payload.detectedAt,
      },
    });
    const owner = await deps.lookupOwner(evt.tenantId, payload.ownerId);
    if (owner.email && (await deps.prefs.isChannelEnabled(evt.tenantId, payload.ownerId, 'EMAIL'))) {
      await deps.email.send({
        to: owner.email,
        subject: title,
        html: renderActionEmail({
          heading: title,
          body,
          actionLabel: 'View record',
          actionUrl,
        }),
      });
    }
    await fanOutSmsPush(
      deps,
      { tenantId: evt.tenantId, userId: payload.ownerId, ...owner },
      { title, body, actionUrl }
    );
  });

  await consumer.subscribe([TOPICS.WORKFLOWS]);
  await consumer.start();
  return consumer;
}
