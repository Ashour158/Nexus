import { describe, expect, it } from 'vitest';

import {
  assertRfqConvertible,
  validatePreviewQuoteCreatePayload,
  validatePreviewRfqCreatePayload,
} from './cpq-authority';

describe('CPQ authority guards', () => {
  it('rejects RFQ creation without deal, account, and normalized lines', () => {
    const result = validatePreviewRfqCreatePayload({ title: 'Loose RFQ', lineItems: [] });

    expect(result.valid).toBe(false);
    expect(result.errors).toMatchObject({
      dealId: expect.any(String),
      accountId: expect.any(String),
      lineItems: expect.any(String),
    });
  });

  it('accepts RFQ creation with commercial anchors and a normalized line', () => {
    const result = validatePreviewRfqCreatePayload({
      dealId: 'deal-1',
      accountId: 'acct-1',
      lineItems: [{ productId: 'prod-1', quantity: 2, unitPrice: 100 }],
    });

    expect(result).toEqual({ valid: true, errors: {} });
  });

  it('rejects direct quote creation without RFQ and approval context', () => {
    const result = validatePreviewQuoteCreatePayload({
      dealId: 'deal-1',
      accountId: 'acct-1',
      lineItems: [{ productId: 'prod-1', quantity: 1, unitPrice: 100 }],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toMatchObject({
      rfqId: expect.any(String),
      approvalPath: expect.any(String),
    });
  });

  it('blocks RFQ conversion before review', () => {
    const result = assertRfqConvertible({ id: 'rfq-1', status: 'DRAFT', lineItems: [{ productId: 'prod-1', quantity: 1, unitPrice: 100 }] });

    expect(result.valid).toBe(false);
    expect(result.errors).toMatchObject({ status: expect.any(String) });
  });

  it('allows RFQ conversion from reviewed or responded states', () => {
    expect(assertRfqConvertible({ id: 'rfq-1', status: 'REVIEWING', lineItems: [{ productId: 'prod-1', quantity: 1, unitPrice: 100 }] })).toEqual({
      valid: true,
      errors: {},
    });
    expect(assertRfqConvertible({ id: 'rfq-2', status: 'RESPONDED', lineItems: [{ productId: 'prod-1', quantity: 1, unitPrice: 100 }] })).toEqual({
      valid: true,
      errors: {},
    });
  });
});
