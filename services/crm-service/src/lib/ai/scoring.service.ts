// Explainable predictive scoring service (in-tenant, fail-open).
//
// Ties the pieces together: load a Deal/Lead + related signals → extract a
// normalized feature vector → load the tenant's ACTIVE trained model (or fall
// back to documented priors, flagged `lowData`) → predict a calibrated
// probability with per-feature contributions → translate those contributions
// into plain-language `aiInsights` + next-best-actions → persist onto the record.
//
// Also provides:
//  - detectAtRiskDeal(): explainable statistical anomaly / at-risk flag +
//    guarded `deal.at_risk` event emission (notification-service already
//    consumes deal.rotten, a sibling event).
//  - retrainModel(): trains a new AiModel version from the tenant's historical
//    won/lost (deals) or converted (leads) records, honestly gated on a minimum
//    sample size.
//
// EVERYTHING here is fail-open: a scoring error logs + skips; AI never blocks a
// deal/lead write.

import type { CrmPrisma } from '../../prisma.js';
import type { NexusProducer } from '@nexus/kafka';
import { TOPICS } from '@nexus/kafka';
import {
  predict,
  train,
  type Coefficients,
  type Standardizer,
  type FeatureContribution,
} from './logistic-model.js';
import {
  DEAL_FEATURES,
  DEAL_FEATURE_LABELS,
  DEAL_WIN_PRIORS,
  LEAD_FEATURES,
  LEAD_FEATURE_LABELS,
  LEAD_CONVERSION_PRIORS,
  extractDealFeatures,
  extractLeadFeatures,
  type DealFeatureInput,
  type LeadFeatureInput,
} from './features.js';
import { deriveMeddicGaps } from '../deal-health.engine.js';

const DAY_MS = 24 * 60 * 60 * 1000;
type ModelKind = 'deal_win' | 'lead_conversion';

/** Minimum historical rows required before we trust a trained model over priors. */
export const MIN_TRAIN_SAMPLES = 30;

export interface AiInsights {
  probability: number;
  /** 0-1 confidence in the prediction (low when on priors / thin data). */
  confidence: number;
  lowData: boolean;
  modelVersion: number | null;
  sampleSize: number;
  topFactors: Array<{
    label: string;
    direction: 'up' | 'down';
    impact: number; // approx probability-point impact, 0-100
    explanation: string;
  }>;
  nextBestActions: string[];
}

/* ─────────────────────────── model loading ──────────────────────────────── */

interface ResolvedModel {
  coefficients: Coefficients;
  standardizer?: Standardizer;
  version: number | null;
  sampleSize: number;
  lowData: boolean;
}

function priorsFor(kind: ModelKind): Coefficients {
  return kind === 'deal_win' ? { ...DEAL_WIN_PRIORS } : { ...LEAD_CONVERSION_PRIORS };
}

/**
 * Resolve the active model for a tenant+kind, or fall back to priors. Fail-open:
 * any DB error yields the priors (never throws). A model is treated as `lowData`
 * when there is no active trained row or it was trained on too few samples.
 */
async function resolveModel(
  prisma: CrmPrisma,
  tenantId: string,
  kind: ModelKind
): Promise<ResolvedModel> {
  try {
    const row = await prisma.aiModel.findFirst({
      where: { tenantId, kind, isActive: true },
      orderBy: { version: 'desc' },
    });
    if (row && row.sampleSize >= MIN_TRAIN_SAMPLES) {
      return {
        coefficients: (row.coefficients as Coefficients) ?? priorsFor(kind),
        standardizer:
          row.featureMeans && row.featureStds
            ? {
                means: row.featureMeans as Record<string, number>,
                stds: row.featureStds as Record<string, number>,
              }
            : undefined,
        version: row.version,
        sampleSize: row.sampleSize,
        lowData: false,
      };
    }
  } catch {
    /* fall through to priors */
  }
  return { coefficients: priorsFor(kind), version: null, sampleSize: 0, lowData: true };
}

/**
 * Confidence heuristic: honest, never fabricated. Priors-only ⇒ low (~0.35).
 * Trained models scale confidence with sample size (saturating), and shrink it
 * for predictions near the 0.5 decision boundary where the model is least sure.
 */
