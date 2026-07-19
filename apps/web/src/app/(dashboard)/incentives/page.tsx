'use client';

import { useEffect, useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';

interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  awardedTo?: Array<{ awardedAt?: string | null }>;
}
/**
 * Field names below mirror what incentive-service actually returns (the Prisma
 * `Contest` model): `endDate`, `prizeDescription`, `isActive`. The page
 * previously read `endsAt` / `prize` / `status`, which are simply absent — so
 * `new Date(undefined)` rendered "Invalid Date" on every card. The legacy names
 * are kept as optional fallbacks in case an older BFF shape is still in play.
 */
interface Contest {
  id: string;
  name: string;
  description: string;
  endDate?: string | null;
  /** @deprecated legacy alias for `endDate`. */
  endsAt?: string | null;
  prizeDescription?: string | null;
  /** @deprecated legacy alias for `prizeDescription`. */
  prize?: string | null;
  isActive?: boolean;
  /** @deprecated legacy alias derived from `isActive`. */
  status?: string;
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
        setBadges(
          Array.isArray(b.data)
            ? b.data.filter(
                (badge: Badge) =>
                  Array.isArray(badge.awardedTo) && badge.awardedTo.length > 0
              )
            : []
        );
        setContests(c.data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-bold text-on-surface">Incentives & Badges</h1>
      {loading ? (
        <div className="animate-pulse space-y-3">{[1, 2].map((i) => <div key={i} className="h-24 rounded-xl bg-surface-container-high" />)}</div>
      ) : (
        <>
          <section className="mb-8">
            <h2 className="mb-3 font-semibold text-on-surface">Your Badges</h2>
            {badges.length === 0 ? (
              <div className="rounded-xl bg-surface-container-low py-2">
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
                  <div key={b.id} className="rounded-xl border border-warning/30 bg-warning-container p-3 text-center" title={b.description}>
                    <p className="text-3xl">{b.icon || '🏅'}</p>
                    <p className="mt-1 text-xs font-medium text-on-surface">{b.name}</p>
                    <p className="text-xs text-on-surface-variant">
                      {safeDate(b.awardedTo?.[0]?.awardedAt)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section>
            <h2 className="mb-3 font-semibold text-on-surface">Active Contests</h2>
            {contests.length === 0 ? (
              <div className="rounded-xl bg-surface-container-low py-2">
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
                  <div key={c.id} className="rounded-xl border border-outline-variant bg-surface p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-on-surface">{c.name}</h3>
                        <p className="mt-0.5 text-xs text-on-surface-variant">{c.description}</p>
                      </div>
                      {(() => {
                        const active = c.isActive ?? c.status === 'ACTIVE';
                        return (
                          <span
                            className={`rounded px-2 py-0.5 text-xs font-medium ${active ? 'bg-success-container text-on-success-container' : 'bg-surface-container-high text-on-surface'}`}
                          >
                            {active ? 'ACTIVE' : 'ENDED'}
                          </span>
                        );
                      })()}
                    </div>
                    <p className="mt-2 text-xs text-on-surface-variant">
                      🏆 Prize: {c.prizeDescription || c.prize || '—'} · Ends:{' '}
                      {safeDate(c.endDate ?? c.endsAt)}
                    </p>
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

function safeDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString() : '—';
}
