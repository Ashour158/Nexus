'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Users } from 'lucide-react';
import { DateRangePicker } from '@/components/dashboard/DateRangePicker';
import { EmptyState } from '@/components/dashboard/EmptyState';

const ActivityBreakdownChart = dynamic(
  () => import('./charts').then((m) => m.ActivityBreakdownChart),
  { ssr: false }
);
const RevenueQuotaChart = dynamic(
  () => import('./charts').then((m) => m.RevenueQuotaChart),
  { ssr: false }
);
const WinLossPieChart = dynamic(
  () => import('./charts').then((m) => m.WinLossPieChart),
  { ssr: false }
);
const LostReasonsChart = dynamic(
  () => import('./charts').then((m) => m.LostReasonsChart),
  { ssr: false }
);
const ResponseTimeChart = dynamic(
  () => import('./charts').then((m) => m.ResponseTimeChart),
  { ssr: false }
);

export default function PerformanceDashboardPage() {
  const [team, setTeam] = useState('all');
  const [rep, setRep] = useState('all');
  const [product, setProduct] = useState('all');

  const { data: reportData, isLoading, error } = useQuery({
    queryKey: ['reports', 'performance', { team, rep, product }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (team !== 'all') params.set('team', team);
      if (rep !== 'all') params.set('rep', rep);
      if (product !== 'all') params.set('product', product);
      const query = params.toString();
      const res = await fetch(`/api/reports/performance${query ? `?${query}` : ''}`);
      if (!res.ok) throw new Error('Reports data not yet available');
      return res.json();
    },
    retry: false,
  });

  const reps = useMemo(() => reportData?.reps ?? [], [reportData]);
  const activity = useMemo(() => reportData?.activity ?? [], [reportData]);
  const cumulative = useMemo(() => reportData?.cumulative ?? [], [reportData]);
  const lostReasons = useMemo(() => reportData?.lostReasons ?? [], [reportData]);
  const competitors = useMemo(() => reportData?.competitors ?? [], [reportData]);
  const winLoss = useMemo(() => reportData?.winLoss ?? [], [reportData]);

  const wonLost = winLoss;

  if (isLoading) {
    return (
      <main className="space-y-6">
        <header className="space-y-3">
          <h1 className="text-2xl font-bold text-on-surface">Sales Performance</h1>
        </header>
        <div className="py-12 text-center text-on-surface-variant">Loading reports...</div>
      </main>
    );
  }

  if (error || reps.length === 0) {
    return (
      <main className="space-y-6">
        <header className="space-y-3">
          <h1 className="text-2xl font-bold text-on-surface">Sales Performance</h1>
        </header>
        <EmptyState
          icon={<BarChart3 className="h-5 w-5" />}
          title="Reports data not yet available"
          description="The reporting service is not configured or returned no data. Please check back later."
        />
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <header className="space-y-3">
        <h1 className="text-2xl font-bold text-on-surface">Sales Performance</h1>
        <div className="grid gap-2 md:grid-cols-4">
          <DateRangePicker />
          <select
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            className="rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm"
          >
            <option value="all">All teams</option>
            <option value="enterprise">Enterprise</option>
            <option value="midmarket">Mid-market</option>
          </select>
          <select
            value={rep}
            onChange={(e) => setRep(e.target.value)}
            className="rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm"
          >
            <option value="all">All reps</option>
            {reps.map((r: any) => (
              <option key={r.id}>{r.name}</option>
            ))}
          </select>
          <select
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            className="rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm"
          >
            <option value="all">All products</option>
            <option value="core">Core</option>
            <option value="addons">Add-ons</option>
          </select>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {reps.map((row: any, index: number) => {
          // The performance report's rep rows are keyed by `ownerId` and carry
          // canonical outcome figures (wonAmount/wonDeals). They do NOT carry
          // `name`, `revenue` or `quota` — reading `row.name.split(...)` threw
          // and took the whole page down with "Something went wrong".
          // Render what actually exists; never invent a quota.
          const displayName: string =
            row.name ?? row.ownerName ?? row.owner ?? 'Unnamed owner';
          const initials =
            displayName
              .split(/\s+/)
              .filter(Boolean)
              .map((p: string) => p[0])
              .join('')
              .slice(0, 2)
              .toUpperCase() || '—';
          const wonAmount = Number(row.wonAmount ?? row.totalRevenue ?? row.revenue ?? 0);
          const wonDeals = Number(row.wonDeals ?? row.won ?? 0);
          // Quota is not part of this payload. Show attainment only when a real
          // quota exists; otherwise omit the bar rather than divide by undefined.
          const quota = Number(row.quota ?? 0);
          const hasQuota = Number.isFinite(quota) && quota > 0;
          const attainmentPct = hasQuota
            ? Math.min(100, Math.max(0, (wonAmount / quota) * 100))
            : null;

          return (
            <div
              key={row.id ?? row.ownerId ?? index}
              className="rounded-xl border border-outline-variant bg-surface p-4"
            >
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface-container-highest text-sm font-semibold">
                  {initials}
                </span>
                <div>
                  <p className="font-semibold text-on-surface">{displayName}</p>
                  <p className="text-xs text-on-surface-variant">{wonDeals} deals won</p>
                </div>
              </div>
              {attainmentPct !== null ? (
                <div className="mt-3 h-2 rounded-full bg-surface-container-high">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${attainmentPct}%` }}
                  />
                </div>
              ) : null}
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <p>
                  Won revenue:{' '}
                  <span className="font-semibold">${wonAmount.toLocaleString()}</span>
                </p>
                <p>
                  Quota:{' '}
                  <span className="font-semibold">
                    {hasQuota ? `$${quota.toLocaleString()}` : '—'}
                  </span>
                </p>
                <p>
                  Open pipeline:{' '}
                  <span className="font-semibold">
                    ${Number(row.pipelineValue ?? 0).toLocaleString()}
                  </span>
                </p>
                <p>
                  Win rate:{' '}
                  <span className="font-semibold">
                    {Number(row.winRatePct ?? row.winRate ?? 0).toFixed(0)}%
                  </span>
                </p>
              </div>
            </div>
          );
        })}
      </section>

      <section className="rounded-xl border border-outline-variant bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-on-surface">Activity breakdown</h2>
        <div className="h-72">
          <ActivityBreakdownChart data={activity} />
        </div>
      </section>

      <section className="rounded-xl border border-outline-variant bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-on-surface">Revenue vs Quota</h2>
        <div className="h-72">
          <RevenueQuotaChart data={cumulative} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-outline-variant bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold text-on-surface">Win/Loss analysis</h2>
          <div className="h-56">
            <WinLossPieChart data={wonLost} />
          </div>
          <div className="mt-3 h-44">
            <LostReasonsChart data={lostReasons} />
          </div>
          <div className="mt-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
              Top competitors in lost deals
            </h3>
            <ul className="mt-2 space-y-1 text-sm">
              {competitors.map((c: any) => (
                <li key={c.name} className="flex justify-between">
                  <span>{c.name}</span>
                  <span className="font-semibold">{c.mentions}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="rounded-xl border border-outline-variant bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold text-on-surface">Response time analysis</h2>
          <div className="h-72">
            <ResponseTimeChart data={reps} />
          </div>
          <p className="mt-3 text-xs text-on-surface-variant">
            SLA target: 4 hours. Reps above threshold should receive coaching support.
          </p>
          {reps.length === 0 ? (
            <EmptyState
              icon={<Users className="h-5 w-5" />}
              title="No reps selected"
              description="Adjust your filters to display performance cards."
            />
          ) : null}
        </div>
      </section>
    </main>
  );
}
