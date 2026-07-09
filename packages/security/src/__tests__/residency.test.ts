import { describe, it, expect } from 'vitest';
import { DataResidencyRouter } from '../residency.js';

describe('DataResidencyRouter', () => {
  const router = new DataResidencyRouter({
    defaultRegion: 'us-east-1',
    regionMap: {
      'us-east-1': { databaseUrl: 'db-us', redisUrl: 'redis-us', s3Bucket: 's3-us' },
      'EU-west-1': { databaseUrl: 'db-eu', redisUrl: 'redis-eu', s3Bucket: 's3-eu' },
    },
  });

  it('returns correct region DB URL', () => {
    expect(router.getDatabaseUrl('EU-west-1')).toBe('db-eu');
    expect(router.getDatabaseUrl()).toBe('db-us');
  });

  it('blocks EU to US data transfer', () => {
    expect(router.isDataTransferAllowed('EU-west-1', 'us-east-1')).toBe(false);
    expect(router.isDataTransferAllowed('us-east-1', 'EU-west-1')).toBe(true);
  });
});
