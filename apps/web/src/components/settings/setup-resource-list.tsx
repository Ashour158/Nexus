'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Inbox, RefreshCw, type LucideIcon } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';

export interface SetupColumn<T = Record<string, unknown>> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
}

interface SetupResourceListProps {
  title: string;
  description: string;
  icon: LucideIcon;
  /** Same-origin BFF endpoint (e.g. `/bff/crm/assignment-rules`). */
  endpoint: string;
  columns: SetupColumn[];
  /** Optional hint shown in the empty state. */
  emptyHint?: string;
}

type FetchState = 'loading' | 'ready' | 'error';

/**
 * Generic read-only Setup list. Fetches a `{ success, data }` (or `{ data }`)
 * BFF payload and renders a table. If the endpoint 404s / errors (backend not
 * deployed yet) it degrades to a graceful empty state — it never throws.
 *
 * Mirrors the fetch conventions of the existing admin/roles + settings pages
 * (same-origin `/bff/*` proxy + bearer token from the auth store).
 */
export function SetupResourceList({
  title,
  description,
  icon: Icon,
  endpoint,
  columns,
  emptyHint,
}: SetupResourceListProps) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [state, setState] = useState<FetchState>('loading');
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const res = await fetch(endpoint, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });
      if (!res.ok) {
        // Backend not deployed / not reachable — show empty state, don't crash.
        setRows([]);
        setState('ready');
        return;
      }
      const json = await res.json();
      const raw = json?.data?.data ?? json?.data ?? json;
      setRows(Array.isArray(raw) ? raw : []);
      setState('ready');
    } catch {
      setRows([]);
      setState('error');
    }
  }, [endpoint, accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-on-surface">
            <Icon className="h-6 w-6 text-primary" /> {title}
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">{description}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm font-medium text-on-surface-variant transition-colors hover:bg-surface-container-low"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface">
        {state === 'loading' ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-on-surface-variant">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center">
            <Inbox className="mx-auto mb-3 h-10 w-10 text-outline" />
            <p className="text-sm font-medium text-on-surface-variant">Nothing here yet</p>
            <p className="mt-1 text-xs text-on-surface-variant">
              {emptyHint ?? 'No records have been configured for this workspace.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container-low text-xs uppercase text-on-surface-variant">
                  {columns.map((col) => (
                    <th key={col.key} className="px-5 py-3 text-start font-medium">
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={(row.id as string) ?? i}
                    className={`border-b border-outline-variant ${i % 2 === 0 ? '' : 'bg-surface-container-low/50'} hover:bg-primary-container/30`}
                  >
                    {columns.map((col) => (
                      <td key={col.key} className="px-5 py-3 text-on-surface">
                        {col.render ? col.render(row) : formatCell(row[col.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function formatCell(value: unknown): React.ReactNode {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