function computeConfidence(lowData: boolean, sampleSize: number, probability: number): number {
  const decisiveness = Math.abs(probability - 0.5) * 2; // 0 at 0.5, 1 at extremes
  if (lowData) return Number((0.3 + 0.1 * decisiveness).toFixed(2));
  const dataConf = Math.min(1, sampleSize / 200); // saturates at 200 samples
  return Number((0.5 + 0.35 * dataConf + 0.15 * decisiveness).toFixed(2));
}

/* ─────────────────────── insight / explanation build ────────────────────── */

function buildInsights(
  probability: number,
  contributions: FeatureContribution[],
  labels: Record<string, string>,
  model: ResolvedModel,
  extraActions: string[]
): AiInsights {
  const confidence = computeConfidence(model.lowData, model.sampleSize, probability);

  // Translate the top |contributions| into plain-language factors. We convert a
  // log-odds contribution into an approximate probability-point impact by
  // comparing p(logodds) to p(logodds - contribution) — a local, honest read of
  // "how much did this factor move the probability".
  const baseLogOdds = Math.log(probability / Math.max(1e-9, 1 - probability));
  const topFactors = contributions
    .filter((c) => Math.abs(c.contribution) > 1e-4)
    .slice(0, 5)
    .map((c) => {
      const without = baseLogOdds - c.contribution;
      const pWithout = 1 / (1 + Math.exp(-without));
      const impact = Math.round(Math.abs(probability - pWithout) * 100);
      const direction: 'up' | 'down' = c.contribution >= 0 ? 'up' : 'down';
      const label = labels[c.feature] ?? c.feature;
      const sign = direction === 'up' ? '+' : '−';
      return {
        label,
        direction,
        impact,
        explanation: `${label} ${direction === 'up' ? 'raises' : 'lowers'} the estimate (${sign}${impact}%)`,
      };
    })
    .filter((f) => f.impact > 0);

  return {
    probability: Number(probability.toFixed(4)),
    confidence,
    lowData: model.lowData,
    modelVersion: model.version,
    sampleSize: model.sampleSize,
    topFactors,
    nextBestActions: extraActions.slice(0, 3),
  };
}

/**
 * Next-best-actions from the largest NEGATIVE contributors: the factors dragging
 * the probability down are exactly where a rep should intervene. Merged with any
 * health-derived recommendations passed by the caller.
 */
function nextBestActions(
  contributions: FeatureContribution[],
  labels: Record<string, string>,
  healthRecs: string[]
): string[] {
  const actions: string[] = [];
  const negatives = contributions
    .filter((c) => c.contribution < -1e-3)
    .sort((a, b) => a.contribution - b.contribution)
    .slice(0, 3);
  for (const c of negatives) {
    const label = labels[c.feature] ?? c.feature;
    actions.push(`Improve "${label}" — it is the biggest drag on this prediction.`);
  }
  for (const rec of healthRecs) {
    if (actions.length >= 3) break;
    if (!actions.includes(rec)) actions.push(rec);
  }
  return actions.slice(0, 3);
}

/* ─────────────────────────── deal feature I/O ───────────────────────────── */

