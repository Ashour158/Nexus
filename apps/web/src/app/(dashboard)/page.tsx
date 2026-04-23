'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatDate, parseDecimal } from '@/lib/format';
import { useAuthStore } from '@/stores/auth.store';
import { useActivities, useCompleteActivity } from '@/hooks/use-activities';
import { useDeals } from '@/hooks/use-deals';
import { usePipelines, useStages } from '@/hooks/use-pipelines';

const QUOTA_TARGET = 500_000;

export default function DashboardPage(): JSX.Element {
  const userId = useAuthStore((s) => s.userId);
  const openDealsQuery = useDeals({ status: 'OPEN', limit: 500 });
  const wonDealsQuery = useDeals({ status: 'WON', limit: 500 });
  const recentActivitiesQuery = useActivities({ limit: 10 });
  const myTasksQuery = useActivities({
    ownerId: userId ?? undefined,
    status: 'PLANNED',
    limit: 5,
    dueBefore: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
  const completeActivity = useCompleteActivity();

  const pipelinesQuery = usePipelines();
  const activePipelineId = pipelinesQuery.data?.[0]?.id;
  const stagesQuery = useStages(activePipelineId);

  const openDeals = openDealsQuery.data?.data ?? [];
  const wonDeals = wonDealsQuery.data?.data ?? [];
  const recentActivities = recentActivitiesQuery.data?.data ?? [];
  const myTasks = myTasksQuery.data?.data ?? [];

  const openValue = openDeals.reduce((sum, d) => sum + parseDecimal(d.amount), 0);
  const wonThisMonth = useMemo(() => {
    const now = new Date();
    const m = now.getMonth();
    const y = now.getFullYear();
    return wonDeals.filter((d) => {
      const closed = d.actualCloseDate ? new Date(d.actualCloseDate) : new Date(d.updatedAt);
      return closed.getMonth() === m && closed.getFullYear() === y;
    });
  }, [wonDeals]);
  const wonMonthValue = wonThisMonth.reduce((sum, d) => sum + parseDecimal(d.amount), 0);
  const dueTodayCount = useMemo(() => {
    const now = new Date();
    return recentActivities.filter((a) => {
      if (!a.dueDate) return false;
      const d = new Date(a.dueDate);
      return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate() &&
        a.status !== 'COMPLETED'
      );
    }).length;
  }, [recentActivities]);
  const quotaPct = Math.min(200, (wonMonthValue / QUOTA_TARGET) * 100);

  const stageRows = useMemo(() => {
    const stages = stagesQuery.data ?? [];
    const byStage = new Map<string, { count: number; value: number }>();
    openDeals.forEach((d) => {
      const row = byStage.get(d.stageId) ?? { count: 0, value: 0 };
      row.count += 1;
      row.value += parseDecimal(d.amount);
      byStage.set(d.stageId, row);
    });
    return stages.map((s) => ({
      stageId: s.id,
      stageName: s.name,
      count: byStage.get(s.id)?.count ?? 0,
      value: byStage.get(s.id)?.value ?? 0,
    }));
  }, [openDeals, stagesQuery.data]);

  const closingThisWeek = useMemo(() => {
    const now = Date.now();
    const in7 = now + 7 * 24 * 60 * 60 * 1000;
    return openDeals
      .filter((d) => {
        if (!d.expectedCloseDate) return false;
        const t = new Date(d.expectedCloseDate).getTime();
        return t >= now && t <= in7;
      })
      .slice(0, 8);
  }, [openDeals]);

  return (
    <main className="space-y-6 px-6 py-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-600">Real-time snapshot of pipeline and execution.</p>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Open Deals"
          value={String(openDeals.length)}
          subtitle={formatCurrency(openValue)}
          loading={openDealsQuery.isLoading}
        />
        <KpiCard
          title="Won This Month"
          value={String(wonThisMonth.length)}
          subtitle={formatCurrency(wonMonthValue)}
          tone="green"
          loading={wonDealsQuery.isLoading}
        />
        <KpiCard
          title="Activities Due Today"
          value={String(dueTodayCount)}
          subtitle={dueTodayCount > 0 ? 'Action needed' : 'All clear'}
          tone={dueTodayCount > 0 ? 'amber' : 'default'}
          loading={recentActivitiesQuery.isLoading}
        />
        <KpiCard
          title="Quota Attainment %"
          value={`${quotaPct.toFixed(1)}%`}
          subtitle={`Target ${formatCurrency(QUOTA_TARGET)}`}
          loading={wonDealsQuery.isLoading}
        />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Pipeline Health</h2>
        {openDealsQuery.isLoading || stagesQuery.isLoading ? (
          <Skeleton className="h-72 rounded-md" />
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stageRows} layout="vertical" margin={{ left: 30, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis type="category" dataKey="stageName" width={110} />
                <Tooltip
                  formatter={(value: number | string, name: string) =>
                    name === 'value'
                      ? [formatCurrency(Number(value)), 'Value']
                      : [String(value), 'Count']
                  }
                />
                <Bar dataKey="count" fill="#0f172a" name="count" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Recent Activity</h2>
          {recentActivitiesQuery.isLoading ? (
            <Skeleton className="h-48 rounded-md" />
          ) : (
            <ul className="space-y-2">
              {recentActivities.map((a) => (
                <li key={a.id} className="rounded-md border border-slate-100 px-3 py-2 text-sm">
                  <div className="font-medium text-slate-900">{a.subject}</div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {a.type} • Deal{' '}
                    {a.dealId ? (
                      <Link href={`/deals/${a.dealId}`} className="text-brand-700 hover:underline">
                        {a.dealId.slice(0, 8)}…
                      </Link>
                    ) : (
                      '—'
                    )}{' '}
                    • {relativeTime(a.updatedAt)}
                  </div>
                </li>
              ))}
              {recentActivities.length === 0 ? (
                <li className="text-sm text-slate-500">No recent activities.</li>
              ) : null}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">My Tasks</h2>
            <Link href="/activities" className="text-xs font-medium text-brand-700 hover:underline">
              View all
            </Link>
          </div>
          {myTasksQuery.isLoading ? (
            <Skeleton className="h-48 rounded-md" />
          ) : (
            <ul className="space-y-2">
              {myTasks.map((task) => (
                <li key={task.id} className="flex items-center gap-2 rounded-md border border-slate-100 px-3 py-2">
                  <button
                    type="button"
                    className="h-4 w-4 rounded border border-slate-400"
                    onClick={() => completeActivity.mutate({ id: task.id, outcome: 'Completed from dashboard' })}
                    aria-label="Complete task"
                  />
                  <div className="flex-1 text-sm">
                    <div className="font-medium text-slate-900">{task.subject}</div>
                    <div className="text-xs text-slate-500">{formatDate(task.dueDate)}</div>
                  </div>
                </li>
              ))}
              {myTasks.length === 0 ? (
                <li className="text-sm text-slate-500">No tasks due within 7 days.</li>
              ) : null}
            </ul>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Deals Closing This Week</h2>
        {openDealsQuery.isLoading ? (
          <Skeleton className="h-40 rounded-md" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-left">Stage</th>
                  <th className="px-3 py-2 text-center">Probability</th>
                  <th className="px-3 py-2 text-left">Owner</th>
                </tr>
              </thead>
              <tbody>
                {closingThisWeek.map((d) => (
                  <tr key={d.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      <Link href={`/deals/${d.id}`} className="font-medium text-brand-700 hover:underline">
                        {d.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right">{formatCurrency(d.amount, d.currency)}</td>
                    <td className="px-3 py-2">{d.stageId.slice(0, 8)}…</td>
                    <td className="px-3 py-2 text-center">{d.probability}%</td>
                    <td className="px-3 py-2">{d.ownerId.slice(0, 8)}…</td>
                  </tr>
                ))}
                {closingThisWeek.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                      No open deals closing in next 7 days.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function KpiCard({
  title,
  value,
  subtitle,
  tone = 'default',
  loading = false,
}: {
  title: string;
  value: string;
  subtitle: string;
  tone?: 'default' | 'green' | 'amber';
  loading?: boolean;
}) {
  const toneClass =
    tone === 'green'
      ? 'border-emerald-200 bg-emerald-50'
      : tone === 'amber'
        ? 'border-amber-200 bg-amber-50'
        : 'border-slate-200 bg-white';
  return (
    <div className={`rounded-lg border p-4 ${toneClass}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
      {loading ? <Skeleton className="mt-2 h-8 w-32" /> : <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>}
      <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
    </div>
  );
}

function relativeTime(value: string): string {
  const t = new Date(value).getTime();
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
