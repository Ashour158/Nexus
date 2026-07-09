'use client';

import { useEffect, useState } from 'react';

interface CompetitorStat {
  name: string;
  won: number;
  lost: number;
  total: number;
  winRate: number;
}

export default function CompetitorAnalyticsPage() {
  const [stats, setStats] = useState<CompetitorStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/crm/analytics/competitors')
      .then(async (r) => {
        if (!r.ok) throw new Error(`Competitor request failed (${r.status})`);
        return (await r.json()) as { data?: CompetitorStat[] };
      })
      .then((d) => {
        setStats(d.data ?? []);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to load competitor intelligence');
        setLoading(false);
      });
  }, []);

  return (
    <div className="max-w-3xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Competitor Intelligence</h1>
          <p className="mt-1 text-sm text-gray-500">Win/loss performance against competitors</p>
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </div>
      ) : null}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : error ? null : stats.length === 0 ? (
        <div className="py-16 text-center">
          <p className="font-medium text-gray-600">No competitor data yet</p>
          <p className="mt-1 text-sm text-gray-400">Log competitors on deals to build this report</p>
        </div>
      ) : (
        <div className="space-y-3">
          {stats.map((comp) => (
            <div key={comp.name} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-semibold text-gray-900">{comp.name}</span>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-green-600">{comp.won} won</span>
                  <span className="text-red-500">{comp.lost} lost</span>
                  <span
                    className={`font-bold ${
                      comp.winRate >= 60
                        ? 'text-green-600'
                        : comp.winRate >= 40
                          ? 'text-amber-600'
                          : 'text-red-600'
                    }`}
                  >
                    {comp.winRate}% win rate
                  </span>
                </div>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full rounded-full ${
                    comp.winRate >= 60
                      ? 'bg-green-500'
                      : comp.winRate >= 40
                        ? 'bg-amber-500'
                        : 'bg-red-500'
                  }`}
                  style={{ width: `${comp.winRate}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-gray-400">
                {comp.total} deal{comp.total !== 1 ? 's' : ''} tracked
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
