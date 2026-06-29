import type { FastifyBaseLogger } from 'fastify';
import {
  PrismaClient,
  type Prisma,
} from '../../../node_modules/.prisma/outbox-relay-client/index.js';
import type { Producer } from 'kafkajs';

export interface OutboxMessage {
  id: string;
  topic: string;
  key: string | null;
  payload: unknown;
  headers: unknown;
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  createdAt: Date;
  processedAt: Date | null;
  error: string | null;
  retryCount: number;
}

export interface ServiceConnection {
  name: string;
  prisma: PrismaClient;
}

export interface RelayOptions {
  producer: Producer;
  services: ServiceConnection[];
  log: FastifyBaseLogger;
  pollIntervalMs: number;
  batchSize: number;
  maxRetries: number;
  dlqEnabled: boolean;
}

export class OutboxRelay {
  private producer: Producer;
  private services: ServiceConnection[];
  private log: FastifyBaseLogger;
  private pollIntervalMs: number;
  private batchSize: number;
  private maxRetries: number;
  private dlqEnabled: boolean;
  private intervals: NodeJS.Timeout[] = [];
  private running = false;

  constructor(opts: RelayOptions) {
    this.producer = opts.producer;
    this.services = opts.services;
    this.log = opts.log;
    this.pollIntervalMs = opts.pollIntervalMs;
    this.batchSize = opts.batchSize;
    this.maxRetries = opts.maxRetries;
    this.dlqEnabled = opts.dlqEnabled;
  }

  async start(): Promise<void> {
    this.running = true;
    await this.producer.connect();

    for (const svc of this.services) {
      this.pollService(svc).catch((err) => {
        this.log.error({ err, service: svc.name }, 'Initial poll failed');
      });

      const interval = setInterval(() => {
        if (!this.running) return;
        this.pollService(svc).catch((err) => {
          this.log.error({ err, service: svc.name }, 'Poll interval failed');
        });
      }, this.pollIntervalMs);

      this.intervals.push(interval);
    }

    this.log.info('OutboxRelay started');
  }

  async stop(): Promise<void> {
    this.running = false;
    for (const interval of this.intervals) {
      clearInterval(interval);
    }
    this.intervals = [];
    await this.producer.disconnect();
    await Promise.all(this.services.map((s) => s.prisma.$disconnect()));
    this.log.info('OutboxRelay stopped');
  }

  getServiceConnections(): ServiceConnection[] {
    return this.services;
  }

  private async pollService(svc: ServiceConnection): Promise<void> {
    const batchStart = Date.now();
    let messages: OutboxMessage[] = [];
    let lastErr: unknown;

    // Retry DB fetch with exponential backoff
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        messages = (await svc.prisma.outboxMessage.findMany({
          where: {
            processedAt: null,
            retryCount: { lt: 5 },
          },
          orderBy: { createdAt: 'asc' },
          take: this.batchSize,
        })) as OutboxMessage[];
        break;
      } catch (err) {
        lastErr = err;
        const delay = 500 * 2 ** attempt;
        this.log.warn(
          { err, service: svc.name, attempt: attempt + 1, delayMs: delay },
          'DB connection failure polling outbox, retrying'
        );
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    if (messages.length === 0) {
      if (lastErr) {
        this.log.warn(
          { err: lastErr, service: svc.name },
          'Giving up on outbox poll after retries'
        );
      }
      return;
    }

    this.log.info(
      { service: svc.name, count: messages.length },
      'Polled outbox messages'
    );

    const updates: Array<Prisma.PrismaPromise<OutboxMessage>> = [];

    for (const message of messages) {
      let published = false;
      let lastError: Error | undefined;

      try {
        await this.publishWithRetry(message);
        published = true;
        this.log.info(
          { service: svc.name, messageId: message.id, topic: message.topic },
          'Published outbox message'
        );
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        this.log.warn(
          { service: svc.name, messageId: message.id, error: lastError.message },
          'Failed to publish outbox message after retries'
        );
      }

      if (published) {
        updates.push(
          svc.prisma.outboxMessage.update({
            where: { id: message.id },
            data: { processedAt: new Date() },
          })
        );
      } else {
        const newRetryCount = message.retryCount + 1;
        updates.push(
          svc.prisma.outboxMessage.update({
            where: { id: message.id },
            data: {
              retryCount: { increment: 1 },
              error: lastError!.message,
            },
          })
        );

        if (newRetryCount >= 5) {
          this.log.error(
            { service: svc.name, messageId: message.id, topic: message.topic },
            'Message reached max retries'
          );
          if (this.dlqEnabled) {
            try {
              await this.sendToDLQ(message, lastError!);
            } catch (dlqErr) {
              this.log.error(
                { err: dlqErr, service: svc.name, messageId: message.id },
                'Failed to send message to DLQ'
              );
            }
          }
        }
      }
    }

    try {
      await svc.prisma.$transaction(updates);
    } catch (err) {
      this.log.error(
        { err, service: svc.name },
        'Failed to commit batch updates'
      );
      return;
    }

    const duration = Date.now() - batchStart;
    this.log.info(
      { service: svc.name, count: messages.length, durationMs: duration },
      'Batch processed'
    );
  }

  private async publishWithRetry(message: OutboxMessage): Promise<void> {
    const headers = this.buildHeaders(message);
    const payload = JSON.stringify(message.payload);

    let lastErr: Error | undefined;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        await this.producer.send({
          topic: message.topic,
          messages: [
            {
              key: message.id,
              value: payload,
              headers,
            },
          ],
        });
        return;
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        if (attempt < this.maxRetries) {
          const delay = 100 * 2 ** attempt;
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
    throw lastErr;
  }

  private buildHeaders(message: OutboxMessage): Record<string, string> {
    const base: Record<string, string> = {
      eventType: message.eventType,
      tenantId: message.tenantId,
      aggregateType: message.aggregateType,
      aggregateId: message.aggregateId,
      source: 'outbox-relay',
    };

    if (
      message.headers &&
      typeof message.headers === 'object' &&
      !Array.isArray(message.headers)
    ) {
      for (const [k, v] of Object.entries(
        message.headers as Record<string, unknown>
      )) {
        if (Object.prototype.hasOwnProperty.call(message.headers, k)) {
          base[k] = typeof v === 'string' ? v : JSON.stringify(v);
        }
      }
    }

    return base;
  }

  private async sendToDLQ(
    message: OutboxMessage,
    error: Error
  ): Promise<void> {
    const headers: Record<string, string> = {
      ...this.buildHeaders(message),
      originalTopic: message.topic,
      errorMessage: error.message,
      failedAt: new Date().toISOString(),
    };

    await this.producer.send({
      topic: `${message.topic}.dlq`,
      messages: [
        {
          key: message.id,
          value: JSON.stringify(message.payload),
          headers,
        },
      ],
    });
  }
}
