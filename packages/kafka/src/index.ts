import {
  Kafka,
  type Producer,
  type Consumer,
  type KafkaMessage,
  CompressionTypes,
  logLevel,
} from 'kafkajs';
import { randomUUID } from 'node:crypto';
import type { NexusKafkaEvent } from '@nexus/shared-types';
// Seed tenant AsyncLocalStorage per message so consumer handlers touching
// tenant-scoped Prisma satisfy fail-closed enforcement (RR-H2). Imported from
// the lean request-context subpath (only pulls @fastify/request-context +
// node:async_hooks — no fastify server code). service-utils does NOT depend on
// @nexus/kafka, so this dependency is acyclic.
import { runWithTenant } from '@nexus/service-utils/request-context';
import type { IdempotencyStore } from './idempotency.js';
import { createIdempotencyStore } from './idempotency.js';

function getTraceparent(): string | undefined {
  try {
    // Fastify request context (if available)
    const { requestContext } = require('@fastify/request-context');
    return requestContext.get('traceparent') as string | undefined;
  } catch {
    return undefined;
  }
}

// ─── Client Factory ───────────────────────────────────────────────────────────

let kafka: Kafka | null = null;

/**
 * Section 36 — returns a lazily-constructed singleton `Kafka` client using
 * `KAFKA_BROKERS`, `KAFKA_CLIENT_ID`, `KAFKA_SSL`, `KAFKA_SASL_*` env vars.
 */
export function getKafkaClient(): Kafka {
  if (!kafka) {
    kafka = new Kafka({
      clientId: process.env.KAFKA_CLIENT_ID ?? 'nexus-service',
      brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
      ssl: process.env.KAFKA_SSL === 'true' ? {} : false,
      sasl: process.env.KAFKA_SASL_USERNAME
        ? {
            mechanism: 'plain',
            username: process.env.KAFKA_SASL_USERNAME,
            password: process.env.KAFKA_SASL_PASSWORD ?? '',
          }
        : undefined,
      logLevel: logLevel.WARN,
      retry: { initialRetryTime: 100, retries: 8 },
    });
  }
  return kafka;
}

// ─── Topic Definitions — Section 36 ──────────────────────────────────────────

export const TOPICS = {
  LEADS: 'nexus.crm.leads',
  CONTACTS: 'nexus.crm.contacts',
  ACCOUNTS: 'nexus.crm.accounts',
  DEALS: 'nexus.crm.deals',
  ACTIVITIES: 'nexus.crm.activities',
  QUOTES: 'nexus.finance.quotes',
  INVOICES: 'nexus.finance.invoices',
  PAYMENTS: 'nexus.finance.payments',
  CONTRACTS: 'nexus.finance.contracts',
  COMMISSIONS: 'nexus.finance.commissions',
  WORKFLOWS: 'nexus.automation.workflows',
  INTEGRATION: 'nexus.integration.events',
  BLUEPRINT: 'nexus.blueprint.events',
  NOTIFICATIONS: 'nexus.platform.notifications',
  EMAILS: 'nexus.comms.emails',
  CALLS: 'nexus.comms.calls',
  ANALYTICS: 'nexus.analytics.events',
  AUDIT: 'nexus.compliance.audit',
} as const;

export type TopicName = (typeof TOPICS)[keyof typeof TOPICS];

// ─── Typed Producer — Section 36 ─────────────────────────────────────────────

/**
 * Wraps a `kafkajs` idempotent producer with JSON serialization,
 * tenant-keyed partitioning, and correlation-id headers.
 */
export class NexusProducer {
  private producer: Producer;
  private connected = false;

  private queueCount = 0;

  constructor(private readonly serviceName: string) {
    this.producer = getKafkaClient().producer({
      idempotent: true,
      transactionTimeout: 30_000,
      retry: { retries: 8, initialRetryTime: 100 },
    } as any);
  }

  /** Connect the underlying kafkajs producer. Idempotent. */
  async connect(): Promise<void> {
    if (this.connected) return;
    await this.producer.connect();
    this.connected = true;
  }

  /** Disconnect the underlying kafkajs producer. Idempotent. */
  async disconnect(): Promise<void> {
    if (!this.connected) return;
    await this.producer.disconnect();
    this.connected = false;
  }

  /** Whether `connect()` has been called and disconnect hasn't. */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Publish a single typed domain event. The caller passes the event-specific
   * fields (`type`, `tenantId`, `payload`); this method fills in `eventId`,
   * `timestamp`, `version`, and `source`.
   */
  /**
   * Publishes a domain event. `type` / `payload` are validated at runtime by consumers;
   * the signature accepts any well-formed JSON event so new event types do not require
   * updating this package before services can publish them.
   */
  /** Check backpressure before sending. */
  private checkBackpressure(): void {
    if (this.queueCount > 10_000) {
      throw new Error('KAFKA_BACKPRESSURE: producer queue exceeded 10,000 messages');
    }
  }

