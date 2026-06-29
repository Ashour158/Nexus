'use client';

import { useEffect, useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';

interface Quota {
  id: string;
  repId: string;
  repName: string;
  period: string;
  targetAmount: number;
  achievedAmount: number;
  currency: string;
}

export default function PlanningPage() {
  const [quotas, setQuotas] = useState<Quota[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));

  useEffect(() => {
    setLoading(true);
    fetch(`/api/planning/quotas?period=${period}`)
      .then((r) => r.json())
      .then((d) => {
        setQuotas(d.data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [period]);

  const fmt = (n: number, currency = 'USD') =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Sales Planning & Quotas</h1>
        <input
          type="month"
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        />
      </div>
      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-100" />)}</div>
      ) : quotas.length === 0 ? (
        <EmptyState
          icon="🎯"
          title="No quotas set"
          description="Set monthly or quarterly quotas to track team performance"
        />
      ) : (
        <div className="space-y-3">
          {quotas.map((q) => {
            const pct = q.targetAmount > 0 ? Math.min(100, Math.round((q.achievedAmount / q.targetAmount) * 100)) : 0;
            return (
              <div key={q.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-medium text-gray-900">{q.repName}</span>
                  <span className={`text-sm font-bold ${pct >= 100 ? 'text-green-600' : pct >= 70 ? 'text-amber-600' : 'text-red-600'}`}>{pct}%</span>
                </div>
                <div className="mb-2 h-2 overflow-hidden rounded-full bg-gray-100">
                  <div className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-green-500' : pct >= 70 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Achieved: {fmt(q.achievedAmount, q.currency)}</span>
                  <span>Target: {fmt(q.targetAmount, q.currency)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
