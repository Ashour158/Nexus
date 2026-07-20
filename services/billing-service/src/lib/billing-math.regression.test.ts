import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { computeInvoiceBalance } from './billing-math.js';

describe('billing reversal ledger', () => {
  it('balances completed payments plus an issued credit note against the invoice', () => {
    // Catches reversals mutating the invoice face value or leaving phantom money due.
    const balance = computeInvoiceBalance({
      amount: new Decimal('100.00'),
      payments: [
        { amount: new Decimal('60.00'), status: 'COMPLETED' },
        { amount: new Decimal('99.00'), status: 'FAILED' },
      ],
      creditNotes: [
        { amount: new Decimal('40.00'), status: 'ISSUED' },
        { amount: new Decimal('25.00'), status: 'VOID' },
      ],
    });

    expect(balance).toEqual({
      amount: '100.00',
      paid: '60.00',
      credited: '40.00',
      outstanding: '0.00',
    });
    expect(
      new Decimal(balance.paid)
        .plus(balance.credited)
        .plus(balance.outstanding)
        .equals(balance.amount)
    ).toBe(true);
  });
});
