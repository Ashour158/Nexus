import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

/**
 * Real system-health aggregator (Admin control plane).
 *
 * Polls each microservice's root `GET /health` endpoint server-side (the browser
 * cannot reach the service ports directly) and returns a normalized status per
 * service: `{ service, url, status, latencyMs, httpStatus, detail }`.
 *
 * A single down/unreachable service yields `status: 'down'` for that row — it
 * never rejects the whole response, so the page renders a partial picture rather
 * than crashing. No random data.
 */

type ServiceStatus = 'healthy' | 'degraded' | 'down';

interface ServiceHealth {
  service: string;
  url: string;
  status: ServiceStatus;
  latencyMs: number | null;
  httpStatus: number | null;
  detail: string | null;
}

/**
 * Service base URLs. Server-side env vars (`*_SERVICE_URL`) win; otherwise fall
 * back to the localhost port each service listens on in local development.
 * Only the health path (`/health`) is appended at poll time.
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

const POLL_TIMEOUT_MS = 3000;

/** Maps a service's `/health` body status to our normalized enum. */
function normalizeStatus(bodyStatus: unknown, httpOk: boolean): ServiceStatus {
  const s = String(bodyStatus ?? '').toLowerCase();
  if (s === 'healthy') return 'healthy';
  if (s === 'degraded') return 'degraded';
  if (s === 'unhealthy') return 'down';
  // No usable body status — infer from the HTTP status code.
  return httpOk ? 'healthy' : 'down';
}

async function pollService({ name, base }: { name: string; base: string }): Promise<ServiceHealth> {
  const url = `${base.replace(/\/$/, '')}/health`;
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), POLL_TIMEOUT_MS);
  try {
    const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
    const latencyMs = Date.now() - started;
    let body: Record<string, unknown> = {};
    try {
      body = (await res.json()) as Record<string, unknown>;
    } catch {
      /* non-JSON health body — status inferred from HTTP code below */
    }
    return {
      service: name,
      url,
      status: normalizeStatus(body.status, res.ok),
      latencyMs,
      httpStatus: res.status,
      detail: typeof body.status === 'string' ? body.status : null,
    };
  } catch (err) {
    return {
      service: name,
      url,
      status: 'down',
      latencyMs: null,
      httpStatus: null,
      detail: err instanceof Error && err.name === 'AbortError' ? 'timeout' : 'unreachable',
    };
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

  const services = await Promise.all(SERVICES.map(pollService));
  const summary = {
    total: services.length,
    healthy: services.filter((s) => s.status === 'healthy').length,
    degraded: services.filter((s) => s.status === 'degraded').length,
    down: services.filter((s) => s.status === 'down').length,
  };

  return NextResponse.json(
    { checkedAt: new Date().toISOString(), summary, services },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
