import { NexusConsumer, TOPICS } from '@nexus/kafka';
import type { InAppChannel } from '../channels/in-app.channel.js';
import type { EmailChannel } from '../channels/email.channel.js';
import type { SmsChannel } from '../channels/sms.channel.js';
import type { PushChannel } from '../channels/push.channel.js';
import type { WhatsAppChannel } from '../channels/whatsapp.channel.js';
import { renderActionEmail } from '../channels/email.channel.js';

interface OwnerLookup {
  (
    tenantId: string,
    userId: string
  ): Promise<{ email?: string; name?: string; phone?: string; deviceToken?: string }>;
}

interface DealConsumerDeps {
  inApp: InAppChannel;
  email: EmailChannel;
  sms: SmsChannel;
  push: PushChannel;
  whatsapp: WhatsAppChannel;
  lookupOwner: OwnerLookup;
  log: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
}

/**
 * Best-effort SMS + push + WhatsApp fan-out. Each channel is already a guarded
 * no-op when unconfigured; this helper additionally isolates any unexpected
 * failure so one channel can never block the other or the consumer. WhatsApp
 * reuses the recipient's phone number and is only attempted when the channel is
 * configured.
 */
async function fanOutSmsPush(
  deps: Pick<DealConsumerDeps, 'sms' | 'push' | 'whatsapp' | 'log'>,
  target: { phone?: string; deviceToken?: string },
  msg: { title: string; body: string; actionUrl?: string }
): Promise<void> {
  await Promise.allSettled([
    target.phone
      ? deps.sms
          .send({ to: target.phone, body: `${msg.title}: ${msg.body}` })
          .catch((err) => deps.log.error({ err }, 'sms fan-out failed'))
      : Promise.resolve(),
    target.deviceToken
      ? deps.push
          .send({
            to: target.deviceToken,
            title: msg.title,
            body: msg.body,
            actionUrl: msg.actionUrl,
          })
          .catch((err) => deps.log.error({ err }, 'push fan-out failed'))
      : Promise.resolve(),
    target.phone && deps.whatsapp.isConfigured()
      ? deps.whatsapp
          .send({ to: target.phone, body: `${msg.title}: ${msg.body}` })
          .catch((err) => deps.log.error({ err }, 'whatsapp fan-out failed'))
      : Promise.resolve(),
  ]);
}

/**
 * Payload shape of the `deal.rotten` event as emitted by crm-service's
 * rotten-deals poller (see services/crm-service/src/lib/rotten-deals.poller.ts).
 * `deal.rotten` is not part of the shared `NexusKafkaEvent` union, so we describe
 * its payload locally and read it defensively.
 */
interface DealRottenPayload {
  dealId?: string;
  ownerId?: string;
  accountId?: string;
  stageId?: string;
  idleDays?: number;
  rottenDays?: number;
  detectedAt?: string;
}

/**
 * Deal events → notifications. Handles deal.won / deal.lost /
 * deal.stage_changed (with rotten-deal detection against the CRM service) and
 * deal.rotten (emitted asynchronously by the crm-service rotten-deals poller).
 */