  /** Decrement backpressure counter after confirmed send. */
  private releaseBackpressure(): void {
    this.queueCount = Math.max(0, this.queueCount - 1);
  }

  /** Decrement backpressure counter by a specific amount. */
  private releaseBackpressureBatch(count: number): void {
    this.queueCount = Math.max(0, this.queueCount - count);
  }

  /** Flush any buffered messages immediately. */
  async flush(): Promise<void> {
    // kafkajs does not expose explicit flush; disconnect ensures delivery
    await this.disconnect();
  }

  async publish(
    topic: TopicName | string,
    event: {
      type: string;
      tenantId: string;
      correlationId?: string;
      payload?: unknown;
      [key: string]: unknown;
    },
    opts?: { traceparent?: string }
  ): Promise<void> {
    this.checkBackpressure();
    this.queueCount++;
    const fullEvent = {
      ...event,
      eventId: randomUUID(),
      timestamp: new Date().toISOString(),
      version: 1,
      source: this.serviceName,
    } as NexusKafkaEvent;

    const headers: Record<string, string> = {
      eventType: fullEvent.type,
      tenantId: fullEvent.tenantId,
      correlationId: fullEvent.correlationId ?? fullEvent.eventId,
      source: this.serviceName,
    };
    const traceparent = opts?.traceparent ?? getTraceparent();
    if (traceparent) {
      headers.traceparent = traceparent;
    }

    try {
      await this.producer.send({
        topic,
        compression: CompressionTypes.GZIP,
        acks: -1,
        messages: [
          {
            key: fullEvent.tenantId,
            value: JSON.stringify(fullEvent),
            headers,
          },
        ],
      });
    } catch (err) {
      this.releaseBackpressure();
      throw err;
    }
    // Schedule a decrement; kafkajs doesn't expose delivery confirmation,
    // so we use a timer-based heuristic to avoid unbounded growth.
    // Use shorter timer to prevent rapid-fire publish from exhausting queue.
    setTimeout(() => this.releaseBackpressure(), 5_000);
  }

  /** Publish a batch of already-complete domain events on a single topic. */
  async publishBatch(topic: TopicName | string, events: NexusKafkaEvent[]): Promise<void> {
    if (events.length === 0) return;
    this.checkBackpressure();
    this.queueCount += events.length;
    try {
      await this.producer.send({
        topic,
        compression: CompressionTypes.GZIP,
        acks: -1,
        messages: events.map((event) => ({
          key: event.tenantId,
          value: JSON.stringify(event),
        })),
      });
    } catch (err) {
      this.releaseBackpressureBatch(events.length);
      throw err;
    }
    setTimeout(() => {
      this.releaseBackpressureBatch(events.length);
    }, 5_000);
  }

}

// ─── Typed Consumer — Section 36 ─────────────────────────────────────────────

export type EventHandler<T extends NexusKafkaEvent = NexusKafkaEvent> = (
  event: T,
  rawMessage: KafkaMessage
) => Promise<void>;

/**
 * Wraps a `kafkajs` consumer with per-event-type handler dispatch.
 * Handlers are invoked sequentially per message; unexpected handler errors
 * are logged so a single bad handler does not crash the consumer loop.
 */
export interface NexusConsumerOptions {
  groupId: string;
  /** Enable idempotency deduplication. Defaults to in-memory store if redis not provided. */
  idempotencyStore?: IdempotencyStore;
  /** Event sources this consumer must ignore to avoid producer echo loops. */
  ignoredSources?: string[];
  /** Enable dead-letter queue on persistent handler failures. */
  dlqEnabled?: boolean;
  /** Max handler retries before DLQ. */
  maxRetries?: number;
}

export class NexusConsumer {
  private consumer: Consumer;
  private handlers = new Map<string, EventHandler[]>();
  private idempotencyStore: IdempotencyStore;
  private dlqEnabled: boolean;
  private maxRetries: number;
  private ignoredSources: Set<string>;
  private dlqProducer: Producer | null = null;
  /** Max concurrent messages per partition to avoid head-of-line blocking. */
  private concurrency: number;

  constructor(opts: NexusConsumerOptions | string) {
    const resolved: NexusConsumerOptions =
      typeof opts === 'string' ? { groupId: opts } : opts;
    const { groupId, idempotencyStore, ignoredSources = [], dlqEnabled = true, maxRetries = 3 } = resolved;
    this.consumer = getKafkaClient().consumer({
      groupId,
      sessionTimeout: 30_000,
      heartbeatInterval: 3_000,
      // Process up to 10 messages concurrently per partition to increase throughput
      partitionsConsumedConcurrently: 10,
    } as any);
    this.idempotencyStore = idempotencyStore ?? createIdempotencyStore();
    this.ignoredSources = new Set(ignoredSources);
    this.dlqEnabled = dlqEnabled;
    this.maxRetries = maxRetries;
    this.concurrency = 10;
  }

