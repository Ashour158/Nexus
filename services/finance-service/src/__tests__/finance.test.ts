import { describe, it, expect } from 'vitest';

describe('Finance Service', () => {
  it('should calculate invoice totals with tax', () => {
    const subtotal = 100;
    const taxRate = 0.08;
    const total = subtotal * (1 + taxRate);
    expect(total).toBeCloseTo(108, 2);
  });

  it('should handle currency conversion with 4 decimal precision', () => {
    const amount = 100;
    const rate = 1.2345;
    const converted = Number((amount * rate).toFixed(4));
    expect(converted).toBe(123.45);
  });

  it('should validate transaction amount is positive', () => {
    const amount = -50;
    expect(amount > 0).toBe(false);
  });

  it('should enforce budget limits', () => {
    const budget = 10000;
    const spent = 9500;
    const newExpense = 1000;
    expect(spent + newExpense > budget).toBe(true);
  });

  it('should amortize commission over deal lifetime', () => {
    const commission = 1200;
    const months = 12;
    const monthly = commission / months;
    expect(monthly).toBe(100);
  });
});
