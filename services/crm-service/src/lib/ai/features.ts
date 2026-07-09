// Feature extraction for the explainable predictive AI layer.
//
// Pure functions mapping a Deal (+ related activity/MEDDIC/health signals) and a
// Lead to a NORMALIZED numeric feature vector. "Normalized" here means each
// feature is mapped to a stable, roughly 0-1 (or small-magnitude) scale up front
// so priors are interpretable; the logistic model additionally z-scores at train
// time. Every feature is documented with its sign intuition (does more of it
// make a win/conversion MORE or LESS likely?).
//
// We reuse the deal-health engine's signal derivations wherever possible so the
// AI layer and the deterministic health layer see the same underlying reality.

import { computeDealHealth, type DealHealthInput } from '../deal-health.engine.js';

/* ─────────────────────────── DEAL FEATURES ──────────────────────────────── */

/**
 * Ordered list of deal feature names. The order is the canonical training order
 * and is embedded in every trained model's coefficient map.
 */
export const DEAL_FEATURES = [
  'stageProbability', //  deal.probability / 100.          ↑ win
  'meddicScore', //        meddicicScore / 100.             ↑ win
  'dataQuality', //        dataQualityScore / 100.          ↑ win (proxy for rigor)
  'championIdentified', // MEDDIC champion flag 0/1.        ↑ win
  'economicBuyer', //      MEDDIC economic-buyer flag 0/1.  ↑ win
  'activityRecency', //    health recency sub-score / 100.  ↑ win
  'activityFrequency', //  health frequency sub-score /100. ↑ win
  'stageProgress', //      stage idle health / 100.         ↑ win (fresh in stage)
  'closeDateHealth', //    slippage sub-score / 100.        ↑ win (no push/overdue)
  'hasAmount', //          amount > 0 ? 1 : 0.              ↑ win (qualified)
  'logAmount', //          ln(1+amount)/25 clamp.           mild ↑ (bigger = harder but real)
  'competitorPressure', // min(#competitors,3)/3.           ↓ win
  'dealAgeDays', //        min(ageDays,180)/180.            ↓ win (older open = staler)
] as const;

export type DealFeatureName = (typeof DEAL_FEATURES)[number];

/**
 * Sensible prior coefficients for the deal-win model (log-odds scale, applied to
 * standardized features). Signs encode domain knowledge; magnitudes are modest
 * so a trained model can easily override them. Used verbatim when a tenant has
 * no trained model yet — honest defaults, NOT fabricated certainty (the scoring
 * service marks such predictions `lowData`).
 */
export const DEAL_WIN_PRIORS: Record<string, number> & { __intercept: number } = {
  __intercept: -0.2, // base rate slightly below 50/50 for an open deal
  stageProbability: 1.4,
  meddicScore: 0.9,
  dataQuality: 0.3,
  championIdentified: 0.7,
  economicBuyer: 0.6,
  activityRecency: 0.8,
  activityFrequency: 0.5,
  stageProgress: 0.5,
  closeDateHealth: 0.6,
  hasAmount: 0.2,
  logAmount: -0.1,
  competitorPressure: -0.6,
  dealAgeDays: -0.5,
};

