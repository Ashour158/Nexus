'use client';

import { useMemo, useState, type JSX } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClients } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import { formatCurrency } from '@/lib/format';

interface QuotaPlan {
  id: string;
  name: string;
  year: number;
  quarter: number | null;
  currency: string;
  targets: Array<{ ownerId: string; targetValue: string; currency: string }>;
}

interface AttainmentRow {
  ownerId: string;
  target: string;
  actual: string;
  attainmentPct: string;
  currency: string;
}

export default function PlanningPage(): JSX.Element {
  const userId = useAuthStore((s) => s.userId);
  const pushToast = useUiStore((s) => s.pushToast);
  const qc = useQueryClient();
  const [tab, setTab] = useState<'quota' | 'forecast' | 'whatif'>('quota');
  const [year, setYear] = useState(new Date().getFullYear());
  const [quotaValue, setQuotaValue] = useState('100000');
  const [period, setPeriod] = useState(`${new Date().getFullYear()}-Q${Math.floor(new Date().getMonth() / 3) + 1}`);
  const [forecastForm, setForecastForm] = useState({ commitAmount: '0', bestCaseAmount: '0', pipelineAmount: '0', commentary: '' });
  const [whatIfAmounts, setWhatIfAmounts] = useState('25000,50000');

  const plans = useQuery({
    queryKey: ['planning', 'plans', year],
    queryFn: () => apiClients.planning.get<QuotaPlan[]>('/quotas/plans', { params: { year } }),
  });
  const activePlan = plans.data?.[0];
  const attainment = useQuery({
    queryKey: ['planning', 'attainment', activePlan?.id],
    queryFn: () => apiClients.planning.get<AttainmentRow[]>(`/quotas/plans/${activePlan?.id}/attainment`),
    enabled: Boolean(activePlan?.id),
  });
  const rollup = useQuery({
    queryKey: ['planning', 'forecast-rollup', period],
    queryFn: () =>
      apiClients.planning.get<{ owners: Array<{ ownerId: string; commit: string; bestCase: string; pipeline: string }>; teamTotal: { commit: string; bestCase: string; pipeline: string } }>('/forecasts/rollup', { params: { period } }),
  });

  const createPlan = useMutation({
    mutationFn: () =>
      apiClients.planning.post('/quotas/plans', {
        name: `${year} Revenue Plan`,
        year,
        type: 'REVENUE',
        currency: 'USD',
        targets: [{ ownerId: userId ?? 'owner', targetValue: quotaValue, currency: 'USD' }],
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['planning', 'plans'] });
      pushToast({ variant: 'success', title: 'Quota plan saved' });
    },
  });
  const submitForecast = useMutation({
    mutationFn: () => apiClients.planning.post('/forecasts', { period, ...forecastForm }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['planning', 'forecast-rollup'] });
      pushToast({ variant: 'success', title: 'Forecast submitted' });
    },
  });
  const whatIf = useMutation({
    mutationFn: () =>
      apiClients.planning.post<{ projected: string; quota: string; projectedAttainmentPct: string }>('/quotas/what-if', {
        ownerId: userId ?? 'owner',
        dealAmounts: whatIfAmounts.split(',').map((v) => v.trim()).filter(Boolean),
      }),
  });

  const attainmentRows = useMemo(() => attainment.data ?? [], [attainment.data]);

  return (
    <main className="space-y-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Planning</h1>
        <div className="flex gap-1">
          {(['quota', 'forecast', 'whatif'] as const).map((id) => (
            <Button key={id} variant={tab === id ? 'primary' : 'secondary'} onClick={() => setTab(id)}>
              {id === 'quota' ? 'Quota Attainment' : id === 'forecast' ? 'Forecast' : 'What-If'}
            </Button>
          ))}
        </div>
      </header>

      {tab === 'quota' ? (
        <section className="space-y-4">
          <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-4">
            <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
            <Input value={quotaValue} onChange={(e) => setQuotaValue(e.target.value)} placeholder="Quota value" />
            <Button onClick={() => createPlan.mutate()} disabled={createPlan.isPending}>Set Quotas</Button>
          </div>
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr><th className="px-3 py-2">Rep</th><th>Quota</th><th>Actual Won</th><th>Attainment</th></tr>
              </thead>
              <tbody>
                {attainmentRows.map((row) => (
                  <tr key={row.ownerId} className="border-t">
                    <td className="px-3 py-2 font-mono text-xs">{row.ownerId}</td>
                    <td>{formatCurrency(Number(row.target), row.currency)}</td>
                    <td>{formatCurrency(Number(row.actual), row.currency)}</td>
                    <td className="w-64 pr-3">
                      <div className="h-2 rounded bg-slate-100">
                        <div className="h-2 rounded bg-emerald-500" style={{ width: `${Math.min(100, Number(row.attainmentPct))}%` }} />
                      </div>
                      <span className="text-xs">{row.attainmentPct}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : tab === 'forecast' ? (
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
            <Input value={period} onChange={(e) => setPeriod(e.target.value)} />
            {(['commitAmount', 'bestCaseAmount', 'pipelineAmount'] as const).map((field) => (
              <Input key={field} value={forecastForm[field]} onChange={(e) => setForecastForm({ ...forecastForm, [field]: e.target.value })} placeholder={field} />
            ))}
            <textarea value={forecastForm.commentary} onChange={(e) => setForecastForm({ ...forecastForm, commentary: e.target.value })} className="h-24 w-full rounded-md border p-2" placeholder="Commentary" />
            <Button onClick={() => submitForecast.mutate()}>Submit Forecast</Button>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="font-semibold">Team Rollup</h2>
            <p className="mt-2 text-sm">Commit: {formatCurrency(Number(rollup.data?.teamTotal.commit ?? 0))}</p>
            <p className="text-sm">Best Case: {formatCurrency(Number(rollup.data?.teamTotal.bestCase ?? 0))}</p>
            <p className="text-sm">Pipeline: {formatCurrency(Number(rollup.data?.teamTotal.pipeline ?? 0))}</p>
          </div>
        </section>
      ) : (
        <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <Input value={whatIfAmounts} onChange={(e) => setWhatIfAmounts(e.target.value)} placeholder="Comma-separated deal amounts" />
          <Button onClick={() => whatIf.mutate()}>Test Projected Attainment</Button>
          {whatIf.data ? (
            <div className="rounded bg-slate-50 p-3 text-sm">
              Projected {formatCurrency(Number(whatIf.data.projected))} vs quota {formatCurrency(Number(whatIf.data.quota))}: {whatIf.data.projectedAttainmentPct}%
            </div>
          ) : null}
        </section>
      )}
    </main>
  );
}
