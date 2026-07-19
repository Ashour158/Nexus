'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

type FunnelStage = {
  stage: string;
  count: number;
  totalValue: number;
  conversionRate: number;
  dropOffRate: number;
  avgDaysInStage: number;
};
type FunnelData = {
  stages: FunnelStage[];
  totalDeals: number;
  totalWon: number;
  overallConversionRate: number;
  avgSalesCycledays: number;
};

export default function FunnelPage() {
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().split('T')[0];
  });
  const [to, setTo] = useState(() => new Date().toISOString().split('T')[0]);

  const { data, isLoading } = useQuery({
    queryKey: ['funnel', from, to],
    queryFn: async () => {
      const res = await fetch(
        `/api/analytics/funnel?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      );
      if (!res.ok) throw new Error('Funnel data not available');
      return (await res.json()) as FunnelData;
    },
  });

  const maxCount = Math.max(...(data?.stages?.map((s) => s.count) ?? [1]), 1);

  return (
    <div className="p-4 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-on-surface ">Sales Funnel</h1>
        <div className="flex gap-2 items-center text-sm">
          <label className="text-on-surface-variant">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-outline-variant dark:border-outline-variant bg-surface dark:bg-surface px-2 py-1 text-on-surface "
          />
          <label className="text-on-surface-variant">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-outline-variant dark:border-outline-variant bg-surface dark:bg-surface px-2 py-1 text-on-surface "
          />
        </div>
      </div>

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Deals', value: data.totalDeals },
            { label: 'Deals Won', value: data.totalWon },
            { label: 'Win Rate', value: `${data.overallConversionRate}%` },
            { label: 'Avg Sales Cycle', value: `${data.avgSalesCycledays}d` },
          ].map((m) => (
            <div key={m.label} className="rounded-xl border border-outline-variant dark:border-outline-variant bg-surface dark:bg-surface p-4">
              <p className="text-xs text-on-surface-variant dark:text-on-surface-variant uppercase tracking-wide">{m.label}</p>
              <p className="text-2xl font-bold text-on-surface mt-1">{m.value}</p>
            </div>
          ))}
        </div>
      )}

      {isLoading && <div className="text-center py-12 text-on-surface-variant">Loading funnel data…</div>}

      {data && (
        <div className="rounded-xl border border-outline-variant dark:border-outline-variant bg-surface dark:bg-surface p-6 space-y-4">
          <h2 className="font-semibold text-on-surface ">Stage Breakdown</h2>
          <div className="space-y-3">
            {(data.stages ?? []).map((stage) => (
              <div key={stage.stage} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-on-surface dark:text-outline">{stage.stage}</span>
                  <div className="flex items-center gap-4 text-on-surface-variant dark:text-on-surface-variant text-xs">
                    <span>{stage.count} deals</span>
                    <span>${stage.totalValue.toLocaleString()}</span>
                    {stage.conversionRate > 0 && (
                      <span className="text-success dark:text-success">→ {stage.conversionRate}%</span>
                    )}
                    {stage.dropOffRate > 0 && stage.dropOffRate < 100 && (
                      <span className="text-error">drop {stage.dropOffRate}%</span>
                    )}
                  </div>
                </div>
                <div className="h-8 bg-surface-container-high dark:bg-surface-container-high rounded-lg overflow-hidden">
                  <div
                    className="h-full bg-primary dark:bg-primary rounded-lg transition-all"
                    style={{ width: `${Math.round((stage.count / maxCount) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
