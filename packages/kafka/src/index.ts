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
  SUBSCRIPTIONS: 'nexus.finance.subscriptions',
  CONTRACTS: 'nexus.finance.contracts',
  COMMISSIONS: 'nexus.finance.commissions',
  WORKFLOWS: 'nexus.automation.workflows',
  AI_JOBS: 'nexus.ai.jobs',
  BILLING: 'nexus.billing.events',
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

  constructor(private readonly serviceName: string) {
    this.producer = getKafkaClient().producer({
      idempotent: true,
      transactionTimeout: 30_000,
    });
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
  async publish(
    topic: TopicName | string,
    event: {
      type: string;
      tenantId: string;
      correlationId?: string;
      payload?: unknown;
      [key: string]: unknown;
    }
  ): Promise<void> {
    const fullEvent = {
      ...event,
      eventId: randomUUID(),
      timestamp: new Date().toISOString(),
      version: 1,
      source: this.serviceName,
    } as NexusKafkaEvent;

    await this.producer.send({
      topic,
      compression: CompressionTypes.Snappy,
      messages: [
        {
          key: fullEvent.tenantId,
          value: JSON.stringify(fullEvent),
          headers: {
            eventType: fullEvent.type,
            tenantId: fullEvent.tenantId,
            correlationId: fullEvent.correlationId ?? fullEvent.eventId,
            source: this.serviceName,
          },
        },
      ],
    });
  }

  /** Publish a batch of already-complete domain events on a single topic. */
  async publishBatch(topic: TopicName | string, events: NexusKafkaEvent[]): Promise<void> {
    if (events.length === 0) return;
    await this.producer.send({
      topic,
      compression: CompressionTypes.Snappy,
      messages: events.map((event) => ({
        key: event.tenantId,
        value: JSON.stringify(event),
      })),
    });
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
export class NexusConsumer {
  private consumer: Consumer;
  private handlers = new Map<string, EventHandler[]>();

  constructor(groupId: string) {
    this.consumer = getKafkaClient().consumer({
      groupId,
      sessionTimeout: 30_000,
      heartbeatInterval: 3_000,
    });
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

  /** Start the consumer run loop; dispatches to registered handlers. */
  async start(): Promise<void> {
    await this.consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;

        let event: NexusKafkaEvent;
        try {
          event = JSON.parse(message.value.toString()) as NexusKafkaEvent;
        } catch (err) {
          console.error('Failed to parse Kafka message', err);
          return;
        }

        const handlers = this.handlers.get(event.type) ?? [];
        for (const handler of handlers) {
          try {
            await handler(event, message);
          } catch (err) {
            console.error(`Handler error for event ${event.type}:`, err);
          }
        }
      },
    });
  }

  /** Disconnect the consumer (graceful shutdown). */
  async disconnect(): Promise<void> {
    await this.consumer.disconnect();
  }
}
