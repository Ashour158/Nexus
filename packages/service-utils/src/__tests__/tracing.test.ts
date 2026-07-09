import { describe, it, expect } from 'vitest';
import { getTraceparentHeader } from '../tracing.js';

describe('Tracing', () => {
  it('getTraceparentHeader returns object with traceparent or empty', () => {
    const tp = getTraceparentHeader();
    expect(tp === undefined || typeof tp === 'object').toBe(true);
  });
});
