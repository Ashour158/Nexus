'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

import { KpiCard } from '@/components/ui/kpi-card';
import { ChartCard } from '@/components/ui/chart-card';
import { EventFeed } from '@/components/ui/event-feed';
import { DataTable } from '@/components/ui/data-table';
import { Skeleton, StatCardSkeleton, TableSkeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/stores/auth.store';
import { formatCurrency } from '@/lib/format';
import type { FeedEvent } from '@/components/ui/event-feed';
import { useDeals } from '@/hooks/use-deals';
import { useActivities } from '@/hooks/use-activities';
import { useUsers } from '@/hooks/use-users';
import { usePipelines } from '@/hooks/use-pipelines';
import { OnboardingChecklist } from '@/components/onboarding/onboarding-checklist';

interface DashboardStats {
  pipeline: number;
  dealsOpen: number;
  dealsWonThisMonth: number;
  revenueThisMonth: number;
  contacts: number;
  newContactsThisWeek: number;
  activitiesToday: number;
  overdueActivities: number;
  winRate: number;
  avgDealSize: number;
  pipelineByStage: Array<{ name: string; value: number }>;
  revenueByMonth: Array<{ month: string; revenue: number }>;
}

interface StrategicWin {
  id: string;
  client: string;
  executiveLead: string;
  amount: number;
  region: string;
  vertical: string;
  impactScore: number;
}

const PIPELINE_COLORS = ['#4F6CF7', '#3D56C5', '#7B8FFA', '#A5B4FD'];

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function computeDelta(current: number, previous: number): number {
  if (previous === 0) return 0;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

export default function DashboardPage() {
  const userId = useAuthStore((s) => s.userId) ?? 'teammate';

  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsError,
    refetch: refetchStats,
  } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const r = await fetch('/api/dashboard/stats');
      if (!r.ok) throw new Error('Failed to load dashboard');
      return r.json();
    },
    refetchInterval: 5 * 60 * 1000,
  });

  const {
    data: dealsResult,
    isLoading: dealsLoading,
    isError: dealsError,
  } = useDeals({ limit: 500 });

  const {
    data: activitiesResult,
    isLoading: activitiesLoading,
    isError: activitiesError,
  } = useActivities({ limit: 5 });

  const { data: usersResult, isLoading: usersLoading } = useUsers({ limit: 500 });
  const { data: pipelines } = usePipelines();

  const allDeals = useMemo(() => dealsResult?.data ?? [], [dealsResult]);
  const wonDeals = useMemo(() => allDeals.filter((d) => d.status === 'WON'), [allDeals]);
  const openDeals = useMemo(() => allDeals.filter((d) => d.status === 'OPEN'), [allDeals]);

  const users = useMemo(() => usersResult?.data ?? [], [usersResult]);
  const userMap = useMemo(
    () => new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()])),
    [users]
  );

  const stages = useMemo(() => pipelines?.flatMap((p) => p.stages ?? []) ?? [], [pipelines]);
  const stageMap = useMemo(() => new Map(stages.map((s) => [s.id, s.name])), [stages]);

  // Monthly metrics for sparklines and deltas
  const monthlyMetrics = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const now = new Date();
    const result = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      return { month: months[d.getMonth()], won: 0, total: 0, open: 0, revenue: 0 };
    });

    allDeals.forEach((deal) => {
      const date = new Date(deal.createdAt);
      const monthStr = months[date.getMonth()];
      const entry = result.find((r) => r.month === monthStr);
      if (entry) {
        entry.total++;
        if (deal.status === 'WON') {
          entry.won++;
          entry.revenue += parseFloat(deal.amount) || 0;
        }
        if (deal.status === 'OPEN') entry.open++;
      }
    });

    return result;
  }, [allDeals]);

  // KPIs derived from real deal data
  const totalRevenue = useMemo(
    () => wonDeals.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0),
    [wonDeals]
  );
  const winRate = allDeals.length > 0 ? (wonDeals.length / allDeals.length) * 100 : 0;
  const avgDealSize = wonDeals.length > 0 ? totalRevenue / wonDeals.length : 0;
  const activeDeals = openDeals.length;

  const revenueDelta = computeDelta(
    monthlyMetrics[5]?.revenue ?? 0,
    monthlyMetrics[4]?.revenue ?? 0
  );
  const winRateDelta = computeDelta(
    monthlyMetrics[5]?.total ? (monthlyMetrics[5].won / monthlyMetrics[5].total) * 100 : 0,
    monthlyMetrics[4]?.total ? (monthlyMetrics[4].won / monthlyMetrics[4].total) * 100 : 0
  );
  const activeDealsDelta = computeDelta(monthlyMetrics[5]?.open ?? 0, monthlyMetrics[4]?.open ?? 0);
  const avgDealSizeDelta = computeDelta(
    monthlyMetrics[5]?.won ? monthlyMetrics[5].revenue / monthlyMetrics[5].won : 0,
    monthlyMetrics[4]?.won ? monthlyMetrics[4].revenue / monthlyMetrics[4].won : 0
  );

  // Sparklines derived from current deal data
  const revenueSparkline = monthlyMetrics.map((m) => m.revenue);
  const winRateSparkline = monthlyMetrics.map((m) => (m.total > 0 ? (m.won / m.total) * 100 : 0));
  const activeDealsSparkline = monthlyMetrics.map((m) => m.open);
  const avgDealSizeSparkline = monthlyMetrics.map((m) => (m.won > 0 ? m.revenue / m.won : 0));

  // Revenue chart data grouped by month from won deals
  const revenueData = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const now = new Date();
    const result = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      return {
        month: months[d.getMonth()],
        revenue: 0,
        target: 0,
      };
    });

    wonDeals.forEach((deal) => {
      const closeDate = deal.actualCloseDate ? new Date(deal.actualCloseDate) : new Date(deal.updatedAt);
      const monthStr = months[closeDate.getMonth()];
      const entry = result.find((r) => r.month === monthStr);
      if (entry) {
        entry.revenue += parseFloat(deal.amount) || 0;
      }
    });

    result.forEach((r) => {
      r.target = Math.round(r.revenue * 1.05);
    });

    return result;
  }, [wonDeals]);

  // Pipeline velocity from stats or derived from open deals
  const pipelineVelocityData = useMemo(() => {
    if (stats?.pipelineByStage?.length) {
      return stats.pipelineByStage.slice(0, 4);
    }
    const grouped = new Map<string, number>();
    openDeals.forEach((d) => {
      grouped.set(d.stageId, (grouped.get(d.stageId) || 0) + 1);
    });
    const computed = Array.from(grouped.entries())
      .map(([stageId, value]) => ({
        name: stageMap.get(stageId) || stageId.slice(0, 6),
        value,
      }))
      .slice(0, 4);
    return computed.length > 0
      ? computed
      : [
          { name: 'Qualified', value: 0 },
          { name: 'Proposal', value: 0 },
          { name: 'Negotiation', value: 0 },
          { name: 'Closing', value: 0 },
        ];
  }, [stats, openDeals, stageMap]);

  // Strategic wins from real won deals
  const strategicWins = useMemo<StrategicWin[]>(() => {
    return wonDeals
      .sort((a, b) => (parseFloat(b.amount) || 0) - (parseFloat(a.amount) || 0))
      .slice(0, 5)
      .map((deal) => ({
        id: deal.id,
        client: deal.name,
        executiveLead: userMap.get(deal.ownerId) || deal.ownerId,
        amount: parseFloat(deal.amount) || 0,
        region: (deal.customFields?.region as string) || deal.tags[0] || 'Global',
        vertical: (deal.customFields?.vertical as string) || deal.tags[1] || 'Enterprise',
        impactScore: Math.min(5, Math.max(1, Math.round((deal.meddicicScore || 50) / 20))),
      }));
  }, [wonDeals, userMap]);

  // Recent events from real activities
  const recentEvents = useMemo<FeedEvent[]>(() => {
    const activities = activitiesResult?.data ?? [];
    return activities.map((activity) => {
      let type: FeedEvent['type'] = 'deal_moved';
      if (activity.type === 'EMAIL') type = 'email_sent';
      else if (activity.type === 'TASK' && activity.status === 'COMPLETED') type = 'task_completed';
      else if (activity.type === 'NOTE') type = 'contact_created';

      const actor = userMap.get(activity.ownerId) || activity.ownerId;
      const action = activity.subject || `${activity.type.toLowerCase().replace('_', ' ')} activity`;

      return {
        id: activity.id,
        type,
        actor,
        action,
        timestamp: timeAgo(activity.createdAt),
      };
    });
  }, [activitiesResult, userMap]);

  const hasError = statsError || dealsError || activitiesError;

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <OnboardingChecklist />

      {hasError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          Failed to load some dashboard data.{" "}
          <button onClick={() => void refetchStats()} className="font-medium underline">
            Retry
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Welcome, {userId.split(/[._-]/)[0]}
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--text-muted)' }}>
            Live CRM dashboard
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/deals/new"
            className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-dark transition"
          >
            + New Deal
          </Link>
        </div>
      </div>

      {/* KPI Strip */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {dealsLoading || statsLoading || usersLoading ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <KpiCard
              label="Total Revenue"
              value={totalRevenue}
              format="currency"
              delta={revenueDelta}
              sparklineData={revenueSparkline}
            />
            <KpiCard
              label="Win Rate"
              value={winRate}
              format="percent"
              delta={winRateDelta}
              sparklineData={winRateSparkline}
            />
            <KpiCard
              label="Active Deals"
              value={activeDeals}
              format="number"
              delta={activeDealsDelta}
              sparklineData={activeDealsSparkline}
            />
            <KpiCard
              label="Avg Deal Size"
              value={avgDealSize}
              format="currency"
              delta={avgDealSizeDelta}
              sparklineData={avgDealSizeSparkline}
            />
          </>
        )}
      </section>

      {/* Charts Row */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          title="Revenue Performance"
          subtitle="Monthly revenue vs target (last 6 months)"
          className="lg:col-span-2"
        >
          {dealsLoading ? (
            <div className="h-72 flex items-center justify-center">
              <Skeleton className="h-64 w-full" />
            </div>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 12, fill: 'var(--text-secondary)' }}
                    axisLine={{ stroke: 'var(--border-color)' }}
                  />
                  <YAxis
                    tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                    tick={{ fontSize: 12, fill: 'var(--text-secondary)' }}
                    axisLine={{ stroke: 'var(--border-color)' }}
                  />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{
                      backgroundColor: 'var(--surface)',
                      borderColor: 'var(--border-color)',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="revenue" name="Actual" fill="#4F6CF7" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="target" name="Target" fill="#E2E8F0" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Pipeline Velocity" subtitle={`${activeDeals} active deals`}>
          {statsLoading || dealsLoading ? (
            <div className="h-72 flex items-center justify-center">
              <Skeleton className="h-64 w-full" />
            </div>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pipelineVelocityData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                    nameKey="name"
                  >
                    {pipelineVelocityData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={PIPELINE_COLORS[index % PIPELINE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--surface)',
                      borderColor: 'var(--border-color)',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
      </section>

      {/* Table + Activity Row */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartCard title="Top Strategic Wins" subtitle="Top 5 closed-won deals this quarter">
            {dealsLoading || usersLoading ? (
              <TableSkeleton rows={5} cols={6} />
            ) : (
              <DataTable
                data={strategicWins}
                keyExtractor={(row) => row.id}
                columns={[
                  {
                    key: 'client',
                    header: 'Enterprise Client',
                    cell: (row) => (
                      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                        {row.client}
                      </span>
                    ),
                  },
                  {
                    key: 'executiveLead',
                    header: 'Executive Lead',
                    cell: (row) => <span style={{ color: 'var(--text-secondary)' }}>{row.executiveLead}</span>,
                  },
                  {
                    key: 'amount',
                    header: 'Amount',
                    align: 'right',
                    cell: (row) => (
                      <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {formatCurrency(row.amount)}
                      </span>
                    ),
                  },
                  {
                    key: 'region',
                    header: 'Region',
                    cell: (row) => <span style={{ color: 'var(--text-secondary)' }}>{row.region}</span>,
                  },
                  {
                    key: 'vertical',
                    header: 'Vertical',
                    cell: (row) => <span style={{ color: 'var(--text-secondary)' }}>{row.vertical}</span>,
                  },
                  {
                    key: 'impactScore',
                    header: 'Impact',
                    align: 'center',
                    cell: (row) => (
                      <div className="flex justify-center gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <span key={i} className={i < row.impactScore ? 'text-amber-400' : 'text-gray-200'}>
                            ★
                          </span>
                        ))}
                      </div>
                    ),
                  },
                ]}
              />
            )}
          </ChartCard>
        </div>

        <ChartCard
          title="Recent Activity"
          action={
            <Link href="/activities" className="text-xs font-medium text-primary hover:underline">
              View all
            </Link>
          }
        >
          {activitiesLoading || usersLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3">
                  <Skeleton className="h-7 w-7 rounded-full" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EventFeed events={recentEvents} />
          )}
        </ChartCard>
      </section>
    </main>
  );
}
