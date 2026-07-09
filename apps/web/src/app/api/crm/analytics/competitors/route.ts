import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED, apiSuccess } from '@/lib/server/dev-preview-data';

const CRM_SERVICE = process.env.CRM_SERVICE_URL || 'http://localhost:3001';

export async function GET(req: NextRequest) {
  if (DEV_PREVIEW_ENABLED) {
    return NextResponse.json(
      apiSuccess([
        { name: 'Salesforce', won: 11, lost: 8, total: 19, winRate: 58 },
        { name: 'HubSpot', won: 14, lost: 6, total: 20, winRate: 70 },
        { name: 'Zoho CRM', won: 9, lost: 5, total: 14, winRate: 64 },
        { name: 'Microsoft Dynamics', won: 7, lost: 9, total: 16, winRate: 44 },
      ])
    );
  }

  const tenantId = req.headers.get('x-tenant-id') || 'default';
  const { searchParams } = new URL(req.url);
  const qs = searchParams.toString();
  try {
    const res = await fetch(`${CRM_SERVICE}/api/v1/analytics/competitors${qs ? `?${qs}` : ''}`, {
      headers: { 'x-tenant-id': tenantId, authorization: req.headers.get('authorization') ?? '' },
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: unknown) {
    // Upstream unreachable: surface a real error instead of an empty-but-successful list,
    // so the UI can distinguish "no data" from "service down".
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message:
            err instanceof Error ? err.message : 'Failed to connect to CRM analytics service',
        },
      },
      { status: 503 }
    );
  }
}
