import { getKafkaClient, TOPICS } from '@nexus/kafka';
import type { AuditEvent } from '@nexus/audit';
import { PrismaClient } from '../../../node_modules/.prisma/audit-consumer-client/index.js';
import type { Consumer, EachMessagePayload } from 'kafkajs';

const TOPIC = TOPICS.AUDIT;

export class AuditConsumer {
  private consumer: Consumer;
  private prisma: PrismaClient;
  private running = false;

  constructor(groupId: string) {
    this.consumer = getKafkaClient().consumer({
      groupId,
      sessionTimeout: 30_000,
      heartbeatInterval: 3_000,
    });
    this.prisma = new PrismaClient({
      log: ['error'],
    });
  }

  async start(): Promise<void> {
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: TOPIC, fromBeginning: false });
    this.running = true;

    await this.consumer.run({
      autoCommit: false,
      eachMessage: async (payload: EachMessagePayload) => {
        const { topic, partition, message } = payload;
        try {
          await this.processMessage(message);
          await this.consumer.commitOffsets([
            {
              topic,
              partition,
              offset: (BigInt(message.offset) + 1n).toString(),
            },
          ]);
        } catch (err) {
          console.error('AuditConsumer: failed to process message', {
            topic,
            partition,
            offset: message.offset,
            error: err instanceof Error ? err.message : String(err),
          });
          // Do not throw — malformed / bad messages must not crash the consumer.
          // Offset is not committed, so the message will be retried.
        }
      },
    });
  }

  private async processMessage(message: EachMessagePayload['message']): Promise<void> {
    if (!message.value) {
      console.warn('AuditConsumer: empty message value, skipping');
      return;
    }

    let event: AuditEvent;
    try {
      event = JSON.parse(message.value.toString()) as AuditEvent;
    } catch (err) {
      console.error('AuditConsumer: failed to parse message', err);
      return;
    }

    // Basic validation — reject gracefully if required fields are missing
    if (!event.id || !event.tenantId || !event.actorId || !event.action || !event.resource) {
      console.warn('AuditConsumer: malformed audit event, skipping', {
        id: event.id,
        tenantId: event.tenantId,
        action: event.action,
      });
      return;
    }

    // Idempotency: skip if already exists
    const existing = await this.prisma.auditLog.findUnique({
      where: { id: event.id },
      select: { id: true },
    });

    if (existing) {
      console.debug(`AuditConsumer: skipping already-processed event ${event.id}`);
      return;
    }

    // Build metadata object from event fields and Kafka headers
    const metadata: Record<string, unknown> = {
      ...(event.metadata ?? {}),
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
    };

    // Append-only write (no UPDATE/DELETE operations)
    await this.prisma.auditLog.create({
      data: {
        id: event.id,
        tenantId: event.tenantId,
        actorId: event.actorId,
        actorType: event.actorType,
        action: event.action,
        resource: event.resource,
        resourceId: event.resourceId ?? null,
        changes: event.changes as any,
        metadata: metadata as any,
        timestamp: event.timestamp ? new Date(event.timestamp) : new Date(),
        correlationId: message.headers?.correlationId?.toString() ?? null,
      },
    });
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.consumer.disconnect();
    await this.prisma.$disconnect();
  }

  isRunning(): boolean {
    return this.running;
  }
}
