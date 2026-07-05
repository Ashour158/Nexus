import { NexusConsumer, TOPICS } from '@nexus/kafka';
import type { InAppChannel } from '../channels/in-app.channel.js';

interface NoteConsumerDeps {
  inApp: InAppChannel;
  log: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
}

/**
 * Payload shape of the `note.mentioned` event emitted by notes-service
 * (see services/notes-service/src/services/mentions.service.ts, `notifyMentions`).
 * One event is published per newly-mentioned user. `note.mentioned` is not part
 * of the shared `NexusKafkaEvent` union, so we describe its payload locally and
 * read it defensively.
 */
interface NoteMentionedPayload {
  userId?: string;
  title?: string;
  body?: string;
  entityType?: string;
  entityId?: string;
  actionUrl?: string;
  noteId?: string;
  authorId?: string;
}

/**
 * Note events → in-app notifications. `note.mentioned` turns a teammate @mention
 * into a persisted in-app Notification for the mentioned user (the in-app channel
 * additionally re-publishes `notification.created` on TOPICS.NOTIFICATIONS so
 * realtime-service can push a WebSocket frame).
 *
 * This consumer subscribes to TOPICS.NOTIFICATIONS but ONLY handles the
 * `note.mentioned` domain event — it deliberately does NOT register a handler for
 * `notification.created`, which the in-app channel re-publishes on the same topic;
 * consuming that here would create a persist → re-publish → persist loop.
 *
 * The NexusConsumer dedupes by eventId, and we guard on required fields so a
 * malformed event can never throw and stall the loop.
 */
export async function startNoteConsumer(deps: NoteConsumerDeps): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('notification-service.notes');

  consumer.on('note.mentioned', async (event) => {
    const evt = event as { tenantId: string; payload?: unknown };
    const payload = (evt.payload ?? {}) as NoteMentionedPayload;
    if (!payload.userId) return;
    await deps.inApp.send({
      tenantId: evt.tenantId,
      userId: payload.userId,
      type: 'NOTE_MENTION',
      title: payload.title ?? 'You were mentioned in a note',
      body: payload.body ?? '',
      entityType: payload.entityType ?? 'note',
      entityId: payload.entityId ?? payload.noteId,
      actionUrl: payload.actionUrl ?? '/notes',
      metadata: { noteId: payload.noteId, authorId: payload.authorId },
    });
  });

  await consumer.subscribe([TOPICS.NOTIFICATIONS]);
  await consumer.start();
  return consumer;
}
