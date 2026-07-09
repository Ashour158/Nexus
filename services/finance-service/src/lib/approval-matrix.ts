// ─── B2: Quote approval matrix ──────────────────────────────────────────────
// Evaluates configurable ApprovalMatrixRule rows against a quote's computed
// discount%, margin%, and amount, then (for each matched rule) opens an approval
// request in approval-service — reusing the same integration path the discount
// gate uses (`POST /api/v1/approval/requests`, module 'quote'). Money math for
// the discount/margin evaluation is done with decimal.js by the caller; this
// module only compares the already-computed metrics against the rule condition.

import { Decimal } from 'decimal.js';

export type ApprovalMatrixCondition = {
  discountPctGt?: number;
  marginPctLt?: number;
  amountGt?: number;
  currency?: string;
};

export type ApprovalMatrixRuleShape = {
  id: string;
  name: string;
  level: number;
  condition: unknown;
  approverChain: unknown;
  approverRole: string | null;
  isActive: boolean;
};

export type QuoteApprovalMetrics = {
  discountPct: number;
  marginPct: number | null;
  amount: number;
  currency: string;
};

function asCondition(value: unknown): ApprovalMatrixCondition {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const c = value as Record<string, unknown>;
  const num = (v: unknown): number | undefined => {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    discountPctGt: num(c.discountPctGt),
    marginPctLt: num(c.marginPctLt),
    amountGt: num(c.amountGt),
    currency: typeof c.currency === 'string' ? c.currency : undefined,
  };
}

/** A rule matches when EVERY present clause in its condition holds (AND). */
export function ruleMatches(condition: ApprovalMatrixCondition, metrics: QuoteApprovalMetrics): boolean {
  const clauses: boolean[] = [];
  if (condition.discountPctGt !== undefined) clauses.push(metrics.discountPct > condition.discountPctGt);
  if (condition.marginPctLt !== undefined) {
    clauses.push(metrics.marginPct !== null && metrics.marginPct < condition.marginPctLt);
  }
  if (condition.amountGt !== undefined) clauses.push(metrics.amount > condition.amountGt);
  if (condition.currency !== undefined) clauses.push(metrics.currency === condition.currency);
  // An empty condition never matches (a rule must express at least one clause).
  if (clauses.length === 0) return false;
  return clauses.every(Boolean);
}

export type MatchedApprovalStep = {
  ruleId: string;
  ruleName: string;
  level: number;
  approverChain: string[];
  approverRole: string | null;
};

/** Returns the matched rules as ordered approval steps (ascending level). */
export function evaluateMatrix(
  rules: ApprovalMatrixRuleShape[],
  metrics: QuoteApprovalMetrics
): MatchedApprovalStep[] {
  return rules
    .filter((rule) => rule.isActive && ruleMatches(asCondition(rule.condition), metrics))
    .map((rule) => ({
      ruleId: rule.id,
      ruleName: rule.name,
      level: Number(rule.level ?? 1),
      approverChain: Array.isArray(rule.approverChain)
        ? rule.approverChain.map((a) => String(a)).filter((a) => a.length > 0)
        : [],
      approverRole: rule.approverRole ?? null,
    }))
    .sort((a, b) => a.level - b.level);
}

/** Computes discount% and margin% for a quote using decimal.js. */
export function computeQuoteMetrics(quote: {
  subtotal: unknown;
  discountAmount: unknown;
  total: unknown;
  marginTotal?: unknown;
  currency?: unknown;
}): QuoteApprovalMetrics {
  const subtotal = new Decimal(String(quote.subtotal ?? 0) || 0);
  const discount = new Decimal(String(quote.discountAmount ?? 0) || 0);
  const total = new Decimal(String(quote.total ?? 0) || 0);
  const discountPct = subtotal.gt(0) ? discount.div(subtotal).times(100).toDecimalPlaces(4).toNumber() : 0;

  let marginPct: number | null = null;
  if (quote.marginTotal !== null && quote.marginTotal !== undefined && String(quote.marginTotal) !== '') {
    const margin = new Decimal(String(quote.marginTotal) || 0);
    const base = total.gt(0) ? total : subtotal;
    marginPct = base.gt(0) ? margin.div(base).times(100).toDecimalPlaces(4).toNumber() : null;
  }

  return {
    discountPct,
    marginPct,
    amount: total.toDecimalPlaces(2).toNumber(),
    currency: String(quote.currency ?? 'USD'),
  };
}

/**
 * Opens an approval request in approval-service for one matched matrix step.
 * Service-to-service authenticated with INTERNAL_SERVICE_TOKEN, mirroring the
 * discount-gate integration. Returns the created request id (or undefined).
 */
export async function createMatrixApprovalRequest(
  tenantId: string,
  quoteId: string,
  quoteReference: string,
  requestedBy: string,
  step: MatchedApprovalStep,
  metrics: QuoteApprovalMetrics
): Promise<string | undefined> {
  const base = (process.env.APPROVAL_SERVICE_URL ?? 'http://localhost:3014').replace(/\/$/, '');
  const token = process.env.INTERNAL_SERVICE_TOKEN ?? '';
  try {
    const res = await fetch(`${base}/api/v1/approval/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': tenantId,
        Authorization: token ? `Bearer ${token}` : '',
      },
      body: JSON.stringify({
        module: 'quote',
        recordId: quoteId,
        requestedBy,
        data: {
          quoteId,
          quoteReference,
          reason: 'APPROVAL_MATRIX',
          ruleId: step.ruleId,
          ruleName: step.ruleName,
          level: step.level,
          approverRole: step.approverRole,
          approverChain: step.approverChain,
          discountPercent: metrics.discountPct,
          marginPercent: metrics.marginPct,
          amount: metrics.amount,
          currency: metrics.currency,
        },
      }),
    });
    if (!res.ok) return undefined;
    const json = (await res.json()) as { success?: boolean; data?: { id?: string } };
    return json.data?.id;
  } catch {
    return undefined;
  }
}
