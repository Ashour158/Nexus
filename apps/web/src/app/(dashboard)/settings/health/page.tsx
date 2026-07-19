'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/stores/auth.store';

type Status = 'healthy' | 'degraded' | 'down';

/**
 * Mirrors the API contract in `app/api/admin/health/route.ts`. The payload
 * deliberately carries no hostnames, ports, or URLs — only a logical name, a
 * status, a latency, and a coarse error class.
 */
interface ServiceHealth {
  name: string;
  status: Status;
  latencyMs: number | null;
  error: string | null;
}

interface HealthResponse {
  checkedAt: string;
  status: Status;
  summary: { total: number; healthy: number; degraded: number; down: number };
  thresholds: { timeoutMs: number; degradedLatencyMs: number };
  services: ServiceHealth[];
}

const REFRESH_MS = 30_000;

const STATUS_CHIP: Record<Status, string> = {
  healthy: 'bg-success-container text-on-success-container',
  degraded: 'bg-warning-container text-on-warning-container',
  down: 'bg-error-container text-on-error-container',
};

const STATUS_DOT: Record<Status, string> = {
  healthy: 'bg-success',
  degraded: 'bg-warning',
  down: 'bg-error',
};

const STATUS_LABEL: Record<Status, string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  down: 'Down',
};

const HEADLINE: Record<Status, string> = {
  healthy: 'All services ready',
  degraded: 'Some services degraded',
  down: 'Service disruption detected',
};

/** Turns a coarse error class into readable copy. No infra detail is present. */
const ERROR_LABEL: Record<string, string> = {
  timeout: 'Timed out',
  connection_refused: 'Connection refused',
  dns_failure: 'Name resolution failed',
  connection_reset: 'Connection reset',
  tls_error: 'TLS error',
  network_error: 'Network error',
  invalid_response: 'Invalid response',
  dependency_unhealthy: 'Dependency unhealthy',
  self_reported_unhealthy: 'Reported unhealthy',
  slow_response: 'Slow response',
};

function describeError(code: string | null): string | null {
  if (!code) return null;
  if (ERROR_LABEL[code]) return ERROR_LABEL[code];
  const http = /^http_(\d{3})$/.exec(code);
  if (http) return `Returned HTTP ${http[1]}`;
  return 'Unavailable';
}

export default function SystemHealthPage() {
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
            ? 'Admin access required to view system health.'
            : `Health check failed (${res.status})`
        );
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
        <div>
          <h2 className="text-2xl font-bold text-on-surface">System Status</h2>
          {data ? (
            <p className="mt-1 flex items-center gap-2 text-sm text-on-surface-variant">
              <span className={`h-2 w-2 rounded-full ${STATUS_DOT[data.status]}`} aria-hidden />
              {HEADLINE[data.status]}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-3 text-xs text-on-surface-variant">
          {refreshedAt ? <span>Last refreshed {refreshedAt}</span> : null}
          <button
            onClick={() => void load()}
            className="rounded-full border border-outline-variant px-3 py-1.5 text-xs text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
          >
            Refresh
          </button>
        </div>
      </div>

      {summary ? (
        <section className="grid gap-3 sm:grid-cols-4">
          <SummaryCard label="Services" value={summary.total} tone="neutral" />
          <SummaryCard label="Healthy" value={summary.healthy} tone="success" />
          <SummaryCard label="Degraded" value={summary.degraded} tone="warning" />
          <SummaryCard label="Down" value={summary.down} tone="error" />
        </section>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-outline-variant bg-error-container p-4 text-sm text-on-error-container">
          {error}
        </div>
      ) : null}

      {loading && !data ? (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-container-high" />
          ))}
        </section>
      ) : (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {services.map((s) => {
            const detail = describeError(s.error);
            return (
              <div
                key={s.name}
                className="rounded-xl border border-outline-variant bg-surface-container-low p-3 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold capitalize text-on-surface">{s.name}</span>
                  <span className={`pill shrink-0 text-xs ${STATUS_CHIP[s.status]}`}>
                    {STATUS_LABEL[s.status]}
                  </span>
                </div>
                <p className="mt-2 text-xs text-on-surface-variant">
                  {s.latencyMs != null ? `${s.latencyMs} ms` : 'No response'}
                </p>
                {detail && s.status !== 'healthy' ? (
                  <p className="mt-1 text-xs text-on-surface-variant">{detail}</p>
                ) : null}
              </div>
            );
          })}
          {services.length === 0 && !error ? (
            <p className="col-span-full text-sm text-on-surface-variant">No services reported.</p>
          ) : null}
        </section>
      )}

      {data ? (
        <p className="text-xs text-on-surface-variant">
          Readiness probed server-side at {new Date(data.checkedAt).toLocaleTimeString()}. A service
          is marked degraded above {data.thresholds.degradedLatencyMs} ms and down on any non-2xx
          response, unhealthy dependency, or no answer within {data.thresholds.timeoutMs} ms.
        </p>
      ) : null}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'neutral' | 'success' | 'warning' | 'error';
}) {
  const toneStyles: Record<typeof tone, string> = {
    neutral: 'text-on-surface',
    success: 'text-success',
    warning: 'text-warning',
    error: 'text-error',
  };
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
      <p className="text-xs uppercase tracking-wider text-on-surface-variant">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${toneStyles[tone]}`}>{value}</p>
    </div>
  );
}
