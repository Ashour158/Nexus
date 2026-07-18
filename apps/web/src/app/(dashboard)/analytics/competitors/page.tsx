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
          <h1 className="text-2xl font-bold text-on-surface">Competitor Intelligence</h1>
          <p className="mt-1 text-sm text-on-surface-variant">Win/loss performance against competitors</p>
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
      ) : error ? null : stats.length === 0 ? (
        <div className="py-16 text-center">
          <p className="font-medium text-on-surface-variant">No competitor data yet</p>
          <p className="mt-1 text-sm text-on-surface-variant">Log competitors on deals to build this report</p>
        </div>
      ) : (
        <div className="space-y-3">
          {stats.map((comp) => (
            <div key={comp.name} className="rounded-xl border border-outline-variant bg-surface p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-semibold text-on-surface">{comp.name}</span>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-success">{comp.won} won</span>
                  <span className="text-error">{comp.lost} lost</span>
                  <span
                    className={`font-bold ${
                      comp.winRate >= 60
                        ? 'text-success'
                        : comp.winRate >= 40
                          ? 'text-warning'
                          : 'text-error'
                    }`}
                  >
                    {comp.winRate}% win rate
                  </span>
                </div>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-container-high">
                <div
                  className={`h-full rounded-full ${
                    comp.winRate >= 60
                      ? 'bg-success'
                      : comp.winRate >= 40
                        ? 'bg-warning'
                        : 'bg-error'
                  }`}
                  style={{ width: `${comp.winRate}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-on-surface-variant">
                {comp.total} deal{comp.total !== 1 ? 's' : ''} tracked
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
