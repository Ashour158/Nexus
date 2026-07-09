// Explainable logistic-regression model — from scratch, ZERO dependencies.
//
// This is the math core of the in-tenant predictive AI layer. It is deliberately
// simple, total, and pure so it is trivially unit-testable and fail-open (never
// throws — pathological inputs collapse to a neutral 0.5 probability).
//
// Why logistic regression (vs a black box): every prediction decomposes exactly
// into per-feature contributions `w_i * z_i` on the log-odds scale. That is what
// makes "show me why" honest — the numbers we display ARE the model, not a
// post-hoc approximation. This is the explicit product edge over Zoho's Zia.
//
// Standardization: features are z-scored (`z = (x - mean) / std`) so a single L2
// penalty and learning rate behave sensibly across features on wildly different
// scales (a 0-100 MEDDIC score vs a 0/1 champion flag vs a raw day count).

/** A named coefficient set. Keys are feature names; `__intercept` is the bias. */
export type Coefficients = Record<string, number> & { __intercept: number };

/** Per-feature standardization stats produced by {@link train}. */
export interface Standardizer {
  means: Record<string, number>;
  stds: Record<string, number>;
}

/** One term of the log-odds decomposition, in human-inspectable units. */
export interface FeatureContribution {
  feature: string;
  /** Trained weight for this feature (on the standardized scale). */
  weight: number;
  /** Raw (un-standardized) feature value that went in. */
  value: number;
  /** Signed contribution to the log-odds: `weight * z(value)`. */
  contribution: number;
}

export interface Prediction {
  /** Calibrated probability in [0, 1]. */
  probability: number;
  /** Log-odds (sum of intercept + all contributions). */
  logOdds: number;
  /** Per-feature contributions, largest |contribution| first. */
  contributions: FeatureContribution[];
}

/** Numerically-stable logistic sigmoid. Total: clamps extreme inputs. */
export function sigmoid(z: number): number {
  if (!Number.isFinite(z)) return z > 0 ? 1 : 0;
  if (z >= 0) {
    const e = Math.exp(-Math.min(z, 40));
    return 1 / (1 + e);
  }
  const e = Math.exp(Math.max(z, -40));
  return e / (1 + e);
}

const safeNum = (n: unknown, fallback = 0): number =>
  typeof n === 'number' && Number.isFinite(n) ? n : fallback;

/**
 * Predict a probability + explanation for one feature vector.
 *
 * Pure and total: unknown features are skipped, missing standardizer stats fall
 * back to mean 0 / std 1, and any non-finite arithmetic collapses to p=0.5.
 * The returned `contributions` are exact — they sum (with the intercept) to the
 * log-odds — so the UI can render them as the literal reason for the score.
 */
export function predict(
  features: Record<string, number>,
  coefficients: Coefficients,
  standardizer?: Standardizer
): Prediction {
  try {
    const intercept = safeNum(coefficients.__intercept);
    const contributions: FeatureContribution[] = [];
    let logOdds = intercept;

    for (const [feature, rawWeight] of Object.entries(coefficients)) {
      if (feature === '__intercept') continue;
      const weight = safeNum(rawWeight);
      const value = safeNum(features[feature]);
      const mean = safeNum(standardizer?.means[feature], 0);
      let std = safeNum(standardizer?.stds[feature], 1);
      if (std <= 1e-9) std = 1; // avoid divide-by-zero on constant features
      const z = (value - mean) / std;
      const contribution = weight * z;
      logOdds += contribution;
      contributions.push({ feature, weight, value, contribution });
    }

    contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
    const probability = sigmoid(logOdds);
    return {
      probability: Number.isFinite(probability) ? probability : 0.5,
      logOdds: Number.isFinite(logOdds) ? logOdds : 0,
      contributions,
    };
  } catch {
    // Never throw — a scoring failure must never block a caller.
    return { probability: 0.5, logOdds: 0, contributions: [] };
  }
}

export interface TrainOptions {
  /** Gradient-descent iterations. */
  iterations?: number;
  /** Learning rate. */
  learningRate?: number;
  /** L2 (ridge) regularization strength — shrinks weights toward the priors. */
  l2?: number;
  /** Prior coefficients to regularize toward (defaults to 0). Keeps signs sane
   *  on thin data by pulling unfit weights back to sensible defaults. */
  priors?: Coefficients;
}

export interface TrainResult {
  coefficients: Coefficients;
  standardizer: Standardizer;
  metrics: { auc: number; logloss: number; accuracy: number; positiveRate: number };
  sampleSize: number;
}

/**
 * Train coefficients via L2-regularized batch gradient descent on standardized
 * features. Total & pure: no I/O, no throws. The caller is responsible for
 * gating on a minimum sample size — this function will happily fit tiny data,
 * but the regularization-toward-priors keeps such fits conservative.
 *
 * @param rows   feature vectors (each a `{feature: value}` map)
 * @param labels 0/1 outcomes aligned with `rows` (1 = won / converted)
 */
