'use client';

import { useMemo, useState, type ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  HelpCircle,
  MoreVertical,
  RefreshCw,
  Search,
  Share2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatCurrency, formatDate } from '@/lib/format';
import { useUsers } from '@/hooks/use-users';

type DealStatus = 'CLOSED WON' | 'IN PROGRESS' | 'PENDING APPROVAL' | 'CLOSED LOST';

interface PerformanceRow {
  id: string;
  date: string;
  customer: string;
  customerSubtitle: string;
  ownerName: string;
  dealValue: number;
  status: DealStatus;
}

interface TerritoryRow {
  name: string;
  value: number;
  delta: number;
}

interface EventRow {
  id: string;
  actor: string;
  action: string;
  timestamp: string;
}

interface PerformanceReport {
  kpis?: {
    revenueDelta?: number;
    conversionDelta?: number;
    activeDealsDelta?: number;
    avgDealSizeDelta?: number;
    revenueSparkline?: number[];
    conversionSparkline?: number[];
    activeDealsSparkline?: number[];
    avgDealSizeSparkline?: number[];
  };
  performance: PerformanceRow[];
  territory: TerritoryRow[];
  events: EventRow[];
}

const STATUS_STYLES: Record<DealStatus, string> = {
  'CLOSED WON': 'bg-emerald-100 text-emerald-700',
  'IN PROGRESS': 'bg-blue-100 text-blue-700',
  'PENDING APPROVAL': 'bg-amber-100 text-amber-700',
  'CLOSED LOST': 'bg-rose-100 text-rose-700',
};

const avatarTones = [
  'bg-blue-100 text-blue-600',
  'bg-purple-100 text-purple-600',
  'bg-amber-100 text-amber-600',
  'bg-indigo-100 text-indigo-600',
  'bg-rose-100 text-rose-600',
];