/** Everything the deal feature extractor needs. Assembled by the caller (I/O). */
export interface DealFeatureInput {
  status: string;
  probability: number | null;
  meddicScore: number | null;
  dataQualityScore: number | null;
  amount: number | null;
  competitorCount: number;
  createdAt: Date;
  updatedAt: Date;
  /** MEDDIC blob for champion / economic-buyer flags. */
  meddic: Record<string, unknown> | null;
  /** Signals for the shared deal-health computation. */
  health: DealHealthInput;
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
const num = (n: unknown, f = 0): number => (typeof n === 'number' && Number.isFinite(n) ? n : f);

function meddicFlag(meddic: Record<string, unknown> | null, key: string): number {
  if (!meddic || typeof meddic !== 'object') return 0;
  const node = meddic[key] as { identified?: unknown } | undefined;
  if (node && typeof node === 'object' && typeof node.identified === 'boolean') {
    return node.identified ? 1 : 0;
  }
  return 0;
}

/**
 * Extract the normalized deal feature vector. Pure & total — reuses
 * {@link computeDealHealth} sub-scores so the AI and health layers agree.
 */
export function extractDealFeatures(input: DealFeatureInput): Record<DealFeatureName, number> {
  const health = computeDealHealth(input.health);
  const DAY_MS = 24 * 60 * 60 * 1000;
  const ageDays = Math.max(0, Math.floor((Date.now() - input.createdAt.getTime()) / DAY_MS));
  const amount = num(input.amount);

  return {
    stageProbability: clamp01(num(input.probability) / 100),
    meddicScore: clamp01(num(input.meddicScore) / 100),
    dataQuality: clamp01(num(input.dataQualityScore, 50) / 100),
    championIdentified: meddicFlag(input.meddic, 'champion'),
    economicBuyer: meddicFlag(input.meddic, 'economicBuyer'),
    activityRecency: clamp01(health.subScores.activityRecency / 100),
    activityFrequency: clamp01(health.subScores.activityFrequency / 100),
    stageProgress: clamp01(health.subScores.stageIdle / 100),
    closeDateHealth: clamp01(health.subScores.closeDateSlippage / 100),
    hasAmount: amount > 0 ? 1 : 0,
    logAmount: clamp01(Math.log1p(amount) / 25),
    competitorPressure: clamp01(Math.min(input.competitorCount, 3) / 3),
    dealAgeDays: clamp01(Math.min(ageDays, 180) / 180),
  };
}

/** Human labels for deal features — used to render plain-language explanations. */
export const DEAL_FEATURE_LABELS: Record<DealFeatureName, string> = {
  stageProbability: 'Stage probability',
  meddicScore: 'MEDDIC completeness',
  dataQuality: 'Data quality',
  championIdentified: 'Champion identified',
  economicBuyer: 'Economic buyer identified',
  activityRecency: 'Recent activity',
  activityFrequency: 'Engagement cadence',
  stageProgress: 'Stage momentum',
  closeDateHealth: 'Close-date discipline',
  hasAmount: 'Deal amount set',
  logAmount: 'Deal size',
  competitorPressure: 'Competitive pressure',
  dealAgeDays: 'Deal age',
};

/* ─────────────────────────── LEAD FEATURES ──────────────────────────────── */

/** Canonical ordered lead feature names. */
export const LEAD_FEATURES = [
  'engagementScore', //   lead.score / 100.                ↑ convert
  'dataQuality', //       dataQualityScore / 100.          ↑ convert
  'hasEmail', //          email present 0/1.               ↑ convert (reachable)
  'hasPhone', //          phone present 0/1.               ↑ convert
  'hasCompany', //        company present 0/1.             ↑ convert (B2B fit)
  'isEnriched', //        firmographics present 0/1.       ↑ convert
  'activityRecency', //   recency of last touch / 100.     ↑ convert
  'activityCount', //     min(#activities,10)/10.          ↑ convert
  'highIntentSource', //  source in {referral,demo,...}.   ↑ convert
  'leadAgeDays', //       min(ageDays,90)/90.              ↓ convert (aging lead cools)
] as const;

export type LeadFeatureName = (typeof LEAD_FEATURES)[number];

/** Prior coefficients for lead conversion (see {@link DEAL_WIN_PRIORS}). */
export const LEAD_CONVERSION_PRIORS: Record<string, number> & { __intercept: number } = {
  __intercept: -0.8, // most leads do not convert — base rate well below 50%
  engagementScore: 1.3,
  dataQuality: 0.4,
  hasEmail: 0.3,
  hasPhone: 0.3,
  hasCompany: 0.4,
  isEnriched: 0.4,
  activityRecency: 0.8,
  activityCount: 0.7,
  highIntentSource: 0.6,
  leadAgeDays: -0.6,
};

const HIGH_INTENT_SOURCES = new Set(['REFERRAL', 'PARTNER', 'EVENT', 'WEB_FORM', 'CHAT']);

export interface LeadFeatureInput {
  score: number | null;
  dataQualityScore: number | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  industry: string | null;
  annualRevenue: number | null;
  employeeCount: number | null;
  source: string | null;
  createdAt: Date;
  /** Days since the most recent activity, or null if none. */
  daysSinceLastActivity: number | null;
  /** Count of activities on the lead. */
  activityCount: number;
}

/** Recency sub-score mirroring the deal-health decay (full marks <=3d, 0 by 45d). */
function recency01(days: number | null): number {
  if (days == null) return 0;
  if (days <= 3) return 1;
  return clamp01(1 - (days - 3) / 42);
}

/** Extract the normalized lead feature vector. Pure & total. */
export function extractLeadFeatures(input: LeadFeatureInput): Record<LeadFeatureName, number> {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const ageDays = Math.max(0, Math.floor((Date.now() - input.createdAt.getTime()) / DAY_MS));
  const enriched =
    !!input.industry || num(input.annualRevenue) > 0 || num(input.employeeCount) > 0 ? 1 : 0;
  return {
    engagementScore: clamp01(num(input.score) / 100),
    dataQuality: clamp01(num(input.dataQualityScore, 50) / 100),
    hasEmail: input.email ? 1 : 0,
    hasPhone: input.phone ? 1 : 0,
    hasCompany: input.company ? 1 : 0,
    isEnriched: enriched,
    activityRecency: recency01(input.daysSinceLastActivity),
    activityCount: clamp01(Math.min(input.activityCount, 10) / 10),
    highIntentSource: input.source && HIGH_INTENT_SOURCES.has(input.source) ? 1 : 0,
    leadAgeDays: clamp01(Math.min(ageDays, 90) / 90),
  };
}

export const LEAD_FEATURE_LABELS: Record<LeadFeatureName, string> = {
  engagementScore: 'Engagement score',
  dataQuality: 'Data quality',
  hasEmail: 'Email on file',
  hasPhone: 'Phone on file',
  hasCompany: 'Company on file',
  isEnriched: 'Firmographics enriched',
  activityRecency: 'Recent activity',
  activityCount: 'Activity volume',
  highIntentSource: 'High-intent source',
  leadAgeDays: 'Lead age',
};