export async function startDealConsumer(deps: DealConsumerDeps): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('notification-service.deals');

  consumer.on('deal.won', async (event) => {
    if (event.type !== 'deal.won') return;
    const { payload } = event;
    const owner = await deps.lookupOwner(event.tenantId, payload.ownerId);
    const title = '🎉 Deal won';
    const body = `Congrats! You closed deal ${payload.dealId} for ${payload.amount} ${payload.currency ?? 'USD'}.`;
    await deps.inApp.send({
      tenantId: event.tenantId,
      userId: payload.ownerId,
      type: 'deal.won',
      title,
      body,
      entityType: 'Deal',
      entityId: payload.dealId,
      actionUrl: `/deals/${payload.dealId}`,
      metadata: { amount: payload.amount, currency: payload.currency },
    });
    if (owner.email) {
      await deps.email.send({
        to: owner.email,
        subject: title,
        html: renderActionEmail({
          heading: title,
          body,
          actionLabel: 'View deal',
          actionUrl: `/deals/${payload.dealId}`,
        }),
      });
    }
    await fanOutSmsPush(deps, owner, {
      title,
      body,
      actionUrl: `/deals/${payload.dealId}`,
    });
  });

  consumer.on('deal.lost', async (event) => {
    if (event.type !== 'deal.lost') return;
    const { payload } = event;
    const title = 'Deal lost';
    const body = `Deal ${payload.dealId} was marked lost${payload.reason ? ` (${payload.reason})` : ''}.`;
    await deps.inApp.send({
      tenantId: event.tenantId,
      userId: payload.ownerId,
      type: 'deal.lost',
      title,
      body,
      entityType: 'Deal',
      entityId: payload.dealId,
      actionUrl: `/deals/${payload.dealId}`,
    });
    const owner = await deps.lookupOwner(event.tenantId, payload.ownerId);
    if (owner.email) {
      await deps.email.send({
        to: owner.email,
        subject: title,
        html: renderActionEmail({
          heading: title,
          body,
          actionLabel: 'View deal',
          actionUrl: `/deals/${payload.dealId}`,
        }),
      });
    }
    await fanOutSmsPush(deps, owner, {
      title,
      body,
      actionUrl: `/deals/${payload.dealId}`,
    });
  });

  consumer.on('deal.stage_changed', async (event) => {
    if (event.type !== 'deal.stage_changed') return;
    const { payload } = event;
    // Architectural fix: rotten-deal data must travel in the event payload.
    // Services must NOT make synchronous HTTP calls inside consumers — it creates
    // temporal coupling and failure cascades.
    const rottenDays = payload.rottenDays;
    const stageChangedAt = payload.stageChangedAt
      ? new Date(payload.stageChangedAt).getTime()
      : null;
    if (rottenDays && stageChangedAt) {
      const daysInStage = Math.floor(
        (Date.now() - stageChangedAt) / (1000 * 60 * 60 * 24)
      );
      if (daysInStage > rottenDays) {
        const title = '⏰ Deal is stalling';
        const body = `Deal ${payload.dealId} has been in stage for ${daysInStage} days (limit ${rottenDays}). Time to nudge it.`;
        await deps.inApp.send({
          tenantId: event.tenantId,
          userId: payload.ownerId,
          type: 'deal.rotten',
          title,
          body,
          entityType: 'Deal',
          entityId: payload.dealId,
          actionUrl: `/deals/${payload.dealId}`,
          metadata: { daysInStage, rottenDays },
        });
        const owner = await deps.lookupOwner(event.tenantId, payload.ownerId);
        await fanOutSmsPush(deps, owner, {
          title,
          body,
          actionUrl: `/deals/${payload.dealId}`,
        });
      }
    }
  });

  // `deal.rotten` is published once per rotten-crossing by the crm-service
  // rotten-deals poller. The NexusConsumer already dedupes by eventId, so this
  // won't spam on every poll; we additionally guard on required fields so a
  // malformed event can never throw and stall the loop.
  consumer.on('deal.rotten', async (event) => {
    // `deal.rotten` is not in the shared NexusKafkaEvent union, so we read the
    // event shape generically. The handler is only dispatched for this type.
    const evt = event as { tenantId: string; payload?: unknown };
    const payload = (evt.payload ?? {}) as DealRottenPayload;
    if (!payload.dealId || !payload.ownerId) return;
    const idleDays = payload.idleDays;
    const rottenDays = payload.rottenDays;
    const idlePhrase =
      typeof idleDays === 'number'
        ? `has been idle for ${idleDays} day${idleDays === 1 ? '' : 's'}`
        : 'has gone stale';
    const limitPhrase =
      typeof rottenDays === 'number' ? ` (threshold ${rottenDays} days)` : '';
    const title = '⏰ Deal has gone rotten';
    const body = `Deal ${payload.dealId} ${idlePhrase}${limitPhrase}. Time to follow up.`;
    await deps.inApp.send({
      tenantId: evt.tenantId,
      userId: payload.ownerId,
      type: 'DEAL_ROTTEN',
      title,
      body,
      entityType: 'deal',
      entityId: payload.dealId,
      actionUrl: `/deals/${payload.dealId}`,
      metadata: {
        idleDays,
        rottenDays,
        stageId: payload.stageId,
        accountId: payload.accountId,
        detectedAt: payload.detectedAt,
      },
    });
    const owner = await deps.lookupOwner(evt.tenantId, payload.ownerId);
    if (owner.email) {
      await deps.email.send({
        to: owner.email,
        subject: title,
        html: renderActionEmail({
          heading: title,
          body,
          actionLabel: 'View deal',
          actionUrl: `/deals/${payload.dealId}`,
        }),
      });
    }
    await fanOutSmsPush(deps, owner, {
      title,
      body,
      actionUrl: `/deals/${payload.dealId}`,
    });
  });

  await consumer.subscribe([TOPICS.DEALS]);
  await consumer.start();
  return consumer;
}
