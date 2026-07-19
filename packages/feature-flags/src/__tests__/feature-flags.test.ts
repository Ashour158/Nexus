import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

// These are unit tests of the flag logic, not of Redis: replace ioredis with a
// minimal in-memory implementation of the five commands FeatureFlagService
// uses so the suite passes on a machine with no Redis running.
vi.mock('ioredis', () => {
  class FakeRedis {
    private store = new Map<string, string>();

    async set(key: string, value: string): Promise<'OK'> {
      this.store.set(key, value);
      return 'OK';
    }

    async get(key: string): Promise<string | null> {
      return this.store.get(key) ?? null;
    }

    async del(...keys: string[]): Promise<number> {
      let n = 0;
      for (const key of keys) if (this.store.delete(key)) n += 1;
      return n;
    }

    async scan(_cursor: string, ...args: (string | number)[]): Promise<[string, string[]]> {
      const matchIdx = args.indexOf('MATCH');
      const pattern = matchIdx >= 0 ? String(args[matchIdx + 1]) : '*';
      const regex = new RegExp(
        `^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`
      );
      return ['0', [...this.store.keys()].filter((k) => regex.test(k))];
    }

    async mget(...keys: string[]): Promise<(string | null)[]> {
      return keys.map((k) => this.store.get(k) ?? null);
    }

    async quit(): Promise<'OK'> {
      return 'OK';
    }
  }
  return { Redis: FakeRedis, default: FakeRedis };
});

import { FeatureFlagService } from '../index.js';

const service = new FeatureFlagService();

describe('FeatureFlagService', () => {
  beforeEach(async () => {
    const flags = await service.listFlags();
    for (const f of flags) {
      await service.deleteFlag(f.name);
    }
  });

  afterAll(async () => {
    await service.close();
  });

  it('sets and gets a flag', async () => {
    await service.setFlag({ name: 'new-ui', enabled: true });
    const flag = await service.getFlag('new-ui');
    expect(flag?.enabled).toBe(true);
  });

  it('returns false for missing flag', async () => {
    const enabled = await service.isEnabled('missing');
    expect(enabled).toBe(false);
  });

  it('respects tenant scoping', async () => {
    await service.setFlag({ name: 'tenant-feature', enabled: true, tenantIds: ['t1'] });
    expect(await service.isEnabled('tenant-feature', { tenantId: 't1' })).toBe(true);
    expect(await service.isEnabled('tenant-feature', { tenantId: 't2' })).toBe(false);
  });

  it('respects rollout percentage', async () => {
    await service.setFlag({ name: 'rollout', enabled: true, rolloutPercentage: 50 });
    const results = new Set<boolean>();
    for (let i = 0; i < 100; i++) {
      results.add(await service.isEnabled('rollout', { userId: `user-${i}` }));
    }
    expect(results.size).toBe(2); // both true and false observed
  });
});