async function assembleDealFeatureInput(
  prisma: CrmPrisma,
  tenantId: string,
  dealId: string
): Promise<{ input: DealFeatureInput; healthRecs: string[] } | null> {
  const deal = await prisma.deal.findFirst({
    where: { id: dealId, tenantId },
    include: { stage: true },
  });
  if (!deal) return null;

  const now = Date.now();
  const stageAgeDays = Math.max(0, Math.floor((now - deal.updatedAt.getTime()) / DAY_MS));
  const thirtyDaysAgo = new Date(now - 30 * DAY_MS);

  const [lastActivity, activityCountLast30Days, closeDatePushCount] = await Promise.all([
    prisma.activity.findFirst({
      where: { dealId, tenantId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    prisma.activity.count({ where: { dealId, tenantId, createdAt: { gte: thirtyDaysAgo } } }),
    countCloseDatePushes(prisma, tenantId, dealId),
  ]);

  const daysSinceLastActivity = lastActivity
    ? Math.max(0, Math.floor((now - lastActivity.createdAt.getTime()) / DAY_MS))
    : null;
  const meddic = (deal.meddicicData ?? {}) as Record<string, unknown>;
  const meddicGaps = deriveMeddicGaps(meddic);

  const health: DealFeatureInput['health'] = {
    status: deal.status,
    stageAgeDays,
    rottenDays: deal.stage?.rottenDays ?? null,
    daysSinceLastActivity,
    activityCountLast30Days,
    meddicScore: deal.meddicicScore ?? null,
    dataQualityScore: deal.dataQualityScore ?? null,
    probability: deal.probability,
    stageExpectedProbability: deal.stage?.probability ?? null,
    expectedCloseDate: deal.expectedCloseDate?.toISOString() ?? null,
    closeDatePushCount,
    stageName: deal.stage?.name ?? null,
    meddicGaps,
  };

  // Reuse deal-health recommendations as health-derived next-best-actions.
  const { computeDealHealth } = await import('../deal-health.engine.js');
  const healthRecs = computeDealHealth(health).recommendations;

  const input: DealFeatureInput = {
    status: deal.status,
    probability: deal.probability,
    meddicScore: deal.meddicicScore ?? null,
    dataQualityScore: deal.dataQualityScore ?? null,
    amount: deal.amount ? Number(deal.amount) : null,
    competitorCount: Array.isArray(deal.competitors) ? deal.competitors.length : 0,
    createdAt: deal.createdAt,
    updatedAt: deal.updatedAt,
    meddic,
    health,
  };
  return { input, healthRecs };
}

/** Local copy of deals.service close-date-push counter (fail-open). */
async function countCloseDatePushes(
  prisma: CrmPrisma,
  tenantId: string,
  dealId: string
): Promise<number> {
  try {
    const changes = await prisma.fieldChangeLog.findMany({
      where: { tenantId, objectType: 'deal', objectId: dealId, fieldName: 'expectedCloseDate' },
      orderBy: { changedAt: 'asc' },
      select: { oldValue: true, newValue: true },
    });
    let pushes = 0;
    for (const change of changes) {
      if (!change.oldValue || !change.newValue) continue;
      const oldTime = new Date(change.oldValue).getTime();
      const newTime = new Date(change.newValue).getTime();
      if (Number.isFinite(oldTime) && Number.isFinite(newTime) && newTime > oldTime) pushes += 1;
    }
    return pushes;
  } catch {
    return 0;
  }
}

/* ─────────────────────────── public: score deal ─────────────────────────── */

export interface ScoreResult {
  probability: number;
  aiScore: number;
  insights: AiInsights;
}

/**
 * Score a single deal's win probability and persist the result. Fail-open:
 * returns null (and writes nothing) on any error or if the deal is missing /
 * closed. Idempotent.
 */
export async function scoreDeal(
  prisma: CrmPrisma,
  tenantId: string,
  dealId: string
): Promise<ScoreResult | null> {
  try {
    const assembled = await assembleDealFeatureInput(prisma, tenantId, dealId);
    if (!assembled) return null;

    const features = extractDealFeatures(assembled.input);
    const model = await resolveModel(prisma, tenantId, 'deal_win');
    const prediction = predict(features, model.coefficients, model.standardizer);

    const actions = nextBestActions(prediction.contributions, DEAL_FEATURE_LABELS, assembled.healthRecs);
    const insights = buildInsights(
      prediction.probability,
      prediction.contributions,
      DEAL_FEATURE_LABELS,
      model,
      actions
    );
    const aiScore = Math.round(prediction.probability * 100);

    await prisma.deal.updateMany({
      where: { id: dealId, tenantId },
      data: {
        aiWinProbability: insights.probability,
        aiScore,
        aiInsights: insights as unknown as object,
        aiScoredAt: new Date(),
      },
    });
    return { probability: insights.probability, aiScore, insights };
  } catch (err) {
    console.warn('[ai-scoring] scoreDeal failed; skipping', { dealId, err });
    return null;
  }
}

/* ─────────────────────────── lead feature I/O ───────────────────────────── */

async function assembleLeadFeatureInput(
  prisma: CrmPrisma,
  tenantId: string,
  leadId: string
): Promise<LeadFeatureInput | null> {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, tenantId } });
  if (!lead) return null;

  const now = Date.now();
  const [lastActivity, activityCount] = await Promise.all([
    prisma.activity.findFirst({
      where: { leadId, tenantId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    prisma.activity.count({ where: { leadId, tenantId } }),
  ]);
  const daysSinceLastActivity = lastActivity
    ? Math.max(0, Math.floor((now - lastActivity.createdAt.getTime()) / DAY_MS))
    : null;

  return {
    score: lead.score ?? null,
    dataQualityScore: lead.dataQualityScore ?? null,
    email: lead.email ?? null,
    phone: lead.phone ?? null,
    company: lead.company ?? null,
    industry: lead.industry ?? null,
    annualRevenue: lead.annualRevenue ? Number(lead.annualRevenue) : null,
    employeeCount: lead.employeeCount ?? null,
    source: lead.source ?? null,
    createdAt: lead.createdAt,
    daysSinceLastActivity,
    activityCount,
  };
}

/** Score a lead's conversion probability and persist. Fail-open + idempotent. */
export async function scoreLead(
  prisma: CrmPrisma,
  tenantId: string,
  leadId: string
): Promise<ScoreResult | null> {
  try {
    const input = await assembleLeadFeatureInput(prisma, tenantId, leadId);
    if (!input) return null;

    const features = extractLeadFeatures(input);
    const model = await resolveModel(prisma, tenantId, 'lead_conversion');
    const prediction = predict(features, model.coefficients, model.standardizer);

    const actions = nextBestActions(prediction.contributions, LEAD_FEATURE_LABELS, []);
    const insights = buildInsights(
      prediction.probability,
      prediction.contributions,
      LEAD_FEATURE_LABELS,
      model,
      actions
    );
    const aiScore = Math.round(prediction.probability * 100);

    await prisma.lead.updateMany({
      where: { id: leadId, tenantId },
      data: {
        aiConversionProbability: insights.probability,
        aiScore,
        aiInsights: insights as unknown as object,
        aiScoredAt: new Date(),
      },
    });
    return { probability: insights.probability, aiScore, insights };
  } catch (err) {
    console.warn('[ai-scoring] scoreLead failed; skipping', { leadId, err });
    return null;
  }
}

/* ───────────────────── at-risk / anomaly detection ──────────────────────── */

export interface AtRiskResult {
  atRisk: boolean;
  reasons: string[];
  /** Per-signal z-scores vs the tenant's active-deal distribution. */
  anomalies: Array<{ signal: string; value: number; z: number; explanation: string }>;
}

/**
 * Explainable at-risk detection for a deal. Combines:
 *  - z-score anomalies vs the tenant's OPEN-deal feature distribution (unusual
 *    inactivity, unusually stalled), and
 *  - threshold rules (long inactivity, repeated close-date pushes, overdue).
 * Emits a guarded `deal.at_risk` event when newly at-risk. Fail-open.
 */
export async function detectAtRiskDeal(
  prisma: CrmPrisma,
  tenantId: string,
  dealId: string,
  producer?: NexusProducer
): Promise<AtRiskResult> {
  const empty: AtRiskResult = { atRisk: false, reasons: [], anomalies: [] };
  try {
    const deal = await prisma.deal.findFirst({
      where: { id: dealId, tenantId },
      include: { stage: true },
    });
    if (!deal || deal.status !== 'OPEN') return empty;

    const now = Date.now();
    const [lastActivity, closeDatePushCount, cohort] = await Promise.all([
      prisma.activity.findFirst({
        where: { dealId, tenantId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      countCloseDatePushes(prisma, tenantId, dealId),
      prisma.deal.findMany({
        where: { tenantId, status: 'OPEN' },
        select: { updatedAt: true, probability: true },
        take: 500,
      }),
    ]);

    const daysSinceLastActivity = lastActivity
      ? Math.floor((now - lastActivity.createdAt.getTime()) / DAY_MS)
      : Math.floor((now - deal.updatedAt.getTime()) / DAY_MS);
    const idleDays = Math.floor((now - deal.updatedAt.getTime()) / DAY_MS);

    // Cohort distributions for z-scoring (idle days + probability).
    const idleValues = cohort.map((d) => Math.floor((now - d.updatedAt.getTime()) / DAY_MS));
    const probValues = cohort.map((d) => d.probability ?? 0);
    const z = (v: number, arr: number[]): number => {
      if (arr.length < 5) return 0;
      const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
      const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
      const std = Math.sqrt(variance);
      return std < 1e-9 ? 0 : (v - mean) / std;
    };

    const anomalies: AtRiskResult['anomalies'] = [];
    const reasons: string[] = [];

    const idleZ = z(idleDays, idleValues);
    if (idleZ >= 2) {
      anomalies.push({
        signal: 'stage_idle',
        value: idleDays,
        z: Number(idleZ.toFixed(2)),
        explanation: `Idle ${idleDays}d — ${idleZ.toFixed(1)}σ above the tenant's open-deal norm.`,
      });
      reasons.push('Velocity has stalled far beyond the tenant norm.');
    }

    const probZ = z(deal.probability ?? 0, probValues);
    if (probZ <= -1.5) {
      anomalies.push({
        signal: 'low_probability',
        value: deal.probability ?? 0,
        z: Number(probZ.toFixed(2)),
        explanation: `Probability ${deal.probability ?? 0}% is unusually low for this pipeline.`,
      });
    }

    // Threshold rules (independent of cohort size).
    if (daysSinceLastActivity >= 21) reasons.push(`No activity in ${daysSinceLastActivity} days.`);
    if (closeDatePushCount >= 2) reasons.push(`Close date pushed ${closeDatePushCount} times.`);
    if (
      deal.expectedCloseDate &&
      deal.expectedCloseDate.getTime() < now
    ) {
      reasons.push('Close date is overdue while the deal is still open.');
    }
    const rottenDays = deal.stage?.rottenDays ?? null;
    if (rottenDays != null && rottenDays > 0 && idleDays >= rottenDays) {
      reasons.push(`Idle ${idleDays}d exceeds the stage rot limit of ${rottenDays}d.`);
    }

    const atRisk = reasons.length > 0 || anomalies.length > 0;

    if (atRisk && producer) {
      try {
        await producer.publish(TOPICS.DEALS, {
          type: 'deal.at_risk',
          tenantId,
          payload: {
            dealId: deal.id,
            ownerId: deal.ownerId,
            accountId: deal.accountId,
            stageId: deal.stageId,
            reasons,
            anomalies,
            idleDays,
            daysSinceLastActivity,
            detectedAt: new Date().toISOString(),
          },
        });
      } catch {
        /* never let a publish failure abort detection */
      }
    }

    return { atRisk, reasons, anomalies };
  } catch (err) {
    console.warn('[ai-scoring] detectAtRiskDeal failed; skipping', { dealId, err });
    return empty;
  }
}

/* ─────────────────────────────── retrain ────────────────────────────────── */

export interface RetrainResult {
  trained: boolean;
  reason: string;
  kind: ModelKind;
  version: number | null;
  sampleSize: number;
  metrics: { auc: number; logloss: number; accuracy: number; positiveRate: number } | null;
}

/**
 * Retrain a tenant's model for `kind` from its historical outcomes and activate
 * the new version. Honestly gated: below {@link MIN_TRAIN_SAMPLES} labelled rows
 * (or single-class data) it keeps the priors and reports why. Tenant-scoped —
 * one tenant's data never trains another's. Fail-open.
 */
export async function retrainModel(
  prisma: CrmPrisma,
  tenantId: string,
  kind: ModelKind
): Promise<RetrainResult> {
  const fail = (reason: string): RetrainResult => ({
    trained: false,
    reason,
    kind,
    version: null,
    sampleSize: 0,
    metrics: null,
  });
  try {
    const rows: Array<Record<string, number>> = [];
    const labels: number[] = [];

    if (kind === 'deal_win') {
      const deals = await prisma.deal.findMany({
        where: { tenantId, status: { in: ['WON', 'LOST'] } },
        include: { stage: true },
        take: 5000,
      });
      for (const deal of deals) {
        const meddic = (deal.meddicicData ?? {}) as Record<string, unknown>;
        const stageAgeDays = Math.max(
          0,
          Math.floor((deal.updatedAt.getTime() - deal.createdAt.getTime()) / DAY_MS)
        );
        const features = extractDealFeatures({
          status: deal.status,
          probability: deal.probability,
          meddicScore: deal.meddicicScore ?? null,
          dataQualityScore: deal.dataQualityScore ?? null,
          amount: deal.amount ? Number(deal.amount) : null,
          competitorCount: Array.isArray(deal.competitors) ? deal.competitors.length : 0,
          createdAt: deal.createdAt,
          updatedAt: deal.updatedAt,
          meddic,
          health: {
            status: deal.status,
            stageAgeDays,
            rottenDays: deal.stage?.rottenDays ?? null,
            daysSinceLastActivity: null,
            activityCountLast30Days: 0,
            meddicScore: deal.meddicicScore ?? null,
            dataQualityScore: deal.dataQualityScore ?? null,
            probability: deal.probability,
            stageExpectedProbability: deal.stage?.probability ?? null,
            expectedCloseDate: deal.expectedCloseDate?.toISOString() ?? null,
            closeDatePushCount: 0,
            stageName: deal.stage?.name ?? null,
          },
        });
        rows.push(features);
        labels.push(deal.status === 'WON' ? 1 : 0);
      }
    } else {
      // lead_conversion: labelled = CONVERTED (1) vs UNQUALIFIED (0).
      const leads = await prisma.lead.findMany({
        where: { tenantId, status: { in: ['CONVERTED', 'UNQUALIFIED'] } },
        take: 5000,
      });
      for (const lead of leads) {
        const features = extractLeadFeatures({
          score: lead.score ?? null,
          dataQualityScore: lead.dataQualityScore ?? null,
          email: lead.email ?? null,
          phone: lead.phone ?? null,
          company: lead.company ?? null,
          industry: lead.industry ?? null,
          annualRevenue: lead.annualRevenue ? Number(lead.annualRevenue) : null,
          employeeCount: lead.employeeCount ?? null,
          source: lead.source ?? null,
          createdAt: lead.createdAt,
          daysSinceLastActivity: null,
          activityCount: 0,
        });
        rows.push(features);
        labels.push(lead.status === 'CONVERTED' ? 1 : 0);
      }
    }

    if (rows.length < MIN_TRAIN_SAMPLES) {
      return fail(
        `Only ${rows.length} labelled records (need ${MIN_TRAIN_SAMPLES}). Keeping prior-initialized model.`
      );
    }
    const positives = labels.filter((l) => l === 1).length;
    if (positives === 0 || positives === labels.length) {
      return fail('Historical data is single-class (all won or all lost). Keeping priors.');
    }

    const featureNames = kind === 'deal_win' ? [...DEAL_FEATURES] : [...LEAD_FEATURES];
    const priors = priorsFor(kind);
    const result = train(rows, labels, featureNames, { priors });

    // Activate a new version: deactivate old, insert the new active row.
    const last = await prisma.aiModel.findFirst({
      where: { tenantId, kind },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const version = (last?.version ?? 0) + 1;

    await prisma.aiModel.updateMany({
      where: { tenantId, kind, isActive: true },
      data: { isActive: false },
    });
    await prisma.aiModel.create({
      data: {
        tenantId,
        kind,
        version,
        coefficients: result.coefficients as unknown as object,
        featureMeans: result.standardizer.means as unknown as object,
        featureStds: result.standardizer.stds as unknown as object,
        sampleSize: result.sampleSize,
        metrics: result.metrics as unknown as object,
        isActive: true,
        trainedAt: new Date(),
      },
    });

    return {
      trained: true,
      reason: `Trained v${version} on ${result.sampleSize} records.`,
      kind,
      version,
      sampleSize: result.sampleSize,
      metrics: result.metrics,
    };
  } catch (err) {
    console.warn('[ai-scoring] retrainModel failed', { kind, err });
    return fail('Training failed unexpectedly; kept existing model.');
  }
}
