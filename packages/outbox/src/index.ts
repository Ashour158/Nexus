/**
 * Nexus Outbox — Transactional Outbox pattern.
 *
 * Usage:
 *   import { OutboxWriter } from '@nexus/outbox';
 *   const outbox = new OutboxWriter(prisma);
 *   await outbox.withTransaction(async (tx) => {
 *     tx.contact.create({...});
 *     outbox.schedule(tx, { topic: 'contact.created', payload: {...} });
 *   });
 */

import { TOPICS } from '@nexus/kafka';

export interface OutboxTransactionClient {
  $executeRaw: (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<unknown>;
}

export interface OutboxPrismaClient {
  $transaction<T>(
    fn: (tx: OutboxTransactionClient) => Promise<T>
  ): Promise<T>;
}

const VALID_TOPICS = new Set<string>(Object.values(TOPICS));

function validateTopic(topic: string): void {
  if (!VALID_TOPICS.has(topic)) {
    throw new Error(
      `Outbox: topic "${topic}" is not a known Nexus topic. ` +
        `Valid topics: ${Object.values(TOPICS).join(', ')}`
    );
  }
}

export interface OutboxMessage {
  topic: string;
  payload: Record<string, unknown>;
  aggregateId?: string;
  correlationId?: string;
  headers?: Record<string, string>;
}

export class OutboxWriter {
  constructor(private prisma: OutboxPrismaClient) {}

  async schedule(
    tx: OutboxTransactionClient,
    message: OutboxMessage
  ): Promise<void> {
    validateTopic(message.topic);
    // "updatedAt" is NOT NULL with no DB default and must be set explicitly on
    // this raw INSERT (see note in OutboxPublisher.publish).
    await tx.$executeRaw`
      INSERT INTO "OutboxMessage" (
        id, topic, payload, "aggregateId", "correlationId", headers, status, "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(),
        ${message.topic},
        ${JSON.stringify(message.payload)}::jsonb,
        ${message.aggregateId ?? null},
        ${message.correlationId ?? null},
        ${JSON.stringify(message.headers ?? {})}::jsonb,
        'PENDING',
        NOW(),
        NOW()
      )
    `;
  }

  async withTransaction<T>(
    fn: (tx: OutboxTransactionClient, outbox: OutboxWriter) => Promise<T>
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      return fn(tx, this);
    });
  }
}

/**
 * OutboxPublisher — Convenience wrapper used by Prisma extensions.
 *
 * Accepts a client shape with `$executeRawUnsafe` so it can be driven by
 * either a real PrismaClient or a transaction client proxy.
 */
export class OutboxPublisher {
  constructor(private serviceName: string) {}

  async publish(
    tx: { $executeRawUnsafe: (sql: string, ...values: unknown[]) => Promise<unknown> },
    topic: string,
    payload: unknown,
    meta: { eventType: string; tenantId: string; correlationId?: string; aggregateId?: string }
  ): Promise<void> {
    validateTopic(topic);
    // NOTE: "updatedAt" is NOT NULL with no DB default (Prisma manages @updatedAt
    // at the ORM layer, which this raw INSERT bypasses) — it must be set here or
    // every outbox write fails the not-null constraint. Only columns present in
    // EVERY service's OutboxMessage table are used here; eventType/tenantId live
    // in the headers JSON (some services' tables predate those columns).
    const sql = `
      INSERT INTO "OutboxMessage" (
        id, topic, payload, "aggregateId", "correlationId", headers, status, "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(),
        $1,
        $2::jsonb,
        $3,
        $4,
        $5::jsonb,
        'PENDING',
        NOW(),
        NOW()
      )
    `;
    await tx.$executeRawUnsafe(
      sql,
      topic,
      JSON.stringify(payload),
      meta.aggregateId ?? null,
      meta.correlationId ?? meta.eventType,
      JSON.stringify({ eventType: meta.eventType, source: this.serviceName, tenantId: meta.tenantId })
    );
  }
}
