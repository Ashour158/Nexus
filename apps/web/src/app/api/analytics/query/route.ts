import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED } from '@/lib/server/dev-preview-data';
import { runMockQuery, type ReportSpec } from '@/lib/server/analytics-mock';

const ANALYTICS_SERVICE =
  process.env.ANALYTICS_SERVICE_URL || 'http://localhost:3008';

export async function POST(req: NextRequest) {
  let spec: ReportSpec;
  try {
    spec = (await req.json()) as ReportSpec;
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Invalid JSON body' } },
      { status: 400 }
    );
  }

  if (DEV_PREVIEW_ENABLED) {
    try {
      const data = runMockQuery(spec);
      return NextResponse.json({ success: true, data });
    } catch (err: unknown) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'QUERY_ERROR',
            message: err instanceof Error ? err.message : 'Failed to run query',
          },
        },
        { status: 400 }
      );
    }
  }

  try {
    const res = await fetch(`${ANALYTICS_SERVICE}/api/v1/analytics/query`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
        authorization: req.headers.get('authorization') ?? '',
      },
      body: JSON.stringify(spec),
      cache: 'no-store',
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message:
            err instanceof Error ? err.message : 'Failed to connect to analytics service',
        },
      },
      { status: 503 }
    );
  }
}
