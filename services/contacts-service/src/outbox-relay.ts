import type { FastifyBaseLogger } from 'fastify';
import { NexusProducer, TOPICS } from '@nexus/kafka';
import type { ContactsPrisma } from './prisma.js';

/**
 * Inline outbox relay for contacts-service.
 *
 * The write path records OutboxMessage rows inside the same transaction as the
 * domain mutation (transactional outbox), but nothing drained them — so
 * merge/archive/document events silently never reached Kafka (the parallel
 * direct `producer.publish` on createContact is fire-and-forget and only covers
 * `contact.created`). This poller closes that gap: it periodically reads PENDING
 * rows and publishes them via the shared NexusProducer, marking them SENT.
 *
 * Guarantees / guards:
 *  - Fully guarded: a Kafka or DB hiccup logs and returns; it never throws out of
 *    the interval callback, so the service cannot be crashed by the relay.
 *  - Reentrancy guard: overlapping ticks are skipped while a poll is in flight.
 *  - Failure handling: a row that fails to publish is left PENDING (so it is
 *    retried on the next tick) until it exceeds MAX_ATTEMPTS, after which it is
 *    marked FAILED with the error so it stops blocking the queue.
 */

const POLL_INTERVAL_MS = Number(process.env.CONTACTS_OUTBOX_POLL_MS ?? 5_000);
const BATCH_SIZE = Number(process.env.CONTACTS_OUTBOX_BATCH ?? 100);
const MAX_ATTEMPTS = Number(process.env.CONTACTS_OUTBOX_MAX_ATTEMPTS ?? 10);

// All outbox topic strings written by contacts.service map to the contacts
// Kafka topic; the stored `topic` string is used as the event `type`.
function resolveKafkaTopic(_storedTopic: string): string {
  return TOPICS.CONTACTS;
}

interface OutboxRow {
  id: string;
  topic: string;
  tenantId: string | null;
  payload: unknown;
  headers: unknown;
  aggregateId: string | null;
  correlationId: string | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function attemptsOf(headers: unknown): number {
  const n = asRecord(headers).__attempts;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

export interface OutboxRelayHandle {
  stop(): void;
  /** Run a single drain pass (used by tests / graceful shutdown). */
  drainOnce(): Promise<void>;
}

export function startOutboxRelay(
  prisma: ContactsPrisma,
  producer: NexusProducer,
  log: FastifyBaseLogger
): OutboxRelayHandle {
  let running = false;
  let stopped = false;

  async function drainOnce(): Promise<void> {
    if (running || stopped) return;
    running = true;
    try {
      const rows = (await prisma.outboxMessage.findMany({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        take: BATCH_SIZE,
      })) as OutboxRow[];

      for (const row of rows) {
        const tenantId =
          row.tenantId ?? (typeof asRecord(row.payload).tenantId === 'string'
            ? (asRecord(row.payload).tenantId as string)
            : '');
        try {
          await producer.publish(resolveKafkaTopic(row.topic), {
            type: row.topic,
            tenantId,
            correlationId: row.correlationId ?? row.id,
            payload: row.payload,
          });
          await prisma.outboxMessage.update({
            where: { id: row.id },
            data: { status: 'SENT', sentAt: new Date() },
          });
        } catch (err) {
          const attempts = attemptsOf(row.headers) + 1;
          const message = err instanceof Error ? err.message : String(err);
          const giveUp = attempts >= MAX_ATTEMPTS;
          // Leave PENDING for retry until MAX_ATTEMPTS, then FAILED so a poison
          // row does not block the queue forever. Persist the attempt counter
          // in the headers JSON (no dedicated column exists).
          await prisma.outboxMessage
            .update({
              where: { id: row.id },
              data: {
                status: giveUp ? 'FAILED' : 'PENDING',
                error: message,
                headers: { ...asRecord(row.headers), __attempts: attempts },
              },
            })
            .catch((updateErr) => {
              log.warn({ err: updateErr, id: row.id }, 'outbox: failed to record publish failure');
            });
          log.warn(
            { err: message, id: row.id, topic: row.topic, attempts, giveUp },
            'outbox: publish failed'
          );
        }
      }
    } catch (err) {
      // DB hiccup (or Kafka producer not connected) — log and try again next tick.
      log.warn({ err }, 'outbox: drain pass failed');
    } finally {
      running = false;
    }
  }

  const interval = setInterval(() => {
    void drainOnce();
  }, POLL_INTERVAL_MS);
  // Do not keep the event loop alive solely for the relay.
  if (typeof interval.unref === 'function') interval.unref();

  log.info({ pollIntervalMs: POLL_INTERVAL_MS, batchSize: BATCH_SIZE }, 'contacts outbox relay started');

  return {
    stop() {
      stopped = true;
      clearInterval(interval);
    },
    drainOnce,
  };
}
