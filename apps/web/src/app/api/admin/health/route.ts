import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

/**
 * System readiness aggregator (Admin control plane).
 *
 * SECURITY: this endpoint MUST NOT return internal infrastructure detail —
 * no hostnames, DNS names, ports, URLs, stack traces, or raw upstream error
 * messages. Every field on the wire is either a logical service name, a
 * normalized status enum, a latency number, or a coarse error CLASS drawn from
 * the closed `ErrorClass` union below. Internal URLs are resolved server-side
 * only and never cross the response boundary.
 *
 * READINESS, NOT LIVENESS: a service answering `/health` at all is not
 * "healthy". A row is only `healthy` when the probe returns 2xx, the body does
 * not self-report a problem, every dependency the body reports is ok, and the
 * response came back under the degraded latency threshold.
 */

type ServiceStatus = 'healthy' | 'degraded' | 'down';

/** Closed set of coarse, non-identifying failure classes. */
type ErrorClass =
  | 'timeout'
  | 'connection_refused'
  | 'dns_failure'
  | 'connection_reset'
  | 'tls_error'
  | 'network_error'
  | 'invalid_response'
  | 'dependency_unhealthy'
  | 'self_reported_unhealthy'
  | 'slow_response'
  | `http_${number}`;

/** Shape returned to the client. Deliberately free of any infrastructure detail. */
interface ServiceHealth {
  /** Logical service name only — never a host, URL, or port. */
  name: string;
  status: ServiceStatus;
  /** Round-trip time of the probe, or null if it never completed. */
  latencyMs: number | null;
  /** Coarse failure class, or null when healthy. */
  error: ErrorClass | null;
}

/**
 * Service base URLs. Server-side env vars (`*_SERVICE_URL`) win; otherwise fall
 * back to the localhost port each service listens on in local development.
 * These values are used only to issue the server-side probe — they are never
 * placed on a `ServiceHealth` object and never serialized to the client.
 */
const SERVICES: Array<{ name: string; base: string }> = [
  { name: 'auth', base: process.env.AUTH_SERVICE_URL || 'http://localhost:3000' },
  { name: 'crm', base: process.env.CRM_SERVICE_URL || 'http://localhost:3001' },
  { name: 'finance', base: process.env.FINANCE_SERVICE_URL || 'http://localhost:3002' },
  { name: 'notification', base: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3003' },
  { name: 'realtime', base: process.env.REALTIME_SERVICE_URL || 'http://localhost:3005' },
  { name: 'search', base: process.env.SEARCH_SERVICE_URL || 'http://localhost:3006' },
  { name: 'workflow', base: process.env.WORKFLOW_SERVICE_URL || 'http://localhost:3007' },
  { name: 'analytics', base: process.env.ANALYTICS_SERVICE_URL || 'http://localhost:3008' },
  { name: 'comm', base: process.env.COMM_SERVICE_URL || 'http://localhost:3009' },
  { name: 'storage', base: process.env.STORAGE_SERVICE_URL || 'http://localhost:3010' },
  { name: 'integration', base: process.env.INTEGRATION_SERVICE_URL || 'http://localhost:3012' },
  { name: 'blueprint', base: process.env.BLUEPRINT_SERVICE_URL || 'http://localhost:3013' },
  { name: 'approval', base: process.env.APPROVAL_SERVICE_URL || 'http://localhost:3014' },
  { name: 'data', base: process.env.DATA_SERVICE_URL || 'http://localhost:3015' },
  { name: 'document', base: process.env.DOCUMENT_SERVICE_URL || 'http://localhost:3016' },
  { name: 'cadence', base: process.env.CADENCE_SERVICE_URL || 'http://localhost:3018' },
  { name: 'territory', base: process.env.TERRITORY_SERVICE_URL || 'http://localhost:3019' },
  { name: 'planning', base: process.env.PLANNING_SERVICE_URL || 'http://localhost:3020' },
  { name: 'reporting', base: process.env.REPORTING_SERVICE_URL || 'http://localhost:3021' },
  { name: 'portal', base: process.env.PORTAL_SERVICE_URL || 'http://localhost:3022' },
  { name: 'knowledge', base: process.env.KNOWLEDGE_SERVICE_URL || 'http://localhost:3023' },
  { name: 'incentive', base: process.env.INCENTIVE_SERVICE_URL || 'http://localhost:3024' },
];

/** Hard ceiling on a single probe so one hung dependency cannot hang the page. */
const PROBE_TIMEOUT_MS = 3000;
/** Above this round-trip time a successful probe is reported as `degraded`. */
const DEGRADED_LATENCY_MS = 1000;

/**
 * Maps a low-level fetch failure to a coarse class. Reads only the structured
 * `code`/`name` fields — never `message`, which can embed the target URL.
 */
function classifyNetworkError(err: unknown): ErrorClass {
  if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
    return 'timeout';
  }
  const cause = (err as { cause?: unknown })?.cause;
  const code = String(
    (cause as { code?: unknown })?.code ?? (err as { code?: unknown })?.code ?? ''
  ).toUpperCase();

  switch (code) {
    case 'ECONNREFUSED':
      return 'connection_refused';
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return 'dns_failure';
    case 'ECONNRESET':
    case 'EPIPE':
      return 'connection_reset';
    case 'ETIMEDOUT':
    case 'UND_ERR_HEADERS_TIMEOUT':
    case 'UND_ERR_BODY_TIMEOUT':
    case 'UND_ERR_CONNECT_TIMEOUT':
      return 'timeout';
    default:
      break;
  }
  if (code.startsWith('ERR_TLS') || code.startsWith('ERR_SSL') || code.startsWith('DEPTH_')) {
    return 'tls_error';
  }
  return 'network_error';
}

