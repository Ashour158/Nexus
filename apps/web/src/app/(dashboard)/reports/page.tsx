'use client';

import { useMemo, useState, type ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BarChart3,
  Download,
  FileBarChart,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  Search,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  CRMCard,
  CRMEmptyState,
  CRMMetricCard,
  CRMMetricGrid,
  CRMModuleShell,
  CRMPageHeader,
  CRMSidePanel,
  CRMStatusBadge,
  CRMTableShell,
} from '@/components/ui/crm';
import { formatCurrency, formatDate } from '@/lib/format';

type DealStatus = 'CLOSED WON' | 'IN PROGRESS' | 'PENDING APPROVAL' | 'CLOSED LOST';
type ChartType = 'bar' | 'line' | 'pie';

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

export default function ReportsPage(): ReactElement {
  const [template, setTemplate] = useState('sales-region');
  const [dateRange, setDateRange] = useState('2026-01-01');
  const [team, setTeam] = useState('all');
  const [user, setUser] = useState('all');
  const [stage, setStage] = useState('all');
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [search, setSearch] = useState('');

  const accessToken = useAuthStore((s) => s.accessToken);

  const { data: reportData, isLoading, error } = useQuery({
    queryKey: ['reports', 'performance', { template, dateRange, team, user, stage }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (template) params.set('template', template);
      if (dateRange) params.set('dateFrom', dateRange);
      if (team !== 'all') params.set('team', team);
      if (user !== 'all') params.set('user', user);
      if (stage !== 'all') params.set('stage', stage);
      const query = params.toString();
      const res = await fetch(`/api/reports/performance${query ? `?${query}` : ''}`, {
        headers: { Authorization: `Bearer ${accessToken ?? ''}` },
      });
      if (!res.ok) throw new Error('Reports data not yet available');
      return res.json();
    },
    retry: false,
    enabled: !!accessToken,
  });

  const performanceData = useMemo<PerformanceRow[]>(() => reportData?.performance ?? [], [reportData]);
  const territoryData = useMemo<TerritoryRow[]>(() => reportData?.territory ?? [], [reportData]);

  const filteredRows = useMemo(() => {
    const q = search.toLowerCase().trim();
    return performanceData.filter((row) => {
      const matchesSearch =
        !q ||
        row.customer.toLowerCase().includes(q) ||
        row.ownerName.toLowerCase().includes(q) ||
        row.status.toLowerCase().includes(q);
      const matchesStage = stage === 'all' || row.status === stage;
      return matchesSearch && matchesStage;
    });
  }, [performanceData, search, stage]);

  const totalSales = filteredRows
    .filter((row) => row.status === 'CLOSED WON')
    .reduce((sum, row) => sum + row.dealValue, 0);
  const closedDeals = filteredRows.filter((row) => row.status === 'CLOSED WON').length;
  const averageDealSize = filteredRows.length
    ? filteredRows.reduce((sum, row) => sum + row.dealValue, 0) / filteredRows.length
    : 0;

  const salesOverTime = useMemo(
    () =>
      filteredRows.map((row) => ({
        name: row.customer.split(' ')[0],
        value: row.dealValue,
      })),
    [filteredRows]
  );

  if (isLoading) {
    return <div className="rounded-xl border border-outline-variant bg-surface p-10 text-center text-sm text-on-surface-variant">Loading sales performance report...</div>;
  }

  if (error || performanceData.length === 0) {
    return (
      <CRMEmptyState
        icon={BarChart3}
        title="Reports data not yet available"
        description="The reporting service is not configured or returned no data."
      />
    );
  }

  return (
    <CRMModuleShell
      sidebar={
      <CRMSidePanel title="Create Report" description="Report builder" className="xl:sticky xl:top-24">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-container text-primary">
            <FileBarChart className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase text-primary">Report builder</p>
          </div>
        </div>

        <div className="mt-6 space-y-5">
          <Field label="Report Template">
            <select value={template} onChange={(event) => setTemplate(event.target.value)} className="h-12 w-full rounded-lg border border-outline-variant bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30">
              <option value="sales-region">Sales by Region</option>
              <option value="lead-conversion">Lead Conversion Rate</option>
              <option value="team-performance">Team Performance</option>
            </select>
          </Field>

          <Field label="Date Range">
            <input type="date" value={dateRange} onChange={(event) => setDateRange(event.target.value)} className="h-12 w-full rounded-lg border border-outline-variant bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" />
          </Field>

          <div>
            <p className="pb-2 text-sm font-semibold text-on-surface">Filter Options</p>
            <div className="space-y-2">
              <select value={user} onChange={(event) => setUser(event.target.value)} className="h-12 w-full rounded-lg border border-outline-variant bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30">
                <option value="all">All Users</option>
                <option value="dev-admin">Dev Admin</option>
                <option value="sara-manager">Sara Manager</option>
              </select>
              <select value={team} onChange={(event) => setTeam(event.target.value)} className="h-12 w-full rounded-lg border border-outline-variant bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30">
                <option value="all">All Teams</option>
                <option value="enterprise">Enterprise Team</option>
                <option value="smb">SMB Team</option>
              </select>
              <select value={stage} onChange={(event) => setStage(event.target.value)} className="h-12 w-full rounded-lg border border-outline-variant bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30">
                <option value="all">All Deal Stages</option>
                <option value="CLOSED WON">Closed Won</option>
                <option value="IN PROGRESS">In Progress</option>
                <option value="CLOSED LOST">Closed Lost</option>
              </select>
            </div>
          </div>

          <div>
            <p className="pb-2 text-sm font-semibold text-on-surface">Chart Type</p>
            <div className="grid grid-cols-3 gap-2">
              <ChartButton active={chartType === 'bar'} icon={<BarChart3 className="h-4 w-4" />} label="Bar" onClick={() => setChartType('bar')} />
              <ChartButton active={chartType === 'line'} icon={<LineChartIcon className="h-4 w-4" />} label="Line" onClick={() => setChartType('line')} />
              <ChartButton active={chartType === 'pie'} icon={<PieChartIcon className="h-4 w-4" />} label="Pie" onClick={() => setChartType('pie')} />
            </div>
          </div>
        </div>

        <button className="mt-8 h-12 w-full rounded-lg bg-primary px-4 text-base font-bold text-on-primary shadow-sm hover:bg-primary/90">
          Generate Report
        </button>
      </CRMSidePanel>
      }
    >
        <CRMPageHeader
          eyebrow="Sales performance"
          icon={FileBarChart}
          title="Q3 Sales Performance for the West Coast Team"
          description={`Generated on ${formatDate(new Date().toISOString())}`}
          actions={
            <>
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search deals..."
                className="h-10 w-full rounded-lg border border-outline-variant bg-surface-container-high pl-9 pr-3 text-sm outline-none focus:border-primary/40 focus:bg-surface focus:ring-2 focus:ring-primary/30 sm:w-64"
              />
            </label>
            <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-outline-variant bg-surface px-4 text-sm font-bold text-on-surface hover:bg-surface-container-low">
              <Download className="h-4 w-4" />
              Export
            </button>
            </>
          }
          metrics={
            <CRMMetricGrid>
              <CRMMetricCard icon={TrendingUp} label="Total Sales" value={formatCurrency(totalSales)} note="12.5% vs last quarter" tone="emerald" />
              <CRMMetricCard icon={TrendingDown} label="Average Deal Size" value={formatCurrency(averageDealSize)} note="-2.1% vs last quarter" tone="rose" />
              <CRMMetricCard icon={BarChart3} label="Closed Deals" value={closedDeals} note="8 more than last quarter" tone="blue" />
            </CRMMetricGrid>
          }
        />

        <CRMCard>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-on-surface">Sales Over Time</h3>
              <p className="text-sm text-on-surface-variant">Generated from current report filters.</p>
            </div>
            <span className="rounded-lg bg-primary-container px-3 py-1 text-xs font-bold uppercase text-primary">{chartType} chart</span>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'line' ? (
                <LineChart data={salesOverTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(value: number) => `$${(value / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Line type="monotone" dataKey="value" stroke="var(--color-primary)" strokeWidth={3} dot={{ r: 4 }} />
                </LineChart>
              ) : chartType === 'pie' ? (
                <PieChart>
                  <Pie data={territoryData} dataKey="value" nameKey="name" innerRadius={70} outerRadius={110} paddingAngle={4}>
                    {territoryData.map((_, index) => (
                      <Cell key={index} fill={['var(--color-primary)', 'var(--color-success)', 'var(--color-warning)'][index % 3]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                </PieChart>
              ) : (
                <BarChart data={salesOverTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(value: number) => `$${(value / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                    {salesOverTime.map((_, index) => (
                      <Cell key={index} fill={['var(--color-primary)', 'var(--color-success)', 'var(--color-warning)'][index % 3]} />
                    ))}
                  </Bar>
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </CRMCard>

        <CRMTableShell>
          <div className="border-b border-outline-variant p-5">
            <h3 className="text-lg font-bold text-on-surface">Deals Data</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-surface-container-low text-xs uppercase text-on-surface-variant">
                <tr>
                  <th className="px-6 py-3 font-semibold">Deal Name</th>
                  <th className="px-6 py-3 font-semibold">Amount</th>
                  <th className="px-6 py-3 font-semibold">Close Date</th>
                  <th className="px-6 py-3 font-semibold">Sales Rep</th>
                  <th className="px-6 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {filteredRows.map((row) => (
                  <tr key={row.id} className="hover:bg-surface-container-low">
                    <th className="whitespace-nowrap px-6 py-4 font-semibold text-on-surface">{row.customer}</th>
                    <td className="px-6 py-4 text-on-surface-variant">{formatCurrency(row.dealValue)}</td>
                    <td className="px-6 py-4 text-on-surface-variant">{formatDate(row.date)}</td>
                    <td className="px-6 py-4 text-on-surface-variant">{row.ownerName}</td>
                    <td className="px-6 py-4"><StatusPill status={row.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CRMTableShell>
    </CRMModuleShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }): ReactElement {
  return (
    <label className="flex flex-col">
      <span className="pb-2 text-sm font-semibold text-on-surface">{label}</span>
      {children}
    </label>
  );
}

function ChartButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-bold ${
        active ? 'bg-primary-container text-primary' : 'text-on-surface-variant hover:bg-surface-container-high'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function StatusPill({ status }: { status: DealStatus }): ReactElement {
  const tone =
    status === 'CLOSED WON'
      ? 'emerald'
      : status === 'CLOSED LOST'
        ? 'rose'
        : status === 'IN PROGRESS'
          ? 'amber'
          : 'blue';

  return <CRMStatusBadge tone={tone}>{status}</CRMStatusBadge>;
}
