import { describe, it, expect } from 'vitest';
import { setRlsContext, getRlsContext, clearRlsContext, buildRlsSessionSql } from '../rls.js';

describe('RLS Context', () => {
  it('sets and gets RLS context', () => {
    const ctx = { tenantId: 't1', userId: 'u1' };
    setRlsContext(ctx);
    expect(getRlsContext()).toEqual(ctx);
    clearRlsContext();
    expect(getRlsContext()).toBeUndefined();
  });

  it('builds RLS session SQL', () => {
    const sql = buildRlsSessionSql({ tenantId: 't1', userId: 'u1' });
    expect(sql).toHaveLength(2);
    expect(sql[0]).toBe("SET LOCAL app.current_tenant_id = 't1';");
    expect(sql[1]).toBe("SET LOCAL app.current_user_id = 'u1';");
  });

  it('rejects malicious RLS context values', () => {
    expect(() => buildRlsSessionSql({ tenantId: "t1'; DROP TABLE users; --", userId: 'u1' })).toThrow('Invalid characters');
    expect(() => buildRlsSessionSql({ tenantId: 't1', userId: 'u1\n malicious' })).toThrow('Invalid characters');
  });
});
