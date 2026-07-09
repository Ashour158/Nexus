import type { FinancePrisma } from '../prisma.js';

/** Approver tiers for the tiered discount matrix (feature 4). */
export type DiscountApproverTier = 'AUTO' | 'MANAGER' | 'DIRECTOR' | 'VP' | 'CFO';

export type DiscountApprovalResult = {
  required: boolean;
  requestId?: string;
  thresholdPercent: number;
  actualDiscountPercent: number;
  /** Tier/level required to approve this discount band. */
  approverTier: DiscountApproverTier;
};

/**
 * Tiered discount approver matrix. Each band names the *maximum* discount % it
 * covers and the approver tier that must sign off. The first (auto) band never
 * requires approval. Bands are configurable via env (see `resolveMatrix`).
 */
type DiscountBand = { maxPercent: number; tier: DiscountApproverTier };

const DEFAULT_MATRIX: DiscountBand[] = [
  { maxPercent: 15, tier: 'AUTO' },
  { maxPercent: 30, tier: 'MANAGER' },
  { maxPercent: 40, tier: 'DIRECTOR' },
  { maxPercent: Number.POSITIVE_INFINITY, tier: 'VP' },
];

/**
 * Reason codes that escalate the approver tier by one level. Strategic/executive
 * exceptions and competitive matches carry more risk and are bumped up.
 */
const ESCALATING_REASON_CODES = new Set([
  'EXECUTIVE_EXCEPTION',
  'STRATEGIC_ACCOUNT',
]);

const TIER_ORDER: DiscountApproverTier[] = ['AUTO', 'MANAGER', 'DIRECTOR', 'VP', 'CFO'];

/**
 * Resolves the band matrix. Thresholds are overridable via env so ops can tune
 * without a deploy; falls back to the default bands (and to the legacy
 * `DISCOUNT_APPROVAL_THRESHOLD` for the auto ceiling when the new vars are
 * absent so existing behaviour is preserved).
 */
function resolveMatrix(): DiscountBand[] {
  const num = (value: string | undefined): number | undefined => {
    if (value === undefined) return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  };
  const autoMax =
    num(process.env.DISCOUNT_TIER_AUTO_MAX) ??
    num(process.env.DISCOUNT_APPROVAL_THRESHOLD) ??
    15;
  const managerMax = num(process.env.DISCOUNT_TIER_MANAGER_MAX) ?? 30;
  const directorMax = num(process.env.DISCOUNT_TIER_DIRECTOR_MAX) ?? 40;
  return [
    { maxPercent: autoMax, tier: 'AUTO' },
    { maxPercent: managerMax, tier: 'MANAGER' },
    { maxPercent: directorMax, tier: 'DIRECTOR' },
    { maxPercent: Number.POSITIVE_INFINITY, tier: 'VP' },
  ];
}

/** Selects the band whose ceiling first covers `discountPercent`. */
function selectBand(discountPercent: number, matrix: DiscountBand[]): DiscountBand {
  for (const band of matrix) {
    if (discountPercent <= band.maxPercent) return band;
  }
  return matrix[matrix.length - 1] ?? DEFAULT_MATRIX[DEFAULT_MATRIX.length - 1];
}

/** Escalates a tier by one level (capped at CFO) for high-risk reason codes. */
function escalateTier(tier: DiscountApproverTier): DiscountApproverTier {
  const idx = TIER_ORDER.indexOf(tier);
  const next = Math.min(idx + 1, TIER_ORDER.length - 1);
  return TIER_ORDER[next];
}

/**
 * Resolves the approver tier for a discount band, factoring in the reason code.
 * Exposed for callers that only need the routing decision (no approval I/O).
 */
export function resolveDiscountTier(
  actualDiscountPercent: number,
  reasonCode?: string
): { tier: DiscountApproverTier; thresholdPercent: number; required: boolean } {
  const matrix = resolveMatrix();
  const band = selectBand(actualDiscountPercent, matrix);
  let tier = band.tier;
  if (tier !== 'AUTO' && reasonCode && ESCALATING_REASON_CODES.has(reasonCode)) {
    tier = escalateTier(tier);
  }
  return {
    tier,
    thresholdPercent: matrix[0]?.maxPercent ?? 15,
    required: tier !== 'AUTO',
  };
}

async function fetchApprovalRows(
  tenantId: string,
  quoteId: string
): Promise<Array<{ id: string; status: string }>> {
  const base = process.env.APPROVAL_SERVICE_URL ?? 'http://localhost:3014';
  const token = process.env.INTERNAL_SERVICE_TOKEN ?? '';
  const qs = new URLSearchParams({
    module: 'quote',
    recordId: quoteId,
    limit: '100',
    page: '1',
  });
  const res = await fetch(`${base}/api/v1/approval/requests?${qs.toString()}`, {
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-id': tenantId,
      Authorization: token ? `Bearer ${token}` : '',
    },
  });
  if (!res.ok) return [];
  const envelope = (await res.json()) as {
    success?: boolean;
    data?: { data?: Array<{ id: string; status: string }> };
  };
  return envelope.data?.data ?? [];
}

async function postApprovalRequest(
  tenantId: string,
  quoteId: string,
  requesterId: string,
  quoteReference: string,
  actualDiscountPercent: number,
  discountAmount: number,
  subtotal: number,
  thresholdPercent: number,
  approverTier: DiscountApproverTier
): Promise<string | undefined> {
  const base = process.env.APPROVAL_SERVICE_URL ?? 'http://localhost:3014';
  const token = process.env.INTERNAL_SERVICE_TOKEN ?? '';
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
      requestedBy: requesterId,
      data: {
        quoteId,
        quoteReference,
        discountPercent: actualDiscountPercent,
        discountAmount,
        subtotal,
        thresholdPercent,
        approverTier,
        reason: 'DISCOUNT_THRESHOLD',
      },
    }),
  });

  if (!res.ok) return undefined;
  const json = (await res.json()) as { success?: boolean; data?: { id?: string } };
  return json.data?.id;
}

export async function checkDiscountApproval(
  _prisma: FinancePrisma,
  tenantId: string,
  quoteId: string,
  subtotal: number,
  discountAmount: number,
  requesterId: string,
  quoteReference: string,
  reasonCode?: string
): Promise<DiscountApprovalResult> {
  const actualDiscountPercent =
    subtotal > 0 ? (discountAmount / subtotal) * 100 : 0;

  // Tiered approver matrix (feature 4) replaces the single flat threshold.
  const { tier, thresholdPercent, required } = resolveDiscountTier(
    actualDiscountPercent,
    reasonCode
  );

  if (!required) {
    return {
      required: false,
      thresholdPercent,
      actualDiscountPercent,
      approverTier: tier,
    };
  }

  const rows = await fetchApprovalRows(tenantId, quoteId);
  const pending = rows.find((r) => r.status === 'PENDING');
  if (pending) {
    return {
      required: true,
      requestId: pending.id,
      thresholdPercent,
      actualDiscountPercent,
      approverTier: tier,
    };
  }
  const approved = rows.find((r) => r.status === 'APPROVED');
  if (approved) {
    return {
      required: false,
      requestId: approved.id,
      thresholdPercent,
      actualDiscountPercent,
      approverTier: tier,
    };
  }

  const requestId = await postApprovalRequest(
    tenantId,
    quoteId,
    requesterId,
    quoteReference,
    actualDiscountPercent,
    discountAmount,
    subtotal,
    thresholdPercent,
    tier
  );

  return {
    required: true,
    requestId,
    thresholdPercent,
    actualDiscountPercent,
    approverTier: tier,
  };
}
