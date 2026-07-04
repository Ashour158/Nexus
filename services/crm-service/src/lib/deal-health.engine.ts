// Deterministic Deal-Health / Scoring engine (NON-AI).
//
// Mirrors the intent of the lead scoring engine (`deterministic-scoring.engine.ts`)
// but is deal-specific and fully deterministic: it derives a 0-100 health score
// and a human label from signals that ALREADY exist on the deal / related data.
// No AI, no ML, no external calls — a pure function over an input snapshot so it
// is trivially unit-testable and fail-open (a caller catches thrown errors).
//
// Signals combined (see WEIGHTS below):
//  - activity recency        (days since last activity)
//  - activity frequency      (# activities in the last 30 days)
//  - stage idle time         (stage age vs the stage's `rottenDays`)
//  - MEDDIC completeness     (meddicicScore 0-100)
//  - close-date slippage     (# times close date pushed, past-due-and-open)
//  - data quality            (dataQualityScore 0-100)
//  - probability alignment   (deal probability vs stage-expected probability)

export type DealHealthLabel = 'healthy' | 'at_risk' | 'stalled' | 'critical' | 'won' | 'lost';

/**
 * Documented weights (sum = 100). Each component contributes a 0-100 sub-score
 * which is multiplied by its weight/100 and summed into the final health score.
 */
export const DEAL_HEALTH_WEIGHTS = {
  activityRecency: 22,
  activityFrequency: 13,
  stageIdle: 20,
  meddic: 18,
  closeDateSlippage: 12,
  dataQuality: 10,
  probabilityAlignment: 5,
} as const;

export type DealHealthWeightKey = keyof typeof DEAL_HEALTH_WEIGHTS;

/** Pure snapshot of everything the engine needs. Assembled by the caller. */
export interface DealHealthInput {
  status: 'OPEN' | 'WON' | 'LOST' | 'DORMANT' | string;
  /** Days since the deal last changed (proxy for stage-entry age). */
  stageAgeDays: number;
  /** Stage rotten threshold, or null when unconfigured. */
  rottenDays: number | null;
  /** Days since the most recent activity on the deal, or null when none. */
  daysSinceLastActivity: number | null;
  /** Count of activities in the trailing 30 days. */
  activityCountLast30Days: number;
  /** MEDDIC completeness score (0-100), or null. */
  meddicScore: number | null;
  /** Field-completeness score (0-100), or null. */
  dataQualityScore: number | null;
  /** Deal probability (0-100). */
  probability: number | null;
  /** Stage-expected probability (0-100), or null when unknown. */
  stageExpectedProbability: number | null;
  /** Expected close date ISO string, or null. */
  expectedCloseDate: string | null;
  /** Number of times the expected close date has been pushed later. */
  closeDatePushCount: number;
  /** Optional labels for building recommendations. */
  stageName?: string | null;
  /** MEDDIC per-component completeness, used for gap recommendations. */
  meddicGaps?: string[];
}

export interface DealHealthSignals {
  activityRecency: number;
  activityFrequency: number;
  stageIdle: number;
  meddic: number;
  closeDateSlippage: number;
  dataQuality: number;
  probabilityAlignment: number;
}

export interface DealHealthResult {
  healthScore: number;
  health: DealHealthLabel;
  /** Per-component 0-100 sub-scores (before weighting) for transparency. */
  subScores: DealHealthSignals;
  /** Per-component weighted point contribution to the final score. */
  contributions: DealHealthSignals;
  weights: typeof DEAL_HEALTH_WEIGHTS;
  recommendations: string[];
}

const clamp0to100 = (n: number): number => Math.max(0, Math.min(100, n));

/**
 * Activity recency sub-score: 100 when very recent, decaying to 0 at ~45 days.
 * null (no activity ever) is treated as the worst case.
 */
function recencySubScore(daysSinceLastActivity: number | null): number {
  if (daysSinceLastActivity == null) return 0;
  // Full marks for <= 3 days, linear decay to 0 by 45 days.
  if (daysSinceLastActivity <= 3) return 100;
  return clamp0to100(100 - ((daysSinceLastActivity - 3) / 42) * 100);
}

/** Frequency sub-score: saturates at 6 touches / 30 days. */
function frequencySubScore(count: number): number {
  if (count <= 0) return 0;
  return clamp0to100((count / 6) * 100);
}

