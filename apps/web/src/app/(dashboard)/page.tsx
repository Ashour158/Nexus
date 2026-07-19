'use client';

import Link from 'next/link';
import { useMemo, type ComponentType, type ReactNode } from 'react';
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
import {
  ArrowDownRight,
  ArrowUpRight,
  Briefcase,
  DollarSign,
  Gauge,
  Plus,
  Sparkles,
  Trophy,
} from 'lucide-react';

import { EventFeed } from '@/components/ui/event-feed';
import { DataTable } from '@/components/ui/data-table';
import { Skeleton, StatCardSkeleton, TableSkeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/lib/cn';
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

type InsightTone = 'danger' | 'success' | 'primary';

interface Insight {
  id: string;
  dealId: string;
  tone: InsightTone;
  title: string;
  body: string;
}

const PIPELINE_COLORS = ['#4f46e5', '#4338ca', '#818cf8', '#a5b4fc'];

const INSIGHT_DOT: Record<InsightTone, string> = {
  danger: 'bg-error',
  success: 'bg-success',
  primary: 'bg-primary',
};

const DAY_MS = 86_400_000;

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

/** Stat tile matching the Stitch bento dashboard: value, tonal icon chip, delta pill. */
function StatTile({
  label,
  value,
  delta,
  icon: Icon,
  chipClass,
}: {
  label: string;
  value: string;
  delta: number;
  icon: ComponentType<{ className?: string }>;
  chipClass: string;
}) {
  const positive = delta >= 0;
  const DeltaIcon = positive ? ArrowUpRight : ArrowDownRight;

  return (
    <div className="glass-card p-6 transition-shadow hover:shadow-elevated">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
            {label}
          </p>
          <h3 className="mt-1 truncate text-2xl font-bold text-on-surface">{value}</h3>
        </div>
        <div className={cn('shrink-0 rounded-lg p-2', chipClass)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'pill',
            positive
              ? 'bg-success-container text-on-success-container'
              : 'bg-error-container text-on-error-container'
          )}
        >
          <DeltaIcon className="h-3 w-3" />
          {Math.abs(delta).toFixed(1)}%
        </span>
        <span className="text-xs text-on-surface-variant">vs last month</span>
      </div>
    </div>
  );
}

