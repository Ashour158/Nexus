/**
 * Redis caching helpers with JSON serialization.
 *
 * Usage:
 *   import { CacheLayer } from '@nexus/service-utils/cache';
 *   const cache = new CacheLayer(redis);
 *   const deals = await cache.getOrSet('deals:active', () => fetchDeals(), 300);
 */

import type { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';

export class CacheLayer {
  constructor(private redis: Redis, private prefix = 'nexus:') {}

  private key(k: string): string {
    return `${this.prefix}${k}`;
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(this.key(key));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds = 300): Promise<void> {
    const raw = JSON.stringify(value);
    // Prevent cache entries larger than 1 MB from evicting everything else
    if (raw.length > 1_048_576) {
      throw new Error(`CACHE_VALUE_TOO_LARGE: key ${key} exceeds 1 MB`);
    }
    // Cap TTL at 24 hours to prevent unbounded growth on misconfiguration
    const safeTtl = Math.min(ttlSeconds, 86_400);
    await this.redis.setex(this.key(key), safeTtl, raw);
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(this.key(key));
  }

  async invalidatePattern(pattern: string): Promise<void> {
    const fullPattern = this.key(pattern);
    let cursor = '0';
    do {
      const result = await this.redis.scan(cursor, 'MATCH', fullPattern, 'COUNT', 100);
      cursor = result[0];
      const keys = result[1];
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } while (cursor !== '0');
  }

  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlSeconds = 300
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const lockKey = `${this.prefix}lock:${key}`;
    const lockValue = randomUUID();
    const lockTtl = 30;

    const acquired = await this.redis.set(lockKey, lockValue, 'EX', lockTtl, 'NX');
    if (!acquired) {
      // Another process is computing; wait with exponential backoff and retry
      const jitter = Math.random() * 50;
      await new Promise((r) => setTimeout(r, 50 + jitter));
      return this.getOrSet(key, factory, ttlSeconds);
    }

    try {
      const value = await factory();
      await this.set(key, value, ttlSeconds);
      return value;
    } finally {
      const current = await this.redis.get(lockKey);
      if (current === lockValue) {
        await this.redis.del(lockKey);
      }
    }
  }

  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    const prefixed = keys.map((k) => this.key(k));
    const values = await this.redis.mget(...prefixed);
    return values.map((v: string | null) => {
      if (!v) return null;
      try {
        return JSON.parse(v) as T;
      } catch {
        return v as unknown as T;
      }
    });
  }

  async mset(entries: Record<string, unknown>, ttlSeconds = 300): Promise<void> {
    const pipeline = this.redis.pipeline();
    for (const [key, value] of Object.entries(entries)) {
      pipeline.setex(this.key(key), ttlSeconds, JSON.stringify(value));
    }
    await pipeline.exec();
  }
}
