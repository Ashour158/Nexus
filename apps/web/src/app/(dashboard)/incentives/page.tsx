'use client';

import { useState, type JSX } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClients } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/format';

interface Contest {
  id: string;
  name: string;
  metric: string;
  prizeDescription?: string | null;
  endDate: string;
}

interface Badge {
  id: string;
  icon: string;
  name: string;
  description: string;
  awardedTo: Array<{ awardedAt: string }>;
}

export default function IncentivesPage(): JSX.Element {
  const [tab, setTab] = useState<'contests' | 'badges'>('contests');
  const contests = useQuery({
    queryKey: ['incentives', 'contests'],
    queryFn: () => apiClients.incentive.get<Contest[]>('/contests'),
  });
  const badges = useQuery({
    queryKey: ['incentives', 'badges', 'mine'],
    queryFn: () => apiClients.incentive.get<Badge[]>('/badges/mine'),
  });

  return (
    <main className="space-y-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Incentives</h1>
        <div className="flex gap-1">
          <Button variant={tab === 'contests' ? 'primary' : 'secondary'} onClick={() => setTab('contests')}>Contests</Button>
          <Button variant={tab === 'badges' ? 'primary' : 'secondary'} onClick={() => setTab('badges')}>My Badges</Button>
        </div>
      </header>
      {tab === 'contests' ? (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(contests.data ?? []).map((contest) => (
            <article key={contest.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="font-semibold">{contest.name}</h2>
              <p className="text-sm text-slate-500">{contest.metric}</p>
              <p className="mt-2 text-sm">Prize: {contest.prizeDescription ?? 'Recognition'}</p>
              <p className="text-sm text-slate-500">Ends {formatDate(contest.endDate)}</p>
            </article>
          ))}
        </section>
      ) : (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {(badges.data ?? []).map((badge) => {
            const earned = badge.awardedTo[0];
            return (
              <article key={badge.id} className={`rounded-lg border p-4 ${earned ? 'border-emerald-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-70'}`}>
                <div className="text-3xl">{badge.icon}</div>
                <h2 className="mt-2 font-semibold">{badge.name}</h2>
                <p className="text-sm text-slate-500">{badge.description}</p>
                <p className="mt-2 text-xs text-slate-500">{earned ? `Earned ${formatDate(earned.awardedAt)}` : 'Not yet earned'}</p>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
