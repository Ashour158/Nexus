'use client';

import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Funnel,
  FunnelChart,
  Legend,
  Line,
  LineChart,
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
  useActivityByType,
  useActivitySummary,
  useDealVelocity,
  useForecast,
  usePipelineFunnel,
  usePipelineSummary,
  useRevenueByRep,
  useRevenueSummary,
} from '@/hooks/use-analytics';

const PRESETS = ['This Month', 'Last Quarter', 'This Year', 'Custom'] as const;
const STAGE_COLORS = ['#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#EF4444'];

function periodBounds(
  preset: (typeof PRESETS)[number],
  ref: Date
): { from: string; to: string; year: number; quarter?: number } {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const d = ref.getDate();
  const startOfMonth = new Date(y, m, 1);
  const endOfMonth = new Date(y, m + 1, 0, 23, 59, 59, 999);
  const currentQ = Math.floor(m / 3) + 1;

  if (preset === 'This Month') {
    return {
      from: startOfMonth.toISOString(),
      to: endOfMonth.toISOString(),
      year: y,
      quarter: currentQ,
    };
  }
  if (preset === 'Last Quarter') {
    const q0 = Math.floor(m / 3);
    const prevQ0 = q0 === 0 ? 3 : q0 - 1;
    const yearForQ = q0 === 0 ? y - 1 : y;
    return {
      from: `${yearForQ}-01-01T00:00:00Z`,
      to: `${yearForQ}-12-31T23:59:59Z`,
      year: yearForQ,
      quarter: prevQ0 + 1,
    };
  }
  if (preset === 'This Year') {
    return {
      from: `${y}-01-01T00:00:00Z`,
      to: `${y}-12-31T23:59:59Z`,
      year: y,
    };
  }
  const start = new Date(ref);
  start.setDate(d - 30);
  return {
    from: start.toISOString(),
    to: ref.toISOString(),
    year: y,
  };
}

function funnelRows(
  data: Array<{
    stageId: string;
    stageName: string;
    count: number;
    value: number;
    conversionRate: number;
  }>
) {
  return data.map((row) => ({
    ...row,
    label: row.stageName?.trim()
      ? row.stageName
      : (row.stageId ? `${row.stageId.slice(0, 8)}…` : 'Stage'),
    value: row.value,
  }));
}