export function train(
  rows: Array<Record<string, number>>,
  labels: number[],
  featureNames: string[],
  opts: TrainOptions = {}
): TrainResult {
  const iterations = opts.iterations ?? 400;
  const lr = opts.learningRate ?? 0.1;
  const l2 = opts.l2 ?? 0.05;
  const priors = opts.priors ?? ({ __intercept: 0 } as Coefficients);

  const n = Math.min(rows.length, labels.length);
  const emptyStd: Standardizer = { means: {}, stds: {} };

  // Degenerate input → return the priors unchanged.
  if (n === 0 || featureNames.length === 0) {
    return {
      coefficients: { ...priors, __intercept: safeNum(priors.__intercept) },
      standardizer: emptyStd,
      metrics: { auc: 0.5, logloss: NaN, accuracy: 0, positiveRate: 0 },
      sampleSize: n,
    };
  }

  // ─── Standardization stats ────────────────────────────────────────────────
  const means: Record<string, number> = {};
  const stds: Record<string, number> = {};
  for (const f of featureNames) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += safeNum(rows[i][f]);
    const mean = sum / n;
    let variance = 0;
    for (let i = 0; i < n; i++) variance += (safeNum(rows[i][f]) - mean) ** 2;
    variance /= n;
    means[f] = mean;
    stds[f] = Math.sqrt(variance) || 1; // constant feature → std 1 (z = 0)
  }

  // Pre-standardize the design matrix once.
  const X: number[][] = new Array(n);
  for (let i = 0; i < n; i++) {
    const row = new Array(featureNames.length);
    for (let j = 0; j < featureNames.length; j++) {
      const f = featureNames[j];
      row[j] = (safeNum(rows[i][f]) - means[f]) / stds[f];
    }
    X[i] = row;
  }
  const y = labels.slice(0, n).map((l) => (l >= 0.5 ? 1 : 0));

  // ─── Gradient descent ─────────────────────────────────────────────────────
  const w = new Array(featureNames.length).fill(0).map((_, j) => safeNum(priors[featureNames[j]]));
  let b = safeNum(priors.__intercept);
  const priorW = w.slice();

  for (let it = 0; it < iterations; it++) {
    const gradW = new Array(featureNames.length).fill(0);
    let gradB = 0;
    for (let i = 0; i < n; i++) {
      let z = b;
      for (let j = 0; j < featureNames.length; j++) z += w[j] * X[i][j];
      const err = sigmoid(z) - y[i];
      gradB += err;
      for (let j = 0; j < featureNames.length; j++) gradW[j] += err * X[i][j];
    }
    b -= lr * (gradB / n);
    for (let j = 0; j < featureNames.length; j++) {
      // L2 pulls weights toward the prior, not toward 0, so thin fits stay sane.
      const reg = l2 * (w[j] - priorW[j]);
      w[j] -= lr * (gradW[j] / n + reg);
    }
  }

  const coefficients: Coefficients = { __intercept: safeNum(b) };
  for (let j = 0; j < featureNames.length; j++) coefficients[featureNames[j]] = safeNum(w[j]);

  const standardizer: Standardizer = { means, stds };
  const metrics = evaluate(X, y, w, b);
  return { coefficients, standardizer, metrics, sampleSize: n };
}

/** Compute AUC / logloss / accuracy on the (already standardized) training set. */
function evaluate(
  X: number[][],
  y: number[],
  w: number[],
  b: number
): { auc: number; logloss: number; accuracy: number; positiveRate: number } {
  const n = X.length;
  const preds = new Array(n);
  let correct = 0;
  let logloss = 0;
  let positives = 0;
  for (let i = 0; i < n; i++) {
    let z = b;
    for (let j = 0; j < w.length; j++) z += w[j] * X[i][j];
    const p = sigmoid(z);
    preds[i] = p;
    const yi = y[i];
    positives += yi;
    const eps = 1e-12;
    logloss += -(yi * Math.log(p + eps) + (1 - yi) * Math.log(1 - p + eps));
    if ((p >= 0.5 ? 1 : 0) === yi) correct++;
  }
  logloss /= n || 1;

  // AUC via the rank-sum (Mann–Whitney) statistic.
  const pos = positives;
  const neg = n - positives;
  let auc = 0.5;
  if (pos > 0 && neg > 0) {
    const idx = preds.map((p, i) => ({ p, y: y[i] })).sort((a, c) => a.p - c.p);
    let rankSum = 0;
    for (let i = 0; i < idx.length; i++) {
      if (idx[i].y === 1) rankSum += i + 1; // 1-based rank
    }
    auc = (rankSum - (pos * (pos + 1)) / 2) / (pos * neg);
  }

  return {
    auc: Number.isFinite(auc) ? auc : 0.5,
    logloss: Number.isFinite(logloss) ? logloss : NaN,
    accuracy: n > 0 ? correct / n : 0,
    positiveRate: n > 0 ? positives / n : 0,
  };
}
