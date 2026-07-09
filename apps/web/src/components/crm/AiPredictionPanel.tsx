'use client';

import { cn } from '@/lib/cn';
import { Skeleton } from '@/components/ui/skeleton';
import type { AiPredictionInsights } from '@/hooks/use-deals';

/**
 * Explainable AI prediction panel — the differentiator vs a black-box score.
 *
 * Renders a win-probability gauge, a confidence indicator, an honest
 * "low data — using priors" badge, a "why" factor list (each factor as a
 * signed ±impact row with an up/down arrow and a plain-English explanation)
 * and a next-best-actions checklist.
 *
 * Shared by the deal Health tab (`scoring-insights.ai`) and the lead detail
 * AI tab (`ai-prediction`). Presentational only — the caller owns the query.
 */

interface AiPredictionPanelProps {
  /** 0-1 win/conversion probability. Falls back to `insights.probability`. */
  probability?: number | null;
  /** 0-100 AI score. */
  score?: number | null;
  insights: AiPredictionInsights | undefined;
  isLoading?: boolean;
  isError?: boolean;
  /** Short label suffix, e.g. "win prediction" or "conversion prediction". */
  kind?: string;
  className?: string;
}

function confidenceMeta(confidence: number): { label: string; tone: string; dot: string } {
  if (confidence >= 0.66) return { label: 'High confidence', tone: 'text-emerald-700', dot: 'bg-emerald-500' };
  if (confidence >= 0.33) return { label: 'Moderate confidence', tone: 'text-amber-700', dot: 'bg-amber-500' };
  return { label: 'Low confidence', tone: 'text-orange-700', dot: 'bg-orange-500' };
}

function clampPct(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function AiPredictionPanel({
  probability,
  score,
  insights,
  isLoading,
  isError,
  kind = 'win prediction',
  className,
}: AiPredictionPanelProps) {
  if (isLoading) return <Skeleton className={cn('h-56', className)} />;

  if (isError || !insights) {
    return (
      <div
        className={cn(
          'rounded-xl border border-slate-200 bg-white p-5',
          className
        )}
      >
        <PanelHeader kind={kind} />
        <p className="mt-3 text-sm text-slate-500">
          The AI {kind} is not available right now. It is generated from the
          model&apos;s learned factors and falls back to priors when data is thin.
        </p>
      </div>
    );
  }

  const prob = typeof probability === 'number' ? probability : insights.probability;
  const probPct = clampPct(Math.round(prob * 100));
  const aiScore = typeof score === 'number' ? score : Math.round(prob * 100);
  const conf = confidenceMeta(insights.confidence);
  const confPct = clampPct(Math.round(insights.confidence * 100));
  const factors = insights.topFactors ?? [];
  const actions = insights.nextBestActions ?? [];

  return (
    <div className={cn('rounded-xl border border-slate-200 bg-white p-5', className)}>
      <PanelHeader kind={kind} />

      {/* Win-probability gauge + AI score */}
      <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-2">
        <div className="flex items-end gap-2">
          <span className="text-4xl font-bold text-slate-900">{probPct}%</span>
          <span className="pb-1 text-sm text-slate-400">probability</span>
        </div>
        <div className="flex items-end gap-2">
          <span className="text-2xl font-semibold text-slate-700">{aiScore}</span>
          <span className="pb-0.5 text-xs text-slate-400">AI score / 100</span>
        </div>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-700"
          style={{ width: `${probPct}%` }}
        />
      </div>

      {/* Confidence + low-data honesty */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', conf.tone)}>
          <span className={cn('h-2 w-2 rounded-full', conf.dot)} />
          {conf.label} ({confPct}%)
        </span>
        {insights.lowData && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
            Low data — using priors
          </span>
        )}
        {insights.modelVersion && (
          <span className="text-[11px] text-slate-400">
            model {insights.modelVersion}
            {typeof insights.sampleSize === 'number' ? ` · n=${insights.sampleSize}` : ''}
          </span>
        )}
      </div>
      {insights.lowData && (
        <p className="mt-2 text-xs text-amber-700">
          There isn&apos;t enough history yet to train a confident model, so this
          estimate leans on baseline priors. Treat it as directional.
        </p>
      )}

      {/* "Why" factor list */}
      <div className="mt-5">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Why — top factors
        </h4>
        {factors.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            No individual factors stood out — the estimate reflects the overall baseline.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {factors.map((factor, i) => {
              const up = factor.direction === 'up';
              return (
                <li
                  key={`${factor.label}-${i}`}
                  className="flex items-start gap-3 rounded-lg bg-slate-50 px-3 py-2"
                >
                  <span
                    className={cn(
                      'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                      up ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                    )}
                    aria-hidden
                  >
                    {up ? '▲' : '▼'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-slate-800">{factor.label}</span>
                      <span
                        className={cn(
                          'shrink-0 text-sm font-semibold tabular-nums',
                          up ? 'text-emerald-700' : 'text-red-700'
                        )}
                      >
                        {up ? '+' : '−'}
                        {Math.abs(factor.impact)}%
                      </span>
                    </div>
                    {factor.explanation && (
                      <p className="mt-0.5 text-xs text-slate-500">{factor.explanation}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Next-best-actions checklist */}
      {actions.length > 0 && (
        <div className="mt-5">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Next best actions
          </h4>
          <ul className="mt-2 space-y-1.5">
            {actions.map((action, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <span
                  className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-slate-300 text-[10px] text-slate-400"
                  aria-hidden
                >
                  ☐
                </span>
                <span>{action}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function PanelHeader({ kind }: { kind: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
        AI {kind} — explainable
      </h3>
      <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
        AI
      </span>
    </div>
  );
}
