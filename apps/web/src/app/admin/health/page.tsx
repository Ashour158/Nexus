'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/stores/auth.store';

type Status = 'healthy' | 'degraded' | 'down';

interface ServiceHealth {
  service: string;
  url: string;
  status: Status;
  latencyMs: number | null;
  httpStatus: number | null;
  detail: string | null;
}

interface HealthResponse {
  checkedAt: string;
  summary: { total: number; healthy: number; degraded: number; down: number };
  services: ServiceHealth[];
}

const REFRESH_MS = 30_000;

const STATUS_STYLES: Record<Status, string> = {
  healthy: 'bg-success',
  degraded: 'bg-warning',
  down: 'bg-error',
};

const STATUS_LABEL: Record<Status, string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  down: 'Down',
};

export default function AdminHealthPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [data, setData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);

  const authHeaders = useCallback(
    (): Record<string, string> => (accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    [accessToken]
  );

  const inFlight = useRef(false);
  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch('/api/admin/health', { headers: authHeaders(), cache: 'no-store' });
      if (!res.ok) {
        throw new Error(res.status === 401 || res.status === 403 ? 'Admin access required to view system health.' : `Health check failed (${res.status})`);
      }
      const json = (await res.json()) as HealthResponse;
      setData(json);
      setError(null);
      setRefreshedAt(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load system health');
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, [authHeaders]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const services = data?.services ?? [];
  const summary = data?.summary;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">System Health</h2>
        <div className="flex items-center gap-3 text-xs text-on-surface-variant">
          {refreshedAt ? <span>Last refreshed {refreshedAt}</span> : null}
          <button
            onClick={() => void load()}
            className="rounded border border-outline-variant px-3 py-1.5 text-xs text-outline hover:bg-surface-container-highest"
          >
            Refresh
          </button>
        </div>
      </div>

      {summary ? (
        <section className="grid gap-3 sm:grid-cols-4">
          <SummaryCard label="Services" value={summary.total} tone="neutral" />
          <SummaryCard label="Healthy" value={summary.healthy} tone="green" />
          <SummaryCard label="Degraded" value={summary.degraded} tone="yellow" />
          <SummaryCard label="Down" value={summary.down} tone="red" />
        </section>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-error bg-error-container/40 p-4 text-sm text-error">
          {error}
        </div>
      ) : null}

      {loading && !data ? (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-container-highest" />
          ))}
        </section>
      ) : (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {services.map((s) => (
            <div key={s.service} className="rounded-xl border border-outline-variant bg-inverse-surface p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{s.service}</span>
                <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLES[s.status]}`}>{STATUS_LABEL[s.status]}</span>
              </div>
              <p className="mt-2 text-outline">
                {s.latencyMs != null ? `${s.latencyMs} ms` : '—'}
                {s.httpStatus != null ? ` · HTTP ${s.httpStatus}` : ''}
              </p>
              {s.detail && s.status !== 'healthy' ? (
                <p className="mt-1 text-xs text-on-surface-variant">{s.detail}</p>
              ) : null}
              <p className="mt-1 truncate text-[11px] text-on-surface-variant" title={s.url}>{s.url}</p>
            </div>
          ))}
          {services.length === 0 && !error ? (
            <p className="col-span-full text-sm text-on-surface-variant">No services reported.</p>
          ) : null}
        </section>
      )}

      {data ? (
        <p className="text-xs text-on-surface-variant">
          Statuses polled server-side from each service&apos;s <code className="text-on-surface-variant">/health</code> endpoint at{' '}
          {new Date(data.checkedAt).toLocaleTimeString()}.
        </p>
      ) : null}
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: 'neutral' | 'green' | 'yellow' | 'red' }) {
  const toneStyles: Record<typeof tone, string> = {
    neutral: 'text-inverse-on-surface',
    green: 'text-success',
    yellow: 'text-warning',
    red: 'text-error',
  };
  return (
    <div className="rounded-xl border border-outline-variant bg-inverse-surface p-4">
      <p className="text-xs uppercase tracking-wider text-on-surface-variant">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${toneStyles[tone]}`}>{value}</p>
    </div>
  );
}
