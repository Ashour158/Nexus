// Deal-derived forecast roll-up helpers (crm-service).
//
// These operate directly on the Deal table (full fidelity: forecastCategory,
// probability, aiWinProbability, stage), so the CRM forecast surface is the
// accurate, deterministic source of per-rep forecast numbers. Everything here
// is pure/synchronous given already-loaded deals + a base-currency amount map;
// currency conversion + I/O happen in the route.

import { createHttpClient } from '@nexus/service-utils';

/** A single deal's fields needed for forecasting (subset of Prisma Deal). */
export interface ForecastDeal {
  id: string;
  ownerId: string;
  amount: unknown;
  currency: unknown;
  probability: number | null;
  aiWinProbability: number | null;
  status: string; // OPEN | WON | LOST | DORMANT
  forecastCategory: string; // PIPELINE | BEST_CASE | COMMIT | CLOSED | OMITTED
  stage?: { probability?: number | null } | null;
}

export interface RepBuckets {
  // Raw category sums (base currency).
  commit: number;
  bestCase: number; // raw BEST_CASE bucket
  pipeline: number; // raw PIPELINE bucket
  omitted: number;
  closed: number; // realized closed-won in the window
  // Weighted / AI-weighted open pipeline.
  weighted: number;
  aiWeighted: number;
  // Deal + AI-coverage counts.
  openDealCount: number;
  aiScoredCount: number;
}

export interface RepForecastRow extends RepBuckets {
  ownerId: string;
  ownerName: string;
  // Containment view (commit ⊆ best_case ⊆ pipeline).
  commitTotal: number;
  bestCaseTotal: number;
  pipelineTotal: number;
  // Back-compat fields kept for existing web/consumers.
  totalValue: number;
  weightedValue: number;
}

export function emptyBuckets(): RepBuckets {
  return {
    commit: 0,
    bestCase: 0,
    pipeline: 0,
    omitted: 0,
    closed: 0,
    weighted: 0,
    aiWeighted: 0,
    openDealCount: 0,
    aiScoredCount: 0,
  };
}

/** Stage probability wins when present; else the deal's own probability; else 0.
 *  We never invent a default (no 0.25 / 50 fallback). */
export function effectiveProbability(deal: ForecastDeal): number {
  const stageP = deal.stage?.probability;
  if (typeof stageP === 'number' && Number.isFinite(stageP)) return Math.max(0, Math.min(100, stageP));
  const dealP = deal.probability;
  if (typeof dealP === 'number' && Number.isFinite(dealP)) return Math.max(0, Math.min(100, dealP));
  return 0;
}

/**
 * Fold one deal into a rep bucket. `baseAmount` is the deal amount already
 * converted to the tenant base currency.
 */
export function foldDeal(b: RepBuckets, deal: ForecastDeal, baseAmount: number): void {
  const amt = Number.isFinite(baseAmount) ? baseAmount : 0;
  const status = String(deal.status);
  if (status === 'WON') {
    b.closed += amt;
    return;
  }
  if (status === 'LOST') {
    // Lost deals contribute to nothing (kept out of every open bucket).
    return;
  }
  // Open (OPEN | DORMANT): bucket by the deal's forecast category.
  const cat = String(deal.forecastCategory);
  if (cat === 'OMITTED') {
    b.omitted += amt;
    return;
  }
  if (cat === 'CLOSED') {
    // Category says closed but status is still open — treat as realized.
    b.closed += amt;
    return;
  }
  if (cat === 'COMMIT') b.commit += amt;
  else if (cat === 'BEST_CASE') b.bestCase += amt;
  else b.pipeline += amt; // PIPELINE (and any unknown) → pipeline

  // Weighted + AI-weighted apply to the OPEN, non-omitted pipeline only.
  const prob = effectiveProbability(deal) / 100;
  b.weighted += amt * prob;
  const ai = typeof deal.aiWinProbability === 'number' && Number.isFinite(deal.aiWinProbability)
    ? Math.max(0, Math.min(1, deal.aiWinProbability))
    : null;
  if (ai !== null) b.aiScoredCount += 1;
  b.aiWeighted += amt * (ai ?? prob);
  b.openDealCount += 1;
}

/** Finalize a rep's containment view + back-compat fields. */
export function finalizeRep(ownerId: string, ownerName: string, b: RepBuckets): RepForecastRow {
  const commitTotal = b.commit;
  const bestCaseTotal = b.commit + b.bestCase;
  const pipelineTotal = b.commit + b.bestCase + b.pipeline;
  return {
    ownerId,
    ownerName,
    ...b,
    // round money-ish values to whole units to match the existing surface.
    weighted: Math.round(b.weighted),
    aiWeighted: Math.round(b.aiWeighted),
    commitTotal,
    bestCaseTotal,
    pipelineTotal,
    totalValue: pipelineTotal,
    weightedValue: Math.round(b.weighted),
  };
}

/* ─────────────────────────── org hierarchy client ───────────────────────── */

const authClient = createHttpClient({
  baseURL: process.env.AUTH_SERVICE_URL ?? 'http://localhost:3001',
});

export interface OrgNode {
  userId: string;
  name?: string;
  jobTitle?: string | null;
  directReports?: OrgNode[];
}

/**
 * Fetch the tenant reporting tree from auth-service. Fail-open → [] (the caller
 * then presents a flat, single-level roll-up). The caller's bearer is forwarded
 * so the org chart is read under the caller's authorization.
 */
export async function fetchOrgChart(bearer?: string, tenantId?: string): Promise<OrgNode[]> {
  try {
    const headers: Record<string, string> = {};
    if (bearer) headers.Authorization = bearer.startsWith('Bearer ') ? bearer : `Bearer ${bearer}`;
    const internal = process.env.INTERNAL_SERVICE_TOKEN;
    if (internal) headers['x-service-token'] = internal;
    if (tenantId) headers['x-tenant-id'] = tenantId;
    const body = (await authClient.get('/api/v1/org-chart', headers)) as { data?: OrgNode[] } | undefined;
    return Array.isArray(body?.data) ? (body!.data as OrgNode[]) : [];
  } catch {
    return [];
  }
}
