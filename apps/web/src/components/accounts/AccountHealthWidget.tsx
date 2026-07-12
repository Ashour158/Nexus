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
  low: { label: 'Healthy', ring: 'ring-success', bar: 'bg-success', text: 'text-success' },
  medium: { label: 'Watch', ring: 'ring-warning', bar: 'bg-warning', text: 'text-warning' },
  high: { label: 'At Risk', ring: 'ring-warning', bar: 'bg-warning', text: 'text-warning' },
  critical: { label: 'Critical', ring: 'ring-error', bar: 'bg-error', text: 'text-error' },
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

  if (loading) return <div className="h-24 animate-pulse rounded-xl bg-surface-container-high" />;
  if (!health) return null;

  const cfg = riskConfig[health.riskLevel] || riskConfig.low;

  return (
    <div className={`rounded-xl border-2 bg-surface p-4 ${cfg.ring}`}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-on-surface">Account Health</h3>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cfg.text}`}>{cfg.label}</span>
      </div>
      <div className="mb-3">
        <div className="mb-1 flex justify-between text-xs text-on-surface-variant">
          <span>Health Score</span>
          <span className="font-semibold text-on-surface">{health.score}/100</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-container-high">
          <div className={`h-full rounded-full ${cfg.bar}`} style={{ width: `${health.score}%` }} />
        </div>
      </div>
      <div className="mb-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-surface-container-low p-2">
          <p className="text-lg font-bold text-on-surface">{health.openDealsCount}</p>
          <p className="text-xs text-on-surface-variant">Open</p>
        </div>
        <div className="rounded-lg bg-success-container p-2">
          <p className="text-lg font-bold text-success">{health.wonDealsCount}</p>
          <p className="text-xs text-on-surface-variant">Won</p>
        </div>
        <div className="rounded-lg bg-error-container p-2">
          <p className="text-lg font-bold text-error">{health.lostDealsCount}</p>
          <p className="text-xs text-on-surface-variant">Lost</p>
        </div>
      </div>
      <div className="flex justify-between text-xs text-on-surface-variant">
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
