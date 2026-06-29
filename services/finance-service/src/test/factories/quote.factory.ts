export function quoteFactory(overrides: Record<string, unknown> = {}) {
  return {
    id: 'quo_' + Math.random().toString(36).slice(2, 11),
    tenantId: 'ten_test',
    dealId: 'dea_test',
    accountId: 'acc_test',
    quoteNumber: 'Q-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
    status: 'DRAFT',
    currency: 'USD',
    subtotal: 1000,
    discountAmount: 0,
    taxAmount: 150,
    total: 1150,
    sentAt: null,
    acceptedAt: null,
    rejectedAt: null,
    voidedAt: null,
    expiredAt: null,
    notes: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}
