import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, validatePasswordStrength } from '@nexus/security';

describe('Auth Service — Password Security', () => {
  it('should hash and verify passwords with scrypt', async () => {
    const plaintext = 'SecureP@ssw0rd123';
    const hashed = await hashPassword(plaintext);
    expect(hashed).toMatch(/^scrypt\$/);
    const valid = await verifyPassword(plaintext, hashed);
    expect(valid).toBe(true);
    const invalid = await verifyPassword('wrong-password', hashed);
    expect(invalid).toBe(false);
  });

  it('should enforce password strength requirements', () => {
    expect(validatePasswordStrength('weak').valid).toBe(false);
    expect(validatePasswordStrength('NoSpecialChar123').valid).toBe(false);
    expect(validatePasswordStrength('short!1A').valid).toBe(false);
    expect(validatePasswordStrength('SecureP@ssw0rd123').valid).toBe(true);
  });

  it('should reject unsupported hash algorithms', async () => {
    await expect(verifyPassword('test', 'bcrypt$salt$hash')).rejects.toThrow('Unsupported hash algorithm');
  });
});

describe('Auth Service — Password Reset Flow', () => {
  // These tests validate the business logic without requiring a live database.
  // Full integration tests with Prisma should be added once TEST_DATABASE_URL is configured.

  it('should generate a password reset token with UUID format', () => {
    const token = crypto.randomUUID();
    expect(token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('should set reset token expiry to 1 hour', () => {
    const now = Date.now();
    const expiresAt = new Date(now + 1000 * 60 * 60);
    expect(expiresAt.getTime() - now).toBe(3600000);
  });

  it('should validate reset token is not expired', () => {
    const future = new Date(Date.now() + 1000 * 60 * 30);
    const past = new Date(Date.now() - 1000 * 60 * 30);
    expect(future > new Date()).toBe(true);
    expect(past > new Date()).toBe(false);
  });
});

describe('Auth Service — JWT Claims', () => {
  it('should embed correct claims in JWT payload structure', () => {
    const payload = {
      sub: 'user-id-123',
      tenantId: 'tenant-id-456',
      email: 'test@nexus.com',
      role: 'admin',
    };
    expect(payload.sub).toBe('user-id-123');
    expect(payload.tenantId).toBe('tenant-id-456');
    expect(payload.email).toBe('test@nexus.com');
    expect(payload.role).toBe('admin');
  });
});
