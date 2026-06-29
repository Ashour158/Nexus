import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildDatabaseUrl, buildReadReplicaUrl } from '../db.js';

describe('buildDatabaseUrl', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, DATABASE_URL: 'postgresql://user:pass@localhost:5432/nexus' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('adds connection limit param', () => {
    const url = buildDatabaseUrl({ connectionLimit: 10 });
    expect(url).toContain('connection_limit=10');
  });

  it('adds pgbouncer param', () => {
    const url = buildDatabaseUrl({ pgbouncer: true });
    expect(url).toContain('pgbouncer=true');
  });

  it('returns base URL with default connection params when no options', () => {
    const url = buildDatabaseUrl();
    expect(url).toBe('postgresql://user:pass@localhost:5432/nexus?connection_limit=3&pool_timeout=10');
  });
});

describe('buildReadReplicaUrl', () => {
  it('uses DATABASE_READ_REPLICA_URL when set', () => {
    process.env.DATABASE_READ_REPLICA_URL = 'postgresql://replica:5432/nexus';
    const url = buildReadReplicaUrl();
    expect(url).toContain('replica:5432');
  });
});
