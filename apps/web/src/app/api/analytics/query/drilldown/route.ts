import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED } from '@/lib/server/dev-preview-data';

const ANALYTICS_SERVICE =
  process.env.ANALYTICS_SERVICE_URL || 'http://localhost:3008';

export async function POST(req: NextRequest) {
  let spec: unknown;
  try {
    spec = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Invalid JSON body' } },
      { status: 400 }
    );
  }

  if (DEV_PREVIEW_ENABLED) {
    // The mock engine has no row-level store to drill into.
    return NextResponse.json({
      success: true,
      data: { columns: [], rows: [] },
    });
  }

  try {
    const res = await fetch(`${ANALYTICS_SERVICE}/api/v1/analytics/query/drilldown`, {
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
