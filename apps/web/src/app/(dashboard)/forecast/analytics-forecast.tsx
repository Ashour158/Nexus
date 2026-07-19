'use client';

/**
 * Analytics-service forecast section. Surfaces the previously-orphaned
 * `useForecast` hook (weighted-pipeline read-model from ClickHouse) through the
 * /api/analytics BFF proxy. Additive to the CRM-computed forecast table above.
 * Graceful loading/empty/error states; never fabricates data.
 */

import { useForecast } from '@/hooks/use-analytics';

const fmt = (value: string | number) => {
  const n = typeof value === 'string' ? Number(value) : value;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0);
};

export function AnalyticsForecastSection() {
  const { data, isLoading, isError } = useForecast();
  const forecastByMonth = Array.isArray(data?.forecastByMonth) ? data.forecastByMonth : [];

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-on-surface">
            Weighted pipeline (analytics service)
          </h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            Event-sourced forecast from the analytics read-model (ClickHouse projections).
          </p>
        </div>
        <span className="rounded-full bg-primary-container px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">
          analytics-service
        </span>
      </div>

      {isLoading ? (
        <div className="mt-4 h-32 animate-pulse rounded-xl bg-surface-container-high" />
      ) : isError || !data ? (
        <p className="mt-4 text-sm text-warning">
          Analytics forecast is not available. The analytics service may be offline.
        </p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-outline-variant bg-surface-container-low p-4">
              <p className="text-xs text-on-surface-variant">Total pipeline</p>
              <p className="text-lg font-semibold text-on-surface">{fmt(data.totalPipeline)}</p>
            </div>
            <div className="rounded-lg border border-primary/40 bg-primary-container p-4">
              <p className="text-xs text-primary">Weighted pipeline</p>
              <p className="text-lg font-semibold text-on-primary-container">{fmt(data.weightedPipeline)}</p>
            </div>
            <div className="rounded-lg border border-success/30 bg-success-container p-4">
              <p className="text-xs text-success">Win rate</p>
              <p className="text-lg font-semibold text-on-success-container">
                {Number.isFinite(data.winRatePct) ? data.winRatePct.toFixed(1) : '0.0'}%
              </p>
            </div>
          </div>

          {forecastByMonth.length > 0 ? (
            <div className="mt-4 overflow-hidden rounded-xl border border-outline-variant bg-surface">
              <table className="w-full text-sm">
                <thead className="border-b border-outline-variant bg-surface-container-low">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium text-on-surface-variant">Month</th>
                    <th className="px-4 py-3 text-end font-medium text-on-surface-variant">Total</th>
                    <th className="px-4 py-3 text-end font-medium text-on-surface-variant">Weighted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {forecastByMonth.map((row) => (
                    <tr key={row.month} className="hover:bg-surface-container-low">
                      <td className="px-4 py-3 font-medium text-on-surface">{row.month}</td>
                      <td className="px-4 py-3 text-end text-on-surface">{fmt(row.total)}</td>
                      <td className="px-4 py-3 text-end font-semibold text-primary">
                        {fmt(row.weighted)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-sm text-on-surface-variant">No forecast data for the current period.</p>
          )}
        </>
      )}
    </section>
  );
}
