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

const DOT_STYLES: Record<Status, string> = {
  healthy: 'bg-success',
  degraded: 'bg-warning',
  down: 'bg-error',
};

const BADGE_STYLES: Record<Status, string> = {
  healthy: 'bg-success-container text-success ring-success/20',
  degraded: 'bg-warning-container text-warning ring-warning/20',
  down: 'bg-error-container text-error ring-error/20',
};

const STATUS_LABEL: Record<Status, string> = {
  healthy: 'Operational',
  degraded: 'Degraded',
  down: 'Down',
};

export default function SystemStatusPage(): JSX.Element {
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
        throw new Error(
          res.status === 401 || res.status === 403
            ? 'Admin access is required to view system status.'
            : `Status check failed (${res.status})`
        );
      }
      const json = (await res.json()) as HealthResponse;
      setData(json);
      setError(null);
      setRefreshedAt(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load system status');
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
  const allHealthy = summary ? summary.down === 0 && summary.degraded === 0 : false;
  const overall: Status = !summary
    ? 'degraded'
    : summary.down > 0
      ? 'down'
      : summary.degraded > 0
        ? 'degraded'
        : 'healthy';

  return (
    <main className="space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-on-surface">System Status</h1>
        <div className="flex items-center gap-3 text-xs text-on-surface-variant">
          {refreshedAt ? <span>Last checked {refreshedAt}</span> : null}
          <button
            onClick={() => void load()}
            className="rounded-lg border border-outline-variant px-3 py-1.5 text-xs text-on-surface hover:bg-surface-container-low"
          >
            Refresh
          </button>
        </div>
      </div>

      {summary ? (
        <div
          className={`flex items-center gap-3 rounded-xl border p-4 ${
            allHealthy
              ? 'border-success/30 bg-success-container'
              : overall === 'down'
                ? 'border-error/30 bg-error-container'
                : 'border-warning/30 bg-warning-container'
          }`}
        >
          <span className={`h-3 w-3 rounded-full ${DOT_STYLES[overall]}`} />
          <p className="text-sm font-medium text-on-surface">
            {allHealthy
              ? 'All systems operational'
              : overall === 'down'
                ? `${summary.down} service${summary.down === 1 ? '' : 's'} down`
                : `${summary.degraded} service${summary.degraded === 1 ? '' : 's'} degraded`}
          </p>
        </div>
      ) : null}

      {summary ? (
        <section className="grid gap-3 sm:grid-cols-4">
          <SummaryCard label="Services" value={summary.total} tone="neutral" />
          <SummaryCard label="Operational" value={summary.healthy} tone="green" />
          <SummaryCard label="Degraded" value={summary.degraded} tone="amber" />
          <SummaryCard label="Down" value={summary.down} tone="red" />
        </section>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-error/30 bg-error-container p-4 text-sm text-error">
          {error}
        </div>
      ) : null}

      {loading && !data ? (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-container-high" />
          ))}
        </section>
      ) : (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {services.map((s) => (
            <div
              key={s.service}
              className="rounded-xl border border-outline-variant bg-surface p-3 text-sm"
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-semibold capitalize text-on-surface">
                  <span className={`h-2.5 w-2.5 rounded-full ${DOT_STYLES[s.status]}`} />
                  {s.service}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${BADGE_STYLES[s.status]}`}
                >
                  {STATUS_LABEL[s.status]}
                </span>
              </div>
              <p className="mt-2 text-on-surface-variant">
                {s.latencyMs != null ? `${s.latencyMs} ms` : '—'}
                {s.httpStatus != null ? ` · HTTP ${s.httpStatus}` : ''}
              </p>
              {s.detail && s.status !== 'healthy' ? (
                <p className="mt-1 text-xs text-on-surface-variant">{s.detail}</p>
              ) : null}
            </div>
          ))}
          {services.length === 0 && !error ? (
            <p className="col-span-full text-sm text-on-surface-variant">No services reported.</p>
          ) : null}
        </section>
      )}

      {data ? (
        <p className="text-xs text-on-surface-variant">
          Polled server-side from each service&apos;s{' '}
          <code className="text-on-surface-variant">/health</code> endpoint at{' '}
          {new Date(data.checkedAt).toLocaleTimeString()}. Auto-refreshes every 30s.
        </p>
      ) : null}
    </main>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'neutral' | 'green' | 'amber' | 'red';
}): JSX.Element {
  const toneStyles: Record<typeof tone, string> = {
    neutral: 'text-on-surface',
    green: 'text-success',
    amber: 'text-warning',
    red: 'text-error',
  };
  return (
    <div className="rounded-xl border border-outline-variant bg-surface p-4">
      <p className="text-xs uppercase tracking-wider text-on-surface-variant">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${toneStyles[tone]}`}>{value}</p>
    </div>
  );
}
