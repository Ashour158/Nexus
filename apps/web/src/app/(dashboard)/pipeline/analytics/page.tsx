'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, BarChart3, Gauge, Hourglass, Target } from 'lucide-react';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { StatCard } from '@/components/dashboard/StatCard';
import { AnalyticsReadModelSection } from './analytics-readmodel';

const PipelineFunnelChart = dynamic(
  () => import('./charts').then((m) => m.PipelineFunnelChart),
  { ssr: false }
);
const DealFlowChart = dynamic(
  () => import('./charts').then((m) => m.DealFlowChart),
  { ssr: false }
);

export default function PipelineAnalyticsPage() {
  const { data: reportData, isLoading, error } = useQuery({
    queryKey: ['reports', 'pipeline'],
    queryFn: async () => {
      const res = await fetch('/api/reports/pipeline');
      if (!res.ok) throw new Error('Pipeline analytics not yet available');
      return res.json();
    },
    retry: false,
  });

  const funnel = useMemo(() => reportData?.funnel ?? [], [reportData]);
  const dealFlow = useMemo(() => reportData?.dealFlow ?? [], [reportData]);
  const stageDays = useMemo(() => reportData?.stageDays ?? [], [reportData]);
  const cohort = useMemo(() => reportData?.cohort ?? [], [reportData]);
  const stats = useMemo(() => reportData?.stats ?? {}, [reportData]);

  const avgPipelineDays = useMemo(() => {
    if (stageDays.length === 0) return 0;
    return Math.round(stageDays.reduce((sum: number, s: any) => sum + s.days, 0) * 1.35);
  }, [stageDays]);

  if (isLoading) {
    return (
      <main className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-slate-900">Pipeline Analytics</h1>
          <p className="text-sm text-slate-500">
            Deep visibility into conversions, velocity, and forecast confidence.
          </p>
        </header>
        <div className="py-12 text-center text-slate-500">Loading analytics...</div>
      </main>
    );
  }

  if (error || funnel.length === 0) {
    return (
      <main className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-slate-900">Pipeline Analytics</h1>
          <p className="text-sm text-slate-500">
            Deep visibility into conversions, velocity, and forecast confidence.
          </p>
        </header>
        <AnalyticsReadModelSection />
        <EmptyState
          icon={<BarChart3 className="h-5 w-5" />}
          title="Pipeline analytics not yet available"
          description="The reporting service is not configured or returned no data. Please check back later."
        />
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Pipeline Analytics</h1>
        <p className="text-sm text-slate-500">
          Deep visibility into conversions, velocity, and forecast confidence.
        </p>
      </header>

      <AnalyticsReadModelSection />

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Funnel visualization</h2>
        <div className="h-72">
          <PipelineFunnelChart data={funnel} />
        </div>
        <div className="grid gap-2 text-xs text-slate-500 md:grid-cols-5">
          {funnel.map((row: any) => (
            <p key={row.stage}>
              {row.stage}: {row.deals} deals · ${row.value.toLocaleString()} · {row.conversion}%
            </p>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Average days in pipeline"
          value={avgPipelineDays}
          delta={-4.2}
          icon={<Hourglass className="h-5 w-5" />}
          iconBg="bg-amber-100 text-amber-700"
        />
        <StatCard
          label="Avg days per stage"
          value={
            stageDays.length > 0
              ? Math.round(stageDays.reduce((s: number, r: any) => s + r.days, 0) / stageDays.length)
              : 0
          }
          delta={2.4}
          icon={<Gauge className="h-5 w-5" />}
          iconBg="bg-indigo-100 text-indigo-700"
        />
        <StatCard
          label="Deals stalled >14 days"
          value={stats.stalled ?? 0}
          delta={11.1}
          icon={<AlertTriangle className="h-5 w-5" />}
          iconBg="bg-rose-100 text-rose-700"
        />
        <StatCard
          label="Projected close this month"
          value={stats.projectedClose ?? 0}
          format="currency"
          delta={6.5}
          icon={<Target className="h-5 w-5" />}
          iconBg="bg-emerald-100 text-emerald-700"
        />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Deal flow over time</h2>
        <div className="h-72">
          <DealFlowChart data={dealFlow} />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Cohort table</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-start text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-2 py-2">Month created</th>
                <th className="px-2 py-2">Qualification</th>
                <th className="px-2 py-2">Proposal</th>
                <th className="px-2 py-2">Negotiation</th>
                <th className="px-2 py-2">Commit</th>
              </tr>
            </thead>
            <tbody>
              {cohort.map((row: any) => (
                <tr key={row.month} className="border-t border-slate-100">
                  <td className="px-2 py-2 font-medium">{row.month}</td>
                  <td className="px-2 py-2">{row.qualification}</td>
                  <td className="px-2 py-2">{row.proposal}</td>
                  <td className="px-2 py-2">{row.negotiation}</td>
                  <td className={`px-2 py-2 ${row.commit <= 1 ? 'font-semibold text-rose-600' : ''}`}>
                    {row.commit}
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
