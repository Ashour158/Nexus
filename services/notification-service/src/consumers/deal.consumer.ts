import { NexusConsumer, TOPICS } from '@nexus/kafka';
import type { InAppChannel } from '../channels/in-app.channel.js';
import type { EmailChannel } from '../channels/email.channel.js';
import type { SmsChannel } from '../channels/sms.channel.js';
import type { PushChannel } from '../channels/push.channel.js';
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
  lookupOwner: OwnerLookup;
  log: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
}

/**
 * Best-effort SMS + push fan-out. Each channel is already a guarded no-op when
 * unconfigured; this helper additionally isolates any unexpected failure so one
 * channel can never block the other or the consumer.
 */
async function fanOutSmsPush(
  deps: Pick<DealConsumerDeps, 'sms' | 'push' | 'log'>,
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
  ]);
}

/**
 * Deal events → notifications. Handles deal.won / deal.lost /
 * deal.stage_changed (with rotten-deal detection against the CRM service).
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

  await consumer.subscribe([TOPICS.DEALS]);
  await consumer.start();
  return consumer;
}