  /** Register a handler for a specific event type. Returns `this` for chaining. */
  on(eventType: string, handler: EventHandler): this {
    const handlers = this.handlers.get(eventType) ?? [];
    handlers.push(handler);
    this.handlers.set(eventType, handlers);
    return this;
  }

  /** Connect the consumer and subscribe to the given topics (committed offsets). */
  async subscribe(topics: string[]): Promise<void> {
    await this.consumer.connect();
    for (const topic of topics) {
      await this.consumer.subscribe({ topic, fromBeginning: false });
    }
  }

  /** Start the consumer run loop; dispatches to registered handlers with idempotency + DLQ. */
  async start(): Promise<void> {
    await this.consumer.run({
      eachBatchAutoResolve: true,
      eachBatch: async ({ batch, resolveOffset, heartbeat }) => {
        const messages = batch.messages;
        // Process messages in chunks to balance throughput with ordering guarantees
        for (let i = 0; i < messages.length; i += this.concurrency) {
          const chunk = messages.slice(i, i + this.concurrency);
          await Promise.all(
            chunk.map(async (message) => {
              await this.processMessage(batch.topic, batch.partition, message);
              resolveOffset(message.offset);
            })
          );
          await heartbeat();
        }
      },
    });
  }

  private async processMessage(topic: string, partition: number, message: KafkaMessage): Promise<void> {
    if (!message.value) return;

    let event: NexusKafkaEvent;
    try {
      event = JSON.parse(message.value.toString()) as NexusKafkaEvent;
    } catch (err) {
      console.error('Failed to parse Kafka message', err);
      return;
    }

    const eventId = event.eventId ?? message.offset;

    if (typeof event.source === 'string' && this.ignoredSources.has(event.source)) {
      console.debug(`Skipping event ${eventId} from ignored source ${event.source}`);
      return;
    }

    // Extract trace context from message headers for distributed tracing
    const traceparent = message.headers?.traceparent?.toString();
    if (traceparent) {
      try {
        const { requestContext } = require('@fastify/request-context');
        requestContext.set('traceparent', traceparent);
      } catch {
        // Fastify context not available
      }
    }

    // Idempotency check
    const alreadyProcessed = await this.idempotencyStore.isProcessed(eventId);
    if (alreadyProcessed) {
      console.debug(`Skipping already-processed event ${eventId}`);
      return;
    }

    const handlers = this.handlers.get(event.type) ?? [];
    // Every domain event carries `tenantId`; seed it into tenant ALS for the
    // handler's duration so awaited Prisma ops see it (RR-H2 fail-closed). When
    // absent (malformed event), invoke unwrapped — behavior is unchanged.
    const tenantId = typeof event.tenantId === 'string' ? event.tenantId : '';
    let allSuccess = true;
    let lastError: unknown;

    for (const handler of handlers) {
      let attempt = 0;
      let success = false;
      while (attempt <= this.maxRetries && !success) {
        try {
          await (tenantId
            ? runWithTenant(tenantId, () => handler(event, message))
            : handler(event, message));
          success = true;
        } catch (err) {
          lastError = err;
          attempt++;
          if (attempt > this.maxRetries) {
            console.error(`Handler error for event ${event.type} after ${this.maxRetries} retries:`, err);
            allSuccess = false;
          } else {
            // Exponential backoff before retry
            await new Promise((r) => setTimeout(r, 200 * 2 ** attempt));
          }
        }
      }
    }

    if (allSuccess) {
      await this.idempotencyStore.markProcessed(eventId);
    } else if (this.dlqEnabled) {
      await this.sendToDLQ(topic, partition, message, event, lastError);
      // Do NOT mark processed here — the DLQ consumer must be able to replay
      // the event. All handlers must be idempotent.
    }
  }

  private async getDlqProducer(): Promise<Producer> {
    if (!this.dlqProducer) {
      this.dlqProducer = getKafkaClient().producer({ idempotent: true });
      await this.dlqProducer.connect();
    }
    return this.dlqProducer;
  }

  private async sendToDLQ(
    topic: string,
    partition: number,
    message: KafkaMessage,
    event: NexusKafkaEvent,
    error: unknown
  ): Promise<void> {
    try {
      const producer = await this.getDlqProducer();
      await producer.send({
        topic: `${topic}.dlq`,
        messages: [
          {
            key: event.tenantId,
            value: JSON.stringify(event),
            headers: {
              originalTopic: topic,
              originalPartition: String(partition),
              originalOffset: String(message.offset),
              errorMessage: error instanceof Error ? error.message : String(error),
              failedAt: new Date().toISOString(),
            },
          },
        ],
      });
    } catch (err) {
      console.error('Failed to send message to DLQ:', err);
    }
  }

  /** Disconnect the consumer (graceful shutdown). */
  async disconnect(): Promise<void> {
    await this.consumer.disconnect();
  }
}