/**
 * Stage idle sub-score vs the stage's rottenDays. 100 when fresh in-stage,
 * degrading as it approaches the threshold, 0 once fully rotten. When no
 * threshold is configured, idle time cannot penalise the deal (neutral 80).
 */
function stageIdleSubScore(stageAgeDays: number, rottenDays: number | null): number {
  if (rottenDays == null || rottenDays <= 0) return 80; // neutral — cannot rot
  const ratio = stageAgeDays / rottenDays;
  if (ratio <= 0.5) return 100;
  if (ratio >= 1) return 0;
  // Linear from 100 (at 0.5) to 0 (at 1.0).
  return clamp0to100(100 - ((ratio - 0.5) / 0.5) * 100);
}

/**
 * Close-date slippage sub-score. Penalises pushed close dates and a past-due
 * close date on a still-open deal.
 */
function closeDateSlippageSubScore(input: DealHealthInput): number {
  let score = 100;
  // Each push knocks off 20 points.
  score -= Math.min(60, Math.max(0, input.closeDatePushCount) * 20);
  // Past-due close date while still open is a strong negative.
  if (input.status === 'OPEN' && input.expectedCloseDate) {
    const due = new Date(input.expectedCloseDate).getTime();
    if (Number.isFinite(due) && due < Date.now()) {
      const daysOverdue = Math.floor((Date.now() - due) / (24 * 60 * 60 * 1000));
      score -= Math.min(50, 20 + daysOverdue); // 20+ base, growing with overdue days
    }
  }
  return clamp0to100(score);
}

/** Probability alignment: 100 when deal probability tracks the stage's expected. */
function probabilityAlignmentSubScore(probability: number | null, expected: number | null): number {
  if (probability == null || expected == null) return 80; // unknown — neutral
  const gap = Math.abs(probability - expected);
  return clamp0to100(100 - gap); // 1 point per percentage-point gap
}

/**
 * Compute the deterministic deal-health score + label + recommendations.
 * Pure function: no I/O. Won/Lost deals short-circuit to a terminal label but
 * still return a representative score (100 for won, 0 for lost).
 */
export function computeDealHealth(input: DealHealthInput): DealHealthResult {
  const subScores: DealHealthSignals = {
    activityRecency: recencySubScore(input.daysSinceLastActivity),
    activityFrequency: frequencySubScore(input.activityCountLast30Days),
    stageIdle: stageIdleSubScore(input.stageAgeDays, input.rottenDays),
    meddic: input.meddicScore == null ? 40 : clamp0to100(input.meddicScore),
    closeDateSlippage: closeDateSlippageSubScore(input),
    dataQuality: input.dataQualityScore == null ? 50 : clamp0to100(input.dataQualityScore),
    probabilityAlignment: probabilityAlignmentSubScore(input.probability, input.stageExpectedProbability),
  };

  const contributions: DealHealthSignals = {
    activityRecency: (subScores.activityRecency * DEAL_HEALTH_WEIGHTS.activityRecency) / 100,
    activityFrequency: (subScores.activityFrequency * DEAL_HEALTH_WEIGHTS.activityFrequency) / 100,
    stageIdle: (subScores.stageIdle * DEAL_HEALTH_WEIGHTS.stageIdle) / 100,
    meddic: (subScores.meddic * DEAL_HEALTH_WEIGHTS.meddic) / 100,
    closeDateSlippage: (subScores.closeDateSlippage * DEAL_HEALTH_WEIGHTS.closeDateSlippage) / 100,
    dataQuality: (subScores.dataQuality * DEAL_HEALTH_WEIGHTS.dataQuality) / 100,
    probabilityAlignment:
      (subScores.probabilityAlignment * DEAL_HEALTH_WEIGHTS.probabilityAlignment) / 100,
  };

  const rawScore =
    contributions.activityRecency +
    contributions.activityFrequency +
    contributions.stageIdle +
    contributions.meddic +
    contributions.closeDateSlippage +
    contributions.dataQuality +
    contributions.probabilityAlignment;

  const healthScore = Math.round(clamp0to100(rawScore));

  // ─── Label ────────────────────────────────────────────────────────────────
  let health: DealHealthLabel;
  const fullyRotten =
    input.rottenDays != null && input.rottenDays > 0 && input.stageAgeDays >= input.rottenDays;
  const veryStaleActivity = input.daysSinceLastActivity != null && input.daysSinceLastActivity >= 30;

  if (input.status === 'WON') health = 'won';
  else if (input.status === 'LOST') health = 'lost';
  else if (fullyRotten || veryStaleActivity || healthScore < 30) health = 'stalled';
  else if (healthScore < 50) health = 'critical';
  else if (healthScore < 70) health = 'at_risk';
  else health = 'healthy';

  // Terminal deals get representative scores but keep computed signals visible.
  const finalScore = input.status === 'WON' ? 100 : input.status === 'LOST' ? 0 : healthScore;

  return {
    healthScore: finalScore,
    health,
    subScores,
    contributions,
    weights: DEAL_HEALTH_WEIGHTS,
    recommendations: buildRecommendations(input, subScores),
  };
}

