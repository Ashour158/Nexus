import { NexusConsumer, TOPICS } from '@nexus/kafka';
import type { InAppChannel } from '../channels/in-app.channel.js';
import type { EmailChannel } from '../channels/email.channel.js';
import { renderActionEmail } from '../channels/email.channel.js';

interface QuoteConsumerDeps {
  inApp: InAppChannel;
  email: EmailChannel;
  log: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
}

async function resolveDealOwner(
  tenantId: string,
  dealId: string
): Promise<{ ownerId?: string; email?: string } | null> {
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
      owner?: { email?: string };
    };
    return { ownerId: body?.ownerId, email: body?.owner?.email };
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
    if (info.email) {
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
