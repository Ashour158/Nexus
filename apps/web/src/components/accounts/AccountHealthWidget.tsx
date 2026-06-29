'use client';

import { useEffect, useState } from 'react';

interface HealthData {
  score: number;
  riskLevel: string;
  churnProbability: number;
  signals: Record<string, number>;
  lastActivityDays: number | null;
  openDealsCount: number;
  wonDealsCount: number;
  lostDealsCount: number;
  scoredAt: string;
}

const riskConfig: Record<string, { label: string; ring: string; bar: string; text: string }> = {
  low: { label: 'Healthy', ring: 'ring-green-400', bar: 'bg-green-500', text: 'text-green-700' },
  medium: { label: 'Watch', ring: 'ring-yellow-400', bar: 'bg-yellow-500', text: 'text-yellow-700' },
  high: { label: 'At Risk', ring: 'ring-orange-400', bar: 'bg-orange-500', text: 'text-orange-700' },
  critical: { label: 'Critical', ring: 'ring-red-500', bar: 'bg-red-500', text: 'text-red-700' },
};

export function AccountHealthWidget({ accountId }: { accountId: string }) {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/crm/account-health/${accountId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setHealth(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [accountId]);

  if (loading) return <div className="h-24 animate-pulse rounded-xl bg-gray-100" />;
  if (!health) return null;

  const cfg = riskConfig[health.riskLevel] || riskConfig.low;

  return (
    <div className={`rounded-xl border-2 bg-white p-4 ${cfg.ring}`}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Account Health</h3>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cfg.text}`}>{cfg.label}</span>
      </div>
      <div className="mb-3">
        <div className="mb-1 flex justify-between text-xs text-gray-500">
          <span>Health Score</span>
          <span className="font-semibold text-gray-900">{health.score}/100</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-gray-100">
          <div className={`h-full rounded-full ${cfg.bar}`} style={{ width: `${health.score}%` }} />
        </div>
      </div>
      <div className="mb-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-gray-50 p-2">
          <p className="text-lg font-bold text-gray-900">{health.openDealsCount}</p>
          <p className="text-xs text-gray-500">Open</p>
        </div>
        <div className="rounded-lg bg-green-50 p-2">
          <p className="text-lg font-bold text-green-700">{health.wonDealsCount}</p>
          <p className="text-xs text-gray-500">Won</p>
        </div>
        <div className="rounded-lg bg-red-50 p-2">
          <p className="text-lg font-bold text-red-600">{health.lostDealsCount}</p>
          <p className="text-xs text-gray-500">Lost</p>
        </div>
      </div>
      <div className="flex justify-between text-xs text-gray-500">
        <span>
          Churn risk: <strong className={cfg.text}>{Math.round(health.churnProbability * 100)}%</strong>
        </span>
        {health.lastActivityDays !== null ? (
          <span>
            Last activity: <strong>{health.lastActivityDays}d ago</strong>
          </span>
        ) : null}
      </div>
    </div>
  );
}
