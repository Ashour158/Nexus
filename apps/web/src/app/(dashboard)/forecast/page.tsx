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
    setLoading(true);
    fetch(`/api/crm/forecast?period=${period}`, { headers: authHeaders })
      .then((r) => r.json())
      .then((d) => {
        // The /api/crm/forecast proxy wraps the payload in { success, data };
        // fall back to the raw body if an unwrapped shape is ever returned.
        setData((d?.data ?? d) as ForecastSummary | null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
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

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(n);

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
          <h1 className="text-2xl font-bold text-gray-900">Sales Forecast</h1>
          <p className="mt-1 text-sm text-gray-500">Pipeline weighted by deal probability</p>
        </div>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
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
            <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : !data ? (
        <div className="py-16 text-center text-gray-400">Unable to load forecast</div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              { label: 'Pipeline', value: fmt(data.pipeline), color: 'bg-gray-50 border-gray-200' },
              { label: 'Weighted', value: fmt(data.weighted), color: 'bg-indigo-50 border-indigo-200' },
              { label: 'Committed', value: fmt(data.committed), color: 'bg-blue-50 border-blue-200' },
              { label: 'Closed Won', value: fmt(data.closed), color: 'bg-green-50 border-green-200' },
            ].map((card) => (
              <div key={card.label} className={`rounded-xl border p-4 ${card.color}`}>
                <p className="mb-1 text-xs text-gray-500">{card.label}</p>
                <p className="text-xl font-bold text-gray-900">{card.value}</p>
              </div>
            ))}
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100 bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-start font-medium text-gray-500">Stage</th>
                  <th className="px-4 py-3 text-end font-medium text-gray-500">Probability</th>
                  <th className="px-4 py-3 text-end font-medium text-gray-500">Deals</th>
                  <th className="px-4 py-3 text-end font-medium text-gray-500">Pipeline</th>
                  <th className="px-4 py-3 text-end font-medium text-gray-500">Weighted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.stages.map((s) => (
                  <tr key={s.stageId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{s.stageName}</td>
                    <td className="px-4 py-3 text-end text-gray-600">{s.probability}%</td>
                    <td className="px-4 py-3 text-end text-gray-700">{s.dealCount}</td>
                    <td className="px-4 py-3 text-end text-gray-700">{fmt(s.totalAmount)}</td>
                    <td className="px-4 py-3 text-end font-semibold text-indigo-700">
                      {fmt(s.weightedAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!accessToken ? (
        <p className="mt-8 text-sm text-gray-500">Sign in to view team rollup and manager overrides.</p>
      ) : (
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-gray-900">Team rollup & overrides</h2>
          <p className="mt-1 text-sm text-gray-500">
            Rep commits from CRM weighted totals; managers can persist an override per rep for this period.
          </p>

          {teamLoading ? (
            <div className="mt-4 h-32 animate-pulse rounded-xl bg-gray-100" />
          ) : teamError ? (
            <p className="mt-4 text-sm text-amber-700">{teamError}</p>
          ) : teamData ? (
            <>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-gray-200 bg-slate-50 p-4">
                  <p className="text-xs text-gray-500">Sum (rep commits)</p>
                  <p className="text-lg font-semibold text-gray-900">{fmt(teamData.totals.repTotal)}</p>
                </div>
                <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
                  <p className="text-xs text-indigo-700">Sum (after overrides)</p>
                  <p className="text-lg font-semibold text-indigo-900">{fmt(teamData.totals.managerTotal)}</p>
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-100 bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-start font-medium text-gray-500">Rep</th>
                      <th className="px-4 py-3 text-end font-medium text-gray-500">Weighted commit</th>
                      <th className="px-4 py-3 text-end font-medium text-gray-500">Override</th>
                      <th className="px-4 py-3 text-end font-medium text-gray-500">% Attainment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(teamData.reps ?? []).map((rep) => (
                      <tr key={rep.repId} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{rep.repName}</td>
                        <td className="px-4 py-3 text-end text-gray-700">{fmt(rep.weightedCommit)}</td>
                        <td className="px-4 py-3 text-end">
                          <input
                            type="number"
                            defaultValue={rep.override ?? ''}
                            onBlur={(e) => overrideMutation?.mutate({ repId: rep.repId, value: e.target.value ? Number(e.target.value) : null })}
                            placeholder="—"
                            className="w-28 rounded border border-gray-200 px-2 py-1 text-end text-sm"
                          />
                        </td>
                        <td className={`px-4 py-3 text-end font-medium ${rep.attainment >= 100 ? 'text-emerald-600' : rep.attainment >= 70 ? 'text-amber-600' : 'text-rose-600'}`}>
                          {rep.attainment.toFixed(1)}%
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