/** Derive next-best-action recommendations from the raw signals. */
function buildRecommendations(input: DealHealthInput, sub: DealHealthSignals): string[] {
  const recs: string[] = [];
  const isOpen = input.status === 'OPEN';

  if (isOpen && input.daysSinceLastActivity != null && input.daysSinceLastActivity >= 14) {
    recs.push(`No activity in ${input.daysSinceLastActivity} days — log a touch to keep momentum.`);
  } else if (isOpen && input.daysSinceLastActivity == null) {
    recs.push('No activity has ever been logged on this deal — record the first touchpoint.');
  }

  if (isOpen && input.rottenDays != null && input.rottenDays > 0 && input.stageAgeDays >= input.rottenDays) {
    recs.push(
      `Idle ${input.stageAgeDays} days in "${input.stageName ?? 'stage'}" (limit ${input.rottenDays}) — advance or re-qualify.`
    );
  }

  if (isOpen && input.expectedCloseDate) {
    const due = new Date(input.expectedCloseDate).getTime();
    if (Number.isFinite(due) && due < Date.now()) {
      recs.push('Close date passed — update the close date or mark the deal won/lost.');
    }
  }
  if (input.closeDatePushCount >= 2) {
    recs.push(`Close date pushed ${input.closeDatePushCount} times — validate the timeline with the buyer.`);
  }

  if (input.meddicGaps && input.meddicGaps.length > 0) {
    recs.push(`MEDDIC gaps: ${input.meddicGaps.join(', ')}.`);
  } else if (sub.meddic < 40) {
    recs.push('MEDDIC coverage is thin — identify the economic buyer and decision criteria.');
  }

  if (sub.dataQuality < 50) {
    recs.push('Data quality is low — fill in missing fields (amount, close date, owner).');
  }

  if (sub.activityFrequency < 34 && isOpen) {
    recs.push('Engagement is light — schedule a follow-up cadence.');
  }

  return recs;
}

/**
 * Derive the human-readable MEDDIC gap list from a stored `meddicicData` blob.
 * Fail-open: unknown shapes yield an empty list. Mirrors the component names
 * used by the MEDDIC scorer in `deals.service.ts`.
 */
export function deriveMeddicGaps(meddic: Record<string, unknown> | null | undefined): string[] {
  if (!meddic || typeof meddic !== 'object') return [];
  const gaps: string[] = [];
  const scoreOf = (key: string): number | null => {
    const node = meddic[key];
    if (node && typeof node === 'object' && typeof (node as { score?: unknown }).score === 'number') {
      return (node as { score: number }).score;
    }
    return null;
  };
  const identifiedOf = (key: string): boolean | null => {
    const node = meddic[key];
    if (node && typeof node === 'object' && typeof (node as { identified?: unknown }).identified === 'boolean') {
      return (node as { identified: boolean }).identified;
    }
    return null;
  };

  const scored: Array<[string, string]> = [
    ['metrics', 'Metrics'],
    ['decisionCriteria', 'Decision Criteria'],
    ['decisionProcess', 'Decision Process'],
    ['paperProcess', 'Paper Process'],
    ['identifyPain', 'Identify Pain'],
  ];
  for (const [key, label] of scored) {
    const s = scoreOf(key);
    if (s != null && s < 40) gaps.push(label);
  }

  const boolean: Array<[string, string]> = [
    ['economicBuyer', 'Economic Buyer'],
    ['champion', 'Champion'],
    ['competition', 'Competition'],
  ];
  for (const [key, label] of boolean) {
    if (identifiedOf(key) === false) gaps.push(label);
  }

  return gaps;
}
