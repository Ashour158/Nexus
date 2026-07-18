'use client';

import { useEffect, useState } from 'react';

interface RepData {
  rank: number;
  repId: string;
  repName: string;
  wonDeals: number;
  totalRevenue: number;
}

const PERIODS = [
  { label: 'Last 7 days', value: '7' },
  { label: 'Last 30 days', value: '30' },
  { label: 'Last 90 days', value: '90' },
  { label: 'This year', value: '365' },
];

export default function LeaderboardPage() {
  const [period, setPeriod] = useState('30');
  const [reps, setReps] = useState<RepData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/crm/analytics/leaderboard?period=${period}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Leaderboard request failed (${r.status})`);
        return r.json();
      })
      .then((d) => {
        setReps(d.data || []);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to load leaderboard');
        setLoading(false);
      });
  }, [period]);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Rep Leaderboard</h1>
          <p className="mt-1 text-sm text-on-surface-variant">Top performers by closed revenue</p>
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
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-container-high" />
          ))}
        </div>
      ) : error ? null : (
        <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-outline-variant bg-surface-container-low">
              <tr>
                <th className="px-4 py-3 text-start font-medium text-on-surface-variant">Rank</th>
                <th className="px-4 py-3 text-start font-medium text-on-surface-variant">Rep</th>
                <th className="px-4 py-3 text-end font-medium text-on-surface-variant">Deals Won</th>
                <th className="px-4 py-3 text-end font-medium text-on-surface-variant">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {reps.map((rep) => (
                <tr key={rep.repId} className="hover:bg-surface-container-low">
                  <td className="px-4 py-3 font-medium text-on-surface-variant">#{rep.rank}</td>
                  <td className="px-4 py-3 font-medium text-on-surface">{rep.repName}</td>
                  <td className="px-4 py-3 text-end text-on-surface">{rep.wonDeals}</td>
                  <td className="px-4 py-3 text-end font-semibold text-on-surface">
                    ${rep.totalRevenue.toLocaleString()}
                  </td>
                </tr>
              ))}
              {reps.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-on-surface-variant">
                    No closed deals in this period
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