/**
 * Reads a `/health` body for dependency-aware signal. Services report either a
 * top-level `status` or a `checks`/`dependencies`/`details` map of sub-checks.
 * A single unhealthy dependency means the service is not ready to serve.
 */
function readBodySignal(body: Record<string, unknown>): {
  selfStatus: ServiceStatus | null;
  dependencyStatus: ServiceStatus | null;
} {
  const normalize = (raw: unknown): ServiceStatus | null => {
    const s = String(raw ?? '').toLowerCase();
    if (['healthy', 'ok', 'up', 'pass', 'true'].includes(s)) return 'healthy';
    if (['degraded', 'warn', 'warning', 'partial'].includes(s)) return 'degraded';
    if (['unhealthy', 'down', 'fail', 'failed', 'error', 'false'].includes(s)) return 'down';
    return null;
  };

  const selfStatus = normalize(body.status);

  // Collect sub-check statuses from whichever container the service uses.
  const containers = [body.checks, body.dependencies, body.details].filter(
    (c): c is Record<string, unknown> => !!c && typeof c === 'object'
  );

  let dependencyStatus: ServiceStatus | null = null;
  for (const container of containers) {
    for (const entry of Object.values(container)) {
      const raw =
        entry && typeof entry === 'object'
          ? ((entry as Record<string, unknown>).status ?? (entry as Record<string, unknown>).ok)
          : entry;
      const s = normalize(raw);
      if (s === 'down') return { selfStatus, dependencyStatus: 'down' };
      if (s === 'degraded') dependencyStatus = 'degraded';
    }
  }
  return { selfStatus, dependencyStatus };
}

async function probeService({ name, base }: { name: string; base: string }): Promise<ServiceHealth> {
  // Local only — intentionally not carried onto the returned object.
  const url = `${base.replace(/\/$/, '')}/health`;
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
    const latencyMs = Date.now() - started;

    // Any non-2xx is `down` — this is the core liveness→readiness fix. A service
    // that answers with 400/500/502 is reachable but not usable.
    if (!res.ok) {
      return { name, status: 'down', latencyMs, error: `http_${res.status}` as ErrorClass };
    }

    let body: Record<string, unknown> = {};
    let parsed = false;
    try {
      body = (await res.json()) as Record<string, unknown>;
      parsed = body !== null && typeof body === 'object';
    } catch {
      parsed = false;
    }

    if (parsed) {
      const { selfStatus, dependencyStatus } = readBodySignal(body);
      if (selfStatus === 'down') {
        return { name, status: 'down', latencyMs, error: 'self_reported_unhealthy' };
      }
      if (dependencyStatus === 'down') {
        return { name, status: 'down', latencyMs, error: 'dependency_unhealthy' };
      }
      if (selfStatus === 'degraded' || dependencyStatus === 'degraded') {
        return { name, status: 'degraded', latencyMs, error: 'dependency_unhealthy' };
      }
    }

    // Reachable, 2xx, no self-reported problem — but slow enough to matter.
    if (latencyMs > DEGRADED_LATENCY_MS) {
      return { name, status: 'degraded', latencyMs, error: 'slow_response' };
    }

    return { name, status: 'healthy', latencyMs, error: null };
  } catch (err) {
    return { name, status: 'down', latencyMs: null, error: classifyNetworkError(err) };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch (err) {
    const status = (err as { status?: number }).status ?? 403;
    return NextResponse.json({ error: status === 401 ? 'Unauthorized' : 'Forbidden' }, { status });
  }

  const services = await Promise.all(SERVICES.map(probeService));

  const summary = {
    total: services.length,
    healthy: services.filter((s) => s.status === 'healthy').length,
    degraded: services.filter((s) => s.status === 'degraded').length,
    down: services.filter((s) => s.status === 'down').length,
  };

  // Honest headline derived from the actual rows — never asserted as all-green.
  const status: ServiceStatus =
    summary.down > 0 ? 'down' : summary.degraded > 0 ? 'degraded' : 'healthy';

  return NextResponse.json(
    {
      checkedAt: new Date().toISOString(),
      status,
      summary,
      thresholds: { timeoutMs: PROBE_TIMEOUT_MS, degradedLatencyMs: DEGRADED_LATENCY_MS },
      services,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
