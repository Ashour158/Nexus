'use client';

import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Funnel,
  FunnelChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/format';
import {
  usePipelineFunnel,
  usePipelineSummary,
  useRevenueByRep,
  useRevenueSummary,
} from '@/hooks/use-analytics';

const PRESETS = ['This Month', 'Last Quarter', 'This Year', 'Custom'] as const;

export default function AnalyticsPage(): JSX.Element {
  const [preset, setPreset] = useState<(typeof PRESETS)[number]>('This Year');
  const now = new Date();
  const year = now.getFullYear();
  const quarter = Math.floor(now.getMonth() / 3) + 1;

  const period = useMemo(() => {
    const from = `${year}-01-01T00:00:00Z`;
    const to = `${year}-12-31T23:59:59Z`;
    return { from, to, year, quarter: preset === 'Last Quarter' ? Math.max(1, quarter - 1) : undefined };
  }, [preset, year, quarter]);

  const pipelineSummary = usePipelineSummary();
  const funnel = usePipelineFunnel(period.from, period.to);
  const revenueSummary = useRevenueSummary(period.year, period.quarter);
  const revenueByRep = useRevenueByRep(period.year, period.quarter);

  const kpis = {
    totalRevenue: revenueSummary.data?.totalRevenue ?? 0,
    winRate: revenueSummary.data?.winRate ?? 0,
    avgDealSize: revenueSummary.data?.avgSalePrice ?? 0,
    avgDays: pipelineSummary.data?.avgDaysInPipeline ?? 0,
    openPipeline: pipelineSummary.data?.totalValue ?? 0,
    dealsCreated: pipelineSummary.data?.totalDeals ?? 0,
  };

  return (
    <main className="space-y-5 px-6 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
          <p className="text-sm text-slate-600">Revenue and pipeline performance dashboard.</p>
        </div>
        <select
          value={preset}
          onChange={(e) => setPreset(e.target.value as (typeof PRESETS)[number])}
          className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm"
        >
          {PRESETS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </header>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <Metric label="Total Revenue" value={formatCurrency(kpis.totalRevenue)} />
        <Metric label="Win Rate" value={`${kpis.winRate.toFixed(1)}%`} />
        <Metric label="Avg Deal Size" value={formatCurrency(kpis.avgDealSize)} />
        <Metric label="Avg Days to Close" value={`${kpis.avgDays.toFixed(1)}d`} />
        <Metric label="Open Pipeline Value" value={formatCurrency(kpis.openPipeline)} />
        <Metric label="Deals Created" value={String(kpis.dealsCreated)} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card title="Revenue over stages">
          {funnel.isLoading ? <Skeleton className="h-72" /> : <ChartBar data={funnel.data ?? []} />}
        </Card>
        <Card title="Win/Loss breakdown">
          {revenueSummary.isLoading ? (
            <Skeleton className="h-72" />
          ) : (
            <PieWrap
              won={revenueSummary.data?.wonDeals ?? 0}
              lost={revenueSummary.data?.lostDeals ?? 0}
              dormant={Math.max(0, (pipelineSummary.data?.totalDeals ?? 0) - (revenueSummary.data?.wonDeals ?? 0) - (revenueSummary.data?.lostDeals ?? 0))}
            />
          )}
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card title="Pipeline funnel">
          {funnel.isLoading ? <Skeleton className="h-72" /> : <FunnelWrap data={funnel.data ?? []} />}
        </Card>
        <Card title="Revenue by rep">
          {revenueByRep.isLoading ? <Skeleton className="h-72" /> : <RepBar data={revenueByRep.data ?? []} />}
        </Card>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Rep performance</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left">Rep</th>
                <th className="px-3 py-2 text-right">Revenue</th>
                <th className="px-3 py-2 text-right">Won deals</th>
                <th className="px-3 py-2 text-right">Lost deals</th>
                <th className="px-3 py-2 text-right">Win rate</th>
                <th className="px-3 py-2 text-right">Avg deal</th>
                <th className="px-3 py-2 text-right">Quota attainment</th>
              </tr>
            </thead>
            <tbody>
              {(revenueByRep.data ?? []).map((r) => (
                <tr key={r.ownerId} className="border-t border-slate-100">
                  <td className="px-3 py-2">{r.ownerId.slice(0, 8)}…</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(r.totalRevenue)}</td>
                  <td className="px-3 py-2 text-right">{r.wonDeals}</td>
                  <td className="px-3 py-2 text-right">—</td>
                  <td className="px-3 py-2 text-right">{r.winRate.toFixed(1)}%</td>
                  <td className="px-3 py-2 text-right">
                    {formatCurrency(r.wonDeals > 0 ? r.totalRevenue / r.wonDeals : 0)}
                  </td>
                  <td className="px-3 py-2 text-right">{((r.totalRevenue / 100000) * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-2 text-sm font-semibold text-slate-900">{title}</h2>
      <div className="h-72">{children}</div>
    </div>
  );
}

function ChartBar({ data }: { data: Array<{ stageName: string; value: number }> }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="stageName" />
        <YAxis />
        <Tooltip />
        <Bar dataKey="value" fill="#0f172a" />
      </BarChart>
    </ResponsiveContainer>
  );
}

function PieWrap({ won, lost, dormant }: { won: number; lost: number; dormant: number }) {
  const data = [
    { name: 'WON', value: won, color: '#059669' },
    { name: 'LOST', value: lost, color: '#dc2626' },
    { name: 'DORMANT', value: dormant, color: '#d97706' },
  ];
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" outerRadius={90}>
          {data.map((d) => (
            <Cell key={d.name} fill={d.color} />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );
}

function FunnelWrap({ data }: { data: Array<{ stageName: string; value: number }> }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <FunnelChart>
        <Tooltip />
        <Funnel dataKey="value" data={data} isAnimationActive />
      </FunnelChart>
    </ResponsiveContainer>
  );
}

function RepBar({
  data,
}: {
  data: Array<{ ownerId: string; totalRevenue: number }>;
}) {
  const rows = [...data].sort((a, b) => b.totalRevenue - a.totalRevenue);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="ownerId" tickFormatter={(v: string | number) => String(v).slice(0, 6)} />
        <YAxis />
        <Tooltip />
        <Bar dataKey="totalRevenue" fill="#1d4ed8" />
      </BarChart>
    </ResponsiveContainer>
  );
}
