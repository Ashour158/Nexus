import { NexusConsumer, TOPICS } from '@nexus/kafka';
import type { InAppChannel } from '../channels/in-app.channel.js';
import type { EmailChannel } from '../channels/email.channel.js';
import type { SmsChannel } from '../channels/sms.channel.js';
import type { PushChannel } from '../channels/push.channel.js';
import type { WhatsAppChannel } from '../channels/whatsapp.channel.js';
import { renderActionEmail } from '../channels/email.channel.js';
import type { PreferencesService } from '../services/preferences.service.js';

interface QuoteConsumerDeps {
  inApp: InAppChannel;
  email: EmailChannel;
  sms: SmsChannel;
  push: PushChannel;
  whatsapp: WhatsAppChannel;
  prefs: PreferencesService;
  log: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
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
  deps: Pick<QuoteConsumerDeps, 'sms' | 'push' | 'whatsapp' | 'prefs' | 'log'>,
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

async function resolveDealOwner(
  tenantId: string,
  dealId: string
): Promise<{ ownerId?: string; email?: string; phone?: string; deviceToken?: string } | null> {
  const base = process.env.CRM_SERVICE_URL ?? 'http://localhost:3001/api/v1';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    const res = (await fetch(`${base}/deals/${dealId}`, {
      headers: {
        'x-internal-service': 'notification-service',
        'x-tenant-id': tenantId,
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer))) as unknown as {
      ok: boolean;
      json: () => Promise<unknown>;
    };
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: unknown };
    const body = (json.data ?? json) as {
      ownerId?: string;
      owner?: {
        email?: string;
        phone?: string;
        phoneNumber?: string;
        deviceToken?: string;
        pushToken?: string;
      };
    };
    return {
      ownerId: body?.ownerId,
      email: body?.owner?.email,
      phone: body?.owner?.phone ?? body?.owner?.phoneNumber,
      deviceToken: body?.owner?.deviceToken ?? body?.owner?.pushToken,
    };
  } catch {
    return null;
  }
}

/**
 * Quote lifecycle → sales-owner notifications.
 */
export async function startQuoteConsumer(
  deps: QuoteConsumerDeps
): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('notification-service.quotes');

  consumer.on('quote.sent', async (event) => {
    if (event.type !== 'quote.sent') return;
    const info = await resolveDealOwner(event.tenantId, event.payload.dealId);
    if (!info?.ownerId) return;
    const title = 'Quote sent';
    const body = `Quote ${event.payload.quoteId} was sent to the customer (${event.payload.recipientEmail ?? 'no email'}).`;
    await deps.inApp.send({
      tenantId: event.tenantId,
      userId: info.ownerId,
      type: 'quote.sent',
      title,
      body,
      entityType: 'Quote',
      entityId: event.payload.quoteId,
      actionUrl: `/quotes/${event.payload.quoteId}`,
    });
  });

  consumer.on('quote.accepted', async (event) => {
    if (event.type !== 'quote.accepted') return;
    const info = await resolveDealOwner(event.tenantId, event.payload.dealId);
    if (!info?.ownerId) return;
    const title = '✅ Quote accepted';
    const body = `Customer accepted quote ${event.payload.quoteId} for ${event.payload.total} ${event.payload.currency}.`;
    await deps.inApp.send({
      tenantId: event.tenantId,
      userId: info.ownerId,
      type: 'quote.accepted',
      title,
      body,
      entityType: 'Quote',
      entityId: event.payload.quoteId,
      actionUrl: `/quotes/${event.payload.quoteId}`,
    });
    if (
      info.email &&
      (await deps.prefs.isChannelEnabled(event.tenantId, info.ownerId, 'EMAIL'))
    ) {
      await deps.email.send({
        to: info.email,
        subject: title,
        html: renderActionEmail({
          heading: title,
          body,
          actionLabel: 'View quote',
          actionUrl: `/quotes/${event.payload.quoteId}`,
        }),
      });
    }
    await fanOutSmsPush(
      deps,
      { tenantId: event.tenantId, userId: info.ownerId, phone: info.phone, deviceToken: info.deviceToken },
      { title, body, actionUrl: `/quotes/${event.payload.quoteId}` }
    );
  });

  consumer.on('quote.rejected', async (event) => {
    if (event.type !== 'quote.rejected') return;
    const info = await resolveDealOwner(event.tenantId, event.payload.dealId);
    if (!info?.ownerId) return;
    const title = 'Quote rejected';
    const body = `Customer rejected quote ${event.payload.quoteId}: ${event.payload.reason}.`;
    await deps.inApp.send({
      tenantId: event.tenantId,
      userId: info.ownerId,
      type: 'quote.rejected',
      title,
      body,
      entityType: 'Quote',
      entityId: event.payload.quoteId,
      actionUrl: `/quotes/${event.payload.quoteId}`,
    });
  });

  await consumer.subscribe([TOPICS.QUOTES]);
  await consumer.start();
  return consumer;
}
