'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CalendarClock, TrendingDown } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { StatCard } from '@/components/dashboard/StatCard';

const FORECAST_ROWS = [
  { rep: 'Carlos Mendez', commit: 90000, best: 130000, pipeline: 180000, weighted: 112000, quota: 110000 },
  { rep: 'Sofia Rodriguez', commit: 82000, best: 120000, pipeline: 171000, weighted: 103000, quota: 108000 },
  { rep: 'Marcus Chen', commit: 70000, best: 101000, pipeline: 149000, weighted: 88000, quota: 98000 },
  { rep: 'Nina Volkov', commit: 56000, best: 90000, pipeline: 136000, weighted: 73000, quota: 94000 },
];

const COACHING = [
  { rep: 'Marcus Chen', metric: 'Low activity', deviation: '-24% vs team avg' },
  { rep: 'Nina Volkov', metric: 'High stall rate', deviation: '+12% over target' },
  { rep: 'Sofia Rodriguez', metric: 'Slow first response', deviation: '9.2h average' },
  { rep: 'Carlos Mendez', metric: 'Discount dependency', deviation: '42% discounted deals' },
];

const HEATMAP = [
  { stage: 'Qualification', small: 8, medium: 13, large: 10 },
  { stage: 'Proposal', small: 5, medium: 10, large: 7 },
  { stage: 'Negotiation', small: 3, medium: 6, large: 5 },
  { stage: 'Commit', small: 2, medium: 4, large: 4 },
];

function heatClass(value: number) {
  if (value >= 9) return 'bg-rose-200 text-rose-800 font-semibold';
  if (value >= 6) return 'bg-amber-100 text-amber-800';
  return 'bg-emerald-50 text-emerald-700';
}

export default function ManagerDashboardPage() {
  const roles = useAuthStore((s) => s.roles);
  const router = useRouter();

  const allowed = roles.includes('manager') || roles.includes('admin');
  if (!allowed) {
    router.replace('/');
    return <div className="p-4 text-sm text-slate-500">Redirecting...</div>;
  }

  const totalQuota = 410000;
  const totalRevenue = 346000;

  const onTrack = FORECAST_ROWS.filter((r) => r.weighted / r.quota >= 0.75).length;
  const atRisk = FORECAST_ROWS.filter((r) => {
    const ratio = r.weighted / r.quota;
    return ratio >= 0.25 && ratio < 0.75;
  }).length;
  const behind = FORECAST_ROWS.filter((r) => r.weighted / r.quota < 0.25).length;

  const totals = useMemo(
    () =>
      FORECAST_ROWS.reduce(
        (acc, row) => ({
          commit: acc.commit + row.commit,
          best: acc.best + row.best,
          pipeline: acc.pipeline + row.pipeline,
          weighted: acc.weighted + row.weighted,
          quota: acc.quota + row.quota,
        }),
        { commit: 0, best: 0, pipeline: 0, weighted: 0, quota: 0 }
      ),
    []
  );

  return (
    <main className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Manager Dashboard</h1>
        <p className="text-sm text-slate-500">Team forecast, coaching insights, and risk concentration.</p>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Team quota" value={`${Math.round((totalRevenue / totalQuota) * 100)}%`} delta={8.2} icon={<TrendingDown className="h-5 w-5" />} iconBg="bg-blue-100 text-blue-700" />
        <StatCard label="Reps on track" value={onTrack} icon={<CalendarClock className="h-5 w-5" />} iconBg="bg-emerald-100 text-emerald-700" />
        <StatCard label="Reps at risk" value={atRisk} icon={<AlertTriangle className="h-5 w-5" />} iconBg="bg-amber-100 text-amber-700" />
        <StatCard label="Reps behind" value={behind} icon={<AlertTriangle className="h-5 w-5" />} iconBg="bg-rose-100 text-rose-700" />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Forecast summary</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-2 py-2">Rep</th><th className="px-2 py-2">Commit</th><th className="px-2 py-2">Best case</th><th className="px-2 py-2">Pipeline</th><th className="px-2 py-2">Weighted</th><th className="px-2 py-2">Quota</th><th className="px-2 py-2">Gap</th></tr>
            </thead>
            <tbody>
              {FORECAST_ROWS.map((row) => {
                const ratio = row.weighted / row.quota;
                const color = ratio >= 1 ? 'text-emerald-700' : ratio >= 0.75 ? 'text-amber-700' : 'text-rose-700';
                return (
                  <tr key={row.rep} className="border-t border-slate-100">
                    <td className="px-2 py-2 font-medium">{row.rep}</td>
                    <td className="px-2 py-2">${row.commit.toLocaleString()}</td>
                    <td className="px-2 py-2">${row.best.toLocaleString()}</td>
                    <td className="px-2 py-2">${row.pipeline.toLocaleString()}</td>
                    <td className="px-2 py-2">${row.weighted.toLocaleString()}</td>
                    <td className="px-2 py-2">${row.quota.toLocaleString()}</td>
                    <td className={`px-2 py-2 font-semibold ${color}`}>${(row.quota - row.weighted).toLocaleString()}</td>
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
          {COACHING.map((signal) => (
            <li key={signal.rep + signal.metric} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 p-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{signal.rep}</p>
                <p className="text-xs text-slate-500">{signal.metric} · {signal.deviation}</p>
              </div>
              <button className="rounded border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50">Schedule 1:1</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Pipeline risk heatmap</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-2 py-2">Stage</th><th className="px-2 py-2">$0–$10k</th><th className="px-2 py-2">$10k–$50k</th><th className="px-2 py-2">$50k+</th></tr>
            </thead>
            <tbody>
              {HEATMAP.map((row) => (
                <tr key={row.stage} className="border-t border-slate-100">
                  <td className="px-2 py-2 font-medium">{row.stage}</td>
                  <td className="px-2 py-2"><span className={`rounded px-2 py-1 ${heatClass(row.small)}`}>{row.small}</span></td>
                  <td className="px-2 py-2"><span className={`rounded px-2 py-1 ${heatClass(row.medium)}`}>{row.medium}</span></td>
                  <td className="px-2 py-2"><span className={`rounded px-2 py-1 ${heatClass(row.large)}`}>{row.large}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
