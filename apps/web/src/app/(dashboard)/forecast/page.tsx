'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { notify } from '@/lib/toast';
import { AnalyticsForecastSection } from './analytics-forecast';


interface ForecastStage {
  stageId: string;
  stageName: string;
  probability: number;
  dealCount: number;
  totalAmount: number;
  weightedAmount: number;
}

interface ForecastSummary {
  pipeline: number;
  weighted: number;
  committed: number;
  closed: number;
  stages: ForecastStage[];
}

type TeamRepRow = {
  repId: string;
  repName: string;
  weightedCommit: number;
  override: number | null;
  attainment: number;
};

type TeamSummaryPayload = {
  reps: TeamRepRow[];
  totals: { repTotal: number; managerTotal: number };
};

export default function ForecastPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const tenantId = useAuthStore((s) => s.tenantId);
  const userId = useAuthStore((s) => s.userId);
  const [data, setData] = useState<ForecastSummary | null>(null);
  const [teamData, setTeamData] = useState<TeamSummaryPayload | null>(null);
  const [forecastError, setForecastError] = useState<string | null>(null);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [teamLoading, setTeamLoading] = useState(false);
  const [period, setPeriod] = useState('this_quarter');
  const [, setDraftOverrides] = useState<Record<string, string>>({});

  const authHeaders = useMemo(() => {
    const h: Record<string, string> = {};
    if (accessToken) h.Authorization = `Bearer ${accessToken}`;
    if (tenantId) h['x-tenant-id'] = tenantId;
    return h;
  }, [accessToken, tenantId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setForecastError(null);
    fetch(`/api/crm/forecast?period=${period}`, { headers: authHeaders })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) {
          const message =
            typeof body?.error?.message === 'string'
              ? body.error.message
              : `Forecast request failed (${r.status})`;
          throw new Error(message);
        }
        return body;
      })
      .then((d) => {
        // The /api/crm/forecast proxy wraps the payload in { success, data };
        // fall back to the raw body if an unwrapped shape is ever returned.
        const payload = d?.data ?? d;
        if (!payload || typeof payload !== 'object') {
          throw new Error('Forecast response was malformed');
        }
        if (!cancelled) setData(payload as ForecastSummary);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setData(null);
        setForecastError(error instanceof Error ? error.message : 'Unable to load forecast');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [period, authHeaders]);

  useEffect(() => {
    if (!accessToken) {
      setTeamData(null);
      setTeamError(null);
      return;
    }
    setTeamLoading(true);
    setTeamError(null);
    const qs = new URLSearchParams({ periodKey: period }).toString();
    fetch(`/api/planning/forecast-overrides/team-summary?${qs}`, { headers: authHeaders })
      .then(async (r) => {
        const j = (await r.json()) as {
          success?: boolean;
          data?: TeamSummaryPayload;
          error?: string;
        };
        if (!r.ok) {
          setTeamError(typeof j.error === 'string' ? j.error : 'Could not load team summary');
          setTeamData(null);
          return;
        }
        setTeamData(j.data ?? null);
      })
      .catch(() => setTeamError('Could not load team summary'))
      .finally(() => setTeamLoading(false));
  }, [period, accessToken, authHeaders]);

  const fmt = (n: number | null | undefined) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(Number.isFinite(Number(n)) ? Number(n) : 0);

  // The upstream payload is only partially trusted: `/api/crm/forecast` can
  // return a 200 whose body lacks `stages` (e.g. a degraded/short-circuited
  // response). `data.stages.map(...)` then threw
  // "Cannot read properties of undefined (reading 'map')" and took the whole
  // page down. Normalise to arrays here and render an explicit empty state.
  const stages: ForecastStage[] = Array.isArray(data?.stages) ? data!.stages : [];
  const stagesMissing = Boolean(data) && !Array.isArray(data?.stages);
  const reps: TeamRepRow[] = Array.isArray(teamData?.reps) ? teamData!.reps : [];
  const teamTotals = teamData?.totals ?? { repTotal: 0, managerTotal: 0 };

  const overrideMutation = useMutation({
    mutationFn: async ({ repId, value }: { repId: string; value: number | null }) => {
      const res = await fetch('/api/planning/forecast-overrides', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ repId, periodKey: period, managerOverride: value, adjustedBy: userId }),
      });
      if (!res.ok) throw new Error('Failed to save override');
      const qs = new URLSearchParams({ periodKey: period }).toString();
      const sum = await fetch(`/api/planning/forecast-overrides/team-summary?${qs}`, { headers: authHeaders });
      const j = (await sum.json()) as { data?: TeamSummaryPayload };
      setTeamData(j.data ?? null);
      setDraftOverrides((prev) => { const next = { ...prev }; delete next[repId]; return next; });
    },
    onSuccess: () => notify.success('Override saved'),
    onError: () => notify.error('Failed to save override'),
  });

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Sales Forecast</h1>
          <p className="mt-1 text-sm text-on-surface-variant">Pipeline weighted by deal probability</p>
        </div>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="rounded-lg border border-outline-variant px-3 py-2 text-sm"
        >
          <option value="this_month">This Month</option>
          <option value="this_quarter">This Quarter</option>
          <option value="this_year">This Year</option>
          <option value="next_quarter">Next Quarter</option>
        </select>
      </div>

      {loading ? (
        <div className="mb-6 grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-container-high" />
          ))}
        </div>
      ) : !data ? (
        <div role="alert" className="rounded-xl border border-error/30 bg-error-container px-4 py-8 text-center text-error">
          {forecastError ?? 'Unable to load forecast'}
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              { label: 'Pipeline', value: fmt(data.pipeline), color: 'bg-surface-container-low border-outline-variant' },
              { label: 'Weighted', value: fmt(data.weighted), color: 'bg-primary-container border-primary/40' },
              { label: 'Committed', value: fmt(data.committed), color: 'bg-primary-container border-primary/40' },
              { label: 'Closed Won', value: fmt(data.closed), color: 'bg-success-container border-success/30' },
            ].map((card) => (
              <div key={card.label} className={`rounded-xl border p-4 ${card.color}`}>
                <p className="mb-1 text-xs text-on-surface-variant">{card.label}</p>
                <p className="text-xl font-bold text-on-surface">{card.value}</p>
              </div>
            ))}
          </div>

          {stages.length === 0 ? (
            <div className="rounded-xl border border-outline-variant bg-surface p-12 text-center">
              <p className="text-sm font-medium text-on-surface">
                {stagesMissing ? 'Stage breakdown unavailable' : 'No stages in this period'}
              </p>
              <p className="mt-1 text-xs text-on-surface-variant">
                {stagesMissing
                  ? 'The forecast service returned a response without a stage breakdown. Totals above may be incomplete.'
                  : 'No open deals fall inside the selected period.'}
              </p>
            </div>
          ) : (
          <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface">
            <table className="w-full text-sm">
              <thead className="border-b border-outline-variant bg-surface-container-low">
                <tr>
                  <th className="px-4 py-3 text-start font-medium text-on-surface-variant">Stage</th>
                  <th className="px-4 py-3 text-end font-medium text-on-surface-variant">Probability</th>
                  <th className="px-4 py-3 text-end font-medium text-on-surface-variant">Deals</th>
                  <th className="px-4 py-3 text-end font-medium text-on-surface-variant">Pipeline</th>
                  <th className="px-4 py-3 text-end font-medium text-on-surface-variant">Weighted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {stages.map((s) => (
                  <tr key={s.stageId} className="hover:bg-surface-container-low">
                    <td className="px-4 py-3 font-medium text-on-surface">{s.stageName}</td>
                    <td className="px-4 py-3 text-end text-on-surface-variant">{s.probability}%</td>
                    <td className="px-4 py-3 text-end text-on-surface">{s.dealCount}</td>
                    <td className="px-4 py-3 text-end text-on-surface">{fmt(s.totalAmount)}</td>
                    <td className="px-4 py-3 text-end font-semibold text-primary">
                      {fmt(s.weightedAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </>
      )}

      {!accessToken ? (
        <p className="mt-8 text-sm text-on-surface-variant">Sign in to view team rollup and manager overrides.</p>
      ) : (
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-on-surface">Team rollup & overrides</h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            Rep commits from CRM weighted totals; managers can persist an override per rep for this period.
          </p>

          {teamLoading ? (
            <div className="mt-4 h-32 animate-pulse rounded-xl bg-surface-container-high" />
          ) : teamError ? (
            <p className="mt-4 text-sm text-warning">{teamError}</p>
          ) : teamData ? (
            <>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-outline-variant bg-surface-container-low p-4">
                  <p className="text-xs text-on-surface-variant">Sum (rep commits)</p>
                  <p className="text-lg font-semibold text-on-surface">{fmt(teamTotals.repTotal)}</p>
                </div>
                <div className="rounded-lg border border-primary/40 bg-primary-container p-4">
                  <p className="text-xs text-primary">Sum (after overrides)</p>
                  <p className="text-lg font-semibold text-on-primary-container">{fmt(teamTotals.managerTotal)}</p>
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-xl border border-outline-variant bg-surface">
                <table className="w-full text-sm">
                  <thead className="border-b border-outline-variant bg-surface-container-low">
                    <tr>
                      <th className="px-4 py-3 text-start font-medium text-on-surface-variant">Rep</th>
                      <th className="px-4 py-3 text-end font-medium text-on-surface-variant">Weighted commit</th>
                      <th className="px-4 py-3 text-end font-medium text-on-surface-variant">Override</th>
                      <th className="px-4 py-3 text-end font-medium text-on-surface-variant">% Attainment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reps.map((rep) => (
                      <tr key={rep.repId} className="border-t border-outline-variant hover:bg-surface-container-low">
                        <td className="px-4 py-3 font-medium text-on-surface">{rep.repName}</td>
                        <td className="px-4 py-3 text-end text-on-surface">{fmt(rep.weightedCommit)}</td>
                        <td className="px-4 py-3 text-end">
                          <input
                            type="number"
                            defaultValue={rep.override ?? ''}
                            onBlur={(e) => overrideMutation?.mutate({ repId: rep.repId, value: e.target.value ? Number(e.target.value) : null })}
                            placeholder="—"
                            className="w-28 rounded border border-outline-variant px-2 py-1 text-end text-sm"
                          />
                        </td>
                        <td className={`px-4 py-3 text-end font-medium ${rep.attainment >= 100 ? 'text-success' : rep.attainment >= 70 ? 'text-warning' : 'text-error'}`}>
                          {Number.isFinite(Number(rep.attainment))
                            ? `${Number(rep.attainment).toFixed(1)}%`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </section>
      )}

      <AnalyticsForecastSection />
    </div>
  );
}
