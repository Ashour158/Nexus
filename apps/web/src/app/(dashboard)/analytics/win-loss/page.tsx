'use client';

import { useEffect, useState } from 'react';

interface WinLossData {
  summary: {
    totalDeals: number;
    wonDeals: number;
    lostDeals: number;
    winRate: number;
    wonRevenue: number;
    lostRevenue: number;
  };
  lostReasons: { reason: string; count: number }[];
  monthlyTrend: { month: string; won: number; lost: number; winRate: number }[];
  insights?: string[];
  serviceMap?: string[];
}

const PERIODS = [
  { label: '30 days', value: '30' },
  { label: '90 days', value: '90' },
  { label: '180 days', value: '180' },
  { label: '1 year', value: '365' },
];

export default function WinLossPage() {
  const [period, setPeriod] = useState('90');
  const [data, setData] = useState<WinLossData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/crm/analytics/win-loss?period=${period}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Win/loss request failed (${r.status})`);
        return r.json();
      })
      .then((d) => {
        setData(d);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to load win/loss analytics');
        setLoading(false);
      });
  }, [period]);

  const maxLostCount = data ? Math.max(...data.lostReasons.map((r) => r.count), 1) : 1;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Win / Loss Analysis</h1>
          <p className="mt-1 text-sm text-on-surface-variant">Understand where deals are won and lost</p>
        </div>
        <div className="flex gap-2">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                period === p.value
                  ? 'bg-primary text-white'
                  : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      {error ? (
        <div className="mb-4 rounded-lg border border-warning/30 bg-warning-container px-4 py-3 text-sm text-on-warning-container">
          {error}
        </div>
      ) : null}
      {error ? null : loading || !data ? (
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-container-high" />
          ))}
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            <Card title="Total Deals" value={String(data.summary.totalDeals)} />
            <Card title="Won" value={String(data.summary.wonDeals)} />
            <Card title="Lost" value={String(data.summary.lostDeals)} />
            <Card title="Win Rate" value={`${data.summary.winRate}%`} />
            <Card title="Won Revenue" value={currency(data.summary.wonRevenue)} />
            <Card title="Lost Revenue" value={currency(data.summary.lostRevenue)} />
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-xl border border-outline-variant bg-surface p-5">
              <h2 className="mb-4 font-semibold text-on-surface">Monthly Trend</h2>
              <div className="space-y-2">
                {data.monthlyTrend.map((m) => (
                  <div key={m.month} className="flex items-center gap-3 text-sm">
                    <span className="w-14 text-xs text-on-surface-variant">{m.month}</span>
                    <div className="h-5 flex-1 overflow-hidden rounded bg-surface-container-high">
                      <div className="h-full bg-success" style={{ width: `${m.winRate}%` }} />
                    </div>
                    <span className="w-10 text-end text-xs font-medium text-on-surface">{m.winRate}%</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-outline-variant bg-surface p-5">
              <h2 className="mb-4 font-semibold text-on-surface">Top Lost Reasons</h2>
              <div className="space-y-3">
                {data.lostReasons.slice(0, 8).map((r) => (
                  <div key={r.reason}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="text-on-surface">{r.reason}</span>
                      <span className="font-medium text-on-surface">{r.count}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-container-high">
                      <div
                        className="h-full rounded-full bg-error"
                        style={{ width: `${(r.count / maxLostCount) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.8fr]">
            <section className="rounded-xl border border-outline-variant bg-surface p-5">
              <h2 className="font-semibold text-on-surface">Decision Intelligence</h2>
              <div className="mt-4 space-y-3">
                {(data.insights ?? []).map((insight) => (
                  <p key={insight} className="rounded-lg bg-surface-container-low px-3 py-2 text-sm text-on-surface">
                    {insight}
                  </p>
                ))}
              </div>
            </section>
            <section className="rounded-xl border border-outline-variant bg-surface p-5">
              <h2 className="font-semibold text-on-surface">Connected Services</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {(data.serviceMap ?? []).map((service) => (
                  <span key={service} className="rounded-full bg-primary-container px-3 py-1 text-xs font-medium text-primary">
                    {service}
                  </span>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function currency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface p-4">
      <p className="mb-1 text-xs text-on-surface-variant">{title}</p>
      <p className="text-2xl font-bold text-on-surface">{value}</p>
    </div>
  );
}
