#!/usr/bin/env tsx
/**
 * Outbox Relay Worker — Polls OutboxMessage table and publishes to Kafka.
 */
import { PrismaClient } from '@prisma/client';
import { Kafka, Partitioners } from 'kafkajs';

const prisma = new PrismaClient();
const kafka = new Kafka({
  clientId: 'outbox-relay',
  brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
});
const producer = kafka.producer({
  createPartitioner: Partitioners.DefaultPartitioner,
  idempotent: true,
});

const POLL_INTERVAL_MS = Number(process.env.OUTBOX_POLL_INTERVAL ?? 1000);
const BATCH_SIZE = Number(process.env.OUTBOX_BATCH_SIZE ?? 100);

async function processBatch(): Promise<number> {
  // Recover messages stuck in PROCESSING for more than 5 minutes
  await prisma.$executeRaw`
    UPDATE "OutboxMessage"
    SET status = 'PENDING', "updatedAt" = NOW()
    WHERE status = 'PROCESSING' AND "updatedAt" < NOW() - INTERVAL '5 minutes'
  `;

  const messages = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`
      SELECT id, topic, payload::text, "aggregateId", "correlationId", headers::text
      FROM "OutboxMessage"
      WHERE status = 'PENDING'
      ORDER BY "createdAt" ASC
      LIMIT ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    `;
    if (!Array.isArray(rows) || rows.length === 0) return [];

    const ids = (rows as { id: string }[]).map((r) => r.id);
    await tx.$executeRaw`
      UPDATE "OutboxMessage"
      SET status = 'PROCESSING', "updatedAt" = NOW()
      WHERE id = ANY(${ids}::uuid[])
    `;
    return rows as Array<{
      id: string;
      topic: string;
      payload: string;
      aggregateId: string | null;
      correlationId: string | null;
      headers: string;
    }>;
  });

  if (messages.length === 0) return 0;

  for (const msg of messages) {
    try {
      await producer.send({
        topic: msg.topic,
        messages: [
          {
            key: msg.aggregateId ?? msg.id,
            value: msg.payload,
            headers: {
              ...JSON.parse(msg.headers),
              'x-correlation-id': msg.correlationId ?? msg.id,
            },
          },
        ],
      });

      await prisma.$executeRaw`
        UPDATE "OutboxMessage"
        SET status = 'SENT', "sentAt" = NOW(), "updatedAt" = NOW()
        WHERE id = ${msg.id}
      `;
    } catch (err) {
      console.error(`Failed to publish ${msg.id}:`, (err as Error).message);
      await prisma.$executeRaw`
        UPDATE "OutboxMessage"
        SET status = 'FAILED', error = ${(err as Error).message}, "updatedAt" = NOW()
        WHERE id = ${msg.id}
      `;
    }
  }

  return messages.length;
}

let running = true;

async function main() {
  await producer.connect();
  console.log('Outbox relay started');

  // Graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down outbox relay...');
    running = false;
    await producer.disconnect();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  while (running) {
    try {
      const count = await processBatch();
      if (count === 0) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }
    } catch (err) {
      console.error('Batch error:', (err as Error).message);
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
