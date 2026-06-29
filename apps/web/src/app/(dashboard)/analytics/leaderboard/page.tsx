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

  useEffect(() => {
    setLoading(true);
    fetch(`/api/crm/analytics/leaderboard?period=${period}`)
      .then((r) => r.json())
      .then((d) => {
        setReps(d.data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [period]);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rep Leaderboard</h1>
          <p className="mt-1 text-sm text-gray-500">Top performers by closed revenue</p>
        </div>
        <div className="flex gap-2">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                period === p.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-start font-medium text-gray-500">Rank</th>
                <th className="px-4 py-3 text-start font-medium text-gray-500">Rep</th>
                <th className="px-4 py-3 text-end font-medium text-gray-500">Deals Won</th>
                <th className="px-4 py-3 text-end font-medium text-gray-500">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {reps.map((rep) => (
                <tr key={rep.repId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-500">#{rep.rank}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{rep.repName}</td>
                  <td className="px-4 py-3 text-end text-gray-700">{rep.wonDeals}</td>
                  <td className="px-4 py-3 text-end font-semibold text-gray-900">
                    ${rep.totalRevenue.toLocaleString()}
                  </td>
                </tr>
              ))}
              {reps.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
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
