'use client';

import { type ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import type { DrillDownSpec } from '@/lib/bi-types';
import { runDrillDown } from '@/hooks/use-bi';
import { formatCurrency } from '@/lib/format';

function fmtCell(value: unknown, type: string): string {
  if (value == null || value === '') return '—';
  if (type === 'money' || type === 'currency') {
    const n = Number(value);
    return Number.isNaN(n) ? String(value) : formatCurrency(n);
  }
  if (typeof value === 'number') return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return String(value);
}

/**
 * "The rows behind this bar." Slides over from the right and lists the
 * individual records underlying one clicked chart point, via the analytics
 * drill-down endpoint (same whitelist as the aggregate engine).
 */
export function DrilldownDrawer({
  title,
  spec,
  onClose,
}: {
  title: string;
  spec: DrillDownSpec;
  onClose: () => void;
}): ReactElement {
  const { data, isLoading, error } = useQuery({
    queryKey: ['analytics', 'drilldown', spec],
    queryFn: () => runDrillDown(spec),
    retry: false,
  });

  const pointLabel = (spec.at ?? [])
    .map((p) => `${p.field} = ${String(p.value)}`)
    .join(' · ');

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-inverse-surface/40" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-3xl flex-col bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Drill-down: ${title}`}
      >
        <header className="flex items-start justify-between border-b border-outline-variant px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-on-surface">{title}</h2>
            <p className="text-xs text-on-surface-variant">
              Underlying rows{pointLabel ? ` — ${pointLabel}` : ''} · dataset: {spec.dataset}
            </p>
          </div>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface" title="Close">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-auto p-6">
          {isLoading ? (
            <p className="text-sm text-on-surface-variant">Loading rows…</p>
          ) : error ? (
            <p className="text-sm text-error">{(error as Error).message || 'Drill-down failed'}</p>
          ) : !data || data.rows.length === 0 ? (
            <p className="text-sm text-on-surface-variant">No rows behind this point.</p>
          ) : (
            <>
              <p className="mb-3 text-xs text-on-surface-variant">
                {data.rows.length} row{data.rows.length === 1 ? '' : 's'}
                {data.rows.length >= 100 ? ' (first 100 shown — narrow the point or add filters)' : ''}
              </p>
              <div className="overflow-x-auto rounded-lg border border-outline-variant">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="bg-surface-container-low">
                      {data.columns.map((c) => (
                        <th
                          key={c.key}
                          className="whitespace-nowrap border-b border-outline-variant px-3 py-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant"
                        >
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant">
                    {data.rows.map((row, i) => (
                      <tr key={i} className="hover:bg-surface-container-low">
                        {data.columns.map((c) => (
                          <td key={c.key} className="whitespace-nowrap px-3 py-2 text-on-surface">
                            {fmtCell(row[c.key], c.type)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
