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

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Weighted pipeline (analytics service)
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Event-sourced forecast from the analytics read-model (ClickHouse projections).
          </p>
        </div>
        <span className="rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-700">
          analytics-service
        </span>
      </div>

      {isLoading ? (
        <div className="mt-4 h-32 animate-pulse rounded-xl bg-gray-100" />
      ) : isError || !data ? (
        <p className="mt-4 text-sm text-amber-700">
          Analytics forecast is not available. The analytics service may be offline.
        </p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-gray-200 bg-slate-50 p-4">
              <p className="text-xs text-gray-500">Total pipeline</p>
              <p className="text-lg font-semibold text-gray-900">{fmt(data.totalPipeline)}</p>
            </div>
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
              <p className="text-xs text-indigo-700">Weighted pipeline</p>
              <p className="text-lg font-semibold text-indigo-900">{fmt(data.weightedPipeline)}</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs text-emerald-700">Win rate</p>
              <p className="text-lg font-semibold text-emerald-900">{data.winRate}%</p>
            </div>
          </div>

          {data.forecastByMonth.length > 0 ? (
            <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100 bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium text-gray-500">Month</th>
                    <th className="px-4 py-3 text-end font-medium text-gray-500">Total</th>
                    <th className="px-4 py-3 text-end font-medium text-gray-500">Weighted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.forecastByMonth.map((row) => (
                    <tr key={row.month} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{row.month}</td>
                      <td className="px-4 py-3 text-end text-gray-700">{fmt(row.total)}</td>
                      <td className="px-4 py-3 text-end font-semibold text-indigo-700">
                        {fmt(row.weighted)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-sm text-gray-500">No forecast data for the current period.</p>
          )}
        </>
      )}
    </section>
  );
}
