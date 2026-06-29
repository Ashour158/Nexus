'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Users } from 'lucide-react';
import { DateRangePicker } from '@/components/dashboard/DateRangePicker';
import { EmptyState } from '@/components/dashboard/EmptyState';

const ActivityBreakdownChart = dynamic(
  () => import('./charts').then((m) => m.ActivityBreakdownChart),
  { ssr: false }
);
const RevenueQuotaChart = dynamic(
  () => import('./charts').then((m) => m.RevenueQuotaChart),
  { ssr: false }
);
const WinLossPieChart = dynamic(
  () => import('./charts').then((m) => m.WinLossPieChart),
  { ssr: false }
);
const LostReasonsChart = dynamic(
  () => import('./charts').then((m) => m.LostReasonsChart),
  { ssr: false }
);
const ResponseTimeChart = dynamic(
  () => import('./charts').then((m) => m.ResponseTimeChart),
  { ssr: false }
);

export default function PerformanceDashboardPage() {
  const [team, setTeam] = useState('all');
  const [rep, setRep] = useState('all');
  const [product, setProduct] = useState('all');

  const { data: reportData, isLoading, error } = useQuery({
    queryKey: ['reports', 'performance'],
    queryFn: async () => {
      const res = await fetch('/api/reports/performance');
      if (!res.ok) throw new Error('Reports data not yet available');
      return res.json();
    },
    retry: false,
  });

  const reps = useMemo(() => reportData?.reps ?? [], [reportData]);
  const activity = useMemo(() => reportData?.activity ?? [], [reportData]);
  const cumulative = useMemo(() => reportData?.cumulative ?? [], [reportData]);
  const lostReasons = useMemo(() => reportData?.lostReasons ?? [], [reportData]);
  const competitors = useMemo(() => reportData?.competitors ?? [], [reportData]);
  const winLoss = useMemo(() => reportData?.winLoss ?? [], [reportData]);

  const wonLost = winLoss;

  if (isLoading) {
    return (
      <main className="space-y-6">
        <header className="space-y-3">
          <h1 className="text-2xl font-bold text-slate-900">Sales Performance</h1>
        </header>
        <div className="py-12 text-center text-slate-500">Loading reports...</div>
      </main>
    );
  }

  if (error || reps.length === 0) {
    return (
      <main className="space-y-6">
        <header className="space-y-3">
          <h1 className="text-2xl font-bold text-slate-900">Sales Performance</h1>
        </header>
        <EmptyState
          icon={<BarChart3 className="h-5 w-5" />}
          title="Reports data not yet available"
          description="The reporting service is not configured or returned no data. Please check back later."
        />
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <header className="space-y-3">
        <h1 className="text-2xl font-bold text-slate-900">Sales Performance</h1>
        <div className="grid gap-2 md:grid-cols-4">
          <DateRangePicker />
          <select
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="all">All teams</option>
            <option value="enterprise">Enterprise</option>
            <option value="midmarket">Mid-market</option>
          </select>
          <select
            value={rep}
            onChange={(e) => setRep(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="all">All reps</option>
            {reps.map((r: any) => (
              <option key={r.id}>{r.name}</option>
            ))}
          </select>
          <select
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="all">All products</option>
            <option value="core">Core</option>
            <option value="addons">Add-ons</option>
          </select>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {reps.map((row: any) => (
          <div key={row.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold">
                {row.name.split(' ').map((p: string) => p[0]).join('')}
              </span>
              <div>
                <p className="font-semibold text-slate-900">{row.name}</p>
                <p className="text-xs text-slate-500">{row.won} deals won</p>
              </div>
            </div>
            <div className="mt-3 h-2 rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-blue-600"
                style={{ width: `${Math.min(100, (row.revenue / row.quota) * 100)}%` }}
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <p>
                Revenue: <span className="font-semibold">${row.revenue.toLocaleString()}</span>
              </p>
              <p>
                Quota: <span className="font-semibold">${row.quota.toLocaleString()}</span>
              </p>
              <p>
                Activities: <span className="font-semibold">{row.activities}</span>
              </p>
              <p>
                Response: <span className="font-semibold">{row.responseHrs}h</span>
              </p>
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Activity breakdown</h2>
        <div className="h-72">
          <ActivityBreakdownChart data={activity} />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Revenue vs Quota</h2>
        <div className="h-72">
          <RevenueQuotaChart data={cumulative} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Win/Loss analysis</h2>
          <div className="h-56">
            <WinLossPieChart data={wonLost} />
          </div>
          <div className="mt-3 h-44">
            <LostReasonsChart data={lostReasons} />
          </div>
          <div className="mt-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Top competitors in lost deals
            </h3>
            <ul className="mt-2 space-y-1 text-sm">
              {competitors.map((c: any) => (
                <li key={c.name} className="flex justify-between">
                  <span>{c.name}</span>
                  <span className="font-semibold">{c.mentions}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Response time analysis</h2>
          <div className="h-72">
            <ResponseTimeChart data={reps} />
          </div>
          <p className="mt-3 text-xs text-slate-500">
            SLA target: 4 hours. Reps above threshold should receive coaching support.
          </p>
          {reps.length === 0 ? (
            <EmptyState
              icon={<Users className="h-5 w-5" />}
              title="No reps selected"
              description="Adjust your filters to display performance cards."
            />
          ) : null}
        </div>
      </section>
    </main>
  );
}
