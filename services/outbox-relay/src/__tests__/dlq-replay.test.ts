import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DLQReplay } from '../dlq-replay.js';
import type { Producer } from 'kafkajs';

function createMockAdmin() {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    listTopics: vi.fn().mockResolvedValue(['deal.created.dlq', 'contact.updated.dlq']),
    fetchTopicOffsets: vi.fn().mockResolvedValue([
      { partition: 0, offset: '0', high: '5', low: '0' },
    ]),
    fetchOffsets: vi.fn().mockResolvedValue([
      {
        topic: 'deal.created.dlq',
        partitions: [{ partition: 0, offset: '-1', metadata: '' }],
      },
    ]),
  };
}

function createMockConsumer() {
  const mockResolveOffset = vi.fn().mockResolvedValue(undefined);
  const mockCommit = vi.fn().mockResolvedValue(undefined);
  const mockHeartbeat = vi.fn().mockResolvedValue(undefined);
  let runConfig: any;

  return {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(undefined),
    seek: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    run: vi.fn().mockImplementation((config: any) => {
      runConfig = config;
      return Promise.resolve();
    }),
    _triggerBatch: async (messages: any[]) => {
      if (!runConfig || !runConfig.eachBatch) {
        throw new Error('eachBatch not configured');
      }
      await runConfig.eachBatch({
        batch: { topic: 'deal.created.dlq', partition: 0, messages },
        resolveOffset: mockResolveOffset,
        commitOffsetsIfNecessary: mockCommit,
        heartbeat: mockHeartbeat,
      });
    },
    _resolveOffset: mockResolveOffset,
    _commitOffsetsIfNecessary: mockCommit,
    _heartbeat: mockHeartbeat,
  };
}

function createMockKafka() {
  const admin = createMockAdmin();
  const consumer = createMockConsumer();
  return {
    admin: vi.fn(() => admin),
    consumer: vi.fn(() => consumer),
    _admin: admin,
    _consumer: consumer,
  };
}

function createMockProducer(): Producer {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue(undefined),
  } as unknown as Producer;
}

function createMockLogger(): any {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(() => createMockLogger()),
  } as any;
}

function createKafkaMessage(
  overrides: Partial<{
    offset: string;
    key: Buffer | null;
    value: Buffer | null;
    headers: Record<string, string | Buffer>;
  }> = {}
): any {
  return {
    offset: overrides.offset ?? '0',
    key: overrides.key ?? Buffer.from('tenant-1'),
    value: overrides.value ?? Buffer.from(JSON.stringify({ eventId: 'evt-1' })),
    timestamp: Date.now().toString(),
    size: 100,
    attributes: 0,
    headers: overrides.headers ?? { originalTopic: 'deal.created' },
  };
}