export default function AnalyticsPage(): JSX.Element {
  const [preset, setPreset] = useState<(typeof PRESETS)[number]>('This Year');
  const now = useMemo(() => new Date(), []);

  const period = useMemo(() => periodBounds(preset, now), [preset, now]);

  const pipelineSummary = usePipelineSummary();
  const funnel = usePipelineFunnel(period.from, period.to);
  const revenueSummary = useRevenueSummary(period.year, period.quarter);
  const revenueByRep = useRevenueByRep(period.year, period.quarter);
  const activitySummary = useActivitySummary();
  const activityByType = useActivityByType(period.from, period.to);
  const dealVelocity = useDealVelocity(period.from, period.to);
  const forecast = useForecast();

  const funnelChartData = useMemo(
    () => funnelRows(funnel.data ?? []),
    [funnel.data]
  );

  const velocityBars = useMemo(() => {
    const m = dealVelocity.data?.avgDaysPerStage ?? {};
    return Object.entries(m).map(([stageId, days]) => ({
      stage: stageId.slice(0, 8),
      days: Number(days) || 0,
    }));
  }, [dealVelocity.data]);
  const forecastByMonth = useMemo(
    () =>
      (forecast.data?.forecastByMonth ?? []).map((row) => ({
        month: row.month,
        weighted: Number(row.weighted),
        total: Number(row.total),
      })),
    [forecast.data]
  );

  const kpis = {
    totalRevenue: revenueSummary.data?.totalRevenue ?? 0,
    winRate: revenueSummary.data?.winRate ?? 0,
    avgDealSize: revenueSummary.data?.avgSalePrice ?? 0,
    avgDays: pipelineSummary.data?.avgDaysInPipeline ?? 0,
    openPipeline: pipelineSummary.data?.totalValue ?? 0,
    dealsCreated: pipelineSummary.data?.totalDeals ?? 0,
    actVolume: activitySummary.data?.volume ?? 0,
    actComplete: activitySummary.data?.completionRate ?? 0,
    actOverdue: activitySummary.data?.overdueRate ?? 0,
  };

  return (
    <main className="space-y-5 px-6 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
          <p className="text-sm text-slate-600">
            Revenue, pipeline, activities, and velocity for the selected period.
          </p>
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

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-9">
        <Metric label="Total Revenue" value={formatCurrency(kpis.totalRevenue)} />
        <Metric label="Win Rate" value={`${kpis.winRate.toFixed(1)}%`} />
        <Metric label="Avg Deal Size" value={formatCurrency(kpis.avgDealSize)} />
        <Metric label="Avg Days in Pipeline" value={`${kpis.avgDays.toFixed(1)}d`} />
        <Metric label="Open Pipeline" value={formatCurrency(kpis.openPipeline)} />
        <Metric label="Deals (summary)" value={String(kpis.dealsCreated)} />
        <Metric label="Activity volume" value={String(kpis.actVolume)} />
        <Metric label="Activity completion" value={`${kpis.actComplete.toFixed(0)}%`} />
        <Metric label="Overdue rate" value={`${kpis.actOverdue.toFixed(0)}%`} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card title="Pipeline value by stage">
          {funnel.isLoading ? (
            <Skeleton className="h-72" />
          ) : (
            <ChartBar data={funnelChartData} />
          )}
        </Card>
        <Card title="Win / loss mix">
          {revenueSummary.isLoading ? (
            <Skeleton className="h-72" />
          ) : (
            <PieWrap
              won={revenueSummary.data?.wonDeals ?? 0}
              lost={revenueSummary.data?.lostDeals ?? 0}
              dormant={Math.max(
                0,
                (pipelineSummary.data?.totalDeals ?? 0) -
                  (revenueSummary.data?.wonDeals ?? 0) -
                  (revenueSummary.data?.lostDeals ?? 0)
              )}
            />
          )}
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card title="Stage funnel (counts)">
          {funnel.isLoading ? <Skeleton className="h-72" /> : <FunnelWrap data={funnelChartData} />}
        </Card>
        <Card title="Revenue by rep">
          {revenueByRep.isLoading ? <Skeleton className="h-72" /> : <RepBar data={revenueByRep.data ?? []} />}
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card title="Activities by type">
          {activityByType.isLoading ? (
            <Skeleton className="h-72" />
          ) : (
            <ActivityTypeChart data={activityByType.data ?? []} />
          )}
        </Card>
        <Card title="Avg days per stage (velocity)">
          {dealVelocity.isLoading ? (
            <Skeleton className="h-72" />
          ) : (
            <VelocityLine data={velocityBars} avgClose={dealVelocity.data?.avgDaysToClose ?? 0} />
          )}
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card title="Forecast by month">
          {forecast.isLoading ? (
            <Skeleton className="h-72" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={forecastByMonth}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(v) => `$${Number(v) / 1000}k`} />
                <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                <Legend />
                <Bar dataKey="total" name="Total Pipeline" fill="#94a3b8" />
                <Bar dataKey="weighted" name="Weighted Pipeline" fill="#2563eb" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
        <Card title="Activity volume trend (by type)">
          {activityByType.isLoading ? (
            <Skeleton className="h-72" />
          ) : (
            <ActivityArea data={activityByType.data ?? []} />
          )}
        </Card>
        <Card title="Funnel conversion %">
          {funnel.isLoading ? (
            <Skeleton className="h-72" />
          ) : (
            <ConversionLine data={funnelChartData} />
          )}
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
                <tr key={r.ownerId} className="border-b border-gray-50 even:bg-gray-50/50 transition-colors hover:bg-blue-50/40">
                  <td className="px-3 py-2">{r.ownerId.slice(0, 8)}…</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(r.totalRevenue)}</td>
                  <td className="px-3 py-2 text-right">{r.wonDeals}</td>
                  <td className="px-3 py-2 text-right">—</td>
                  <td className="px-3 py-2 text-right">{r.winRate.toFixed(1)}%</td>
                  <td className="px-3 py-2 text-right">
                    {formatCurrency(r.wonDeals > 0 ? r.totalRevenue / r.wonDeals : 0)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {((r.totalRevenue / 100000) * 100).toFixed(1)}%
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

function ChartBar({
  data,
}: {
  data: Array<{ label: string; value: number }>;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
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

function FunnelWrap({
  data,
}: {
  data: Array<{ label: string; value: number; count: number }>;
}) {
  const shaped = data.map((d) => ({ name: d.label, value: d.count }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <FunnelChart>
        <Tooltip />
        <Funnel dataKey="value" data={shaped} isAnimationActive>
          {shaped.map((_, index) => (
            <Cell key={`funnel-cell-${index}`} fill={STAGE_COLORS[index % STAGE_COLORS.length]} />
          ))}
        </Funnel>
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

function ActivityTypeChart({
  data,
}: {
  data: Array<{ activityType: string; count: number; completionRate: number }>;
}) {
  const rows = [...data].sort((a, b) => b.count - a.count);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 8 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" />
        <YAxis dataKey="activityType" type="category" width={100} tick={{ fontSize: 10 }} />
        <Tooltip />
        <Bar dataKey="count" fill="#0369a1" name="Count" />
      </BarChart>
    </ResponsiveContainer>
  );
}

function ActivityArea({
  data,
}: {
  data: Array<{ activityType: string; count: number; completionRate: number }>;
}) {
  const rows = data.map((d) => ({
    type: d.activityType,
    count: d.count,
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="type" tick={{ fontSize: 10 }} interval={0} angle={-20} height={60} />
        <YAxis />
        <Tooltip />
        <Legend />
        <Area type="monotone" dataKey="count" stroke="#0ea5e9" fill="#7dd3fc" name="Created" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function VelocityLine({
  data,
  avgClose,
}: {
  data: Array<{ stage: string; days: number }>;
  avgClose: number;
}) {
  const withAvg = data.map((d) => ({ ...d, avgClose }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={withAvg.length ? withAvg : [{ stage: 'n/a', days: 0, avgClose }]}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="stage" tick={{ fontSize: 10 }} />
        <YAxis />
        <Tooltip />
        <Legend />
        <Line type="stepAfter" dataKey="days" stroke="#0f172a" name="Days in stage" dot />
        <Line
          type="monotone"
          dataKey="avgClose"
          stroke="#ea580c"
          strokeDasharray="4 4"
          name="Avg days to close (deal)"
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function ConversionLine({
  data,
}: {
  data: Array<{ label: string; conversionRate: number }>;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={{ fontSize: 10 }} />
        <YAxis unit="%" />
        <Tooltip />
        <Line type="monotone" dataKey="conversionRate" stroke="#4f46e5" name="Conversion %" dot />
      </LineChart>
    </ResponsiveContainer>
  );
}
