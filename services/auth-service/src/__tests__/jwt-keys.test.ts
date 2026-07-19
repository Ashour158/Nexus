import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGet, mockKeys } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockKeys: vi.fn(),
}));

// jwt-keys.ts obtains its client via createRedisClient() from
// @nexus/service-utils (a prebuilt workspace package), so mocking bare
// 'ioredis' never intercepted it — the module connected to a real Redis and
// these tests timed out on a machine without one. Mock the factory instead.
vi.mock('@nexus/service-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nexus/service-utils')>();
  return {
    ...actual,
    createRedisClient: vi.fn(() => ({
      get: mockGet,
      keys: mockKeys,
    })),
  };
});

import { getCurrentPublicKey, getSigningPrivateKey, getAllPublicKeys } from '../jwt-keys.js';

describe('JWT Key Rotation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getCurrentPublicKey returns the current key', async () => {
    mockGet.mockResolvedValue('public-key-pem');
    const key = await getCurrentPublicKey();
    expect(key).toBe('public-key-pem');
    expect(mockGet).toHaveBeenCalledWith('jwt_keys:public:current');
  });

  it('getSigningPrivateKey returns null when no key exists', async () => {
    mockGet.mockResolvedValue(null);
    const key = await getSigningPrivateKey();
    expect(key).toBeNull();
  });

  it('getAllPublicKeys returns a map of key IDs', async () => {
    mockKeys.mockResolvedValue(['jwt_keys:public:current', 'jwt_keys:public:prev']);
    mockGet.mockResolvedValueOnce('prev-key');
    const keys = await getAllPublicKeys();
    // The `current` entry is an alias for the active key's public PEM, not a
    // distinct key id — getAllPublicKeys deliberately excludes it (treating it
    // as a separate previous key made callers re-import the active public PEM).
    expect(keys).toEqual({
      prev: 'prev-key',
    });
  });
});
