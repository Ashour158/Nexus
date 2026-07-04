import { NexusProducer, TOPICS } from '@nexus/kafka';

/**
 * Fire-and-forget lifecycle event emission for storage-service (additive,
 * fail-open). Wraps a single lazily-connected {@link NexusProducer}. Every
 * publish is guarded so event emission can NEVER crash an upload/download/delete
 * handler or a poller tick — a Kafka outage degrades to "no event" rather than
 * a failed upload.
 *
 * File lifecycle events (`file.uploaded`, `file.deleted`) are emitted on
 * {@link TOPICS.INTEGRATION} (`nexus.integration.events`), the generic
 * cross-service topic that entity timelines and search-service key off to
 * surface attachments against the parent DEAL / CONTACT / ACCOUNT / LEAD / QUOTE.
 */

let producer: NexusProducer | null = null;

/** Lazily construct + connect the shared producer. Never throws. */
export async function getStorageProducer(): Promise<NexusProducer | null> {
  try {
    if (!producer) producer = new NexusProducer('storage-service');
    if (!producer.isConnected()) await producer.connect();
    return producer;
  } catch (err) {
    console.warn('[storage-events] producer connect failed; continuing without events', err);
    return null;
  }
}

/** Disconnect on shutdown. Never throws. */
export async function disconnectStorageProducer(): Promise<void> {
  try {
    await producer?.disconnect();
  } catch {
    /* ignore */
  }
}

/**
 * Emit a single file lifecycle event on {@link TOPICS.INTEGRATION}. Fully guarded —
 * a failure here is logged and swallowed, never propagated to the caller.
 */
export async function emitFileEvent(
  type: 'file.uploaded' | 'file.deleted',
  tenantId: string,
  payload: Record<string, unknown>,
  opts: { correlationId?: string } = {}
): Promise<void> {
  try {
    const p = await getStorageProducer();
    if (!p) return;
    await p.publish(TOPICS.INTEGRATION, {
      type,
      tenantId,
      correlationId: opts.correlationId,
      payload,
    });
  } catch (err) {
    console.warn(`[storage-events] failed to emit ${type}`, err);
  }
}
