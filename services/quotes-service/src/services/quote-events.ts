import { NexusProducer, TOPICS } from '@nexus/kafka';

/**
 * Fire-and-forget lifecycle event emission for quotes-service (additive,
 * fail-open). Wraps a single lazily-connected {@link NexusProducer}. Every
 * publish is guarded so event emission can never crash a request handler or a
 * poller tick — a Kafka outage degrades to "no event" rather than a 500.
 *
 * The local Prisma extension (src/prisma.ts) already mirrors row writes onto
 * the outbox as generic `quote.updated`; this producer emits the *intent-typed*
 * lifecycle events (`quote.accepted`, `quote.expired`, ...) that analytics,
 * crm finance-timeline, and deals quote-projection consumers key off, and the
 * finance/billing acceptance handoff.
 */

let producer: NexusProducer | null = null;

/** Lazily construct + connect the shared producer. Never throws. */
export async function getQuoteProducer(): Promise<NexusProducer | null> {
  try {
    if (!producer) producer = new NexusProducer('quotes-service');
    if (!producer.isConnected()) await producer.connect();
    return producer;
  } catch (err) {
    console.warn('[quote-events] producer connect failed; continuing without events', err);
    return null;
  }
}

/** Disconnect on shutdown. Never throws. */
export async function disconnectQuoteProducer(): Promise<void> {
  try {
    await producer?.disconnect();
  } catch {
    /* ignore */
  }
}

/**
 * Emit a single lifecycle event on {@link TOPICS.QUOTES}. Fully guarded.
 */
export async function emitQuoteEvent(
  type: string,
  tenantId: string,
  payload: Record<string, unknown>,
  opts: { correlationId?: string } = {}
): Promise<void> {
  try {
    const p = await getQuoteProducer();
    if (!p) return;
    await p.publish(TOPICS.QUOTES, {
      type,
      tenantId,
      correlationId: opts.correlationId,
      payload,
    });
  } catch (err) {
    console.warn(`[quote-events] failed to emit ${type}`, err);
  }
}

/**
 * Acceptance handoff to finance/billing. When a quote is accepted we emit the
 * customer-facing `quote.accepted` (consumed by analytics / crm / deals) and,
 * on {@link TOPICS.CONTRACTS}, an `order.requested` handoff carrying the source
 * quote reference so finance-service's order/subscription authority can create
 * the downstream commercial record. Both are guarded and fire-and-forget.
 */
export async function emitAcceptanceHandoff(
  tenantId: string,
  payload: Record<string, unknown>,
  opts: { correlationId?: string } = {}
): Promise<void> {
  await emitQuoteEvent('quote.accepted', tenantId, payload, opts);
  try {
    const p = await getQuoteProducer();
    if (!p) return;
    await p.publish(TOPICS.CONTRACTS, {
      type: 'order.requested',
      tenantId,
      correlationId: opts.correlationId,
      payload: {
        ...payload,
        sourceQuoteId: payload.quoteId,
        sourceQuoteNumber: payload.quoteNumber,
        reason: 'quote_accepted',
      },
    });
  } catch (err) {
    console.warn('[quote-events] failed to emit order.requested handoff', err);
  }
}
