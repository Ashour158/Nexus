import { NexusConsumer, TOPICS } from '@nexus/kafka';
import type { InAppChannel } from '../channels/in-app.channel.js';
import type { EmailChannel } from '../channels/email.channel.js';
import { renderActionEmail } from '../channels/email.channel.js';

interface OwnerLookup {
  (tenantId: string, userId: string): Promise<{ email?: string; name?: string }>;
}

interface DealConsumerDeps {
  inApp: InAppChannel;
  email: EmailChannel;
  lookupOwner: OwnerLookup;
  log: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
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
  });

  consumer.on('deal.stage_changed', async (event) => {
    if (event.type !== 'deal.stage_changed') return;
    const { payload } = event;
    // Enrich against the CRM service to check whether the deal has been in the
    // stage longer than the stage's `rottenDays`. If so, surface a prompt.
    const base = process.env.CRM_SERVICE_URL ?? 'http://localhost:3001/api/v1';
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5_000);
      const res = (await fetch(`${base}/deals/${payload.dealId}`, {
        headers: { 'x-internal-service': 'notification-service' },
        signal: controller.signal,
      }).finally(() => clearTimeout(timer))) as unknown as {
        ok: boolean;
        status: number;
        json: () => Promise<unknown>;
      };
      if (!res.ok) throw new Error(`CRM ${res.status}`);
      const json = (await res.json()) as { data?: unknown };
      const body = (json.data ?? json) as {
        stage?: { rottenDays?: number };
        stageEnteredAt?: string;
      };
      const rottenDays: number | undefined = body?.stage?.rottenDays;
      const stageEnteredAt = body?.stageEnteredAt
        ? new Date(body.stageEnteredAt).getTime()
        : null;
      if (rottenDays && stageEnteredAt) {
        const daysInStage = Math.floor(
          (Date.now() - stageEnteredAt) / (1000 * 60 * 60 * 24)
        );
        if (daysInStage > rottenDays) {
          await deps.inApp.send({
            tenantId: event.tenantId,
            userId: payload.ownerId,
            type: 'deal.rotten',
            title: '⏰ Deal is stalling',
            body: `Deal ${payload.dealId} has been in stage for ${daysInStage} days (limit ${rottenDays}). Time to nudge it.`,
            entityType: 'Deal',
            entityId: payload.dealId,
            actionUrl: `/deals/${payload.dealId}`,
            metadata: { daysInStage, rottenDays },
          });
        }
      }
    } catch (err) {
      deps.log.warn(
        { err },
        'Could not enrich deal.stage_changed; skipping rotten-deal check'
      );
    }
  });

  await consumer.subscribe([TOPICS.DEALS]);
  await consumer.start();
  return consumer;
}
