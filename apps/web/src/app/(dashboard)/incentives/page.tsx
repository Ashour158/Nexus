'use client';

import { useEffect, useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';

interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  earnedAt: string;
}
interface Contest {
  id: string;
  name: string;
  description: string;
  endsAt: string;
  prize: string;
  status: string;
  leaderboard?: { repName: string; score: number }[];
}

export default function IncentivesPage() {
  const [badges, setBadges] = useState<Badge[]>([]);
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/incentive/badges').then((r) => r.json()),
      fetch('/api/incentive/contests').then((r) => r.json()),
    ])
      .then(([b, c]) => {
        setBadges(b.data || []);
        setContests(c.data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Incentives & Badges</h1>
      {loading ? (
        <div className="animate-pulse space-y-3">{[1, 2].map((i) => <div key={i} className="h-24 rounded-xl bg-gray-100" />)}</div>
      ) : (
        <>
          <section className="mb-8">
            <h2 className="mb-3 font-semibold text-gray-700">Your Badges</h2>
            {badges.length === 0 ? (
              <div className="rounded-xl bg-gray-50 py-2">
                <EmptyState
                  icon="🏅"
                  compact
                  title="No badges yet"
                  description="Close deals to earn your first badge"
                />
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
                {badges.map((b) => (
                  <div key={b.id} className="rounded-xl border border-yellow-200 bg-yellow-50 p-3 text-center" title={b.description}>
                    <p className="text-3xl">{b.icon || '🏅'}</p>
                    <p className="mt-1 text-xs font-medium text-gray-700">{b.name}</p>
                    <p className="text-xs text-gray-400">{new Date(b.earnedAt).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section>
            <h2 className="mb-3 font-semibold text-gray-700">Active Contests</h2>
            {contests.length === 0 ? (
              <div className="rounded-xl bg-gray-50 py-2">
                <EmptyState
                  icon="🏆"
                  compact
                  title="No active contests"
                  description="Sales contests will appear here when created by an admin"
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {contests.map((c) => (
                  <div key={c.id} className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-gray-900">{c.name}</h3>
                        <p className="mt-0.5 text-xs text-gray-500">{c.description}</p>
                      </div>
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${c.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>{c.status}</span>
                    </div>
                    <p className="mt-2 text-xs text-gray-500">🏆 Prize: {c.prize} · Ends: {new Date(c.endsAt).toLocaleDateString()}</p>
                    {c.leaderboard && c.leaderboard.length > 0 ? (
                      <ol className="mt-3 space-y-1">
                        {c.leaderboard.slice(0, 3).map((entry, i) => (
                          <li key={entry.repName} className="flex items-center justify-between text-xs">
                            <span>{i + 1}. {entry.repName}</span>
                            <span className="font-semibold">{entry.score}</span>
                          </li>
                        ))}
                      </ol>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}