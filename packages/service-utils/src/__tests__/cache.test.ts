import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CacheLayer } from '../cache.js';

const mockRedis = {
  get: vi.fn(),
  setex: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  keys: vi.fn(),
  mget: vi.fn(),
  pipeline: vi.fn(() => ({
    setex: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  })),
};

vi.mock('ioredis', () => ({
  Redis: vi.fn(() => mockRedis),
}));

describe('CacheLayer', () => {
  let cache: CacheLayer;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { Redis } = await import('ioredis');
    cache = new CacheLayer(new Redis() as any);
  });

  it('get returns parsed JSON', async () => {
    mockRedis.get.mockResolvedValue('{"name":"test"}');
    const val = await cache.get('key');
    expect(val).toEqual({ name: 'test' });
  });

  it('get returns null for missing key', async () => {
    mockRedis.get.mockResolvedValue(null);
    const val = await cache.get('missing');
    expect(val).toBeNull();
  });

  it('set stores JSON with TTL', async () => {
    await cache.set('key', { foo: 'bar' }, 60);
    expect(mockRedis.setex).toHaveBeenCalledWith(
      'nexus:key',
      60,
      JSON.stringify({ foo: 'bar' })
    );
  });

  it('getOrSet acquires lock and sets value', async () => {
    mockRedis.get.mockResolvedValueOnce(null);
    mockRedis.set.mockResolvedValueOnce('OK');
    const factory = vi.fn().mockResolvedValue({ computed: true });
    const val = await cache.getOrSet('key', factory, 60);
    expect(val).toEqual({ computed: true });
    expect(factory).toHaveBeenCalledTimes(1);
    expect(mockRedis.set).toHaveBeenCalledWith(
      'nexus:lock:key',
      expect.any(String),
      'EX',
      30,
      'NX'
    );
    expect(mockRedis.setex).toHaveBeenCalledWith(
      'nexus:key',
      60,
      JSON.stringify({ computed: true })
    );
  });

  it('getOrSet waits and retries when lock is held', async () => {
    mockRedis.get
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('{"computed":true}');
    mockRedis.set.mockResolvedValueOnce(null); // lock not acquired
    const factory = vi.fn().mockResolvedValue({ computed: true });
    const val = await cache.getOrSet('key', factory, 60);
    expect(val).toEqual({ computed: true });
    expect(factory).not.toHaveBeenCalled();
  });
});
