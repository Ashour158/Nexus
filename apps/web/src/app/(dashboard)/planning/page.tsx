'use client';

import { useEffect, useState } from 'react';
import { Target } from 'lucide-react';
import {
  CRMEmptyState,
  CRMModuleShell,
  CRMPageHeader,
} from '@/components/ui/crm';

/**
 * Per-rep quota attainment, as returned by planning-service's
 * /api/v1/forecast-overrides/team-summary.
 *
 * This page previously read `/quotas?period=...`, which resolves to
 * `/quotas/plans` — a list of quota PLAN DEFINITIONS (name, year, quarter,
 * type, currency). It carries no per-rep target or achieved figures and ignores
 * `period` entirely, so every row rendered blank at 0% and the page looked like
 * an unbuilt feature. The attainment data already existed on a different
 * endpoint; only the wiring was wrong.
 */
interface RepAttainment {
  repId: string;
  repName: string;
  /** Quota target for the period. */
  quota: number;
  /** Closed-won actual for the period. */
  actual: number;
  /** Server-computed percentage (0-100); 0 when no quota is set. */
  attainment: number;
}

export default function PlanningPage() {
  const [quotas, setQuotas] = useState<RepAttainment[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));

  useEffect(() => {
    setLoading(true);
    fetch(`/api/planning/forecast-overrides/team-summary?periodKey=${period}`)
      .then((r) => r.json())
      .then((d) => {
        // team-summary responds { success, data: { reps, totals } }; tolerate a
        // bare array in case the envelope changes.
        const payload = d?.data;
        setQuotas(Array.isArray(payload) ? payload : (payload?.reps ?? []));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [period]);

  const fmt = (n: number, currency = 'USD') =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);

  return (
    <CRMModuleShell>
      <CRMPageHeader
        icon={Target}
        title="Sales Planning & Quotas"
        actions={<input
          type="month"
          className="rounded-lg border border-outline-variant px-3 py-2 text-sm"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        />}
      />
      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-container-high" />)}</div>
      ) : quotas.length === 0 ? (
        <CRMEmptyState
          icon={Target}
          title="No quotas set"
          description="Set monthly or quarterly quotas to track team performance"
        />
      ) : (
        <div className="space-y-3">
          {quotas.map((q) => {
            // Prefer the server-computed attainment; fall back to deriving it so
            // the bar still works if only the raw figures are present.
            const pct =
              Number.isFinite(q.attainment) && q.attainment > 0
                ? Math.min(100, Math.round(q.attainment))
                : q.quota > 0
                  ? Math.min(100, Math.round((q.actual / q.quota) * 100))
                  : 0;
            return (
              <div key={q.repId} className="rounded-xl border border-outline-variant bg-surface p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-medium text-on-surface">{q.repName}</span>
                  <span className={`text-sm font-bold ${pct >= 100 ? 'text-success' : pct >= 70 ? 'text-warning' : 'text-error'}`}>{pct}%</span>
                </div>
                <div className="mb-2 h-2 overflow-hidden rounded-full bg-surface-container-high">
                  <div className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-success' : pct >= 70 ? 'bg-warning' : 'bg-error'}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="flex justify-between text-xs text-on-surface-variant">
                  <span>Achieved: {fmt(q.actual)}</span>
                  <span>
                    {/* Never render a fabricated target: no quota configured is
                        a real and common state, and showing "$0" reads as a
                        broken number rather than an unset one. */}
                    Target: {q.quota > 0 ? fmt(q.quota) : 'No quota set'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </CRMModuleShell>
  );
}
