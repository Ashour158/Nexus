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
    <section className="space-y-3 rounded-xl border border-outline-variant bg-surface p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-on-surface">Analytics read-model</h2>
          <p className="text-xs text-on-surface-variant">
            Live from the analytics service (event-sourced ClickHouse projections).
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-primary-container px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">
          <BarChart3 className="h-3 w-3" />
          analytics-service
        </span>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-container-high" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-warning/30 bg-warning-container p-4 text-sm text-on-warning-container">
          Analytics read-model is not available. The analytics service may be offline.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Open deals"
            value={summary.data?.totalDeals ?? 0}
            icon={<Layers className="h-5 w-5" />}
            iconBg="bg-primary-container text-primary"
          />
          <StatCard
            label="Open pipeline value"
            value={summary.data?.totalValue ?? 0}
            format="currency"
            icon={<DollarSign className="h-5 w-5" />}
            iconBg="bg-success-container text-success"
          />
          <StatCard
            label="Avg deal size"
            value={summary.data?.avgDealSize ?? 0}
            format="currency"
            icon={<DollarSign className="h-5 w-5" />}
            iconBg="bg-primary-container text-primary"
          />
          <StatCard
            label={`Win rate (${currentYear})`}
            value={revenue.data?.winRate ?? 0}
            format="percent"
            icon={<Percent className="h-5 w-5" />}
            iconBg="bg-warning-container text-warning"
          />
        </div>
      )}

      {!isLoading && !isError && revenue.data ? (
        <p className="text-xs text-on-surface-variant">
          Won revenue {formatCurrency(revenue.data.totalRevenue)} across{' '}
          {revenue.data.wonDeals} won / {revenue.data.lostDeals} lost deals in {currentYear}.
        </p>
      ) : null}
    </section>
  );
}
