import { NextRequest, NextResponse } from 'next/server';

const REPORTING_SERVICE = process.env.REPORTING_SERVICE_URL || 'http://localhost:3021';

/**
 * Open a saved report: its definition PLUS the rows produced by running it.
 *
 * This previously proxied to `GET /api/v1/reports/:id`, which does not exist on
 * reporting-service — that service only serves `/reports/templates`,
 * `/reports/performance` and `/reports/manager`. So every drill-in from the
 * reporting list 404'd. The list itself worked (it correctly reads
 * `/saved-reports`), which is why the page looked functional right up until you
 * clicked something.
 *
 * A saved report is a DEFINITION (objectType, columns, filters) with no stored
 * rows, so opening one means executing it: `POST /saved-reports/:id/run`. The
 * definition is fetched alongside it so the caller still gets name/columns for
 * the header, and both are merged into one payload.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = req.headers.get('x-tenant-id') || 'default';
  const headers = {
    'x-tenant-id': tenantId,
    authorization: req.headers.get('authorization') ?? '',
  };

  // Forward paging through to the run call so large reports stay bounded.
  const search = req.nextUrl.searchParams.toString();

  const [defRes, runRes] = await Promise.all([
    fetch(`${REPORTING_SERVICE}/api/v1/saved-reports/${params.id}`, { headers }),
    fetch(
      `${REPORTING_SERVICE}/api/v1/saved-reports/${params.id}/run${search ? `?${search}` : ''}`,
      { method: 'POST', headers }
    ),
  ]);

  // Surface a genuine miss as its real status rather than an empty-looking success.
  if (!defRes.ok) {
    return NextResponse.json(await defRes.json().catch(() => ({})), { status: defRes.status });
  }
  if (!runRes.ok) {
    return NextResponse.json(await runRes.json().catch(() => ({})), { status: runRes.status });
  }

  const definition = await defRes.json().catch(() => ({}));
  const executed = await runRes.json().catch(() => ({}));

  const rows = executed?.data?.rows ?? [];

  return NextResponse.json({
    success: true,
    data: {
      ...(definition?.data ?? {}),
      // The reporting page renders `activeReport.data` as its table rows, so the
      // executed rows are exposed under BOTH names: `data` for that existing
      // contract and `rows`/`total` for callers that want the paging figures.
      // Returning only `rows` would have left the table on its "no data" branch
      // — the same empty-looking success this fix exists to remove.
      data: rows,
      rows,
      total: executed?.data?.total ?? 0,
    },
  });
}
