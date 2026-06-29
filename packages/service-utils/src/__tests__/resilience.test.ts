import { describe, it, expect } from 'vitest';
import { CircuitBreaker, withResilience } from '../resilience.js';

describe('CircuitBreaker', () => {
  it('starts in CLOSED state and allows requests', () => {
    const cb = new CircuitBreaker('test', { failureThreshold: 3 });
    expect(cb.getState()).toBe('CLOSED');
  });

  it('opens after threshold failures', async () => {
    const cb = new CircuitBreaker('test', { failureThreshold: 2 });
    await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
    await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
    expect(cb.getState()).toBe('OPEN');
  });

  it('resets to CLOSED after successful execution', async () => {
    const cb = new CircuitBreaker('test', { failureThreshold: 2, resetTimeoutMs: 50 });
    await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
    await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
    // Wait for timeout
    await new Promise((r) => setTimeout(r, 100));
    await cb.execute(() => Promise.resolve('ok'));
    expect(cb.getState()).toBe('CLOSED');
  });
});

describe('withResilience', () => {
  it('retries on failure and succeeds', async () => {
    let attempts = 0;
    const result = await withResilience(
      async () => {
        attempts++;
        if (attempts < 3) throw new Error('network error');
        return 'success';
      },
      { maxRetries: 3, baseDelayMs: 10 }
    );
    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });

  it('throws after max retries', async () => {
    await expect(
      withResilience(async () => {
        throw new Error('always fails');
      }, { maxRetries: 2, baseDelayMs: 10 })
    ).rejects.toThrow('always fails');
  });

  it('uses separate circuit breakers by name', async () => {
    const cb1 = new CircuitBreaker('svc-a', { failureThreshold: 1, resetTimeoutMs: 30_000 });
    const cb2 = new CircuitBreaker('svc-b', { failureThreshold: 1, resetTimeoutMs: 30_000 });

    await expect(cb1.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
    expect(cb1.getState()).toBe('OPEN');
    expect(cb2.getState()).toBe('CLOSED');
  });
});
