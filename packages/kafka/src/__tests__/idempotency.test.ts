import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryIdempotencyStore } from '../idempotency.js';

describe('InMemoryIdempotencyStore', () => {
  let store: MemoryIdempotencyStore;

  beforeEach(() => {
    store = new MemoryIdempotencyStore();
  });

  it('returns false for unseen message', async () => {
    const seen = await store.isProcessed('msg-1');
    expect(seen).toBe(false);
  });

  it('returns true after marking processed', async () => {
    await store.markProcessed('msg-1');
    const seen = await store.isProcessed('msg-1');
    expect(seen).toBe(true);
  });

  it('prevents double processing', async () => {
    await store.markProcessed('msg-1');
    await store.markProcessed('msg-1');
    const seen = await store.isProcessed('msg-1');
    expect(seen).toBe(true);
  });
});
