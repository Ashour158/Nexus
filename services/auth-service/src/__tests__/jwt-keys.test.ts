import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCurrentPublicKey, getSigningPrivateKey, getAllPublicKeys } from '../jwt-keys.js';

const mockGet = vi.fn();
const mockKeys = vi.fn();

vi.mock('ioredis', () => ({
  Redis: vi.fn(() => ({
    get: mockGet,
    keys: mockKeys,
  })),
}));

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
    mockGet.mockResolvedValueOnce('current-key').mockResolvedValueOnce('prev-key');
    const keys = await getAllPublicKeys();
    expect(keys).toEqual({
      current: 'current-key',
      prev: 'prev-key',
    });
  });
});
