/**
 * Nexus Cache — Redis-backed caching layer with cache-aside pattern.
 *
 * Usage:
 *   import { NexusCache } from '@nexus/cache';
 *   const cache = new NexusCache({ url: 'redis://localhost:6379' });
 *   const user = await cache.cacheAside('user:123', () => fetchUser(123), 60_000);
 */

import { Redis } from 'ioredis';

export interface CacheOptions {
  url?: string;
  keyPrefix?: string;
  defaultTtlMs?: number;
  compression?: boolean;
}

export class NexusCache {
  private redis: Redis;
  private prefix: string;
  private defaultTtlMs: number;

  constructor(opts: CacheOptions = {}) {
    this.redis = new Redis(opts.url ?? process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      connectTimeout: 5000,
      lazyConnect: true,
    });
    this.prefix = opts.keyPrefix ? `${opts.keyPrefix}:` : 'nexus:cache:';
    this.defaultTtlMs = opts.defaultTtlMs ?? 60_000;
  }

  private key(k: string): string {
    return `${this.prefix}${k}`;
  }

  async get<T>(key: string): Promise<T | null> {
    const val = await this.redis.get(this.key(key));
    if (!val) return null;
    try {
      return JSON.parse(val) as T;
    } catch {
      return val as unknown as T;
    }
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    const ttl = ttlMs ?? this.defaultTtlMs;
    await this.redis.setex(this.key(key), Math.ceil(ttl / 1000), serialized);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(this.key(key));
  }

  async invalidatePattern(pattern: string): Promise<void> {
    const keys = await this.redis.keys(this.key(pattern));
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  async cacheAside<T>(
    key: string,
    factory: () => Promise<T>,
    ttlMs?: number
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const value = await factory();
    await this.set(key, value, ttlMs);
    return value;
  }

  async flush(): Promise<void> {
    const keys = await this.redis.keys(`${this.prefix}*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  async disconnect(): Promise<void> {
    await this.redis.quit();
  }
}

/** Singleton cache instance for shared use. */
let sharedCache: NexusCache | null = null;

export function getSharedCache(opts?: CacheOptions): NexusCache {
  if (!sharedCache) {
    sharedCache = new NexusCache(opts);
  }
  return sharedCache;
}
