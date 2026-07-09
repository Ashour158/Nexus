import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED } from '@/lib/server/dev-preview-data';
import { runMockQuery, type ReportSpec } from '@/lib/server/analytics-mock';
import {
  addWidget,
  createDashboard,
  createReport,
  deleteDashboard,
  deleteReport,
  deleteWidget,
  getDashboard,
  getReport,
  listDashboards,
  listReports,
  reorderWidgets,
  updateDashboard,
  updateReport,
  updateWidget,
} from '@/lib/server/bi-mock-store';

const REPORTING_SERVICE =
  process.env.REPORTING_SERVICE_URL || 'http://localhost:3021';

function ok(data: unknown, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}
function notFound(message = 'Not found') {
  return NextResponse.json(
    { success: false, error: { code: 'NOT_FOUND', message } },
    { status: 404 }
  );
}

async function body(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Dev-preview router over the in-memory BI store. Returns null if unmatched. */
async function handleMock(
  method: string,
  segments: string[],
  req: NextRequest
): Promise<NextResponse | null> {
  const [resource, ...rest] = segments;

  // ---- Dashboards ----
  if (resource === 'dashboards') {
    // /bi/dashboards
    if (rest.length === 0) {
      if (method === 'GET') return ok(listDashboards());
      if (method === 'POST') return ok(createDashboard(await body(req)), 201);
    }
    const dashboardId = rest[0];
    // /bi/dashboards/:id
    if (rest.length === 1 && dashboardId) {
      if (method === 'GET') {
        const dashboard = getDashboard(dashboardId);
        return dashboard ? ok(dashboard) : notFound('Dashboard not found');
      }
      if (method === 'PATCH') {
        const updated = updateDashboard(dashboardId, await body(req));
        return updated ? ok(updated) : notFound('Dashboard not found');
      }
      if (method === 'DELETE') {
        return deleteDashboard(dashboardId) ? ok({ deleted: true }) : notFound('Dashboard not found');
      }
    }
    // /bi/dashboards/:id/widgets...
    if (rest[1] === 'widgets') {
      // reorder: PUT /bi/dashboards/:id/widgets/reorder
      if (rest[2] === 'reorder' && method === 'PUT') {
        const payload = await body(req);
        const order = (payload.order ?? payload.widgetIds ?? payload.ids) as string[] | undefined;
        const result = reorderWidgets(dashboardId, order ?? []);
        return result ? ok(result) : notFound('Dashboard not found');
      }
      // POST /bi/dashboards/:id/widgets
      if (rest.length === 2 && method === 'POST') {
        const widget = addWidget(dashboardId, await body(req));
        return widget ? ok(widget, 201) : notFound('Dashboard not found');
      }
      // /bi/dashboards/:id/widgets/:widgetId
      const widgetId = rest[2];
      if (rest.length === 3 && widgetId) {
        if (method === 'PATCH') {
          const widget = updateWidget(dashboardId, widgetId, await body(req));
          return widget ? ok(widget) : notFound('Widget not found');
        }
        if (method === 'DELETE') {
          return deleteWidget(dashboardId, widgetId)
            ? ok({ deleted: true })
            : notFound('Widget not found');
        }
      }
    }
  }

  // ---- Reports ----
  if (resource === 'reports') {
    // /bi/reports/run  (ad-hoc)
    if (rest[0] === 'run' && method === 'POST') {
      const payload = await body(req);
      const spec = (payload.spec ?? payload) as ReportSpec;
      return ok(runMockQuery(spec));
    }
    if (rest.length === 0) {
      if (method === 'GET') return ok(listReports());
      if (method === 'POST') return ok(createReport(await body(req)), 201);
    }
    const reportId = rest[0];
    // /bi/reports/:id/run
    if (rest.length === 2 && rest[1] === 'run' && method === 'POST') {
      const report = getReport(reportId);
      if (!report) return notFound('Report not found');
      return ok(runMockQuery(report.spec));
    }
    if (rest.length === 1 && reportId) {
      if (method === 'GET') {
        const report = getReport(reportId);
        return report ? ok(report) : notFound('Report not found');
      }
      if (method === 'PATCH') {
        const report = updateReport(reportId, await body(req));
        return report ? ok(report) : notFound('Report not found');
      }
      if (method === 'DELETE') {
        return deleteReport(reportId) ? ok({ deleted: true }) : notFound('Report not found');
      }
    }
  }

  return null;
}

async function proxy(req: NextRequest, segments: string[]): Promise<NextResponse> {
  const path = segments.join('/');
  const qs = req.nextUrl.searchParams.toString();
  const url = `${REPORTING_SERVICE}/api/v1/bi/${path}${qs ? `?${qs}` : ''}`;
  const method = req.method;
  const init: RequestInit = {
    method,
    headers: {
      'content-type': 'application/json',
      'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
      authorization: req.headers.get('authorization') ?? '',
    },
    cache: 'no-store',
  };
  if (method !== 'GET' && method !== 'DELETE') {
    init.body = await req.text();
  }
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    try {
      return NextResponse.json(JSON.parse(text), { status: res.status });
    } catch {
      return new NextResponse(text, { status: res.status });
    }
  } catch (err: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message:
            err instanceof Error ? err.message : 'Failed to connect to reporting service',
        },
      },
      { status: 503 }
    );
  }
}

async function route(req: NextRequest, ctx: { params: { path?: string[] } }) {
  const segments = ctx.params.path ?? [];
  if (DEV_PREVIEW_ENABLED) {
    const mocked = await handleMock(req.method, segments, req);
    if (mocked) return mocked;
    return notFound(`Unhandled BI route: ${req.method} /${segments.join('/')}`);
  }
  return proxy(req, segments);
}

export const GET = route;
export const POST = route;
export const PATCH = route;
export const PUT = route;
export const DELETE = route;
