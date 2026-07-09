import { describe, it, expect, beforeEach, afterAll } from 'vitest';
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
