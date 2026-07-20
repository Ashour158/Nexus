import type { KafkaMessage } from 'kafkajs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NexusConsumer } from '../index.js';
import {
  MemoryIdempotencyStore,
  createIdempotencyStore,
  type IdempotencyStore,
} from '../idempotency.js';

type TestableConsumer = {
  processMessage(topic: string, partition: number, message: KafkaMessage): Promise<void>;
};

function message(value: string, offset: string): KafkaMessage {
  return {
    key: null,
    value: Buffer.from(value),
    timestamp: '0',
    attributes: 0,
    offset,
    size: value.length,
    headers: {},
  };
}

function domainMessage(eventId: string, offset = '1'): KafkaMessage {
  return message(
    JSON.stringify({
      eventId,
      type: 'deal.updated',
      tenantId: 'tenant-a',
      source: 'crm-service',
      payload: { dealId: 'deal-1', amount: 125 },
    }),
    offset
  );
}

async function process(
  consumer: NexusConsumer,
  kafkaMessage: KafkaMessage
): Promise<void> {
  await (consumer as unknown as TestableConsumer).processMessage(
    'nexus.crm.deals',
    0,
    kafkaMessage
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('event backbone regression protection', () => {
  it('applies a replayed event side effect exactly once', async () => {
    // Catches offset replays charging or mutating downstream state twice.
    const effects: string[] = [];
    const store = new MemoryIdempotencyStore();
    const consumer = new NexusConsumer({
      groupId: 'regression.replay',
      idempotencyStore: store,
      dlqEnabled: false,
      maxRetries: 0,
    });
    consumer.on('deal.updated', async (event) => {
      effects.push(String((event.payload as { dealId?: string }).dealId));
    });

    const replay = domainMessage('event-replayed');
    await process(consumer, replay);
    await process(consumer, replay);

    expect(effects).toEqual(['deal-1']);
    await expect(store.isProcessed('event-replayed')).resolves.toBe(true);
  });

  it('lets every consumer group process the same event once', async () => {
    // Catches the outage where one global Redis key let group A starve group B.
    const redisKeys = new Map<string, string>();
    const redis = {
      exists: vi.fn(async (key: string) => (redisKeys.has(key) ? 1 : 0)),
      setex: vi.fn(async (key: string, _ttl: number, value: string) => {
        redisKeys.set(key, value);
        return 'OK';
      }),
    };
    const groupA = createIdempotencyStore(redis as never, 'consumer-group-a');
    const groupB = createIdempotencyStore(redis as never, 'consumer-group-b');
    const sideEffects: string[] = [];

    const deliver = async (store: IdempotencyStore, group: string) => {
      if (await store.isProcessed('shared-event')) return;
      sideEffects.push(group);
      await store.markProcessed('shared-event');
    };

    await deliver(groupA, 'group-a');
    await deliver(groupB, 'group-b');
    await deliver(groupA, 'group-a');
    await deliver(groupB, 'group-b');

    expect(sideEffects).toEqual(['group-a', 'group-b']);
    expect([...redisKeys.keys()]).toEqual([
      'nexus:kafka:processed:consumer-group-a:shared-event',
      'nexus:kafka:processed:consumer-group-b:shared-event',
    ]);
  });

  it('continues with a valid event after a malformed poison message', async () => {
    // Catches a bad payload wedging the partition and starving later messages.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const effects: string[] = [];
    const consumer = new NexusConsumer({
      groupId: 'regression.poison',
      idempotencyStore: new MemoryIdempotencyStore(),
      dlqEnabled: false,
      maxRetries: 0,
    });
    consumer.on('deal.updated', async (event) => {
      effects.push(String((event.payload as { dealId?: string }).dealId));
    });

    await process(consumer, message('{"eventId":', '10'));
    await process(consumer, domainMessage('valid-after-poison', '11'));

    expect(effects).toEqual(['deal-1']);
  });
});
