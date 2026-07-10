'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { AlertTriangle, BarChart3, CalendarClock, TrendingDown } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { StatCard } from '@/components/dashboard/StatCard';

function heatClass(value: number) {
  if (value >= 9) return 'bg-rose-200 text-rose-800 font-semibold';
  if (value >= 6) return 'bg-amber-100 text-amber-800';
  return 'bg-emerald-50 text-emerald-700';
}

export default function ManagerDashboardPage() {
  const roles = useAuthStore((s) => s.roles);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const router = useRouter();

  const { data: reportData, isLoading, error } = useQuery({
    queryKey: ['reports', 'manager'],
    queryFn: async () => {
      const res = await fetch('/api/reports/manager');
      if (!res.ok) throw new Error('Reports data not yet available');
      return res.json();
    },
    retry: false,
  });

  const forecastRows = useMemo(() => reportData?.forecast ?? [], [reportData]);
  const coaching = useMemo(() => reportData?.coaching ?? [], [reportData]);
  const heatmap = useMemo(() => reportData?.heatmap ?? [], [reportData]);

  const totals = useMemo(
    () =>
      forecastRows.reduce(
        (acc: any, row: any) => ({
          commit: acc.commit + row.commit,
          best: acc.best + row.best,
          pipeline: acc.pipeline + row.pipeline,
          weighted: acc.weighted + row.weighted,
          quota: acc.quota + row.quota,
        }),
        { commit: 0, best: 0, pipeline: 0, weighted: 0, quota: 0 }
      ),
    [forecastRows]
  );

  const allowed =
    roles.includes('manager') ||
    roles.includes('admin') ||
    hasPermission('reports:read') ||
    (process.env.NODE_ENV === 'development' &&
      process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS !== 'false');
  if (!allowed) {
    router.replace('/');
    return <div className="p-4 text-sm text-slate-500">Redirecting...</div>;
  }

  const totalQuota = reportData?.totalQuota ?? totals.quota;
  const totalRevenue = reportData?.totalRevenue ?? 0;

  const onTrack = forecastRows.filter((r: any) => r.weighted / r.quota >= 0.75).length;
  const atRisk = forecastRows.filter((r: any) => {
    const ratio = r.weighted / r.quota;
    return ratio >= 0.25 && ratio < 0.75;
  }).length;
  const behind = forecastRows.filter((r: any) => r.weighted / r.quota < 0.25).length;

  if (isLoading) {
    return (
      <main className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-slate-900">Manager Dashboard</h1>
          <p className="text-sm text-slate-500">Team forecast, coaching insights, and risk concentration.</p>
        </header>
        <div className="py-12 text-center text-slate-500">Loading reports...</div>
      </main>
    );
  }

  if (error || forecastRows.length === 0) {
    return (
      <main className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-slate-900">Manager Dashboard</h1>
          <p className="text-sm text-slate-500">Team forecast, coaching insights, and risk concentration.</p>
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
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Manager Dashboard</h1>
        <p className="text-sm text-slate-500">Team forecast, coaching insights, and risk concentration.</p>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Team quota"
          value={totalQuota > 0 ? `${Math.round((totalRevenue / totalQuota) * 100)}%` : 'N/A'}
          delta={8.2}
          icon={<TrendingDown className="h-5 w-5" />}
          iconBg="bg-indigo-100 text-indigo-700"
        />
        <StatCard
          label="Reps on track"
          value={onTrack}
          icon={<CalendarClock className="h-5 w-5" />}
          iconBg="bg-emerald-100 text-emerald-700"
        />
        <StatCard
          label="Reps at risk"
          value={atRisk}
          icon={<AlertTriangle className="h-5 w-5" />}
          iconBg="bg-amber-100 text-amber-700"
        />
        <StatCard
          label="Reps behind"
          value={behind}
          icon={<AlertTriangle className="h-5 w-5" />}
          iconBg="bg-rose-100 text-rose-700"
        />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Forecast summary</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-start text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-2 py-2">Rep</th>
                <th className="px-2 py-2">Commit</th>
                <th className="px-2 py-2">Best case</th>
                <th className="px-2 py-2">Pipeline</th>
                <th className="px-2 py-2">Weighted</th>
                <th className="px-2 py-2">Quota</th>
                <th className="px-2 py-2">Gap</th>
              </tr>
            </thead>
            <tbody>
              {forecastRows.map((row: any) => {
                const ratio = row.weighted / row.quota;
                const color =
                  ratio >= 1 ? 'text-emerald-700' : ratio >= 0.75 ? 'text-amber-700' : 'text-rose-700';
                return (
                  <tr key={row.rep} className="border-t border-slate-100">
                    <td className="px-2 py-2 font-medium">{row.rep}</td>
                    <td className="px-2 py-2">${row.commit.toLocaleString()}</td>
                    <td className="px-2 py-2">${row.best.toLocaleString()}</td>
                    <td className="px-2 py-2">${row.pipeline.toLocaleString()}</td>
                    <td className="px-2 py-2">${row.weighted.toLocaleString()}</td>
                    <td className="px-2 py-2">${row.quota.toLocaleString()}</td>
                    <td className={`px-2 py-2 font-semibold ${color}`}>
                      ${(row.quota - row.weighted).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                <td className="px-2 py-2">Totals</td>
                <td className="px-2 py-2">${totals.commit.toLocaleString()}</td>
                <td className="px-2 py-2">${totals.best.toLocaleString()}</td>
                <td className="px-2 py-2">${totals.pipeline.toLocaleString()}</td>
                <td className="px-2 py-2">${totals.weighted.toLocaleString()}</td>
                <td className="px-2 py-2">${totals.quota.toLocaleString()}</td>
                <td className="px-2 py-2">${(totals.quota - totals.weighted).toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Coaching opportunities</h2>
        <ul className="space-y-2">
          {coaching.map((signal: any) => (
            <li
              key={signal.rep + signal.metric}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 p-3"
            >
              <div>
                <p className="text-sm font-semibold text-slate-900">{signal.rep}</p>
                <p className="text-xs text-slate-500">
                  {signal.metric} · {signal.deviation}
                </p>
              </div>
              <button className="rounded border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">
                Schedule 1:1
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Pipeline risk heatmap</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-start text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-2 py-2">Stage</th>
                <th className="px-2 py-2">$0–$10k</th>
                <th className="px-2 py-2">$10k–$50k</th>
                <th className="px-2 py-2">$50k+</th>
              </tr>
            </thead>
            <tbody>
              {heatmap.map((row: any) => (
                <tr key={row.stage} className="border-t border-slate-100">
                  <td className="px-2 py-2 font-medium">{row.stage}</td>
                  <td className="px-2 py-2">
                    <span className={`rounded px-2 py-1 ${heatClass(row.small)}`}>{row.small}</span>
                  </td>
                  <td className="px-2 py-2">
                    <span className={`rounded px-2 py-1 ${heatClass(row.medium)}`}>{row.medium}</span>
                  </td>
                  <td className="px-2 py-2">
                    <span className={`rounded px-2 py-1 ${heatClass(row.large)}`}>{row.large}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
