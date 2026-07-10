import { describe, expect, it } from 'vitest';
import { getCausation, parseCausation, runWithCausation } from '../causation.js';

describe('parseCausation', () => {
  it('returns undefined for an ordinary request so normal traffic is unstamped', () => {
    expect(parseCausation({}, {})).toBeUndefined();
    expect(parseCausation({}, undefined)).toBeUndefined();
    expect(parseCausation({ 'content-type': 'application/json' }, { tenantId: 't1' })).toBeUndefined();
  });

  it('reads the chain from headers', () => {
    expect(parseCausation({ 'x-causation-depth': '3', 'x-root-event-id': 'evt-1' }, {})).toEqual({
      depth: 3,
      rootEventId: 'evt-1',
    });
  });

  it('falls back to the body when headers are stripped', () => {
    expect(parseCausation({}, { _causation: { depth: 2, rootEventId: 'evt-9' } })).toEqual({
      depth: 2,
      rootEventId: 'evt-9',
    });
  });

  it('prefers the header over the body when both are present', () => {
    const parsed = parseCausation({ 'x-causation-depth': '5' }, { _causation: { depth: 1 } });
    expect(parsed?.depth).toBe(5);
  });

  it('accepts depth 0 — a rooted chain at its first hop is still a chain', () => {
    expect(parseCausation({ 'x-causation-depth': '0' }, {})).toEqual({ depth: 0 });
  });

  it('rejects garbage rather than fabricating a depth that would defeat the guard', () => {
    expect(parseCausation({ 'x-causation-depth': 'abc' }, {})).toBeUndefined();
    expect(parseCausation({ 'x-causation-depth': '-1' }, {})).toBeUndefined();
  });
});

describe('runWithCausation', () => {
  it('exposes the context to callees, including across an await', async () => {
    expect(getCausation()).toBeUndefined();

    await runWithCausation({ depth: 4, rootEventId: 'root' }, async () => {
      expect(getCausation()).toEqual({ depth: 4, rootEventId: 'root' });
      await Promise.resolve();
      // The stamp happens inside producer.publish, which is always awaited deep in
      // a service call — the context has to survive the microtask boundary.
      expect(getCausation()).toEqual({ depth: 4, rootEventId: 'root' });
    });

    expect(getCausation()).toBeUndefined();
  });
});
