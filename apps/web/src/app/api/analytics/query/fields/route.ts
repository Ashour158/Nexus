import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED } from '@/lib/server/dev-preview-data';
import { getFieldCatalog, type Dataset } from '@/lib/server/analytics-mock';

const ANALYTICS_SERVICE =
  process.env.ANALYTICS_SERVICE_URL || 'http://localhost:3008';

const VALID: Dataset[] = ['deals', 'leads', 'activities', 'revenue', 'quotes'];

export async function GET(req: NextRequest) {
  const dataset = (req.nextUrl.searchParams.get('dataset') ?? 'deals') as Dataset;

  if (DEV_PREVIEW_ENABLED) {
    if (!VALID.includes(dataset)) {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: `Unknown dataset: ${dataset}` } },
        { status: 400 }
      );
    }
    const catalog = getFieldCatalog(dataset);
    return NextResponse.json({ success: true, data: catalog });
  }

  const qs = req.nextUrl.searchParams.toString();
  try {
    const res = await fetch(
      `${ANALYTICS_SERVICE}/api/v1/analytics/query/fields${qs ? `?${qs}` : ''}`,
      {
        headers: {
          'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
          authorization: req.headers.get('authorization') ?? '',
        },
        cache: 'no-store',
      }
    );
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
