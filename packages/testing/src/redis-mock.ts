import { vi, type Mock } from 'vitest';

export interface MockRedis {
  get: Mock;
  setex: Mock;
  del: Mock;
  scan: Mock;
  pipeline: Mock;
  mget: Mock;
}

/**
 * Returns a vi.fn()-based mock implementing common ioredis methods.
 */
export function createMockRedis(): MockRedis {
  return {
    get: vi.fn(),
    setex: vi.fn(),
    del: vi.fn(),
    scan: vi.fn(),
    pipeline: vi.fn(() => ({
      get: vi.fn().mockReturnThis(),
      setex: vi.fn().mockReturnThis(),
      del: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
    })),
    mget: vi.fn(),
  };
}
