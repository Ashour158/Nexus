'use client';

/**
 * Read-model section backed by the analytics-service (Kafka -> ClickHouse).
 * These widgets consume the previously-orphaned `use-analytics` hooks through
 * the /api/analytics BFF proxy. They render alongside the reporting-service
 * charts on the Pipeline Analytics page. On error/empty they show a graceful
 * state and never fabricate numbers.
 */

import { BarChart3, DollarSign, Layers, Percent } from 'lucide-react';
import { StatCard } from '@/components/dashboard/StatCard';
import { formatCurrency } from '@/lib/format';
import { usePipelineSummary, useRevenueSummary } from '@/hooks/use-analytics';

const currentYear = new Date().getFullYear();

export function AnalyticsReadModelSection() {
  const summary = usePipelineSummary();
  const revenue = useRevenueSummary(currentYear);

  const isLoading = summary.isLoading || revenue.isLoading;
  const isError = summary.isError || revenue.isError;

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Analytics read-model</h2>
          <p className="text-xs text-slate-500">
            Live from the analytics service (event-sourced ClickHouse projections).
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-700">
          <BarChart3 className="h-3 w-3" />
          analytics-service
        </span>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Analytics read-model is not available. The analytics service may be offline.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Open deals"
            value={summary.data?.totalDeals ?? 0}
            icon={<Layers className="h-5 w-5" />}
            iconBg="bg-blue-100 text-blue-700"
          />
          <StatCard
            label="Open pipeline value"
            value={summary.data?.totalValue ?? 0}
            format="currency"
            icon={<DollarSign className="h-5 w-5" />}
            iconBg="bg-emerald-100 text-emerald-700"
          />
          <StatCard
            label="Avg deal size"
            value={summary.data?.avgDealSize ?? 0}
            format="currency"
            icon={<DollarSign className="h-5 w-5" />}
            iconBg="bg-indigo-100 text-indigo-700"
          />
          <StatCard
            label={`Win rate (${currentYear})`}
            value={revenue.data?.winRate ?? 0}
            format="percent"
            icon={<Percent className="h-5 w-5" />}
            iconBg="bg-amber-100 text-amber-700"
          />
        </div>
      )}

      {!isLoading && !isError && revenue.data ? (
        <p className="text-xs text-slate-500">
          Won revenue {formatCurrency(revenue.data.totalRevenue)} across{' '}
          {revenue.data.wonDeals} won / {revenue.data.lostDeals} lost deals in {currentYear}.
        </p>
      ) : null}
    </section>
  );
}
