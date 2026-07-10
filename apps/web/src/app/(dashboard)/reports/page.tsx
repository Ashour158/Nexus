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
import { EmptyState } from '@/components/dashboard/EmptyState';
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
    return <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Loading sales performance report...</div>;
  }

  if (error || performanceData.length === 0) {
    return (
      <EmptyState
        icon={<BarChart3 className="h-5 w-5" />}
        title="Reports data not yet available"
        description="The reporting service is not configured or returned no data."
      />
    );
  }

  return (
    <div className="grid min-h-[calc(100vh-8rem)] gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="rounded-xl border border-[#e7edf3] bg-white p-5 shadow-sm xl:sticky xl:top-24 xl:self-start">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-indigo-50 text-[#4f46e5]">
            <FileBarChart className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase text-[#4f46e5]">Report builder</p>
            <h2 className="text-xl font-bold tracking-tight text-slate-950">Create Report</h2>
          </div>
        </div>

        <div className="mt-6 space-y-5">
          <Field label="Report Template">
            <select value={template} onChange={(event) => setTemplate(event.target.value)} className="h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#4f46e5] focus:ring-2 focus:ring-indigo-100">
              <option value="sales-region">Sales by Region</option>
              <option value="lead-conversion">Lead Conversion Rate</option>
              <option value="team-performance">Team Performance</option>
            </select>
          </Field>

          <Field label="Date Range">
            <input type="date" value={dateRange} onChange={(event) => setDateRange(event.target.value)} className="h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#4f46e5] focus:ring-2 focus:ring-indigo-100" />
          </Field>

          <div>
            <p className="pb-2 text-sm font-semibold text-slate-800">Filter Options</p>
            <div className="space-y-2">
              <select value={user} onChange={(event) => setUser(event.target.value)} className="h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#4f46e5] focus:ring-2 focus:ring-indigo-100">
                <option value="all">All Users</option>
                <option value="dev-admin">Dev Admin</option>
                <option value="sara-manager">Sara Manager</option>
              </select>
              <select value={team} onChange={(event) => setTeam(event.target.value)} className="h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#4f46e5] focus:ring-2 focus:ring-indigo-100">
                <option value="all">All Teams</option>
                <option value="enterprise">Enterprise Team</option>
                <option value="smb">SMB Team</option>
              </select>
              <select value={stage} onChange={(event) => setStage(event.target.value)} className="h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#4f46e5] focus:ring-2 focus:ring-indigo-100">
                <option value="all">All Deal Stages</option>
                <option value="CLOSED WON">Closed Won</option>
                <option value="IN PROGRESS">In Progress</option>
                <option value="CLOSED LOST">Closed Lost</option>
              </select>
            </div>
          </div>

          <div>
            <p className="pb-2 text-sm font-semibold text-slate-800">Chart Type</p>
            <div className="grid grid-cols-3 gap-2">
              <ChartButton active={chartType === 'bar'} icon={<BarChart3 className="h-4 w-4" />} label="Bar" onClick={() => setChartType('bar')} />
              <ChartButton active={chartType === 'line'} icon={<LineChartIcon className="h-4 w-4" />} label="Line" onClick={() => setChartType('line')} />
              <ChartButton active={chartType === 'pie'} icon={<PieChartIcon className="h-4 w-4" />} label="Pie" onClick={() => setChartType('pie')} />
            </div>
          </div>
        </div>

        <button className="mt-8 h-12 w-full rounded-lg bg-[#4f46e5] px-4 text-base font-bold text-white shadow-sm hover:bg-indigo-700">
          Generate Report
        </button>
      </aside>

      <main className="min-w-0 space-y-6">
        <div className="flex flex-col gap-4 rounded-xl border border-[#e7edf3] bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase text-[#4f46e5]">Sales performance</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">
              Q3 Sales Performance for the West Coast Team
            </h1>
            <p className="mt-1 text-sm text-slate-500">Generated on {formatDate(new Date().toISOString())}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search deals..."
                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-100 pl-9 pr-3 text-sm outline-none focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100 sm:w-64"
              />
            </label>
            <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-50">
              <Download className="h-4 w-4" />
              Export
            </button>
          </div>
        </div>

        <section className="grid gap-4 md:grid-cols-3">
          <Kpi label="Total Sales" value={formatCurrency(totalSales)} trend="up" note="12.5% vs last quarter" />
          <Kpi label="Average Deal Size" value={formatCurrency(averageDealSize)} trend="down" note="-2.1% vs last quarter" />
          <Kpi label="Closed Deals" value={String(closedDeals)} trend="up" note="8 more than last quarter" />
        </section>

        <section className="rounded-xl border border-[#e7edf3] bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-slate-950">Sales Over Time</h3>
              <p className="text-sm text-slate-500">Generated from current report filters.</p>
            </div>
            <span className="rounded-lg bg-indigo-50 px-3 py-1 text-xs font-bold uppercase text-[#4f46e5]">{chartType} chart</span>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'line' ? (
                <LineChart data={salesOverTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} />
                  <YAxis tickFormatter={(value: number) => `$${(value / 1000).toFixed(0)}k`} tick={{ fontSize: 12, fill: '#64748b' }} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Line type="monotone" dataKey="value" stroke="#4f46e5" strokeWidth={3} dot={{ r: 4 }} />
                </LineChart>
              ) : chartType === 'pie' ? (
                <PieChart>
                  <Pie data={territoryData} dataKey="value" nameKey="name" innerRadius={70} outerRadius={110} paddingAngle={4}>
                    {territoryData.map((_, index) => (
                      <Cell key={index} fill={['#4f46e5', '#7ED321', '#F5A623', '#9013FE'][index % 4]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                </PieChart>
              ) : (
                <BarChart data={salesOverTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} />
                  <YAxis tickFormatter={(value: number) => `$${(value / 1000).toFixed(0)}k`} tick={{ fontSize: 12, fill: '#64748b' }} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                    {salesOverTime.map((_, index) => (
                      <Cell key={index} fill={['#4f46e5', '#4A90E2', '#7ED321', '#F5A623', '#9013FE'][index % 5]} />
                    ))}
                  </Bar>
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-[#e7edf3] bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5">
            <h3 className="text-lg font-bold text-slate-950">Deals Data</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-semibold">Deal Name</th>
                  <th className="px-6 py-3 font-semibold">Amount</th>
                  <th className="px-6 py-3 font-semibold">Close Date</th>
                  <th className="px-6 py-3 font-semibold">Sales Rep</th>
                  <th className="px-6 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <th className="whitespace-nowrap px-6 py-4 font-semibold text-slate-950">{row.customer}</th>
                    <td className="px-6 py-4 text-slate-600">{formatCurrency(row.dealValue)}</td>
                    <td className="px-6 py-4 text-slate-600">{formatDate(row.date)}</td>
                    <td className="px-6 py-4 text-slate-600">{row.ownerName}</td>
                    <td className="px-6 py-4"><StatusPill status={row.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }): ReactElement {
  return (
    <label className="flex flex-col">
      <span className="pb-2 text-sm font-semibold text-slate-800">{label}</span>
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
        active ? 'bg-indigo-50 text-[#4f46e5]' : 'text-slate-500 hover:bg-slate-100'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function Kpi({ label, value, trend, note }: { label: string; value: string; trend: 'up' | 'down'; note: string }): ReactElement {
  const positive = trend === 'up';
  return (
    <div className="rounded-xl border border-[#e7edf3] bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-950">{value}</p>
      <p className={`mt-2 flex items-center gap-1 text-sm font-semibold ${positive ? 'text-emerald-600' : 'text-red-500'}`}>
        {positive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
        {note}
      </p>
    </div>
  );
}

function StatusPill({ status }: { status: DealStatus }): ReactElement {
  const className =
    status === 'CLOSED WON'
      ? 'bg-green-100 text-green-800'
      : status === 'CLOSED LOST'
        ? 'bg-red-100 text-red-800'
        : status === 'IN PROGRESS'
          ? 'bg-orange-100 text-orange-800'
          : 'bg-indigo-100 text-indigo-800';

  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${className}`}>{status}</span>;
}