describe('DLQReplay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should replay messages from DLQ to original topic', async () => {
    const mockKafka = createMockKafka();
    const producer = createMockProducer();
    const replay = new DLQReplay({
      kafka: mockKafka as any,
      producer,
      log: createMockLogger(),
      enabled: true,
      batchSize: 10,
      intervalMs: 60000,
      fetchTimeoutMs: 10,
    });

    const messages = [
      createKafkaMessage({ offset: '0', headers: { originalTopic: 'deal.created' } }),
    ];

    const promise = replay.replayBatch('deal.created.dlq', 10);
    await new Promise((r) => setTimeout(r, 0));
    await mockKafka._consumer._triggerBatch(messages);
    const result = await promise;

    expect(result.replayed).toBe(1);
    expect(result.failed).toBe(0);
    expect(producer.send).toHaveBeenCalledTimes(1);
    expect(producer.send).toHaveBeenCalledWith({
      topic: 'deal.created',
      messages: [
        expect.objectContaining({
          key: expect.any(Buffer),
          value: expect.any(Buffer),
          headers: expect.objectContaining({
            originalTopic: 'deal.created',
            replayedAt: expect.any(String),
          }),
        }),
      ],
    });
    expect(mockKafka._consumer._resolveOffset).toHaveBeenCalledWith('0');
    expect(mockKafka._consumer._commitOffsetsIfNecessary).toHaveBeenCalled();
  });

  it('should leave failed messages in DLQ and not resolve their offset', async () => {
    const mockKafka = createMockKafka();
    const producer = createMockProducer();
    const replay = new DLQReplay({
      kafka: mockKafka as any,
      producer,
      log: createMockLogger(),
      enabled: true,
      batchSize: 10,
      intervalMs: 60000,
      fetchTimeoutMs: 10,
    });

    const messages = [
      createKafkaMessage({ offset: '0', headers: {} }), // missing originalTopic
    ];

    const promise = replay.replayBatch('deal.created.dlq', 10);
    await new Promise((r) => setTimeout(r, 0));
    await mockKafka._consumer._triggerBatch(messages);
    const result = await promise;

    expect(result.replayed).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain('Missing originalTopic header');
    expect(producer.send).not.toHaveBeenCalled();
    expect(mockKafka._consumer._resolveOffset).not.toHaveBeenCalled();
  });

  it('should return stats for DLQ topics', async () => {
    const mockKafka = createMockKafka();
    const producer = createMockProducer();
    const replay = new DLQReplay({
      kafka: mockKafka as any,
      producer,
      log: createMockLogger(),
      enabled: true,
      batchSize: 10,
      intervalMs: 60000,
    });

    const stats = await replay.getStats();

    expect(stats).toEqual([
      { topic: 'contact.updated.dlq', lag: 5 },
      { topic: 'deal.created.dlq', lag: 5 },
    ]);
    expect(mockKafka._admin.listTopics).toHaveBeenCalled();
    expect(mockKafka._admin.fetchTopicOffsets).toHaveBeenCalledWith('deal.created.dlq');
    expect(mockKafka._admin.fetchTopicOffsets).toHaveBeenCalledWith('contact.updated.dlq');
  });

  it('should throw if replay is disabled', async () => {
    const mockKafka = createMockKafka();
    const producer = createMockProducer();
    const replay = new DLQReplay({
      kafka: mockKafka as any,
      producer,
      log: createMockLogger(),
      enabled: false,
      batchSize: 10,
      intervalMs: 60000,
    });

    await expect(replay.replayBatch('deal.created.dlq', 10)).rejects.toThrow(
      'DLQ replay is disabled'
    );
  });

  it('should throw for non-DLQ topics', async () => {
    const mockKafka = createMockKafka();
    const producer = createMockProducer();
    const replay = new DLQReplay({
      kafka: mockKafka as any,
      producer,
      log: createMockLogger(),
      enabled: true,
      batchSize: 10,
      intervalMs: 60000,
    });

    await expect(replay.replayBatch('deal.created', 10)).rejects.toThrow(
      'not a DLQ topic'
    );
  });

  it('should prevent concurrent replays for the same topic', async () => {
    const mockKafka = createMockKafka();
    const producer = createMockProducer();
    const replay = new DLQReplay({
      kafka: mockKafka as any,
      producer,
      log: createMockLogger(),
      enabled: true,
      batchSize: 10,
      intervalMs: 60000,
      fetchTimeoutMs: 50,
    });

    const promise1 = replay.replayBatch('deal.created.dlq', 10);
    const promise2 = replay.replayBatch('deal.created.dlq', 10);

    await expect(promise2).rejects.toThrow('already in progress');
    await promise1;
  });

  it('should track metrics across replays', async () => {
    const mockKafka = createMockKafka();
    const producer = createMockProducer();
    const replay = new DLQReplay({
      kafka: mockKafka as any,
      producer,
      log: createMockLogger(),
      enabled: true,
      batchSize: 10,
      intervalMs: 60000,
      fetchTimeoutMs: 10,
    });

    expect(replay.getMetrics()).toEqual({
      totalReplayed: 0,
      totalFailed: 0,
      lastReplayAt: null,
    });

    const messages = [
      createKafkaMessage({ offset: '0', headers: { originalTopic: 'deal.created' } }),
    ];

    const promise = replay.replayBatch('deal.created.dlq', 10);
    await new Promise((r) => setTimeout(r, 0));
    await mockKafka._consumer._triggerBatch(messages);
    await promise;

    const metrics = replay.getMetrics();
    expect(metrics.totalReplayed).toBe(1);
    expect(metrics.totalFailed).toBe(0);
    expect(metrics.lastReplayAt).not.toBeNull();
  });

  it('should respect maxMessages limit', async () => {
    const mockKafka = createMockKafka();
    const producer = createMockProducer();
    const replay = new DLQReplay({
      kafka: mockKafka as any,
      producer,
      log: createMockLogger(),
      enabled: true,
      batchSize: 10,
      intervalMs: 60000,
      fetchTimeoutMs: 10,
    });

    const messages = [
      createKafkaMessage({ offset: '0', headers: { originalTopic: 'deal.created' } }),
      createKafkaMessage({ offset: '1', headers: { originalTopic: 'deal.created' } }),
      createKafkaMessage({ offset: '2', headers: { originalTopic: 'deal.created' } }),
    ];

    const promise = replay.replayBatch('deal.created.dlq', 2);
    await new Promise((r) => setTimeout(r, 0));
    await mockKafka._consumer._triggerBatch(messages);
    const result = await promise;

    expect(result.replayed).toBe(2);
    expect(result.failed).toBe(0);
    expect(producer.send).toHaveBeenCalledTimes(2);
  });

  it('should propagate producer send errors as failed replays', async () => {
    const mockKafka = createMockKafka();
    const producer = createMockProducer();
    (producer.send as any).mockRejectedValue(new Error('Kafka broker unavailable'));

    const replay = new DLQReplay({
      kafka: mockKafka as any,
      producer,
      log: createMockLogger(),
      enabled: true,
      batchSize: 10,
      intervalMs: 60000,
      fetchTimeoutMs: 10,
    });

    const messages = [
      createKafkaMessage({ offset: '0', headers: { originalTopic: 'deal.created' } }),
    ];

    const promise = replay.replayBatch('deal.created.dlq', 10);
    await new Promise((r) => setTimeout(r, 0));
    await mockKafka._consumer._triggerBatch(messages);
    const result = await promise;

    expect(result.replayed).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain('Kafka broker unavailable');
    expect(mockKafka._consumer._resolveOffset).not.toHaveBeenCalled();
  });
});