export default function AnalyticsPage(): ReactElement {
  const [dateRange, setDateRange] = useState('last-30');
  const [team, setTeam] = useState('all');
  const [user, setUser] = useState('all');
  const [search, setSearch] = useState('');
  const { data: usersData } = useUsers();

  const { data, isLoading, error, refetch, isFetching } = useQuery<PerformanceReport>({
    queryKey: ['analytics', 'stitch-performance'],
    queryFn: async () => {
      const res = await fetch('/api/reports/performance');
      if (!res.ok) throw new Error('Analytics data is not available');
      return res.json();
    },
    retry: false,
  });

  const rows = useMemo(() => {
    const source = data?.performance ?? [];
    const q = search.trim().toLowerCase();
    return source.filter((row) => {
      if (!q) return true;
      return (
        row.customer.toLowerCase().includes(q) ||
        row.customerSubtitle.toLowerCase().includes(q) ||
        row.ownerName.toLowerCase().includes(q) ||
        row.status.toLowerCase().includes(q)
      );
    });
  }, [data?.performance, search]);

  const totalRevenue = rows.reduce((sum, row) => sum + row.dealValue, 0);
  const won = rows.filter((row) => row.status === 'CLOSED WON').length;
  const activeDeals = rows.filter((row) => row.status === 'IN PROGRESS' || row.status === 'PENDING APPROVAL').length;
  const conversion = rows.length ? (won / rows.length) * 100 : 0;
  const avgDealSize = rows.length ? totalRevenue / rows.length : 0;
  const maxTerritory = Math.max(...(data?.territory ?? []).map((row) => row.value), 1);

  if (isLoading) {
    return <div className="rounded-xl border border-slate-100 bg-white p-10 text-center text-sm text-slate-500">Loading analytics...</div>;
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50 p-8 text-sm text-red-700">
        Analytics data is not available. Please check the reporting preview API.
      </div>
    );
  }

  return (
    <main className="space-y-8">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <SelectControl label="Date Range" value={dateRange} onChange={setDateRange} options={[
            ['last-30', 'Last 30 Days'],
            ['quarter', 'This Quarter'],
            ['ytd', 'Year to Date'],
            ['custom', 'Custom Range'],
          ]} />
          <SelectControl label="Team" value={team} onChange={setTeam} options={[
            ['all', 'All Teams'],
            ['north', 'Sales North'],
            ['west', 'Sales West'],
            ['enterprise', 'Enterprise'],
          ]} />
          <SelectControl label="User" value={user} onChange={setUser} options={[
            ['all', 'All Users'],
            ...(usersData?.data ?? []).map((u) => [u.id, `${u.firstName} ${u.lastName}`] as [string, string]),
          ]} />
        </div>

        <div className="flex items-center gap-2">
          <button className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition hover:border-blue-200 hover:text-blue-600" title="More filters">
            <Filter className="h-5 w-5" />
          </button>
          <button
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition hover:border-blue-200 hover:text-blue-600"
            title="Refresh"
            onClick={() => void refetch()}
          >
            <RefreshCw className={cn('h-5 w-5', isFetching && 'animate-spin')} />
          </button>
          <button className="hidden items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 sm:inline-flex">
            <Share2 className="h-4 w-4" />
            Share
          </button>
          <button className="hidden items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 sm:inline-flex">
            Export
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        <SparkMetric label="Total Revenue" value={formatCurrency(totalRevenue)} tone="blue" sparkline={data.kpis?.revenueSparkline ?? []} />
        <SparkMetric label="Conversion Rate" value={`${conversion.toFixed(1)}%`} tone="emerald" sparkline={data.kpis?.conversionSparkline ?? []} />
        <SparkMetric label="Active Deals" value={String(activeDeals)} tone="amber" sparkline={data.kpis?.activeDealsSparkline ?? []} />
        <SparkMetric label="Avg Deal Size" value={formatCurrency(avgDealSize)} tone="indigo" sparkline={data.kpis?.avgDealSizeSparkline ?? []} />
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Detailed Performance Log</h1>
            <p className="text-sm text-slate-500">
              Showing {rows.length.toLocaleString()} transactions across {(data.territory ?? []).length} territories
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-100 pl-9 pr-3 text-sm outline-none focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100 sm:w-64"
                placeholder="Search performance..."
              />
            </label>
            <span className="text-xs font-semibold text-slate-400">Rows per page: 25</span>
            <div className="flex rounded-lg border border-slate-200">
              <button className="border-r border-slate-200 p-2 hover:bg-slate-50" title="Previous">
                <ChevronLeft className="h-4 w-4 text-slate-500" />
              </button>
              <button className="p-2 hover:bg-slate-50" title="Next">
                <ChevronRight className="h-4 w-4 text-slate-500" />
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left">
            <thead>
              <tr className="bg-slate-50/80">
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Deal Value</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, index) => (
                <tr key={row.id} className="transition-colors hover:bg-slate-50/80">
                  <td className="p-4 text-sm font-medium text-slate-600">{formatDate(row.date)}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className={cn('flex h-8 w-8 items-center justify-center rounded text-xs font-bold', avatarTones[index % avatarTones.length])}>
                        {initials(row.customer)}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">{row.customer}</p>
                        <p className="text-xs text-slate-400">{row.customerSubtitle}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">
                        {initials(row.ownerName)}
                      </div>
                      <span className="text-sm text-slate-600">{row.ownerName}</span>
                    </div>
                  </td>
                  <td className="p-4 text-sm font-bold text-slate-900">{formatCurrency(row.dealValue)}</td>
                  <td className="p-4">
                    <span className={cn('rounded px-2 py-1 text-[10px] font-bold uppercase tracking-tight', STATUS_STYLES[row.status])}>
                      {row.status}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <button className="text-slate-400 hover:text-blue-600" title="Actions">
                      <MoreVertical className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-medium text-slate-500">Page 1 of 1</p>
          <div className="flex items-center gap-2">
            <button className="rounded border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-600 opacity-50" disabled>
              Previous
            </button>
            <button className="h-6 w-6 rounded bg-blue-600 text-[10px] font-bold text-white">1</button>
            <button className="rounded border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-600 hover:bg-slate-50">
              Next
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm lg:col-span-2">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Revenue by Territory</h2>
            <span className="text-xs font-bold text-blue-600">View Map</span>
          </div>
          <div className="space-y-5">
            {data.territory.map((territory) => {
              const width = Math.max(8, Math.round((territory.value / maxTerritory) * 100));
              return (
                <div key={territory.name} className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">{territory.name}</span>
                    <span className="font-bold text-slate-900">
                      {formatCurrency(territory.value)}
                      <span className={cn('ml-1 text-xs font-normal', territory.delta >= 0 ? 'text-emerald-500' : 'text-rose-500')}>
                        {territory.delta >= 0 ? <TrendingUp className="inline h-3 w-3" /> : <TrendingDown className="inline h-3 w-3" />} {Math.abs(territory.delta)}%
                      </span>
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${width}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="relative overflow-hidden rounded-xl bg-slate-900 p-6 text-white shadow-lg">
          <HelpCircle className="absolute right-4 top-4 h-16 w-16 text-white opacity-10" />
          <h2 className="mb-6 text-lg font-bold text-white">Recent Events</h2>
          <div className="relative z-10 space-y-4">
            {data.events.slice(0, 4).map((event, index) => (
              <div key={event.id} className={cn('flex gap-3 border-l-2 pl-4 py-1', index === 0 ? 'border-blue-500' : 'border-slate-700')}>
                <div className={cn('w-14 text-[10px] font-bold uppercase', index === 0 ? 'text-blue-400' : 'text-slate-500')}>
                  {index === 0 ? '2m ago' : event.timestamp}
                </div>
                <p className="flex-1 text-xs leading-5 text-slate-300">
                  <span className="font-bold text-white">{event.actor}</span> {event.action}
                </p>
              </div>
            ))}
          </div>
          <button className="mt-6 w-full rounded-lg bg-slate-800 py-2 text-xs font-bold text-slate-300 transition-colors hover:bg-slate-700">
            View Audit Log
          </button>
        </div>
      </section>
    </main>
  );
}

function SelectControl({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}): ReactElement {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-[150px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </label>
  );
}

function SparkMetric({
  label,
  value,
  tone,
  sparkline,
}: {
  label: string;
  value: string;
  tone: 'blue' | 'emerald' | 'amber' | 'indigo';
  sparkline: number[];
}): ReactElement {
  const colors = {
    blue: 'bg-blue-50 from-blue-400/20 to-blue-600/40',
    emerald: 'bg-emerald-50 from-emerald-400/20 to-emerald-600/40',
    amber: 'bg-amber-50 from-amber-400/20 to-amber-600/40',
    indigo: 'bg-indigo-50 from-indigo-400/20 to-indigo-600/40',
  }[tone];
  const points = sparkline.length ? sparkline : [10, 20, 16, 32, 24, 40];
  const max = Math.max(...points, 1);
  const polygon = points
    .map((point, index) => `${Math.round((index / Math.max(points.length - 1, 1)) * 100)}% ${Math.round(100 - (point / max) * 85)}%`)
    .join(', ');

  return (
    <div className="flex h-32 flex-col justify-between rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p>
        <h3 className="mt-1 text-2xl font-bold text-slate-900">{value}</h3>
      </div>
      <div className={cn('relative h-8 w-full overflow-hidden rounded', colors.split(' ')[0])}>
        <div
          className={cn('absolute inset-0 bg-gradient-to-r', colors.split(' ').slice(1).join(' '))}
          style={{ clipPath: `polygon(${polygon}, 100% 100%, 0% 100%)` }}
        />
      </div>
    </div>
  );
}

function TableHead({ children, className }: { children: React.ReactNode; className?: string }): ReactElement {
  return (
    <th className={cn('border-b border-slate-100 p-4 text-xs font-semibold uppercase tracking-wider text-slate-500', className)}>
      {children}
    </th>
  );
}

function initials(value: string): string {
  const parts = value.split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? parts[0]?.[1] ?? ''}`.toUpperCase() || 'NX';
}
