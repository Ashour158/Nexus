import { describe, it, expect, vi } from 'vitest';
import { OutboxWriter, OutboxPublisher } from '../index.js';
import { TOPICS } from '@nexus/kafka';

describe('OutboxWriter', () => {
  const mockPrisma = {
    $transaction: vi.fn((fn) => fn(mockTx)),
  };

  const mockTx = {
    $executeRaw: vi.fn().mockResolvedValue(undefined),
  };

  it('schedules a message in transaction', async () => {
    const outbox = new OutboxWriter(mockPrisma as any);
    await outbox.withTransaction(async (tx, writer) => {
      await writer.schedule(tx, {
        topic: TOPICS.CONTACTS,
        payload: { id: '123', name: 'Test' },
        aggregateId: '123',
      });
    });
    expect(mockTx.$executeRaw).toHaveBeenCalled();
  });
});

describe('OutboxPublisher', () => {
  const mockClient = {
    $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
  };

  it('publishes an event via $executeRawUnsafe', async () => {
    const publisher = new OutboxPublisher('test-service');
    await publisher.publish(
      mockClient as any,
      TOPICS.CONTACTS,
      { id: '123' },
      { eventType: 'contact.created', tenantId: 't1', aggregateId: '123' }
    );
    expect(mockClient.$executeRawUnsafe).toHaveBeenCalledOnce();
    const [, topic, payload, aggregateId, correlationId, headers] = mockClient.$executeRawUnsafe.mock.calls[0];
    expect(topic).toBe(TOPICS.CONTACTS);
    expect(JSON.parse(payload)).toEqual({ id: '123' });
    expect(aggregateId).toBe('123');
    expect(JSON.parse(headers)).toMatchObject({ eventType: 'contact.created', source: 'test-service', tenantId: 't1' });
  });
});