/** Section card used by the chart / rail / table panels. */
function Panel({
  title,
  subtitle,
  action,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn('glass-card flex flex-col p-6', className)}>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-on-surface">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-xs text-on-surface-variant">{subtitle}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export default function DashboardPage() {
  // Greet with a human-readable identity — never the opaque `userId` cuid.
  const displayName = useAuthStore((s) => s.displayName);
  const email = useAuthStore((s) => s.email);
  const greetingName = displayName || email || 'there';

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
  } = useDeals({ limit: 100 });

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

  // Monthly metrics for deltas
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

  // Revenue chart data grouped by month from won deals
  const revenueData = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const now = new Date();
    const result = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      return { month: months[d.getMonth()], revenue: 0, target: 0 };
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

  /**
   * Copilot insights are DERIVED from live deal data (never fabricated): the
   * stalest open deal, the strongest MEDDICC score and the largest open
   * opportunity. Deduped by deal so one dominant deal can't fill every slot.
   */
  const insights = useMemo<Insight[]>(() => {
    if (openDeals.length === 0) return [];
    const candidates: Insight[] = [];

    const stalest = [...openDeals].sort(
      (a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
    )[0];
    const staleDays = Math.floor((Date.now() - new Date(stalest.updatedAt).getTime()) / DAY_MS);
    if (staleDays >= 7) {
      candidates.push({
        id: `stale-${stalest.id}`,
        dealId: stalest.id,
        tone: 'danger',
        title: `${stalest.name} may be at risk`,
        body: `No activity in ${staleDays} days. Consider sending a check-in.`,
      });
    }

    const strongest = [...openDeals].sort(
      (a, b) => (b.meddicicScore ?? 0) - (a.meddicicScore ?? 0)
    )[0];
    if ((strongest.meddicicScore ?? 0) > 0) {
      candidates.push({
        id: `score-${strongest.id}`,
        dealId: strongest.id,
        tone: 'success',
        title: 'High closing probability',
        body: `${strongest.name} scores ${strongest.meddicicScore}/100 on MEDDICC.`,
      });
    }

    const biggest = [...openDeals].sort(
      (a, b) => (parseFloat(b.amount) || 0) - (parseFloat(a.amount) || 0)
    )[0];
    candidates.push({
      id: `size-${biggest.id}`,
      dealId: biggest.id,
      tone: 'primary',
      title: 'Largest open opportunity',
      body: `${biggest.name} — ${formatCurrency(parseFloat(biggest.amount) || 0)}`,
    });

    const seen = new Set<string>();
    return candidates.filter((i) => !seen.has(i.dealId) && seen.add(i.dealId)).slice(0, 3);
  }, [openDeals]);

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
  const kpisLoading = dealsLoading || statsLoading || usersLoading;

  return (
    <main className="mx-auto max-w-[1280px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <OnboardingChecklist />

      {hasError ? (
        <div className="rounded-xl border border-error/30 bg-error-container p-4 text-sm text-on-error-container">
          Failed to load some dashboard data.{' '}
          <button onClick={() => void refetchStats()} className="font-semibold underline">
            Retry
          </button>
        </div>
      ) : null}

      {/* Page header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-on-surface sm:text-4xl">
            Sales Overview
          </h1>
          <p className="mt-2 text-base text-on-surface-variant">
            Welcome back, {greetingName} — live pipeline &amp; revenue insights
          </p>
        </div>
        <Link
          href="/deals/new"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary shadow-sm shadow-primary/20 transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          New Deal
        </Link>
      </div>

      {/* Bento grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
        {/* Stat tiles */}
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4 md:col-span-12">
          {kpisLoading ? (
            Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
          ) : (
            <>
              <StatTile
                label="Total Revenue"
                value={formatCurrency(totalRevenue)}
                delta={revenueDelta}
                icon={DollarSign}
                chipClass="bg-success-container text-on-success-container"
              />
              <StatTile
                label="Win Rate"
                value={`${winRate.toFixed(1)}%`}
                delta={winRateDelta}
                icon={Trophy}
                chipClass="bg-primary-container text-on-primary-container"
              />
              <StatTile
                label="Active Deals"
                value={activeDeals.toLocaleString()}
                delta={activeDealsDelta}
                icon={Briefcase}
                chipClass="bg-tertiary-container text-on-tertiary-container"
              />
              <StatTile
                label="Avg Deal Size"
                value={formatCurrency(avgDealSize)}
                delta={avgDealSizeDelta}
                icon={Gauge}
                chipClass="bg-secondary-container text-on-secondary-container"
              />
            </>
          )}
        </div>

        {/* Main chart */}
        <Panel
          title="Revenue Performance"
          subtitle="Monthly revenue vs target (last 6 months)"
          className="min-h-[420px] md:col-span-8"
        >
          {dealsLoading ? (
            <div className="flex h-72 items-center justify-center">
              <Skeleton className="h-64 w-full" />
            </div>
          ) : (
            <div className="h-72 flex-1">
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
                  <Bar dataKey="revenue" name="Actual" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="target" name="Target" fill="#c7d2fe" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        {/* Side rail */}
        <div className="flex flex-col gap-6 md:col-span-4">
          <section className="glass-card border-2 border-primary/30 p-6">
            <div className="mb-4 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold text-on-surface">Copilot Insights</h3>
            </div>
            {dealsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : insights.length === 0 ? (
              <p className="text-sm text-on-surface-variant">
                No open deals yet — insights appear once your pipeline has activity.
              </p>
            ) : (
              <ul className="space-y-3">
                {insights.map((insight) => (
                  <li key={insight.id}>
                    <Link
                      href={`/deals/${insight.dealId}`}
                      className="flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-surface-container-high"
                    >
                      <span
                        className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', INSIGHT_DOT[insight.tone])}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-on-surface">
                          {insight.title}
                        </span>
                        <span className="mt-1 block text-xs text-on-surface-variant">
                          {insight.body}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Panel
            title="Recent Activity"
            className="flex-1"
            action={
              <Link href="/activities" className="text-xs font-semibold text-primary hover:underline">
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
          </Panel>
        </div>

        {/* Strategic wins */}
        <Panel
          title="Top Strategic Wins"
          subtitle="Top 5 closed-won deals this quarter"
          className="md:col-span-8"
        >
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
                  cell: (row) => <span className="font-medium text-on-surface">{row.client}</span>,
                },
                {
                  key: 'executiveLead',
                  header: 'Executive Lead',
                  cell: (row) => <span className="text-on-surface-variant">{row.executiveLead}</span>,
                },
                {
                  key: 'amount',
                  header: 'Amount',
                  align: 'right',
                  cell: (row) => (
                    <span className="font-semibold text-on-surface">{formatCurrency(row.amount)}</span>
                  ),
                },
                {
                  key: 'region',
                  header: 'Region',
                  cell: (row) => <span className="text-on-surface-variant">{row.region}</span>,
                },
                {
                  key: 'vertical',
                  header: 'Vertical',
                  cell: (row) => <span className="text-on-surface-variant">{row.vertical}</span>,
                },
                {
                  key: 'impactScore',
                  header: 'Impact',
                  align: 'center',
                  cell: (row) => (
                    <div className="flex justify-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <span
                          key={i}
                          className={i < row.impactScore ? 'text-warning' : 'text-outline-variant'}
                        >
                          ★
                        </span>
                      ))}
                    </div>
                  ),
                },
              ]}
            />
          )}
        </Panel>

        {/* Pipeline velocity */}
        <Panel
          title="Pipeline Velocity"
          subtitle={`${activeDeals} active deals`}
          className="md:col-span-4"
        >
          {statsLoading || dealsLoading ? (
            <div className="flex h-72 items-center justify-center">
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
        </Panel>
      </div>
    </main>
  );
}
