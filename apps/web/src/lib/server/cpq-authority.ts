type ValidationResult = {
  valid: boolean;
  errors: Record<string, string>;
};

type CommercialLine = {
  productId?: unknown;
  sku?: unknown;
  quantity?: unknown;
  unitPrice?: unknown;
  listPrice?: unknown;
};

type RfqLike = {
  id?: unknown;
  status?: unknown;
  lineItems?: unknown;
};

const RFQ_CONVERTIBLE_STATUSES = new Set(['REVIEWING', 'RESPONDED', 'READY_FOR_QUOTE']);

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function toLines(payload: Record<string, unknown>): CommercialLine[] {
  const lines = Array.isArray(payload.lineItems) ? payload.lineItems : Array.isArray(payload.items) ? payload.items : [];
  return lines.filter((line): line is CommercialLine => Boolean(line) && typeof line === 'object');
}

function hasPositiveNumber(value: unknown): boolean {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function hasNonNegativeNumber(value: unknown): boolean {
  return Number.isFinite(Number(value)) && Number(value) >= 0;
}

function validateNormalizedLines(payload: Record<string, unknown>, errors: Record<string, string>): void {
  const lines = toLines(payload);
  if (lines.length === 0) {
    errors.lineItems = 'At least one normalized commercial line item is required.';
    return;
  }

  const invalidLineIndex = lines.findIndex((line) => {
    const hasProduct = hasText(line.productId) || hasText(line.sku);
    const hasQuantity = hasPositiveNumber(line.quantity);
    const hasPrice = hasNonNegativeNumber(line.unitPrice) || hasNonNegativeNumber(line.listPrice);
    return !hasProduct || !hasQuantity || !hasPrice;
  });

  if (invalidLineIndex >= 0) {
    errors.lineItems = `Line ${invalidLineIndex + 1} must include productId or sku, positive quantity, and unitPrice or listPrice.`;
  }
}

function result(errors: Record<string, string>): ValidationResult {
  return { valid: Object.keys(errors).length === 0, errors };
}

export function validatePreviewRfqCreatePayload(payload: Record<string, unknown>): ValidationResult {
  const errors: Record<string, string> = {};
  if (!hasText(payload.dealId)) errors.dealId = 'RFQ creation requires a dealId.';
  if (!hasText(payload.accountId)) errors.accountId = 'RFQ creation requires an accountId.';
  validateNormalizedLines(payload, errors);
  return result(errors);
}

export function validatePreviewQuoteCreatePayload(payload: Record<string, unknown>): ValidationResult {
  const errors: Record<string, string> = {};
  if (!hasText(payload.rfqId)) errors.rfqId = 'Quote creation requires an RFQ context.';
  if (!hasText(payload.dealId)) errors.dealId = 'Quote creation requires a dealId.';
  if (!hasText(payload.accountId)) errors.accountId = 'Quote creation requires an accountId.';
  if (!hasText(payload.approvalPathId) && !hasText(payload.approvalPolicyId) && !hasText(payload.approverId)) {
    errors.approvalPath = 'Quote creation requires an approval path, approval policy, or resolved approver.';
  }
  validateNormalizedLines(payload, errors);
  return result(errors);
}

export function assertRfqConvertible(rfq: RfqLike): ValidationResult {
  const errors: Record<string, string> = {};
  const status = String(rfq.status ?? '');
  if (!RFQ_CONVERTIBLE_STATUSES.has(status)) {
    errors.status = `RFQ must be reviewed before quote conversion. Current status: ${status || 'UNKNOWN'}.`;
  }
  validateNormalizedLines({ lineItems: Array.isArray(rfq.lineItems) ? rfq.lineItems : [] }, errors);
  return result(errors);
}
