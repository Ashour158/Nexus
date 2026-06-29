/**
 * Kafka consumer idempotency store.
 *
 * Provides application-level deduplication so replayed messages are not
 * reprocessed. Default implementation is Redis-backed; falls back to an
 * in-memory LRU for dev / test environments.
 */

import type { Redis } from 'ioredis';

export interface IdempotencyStore {
  /** Returns true if the event has already been processed. */
  isProcessed(eventId: string): Promise<boolean>;
  /** Marks the event as processed with an optional TTL (ms). */
  markProcessed(eventId: string, ttlMs?: number): Promise<void>;
}

/* ─── Redis-backed implementation ─────────────────────────────────────────── */

export class RedisIdempotencyStore implements IdempotencyStore {
  constructor(
    private readonly redis: Redis,
    private readonly keyPrefix = 'nexus:kafka:processed'
  ) {}

  async isProcessed(eventId: string): Promise<boolean> {
    const exists = await this.redis.exists(`${this.keyPrefix}:${eventId}`);
    return exists === 1;
  }

  async markProcessed(eventId: string, ttlMs = 86_400_000): Promise<void> {
    await this.redis.setex(`${this.keyPrefix}:${eventId}`, Math.ceil(ttlMs / 1000), '1');
  }
}

/* ─── In-memory LRU fallback ──────────────────────────────────────────────── */

export class MemoryIdempotencyStore implements IdempotencyStore {
  private cache = new Map<string, number>();
  private readonly maxSize: number;

  constructor(maxSize = 10_000) {
    this.maxSize = maxSize;
  }

  async isProcessed(eventId: string): Promise<boolean> {
    const expiry = this.cache.get(eventId);
    if (!expiry) return false;
    if (Date.now() > expiry) {
      this.cache.delete(eventId);
      return false;
    }
    return true;
  }

  async markProcessed(eventId: string, ttlMs = 86_400_000): Promise<void> {
    // Evict oldest entries if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(eventId, Date.now() + ttlMs);
  }
}

/* ─── Factory ─────────────────────────────────────────────────────────────── */

export function createIdempotencyStore(redis?: Redis): IdempotencyStore {
  if (redis) return new RedisIdempotencyStore(redis);
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Redis idempotency store is required in production. ' +
        'Pass a Redis instance to NexusConsumer or set NODE_ENV=development for the in-memory fallback.'
    );
  }
  return new MemoryIdempotencyStore();
}
