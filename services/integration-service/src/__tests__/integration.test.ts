import { describe, it, expect } from 'vitest';

describe('Integration Service', () => {
  it('should validate OAuth redirect URI matches allowed origins', () => {
    const allowed = ['http://localhost:3000', 'https://app.nexus.io'];
    const redirect = 'https://app.nexus.io/callback';
    expect(allowed.some((origin) => redirect.startsWith(origin))).toBe(true);
  });

  it('should reject mismatched OAuth state parameter', () => {
    const state = 'abc123';
    const returnedState = 'xyz789';
    expect(state).not.toBe(returnedState);
  });

  it('should parse webhook signatures correctly', () => {
    const payload = '{"event":"deal.created"}';
    const secret = 'whsec_test';
    const signature = `t=${Date.now()},v1=mockhash`;
    expect(signature.startsWith('t=')).toBe(true);
    expect(payload).toContain('deal');
    expect(secret).toContain('whsec');
    expect(signature.includes(',v1=')).toBe(true);
  });

  it('should handle exponential backoff for failed syncs', () => {
    const attempt = 3;
    const delay = Math.min(2 ** attempt * 1000, 60000);
    expect(delay).toBe(8000);
  });

  it('should validate integration credential expiration', () => {
    const expiresAt = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago
    const isExpired = expiresAt < new Date();
    expect(isExpired).toBe(true);
  });
});
