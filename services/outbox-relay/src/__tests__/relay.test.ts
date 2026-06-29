import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OutboxRelay } from '../relay.js';
import type { Producer } from 'kafkajs';
import type { FastifyBaseLogger } from 'fastify';

function createMockProducer(): Producer {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue(undefined),
  } as unknown as Producer;
}

function createMockLogger(): FastifyBaseLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(() => createMockLogger()),
  } as unknown as FastifyBaseLogger;
}

function createMockPrisma(messages: unknown[] = []) {
  return {
    outboxMessage: {
      findMany: vi.fn().mockResolvedValue(messages),
      update: vi.fn().mockImplementation((args: { where: { id: string } }) =>
        Promise.resolve({ id: args.where.id })
      ),
    },
    $transaction: vi.fn().mockImplementation((ops: unknown[]) =>
      Promise.resolve(ops)
    ),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  };
}

describe('OutboxRelay', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('should poll and publish messages', async () => {
    const msg = {
      id: 'msg-1',
      topic: 'test.topic',
      key: null,
      payload: { foo: 'bar' },
      headers: {},
      tenantId: 't1',
      aggregateType: 'Order',
      aggregateId: 'a1',
      eventType: 'OrderCreated',
      createdAt: new Date(),
      processedAt: null,
      error: null,
      retryCount: 0,
    };

    const mockPrisma = createMockPrisma([msg]);
    const producer = createMockProducer();
    const relay = new OutboxRelay({
      producer,
      services: [{ name: 'test-svc', prisma: mockPrisma as any }],
      log: createMockLogger(),
      pollIntervalMs: 5000,
      batchSize: 100,
      maxRetries: 3,
      dlqEnabled: true,
    });

    await relay.start();
    await new Promise((r) => setTimeout(r, 50));

    expect(mockPrisma.outboxMessage.findMany).toHaveBeenCalledWith({
      where: { processedAt: null, retryCount: { lt: 5 } },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    expect(producer.send).toHaveBeenCalledWith({
      topic: 'test.topic',
      messages: [
        expect.objectContaining({
          key: 'msg-1',
          value: JSON.stringify({ foo: 'bar' }),
        }),
      ],
    });

    expect(mockPrisma.$transaction).toHaveBeenCalled();
    const txCalls = mockPrisma.$transaction.mock.calls[0][0];
    expect(txCalls.length).toBe(1);
    expect(txCalls[0]).toEqual(
      expect.objectContaining({
        where: { id: 'msg-1' },
        data: expect.objectContaining({ processedAt: expect.any(Date) }),
      })
    );

    await relay.stop();
  });

  it('should increment retryCount on publish failure', async () => {
    const msg = {
      id: 'msg-2',
      topic: 'test.topic',
      key: null,
      payload: { foo: 'bar' },
      headers: {},
      tenantId: 't1',
      aggregateType: 'Order',
      aggregateId: 'a1',
      eventType: 'OrderCreated',
      createdAt: new Date(),
      processedAt: null,
      error: null,
      retryCount: 0,
    };

    const mockPrisma = createMockPrisma([msg]);
    const producer = createMockProducer();
    (producer.send as any).mockRejectedValue(new Error('Kafka down'));

    const relay = new OutboxRelay({
      producer,
      services: [{ name: 'test-svc', prisma: mockPrisma as any }],
      log: createMockLogger(),
      pollIntervalMs: 5000,
      batchSize: 100,
      maxRetries: 1,
      dlqEnabled: false,
    });

    await relay.start();
    await new Promise((r) => setTimeout(r, 50));

    expect(mockPrisma.$transaction).toHaveBeenCalled();
    const txCalls = mockPrisma.$transaction.mock.calls[0][0];
    expect(txCalls[0]).toEqual(
      expect.objectContaining({
        where: { id: 'msg-2' },
        data: expect.objectContaining({
          retryCount: { increment: 1 },
          error: 'Kafka down',
        }),
      })
    );

    await relay.stop();
  });

  it('should send to DLQ when max retries reached', async () => {
    const msg = {
      id: 'msg-3',
      topic: 'test.topic',
      key: null,
      payload: { foo: 'bar' },
      headers: {},
      tenantId: 't1',
      aggregateType: 'Order',
      aggregateId: 'a1',
      eventType: 'OrderCreated',
      createdAt: new Date(),
      processedAt: null,
      error: null,
      retryCount: 4,
    };

    const mockPrisma = createMockPrisma([msg]);
    const producer = createMockProducer();
    (producer.send as any).mockRejectedValue(new Error('Kafka down'));

    const relay = new OutboxRelay({
      producer,
      services: [{ name: 'test-svc', prisma: mockPrisma as any }],
      log: createMockLogger(),
      pollIntervalMs: 5000,
      batchSize: 100,
      maxRetries: 0,
      dlqEnabled: true,
    });

    await relay.start();
    await new Promise((r) => setTimeout(r, 50));

    // First call is the main topic attempt, second is DLQ
    expect(producer.send).toHaveBeenCalledTimes(2);
    expect(producer.send).toHaveBeenLastCalledWith(
      expect.objectContaining({
        topic: 'test.topic.dlq',
        messages: [
          expect.objectContaining({
            key: 'msg-3',
            value: JSON.stringify({ foo: 'bar' }),
            headers: expect.objectContaining({
              originalTopic: 'test.topic',
              errorMessage: 'Kafka down',
            }),
          }),
        ],
      })
    );

    await relay.stop();
  });
});
