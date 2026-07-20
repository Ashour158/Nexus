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
import {
  CRMErrorState,
  CRMMetricGrid,
  CRMModuleShell,
  CRMPageHeader,
  CRMTableShell,
  CRMToolbar,
} from '@/components/ui/crm';
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
  wonAmount: number | null;
  pipelineValue: number | null;
  weightedPipeline: number | null;
  winRatePct: number;
  openDeals: number | null;
  avgWonDealSize?: number | null;
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
  'CLOSED WON': 'bg-success-container text-success',
  'IN PROGRESS': 'bg-primary-container text-primary',
  'PENDING APPROVAL': 'bg-warning-container text-warning',
  'CLOSED LOST': 'bg-error-container text-error',
};

const avatarTones = [
  'bg-primary-container text-primary',
  'bg-tertiary-container text-tertiary',
  'bg-warning-container text-warning',
  'bg-primary-container text-primary',
  'bg-error-container text-error',
];

export default function AnalyticsPage(): ReactElement {
  const [dateRange, setDateRange] = useState('last-30');
  const [team, setTeam] = useState('all');
  const [user, setUser] = useState('all');
  const [search, setSearch] = useState('');
  const { data: usersData } = useUsers();

  const { data, isLoading, error, refetch, isFetching } = useQuery<PerformanceReport>({
    queryKey: ['analytics', 'stitch-performance', { dateRange, team, user }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateRange) params.set('dateRange', dateRange);
      if (team !== 'all') params.set('team', team);
      if (user !== 'all') params.set('user', user);
      const query = params.toString();
      const res = await fetch(`/api/reports/performance${query ? `?${query}` : ''}`);
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

  const maxTerritory = Math.max(...(data?.territory ?? []).map((row) => row.value), 1);

  if (isLoading) {
    return <div className="rounded-xl border border-outline-variant bg-surface p-10 text-center text-sm text-on-surface-variant">Loading analytics...</div>;
  }

  if (error || !data) {
    return (
      <CRMErrorState
        title="Analytics data is not available."
        description="Please check the reporting preview API."
      />
    );
  }

  return (
    <CRMModuleShell>
      <CRMPageHeader
        eyebrow="Analytics"
        icon={TrendingUp}
        title="Detailed Performance Log"
        description={`Showing ${rows.length.toLocaleString()} transactions across ${(data.territory ?? []).length} territories`}
        actions={
          <>
            <button className="hidden items-center gap-2 rounded-lg border border-outline-variant bg-surface px-4 py-2 text-sm font-semibold text-on-surface transition hover:bg-surface-container-low sm:inline-flex">
              <Share2 className="h-4 w-4" />
              Share
            </button>
            <button className="hidden items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition hover:bg-primary/90 sm:inline-flex">
              Export
            </button>
          </>
        }
        metrics={
          // SparkMetric, not CRMMetricCard: these four tiles carry trend
          // sparklines and CRMMetricCard has no sparkline slot. Swapping them
          // for the generic primitive silently dropped the trend data, which is
          // most of the value of an analytics KPI row — consistency is not worth
          // deleting information. This is exactly the "leave it bespoke rather
          // than force a bad fit" case.
          <CRMMetricGrid>
            <SparkMetric label="Won Revenue" value={metricCurrency(data.wonAmount)} tone="blue" sparkline={data.kpis?.revenueSparkline ?? []} />
            <SparkMetric label="Win Rate" value={`${finite(data.winRatePct).toFixed(1)}%`} tone="emerald" sparkline={data.kpis?.conversionSparkline ?? []} />
            <SparkMetric label="Open Pipeline" value={metricCurrency(data.pipelineValue)} tone="amber" sparkline={data.kpis?.activeDealsSparkline ?? []} />
            <SparkMetric label="Weighted Pipeline" value={metricCurrency(data.weightedPipeline)} tone="indigo" sparkline={data.kpis?.avgDealSizeSparkline ?? []} />
          </CRMMetricGrid>
        }
      />
      <CRMToolbar>
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
          <button className="rounded-lg border border-outline-variant bg-surface p-2 text-on-surface-variant transition hover:border-primary/40 hover:text-primary" title="More filters">
            <Filter className="h-5 w-5" />
          </button>
          <button
            className="rounded-lg border border-outline-variant bg-surface p-2 text-on-surface-variant transition hover:border-primary/40 hover:text-primary"
            title="Refresh"
            onClick={() => void refetch()}
          >
            <RefreshCw className={cn('h-5 w-5', isFetching && 'animate-spin')} />
          </button>
        </div>
      </CRMToolbar>

      <CRMTableShell>
        {/* The title/description that used to live here now sits in
            CRMPageHeader above; keeping both rendered the same heading and the
            same transaction count twice on the page. Only the table's own
            controls remain. */}
        <div className="flex flex-col gap-4 border-b border-outline-variant p-6 lg:flex-row lg:items-center lg:justify-end">
          <div className="flex flex-wrap items-center gap-3">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-10 w-full rounded-lg border border-outline-variant bg-surface-container-high pl-9 pr-3 text-sm outline-none focus:border-primary/40 focus:bg-surface focus:ring-2 focus:ring-primary/30 sm:w-64"
                placeholder="Search performance..."
              />
            </label>
            <span className="text-xs font-semibold text-on-surface-variant">Rows per page: 25</span>
            <div className="flex rounded-lg border border-outline-variant">
              <button className="border-r border-outline-variant p-2 hover:bg-surface-container-low" title="Previous">
                <ChevronLeft className="h-4 w-4 text-on-surface-variant" />
              </button>
              <button className="p-2 hover:bg-surface-container-low" title="Next">
                <ChevronRight className="h-4 w-4 text-on-surface-variant" />
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left">
            <thead>
              <tr className="bg-surface-container-low/80">
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Deal Value</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {rows.map((row, index) => (
                <tr key={row.id} className="transition-colors hover:bg-surface-container-low/80">
                  <td className="p-4 text-sm font-medium text-on-surface-variant">{formatDate(row.date)}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className={cn('flex h-8 w-8 items-center justify-center rounded text-xs font-bold', avatarTones[index % avatarTones.length])}>
                        {initials(row.customer)}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-on-surface">{row.customer}</p>
                        <p className="text-xs text-on-surface-variant">{row.customerSubtitle}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-inverse-surface text-[10px] font-bold text-inverse-on-surface">
                        {initials(row.ownerName)}
                      </div>
                      <span className="text-sm text-on-surface-variant">{row.ownerName}</span>
                    </div>
                  </td>
                  <td className="p-4 text-sm font-bold text-on-surface">{formatCurrency(row.dealValue)}</td>
                  <td className="p-4">
                    <span className={cn('rounded px-2 py-1 text-[10px] font-bold uppercase tracking-tight', STATUS_STYLES[row.status])}>
                      {row.status}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <button className="text-on-surface-variant hover:text-primary" title="Actions">
                      <MoreVertical className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-outline-variant bg-surface-container-low p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-medium text-on-surface-variant">Page 1 of 1</p>
          <div className="flex items-center gap-2">
            <button className="rounded border border-outline-variant bg-surface px-3 py-1 text-xs font-bold text-on-surface-variant opacity-50" disabled>
              Previous
            </button>
            <button className="h-6 w-6 rounded bg-primary text-[10px] font-bold text-on-primary">1</button>
            <button className="rounded border border-outline-variant bg-surface px-3 py-1 text-xs font-bold text-on-surface-variant hover:bg-surface-container-low">
              Next
            </button>
          </div>
        </div>
      </CRMTableShell>

      <section className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="rounded-xl border border-outline-variant bg-surface p-6 shadow-sm lg:col-span-2">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-bold text-on-surface">Revenue by Territory</h2>
            <span className="text-xs font-bold text-primary">View Map</span>
          </div>
          <div className="space-y-5">
            {(data.territory ?? []).map((territory) => {
              const width = Math.max(8, Math.round((territory.value / maxTerritory) * 100));
              return (
                <div key={territory.name} className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-on-surface-variant">{territory.name}</span>
                    <span className="font-bold text-on-surface">
                      {formatCurrency(territory.value)}
                      <span className={cn('ml-1 text-xs font-normal', territory.delta >= 0 ? 'text-success' : 'text-error')}>
                        {territory.delta >= 0 ? <TrendingUp className="inline h-3 w-3" /> : <TrendingDown className="inline h-3 w-3" />} {Math.abs(territory.delta)}%
                      </span>
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container-high">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="relative overflow-hidden rounded-xl bg-inverse-surface p-6 text-inverse-on-surface shadow-lg">
          <HelpCircle className="absolute right-4 top-4 h-16 w-16 text-inverse-on-surface opacity-10" />
          <h2 className="mb-6 text-lg font-bold text-inverse-on-surface">Recent Events</h2>
          <div className="relative z-10 space-y-4">
            {(data.events ?? []).slice(0, 4).map((event, index) => (
              <div key={event.id} className={cn('flex gap-3 border-l-2 pl-4 py-1', index === 0 ? 'border-primary' : 'border-outline-variant')}>
                <div className={cn('w-14 text-[10px] font-bold uppercase', index === 0 ? 'text-primary' : 'text-on-surface-variant')}>
                  {index === 0 ? '2m ago' : event.timestamp}
                </div>
                <p className="flex-1 text-xs leading-5 text-outline">
                  <span className="font-bold text-inverse-on-surface">{event.actor}</span> {event.action}
                </p>
              </div>
            ))}
          </div>
          <button className="mt-6 w-full rounded-lg bg-surface-container-highest py-2 text-xs font-bold text-outline transition-colors hover:bg-surface-container-high">
            View Audit Log
          </button>
        </div>
      </section>
    </CRMModuleShell>
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
      <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-[150px] rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
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
    blue: 'bg-primary-container from-primary/20 to-primary/40',
    emerald: 'bg-success-container from-success/20 to-success/40',
    amber: 'bg-warning-container from-warning/20 to-warning/40',
    indigo: 'bg-primary-container from-primary/20 to-primary/40',
  }[tone];
  const points = sparkline.length ? sparkline : [10, 20, 16, 32, 24, 40];
  const max = Math.max(...points, 1);
  const polygon = points
    .map((point, index) => `${Math.round((index / Math.max(points.length - 1, 1)) * 100)}% ${Math.round(100 - (point / max) * 85)}%`)
    .join(', ');

  return (
    <div className="flex h-32 flex-col justify-between rounded-xl border border-outline-variant bg-surface p-6 shadow-sm">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">{label}</p>
        <h3 className="mt-1 text-2xl font-bold text-on-surface">{value}</h3>
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
    <th className={cn('border-b border-outline-variant p-4 text-xs font-semibold uppercase tracking-wider text-on-surface-variant', className)}>
      {children}
    </th>
  );
}

function initials(value: string): string {
  const parts = value.split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? parts[0]?.[1] ?? ''}`.toUpperCase() || 'NX';
}

function finite(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function metricCurrency(value: number | null | undefined): string {
  return value == null ? 'Not available' : formatCurrency(finite(value));
}
